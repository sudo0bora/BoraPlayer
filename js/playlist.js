/* ==========================================================================
   Playlist State Management Module
   ========================================================================== */

const Playlist = {
  masterLibrary: [],
  customPlaylists: [],
  currentQueue: [],
  currentIndex: -1,
  activeContextId: 'library',

  async loadSavedData() {
    const dbTracks = await DB.getAllTracks();
    this.masterLibrary = dbTracks.map(t => {
      if (t.fileRef) t.src = URL.createObjectURL(t.fileRef);
      return t;
    });

    const savedPls = localStorage.getItem('bora_playlists');
    if (savedPls) {
      this.customPlaylists = JSON.parse(savedPls);
    } else {
      this.customPlaylists = [{ id: 'favs', name: '❤️ My Favorites', trackIds: [] }];
    }
    this.syncFavoritesPlaylist();
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
  }
};