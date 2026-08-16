import {
  project,
  fileStore,
  uid,
  videoClips,
  audioClips,
  textClips,
  clipDuration,
  videoTimeline,
  projectDuration,
  activeVideoAt,
  addAsset,
  removeUnusedAssets,
  serializeProject,
  restoreProject,
} from './model.js';
import { drawFrame } from './renderer.js';
import { exportVideo, cancelExport } from './exporter.js';

const $ = (id) => document.getElementById(id);
const els = {
  preview: $('preview'),
  previewWrap: $('preview-wrap'),
  emptyAdd: $('empty-add'),
  stageAdd: $('stage-add'),
  videoInput: $('video-input'),
  audioInput: $('audio-input'),
  play: $('play-toggle'),
  currentTime: $('current-time'),
  durationTime: $('duration-time'),
  scrubber: $('scrubber'),
  timelineScroll: $('timeline-scroll'),
  timelineContent: $('timeline-content'),
  timelineRuler: $('timeline-ruler'),
  videoTrack: $('video-track'),
  audioTrack: $('audio-track'),
  textTrack: $('text-track'),
  playhead: $('timeline-playhead'),
  zoom: $('timeline-zoom'),
  inspector: $('inspector'),
  inspectorTitle: $('inspector-title'),
  inspectorContent: $('inspector-content'),
  projectTitle: $('project-title'),
  formatLabel: $('format-label'),
  timelineSummary: $('timeline-summary'),
  undo: $('undo'),
  redo: $('redo'),
  exportOverlay: $('export-overlay'),
  exportProgress: $('export-progress'),
  exportPct: $('export-pct'),
  exportRemaining: $('export-remaining'),
  toastRegion: $('toast-region'),
};

const ctx = els.preview.getContext('2d', { alpha: false });
const runtimeStore = new Map(); // asset id -> { el, url, kind, thumbnail }
let currentTime = 0;
let playing = false;
let exporting = false;
let clockStartedAt = 0;
let timelineStartedAt = 0;
let activeVideoClipId = null;
let selected = null; // { type: 'video'|'audio'|'text', id }
let activeTool = 'media';
let timelineZoom = Number(els.zoom.value);
let dragClipId = null;
let wakeLock = null;
const undoStack = [];
const redoStack = [];

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;

