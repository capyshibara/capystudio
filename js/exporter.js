// Records the composited preview plus all active media audio in real time.
// Everything stays in the browser; output is MP4 when supported, WebM otherwise.

let audioContext = null;
let mixDestination = null;
let currentJob = null;
const connectedElements = new WeakSet();

function ensureAudioMix(elements) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mixDestination = audioContext.createMediaStreamDestination();
  }
  for (const element of elements) {
    if (!element || connectedElements.has(element)) continue;
    const source = audioContext.createMediaElementSource(element);
    source.connect(audioContext.destination);
    source.connect(mixDestination);
    connectedElements.add(element);
  }
  if (audioContext.state === 'suspended') audioContext.resume();
  return mixDestination;
}

export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) =>
    window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || null;
}

export function cancelExport() {
  if (currentJob) currentJob.cancelled = true;
}

export async function exportVideo({
  canvas,
  duration,
  fps,
  mediaElements,
  startPlayback,
  stopPlayback,
  getCurrentTime,
  onProgress,
}) {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('This browser does not support MediaRecorder video export.');
  if (!duration) throw new Error('Add at least one video or photo before exporting.');

  // Build/resume the Web Audio graph before our first await so Safari still
  // treats it as part of the user's Export-button gesture.
  const destination = mediaElements.length ? ensureAudioMix(mediaElements) : null;

  try { await document.fonts.ready; } catch { /* fallback fonts are acceptable */ }

  const stream = canvas.captureStream(fps);
  if (destination) {
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size) chunks.push(event.data);
  });
  const stopped = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.addEventListener('error', () => reject(recorder.error), { once: true });
  });

  const job = { cancelled: false };
  currentJob = job;
  recorder.start(500);
  await startPlayback(0);

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const time = getCurrentTime();
      onProgress(Math.min(1, time / duration));
      if (job.cancelled || time >= duration) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });

  stopPlayback();
  await new Promise((resolve) => setTimeout(resolve, 220));
  if (recorder.state !== 'inactive') recorder.stop();
  await stopped;
  currentJob = null;

  if (job.cancelled) {
    const error = new Error('Export cancelled');
    error.cancelled = true;
    throw error;
  }

  onProgress(1);
  return {
    blob: new Blob(chunks, { type: mimeType }),
    ext: mimeType.includes('mp4') ? 'mp4' : 'webm',
  };
}
