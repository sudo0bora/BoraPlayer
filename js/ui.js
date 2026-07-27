/* ==========================================================================
   UI Renderer Module
   ========================================================================== */

const UI = {
  init() {},

  renderPlaylist(tracks) {
    const container = document.getElementById('playlist-content');
    if (!container) return;
    container.innerHTML = '';

    if (tracks.length === 0) {
      container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">No songs in this view yet. Add files or folders above!</div>`;
      return;
    }

    tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      if (Playlist.currentIndex === index) row.classList.add('playing');
      row.dataset.index = index;
      row.dataset.id = track.id;

      const favClass = track.favorite ? 'fa-solid fa-heart favorited' : 'fa-regular fa-heart';

      row.innerHTML = `
        <div class="col-title">
          <i class="${favClass} favorite-icon" data-action="fav" title="Toggle Favorite"></i>
          <span class="track-title-text">${Helpers.escapeHTML(track.title)}</span>
        </div>
        <div class="col-artist">${Helpers.escapeHTML(track.artist)}</div>
        <div class="col-album">${Helpers.escapeHTML(track.album || 'Unknown Album')}</div>
        <div class="col-plays">${track.playCount || 0}</div>
        <div class="col-actions">
           <button class="more-btn" title="Track Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>
      `;
      container.appendChild(row);
    });
  },

  renderPlaylistsView(playlists) {
    const container = document.getElementById('playlist-content');
    if (!container) return;
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'playlists-grid';

    playlists.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.dataset.playlistId = pl.id;
      card.innerHTML = `
        <h3>${Helpers.escapeHTML(pl.name)}</h3>
        <p>${pl.trackIds.length} tracks</p>
      `;
      grid.appendChild(card);
    });
    container.appendChild(grid);
  },

  renderQueuePanel() {
    const nowPlayingEl = document.getElementById('queue-now-playing');
    const queueListEl = document.getElementById('queue-list');
    const countEl = document.getElementById('queue-count');

    if (!nowPlayingEl || !queueListEl) return;

    if (Playlist.currentIndex >= 0 && Playlist.currentQueue[Playlist.currentIndex]) {
      const current = Playlist.currentQueue[Playlist.currentIndex];
      nowPlayingEl.innerHTML = `<strong>${Helpers.escapeHTML(current.title)}</strong><br><span style="color:var(--text-muted); font-size:0.85rem;">${Helpers.escapeHTML(current.artist)}</span>`;
    } else {
      nowPlayingEl.innerHTML = `<p class="queue-empty-hint">Nothing playing yet.</p>`;
    }

    queueListEl.innerHTML = '';
    const upcoming = Playlist.currentQueue.slice(Playlist.currentIndex + 1);
    countEl.textContent = `(${upcoming.length})`;

    if (upcoming.length === 0) {
      queueListEl.innerHTML = `<p class="queue-empty-hint">No upcoming tracks.</p>`;
      return;
    }

    upcoming.forEach((track) => {
      const item = document.createElement('div');
      item.style.cssText = "padding:8px 10px; background:var(--bg-app); border-radius:6px; font-size:0.9rem; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      item.textContent = `${track.title} - ${track.artist}`;
      queueListEl.appendChild(item);
    });
  },

  updateSettingsStats() {
    document.getElementById('stat-tracks').textContent = Playlist.masterLibrary.length;
    document.getElementById('stat-playlists').textContent = Playlist.customPlaylists.length;
    document.getElementById('stat-favorites').textContent = Playlist.masterLibrary.filter(t => t.favorite).length;
    document.getElementById('stat-plays').textContent = Playlist.masterLibrary.reduce((sum, t) => sum + (t.playCount || 0), 0);
  },

  updateNowPlaying(track) {
    const nameEl = document.getElementById('current-track-name');
    const artistEl = document.getElementById('current-track-artist');
    const artEl = document.getElementById('current-album-art');

    if (nameEl) nameEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;

    if (artEl) {
      if (track.artUrl) {
        artEl.style.backgroundImage = `url("${track.artUrl}")`;
        artEl.style.backgroundSize = 'cover';
        artEl.style.backgroundPosition = 'center';
        artEl.innerHTML = '';
      } else {
        artEl.style.backgroundImage = 'none';
        artEl.innerHTML = '<i class="fa-solid fa-music"></i>';
      }
    }
  },

  updatePlayState(isPlaying) {
    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
      playBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
  },

  updateProgress() {
    const audio = AudioEngine.audio;
    const current = document.getElementById('time-current');
    const total = document.getElementById('time-total');
    const seek = document.getElementById('seek-bar');

    if (audio.duration && !isNaN(audio.duration)) {
      seek.value = (audio.currentTime / audio.duration) * 100;
      if (current) current.textContent = Helpers.formatTime(audio.currentTime);
      if (total) total.textContent = Helpers.formatTime(audio.duration);
    }
  },

  updateVolumeIcon(isMuted, volumeVal) {
    const muteBtn = document.getElementById('mute-btn');
    if (!muteBtn) return;
    if (isMuted || volumeVal === 0) muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    else if (volumeVal < 0.5) muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    else muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
  },

  updateRepeatUI(mode) {
    const btn = document.getElementById('repeat-btn');
    if (!btn) return;
    btn.dataset.mode = mode;
    btn.style.position = 'relative';

    if (mode === 0) {
      btn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
      btn.style.color = 'var(--text-muted, #8e8e99)';
      btn.title = 'Repeat: Off';
    } else if (mode === 1) {
      btn.innerHTML = '<i class="fa-solid fa-repeat"></i>';
      btn.style.color = 'var(--text-main, #ffffff)';
      btn.title = 'Repeat: All';
    } else if (mode === 2) {
      btn.innerHTML = '<i class="fa-solid fa-repeat"></i><span style="font-size:0.6rem; font-weight:700; position:absolute; bottom:2px; right:2px; background:var(--bg-app, #121214); padding:0 2px; border-radius:3px; color:#fff;">1</span>';
      btn.style.color = 'var(--text-main, #ffffff)';
      btn.title = 'Repeat: One';
    }
  }
};