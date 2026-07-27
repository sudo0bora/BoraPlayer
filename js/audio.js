/* ==========================================================================
   Audio Engine Module
   ========================================================================== */

const AudioEngine = {
  audio: new Audio(),
  repeatMode: 0, // 0: Off, 1: Repeat All, 2: Repeat One

  init() {
    this.audio.addEventListener('timeupdate', () => UI.updateProgress());
    this.audio.addEventListener('ended', () => this.handleTrackEnd());
  },

  loadAndPlay(track) {
    if (!track || !track.src) return;

    this.audio.pause();
    this.audio.src = track.src;
    this.audio.load();

    this.audio.play()
      .then(() => {
        track.playCount = (track.playCount || 0) + 1;
        Playlist.updateTrackStats(track.id, { playCount: track.playCount });
        UI.updatePlayState(true);
        UI.updateNowPlaying(track);
        UI.renderPlaylist(Playlist.currentQueue);
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
      this.audio.currentTime = (percent / 100) * this.audio.duration;
    }
  },

  toggleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    UI.updateRepeatUI(this.repeatMode);
  }
};