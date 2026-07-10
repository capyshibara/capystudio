// Subtitle format import/export: SRT and LRC.

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

function srtTime(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function srtStringify(clips, duration) {
  const timed = clips.filter((c) => c.start != null);
  return timed
    .map((c, i) => {
      const next = timed[i + 1];
      const end =
        c.end != null
          ? c.end
          : next && next.start > c.start
            ? next.start
            : Math.min(c.start + 6, duration || c.start + 6);
      return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(end)}\n${c.text}\n`;
    })
    .join('\n');
}

export function srtParse(text) {
  const clips = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  const timeRe = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const ti = lines.findIndex((l) => timeRe.test(l));
    if (ti === -1) continue;
    const m = lines[ti].match(timeRe);
    const start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    const end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const textLines = lines.slice(ti + 1).join(' ').trim();
    if (textLines) clips.push({ text: textLines, start, end });
  }
  return clips;
}

function lrcTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `[${pad(m)}:${pad(s.toFixed(2), 5)}]`;
}

export function lrcStringify(clips) {
  return clips
    .filter((c) => c.start != null)
    .map((c) => `${lrcTime(c.start)}${c.text}`)
    .join('\n');
}

export function lrcParse(text) {
  const clips = [];
  const re = /^\s*(?:\[(\d+):(\d+(?:\.\d+)?)\])+(.*)$/;
  const tagRe = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!re.test(raw)) continue;
    const body = raw.replace(tagRe, '').trim();
    if (!body) continue;
    let m;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(raw))) {
      clips.push({ text: body, start: +m[1] * 60 + +m[2], end: null });
    }
  }
  clips.sort((a, b) => a.start - b.start);
  return clips;
}

export function formatTime(t) {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1);
  return `${m}:${String(s).padStart(4, '0')}`;
}
