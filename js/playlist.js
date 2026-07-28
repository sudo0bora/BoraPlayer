/* ==========================================================================
   Playlist State Management Module
   ========================================================================== */

const Playlist = {
  masterLibrary: [],
  customPlaylists: [],
  currentQueue: [],
  originalQueue: [],
  currentIndex: -1,
  activeContextId: 'library',
  isShuffle: false,
  totalPlayTime: 0, // Stored in seconds

  async loadSavedData() {
    // 1. Load Tracks from IndexedDB
    const dbTracks = await DB.getAllTracks();
    this.masterLibrary = dbTracks.map(t => {
      if (t.fileRef) t.src = URL.createObjectURL(t.fileRef);
      return t;
    });

    // 2. Load Playlists from LocalStorage
    const savedPls = localStorage.getItem('bora_playlists');
    if (savedPls) {
      this.customPlaylists = JSON.parse(savedPls);
    } else {
      this.customPlaylists = [{ id: 'favs', name: '❤️ My Favorites', trackIds: [] }];
    }
    this.syncFavoritesPlaylist();

    // 3. Load stored total listening time
    const savedTime = localStorage.getItem('bora_player_total_play_time');
    if (savedTime) {
      this.totalPlayTime = parseFloat(savedTime) || 0;
    }
  },

  savePlaylistsToStorage() {
    localStorage.setItem('bora_playlists', JSON.stringify(this.customPlaylists));
  },

  setLibrary(tracks) {
    this.masterLibrary = tracks;
    tracks.forEach(t => DB.saveTrack(t));
    this.syncFavoritesPlaylist();
    if (this.activeContextId === 'library') this.currentQueue = [...this.masterLibrary];
  },

  addTracksToLibrary(newTracks) {
    newTracks.forEach(t => DB.saveTrack(t));
    this.masterLibrary = [...this.masterLibrary, ...newTracks];
    this.syncFavoritesPlaylist();
    if (this.activeContextId === 'library') this.currentQueue = [...this.masterLibrary];
  },

  /**
   * Called ONLY when a song naturally finishes playing
   */
  async incrementPlayCount(trackId) {
    const track = this.masterLibrary.find(t => t.id === trackId);
    if (track) {
      track.playCount = (track.playCount || 0) + 1;
      if (typeof DB !== 'undefined' && DB.saveTrack) {
        await DB.saveTrack(track);
      }
    }
  },

  /**
   * Accumulates active audio playback duration in seconds
   */
  addPlayTime(seconds) {
    if (isNaN(seconds) || seconds <= 0) return;
    this.totalPlayTime += seconds;
    localStorage.setItem('bora_player_total_play_time', this.totalPlayTime.toString());
  },

  /**
   * Formats total seconds into minutes or hours
   */
  getFormattedPlayTime() {
    const totalMinutes = Math.floor(this.totalPlayTime / 60);
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }
    const hours = (this.totalPlayTime / 3600).toFixed(1);
    return `${hours}h`;
  },
  
  /**
   * Toggles shuffle mode ON or OFF.
   * @returns {boolean} Current shuffle state
   */
  toggleShuffle() {
    this.isShuffle = !this.isShuffle;

    if (this.isShuffle) {
      // 1. Store original queue order
      this.originalQueue = [...this.currentQueue];

      if (this.currentQueue.length > 1) {
        const currentTrack = this.currentQueue[this.currentIndex];

        // Filter out current track so it stays at the top of the shuffled queue
        const remaining = this.currentQueue.filter((_, idx) => idx !== this.currentIndex);

        // Fisher-Yates Shuffle
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }

        // Put current track first, followed by shuffled tracks
        this.currentQueue = currentTrack ? [currentTrack, ...remaining] : remaining;
        this.currentIndex = 0;
      }
    } else {
      // 2. Restore original non-shuffled queue order
      if (this.originalQueue.length > 0) {
        const currentTrack = this.currentQueue[this.currentIndex];
        this.currentQueue = [...this.originalQueue];

        if (currentTrack) {
          const restoredIndex = this.currentQueue.findIndex(t => t.id === currentTrack.id);
          this.currentIndex = restoredIndex !== -1 ? restoredIndex : 0;
        }
      }
    }

    return this.isShuffle;
  },

  async deleteTrackCompletely(trackId) {
    await DB.deleteTrack(trackId);
    this.masterLibrary = this.masterLibrary.filter(t => t.id !== trackId);
    this.customPlaylists.forEach(pl => {
      pl.trackIds = pl.trackIds.filter(id => id !== trackId);
    });
    this.savePlaylistsToStorage();
    this.switchContext(this.activeContextId);
  },

  selectTrack(index) {
    if (index >= 0 && index < this.currentQueue.length) {
      this.currentIndex = index;
      return this.currentQueue[this.currentIndex];
    }
    return null;
  },

  getNextTrack(wrap = false) {
    if (this.currentQueue.length === 0) return null;
    let nextIdx = this.currentIndex + 1;
    if (nextIdx >= this.currentQueue.length) nextIdx = wrap ? 0 : -1;
    if (nextIdx === -1) return null;
    this.currentIndex = nextIdx;
    return this.currentQueue[this.currentIndex];
  },

  getPrevTrack() {
    if (this.currentQueue.length === 0) return null;
    let prevIdx = this.currentIndex - 1;
    if (prevIdx < 0) prevIdx = this.currentQueue.length - 1;
    this.currentIndex = prevIdx;
    return this.currentQueue[this.currentIndex];
  },

  updateTrack(trackId, updates) {
    const track = this.masterLibrary.find(t => t.id === trackId);
    if (track) {
      Object.assign(track, updates);
      DB.saveTrack(track);
      this.syncFavoritesPlaylist();
    }
  },

  updateTrackStats(trackId, updates) {
    const track = this.masterLibrary.find(t => t.id === trackId);
    if (track) {
      Object.assign(track, updates);
      DB.saveTrack(track);
    }
  },

  addToQueueNext(track) {
    if (!track) return;
    const insertIdx = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    this.currentQueue.splice(insertIdx, 0, track);
  },

  addToQueueEnd(track) {
    if (!track) return;
    this.currentQueue.push(track);
  },

  syncFavoritesPlaylist() {
    const favs = this.masterLibrary.filter(t => t.favorite).map(t => t.id);
    const favPlaylist = this.customPlaylists.find(p => p.id === 'favs');
    if (favPlaylist) {
      favPlaylist.trackIds = favs;
      this.savePlaylistsToStorage();
    }
  },

  createPlaylist(name) {
    const newPlaylist = { id: `pl-${Date.now()}`, name: name, trackIds: [] };
    this.customPlaylists.push(newPlaylist);
    this.savePlaylistsToStorage();
    return newPlaylist;
  },

  addToPlaylist(playlistId, trackId) {
    const pl = this.customPlaylists.find(p => p.id === playlistId);
    if (pl && !pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      this.savePlaylistsToStorage();
    }
  },

  switchContext(contextId) {
    this.activeContextId = contextId;
    if (contextId === 'library') {
      this.currentQueue = [...this.masterLibrary];
    } else {
      const pl = this.customPlaylists.find(p => p.id === contextId);
      this.currentQueue = pl ? pl.trackIds.map(id => this.masterLibrary.find(t => t.id === id)).filter(Boolean) : [];
    }
    this.currentIndex = -1;
  },

  exportJSON() {
    const data = {
      library: this.masterLibrary.map(({ fileRef, src, ...rest }) => rest),
      playlists: this.customPlaylists
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bora-player-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  exportCSV() {
    let csv = 'Title,Artist,Album,Plays,Favorite\n';
    this.masterLibrary.forEach(t => {
      csv += `"${t.title || ''}","${t.artist || ''}","${t.album || ''}",${t.playCount || 0},${t.favorite ? 'Yes' : 'No'}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bora-player-library.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  async importJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      
      const importedTracks = data.library || data.tracks || data.masterLibrary || (Array.isArray(data) ? data : []);
      const importedPlaylists = data.playlists || data.customPlaylists || [];

      if (!importedTracks.length && !importedPlaylists.length) {
        Helpers.showToast('No valid track or playlist data found in JSON.', 'error');
        return;
      }

      let addedTracksCount = 0;
      let addedPlaylistsCount = 0;

      // 1. Merge & Save Tracks
      for (const track of importedTracks) {
        if (!track.title) continue;

        const existingIdx = this.masterLibrary.findIndex(
          t => t.id === track.id || (t.title === track.title && t.artist === track.artist)
        );

        if (existingIdx >= 0) {
          this.masterLibrary[existingIdx] = { ...this.masterLibrary[existingIdx], ...track };
          if (typeof DB !== 'undefined' && DB.saveTrack) {
            await DB.saveTrack(this.masterLibrary[existingIdx]);
          }
        } else {
          this.masterLibrary.push(track);
          if (typeof DB !== 'undefined' && DB.saveTrack) {
            await DB.saveTrack(track);
          }
          addedTracksCount++;
        }
      }

      // 2. Merge & Save Custom Playlists
      for (const pl of importedPlaylists) {
        if (!pl.name) continue;

        const existingIdx = this.customPlaylists.findIndex(p => p.id === pl.id || p.name === pl.name);

        if (existingIdx >= 0) {
          this.customPlaylists[existingIdx] = { ...this.customPlaylists[existingIdx], ...pl };
        } else {
          this.customPlaylists.push(pl);
          addedPlaylistsCount++;
        }

        if (typeof DB !== 'undefined' && DB.savePlaylist) {
          await DB.savePlaylist(pl);
        }
      }

      // 3. Refresh Queue and Views using activeContextId
      if (this.activeContextId === 'library') {
        this.currentQueue = [...this.masterLibrary];
      } else {
        this.switchContext(this.activeContextId);
      }
      
      UI.renderPlaylist(this.currentQueue);
      UI.updateSettingsStats();

      Helpers.showToast(`Imported ${addedTracksCount} new song(s) & ${addedPlaylistsCount} playlist(s)!`);
    } catch (err) {
      console.error('Import failed:', err);
      Helpers.showToast('Failed to parse backup JSON file.', 'error');
    }
  },

  async renamePlaylist(playlistId, newName) {
    const playlist = this.customPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    playlist.name = newName;
    this.savePlaylistsToStorage();
    
    if (this.activeContextId === playlistId) {
      const titleEl = document.getElementById('view-title');
      if (titleEl) titleEl.textContent = newName;
    }
    if (typeof UI.renderSidebarPlaylists === 'function') {
      UI.renderSidebarPlaylists();
    }
    Helpers.showToast('Playlist renamed');
  },

  async deletePlaylist(playlistId) {
    this.customPlaylists = this.customPlaylists.filter(p => p.id !== playlistId);
    this.savePlaylistsToStorage();
    if (typeof UI.renderSidebarPlaylists === 'function') {
      UI.renderSidebarPlaylists();
    }
    Helpers.showToast('Playlist deleted');
    this.switchContext('library');
    UI.renderPlaylist(this.currentQueue);
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = this.customPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;

    playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
    this.savePlaylistsToStorage();

    if (this.activeContextId === playlistId) {
      this.switchContext(this.activeContextId);
      UI.renderPlaylist(this.currentQueue);
    }
    Helpers.showToast('Removed from playlist');
  }
};