// ---------- small utilities ----------

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(seconds, precise = true) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenth = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${precise ? `.${tenth}` : ''}`;
}

function secondsLabel(seconds) {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return formatTime(seconds, false);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function toast(message, tone = 'normal') {
  const item = document.createElement('div');
  item.className = `toast ${tone}`;
  item.textContent = message;
  els.toastRegion.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 180);
  }, 2800);
}

function downloadBlob(blob, filename) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 30_000);
}

function safeFilename() {
  return (project.title || 'capystudio-video')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'capystudio-video';
}

function waitFor(element, eventName) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The browser could not read this media file.')); };
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(eventName, done);
      element.removeEventListener('error', fail);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while reading this media file.'));
    }, 12_000);
    element.addEventListener(eventName, done, { once: true });
    element.addEventListener('error', fail, { once: true });
  });
}

async function assertReadable(file) {
  if (!file?.size) throw new Error(`${file?.name || 'This file'} is empty or not downloaded to this device.`);
  await file.slice(0, 1).arrayBuffer();
}

// ---------- history ----------

function snapshot() {
  return serializeProject();
}

function remember(before) {
  if (before === snapshot()) return;
  undoStack.push(before);
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function restoreSnapshot(json) {
  const files = new Map(fileStore);
  restoreProject(json);
  for (const [id, file] of files) fileStore.set(id, file);
  currentTime = clamp(currentTime, 0, projectDuration());
  selected = null;
  renderAll();
  syncMedia(true);
}

function updateHistoryButtons() {
  els.undo.disabled = !undoStack.length;
  els.redo.disabled = !redoStack.length;
}

els.undo.addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restoreSnapshot(undoStack.pop());
  updateHistoryButtons();
});

els.redo.addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restoreSnapshot(redoStack.pop());
  updateHistoryButtons();
});

// ---------- media import ----------

async function createRuntime(asset, file) {
  if (runtimeStore.has(asset.id)) return runtimeStore.get(asset.id);
  await assertReadable(file);
  const url = URL.createObjectURL(file);
  let runtime;

  if (asset.kind === 'image') {
    const image = new Image();
    image.src = url;
    if (!image.complete) await waitFor(image, 'load');
    runtime = { el: image, url, kind: 'image', thumbnail: url, duration: 3 };
  } else {
    const media = document.createElement(asset.kind === 'audio' ? 'audio' : 'video');
    media.src = url;
    media.preload = 'auto';
    media.playsInline = true;
    if (media.readyState < 1) await waitFor(media, 'loadedmetadata');
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    runtime = { el: media, url, kind: asset.kind, duration, thumbnail: null };
    if (asset.kind === 'video') runtime.thumbnail = await createThumbnail(media);
  }

  runtimeStore.set(asset.id, runtime);
  return runtime;
}

async function createThumbnail(video) {
  try {
    const target = Math.min(0.15, Math.max(0, video.duration / 3));
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
      await waitFor(video, 'seeked');
    }
    const thumb = document.createElement('canvas');
    thumb.width = 180;
    thumb.height = 100;
    const tctx = thumb.getContext('2d');
    const scale = Math.max(thumb.width / video.videoWidth, thumb.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    tctx.drawImage(video, (thumb.width - width) / 2, (thumb.height - height) / 2, width, height);
    video.currentTime = 0;
    return thumb.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function visualKind(file) {
  if (file.type?.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  return 'video';
}

async function importVisualFiles(files) {
  if (!files.length) return;
  pause();
  const before = snapshot();
  let added = 0;
  let attached = 0;
  for (const file of files) {
    try {
      const kind = visualKind(file);
      const { asset, reattached } = addAsset(kind, file);
      const runtime = await createRuntime(asset, file);
      if (reattached) {
        attached++;
        continue;
      }
      const duration = kind === 'image' ? 3 : runtime.duration;
      if (!duration) throw new Error(`${file.name} has no readable duration.`);
      videoClips().push({
        id: uid('video'),
        assetId: asset.id,
        name: file.name,
        kind,
        sourceDuration: duration,
        duration,
        trimStart: 0,
        trimEnd: duration,
        volume: 1,
      });
      added++;
    } catch (error) {
      console.warn('visual import failed', error);
      toast(`${file.name}: ${error.message}`, 'error');
    }
  }
  removeUnusedAssets();
  remember(before);
  currentTime = clamp(currentTime, 0, projectDuration());
  renderAll();
  syncMedia(true);
  if (added) toast(`Added ${added} ${added === 1 ? 'clip' : 'clips'} to the timeline`, 'success');
  else if (attached) toast(`Reattached ${attached} project ${attached === 1 ? 'file' : 'files'}`, 'success');
}

async function importAudioFiles(files) {
  if (!files.length) return;
  pause();
  const before = snapshot();
  let cursor = Math.min(currentTime, projectDuration());
  let added = 0;
  for (const file of files) {
    try {
      const { asset, reattached } = addAsset('audio', file);
      const runtime = await createRuntime(asset, file);
      if (reattached) continue;
      if (!runtime.duration) throw new Error(`${file.name} has no readable duration.`);
      audioClips().push({
        id: uid('audio'),
        assetId: asset.id,
        name: file.name,
        start: cursor,
        sourceDuration: runtime.duration,
        trimStart: 0,
        trimEnd: runtime.duration,
        volume: 0.75,
        fadeIn: 0.4,
        fadeOut: 0.7,
      });
      cursor += runtime.duration;
      added++;
    } catch (error) {
      console.warn('audio import failed', error);
      toast(`${file.name}: ${error.message}`, 'error');
    }
  }
  removeUnusedAssets();
  remember(before);
  renderAll();
  syncMedia(true);
  if (added) toast(`Added ${added} audio ${added === 1 ? 'track' : 'tracks'}`, 'success');
}

els.videoInput.addEventListener('change', async () => {
  await importVisualFiles([...els.videoInput.files]);
  els.videoInput.value = '';
});
els.audioInput.addEventListener('change', async () => {
  await importAudioFiles([...els.audioInput.files]);
  els.audioInput.value = '';
});
for (const trigger of [els.emptyAdd, els.stageAdd]) {
  trigger.addEventListener('click', () => els.videoInput.click());
}

els.previewWrap.addEventListener('dragover', (event) => {
  event.preventDefault();
  els.previewWrap.classList.add('dragover');
});
els.previewWrap.addEventListener('dragleave', () => els.previewWrap.classList.remove('dragover'));
els.previewWrap.addEventListener('drop', async (event) => {
  event.preventDefault();
  els.previewWrap.classList.remove('dragover');
  const files = [...event.dataTransfer.files];
  await importVisualFiles(files.filter((file) => !file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)));
  await importAudioFiles(files.filter((file) => file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)));
});

// ---------- playback engine ----------

function sourceTimeFor(info, time) {
  return info.clip.kind === 'image' ? 0 : info.clip.trimStart + (time - info.start);
}

function fadeVolume(clip, time) {
  const local = time - clip.start;
  const duration = clipDuration(clip);
  let gain = 1;
  if (clip.fadeIn > 0) gain = Math.min(gain, local / clip.fadeIn);
  if (clip.fadeOut > 0) gain = Math.min(gain, (duration - local) / clip.fadeOut);
  return clamp(clip.volume * Math.max(0, gain), 0, 1);
}

async function syncMedia(forceSeek = false) {
  const promises = [];
  const active = activeVideoAt(currentTime);
  const changed = active?.clip.id !== activeVideoClipId;
  if (changed) {
    for (const runtime of runtimeStore.values()) {
      if (runtime.kind === 'video') runtime.el.pause();
    }
    activeVideoClipId = active?.clip.id || null;
  }

  if (active) {
    const runtime = runtimeStore.get(active.clip.assetId);
    if (runtime?.kind === 'video') {
      const desired = sourceTimeFor(active, currentTime);
      runtime.el.volume = clamp(active.clip.volume, 0, 1);
      if (changed || forceSeek || Math.abs(runtime.el.currentTime - desired) > 0.28) {
        try { runtime.el.currentTime = desired; } catch { /* metadata may still be settling */ }
      }
      if (playing && runtime.el.paused) promises.push(runtime.el.play().catch(() => {}));
      if (!playing && !runtime.el.paused) runtime.el.pause();
    }
  }

  const activeAudioAssets = new Set();
  for (const clip of audioClips()) {
    const duration = clipDuration(clip);
    if (currentTime < clip.start || currentTime >= clip.start + duration) continue;
    const runtime = runtimeStore.get(clip.assetId);
    if (!runtime) continue;
    activeAudioAssets.add(clip.assetId);
    const desired = clip.trimStart + (currentTime - clip.start);
    runtime.el.volume = fadeVolume(clip, currentTime);
    if (forceSeek || runtime.el.dataset.activeClip !== clip.id || Math.abs(runtime.el.currentTime - desired) > 0.28) {
      try { runtime.el.currentTime = desired; } catch { /* non-fatal */ }
    }
    runtime.el.dataset.activeClip = clip.id;
    if (playing && runtime.el.paused) promises.push(runtime.el.play().catch(() => {}));
    if (!playing && !runtime.el.paused) runtime.el.pause();
  }
  for (const [assetId, runtime] of runtimeStore) {
    if (runtime.kind === 'audio' && !activeAudioAssets.has(assetId)) {
      runtime.el.pause();
      delete runtime.el.dataset.activeClip;
    }
  }
  await Promise.all(promises);
}

async function play(from = currentTime) {
  const duration = projectDuration();
  if (!duration) return toast('Add a video or photo first');
  currentTime = from >= duration ? 0 : clamp(from, 0, duration);
  timelineStartedAt = currentTime;
  clockStartedAt = performance.now();
  playing = true;
  els.play.classList.add('playing');
  els.play.querySelector('span').textContent = '❚❚';
  els.play.setAttribute('aria-label', 'Pause');
  await syncMedia(true);
}

function pause() {
  if (playing) currentTime = Math.min(projectDuration(), timelineStartedAt + (performance.now() - clockStartedAt) / 1000);
  playing = false;
  els.play.classList.remove('playing');
  els.play.querySelector('span').textContent = '▶';
  els.play.setAttribute('aria-label', 'Play');
  syncMedia(false);
}

function seek(time) {
  currentTime = clamp(time, 0, projectDuration());
  if (playing) {
    timelineStartedAt = currentTime;
    clockStartedAt = performance.now();
  }
  syncMedia(true);
  updateTransport();
}

els.play.addEventListener('click', () => playing ? pause() : play());
els.scrubber.addEventListener('input', () => seek(Number(els.scrubber.value)));

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, select') || exporting) return;
  if (event.code === 'Space') {
    event.preventDefault();
    playing ? pause() : play();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    seek(currentTime + (event.key === 'ArrowLeft' ? -0.25 : 0.25));
  }
});

function activeVisualElement() {
  const info = activeVideoAt(currentTime);
  return info ? runtimeStore.get(info.clip.assetId)?.el || null : null;
}

function updateTransport() {
  const duration = projectDuration();
  els.scrubber.max = duration || 0;
  els.scrubber.value = Math.min(currentTime, duration || 0);
  els.currentTime.textContent = formatTime(currentTime);
  els.durationTime.textContent = formatTime(duration);
  els.playhead.style.left = `${64 + currentTime * timelineZoom}px`;
}

function renderLoop(now) {
  if (playing) {
    currentTime = timelineStartedAt + (now - clockStartedAt) / 1000;
    if (currentTime >= projectDuration()) {
      currentTime = projectDuration();
      pause();
    } else {
      syncMedia(false);
    }
  }
  drawFrame(ctx, { project, visualEl: activeVisualElement() }, currentTime);
  updateTransport();
  requestAnimationFrame(renderLoop);
}

// ---------- timeline ----------

function selectItem(type, id) {
  selected = { type, id };
  activeTool = 'edit';
  els.inspector.classList.add('open');
  renderTimeline();
  renderInspector();
}

function timelineBlock({ type, clip, start, duration, label, sublabel, thumbnail }) {
  const block = document.createElement('button');
  block.className = `timeline-clip ${type}-clip${selected?.type === type && selected.id === clip.id ? ' selected' : ''}`;
  block.style.left = `${start * timelineZoom}px`;
  block.style.width = `${Math.max(type === 'video' ? 52 : 34, duration * timelineZoom)}px`;
  block.dataset.id = clip.id;
  block.title = `${label} · ${secondsLabel(duration)}`;
  if (thumbnail) block.style.setProperty('--thumb', `url("${thumbnail}")`);
  block.innerHTML = `<span class="clip-grip" aria-hidden="true"></span><span class="clip-copy"><strong>${escapeHTML(label)}</strong><small>${escapeHTML(sublabel)}</small></span>`;
  block.addEventListener('click', (event) => {
    event.stopPropagation();
    selectItem(type, clip.id);
    seek(start);
  });
  if (type === 'video') {
    block.draggable = true;
    block.addEventListener('dragstart', () => { dragClipId = clip.id; block.classList.add('dragging'); });
    block.addEventListener('dragend', () => { dragClipId = null; block.classList.remove('dragging'); });
    block.addEventListener('dragover', (event) => event.preventDefault());
    block.addEventListener('drop', (event) => {
      event.preventDefault();
      reorderVideo(dragClipId, clip.id);
    });
  }
  return block;
}

function reorderVideo(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const clips = videoClips();
  const sourceIndex = clips.findIndex((clip) => clip.id === sourceId);
  const targetIndex = clips.findIndex((clip) => clip.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const before = snapshot();
  const [moved] = clips.splice(sourceIndex, 1);
  clips.splice(targetIndex, 0, moved);
  remember(before);
  renderAll();
  syncMedia(true);
}

function renderRuler(duration, width) {
  els.timelineRuler.innerHTML = '';
  els.timelineRuler.style.width = `${width}px`;
  const step = timelineZoom >= 55 ? 1 : timelineZoom >= 30 ? 2 : 5;
  for (let second = 0; second <= Math.ceil(duration); second += step) {
    const tick = document.createElement('span');
    tick.className = 'ruler-tick';
    tick.style.left = `${second * timelineZoom}px`;
    tick.textContent = formatTime(second, false);
    els.timelineRuler.appendChild(tick);
  }
}

function renderTimeline() {
  const timeline = videoTimeline();
  const duration = projectDuration();
  const minWidth = Math.max(560, els.timelineScroll.clientWidth - 72);
  const trackWidth = Math.max(minWidth, Math.ceil(duration * timelineZoom) + 80);
  els.timelineContent.style.width = `${trackWidth + 64}px`;
  for (const lane of [els.videoTrack, els.audioTrack, els.textTrack]) {
    lane.innerHTML = '';
    lane.style.width = `${trackWidth}px`;
  }
  renderRuler(duration, trackWidth);

  for (const item of timeline) {
    const runtime = runtimeStore.get(item.clip.assetId);
    els.videoTrack.appendChild(timelineBlock({
      type: 'video',
      clip: item.clip,
      start: item.start,
      duration: item.duration,
      label: item.clip.name,
      sublabel: `${timeline.indexOf(item) + 1} · ${secondsLabel(item.duration)}`,
      thumbnail: runtime?.thumbnail,
    }));
  }
  for (const clip of textClips()) {
    els.textTrack.appendChild(timelineBlock({
      type: 'text', clip, start: clip.start, duration: clip.end - clip.start,
      label: clip.text || 'Text', sublabel: `${secondsLabel(clip.end - clip.start)}`,
    }));
  }
  for (const clip of audioClips()) {
    els.audioTrack.appendChild(timelineBlock({
      type: 'audio', clip, start: clip.start, duration: clipDuration(clip),
      label: clip.name, sublabel: `${Math.round(clip.volume * 100)}% · ${secondsLabel(clipDuration(clip))}`,
    }));
  }

  els.timelineSummary.textContent = videoClips().length
    ? `${videoClips().length} ${videoClips().length === 1 ? 'clip' : 'clips'} · ${formatTime(duration, false)}`
    : 'Add clips to start your story';
  els.emptyAdd.hidden = !!videoClips().length;
  updateTransport();
}

for (const lane of [els.videoTrack, els.audioTrack, els.textTrack]) {
  lane.addEventListener('click', (event) => {
    if (event.target !== lane) return;
    const rect = lane.getBoundingClientRect();
    seek((event.clientX - rect.left) / timelineZoom);
  });
}

els.zoom.addEventListener('input', () => {
  timelineZoom = Number(els.zoom.value);
  renderTimeline();
});

// ---------- inspector ----------

function toolTitle() {
  return { media: 'Media', edit: 'Clip editor', audio: 'Audio', text: 'Text', canvas: 'Canvas' }[activeTool];
}

function setTool(tool) {
  activeTool = tool;
  els.inspector.classList.add('open');
  renderInspector();
}

document.querySelectorAll('.tool-button').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});
$('close-inspector').addEventListener('click', () => els.inspector.classList.remove('open'));

function inspectorEmpty(message) {
  return `<div class="inspector-empty"><span aria-hidden="true">◇</span><p>${escapeHTML(message)}</p></div>`;
}

function renderInspector() {
  els.inspectorTitle.textContent = toolTitle();
  document.querySelectorAll('.tool-button').forEach((button) =>
    button.classList.toggle('active', button.dataset.tool === activeTool));

  if (activeTool === 'media') renderMediaInspector();
  else if (activeTool === 'audio') renderAudioInspector();
  else if (activeTool === 'text') renderTextInspector();
  else if (activeTool === 'canvas') renderCanvasInspector();
  else renderEditInspector();
}

function renderMediaInspector() {
  els.inspectorContent.innerHTML = `
    <button class="import-card primary-card" id="add-visuals">
      <span class="import-icon" aria-hidden="true">＋</span>
      <span><strong>Add videos or photos</strong><small>Choose several clips from your phone</small></span>
    </button>
    <p class="section-label">Story order</p>
    <div class="asset-list" id="visual-list"></div>
    <p class="privacy-note"><span aria-hidden="true">●</span> Files are edited locally and never uploaded.</p>`;
  $('add-visuals').addEventListener('click', () => els.videoInput.click());
  const list = $('visual-list');
  if (!videoClips().length) {
    list.innerHTML = inspectorEmpty('Your clips will appear here in playback order.');
    return;
  }
  videoTimeline().forEach((item, index) => {
    const button = document.createElement('button');
    button.className = 'asset-row';
    button.innerHTML = `<span class="asset-index">${index + 1}</span><span class="asset-copy"><strong>${escapeHTML(item.clip.name)}</strong><small>${item.clip.kind === 'image' ? 'Photo' : 'Video'} · ${secondsLabel(item.duration)}</small></span><span aria-hidden="true">›</span>`;
    button.addEventListener('click', () => { selectItem('video', item.clip.id); seek(item.start); });
    list.appendChild(button);
  });
}

function renderAudioInspector() {
  els.inspectorContent.innerHTML = `
    <button class="import-card audio-card" id="add-audio">
      <span class="import-icon" aria-hidden="true">♫</span>
      <span><strong>Add music</strong><small>Choose one or more songs from this device</small></span>
    </button>
    <p class="section-label">Audio track</p>
    <div class="asset-list" id="audio-list"></div>`;
  $('add-audio').addEventListener('click', () => els.audioInput.click());
  const list = $('audio-list');
  if (!audioClips().length) {
    list.innerHTML = inspectorEmpty('Music is placed at the playhead, then arranged one after another.');
    return;
  }
  audioClips().forEach((clip) => {
    const button = document.createElement('button');
    button.className = 'asset-row';
    button.innerHTML = `<span class="asset-icon audio">♫</span><span class="asset-copy"><strong>${escapeHTML(clip.name)}</strong><small>${formatTime(clip.start)} · ${Math.round(clip.volume * 100)}%</small></span><span aria-hidden="true">›</span>`;
    button.addEventListener('click', () => { selectItem('audio', clip.id); seek(clip.start); });
    list.appendChild(button);
  });
}

function addTextClip() {
  if (!projectDuration()) return toast('Add a video or photo before adding text');
  const before = snapshot();
  const start = Math.min(currentTime, Math.max(0, projectDuration() - 0.4));
  const clip = {
    id: uid('text'),
    text: 'Your text',
    start,
    end: Math.min(projectDuration(), start + 3),
    style: {
      fontFamily: 'Inter', fontSize: Math.round(project.canvas.height * 0.055), bold: true,
      color: '#ffffff', background: '#00000099', position: 'bottom', animation: 'fade',
    },
  };
  textClips().push(clip);
  remember(before);
  selectItem('text', clip.id);
  renderAll();
}

function renderTextInspector() {
  els.inspectorContent.innerHTML = `
    <button class="import-card text-card" id="add-text">
      <span class="import-icon" aria-hidden="true">T</span>
      <span><strong>Add text</strong><small>Creates a timed title at the playhead</small></span>
    </button>
    <p class="section-label">Text layers</p>
    <div class="asset-list" id="text-list"></div>`;
  $('add-text').addEventListener('click', addTextClip);
  const list = $('text-list');
  if (!textClips().length) {
    list.innerHTML = inspectorEmpty('Titles and captions will appear on their own timeline track.');
    return;
  }
  textClips().forEach((clip) => {
    const button = document.createElement('button');
    button.className = 'asset-row';
    button.innerHTML = `<span class="asset-icon text">T</span><span class="asset-copy"><strong>${escapeHTML(clip.text)}</strong><small>${formatTime(clip.start)} → ${formatTime(clip.end)}</small></span><span aria-hidden="true">›</span>`;
    button.addEventListener('click', () => { selectItem('text', clip.id); seek(clip.start); });
    list.appendChild(button);
  });
}

function selectedClip() {
  if (!selected) return null;
  const collection = selected.type === 'video' ? videoClips() : selected.type === 'audio' ? audioClips() : textClips();
  return collection.find((clip) => clip.id === selected.id) || null;
}

function rangeField(label, id, value, min, max, step = 0.1, suffix = 's') {
  return `<label class="field range-field"><span>${label}<output id="${id}-out">${Number(value).toFixed(step < 1 ? 1 : 0)}${suffix}</output></span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

