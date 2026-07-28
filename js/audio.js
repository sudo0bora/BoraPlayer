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
    });

    // Reset reference position during manual seeking/scrubbing
    this.audio.addEventListener('seeking', () => {
      this.lastPosition = this.audio.currentTime;
    });

    // Handle track completion
    this.audio.addEventListener('ended', () => this.handleTrackEnd());
  },

  loadAndPlay(track) {
    if (!track || !track.src) return;

    this.audio.pause();
    this.audio.src = track.src;
    this.audio.load();
    this.lastPosition = 0; // Reset tracking position for new song

    this.audio.play()
      .then(() => {
        // NO PLAY COUNT INCREMENT HERE -> Prevents click-spamming play counts
        UI.updatePlayState(true);
        UI.updateNowPlaying(track);
        
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
        .then(() => UI.updatePlayState(true))
        .catch((err) => console.error("Play failed:", err));
    } else {
      this.audio.pause();
      UI.updatePlayState(false);
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
    }
  },

  playPrevious() {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const prevTrack = Playlist.getPrevTrack();
    if (prevTrack) {
      this.loadAndPlay(prevTrack);
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