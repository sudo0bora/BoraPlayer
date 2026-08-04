/* ==========================================================================
   Picture-in-Picture Module
   Renders the current track's artwork + title/artist onto an offscreen
   canvas, streams that canvas into a silent <video> element, and puts that
   video into native Picture-in-Picture.

   Playback controls inside the PiP overlay are NOT wired up here — they're
   driven by the Media Session action handlers already registered in
   AudioEngine.initMediaSession() (play/pause/previoustrack/nexttrack).
   Chrome shows those as the PiP window's transport controls automatically
   as long as a Media Session is active and the source <video> is playing.
   This module's silent video exists purely to host that PiP window; it
   never touches actual audio playback.
   ========================================================================== */

const PiP = {
  video: null,
  canvas: null,
  ctx: null,
  stream: null,
  isSupported: false,
  isActive: false,
  currentTrack: null,
  isPlaying: false,
  visualizerRafId: null, // separate loop, only ever running while the PiP window is open

  init() {
    this.video = document.getElementById('pip-video');
    this.canvas = document.getElementById('pip-canvas');
    const btn = document.getElementById('pip-toggle-btn');
    if (!this.video || !this.canvas || !btn) return;

    this.ctx = this.canvas.getContext('2d');

    this.isSupported = !!(
      document.pictureInPictureEnabled &&
      this.video.requestPictureInPicture &&
      this.canvas.captureStream
    );

    if (!this.isSupported) {
      // Most likely cause on this app: WebKitGTK (Linux) has inconsistent
      // PiP support. Hide the control rather than let it fail silently.
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => this.toggle());

    this.video.addEventListener('enterpictureinpicture', () => {
      this.isActive = true;
      btn.dataset.active = 'true';
      btn.style.color = 'var(--primary, #1db954)';
      btn.title = 'Picture-in-Picture: On';

      // Pick up whatever's live right now: the visualizer if it's toggled
      // on, otherwise the thumbnail.
      if (typeof Visualizer !== 'undefined' && Visualizer.isActive) {
        this.startVisualizerLoop();
      } else {
        this.drawFrame();
      }
    });

    this.video.addEventListener('leavepictureinpicture', () => {
      this.isActive = false;
      btn.dataset.active = 'false';
      btn.style.color = 'var(--text-muted, #8e8e99)';
      btn.title = 'Picture-in-Picture';

      // Nothing is visible anymore — stop the moment the window closes so
      // there's no loop running for a PiP window nobody can see.
      this.stopVisualizerLoop();
    });

    this.drawFrame(); // seed a first frame so PiP never opens on a blank canvas
  },

  async toggle() {
    if (!this.isSupported) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      if (!this.stream) {
        // No fps argument = "capture a new frame whenever the canvas is
        // redrawn" — we redraw on track/play-state change only, so this
        // costs nothing while idle in PiP.
        this.stream = this.canvas.captureStream();
        this.video.srcObject = this.stream;
      }

      this.drawFrame();
      await this.video.play();
      await this.video.requestPictureInPicture();
    } catch (err) {
      console.warn('Picture-in-Picture unavailable:', err);
      if (typeof Helpers !== 'undefined' && Helpers.showToast) {
        Helpers.showToast('Picture-in-Picture is not available on this system.', 'error');
      }
    }
  },

  /** Call whenever a new track starts (hooked from UI.updateNowPlaying). */
  updateNowPlaying(track) {
    this.currentTrack = track;
    // If the visualizer is currently driving the PiP window, its own rAF
    // loop will pick up the new track's art the next time it falls back to
    // the thumbnail — no need to fight it with a redraw here.
    if (!this.isShowingVisualizer()) this.drawFrame();
  },

  /** Call whenever play/pause state changes (hooked from UI.updatePlayState). */
  updatePlayState(isPlaying) {
    this.isPlaying = isPlaying;
    
    // Sync the silent video's state with the actual audio state
    if (this.video) {
      if (isPlaying && this.video.paused) {
        this.video.play().catch(() => {});
      } else if (!isPlaying && !this.video.paused) {
        this.video.pause();
      }
    }

    if (!this.isShowingVisualizer()) this.drawFrame();
  },

  isShowingVisualizer() {
    return this.isActive && typeof Visualizer !== 'undefined' && Visualizer.isActive;
  },

  /**
   * Starts a dedicated rAF loop that renders Visualizer's current style
   * straight into the PiP canvas. Only ever runs while the PiP window is
   * open (isActive) — closing the window or switching the visualizer off
   * stops it immediately, same "nothing runs unseen" rule as Visualizer.js.
   */
  startVisualizerLoop() {
    this.stopVisualizerLoop();

    const loop = () => {
      if (!this.isActive) {
        this.visualizerRafId = null;
        return;
      }
      if (typeof Visualizer === 'undefined' || !Visualizer.isActive || !Visualizer.isSupported) {
        // Visualizer was switched off (or vanished) while PiP stayed open —
        // hand the window back to the static thumbnail.
        this.stopVisualizerLoop();
        this.drawFrame();
        return;
      }
      Visualizer.renderStyle(this.ctx, this.canvas.width, this.canvas.height);
      this.visualizerRafId = requestAnimationFrame(loop);
    };

    this.visualizerRafId = requestAnimationFrame(loop);
  },

  stopVisualizerLoop() {
    if (this.visualizerRafId !== null) {
      cancelAnimationFrame(this.visualizerRafId);
      this.visualizerRafId = null;
    }
  },

  /**
   * Called by Visualizer.start()/stop() so an already-open PiP window
   * switches live between the visualizer and the thumbnail. A no-op
   * whenever PiP isn't currently open — nothing to switch.
   */
  onVisualizerToggle(isVisualizerActive) {
    if (!this.isActive) return;
    if (isVisualizerActive) this.startVisualizerLoop();
    else {
      this.stopVisualizerLoop();
      this.drawFrame();
    }
  },

  drawFrame() {
    if (!this.ctx || !this.canvas) return;
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const track = this.currentTrack;

    const paintTextAndStatus = () => {
      const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 30px Inter, sans-serif';
      ctx.fillText(this.truncate(track ? (track.title || 'Unknown Title') : 'Nothing playing', 28), 24, h - 58);

      if (track) {
        ctx.fillStyle = '#d4d4dc';
        ctx.font = '400 22px Inter, sans-serif';
        ctx.fillText(this.truncate(track.artist || 'Unknown Artist', 34), 24, h - 24);
      }

      // Small decorative play/pause status dot.
      ctx.beginPath();
      ctx.fillStyle = this.isPlaying ? '#1db954' : '#8e8e99';
      ctx.arc(w - 30, h - 30, 7, 0, Math.PI * 2);
      ctx.fill();
    };

    if (track && track.artUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.fillStyle = '#121214';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        paintTextAndStatus();
      };
      img.onerror = () => {
        this.paintFallbackBackground();
        paintTextAndStatus();
      };
      img.src = track.artUrl;
    } else {
      this.paintFallbackBackground();
      paintTextAndStatus();
    }
  },

  paintFallbackBackground() {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#17171b';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.8);
    grad.addColorStop(0, 'rgba(29,185,84,0.30)');
    grad.addColorStop(1, 'rgba(29,185,84,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  truncate(str, max) {
    return str && str.length > max ? str.slice(0, max - 1) + '…' : (str || '');
  }
};