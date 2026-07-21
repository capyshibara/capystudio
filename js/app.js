import { project, fileStore, lyricClips, serializeProject, restoreProject } from './model.js';
import { srtStringify, srtParse, lrcStringify, lrcParse, formatTime, relTime } from './formats.js';
import { drawFrame } from './renderer.js';
import { Waveform } from './waveform.js';
import { exportVideo, cancelExport } from './exporter.js';
import {
  cloudEnabled, initCloud, signIn, signOutUser,
  saveProjectToCloud, listCloudProjects, loadProjectFromCloud, deleteCloudProject,
} from './cloud.js';

const $ = (id) => document.getElementById(id);
const els = {
  player: $('player'),
  preview: $('preview'),
  audioInput: $('audio-input'),
  audioName: $('audio-name'),
  audioDrop: $('audio-drop'),
  bgInput: $('bg-input'),
  bgName: $('bg-name'),
  bgDrop: $('bg-drop'),
  resolution: $('resolution'),
  lyricsText: $('lyrics-text'),
  lineList: $('line-list'),
  tapBtn: $('tap-btn'),
  exportOverlay: $('export-overlay'),
  exportProgress: $('export-progress'),
  exportPct: $('export-pct'),
};

const ctx = els.preview.getContext('2d');
let bgEl = null; // HTMLImageElement or HTMLVideoElement
let tapping = false;
let tapIndex = 0;
let exporting = false;

const waveform = new Waveform($('wave'), $('wave-overlay'), {
  getDuration: () => els.player.duration || 0,
  onSeek: (t) => {
    els.player.currentTime = t;
  },
});

// ---------- media loading ----------

const CLOUD_FILE_MSG =
  'Couldn’t read this file. If it lives in an iCloud Drive / OneDrive folder, ' +
  'it may be a cloud placeholder that isn’t downloaded to this computer yet — ' +
  'in Finder, right-click it and choose “Download Now” (or copy it to a local ' +
  'folder like Desktop), then try again.';

// Cloud placeholders (evicted iCloud/OneDrive files) hand the browser a File
// handle whose bytes aren't on disk: reads fail or come back empty. Fail
// loudly up front instead of leaving a dead player.
async function assertReadable(file) {
  if (!file.size) throw new Error('file is empty');
  await file.slice(0, 1).arrayBuffer();
}

async function setAudio(file) {
  try {
    await assertReadable(file);
  } catch {
    alert(CLOUD_FILE_MSG);
    return;
  }
  fileStore.set('music', file);
  upsertAsset('music', 'audio', file.name);
  project.tracks.music.clips = [{ assetId: 'music' }];
  els.player.src = URL.createObjectURL(file);
  els.audioName.textContent = `🎵 ${file.name}`;
  els.audioDrop.classList.add('loaded');
  waveform.load(file).catch((e) => {
    console.warn('waveform decode failed', e);
    alert(`Couldn't decode "${file.name}" as audio — the file may be damaged or in an unsupported format.`);
  });
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

async function setBackground(file) {
  try {
    await assertReadable(file);
  } catch {
    alert(CLOUD_FILE_MSG);
    return;
  }
  // Cloud-synced files sometimes arrive with an empty MIME type; fall back
  // to the extension.
  const isImage = file.type ? file.type.startsWith('image/') : IMAGE_EXT.test(file.name);
  fileStore.set('bg', file);
  upsertAsset('bg', isImage ? 'image' : 'video', file.name);
  project.tracks.background.clips = [{ assetId: 'bg', fit: 'cover', loop: true }];
  const url = URL.createObjectURL(file);
  if (isImage) {
    const img = new Image();
    img.src = url;
    bgEl = img;
  } else {
    const vid = document.createElement('video');
    vid.src = url;
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.play().catch(() => {}); // may need a user gesture; retried on play
    bgEl = vid;
  }
  els.bgName.textContent = `🖼 ${file.name}`;
  els.bgDrop.classList.add('loaded');
}

function upsertAsset(id, kind, name) {
  project.assets = project.assets.filter((a) => a.id !== id).concat({ id, kind, name });
}

els.audioInput.addEventListener('change', () => {
  if (els.audioInput.files[0]) setAudio(els.audioInput.files[0]);
});
els.bgInput.addEventListener('change', () => {
  if (els.bgInput.files[0]) setBackground(els.bgInput.files[0]);
});

// Drag & drop onto the two drop zones and the preview.
for (const [zone, handler] of [
  [els.audioDrop, setAudio],
  [els.bgDrop, setBackground],
]) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
  });
}
$('preview-wrap').addEventListener('dragover', (e) => e.preventDefault());
$('preview-wrap').addEventListener('drop', (e) => {
  e.preventDefault();
  for (const f of e.dataTransfer.files) {
    if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) setAudio(f);
    else if (
      f.type.startsWith('image/') || f.type.startsWith('video/') ||
      IMAGE_EXT.test(f.name) || VIDEO_EXT.test(f.name)
    ) {
      setBackground(f);
    }
  }
});