function bindRange(id, onInput, onCommit) {
  const input = $(id);
  let before = null;
  input.addEventListener('pointerdown', () => { before = snapshot(); });
  input.addEventListener('focus', () => { if (!before) before = snapshot(); });
  input.addEventListener('input', () => {
    $(`${id}-out`).textContent = onInput(Number(input.value));
    renderTimeline();
  });
  input.addEventListener('change', () => {
    if (before) remember(before);
    before = null;
    onCommit?.();
  });
}

function renderEditInspector() {
  const clip = selectedClip();
  if (!clip) {
    els.inspectorContent.innerHTML = inspectorEmpty('Select a video, audio, or text block on the timeline to edit it.');
    return;
  }
  if (selected.type === 'video') renderVideoEditor(clip);
  else if (selected.type === 'audio') renderAudioEditor(clip);
  else renderTextEditor(clip);
}

function renderVideoEditor(clip) {
  const index = videoClips().indexOf(clip);
  const timeline = videoTimeline()[index];
  if (clip.kind === 'image') {
    els.inspectorContent.innerHTML = `
      <div class="selection-heading"><span class="asset-index">${index + 1}</span><div><strong>${escapeHTML(clip.name)}</strong><small>Photo clip</small></div></div>
      ${rangeField('Duration', 'image-duration', clip.duration, 0.5, 20, 0.1)}
      ${editActionButtons(index, true)}`;
    bindRange('image-duration', (value) => { clip.duration = value; return `${value.toFixed(1)}s`; }, () => syncMedia(true));
  } else {
    els.inspectorContent.innerHTML = `
      <div class="selection-heading"><span class="asset-index">${index + 1}</span><div><strong>${escapeHTML(clip.name)}</strong><small>Video · ${secondsLabel(clipDuration(clip))}</small></div></div>
      <div class="trim-fields">
        <label class="field"><span>Starts at</span><input id="trim-start" type="number" min="0" max="${Math.max(0, clip.trimEnd - 0.1)}" step="0.1" value="${clip.trimStart.toFixed(1)}"></label>
        <label class="field"><span>Ends at</span><input id="trim-end" type="number" min="${clip.trimStart + 0.1}" max="${clip.sourceDuration}" step="0.1" value="${clip.trimEnd.toFixed(1)}"></label>
      </div>
      ${rangeField('Original sound', 'clip-volume', clip.volume * 100, 0, 100, 1, '%')}
      <button id="split-clip" class="wide-action"><span aria-hidden="true">✂</span> Split at playhead</button>
      ${editActionButtons(index, true)}`;
    for (const id of ['trim-start', 'trim-end']) {
      $(id).addEventListener('change', () => {
        const before = snapshot();
        clip.trimStart = clamp($('trim-start').value, 0, clip.trimEnd - 0.1);
        clip.trimEnd = clamp($('trim-end').value, clip.trimStart + 0.1, clip.sourceDuration);
        remember(before);
        currentTime = clamp(currentTime, 0, projectDuration());
        renderAll();
        syncMedia(true);
      });
    }
    bindRange('clip-volume', (value) => { clip.volume = value / 100; return `${value}%`; }, () => syncMedia());
    $('split-clip').addEventListener('click', () => splitVideoClip(clip, timeline));
  }
  bindMoveDelete(clip, index, 'video');
}

