/* ==========================================================================
   Audio Visualizer Module
   Canvas-based frequency visualizer, tapped off the persistent AudioEngine
   <audio> element via the Web Audio API. When toggled off, the animation
   loop is fully cancelled AND the analyser is disconnected from the graph,
   so there's nothing left running beyond the base AudioContext.
   ========================================================================== */

const Visualizer = {
  canvas: null,
  ctx: null,
  audioCtx: null,
  sourceNode: null,   // MediaElementSourceNode — can only be created ONCE per <audio> element, ever
  analyser: null,
  dataArray: null,      // frequency-domain buffer (bars / mirror / circular)
  timeDataArray: null,  // time-domain buffer (waveform)
  rafId: null,
  isActive: false,
  isSupported: true,

  // Render styles, cycled via #visualizer-style-btn and persisted locally.
  styles: ['bars', 'mirror', 'wave', 'circular'],
  currentStyle: 'bars',

  init() {
    this.canvas = document.getElementById('visualizer-canvas');
    const btn = document.getElementById('visualizer-toggle-btn');
    const styleBtn = document.getElementById('visualizer-style-btn');
    if (!this.canvas || !btn) return;

    this.ctx = this.canvas.getContext('2d');

    // Restore the last chosen style (bars/mirror/wave/circular), if any.
    try {
      const saved = localStorage.getItem('bora-visualizer-style');
      if (saved && this.styles.includes(saved)) this.currentStyle = saved;
    } catch (e) { /* localStorage unavailable; default style is fine */ }
    if (styleBtn) styleBtn.title = `Visualizer Style: ${this.styleLabel(this.currentStyle)}`;

    if (typeof (window.AudioContext || window.webkitAudioContext) === 'undefined') {
      this.isSupported = false;
      btn.style.display = 'none';
      if (styleBtn) styleBtn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => this.toggle());
    if (styleBtn) styleBtn.addEventListener('click', () => this.cycleStyle());
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  },

  /**
   * Lazily builds the Web Audio graph on first activation (also keeps
   * AudioContext creation tied to a user gesture, which browsers require
   * anyway). Returns false — and leaves playback completely untouched —
   * if anything here is unsupported.
   */
  ensureGraph() {
    if (this.analyser) return true;
    if (!this.isSupported) return false;

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();

      // IMPORTANT: createMediaElementSource can only ever be called ONCE for
      // a given <audio> element for its entire lifetime. After this call,
      // the element's audio output is routed exclusively through the Web
      // Audio graph — so the destination connection below must stay in
      // place permanently, or playback goes silent app-wide.
      this.sourceNode = this.audioCtx.createMediaElementSource(AudioEngine.audio);
      this.sourceNode.connect(this.audioCtx.destination);

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.75;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDataArray = new Uint8Array(this.analyser.fftSize);

      return true;
    } catch (err) {
      // If this threw, the destination connection either never happened or
      // failed atomically with it — native <audio> playback is unaffected
      // either way. Just disable the feature going forward.
      console.warn('Visualizer unsupported on this platform:', err);
      this.isSupported = false;
      this.analyser = null;
      const btn = document.getElementById('visualizer-toggle-btn');
      const styleBtn = document.getElementById('visualizer-style-btn');
      if (btn) btn.style.display = 'none';
      if (styleBtn) styleBtn.style.display = 'none';
      return false;
    }
  },

  toggle() {
    if (this.isActive) this.stop();
    else this.start();
  },

  start() {
    if (!this.ensureGraph()) return;

    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    // Tap the analyser in parallel with the always-on destination connection.
    // This is the only connection made/broken on toggle — audio playback
    // itself is never touched.
    try {
      this.sourceNode.connect(this.analyser);
    } catch (e) {
      return; // already connected or graph in a bad state; bail out quietly
    }

    this.isActive = true;
    const btn = document.getElementById('visualizer-toggle-btn');
    if (btn) {
      btn.dataset.active = 'true';
      btn.style.color = 'var(--primary, #1db954)';
      btn.title = 'Visualizer: On';
    }

    const wrap = this.canvas.closest('.visualizer-wrap');
    if (wrap) wrap.classList.add('visualizer-active');

    this.resizeCanvas();
    this.draw();

    // If a PiP window is already open, hand it the visualizer feed instead
    // of the static thumbnail — no-op if PiP isn't currently active.
    if (typeof PiP !== 'undefined') PiP.onVisualizerToggle(true);
  },

  stop() {
    this.isActive = false;

    const btn = document.getElementById('visualizer-toggle-btn');
    if (btn) {
      btn.dataset.active = 'false';
      btn.style.color = 'var(--text-muted, #8e8e99)';
      btn.title = 'Visualizer: Off';
    }

    const wrap = this.canvas && this.canvas.closest('.visualizer-wrap');
    if (wrap) wrap.classList.remove('visualizer-active');

    // Stop the animation loop — this is the main CPU cost, and it's cancelled
    // synchronously and unconditionally.
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Detach the analyser from the graph entirely so it isn't processing
    // audio in the background while "off".
    if (this.sourceNode && this.analyser) {
      try { this.sourceNode.disconnect(this.analyser); } catch (e) { /* already disconnected */ }
    }

    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Hand PiP back to the static thumbnail if it's currently open — no-op
    // if PiP isn't currently active.
    if (typeof PiP !== 'undefined') PiP.onVisualizerToggle(false);
  },

  draw() {
    if (!this.isActive) return;
    this.rafId = requestAnimationFrame(() => this.draw());
    this.renderStyle(this.ctx, this.canvas.width, this.canvas.height);
  },

  /**
   * Shared renderer — draws one frame of the current style into any
   * ctx/w/h. Used by this module's own canvas AND by PiP.js, so the
   * floating PiP window can show the identical live visualization
   * instead of the thumbnail while the visualizer is toggled on.
   */
  renderStyle(ctx, w, h) {
    if (!this.analyser || !ctx || !w || !h) return;
    ctx.clearRect(0, 0, w, h);

    const cssStyle = getComputedStyle(document.documentElement);
    const color = (cssStyle.getPropertyValue('--primary') || '').trim() || '#1db954';

    switch (this.currentStyle) {
      case 'mirror':
        this.analyser.getByteFrequencyData(this.dataArray);
        this.renderMirrorBars(ctx, w, h, color);
        break;
      case 'wave':
        this.analyser.getByteTimeDomainData(this.timeDataArray);
        this.renderWave(ctx, w, h, color);
        break;
      case 'circular':
        this.analyser.getByteFrequencyData(this.dataArray);
        this.renderCircular(ctx, w, h, color);
        break;
      case 'bars':
      default:
        this.analyser.getByteFrequencyData(this.dataArray);
        this.renderBars(ctx, w, h, color);
        break;
    }
  },

  /** Classic bottom-anchored bars (the original/default style). */
  renderBars(ctx, w, h, color) {
    const barCount = this.dataArray.length;
    const barWidth = w / barCount;
    ctx.fillStyle = color;
    for (let i = 0; i < barCount; i++) {
      const value = this.dataArray[i] / 255;
      const barHeight = value * h;
      const x = i * barWidth;
      ctx.fillRect(x, h - barHeight, Math.max(1, barWidth - 2), barHeight);
    }
  },

  /** Bars growing both up and down from a center line. */
  renderMirrorBars(ctx, w, h, color) {
    const barCount = this.dataArray.length;
    const barWidth = w / barCount;
    const midY = h / 2;
    ctx.fillStyle = color;
    for (let i = 0; i < barCount; i++) {
      const value = this.dataArray[i] / 255;
      const halfHeight = value * midY;
      const x = i * barWidth;
      ctx.fillRect(x, midY - halfHeight, Math.max(1, barWidth - 2), halfHeight * 2);
    }
  },

  /** Oscilloscope-style line trace from time-domain samples. */
  renderWave(ctx, w, h, color) {
    const data = this.timeDataArray;
    ctx.lineWidth = Math.max(2, w / 300);
    ctx.strokeStyle = color;
    ctx.beginPath();

    const sliceWidth = w / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0; // ~1.0 at silence, swings 0..2 with the signal
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  },

  /** Radial bars spreading outward from a center circle. */
  renderCircular(ctx, w, h, color) {
    const barCount = this.dataArray.length;
    const cx = w / 2, cy = h / 2;
    const innerRadius = Math.min(w, h) * 0.22;
    const maxBarLength = Math.min(w, h) * 0.28;
    // Keeps every angle visibly "lit" even on a fully silent bin, so the
    // ring reads as a complete circle instead of a wedge cut out of it.
    const minBarLength = Math.max(2, Math.min(w, h) * 0.015);

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) / 160);

    for (let i = 0; i < barCount; i++) {
      // Raw analyser output skews heavily toward bass/mid frequencies —
      // most music has very little energy in the top octave or two. Gently
      // boost the higher-frequency half so those bars aren't perpetually
      // flat next to the low end.
      const highFreqBoost = 1 + (i / barCount) * 0.6;
      const value = Math.min(1, (this.dataArray[i] / 255) * highFreqBoost);

      const angle = (i / barCount) * Math.PI * 2;
      const outerRadius = innerRadius + Math.max(value * maxBarLength, minBarLength);

      const x1 = cx + Math.cos(angle) * innerRadius;
      const y1 = cy + Math.sin(angle) * innerRadius;
      const x2 = cx + Math.cos(angle) * outerRadius;
      const y2 = cy + Math.sin(angle) * outerRadius;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  },

  /** Cycles to the next render style, persists it, and updates the button. */
  cycleStyle() {
    const idx = this.styles.indexOf(this.currentStyle);
    this.currentStyle = this.styles[(idx + 1) % this.styles.length];

    try { localStorage.setItem('bora-visualizer-style', this.currentStyle); } catch (e) { /* ignore */ }

    const label = this.styleLabel(this.currentStyle);
    const styleBtn = document.getElementById('visualizer-style-btn');
    if (styleBtn) styleBtn.title = `Visualizer Style: ${label}`;
    if (typeof Helpers !== 'undefined' && Helpers.showToast) {
      Helpers.showToast(`Visualizer style: ${label}`);
    }
    // No manual redraw needed here — the running draw()/PiP loop (if active)
    // picks up the new style on its very next animation frame.
  },

  styleLabel(style) {
    switch (style) {
      case 'mirror': return 'Mirror';
      case 'wave': return 'Waveform';
      case 'circular': return 'Circular';
      case 'bars':
      default: return 'Bars';
    }
  }
};