// Surface playback failures (e.g. unsupported codec) instead of a dead player.
els.player.addEventListener('error', () => {
  if (els.player.src) alert('This audio file couldn’t be played by the browser. ' + CLOUD_FILE_MSG);
});

// Keep looping background video in sync with play/pause.
els.player.addEventListener('play', () => {
  if (bgEl?.tagName === 'VIDEO') bgEl.play().catch(() => {});
});
els.player.addEventListener('pause', () => {
  if (bgEl?.tagName === 'VIDEO' && !exporting) bgEl.pause();
});

// ---------- resolution & style bindings ----------

els.resolution.addEventListener('change', () => {
  const [w, h] = els.resolution.value.split('x').map(Number);
  project.canvas.width = w;
  project.canvas.height = h;
});

const styleBindings = [
  ['st-font', 'fontFamily', (v) => v],
  ['st-size', 'fontSize', Number],
  ['st-color', 'color', (v) => v],
  ['st-outline-color', 'outlineColor', (v) => v],
  ['st-outline', 'outlineWidth', Number],
  ['st-position', 'position', (v) => v],
  ['st-dim', 'dim', Number],
];
for (const [id, key, coerce] of styleBindings) {
  $(id).addEventListener('input', (e) => {
    project.style[key] = coerce(e.target.value);
  });
}
$('st-bold').addEventListener('change', (e) => {
  project.style.bold = e.target.checked;
});

// Web fonts load lazily; kick the load when picked so the canvas preview
// switches over as soon as the font arrives (the rAF loop repaints).
$('st-font').addEventListener('change', () => {
  const f = project.style.fontFamily;
  document.fonts.load(`700 64px "${f}"`).catch(() => {});
  document.fonts.load(`400 64px "${f}"`).catch(() => {});
});

// ---------- intro & credits bindings ----------

$('intro-on').addEventListener('change', (e) => (project.intro.enabled = e.target.checked));
$('intro-title').addEventListener('input', (e) => (project.intro.title = e.target.value));
$('intro-artist').addEventListener('input', (e) => (project.intro.artist = e.target.value));
$('intro-dur').addEventListener('input', (e) => (project.intro.duration = Number(e.target.value)));
$('outro-on').addEventListener('change', (e) => (project.outro.enabled = e.target.checked));
$('outro-text').addEventListener('input', (e) => (project.outro.text = e.target.value));
$('outro-dur').addEventListener('input', (e) => (project.outro.duration = Number(e.target.value)));

function syncStyleUI() {
  const s = project.style;
  $('st-font').value = s.fontFamily;
  $('st-size').value = s.fontSize;
  $('st-bold').checked = s.bold;
  $('st-color').value = s.color;
  $('st-outline-color').value = s.outlineColor;
  $('st-outline').value = s.outlineWidth;
  $('st-position').value = s.position;
  $('st-dim').value = s.dim;
  els.resolution.value = `${project.canvas.width}x${project.canvas.height}`;
  $('intro-on').checked = project.intro.enabled;
  $('intro-title').value = project.intro.title;
  $('intro-artist').value = project.intro.artist;
  $('intro-dur').value = project.intro.duration;
  $('outro-on').checked = project.outro.enabled;
  $('outro-text').value = project.outro.text;
  $('outro-dur').value = project.outro.duration;
}