function editActionButtons(index, movable) {
  return `<div class="edit-actions">
    ${movable ? `<button id="move-left" title="Move earlier" ${index === 0 ? 'disabled' : ''}>← <span>Earlier</span></button><button id="move-right" title="Move later" ${index === videoClips().length - 1 ? 'disabled' : ''}><span>Later</span> →</button>` : ''}
    <button id="delete-clip" class="danger"><span aria-hidden="true">⌫</span> Delete</button>
  </div>`;
}

function bindMoveDelete(clip, index, type) {
  $('move-left')?.addEventListener('click', () => moveVideo(index, -1));
  $('move-right')?.addEventListener('click', () => moveVideo(index, 1));
  $('delete-clip').addEventListener('click', () => deleteClip(type, clip.id));
}

function moveVideo(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= videoClips().length) return;
  const before = snapshot();
  const [clip] = videoClips().splice(index, 1);
  videoClips().splice(next, 0, clip);
  remember(before);
  renderAll();
  syncMedia(true);
}

function splitVideoClip(clip, timelineItem) {
  const local = currentTime - timelineItem.start;
  if (local <= 0.1 || local >= timelineItem.duration - 0.1) {
    return toast('Move the playhead inside this clip before splitting');
  }
  const before = snapshot();
  const index = videoClips().indexOf(clip);
  const cut = clip.trimStart + local;
  const second = { ...clip, id: uid('video'), trimStart: cut, name: clip.name };
  clip.trimEnd = cut;
  videoClips().splice(index + 1, 0, second);
  remember(before);
  selected = { type: 'video', id: second.id };
  renderAll();
  syncMedia(true);
  toast('Clip split at the playhead', 'success');
}

