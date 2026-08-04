/* ==========================================================================
   Audio Engine Module
   ========================================================================== */

const AudioEngine = {
  audio: new Audio(),
  repeatMode: 0, // 0: Off, 1: Repeat All, 2: Repeat One
  lastPosition: 0, // Tracks position for play time accumulation

  init() {
    // 1. Time Tracker & Progress Bar Update
    this.audio.addEventListener('timeupdate', () => {
      if (!this.audio.paused && !this.audio.seeking) {
        const delta = this.audio.currentTime - this.lastPosition;
        // Only accumulate smooth playback (ignores scrubbing and skips)
        if (delta > 0 && delta < 1.5) {
          if (typeof Playlist !== 'undefined' && Playlist.addPlayTime) {
            Playlist.addPlayTime(delta);
          }
        }
      }
      this.lastPosition = this.audio.currentTime;
      UI.updateProgress();

      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        if (this.audio.duration && !isNaN(this.audio.duration)) {
          try {
            navigator.mediaSession.setPositionState({
              duration: this.audio.duration,
              playbackRate: this.audio.playbackRate,
              position: this.audio.currentTime
            });
          } catch (e) {
            // Ignore transient errors (e.g. position briefly out of range during track swaps).
          }
        }
      }
    });

    // Reset reference position during manual seeking/scrubbing
    this.audio.addEventListener('seeking', () => {
      this.lastPosition = this.audio.currentTime;
    });

    // Handle track completion
    this.audio.addEventListener('ended', () => this.handleTrackEnd());

    // OS-level media controls (lock screen, hardware/Bluetooth keys, notification widgets)
    this.initMediaSession();
  },

  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    // Per spec, setActionHandler() throws a TypeError for any action the platform
    // doesn't support. WebKitGTK's Media Session support is partial/inconsistent,
    // so every handler is wrapped individually — one unsupported action must not
    // take down the rest of app init (or the whole app, since this runs at startup).
    const safeSetHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {
        // Unsupported action on this platform; safe to ignore.
      }
    };

    safeSetHandler('play', () => this.togglePlay());
    safeSetHandler('pause', () => this.togglePlay());
    safeSetHandler('previoustrack', () => this.playPrevious());
    safeSetHandler('nexttrack', () => this.playNext());

    safeSetHandler('seekto', (details) => {
      if (details.fastSeek && 'fastSeek' in this.audio) {
        this.audio.fastSeek(details.seekTime);
        return;
      }
      this.audio.currentTime = details.seekTime;
      this.lastPosition = details.seekTime;
    });

    safeSetHandler('stop', () => {
      this.audio.pause();
      this.audio.currentTime = 0;
      UI.updatePlayState(false);
    });
  },

  updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    // This previously threw uncaught on platforms with partial Media Session support
    // (notably WebKitGTK on Linux), which happens BEFORE audio.play() is ever called
    // in loadAndPlay() below — so a track would silently fail to start every time.
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        artwork: track.artUrl ? [
          { src: track.artUrl, sizes: '512x512', type: 'image/png' }
        ] : []
      });
    } catch (e) {
      console.warn('Media Session metadata not supported on this platform:', e);
    }
  },

  loadAndPlay(track) {
    if (!track || !track.src) return;

    this.audio.pause();
    this.audio.src = track.src;
    this.audio.load();
    this.lastPosition = 0; // Reset tracking position for new song

    this.updateMediaSessionMetadata(track);

    this.audio.play()
      .then(() => {
        // NO PLAY COUNT INCREMENT HERE -> Prevents click-spamming play counts
        UI.updatePlayState(true);
        UI.updateNowPlaying(track);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
        
        // FIX: Re-render the UI so the ".playing" highlight class moves to the active track
        if (typeof UI !== 'undefined') {
          UI.renderPlaylist(Playlist.currentQueue);
          UI.renderQueuePanel();
        }
      })
      .catch((err) => {
        console.error("Playback failed:", err);
        UI.updatePlayState(false);
      });
  },

  togglePlay() {
    if (!this.audio.src && Playlist.currentQueue.length > 0) {
      const track = Playlist.selectTrack(0);
      if (track) this.loadAndPlay(track);
      return;
    }
    if (!this.audio.src) return;

    if (this.audio.paused) {
      this.audio.play()
        .then(() => {
          UI.updatePlayState(true);
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        })
        .catch((err) => console.error("Play failed:", err));
    } else {
      this.audio.pause();
      UI.updatePlayState(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  },

  playNext() {
    const wrapAround = (this.repeatMode === 1);
    const nextTrack = Playlist.getNextTrack(wrapAround);

    if (nextTrack) {
      this.loadAndPlay(nextTrack);
    } else {
      this.audio.pause();
      this.audio.currentTime = 0;
      UI.updatePlayState(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  },

  playPrevious() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const wrapAround = (this.repeatMode === 1);
    const prevTrack = Playlist.getPrevTrack(wrapAround);
    if (prevTrack) {
      this.loadAndPlay(prevTrack);
    } else {
      // Already at the first track with nothing to wrap to; restart it rather
      // than silently doing nothing.
      this.audio.currentTime = 0;
      this.lastPosition = 0;
    }
  },

  handleTrackEnd() {
    // 2. Play Count Increments ONLY when a song naturally reaches the end
    const currentTrack = Playlist.currentQueue[Playlist.currentIndex];
    if (currentTrack) {
      currentTrack.playCount = (currentTrack.playCount || 0) + 1;

      if (Playlist.updateTrackStats) {
        Playlist.updateTrackStats(currentTrack.id, { playCount: currentTrack.playCount });
      } else if (Playlist.incrementPlayCount) {
        Playlist.incrementPlayCount(currentTrack.id);
      }

      UI.renderPlaylist(Playlist.currentQueue);
    }

    if (this.repeatMode === 2) {
      this.audio.currentTime = 0;
      this.audio.play();
    } else {
      this.playNext();
    }
  },

  setVolume(value) {
    this.audio.volume = value;
    if (value > 0) this.audio.muted = false;
    UI.updateVolumeIcon(this.audio.muted, value);
  },

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    UI.updateVolumeIcon(this.audio.muted, this.audio.volume);
  },

  seek(percent) {
    if (this.audio.duration && !isNaN(this.audio.duration)) {
      const newTime = (percent / 100) * this.audio.duration;
      this.audio.currentTime = newTime;
      this.lastPosition = newTime; // Keep tracking sync after manual seek
    }
  },

  toggleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    UI.updateRepeatUI(this.repeatMode);
  }
};