// ---------- lyrics & timing ----------

$('load-lines').addEventListener('click', () => {
  const rows = els.lyricsText.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rows.length) return alert('Paste some lyrics first — one line per subtitle.');
  if (lyricClips().some((c) => c.start != null)) {
    if (!confirm('Replace current lines? Existing timings will be lost.')) return;
  }
  project.tracks.lyrics.clips = rows.map((text) => ({ text, start: null, end: null }));
  stopTapping();
  renderLineList();
});

$('clear-times').addEventListener('click', () => {
  if (!confirm('Clear all timings?')) return;
  for (const c of lyricClips()) {
    c.start = null;
    c.end = null;
  }
  stopTapping();
  renderLineList();
});

els.tapBtn.addEventListener('click', () => (tapping ? stopTapping() : startTapping()));

function startTapping() {
  const clips = lyricClips();
  if (!clips.length) return alert('Load lyric lines first.');
  if (!els.player.src) return alert('Load an audio file first.');
  tapping = true;
  tapIndex = clips.findIndex((c) => c.start == null);
  if (tapIndex === -1) tapIndex = 0;
  els.tapBtn.textContent = '⏹ Stop tapping';
  els.tapBtn.classList.add('active');
  document.body.classList.add('timing-active');
  $('tab-timing')?.classList.add('active');
  $('timing-takeover').hidden = false;
  els.player.play();
  renderLineList();
  updateTimingTicker();
}

function stopTapping() {
  tapping = false;
  els.tapBtn.textContent = '⏱ Tap timing';
  els.tapBtn.classList.remove('active');
  document.body.classList.remove('timing-active');
  $('tab-timing')?.classList.remove('active');
  $('timing-takeover').hidden = true;
  renderLineList();
}

function stampNext() {
  const clips = lyricClips();
  if (tapIndex >= clips.length) return stopTapping();
  clips[tapIndex].start = els.player.currentTime;
  clips[tapIndex].end = null;
  tapIndex++;
  if (tapIndex >= clips.length) stopTapping();
  renderLineList();
  updateTimingTicker();
}

function endCurrent() {
  const clips = lyricClips();
  const i = tapIndex - 1;
  if (i >= 0 && clips[i].start != null) {
    clips[i].end = els.player.currentTime;
    renderLineList();
  }
}

function undoLastStamp() {
  if (tapIndex <= 0) return;
  const clips = lyricClips();
  tapIndex--;
  clips[tapIndex].start = null;
  clips[tapIndex].end = null;
  renderLineList();
  updateTimingTicker();
}

// Mobile Timing-mode takeover: big stamp/end/undo buttons + a live ticker
// of the just-stamped line and the next one up, so a phone user always
// knows what they're about to tap without seeing the line list.
function updateTimingTicker() {
  const current = $('timing-current');
  const next = $('timing-next-text');
  if (!current || !next) return;
  const clips = lyricClips();
  const stamped = clips[tapIndex - 1];
  current.textContent = stamped ? `"${stamped.text}"` : '—';
  next.textContent = tapIndex < clips.length ? `"${clips[tapIndex].text}"` : '(done)';
}

$('stamp-btn')?.addEventListener('click', () => { if (tapping) stampNext(); });
$('end-line-btn')?.addEventListener('click', () => { if (tapping) endCurrent(); });
$('undo-btn')?.addEventListener('click', undoLastStamp);
$('timing-exit')?.addEventListener('click', () => { if (tapping) stopTapping(); });

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || exporting) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (tapping) stampNext();
    else els.player.paused ? els.player.play() : els.player.pause();
  } else if (tapping && (e.key === 'x' || e.key === 'X')) {
    endCurrent();
  } else if (e.key === 'Escape' && tapping) {
    stopTapping();
  }
});

