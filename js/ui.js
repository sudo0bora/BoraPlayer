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
      row.tabIndex = 0; // Allows focusing via keyboard
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

    upcoming.forEach((track, idx) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      
      const actualQueueIndex = Playlist.currentIndex + 1 + idx;
      
      // Make item draggable
      item.draggable = true;
      
      // Styling with grab cursor
      item.style.cssText = "padding:8px 10px; background:var(--bg-app); border-radius:6px; font-size:0.9rem; margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:grab; transition: background 0.2s;";
      item.textContent = `${track.title} - ${track.artist}`;
      
      // Hover effect
      item.onmouseenter = () => item.style.backgroundColor = 'var(--bg-surface-active, #34343e)';
      item.onmouseleave = () => item.style.backgroundColor = 'var(--bg-app, #121214)';

      // Click to play
      item.addEventListener('click', () => {
        AudioEngine.playTrack(actualQueueIndex); 
      });

      // --- DRAG AND DROP LOGIC ---
      item.addEventListener('dragstart', (e) => {
        // Store the original queue index of the item being dragged
        e.dataTransfer.setData('text/plain', actualQueueIndex);
        e.dataTransfer.effectAllowed = 'move';
        item.style.opacity = '0.5'; // Ghost effect while dragging
      });

      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        // Clean up any remaining drop indicators
        document.querySelectorAll('.queue-item').forEach(el => el.style.borderTop = '');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        // Visual indicator of where the item will drop (line above the item)
        item.style.borderTop = '2px solid var(--primary, #1db954)';
      });

      item.addEventListener('dragleave', () => {
        item.style.borderTop = ''; // Remove line when leaving
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.style.borderTop = ''; // Remove line
        
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = actualQueueIndex;

        // If it was dropped in a new position
        if (!isNaN(fromIndex) && fromIndex !== toIndex) {
          // 1. Remove the track from its old position
          const movedTrack = Playlist.currentQueue.splice(fromIndex, 1)[0];
          
          // 2. Adjust the drop index (since array shrunk when we removed the item)
          const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
          
          // 3. Insert the track into its new position
          Playlist.currentQueue.splice(insertIndex, 0, movedTrack);
          
          // 4. Re-render the panel to show updated order
          UI.renderQueuePanel();
        }
      });

      queueListEl.appendChild(item);
    });
  },

  updateSettingsStats() {
    const tracksEl = document.getElementById('stat-tracks');
    const playlistsEl = document.getElementById('stat-playlists');
    const favoritesEl = document.getElementById('stat-favorites');
    const playsEl = document.getElementById('stat-plays');
    const hoursEl = document.getElementById('stat-hours');

    if (tracksEl) tracksEl.textContent = Playlist.masterLibrary.length;
    if (playlistsEl) playlistsEl.textContent = Playlist.customPlaylists.length;
    if (favoritesEl) favoritesEl.textContent = Playlist.masterLibrary.filter(t => t.favorite).length;
    if (playsEl) playsEl.textContent = Playlist.masterLibrary.reduce((sum, t) => sum + (t.playCount || 0), 0);
    if (hoursEl) hoursEl.textContent = Playlist.getFormattedPlayTime ? Playlist.getFormattedPlayTime() : '0m';
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

  updateHeaderActions(context) {
    const addFileBtn = document.getElementById('add-file-btn');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const renameBtn = document.getElementById('rename-playlist-btn');
    const deleteBtn = document.getElementById('delete-playlist-btn');

    // Check if context is a custom playlist (not 'library' and not 'favs')
    const isCustomPlaylist = context !== 'library' && Playlist.customPlaylists.some(p => p.id === context);

    if (isCustomPlaylist) {
      if (addFileBtn) addFileBtn.style.display = 'none';
      if (addFolderBtn) addFolderBtn.style.display = 'none';
      if (renameBtn) renameBtn.style.display = 'inline-flex';
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    } else {
      if (addFileBtn) addFileBtn.style.display = 'inline-flex';
      if (addFolderBtn) addFolderBtn.style.display = 'inline-flex';
      if (renameBtn) renameBtn.style.display = 'none';
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
  },

  updateShuffleUI(isShuffle) {
    const btn = document.getElementById('shuffle-btn');
    if (!btn) return;

    btn.dataset.active = isShuffle ? 'true' : 'false';
    if (isShuffle) {
      btn.style.color = 'var(--primary, #1db954)';
      btn.title = 'Shuffle: On';
    } else {
      btn.style.color = 'var(--text-muted, #8e8e99)';
      btn.title = 'Shuffle: Off';
    }
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