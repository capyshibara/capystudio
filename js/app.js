import { project, fileStore, lyricClips, serializeProject, restoreProject } from './model.js';
import { srtStringify, srtParse, lrcStringify, lrcParse, formatTime } from './formats.js';
import { drawFrame } from './renderer.js';
import { Waveform } from './waveform.js';
import { exportVideo, cancelExport } from './exporter.js';

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

function setAudio(file) {
  fileStore.set('music', file);
  upsertAsset('music', 'audio', file.name);
  project.tracks.music.clips = [{ assetId: 'music' }];
  els.player.src = URL.createObjectURL(file);
  els.audioName.textContent = `🎵 ${file.name}`;
  els.audioDrop.classList.add('loaded');
  waveform.load(file).catch((e) => console.warn('waveform decode failed', e));
}

function setBackground(file) {
  const isImage = file.type.startsWith('image/');
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
    if (f.type.startsWith('audio/')) setAudio(f);
    else if (f.type.startsWith('image/') || f.type.startsWith('video/')) setBackground(f);
  }
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
  els.player.play();
  renderLineList();
}

function stopTapping() {
  tapping = false;
  els.tapBtn.textContent = '⏱ Tap timing';
  els.tapBtn.classList.remove('active');
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
}

function endCurrent() {
  const clips = lyricClips();
  const i = tapIndex - 1;
  if (i >= 0 && clips[i].start != null) {
    clips[i].end = els.player.currentTime;
    renderLineList();
  }
}

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

$('load-project-btn').addEventListener('click', () => $('load-project').click());
$('load-project').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const names = restoreProject(await file.text());
    syncStyleUI();
    els.lyricsText.value = lyricClips().map((c) => c.text).join('\n');
    renderLineList();
    if (names.length) {
      alert('Project loaded. Re-attach the media files:\n' + names.join('\n'));
    }
  } catch (err) {
    alert('Could not load project: ' + err.message);
  }
  e.target.value = '';
});

// ---------- video export ----------

$('export-video').addEventListener('click', async () => {
  if (!els.player.src) return alert('Load an audio file first.');
  if (!lyricClips().some((c) => c.start != null)) {
    if (!confirm('No timed lyrics yet — export video without subtitles?')) return;
  }
  exporting = true;
  els.exportOverlay.hidden = false;
  els.exportProgress.value = 0;
  els.exportPct.textContent = '0%';
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
  }
});

$('export-cancel').addEventListener('click', cancelExport);

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