function renderLineList() {
  const clips = lyricClips();
  els.lineList.innerHTML = '';
  clips.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'line-row';
    if (tapping && i === tapIndex) li.classList.add('next-tap');

    const text = document.createElement('input');
    text.className = 'line-text';
    text.value = c.text;
    text.addEventListener('input', () => (c.text = text.value));

    const times = document.createElement('span');
    times.className = 'times';
    times.textContent = `${formatTime(c.start)} → ${formatTime(c.end)}`;

    const btns = document.createElement('span');
    btns.className = 'line-btns';
    for (const [label, title, fn] of [
      ['▶', 'Seek to this line', () => c.start != null && (els.player.currentTime = c.start)],
      ['⏱', 'Set start = current time', () => {
        c.start = els.player.currentTime;
        renderLineList();
      }],
      ['⏹', 'Set end = current time', () => {
        c.end = els.player.currentTime;
        renderLineList();
      }],
      ['✕', 'Clear times', () => {
        c.start = null;
        c.end = null;
        renderLineList();
      }],
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    }

    li.append(text, times, btns);
    els.lineList.appendChild(li);
  });
}

// ---------- import / export ----------

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function baseName() {
  const audio = project.assets.find((a) => a.id === 'music');
  return audio ? audio.name.replace(/\.[^.]+$/, '') : 'lyric-video';
}

$('export-srt').addEventListener('click', () => {
  const s = srtStringify(lyricClips(), els.player.duration);
  if (!s) return alert('No timed lines to export yet.');
  downloadBlob(new Blob([s], { type: 'text/plain' }), baseName() + '.srt');
});

$('export-lrc').addEventListener('click', () => {
  const s = lrcStringify(lyricClips());
  if (!s) return alert('No timed lines to export yet.');
  downloadBlob(new Blob([s], { type: 'text/plain' }), baseName() + '.lrc');
});

$('import-subs-btn').addEventListener('click', () => $('import-subs').click());
$('import-subs').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const clips = file.name.toLowerCase().endsWith('.lrc') ? lrcParse(text) : srtParse(text);
  if (!clips.length) return alert('No subtitle lines found in that file.');
  project.tracks.lyrics.clips = clips;
  els.lyricsText.value = clips.map((c) => c.text).join('\n');
  renderLineList();
  e.target.value = '';
});

$('save-project').addEventListener('click', () => {
  downloadBlob(new Blob([serializeProject()], { type: 'application/json' }), baseName() + '.lvm.json');
});

function applyProjectJSON(text) {
  const names = restoreProject(text);
  syncStyleUI();
  els.lyricsText.value = lyricClips().map((c) => c.text).join('\n');
  renderLineList();
  if (names.length) {
    alert('Project loaded. Re-attach the media files:\n' + names.join('\n'));
  }
}

$('load-project-btn').addEventListener('click', () => $('load-project').click());
$('load-project').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    applyProjectJSON(await file.text());
  } catch (err) {
    alert('Could not load project: ' + err.message);
  }
  e.target.value = '';
});

// ---------- video export ----------

// A sleeping phone screen kills the real-time MediaRecorder export, so hold
// a wake lock for the duration; harmless (and a no-op) where unsupported.
let wakeLock = null;
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

$('export-video').addEventListener('click', async () => {
  if (!els.player.src) return alert('Load an audio file first.');
  if (!lyricClips().some((c) => c.start != null)) {
    if (!confirm('No timed lyrics yet — export video without subtitles?')) return;
  }
  exporting = true;
  els.exportOverlay.hidden = false;
  els.exportProgress.value = 0;
  els.exportPct.textContent = '0%';
  await requestWakeLock();
  try {
    const { blob, ext } = await exportVideo({
      canvas: els.preview,
      audioEl: els.player,
      bgVideo: bgEl?.tagName === 'VIDEO' ? bgEl : null,
      fps: project.canvas.fps,
      onProgress: (p) => {
        els.exportProgress.value = p;
        els.exportPct.textContent = Math.round(p * 100) + '%';
      },
    });
    downloadBlob(blob, `${baseName()}.${ext}`);
    window.__lastExport = { size: blob.size, type: blob.type }; // test hook
  } catch (err) {
    if (!err.cancelled) alert('Export failed: ' + err.message);
  } finally {
    exporting = false;
    els.exportOverlay.hidden = true;
    releaseWakeLock();
  }
});

