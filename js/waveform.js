// Audio waveform strip: static peaks canvas + overlay canvas for the
// playhead and lyric-start markers. Click to seek.

export class Waveform {
  constructor(waveCanvas, overlayCanvas, { getDuration, onSeek }) {
    this.wave = waveCanvas;
    this.overlay = overlayCanvas;
    this.getDuration = getDuration;
    this.peaks = null;

    const wrap = waveCanvas.parentElement;
    const seekFromEvent = (e) => {
      const rect = wrap.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const d = this.getDuration();
      if (d) onSeek(frac * d);
    };
    // Pointer events unify mouse click-to-seek and touch drag-scrub.
    let dragging = false;
    wrap.addEventListener('pointerdown', (e) => {
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      seekFromEvent(e);
    });
    wrap.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
    wrap.addEventListener('pointerup', () => { dragging = false; });
    wrap.addEventListener('pointercancel', () => { dragging = false; });

    new ResizeObserver(() => this.redrawStatic()).observe(wrap);
  }

  async load(file) {
    const buf = await file.arrayBuffer();
    // OfflineAudioContext decodes without needing a user gesture.
    const octx = new OfflineAudioContext(1, 44100, 44100);
    const audioBuf = await octx.decodeAudioData(buf);
    const data = audioBuf.getChannelData(0);
    const buckets = 1600;
    const per = Math.max(1, Math.floor(data.length / buckets));
    const peaks = new Float32Array(buckets * 2);
    for (let b = 0; b < buckets; b++) {
      let min = 1, max = -1;
      const startIdx = b * per;
      const endIdx = Math.min(startIdx + per, data.length);
      for (let i = startIdx; i < endIdx; i += 4) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[b * 2] = min;
      peaks[b * 2 + 1] = max;
    }
    this.peaks = peaks;
    this.redrawStatic();
  }

  _fit(canvas) {
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrap.clientWidth * dpr;
    canvas.height = wrap.clientHeight * dpr;
  }

  redrawStatic() {
    this._fit(this.wave);
    const ctx = this.wave.getContext('2d');
    const { width: W, height: H } = this.wave;
    ctx.clearRect(0, 0, W, H);
    if (!this.peaks) {
      ctx.fillStyle = '#5b6478';
      ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waveform appears here after loading audio', W / 2, H / 2);
      return;
    }
    const buckets = this.peaks.length / 2;
    const mid = H / 2;
    ctx.fillStyle = '#7c92ff';
    for (let x = 0; x < W; x++) {
      const b = Math.floor((x / W) * buckets);
      const min = this.peaks[b * 2];
      const max = this.peaks[b * 2 + 1];
      const y1 = mid + min * mid * 0.92;
      const y2 = mid + max * mid * 0.92;
      ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
    }
  }

  drawOverlay(t, clips) {
    if (
      this.overlay.width !== this.wave.width ||
      this.overlay.height !== this.wave.height
    ) {
      this._fit(this.overlay);
    }
    const ctx = this.overlay.getContext('2d');
    const { width: W, height: H } = this.overlay;
    ctx.clearRect(0, 0, W, H);
    const d = this.getDuration();
    if (!d) return;

    ctx.fillStyle = 'rgba(87, 211, 140, 0.9)';
    for (const c of clips) {
      if (c.start == null) continue;
      const x = (c.start / d) * W;
      ctx.fillRect(x, 0, 2, H * 0.35);
    }

    const px = (t / d) * W;
    ctx.fillStyle = '#ff5c5c';
    ctx.fillRect(px - 1, 0, 2, H);
  }
}
