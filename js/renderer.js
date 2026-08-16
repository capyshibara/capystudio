// Pure canvas renderer shared by the live preview and MediaRecorder export.

import { activeTextAt } from './model.js';

export function drawFrame(ctx, state, time) {
  const { project, visualEl, previousVisualEl, activeVideo, previousVideo, transitionProgress } = state;
  const { width, height, fit, background } = project.canvas;
  const canvas = ctx.canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.fillStyle = background || '#08090d';
  ctx.fillRect(0, 0, width, height);

  if (visualEl && mediaReady(visualEl)) {
    const transition = activeVideo?.clip.transition;
    if (
      previousVisualEl && mediaReady(previousVisualEl) && transition?.type !== 'none' &&
      Number.isFinite(transitionProgress)
    ) {
      drawTransition(ctx, {
        previousVisualEl,
        visualEl,
        previousClip: previousVideo?.clip,
        activeClip: activeVideo.clip,
        width,
        height,
        fit,
        type: transition.type,
        progress: transitionProgress,
      });
    } else {
      drawMedia(ctx, visualEl, width, height, fit, activeVideo?.clip.transform);
    }
  } else {
    drawEmpty(ctx, width, height);
  }

  for (const textClip of activeTextAt(time)) {
    drawTextOverlay(ctx, textClip, width, height, time);
  }
}

function mediaReady(el) {
  if (el.tagName === 'IMG') return el.complete && el.naturalWidth;
  return el.readyState >= 2 && el.videoWidth;
}

function drawEmpty(ctx, width, height) {
  ctx.fillStyle = '#171922';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#6f768a';
  ctx.font = `600 ${Math.max(24, Math.round(height / 34))}px Inter, system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Add videos or photos to begin', width / 2, height / 2);
}

function drawMedia(ctx, el, width, height, fit = 'cover', transform = {}, alpha = 1) {
  const sourceWidth = el.videoWidth || el.naturalWidth;
  const sourceHeight = el.videoHeight || el.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const baseScale = fit === 'contain'
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  const scale = baseScale * Math.max(0.1, Number(transform?.scale) || 1);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = width * (Number(transform?.x) || 0) / 100;
  const offsetY = height * (Number(transform?.y) || 0) / 100;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
  ctx.rotate(((Number(transform?.rotation) || 0) * Math.PI) / 180);
  ctx.drawImage(el, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawTransition(ctx, options) {
  const {
    previousVisualEl, visualEl, previousClip, activeClip,
    width, height, fit, type,
  } = options;
  const progress = Math.max(0, Math.min(1, options.progress));
  if (type === 'fade') {
    if (progress < 0.5) {
      drawMedia(ctx, previousVisualEl, width, height, fit, previousClip?.transform);
      ctx.fillStyle = `rgba(0,0,0,${progress * 2})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      drawMedia(ctx, visualEl, width, height, fit, activeClip?.transform, (progress - 0.5) * 2);
    }
    return;
  }

  drawMedia(ctx, previousVisualEl, width, height, fit, previousClip?.transform);
  if (type === 'slide') {
    ctx.save();
    ctx.translate(width * (1 - progress), 0);
    drawMedia(ctx, visualEl, width, height, fit, activeClip?.transform);
    ctx.restore();
  } else if (type === 'zoom') {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    const scale = 0.78 + 0.22 * progress;
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
    drawMedia(ctx, visualEl, width, height, fit, activeClip?.transform, progress);
    ctx.restore();
  } else {
    drawMedia(ctx, visualEl, width, height, fit, activeClip?.transform, progress);
  }
}

function drawTextOverlay(ctx, clip, width, height, time) {
  const style = clip.style || {};
  const fontSize = Number(style.fontSize) || Math.round(height * 0.055);
  const progressIn = Math.min(1, Math.max(0, (time - clip.start) / 0.24));
  const progressOut = Math.min(1, Math.max(0, (clip.end - time) / 0.24));
  const animation = style.animation || 'none';
  const alpha = animation === 'fade' ? Math.min(progressIn, progressOut) : 1;
  const scale = animation === 'pop' ? 0.82 + 0.18 * easeOutBack(progressIn) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(width / 2, textY(style.position, height));
  ctx.scale(scale, scale);
  ctx.font = `${style.bold === false ? '500' : '700'} ${fontSize}px "${style.fontFamily || 'Inter'}", system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const maxWidth = width * 0.84;
  const lines = wrapText(ctx, clip.text || '', maxWidth);
  const lineHeight = fontSize * 1.2;
  const blockHeight = lines.length * lineHeight;
  let y = -blockHeight / 2 + lineHeight / 2;

  if (style.background && style.background !== 'transparent') {
    const measured = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width)));
    const padX = fontSize * 0.38;
    const padY = fontSize * 0.22;
    ctx.fillStyle = style.background;
    roundedRect(ctx, -measured / 2 - padX, -blockHeight / 2 - padY,
      measured + padX * 2, blockHeight + padY * 2, fontSize * 0.2);
    ctx.fill();
  }

  for (const line of lines) {
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = Math.max(2, fontSize * 0.07);
    ctx.strokeText(line, 0, y, maxWidth);
    ctx.fillStyle = style.color || '#ffffff';
    ctx.fillText(line, 0, y, maxWidth);
    y += lineHeight;
  }
  ctx.restore();
}

function textY(position, height) {
  if (position === 'top') return height * 0.18;
  if (position === 'center') return height * 0.5;
  return height * 0.82;
}

function wrapText(ctx, text, maxWidth) {
  const paragraphs = String(text).split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current || ' ');
  }
  return lines.length ? lines : [' '];
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect?.(x, y, width, height, r);
  if (!ctx.roundRect) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}