$('export-cancel').addEventListener('click', cancelExport);

// ---------- cloud (optional; active only when firebase-config.js is filled) ----------

if (cloudEnabled) {
  const cloud = {
    signIn: $('sign-in'),
    signOut: $('sign-out'),
    chip: $('user-chip'),
    avatar: $('user-avatar'),
    name: $('user-name'),
    save: $('cloud-save'),
    open: $('cloud-open'),
  };

  // Deep link from the home screen: editor.html?project=<name> auto-opens
  // that cloud project once the user is signed in (consumed once).
  let pendingCloudProject = new URLSearchParams(location.search).get('project');

  initCloud(async (user) => {
    cloud.signIn.hidden = !!user;
    cloud.chip.hidden = !user;
    cloud.save.hidden = !user;
    cloud.open.hidden = !user;
    if (user) {
      cloud.avatar.src = user.photoURL || '';
      cloud.name.textContent = user.displayName?.split(' ')[0] || user.email;
    }
    if (user && pendingCloudProject) {
      const name = pendingCloudProject;
      pendingCloudProject = null;
      history.replaceState(null, '', location.pathname);
      try {
        const json = await loadProjectFromCloud(name);
        if (json) applyProjectJSON(json);
        else alert(`No cloud project named "${name}".`);
      } catch (err) {
        alert('Could not open project: ' + err.message);
      }
    }
  }).catch((err) => console.warn('Cloud unavailable:', err));

  cloud.signIn.addEventListener('click', async () => {
    try {
      await signIn();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') alert('Sign-in failed: ' + err.message);
    }
  });

  cloud.signOut.addEventListener('click', () => signOutUser());

  cloud.save.addEventListener('click', async () => {
    const name = prompt('Save to cloud as:', baseName());
    if (!name || !name.trim()) return;
    try {
      await saveProjectToCloud(name.trim(), serializeProject());
      alert(`Saved "${name.trim()}" to your cloud library.`);
    } catch (err) {
      alert('Cloud save failed: ' + err.message);
    }
  });

  // ---- project library popover (☁ Open) ----

  const lib = {
    root: $('cloud-popover'),
    body: $('cloud-popover-body'),
    close: $('cloud-popover-close'),
  };

  function libState(icon, text, onRetry) {
    lib.body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'cloud-popover__state';
    const ic = document.createElement('span');
    ic.className = 'state-icon';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = icon;
    const p = document.createElement('p');
    p.textContent = text;
    box.append(ic, p);
    if (onRetry) {
      const retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.addEventListener('click', onRetry);
      box.appendChild(retry);
    }
    lib.body.appendChild(box);
  }

  function libShowLoading() {
    lib.body.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.className = 'skeleton-row';
      const a = document.createElement('div');
      a.className = 'skeleton-bar';
      const b = document.createElement('div');
      b.className = 'skeleton-bar short';
      row.append(a, b);
      lib.body.appendChild(row);
    }
  }

  function libEmpty() {
    libState('☁', 'No cloud projects yet — Save one first');
  }

  function libRow(item) {
    const row = document.createElement('div');
    row.className = 'cloud-project';

    const main = document.createElement('button');
    main.className = 'cloud-project__main';
    main.title = `Open "${item.name}"`;
    const name = document.createElement('span');
    name.className = 'cloud-project__name';
    name.textContent = item.name;
    const meta = document.createElement('span');
    meta.className = 'cloud-project__meta';
    meta.textContent = `Updated ${relTime(item.updatedAt)}`;
    main.append(name, meta);
    main.addEventListener('click', async () => {
      try {
        const json = await loadProjectFromCloud(item.name);
        if (!json) throw new Error('project not found');
        closeLibrary();
        applyProjectJSON(json);
      } catch (err) {
        alert('Could not open project: ' + err.message);
      }
    });

    const del = document.createElement('button');
    del.className = 'cloud-project__delete';
    del.title = 'Delete project';
    del.setAttribute('aria-label', `Delete "${item.name}"`);
    del.textContent = '🗑';
    del.addEventListener('click', () => {
      const confirmBox = document.createElement('span');
      confirmBox.className = 'cloud-project__confirm';
      const yes = document.createElement('button');
      yes.className = 'confirm-delete';
      yes.textContent = 'Delete';
      yes.addEventListener('click', async () => {
        try {
          await deleteCloudProject(item.name);
          row.remove();
          if (!lib.body.querySelector('.cloud-project')) libEmpty();
        } catch (err) {
          alert('Delete failed: ' + err.message);
        }
      });
      const no = document.createElement('button');
      no.textContent = 'Cancel';
      no.addEventListener('click', () => confirmBox.replaceWith(del));
      confirmBox.append(yes, no);
      del.replaceWith(confirmBox);
    });

    row.append(main, del);
    return row;
  }

  function libShowList(items) {
    lib.body.innerHTML = '';
    for (const item of items) lib.body.appendChild(libRow(item));
  }

  async function openLibrary() {
    lib.root.hidden = false;
    libShowLoading();
    try {
      const items = await listCloudProjects();
      if (lib.root.hidden) return; // closed while loading
      items.length ? libShowList(items) : libEmpty();
    } catch (err) {
      console.warn('cloud list failed', err);
      libState('⚠', "Couldn't load your projects. Check your connection and try again.",
        openLibrary);
    }
  }

  function closeLibrary() {
    lib.root.hidden = true;
  }

  cloud.open.addEventListener('click', () => {
    lib.root.hidden ? openLibrary() : closeLibrary();
  });
  lib.close.addEventListener('click', closeLibrary);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lib.root.hidden) closeLibrary();
  });
  document.addEventListener('click', (e) => {
    if (lib.root.hidden) return;
    if (!lib.root.contains(e.target) && !e.target.closest('#cloud-open')) closeLibrary();
  });

  // Exposed for automated UI testing of the popover states.
  window.__libDemo = {
    open: () => (lib.root.hidden = false),
    close: closeLibrary,
    loading: libShowLoading,
    empty: libEmpty,
    error: () => libState('⚠', "Couldn't load your projects. Check your connection and try again.", openLibrary),
    list: libShowList,
  };
}

// ---------- mobile shell: header overflow menu + bottom tool bar ----------

$('header-menu-btn')?.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  $('header-menu-btn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('menu-open')) return;
  if (!e.target.closest('.header-actions') && !e.target.closest('#header-menu-btn')) {
    document.body.classList.remove('menu-open');
    $('header-menu-btn').setAttribute('aria-expanded', 'false');
  }
});

const sheetButtons = document.querySelectorAll('#mobile-tabbar button[data-sheet]');
sheetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    document.body.dataset.mobileSheet = btn.dataset.sheet;
    sheetButtons.forEach((b) => b.classList.toggle('active', b === btn));
  });
});

$('tab-timing')?.addEventListener('click', () => (tapping ? stopTapping() : startTapping()));
$('tab-export')?.addEventListener('click', () => $('export-video').click());

// ---------- render loop ----------

function loop() {
  const t = els.player.currentTime || 0;
  drawFrame(ctx, { project, bgEl, duration: els.player.duration || 0 }, t);
  waveform.drawOverlay(t, lyricClips());
  requestAnimationFrame(loop);
}

syncStyleUI();
renderLineList();
loop();

// Exposed for automated testing; not part of the public surface.
window.__app = { project, setAudio, setBackground, lyricClips, renderLineList };
