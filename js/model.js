// CapyStudio project model. Media bytes stay on-device in fileStore; project
// JSON only contains edit decisions and the original filenames.

export const project = {
  version: 2,
  title: 'Untitled video',
  canvas: {
    width: 1080,
    height: 1920,
    fps: 30,
    fit: 'cover',
    background: '#08090d',
  },
  assets: [], // { id, kind: 'video'|'image'|'audio', name }
  tracks: {
    video: { clips: [] },
    audio: { clips: [] },
    text: { clips: [] },
  },
};

export const fileStore = new Map();

export function uid(prefix = 'item') {
  const random = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function videoClips() {
  return project.tracks.video.clips;
}

export function audioClips() {
  return project.tracks.audio.clips;
}

export function textClips() {
  return project.tracks.text.clips;
}

export function clipDuration(clip) {
  if (clip.kind === 'image') return Math.max(0.1, Number(clip.duration) || 3);
  return Math.max(0.1, (Number(clip.trimEnd) || 0) - (Number(clip.trimStart) || 0));
}

export function videoTimeline() {
  let cursor = 0;
  return videoClips().map((clip) => {
    const duration = clipDuration(clip);
    const item = { clip, start: cursor, end: cursor + duration, duration };
    cursor += duration;
    return item;
  });
}

export function projectDuration() {
  return videoTimeline().at(-1)?.end || 0;
}

export function activeVideoAt(time) {
  const timeline = videoTimeline();
  if (!timeline.length) return null;
  const t = Math.max(0, Math.min(Number(time) || 0, projectDuration()));
  return timeline.find((item) => t >= item.start && t < item.end) || timeline.at(-1);
}

export function activeTextAt(time) {
  return textClips().filter((clip) => time >= clip.start && time < clip.end);
}

export function addAsset(kind, file) {
  const existing = project.assets.find((asset) =>
    asset.kind === kind && asset.name === file.name && !fileStore.has(asset.id));
  if (existing) {
    fileStore.set(existing.id, file);
    return { asset: existing, reattached: true };
  }
  const asset = { id: uid('asset'), kind, name: file.name };
  project.assets.push(asset);
  fileStore.set(asset.id, file);
  return { asset, reattached: false };
}

export function removeUnusedAssets() {
  const used = new Set([
    ...videoClips().map((clip) => clip.assetId),
    ...audioClips().map((clip) => clip.assetId),
  ]);
  project.assets = project.assets.filter((asset) => used.has(asset.id));
}

export function serializeProject() {
  return JSON.stringify(project, null, 2);
}

function migrateV1(oldProject) {
  const migrated = structuredClone(project);
  migrated.title = oldProject.intro?.title || 'Imported lyric video';
  migrated.canvas = { ...migrated.canvas, ...oldProject.canvas };
  migrated.assets = oldProject.assets || [];

  const background = oldProject.tracks?.background?.clips?.[0];
  const bgAsset = migrated.assets.find((asset) => asset.id === background?.assetId);
  if (background && bgAsset) {
    migrated.tracks.video.clips.push({
      id: uid('video'),
      assetId: background.assetId,
      name: bgAsset.name,
      kind: bgAsset.kind,
      duration: 6,
      sourceDuration: 6,
      trimStart: 0,
      trimEnd: 6,
      volume: 1,
    });
  }

  const music = oldProject.tracks?.music?.clips?.[0];
  const musicAsset = migrated.assets.find((asset) => asset.id === music?.assetId);
  if (music && musicAsset) {
    migrated.tracks.audio.clips.push({
      id: uid('audio'),
      assetId: music.assetId,
      name: musicAsset.name,
      start: 0,
      sourceDuration: 0,
      trimStart: 0,
      trimEnd: 0,
      volume: 0.8,
      fadeIn: 0,
      fadeOut: 0,
    });
  }

  const legacyStyle = oldProject.style || {};
  for (const lyric of oldProject.tracks?.lyrics?.clips || []) {
    if (lyric.start == null) continue;
    migrated.tracks.text.clips.push({
      id: uid('text'),
      text: lyric.text,
      start: lyric.start,
      end: lyric.end ?? lyric.start + 3,
      style: {
        fontFamily: legacyStyle.fontFamily || 'Inter',
        fontSize: legacyStyle.fontSize || 64,
        bold: legacyStyle.bold ?? true,
        color: legacyStyle.color || '#ffffff',
        background: '#00000099',
        position: legacyStyle.position === 'middle' ? 'center' : (legacyStyle.position || 'bottom'),
        animation: 'fade',
      },
    });
  }
  return migrated;
}

export function restoreProject(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || ![1, 2].includes(parsed.version)) {
    throw new Error('Unrecognized CapyStudio project file');
  }
  const restored = parsed.version === 1 ? migrateV1(parsed) : parsed;
  const fresh = structuredClone(project);
  project.version = 2;
  project.title = restored.title || fresh.title;
  project.canvas = { ...fresh.canvas, ...restored.canvas };
  project.assets = Array.isArray(restored.assets) ? restored.assets : [];
  project.tracks = {
    video: { clips: restored.tracks?.video?.clips || [] },
    audio: { clips: restored.tracks?.audio?.clips || [] },
    text: { clips: restored.tracks?.text?.clips || [] },
  };
  fileStore.clear();
  return project.assets.map((asset) => asset.name);
}
