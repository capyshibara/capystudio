// Project data model.
// Deliberately track/clip/asset shaped (not "one audio + one image") so future
// features — multiple backgrounds, overlays, translations — extend it without
// a rewrite. See README roadmap.

export const project = {
  version: 1,
  canvas: { width: 1920, height: 1080, fps: 30 },
  assets: [], // { id, kind: 'audio'|'image'|'video', name }
  tracks: {
    background: { clips: [] }, // { assetId, fit: 'cover', loop: true }
    music: { clips: [] },      // { assetId }
    lyrics: { clips: [] },     // { text, start, end }  seconds; end null = until next line
  },
  style: {
    fontFamily: 'Arial',
    fontSize: 64,
    bold: true,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 6,
    position: 'bottom', // bottom | middle | top
    marginPct: 8,       // vertical margin, % of canvas height
    maxWidthPct: 86,    // wrap width, % of canvas width
    lineHeight: 1.25,
    dim: 0.25,          // dark overlay opacity over the background
  },
  // Video elements: title card at the start, credits at the end. Both are
  // drawn by the renderer (preview and export alike) using the subtitle
  // style's font and colors.
  intro: { enabled: false, title: '', artist: '', duration: 3 },
  outro: { enabled: false, text: '', duration: 4 },
};

// File objects can't be serialized into the project JSON; they live here,
// keyed by asset id. On project load the user re-attaches media by name.
export const fileStore = new Map();

export function lyricClips() {
  return project.tracks.lyrics.clips;
}

// Effective end of a lyric line: explicit end, else next line's start,
// else a capped default so the last line doesn't linger forever.
export function effectiveEnd(clips, i, duration) {
  const c = clips[i];
  if (c.end != null) return c.end;
  const next = clips[i + 1];
  if (next && next.start != null && next.start > c.start) return next.start;
  const cap = c.start + 6;
  return duration ? Math.min(cap, duration) : cap;
}

export function activeLine(clips, t, duration) {
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i];
    if (c.start != null && t >= c.start && t < effectiveEnd(clips, i, duration)) {
      return c;
    }
  }
  return null;
}

export function serializeProject() {
  return JSON.stringify(
    {
      version: project.version,
      canvas: project.canvas,
      assets: project.assets,
      tracks: project.tracks,
      style: project.style,
      intro: project.intro,
      outro: project.outro,
    },
    null,
    2
  );
}

export function restoreProject(json) {
  const p = JSON.parse(json);
  if (!p || p.version !== 1) throw new Error('Unrecognized project file');
  project.canvas = { ...project.canvas, ...p.canvas };
  project.style = { ...project.style, ...p.style };
  project.intro = { ...project.intro, ...p.intro };
  project.outro = { ...project.outro, ...p.outro };
  project.assets = p.assets || [];
  project.tracks.lyrics.clips = p.tracks?.lyrics?.clips || [];
  // Background/music clips are restored too, but their files must be re-attached.
  project.tracks.background.clips = p.tracks?.background?.clips || [];
  project.tracks.music.clips = p.tracks?.music?.clips || [];
  return project.assets.map((a) => a.name);
}