function renderAudioEditor(clip) {
  els.inspectorContent.innerHTML = `
    <div class="selection-heading"><span class="asset-icon audio">♫</span><div><strong>${escapeHTML(clip.name)}</strong><small>Music · ${secondsLabel(clipDuration(clip))}</small></div></div>
    <label class="field"><span>Timeline start</span><input id="audio-start" type="number" min="0" max="${projectDuration()}" step="0.1" value="${clip.start.toFixed(1)}"></label>
    <div class="trim-fields">
      <label class="field"><span>Trim start</span><input id="audio-trim-start" type="number" min="0" max="${Math.max(0, clip.trimEnd - 0.1)}" step="0.1" value="${clip.trimStart.toFixed(1)}"></label>
      <label class="field"><span>Trim end</span><input id="audio-trim-end" type="number" min="${clip.trimStart + 0.1}" max="${clip.sourceDuration}" step="0.1" value="${clip.trimEnd.toFixed(1)}"></label>
    </div>
    ${rangeField('Volume', 'music-volume', clip.volume * 100, 0, 100, 1, '%')}
    ${rangeField('Fade in', 'fade-in', clip.fadeIn, 0, Math.min(5, clipDuration(clip) / 2), 0.1)}
    ${rangeField('Fade out', 'fade-out', clip.fadeOut, 0, Math.min(5, clipDuration(clip) / 2), 0.1)}
    <div class="edit-actions"><button id="delete-clip" class="danger"><span aria-hidden="true">⌫</span> Delete audio</button></div>`;
  for (const [id, key, min, max] of [
    ['audio-start', 'start', 0, projectDuration()],
    ['audio-trim-start', 'trimStart', 0, clip.trimEnd - 0.1],
    ['audio-trim-end', 'trimEnd', clip.trimStart + 0.1, clip.sourceDuration],
  ]) {
    $(id).addEventListener('change', () => {
      const before = snapshot();
      clip[key] = clamp($(id).value, min, max);
      remember(before);
      renderAll();
      syncMedia(true);
    });
  }
  bindRange('music-volume', (value) => { clip.volume = value / 100; return `${value}%`; }, () => syncMedia());
  bindRange('fade-in', (value) => { clip.fadeIn = value; return `${value.toFixed(1)}s`; });
  bindRange('fade-out', (value) => { clip.fadeOut = value; return `${value.toFixed(1)}s`; });
  $('delete-clip').addEventListener('click', () => deleteClip('audio', clip.id));
}

