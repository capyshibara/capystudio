// Video export: records the preview canvas + audio in real time with
// MediaRecorder. 100% client-side — nothing is uploaded anywhere.
// Output is MP4 where the browser supports recording it (Safari),
// otherwise WebM (Chrome, Firefox). Both upload fine to YouTube etc.

let audioCtx = null;
let streamDest = null;
let currentJob = null;

// createMediaElementSource may only be called once per element, so the
// audio graph is built lazily and kept for the page lifetime.
function ensureAudioGraph(audioEl) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audioEl);
    streamDest = audioCtx.createMediaStreamDestination();
    src.connect(audioCtx.destination); // keep audible playback working
    src.connect(streamDest);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return streamDest;
}

export function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || null;
}

export function cancelExport() {
  if (currentJob) currentJob.cancelled = true;
}

export async function exportVideo({ canvas, audioEl, bgVideo, fps, onProgress }) {
  const mime = pickMimeType();
  if (!mime) throw new Error('This browser does not support video recording (MediaRecorder).');

  // Make sure web fonts are in before recording starts, or early frames
  // would render lyrics/intro in a fallback font.
  try {
    await document.fonts.ready;
  } catch { /* non-fatal */ }

  const dest = ensureAudioGraph(audioEl);
  const stream = canvas.captureStream(fps);
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((res) => (recorder.onstop = res));

  const job = { cancelled: false };
  currentJob = job;

  audioEl.pause();
  audioEl.currentTime = 0;
  if (bgVideo) {
    try {
      bgVideo.currentTime = 0;
      await bgVideo.play();
    } catch {
      /* background video failing to autoplay is non-fatal */
    }
  }
  await audioEl.play();
  recorder.start(500);

  const progressTimer = setInterval(() => {
    onProgress(Math.min(1, (audioEl.currentTime || 0) / (audioEl.duration || 1)));
  }, 200);

  await new Promise((resolve) => {
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const poll = setInterval(() => {
      if (job.cancelled) {
        cleanup();
        resolve();
      }
    }, 150);
    const cleanup = () => {
      clearInterval(poll);
      audioEl.removeEventListener('ended', onEnded);
    };
    audioEl.addEventListener('ended', onEnded);
  });

  clearInterval(progressTimer);
  // Small grace period so the recorder captures the final frames.
  await new Promise((r) => setTimeout(r, 300));
  if (recorder.state !== 'inactive') recorder.stop();
  audioEl.pause();
  if (bgVideo) bgVideo.pause();
  await stopped;
  currentJob = null;

  if (job.cancelled) {
    const err = new Error('Export cancelled');
    err.cancelled = true;
    throw err;
  }
  onProgress(1);
  return { blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}
