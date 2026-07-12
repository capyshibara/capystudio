// Canvas frame renderer. Pure drawing: given project state + time, paint one
// frame. The same function drives the live preview and the export recording,
// so what you see is exactly what you get.

import { activeLine } from './model.js';

export function drawFrame(ctx, state, t) {
  const { width, height } = state.project.canvas;
  const canvas = ctx.canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, width, height);

  if (state.bgEl) {
    drawCover(ctx, state.bgEl, width, height);
  } else {
    ctx.fillStyle = '#5b6478';
    ctx.font = `500 ${Math.round(height / 24)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add a background image or video', width / 2, height / 2);
  }

  const style = state.project.style;
  if (style.dim > 0 && state.bgEl) {
    ctx.fillStyle = `rgba(0,0,0,${style.dim})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Video elements take over the frame from lyrics while active.
  const { intro, outro } = state.project;
  if (intro?.enabled && t < intro.duration) {
    const alpha = Math.min(1, t / 0.4, (intro.duration - t) / 0.6);
    drawCard(ctx, introLines(intro, style), style, width, height, alpha);
    return;
  }
  const dur = state.duration;
  if (outro?.enabled && dur > 0 && t >= dur - outro.duration) {
    const alpha = Math.min(1, (t - (dur - outro.duration)) / 0.6);
    drawCard(ctx, outroLines(outro, style), style, width, height, alpha);
    return;
  }

  const line = activeLine(state.project.tracks.lyrics.clips, t, state.duration);
  if (line) drawLyric(ctx, line.text, style, width, height);
}

function introLines(intro, style) {
  const lines = [];
  if (intro.title) lines.push({ text: intro.title, size: style.fontSize * 1.4, bold: true });
  if (intro.artist) lines.push({ text: intro.artist, size: style.fontSize * 0.7, bold: false });
  return lines;
}

function outroLines(outro, style) {
  return outro.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ text, size: style.fontSize * 0.6, bold: false }));
}

// Centered multi-line card (intro / credits) with its own scrim, faded by
// alpha. Uses the subtitle style's font and colors so the video reads as
// one piece.
function drawCard(ctx, lines, style, W, H, alpha) {
  if (!lines.length) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const gap = style.fontSize * 0.5;
  // Pre-wrap every line at its own size to measure total block height.
  const blocks = lines.map((l) => {
    ctx.font = `${l.bold ? '700' : '400'} ${l.size}px "${style.fontFamily}", sans-serif`;
    const wrapped = wrapText(ctx, l.text, (W * style.maxWidthPct) / 100);
    return { ...l, wrapped, lineH: l.size * style.lineHeight };
  });
  const blockH =
    blocks.reduce((h, b) => h + b.wrapped.length * b.lineH, 0) + gap * (blocks.length - 1);

  let y = (H - blockH) / 2;
  for (const b of blocks) {
    ctx.font = `${b.bold ? '700' : '400'} ${b.size}px "${style.fontFamily}", sans-serif`;
    for (const ln of b.wrapped) {
      y += b.size;
      if (style.outlineWidth > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = style.outlineWidth * 2 * (b.size / style.fontSize);
        ctx.strokeText(ln, W / 2, y);
      }
      ctx.fillStyle = style.color;
      ctx.fillText(ln, W / 2, y);
      y += b.lineH - b.size;
    }
    y += gap;
  }
  ctx.restore();
}

function drawCover(ctx, el, W, H) {
  const w = el.videoWidth || el.naturalWidth;
  const h = el.videoHeight || el.naturalHeight;
  if (!w || !h) return;
  const scale = Math.max(W / w, H / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawLyric(ctx, text, style, W, H) {
  const weight = style.bold ? '700' : '400';
  ctx.font = `${weight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = (W * style.maxWidthPct) / 100;
  const lines = wrapText(ctx, text, maxWidth);
  const lineH = style.fontSize * style.lineHeight;
  const blockH = lines.length * lineH;
  const margin = (H * style.marginPct) / 100;

  // y of the first line's baseline
  let y;
  if (style.position === 'top') {
    y = margin + style.fontSize;
  } else if (style.position === 'middle') {
    y = (H - blockH) / 2 + style.fontSize;
  } else {
    y = H - margin - blockH + style.fontSize;
  }

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  for (const ln of lines) {
    if (style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = style.outlineWidth * 2;
      ctx.strokeText(ln, W / 2, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(ln, W / 2, y);
    y += lineH;
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}