function renderTextEditor(clip) {
  const style = clip.style;
  let textBefore = null;
  els.inspectorContent.innerHTML = `
    <label class="field"><span>Text</span><textarea id="text-value" rows="3">${escapeHTML(clip.text)}</textarea></label>
    <div class="trim-fields">
      <label class="field"><span>Starts at</span><input id="text-start" type="number" min="0" max="${Math.max(0, clip.end - 0.1)}" step="0.1" value="${clip.start.toFixed(1)}"></label>
      <label class="field"><span>Ends at</span><input id="text-end" type="number" min="${clip.start + 0.1}" max="${projectDuration()}" step="0.1" value="${clip.end.toFixed(1)}"></label>
    </div>
    <label class="field"><span>Font</span><select id="text-font"><option>Inter</option><option>Space Grotesk</option><option>Arial</option><option>Georgia</option><option>Impact</option></select></label>
    ${rangeField('Size', 'text-size', style.fontSize, 24, Math.max(120, project.canvas.height * 0.14), 1, '')}
    <div class="color-fields">
      <label class="field"><span>Color</span><input id="text-color" type="color" value="${style.color}"></label>
      <label class="field"><span>Backdrop</span><select id="text-background"><option value="#00000099">Soft black</option><option value="#ffffffdd">Soft white</option><option value="transparent">None</option></select></label>
    </div>
    <label class="field"><span>Position</span><div class="segmented" id="text-position"><button data-value="top">Top</button><button data-value="center">Center</button><button data-value="bottom">Bottom</button></div></label>
    <label class="field"><span>Animation</span><select id="text-animation"><option value="none">None</option><option value="fade">Fade</option><option value="pop">Pop</option></select></label>
    <div class="edit-actions"><button id="delete-clip" class="danger"><span aria-hidden="true">⌫</span> Delete text</button></div>`;
  $('text-font').value = style.fontFamily || 'Inter';
  $('text-background').value = style.background || 'transparent';
  $('text-animation').value = style.animation || 'none';
  document.querySelectorAll('#text-position button').forEach((button) =>
    button.classList.toggle('active', button.dataset.value === style.position));

  for (const [id, apply] of [
    ['text-start', (value) => { clip.start = clamp(value, 0, clip.end - 0.1); }],
    ['text-end', (value) => { clip.end = clamp(value, clip.start + 0.1, projectDuration()); }],
    ['text-font', (value) => { style.fontFamily = value; }],
    ['text-color', (value) => { style.color = value; }],
    ['text-background', (value) => { style.background = value; }],
    ['text-animation', (value) => { style.animation = value; }],
  ]) {
    $(id).addEventListener('change', () => {
      const before = snapshot();
      apply($(id).value);
      remember(before);
      renderAll();
    });
  }
  $('text-value').addEventListener('focus', () => { textBefore = snapshot(); });
  $('text-value').addEventListener('input', () => { clip.text = $('text-value').value; renderTimeline(); });
  $('text-value').addEventListener('change', () => {
    if (textBefore) remember(textBefore);
    textBefore = null;
    renderAll();
  });
  bindRange('text-size', (value) => { style.fontSize = value; return String(value); });
  document.querySelectorAll('#text-position button').forEach((button) => {
    button.addEventListener('click', () => {
      const before = snapshot();
      style.position = button.dataset.value;
      remember(before);
      renderAll();
    });
  });
  $('delete-clip').addEventListener('click', () => deleteClip('text', clip.id));
}

