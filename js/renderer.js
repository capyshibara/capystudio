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

  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(0, 0, width, height);

  if (state.bgEl) {
    drawCover(ctx, state.bgEl, width, height);
  } else {
    ctx.fillStyle = '#3a3a48';
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

  const line = activeLine(state.project.tracks.lyrics.clips, t, state.duration);
  if (line) drawLyric(ctx, line.text, style, width, height);
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
