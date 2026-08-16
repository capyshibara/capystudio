// Local automatic captions powered by a lazily loaded Whisper model.
// Only model files are downloaded; project audio never leaves the browser.

import { videoTimeline, audioClips, clipDuration, projectDuration } from './model.js';

const SAMPLE_RATE = 16_000;
let transcriberPromise = null;

export async function generateAutomaticCaptions({ project, fileStore, language = 'auto', onProgress }) {
  onProgress?.({ stage: 'audio', progress: 0, message: 'Preparing timeline audio…' });
  const audio = await buildTimelineAudio(project, fileStore, onProgress);
  if (!audio.some((sample) => Math.abs(sample) > 0.0005)) {
    throw new Error('No readable speech audio was found in the video clips or voice-over track.');
  }

  onProgress?.({ stage: 'model', progress: 0, message: 'Loading the private caption model…' });
  const transcriber = await getTranscriber((data) => {
    const progress = Number(data?.progress);
    onProgress?.({
      stage: 'model',
      progress: Number.isFinite(progress) ? progress / 100 : 0,
      message: data?.file ? `Downloading ${shortFile(data.file)}…` : 'Loading the private caption model…',
    });
  });

  onProgress?.({ stage: 'transcribe', progress: 0.08, message: 'Listening for speech…' });
  const options = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    task: 'transcribe',
  };
  if (language !== 'auto') options.language = language;
  const result = await transcriber(audio, options);
  const duration = projectDuration();
  const chunks = (result.chunks || [])
    .map((chunk) => ({
      text: String(chunk.text || '').trim(),
      start: Math.max(0, Number(chunk.timestamp?.[0]) || 0),
      end: Math.min(duration, Number(chunk.timestamp?.[1]) || duration),
    }))
    .filter((chunk) => chunk.text && chunk.end > chunk.start);

  if (!chunks.length && result.text?.trim()) {
    chunks.push({ text: result.text.trim(), start: 0, end: duration });
  }
  onProgress?.({ stage: 'done', progress: 1, message: `Created ${chunks.length} captions` });
  return chunks;
}

async function getTranscriber(progressCallback) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'
      );
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        dtype: 'q8',
        progress_callback: progressCallback,
      });
    })();
  }
  return transcriberPromise;
}

async function buildTimelineAudio(project, fileStore, onProgress) {
  const duration = projectDuration();
  const output = new Float32Array(Math.max(1, Math.ceil(duration * SAMPLE_RATE)));
  const decoded = new Map();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const sources = [
    ...videoTimeline()
      .filter(({ clip }) => clip.kind === 'video')
      .map((item) => ({ ...item, timelineStart: item.start, role: 'video' })),
    ...audioClips()
      .filter((clip) => clip.role === 'voiceover')
      .map((clip) => ({ clip, timelineStart: clip.start, duration: clipDuration(clip), role: 'voiceover' })),
  ];

  try {
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      const file = fileStore.get(source.clip.assetId);
      if (!file) continue;
      onProgress?.({
        stage: 'audio',
        progress: index / Math.max(1, sources.length),
        message: `Reading ${source.clip.name || `clip ${index + 1}`}…`,
      });
      let buffer = decoded.get(source.clip.assetId);
      if (!buffer) {
        try {
          buffer = await audioContext.decodeAudioData((await file.arrayBuffer()).slice(0));
          decoded.set(source.clip.assetId, buffer);
        } catch {
          continue;
        }
      }
      mixClip(output, buffer, source.clip, source.timelineStart, source.role === 'video');
    }
  } finally {
    audioContext.close().catch(() => {});
  }

  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) {
    for (let i = 0; i < output.length; i++) output[i] /= peak;
  }
  return output;
}

function mixClip(output, buffer, clip, timelineStart, applySpeed) {
  const speed = applySpeed ? Math.max(0.25, Number(clip.speed) || 1) : 1;
  const sourceStart = Math.max(0, Number(clip.trimStart) || 0);
  const duration = clipDuration(clip);
  const outputStart = Math.max(0, Math.floor(timelineStart * SAMPLE_RATE));
  const outputLength = Math.min(
    Math.floor(duration * SAMPLE_RATE),
    output.length - outputStart,
  );
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let i = 0; i < outputLength; i++) {
    const sourceTime = sourceStart + (i / SAMPLE_RATE) * speed;
    const sourceIndex = Math.min(buffer.length - 1, Math.floor(sourceTime * buffer.sampleRate));
    let sample = 0;
    for (const channel of channels) sample += channel[sourceIndex] || 0;
    output[outputStart + i] += (sample / Math.max(1, channels.length)) * (Number(clip.volume) || 1);
  }
}

function shortFile(path) {
  const parts = String(path).split('/');
  return parts.at(-1) || 'model file';
}