function deleteClip(type, id) {
  const before = snapshot();
  const collection = type === 'video' ? videoClips() : type === 'audio' ? audioClips() : textClips();
  const index = collection.findIndex((clip) => clip.id === id);
  if (index < 0) return;
  collection.splice(index, 1);
  removeUnusedAssets();
  selected = null;
  remember(before);
  currentTime = clamp(currentTime, 0, projectDuration());
  renderAll();
  syncMedia(true);
}

function renderCanvasInspector() {
  const currentSize = `${project.canvas.width}x${project.canvas.height}`;
  els.inspectorContent.innerHTML = `
    <p class="section-label">Aspect ratio</p>
    <div class="aspect-grid">
      <button data-size="1080x1920"><span class="ratio-icon portrait"></span><strong>9:16</strong><small>TikTok · Reels</small></button>
      <button data-size="1920x1080"><span class="ratio-icon landscape"></span><strong>16:9</strong><small>YouTube</small></button>
      <button data-size="1080x1080"><span class="ratio-icon square"></span><strong>1:1</strong><small>Square</small></button>
      <button data-size="1080x1350"><span class="ratio-icon four-five"></span><strong>4:5</strong><small>Feed</small></button>
    </div>
    <label class="field"><span>Media fit</span><select id="canvas-fit"><option value="cover">Fill frame</option><option value="contain">Fit inside</option></select></label>
    <label class="field"><span>Frame rate</span><select id="canvas-fps"><option value="24">24 fps</option><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
    <label class="field"><span>Background</span><input id="canvas-background" type="color" value="${project.canvas.background}"></label>
    <p class="info-card"><strong>Export quality</strong><span>${project.canvas.width} × ${project.canvas.height} · ${project.canvas.fps} fps</span></p>`;
  document.querySelectorAll('.aspect-grid button').forEach((button) => {
    button.classList.toggle('active', button.dataset.size === currentSize);
    button.addEventListener('click', () => {
      const before = snapshot();
      [project.canvas.width, project.canvas.height] = button.dataset.size.split('x').map(Number);
      remember(before);
      renderAll();
    });
  });
  $('canvas-fit').value = project.canvas.fit;
  $('canvas-fps').value = String(project.canvas.fps);
  for (const [id, key, coerce] of [
    ['canvas-fit', 'fit', String],
    ['canvas-fps', 'fps', Number],
    ['canvas-background', 'background', String],
  ]) {
    $(id).addEventListener('change', () => {
      const before = snapshot();
      project.canvas[key] = coerce($(id).value);
      remember(before);
      renderAll();
    });
  }
}

function renderAll() {
  els.projectTitle.value = project.title;
  const ratio = `${project.canvas.width}:${project.canvas.height}`;
  const labels = { '1080:1920': '9:16', '1920:1080': '16:9', '1080:1080': '1:1', '1080:1350': '4:5' };
  els.formatLabel.textContent = `${labels[ratio] || ratio} · ${Math.min(project.canvas.width, project.canvas.height)}p`;
  renderTimeline();
  renderInspector();
  updateHistoryButtons();
}

// ---------- project save/load ----------

els.projectTitle.addEventListener('change', () => {
  const before = snapshot();
  project.title = els.projectTitle.value.trim() || 'Untitled video';
  els.projectTitle.value = project.title;
  remember(before);
});

$('save-project').addEventListener('click', () => {
  downloadBlob(new Blob([serializeProject()], { type: 'application/json' }), `${safeFilename()}.capy.json`);
  toast('Editable project saved', 'success');
});
$('load-project-btn').addEventListener('click', () => $('load-project').click());
$('load-project').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    pause();
    for (const runtime of runtimeStore.values()) URL.revokeObjectURL(runtime.url);
    runtimeStore.clear();
    const names = restoreProject(await file.text());
    undoStack.length = 0;
    redoStack.length = 0;
    selected = null;
    currentTime = 0;
    renderAll();
    if (names.length) toast(`Project opened — reattach ${names.length} media ${names.length === 1 ? 'file' : 'files'}`);
  } catch (error) {
    toast(`Could not open project: ${error.message}`, 'error');
  }
  event.target.value = '';
});

// ---------- export ----------

async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* export still works while the screen remains awake */ }
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* already released */ }
  wakeLock = null;
}

$('export-video').addEventListener('click', async () => {
  const duration = projectDuration();
  if (!duration) return toast('Add at least one video or photo before exporting', 'error');
  const missing = project.assets.filter((asset) => !runtimeStore.has(asset.id));
  if (missing.length) {
    setTool('media');
    return toast(`Reattach ${missing.length} media ${missing.length === 1 ? 'file' : 'files'} before exporting`, 'error');
  }
  const previousTime = currentTime;
  pause();
  exporting = true;
  els.exportOverlay.hidden = false;
  els.exportProgress.value = 0;
  els.exportPct.textContent = '0%';
  els.exportRemaining.textContent = `About ${secondsLabel(duration)} remaining`;
  const wakeLockPromise = acquireWakeLock();
  try {
    const mediaElements = [...runtimeStore.values()]
      .filter((runtime) => runtime.kind !== 'image')
      .map((runtime) => runtime.el);
    const exportPromise = exportVideo({
      canvas: els.preview,
      duration,
      fps: project.canvas.fps,
      mediaElements,
      startPlayback: (from) => play(from),
      stopPlayback: pause,
      getCurrentTime: () => currentTime,
      onProgress: (progress) => {
        els.exportProgress.value = progress;
        els.exportPct.textContent = `${Math.round(progress * 100)}%`;
        els.exportRemaining.textContent = progress >= 1 ? 'Finishing…' : `About ${secondsLabel(duration * (1 - progress))} remaining`;
      },
    });
    await wakeLockPromise;
    const result = await exportPromise;
    downloadBlob(result.blob, `${safeFilename()}.${result.ext}`);
    toast('Video exported to your device', 'success');
    window.__lastExport = { size: result.blob.size, type: result.blob.type };
  } catch (error) {
    if (!error.cancelled) toast(`Export failed: ${error.message}`, 'error');
  } finally {
    exporting = false;
    els.exportOverlay.hidden = true;
    await releaseWakeLock();
    seek(previousTime);
  }
});

$('export-cancel').addEventListener('click', cancelExport);

// ---------- boot ----------

renderAll();
requestAnimationFrame(renderLoop);

// Test hooks keep browser QA deterministic without becoming public API.
window.__app = {
  project,
  runtimeStore,
  importVisualFiles,
  importAudioFiles,
  seek,
  play,
  pause,
  addTextClip,
  get currentTime() { return currentTime; },
};
