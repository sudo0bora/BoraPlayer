/* ==========================================================================
   Main Application Entry Point (App Glue)
   ========================================================================== */

const App = {
  activeContextTrackId: null,

  async init() {
    console.log('⚡ Initializing Bora Player...');
    
    await DB.init();
    await Playlist.loadSavedData();

    UI.init();
    AudioEngine.init();
    Library.init();
    Visualizer.init();
    PiP.init();

    this.bindControlEvents();
    this.bindViewEvents();
    this.bindMenuAndModalEvents();
    this.bindSettingsAndQueueEvents();
    this.bindKeyboardShortcuts();

    if (Playlist.masterLibrary.length === 0) {
      await this.loadDefaultPlaylist();
    } else {
      Playlist.switchContext('library');
      UI.renderPlaylist(Playlist.currentQueue);
    }

    UI.updateRepeatUI(AudioEngine.repeatMode);
  },

  bindControlEvents() {
    document.getElementById('play-btn').addEventListener('click', () => AudioEngine.togglePlay());
    document.getElementById('next-btn').addEventListener('click', () => AudioEngine.playNext());
    document.getElementById('prev-btn').addEventListener('click', () => AudioEngine.playPrevious());
    document.getElementById('repeat-btn').addEventListener('click', () => AudioEngine.toggleRepeat());
    document.getElementById('mute-btn').addEventListener('click', () => AudioEngine.toggleMute());

    document.getElementById('seek-bar').addEventListener('input', (e) => {
      AudioEngine.seek(e.target.value);
    });
    // --- SHUFFLE BUTTON BINDING ---
  const shuffleBtn = document.getElementById('shuffle-btn');
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      const isShuffle = Playlist.toggleShuffle();
      UI.updateShuffleUI(isShuffle);
      UI.renderPlaylist(Playlist.currentQueue);
      UI.renderQueuePanel();
      Helpers.showToast(isShuffle ? 'Shuffle Enabled' : 'Shuffle Disabled');
    });
  }

    document.getElementById('volume-slider').addEventListener('input', (e) => {
      AudioEngine.setVolume(e.target.value / 100);
    });

    // --- RENAME & DELETE PLAYLIST BUTTONS ---
    const renameBtn = document.getElementById('rename-playlist-btn');
    if (renameBtn) {
      renameBtn.addEventListener('click', async () => {
        const playlistId = Playlist.activeContextId;
        const playlist = Playlist.customPlaylists.find(p => p.id === playlistId);
        if (!playlist) return;

        const newName = await Helpers.promptModal('Rename Playlist', 'New Playlist Name', playlist.name);
        if (newName && newName.trim()) {
          await Playlist.renamePlaylist(playlistId, newName.trim());
        }
      });
    }

    const deleteBtn = document.getElementById('delete-playlist-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const playlistId = Playlist.activeContextId;
        const playlist = Playlist.customPlaylists.find(p => p.id === playlistId);
        if (!playlist) return;

        const confirmed = await Helpers.confirmModal('Delete Playlist', `Are you sure you want to delete "${playlist.name}"?`);
        if (confirmed) {
          await Playlist.deletePlaylist(playlistId);
          UI.renderPlaylist(Playlist.currentQueue);
        }
      });
    }

    const playlistContent = document.getElementById('playlist-content');
    if (playlistContent) {
      playlistContent.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.track-row');
        if (row) {
          const index = parseInt(row.dataset.index, 10);
          const track = Playlist.selectTrack(index);
          if (track) {
            AudioEngine.loadAndPlay(track);
            UI.renderPlaylist(Playlist.currentQueue);
          }
        }
      });

      playlistContent.addEventListener('click', (e) => {
        if (e.target.classList.contains('favorite-icon')) {
          const row = e.target.closest('.track-row');
          if (row) {
            const trackId = row.dataset.id;
            const track = Playlist.masterLibrary.find(t => t.id === trackId);
            if (track) {
              Playlist.updateTrack(trackId, { favorite: !track.favorite });
              UI.renderPlaylist(Playlist.currentQueue);
              Helpers.showToast(track.favorite ? 'Removed from Favorites' : 'Added to Favorites');
            }
          }
        }

        const plCard = e.target.closest('.playlist-card');
        if (plCard) {
          const plId = plCard.dataset.playlistId;
          const pl = Playlist.customPlaylists.find(p => p.id === plId);
          if (pl) {
            document.getElementById('view-title').textContent = pl.name;
            // '.playlist-header' is `display: grid` with fixed column
            // tracks (see player.css) — setting 'flex' here overrode that
            // and collapsed the Title/Artist/Album/Plays columns together.
            document.getElementById('track-headers').style.display = 'grid';
            Playlist.switchContext(plId);
            UI.updateHeaderActions(plId);
            UI.renderPlaylist(Playlist.currentQueue);
            UI.updateRepeatUI(AudioEngine.repeatMode);
          }
        }
      });
    }
  },

  bindViewEvents() {
    const navLinks = document.querySelectorAll('#nav-links li');
    const trackHeaders = document.getElementById('track-headers');
    const viewTitle = document.getElementById('view-title');
    const addPlaylistBtn = document.getElementById('add-playlist-btn');

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        navLinks.forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const view = e.currentTarget.dataset.view;
        if (view === 'library') {
          viewTitle.textContent = "Library";
          // Same fix as above: this must be 'grid' to match .playlist-header's
          // CSS, or the header columns collapse together.
          trackHeaders.style.display = "grid";
          if (addPlaylistBtn) addPlaylistBtn.style.display = "none";
          Playlist.switchContext('library');
          UI.updateHeaderActions('library');
          UI.renderPlaylist(Playlist.currentQueue);
          UI.updateRepeatUI(AudioEngine.repeatMode);
        } else if (view === 'playlists') {
          viewTitle.textContent = "Playlists";
          trackHeaders.style.display = "none";
          if (addPlaylistBtn) addPlaylistBtn.style.display = "inline-block";
          UI.updateHeaderActions('playlists');
          UI.renderPlaylistsView(Playlist.customPlaylists);
        }
      });
    });

    if (addPlaylistBtn) {
      addPlaylistBtn.addEventListener('click', async () => {
        const name = await Helpers.promptModal('Create New Playlist', 'Playlist Name');
        if (name) {
          Playlist.createPlaylist(name);
          UI.renderPlaylistsView(Playlist.customPlaylists);
          Helpers.showToast(`Playlist "${name}" created!`, 'success');
        }
      });
    }
  },

  bindMenuAndModalEvents() {
    const menu = document.getElementById('track-context-menu');
    const editModal = document.getElementById('edit-modal');
    const addModal = document.getElementById('add-playlist-modal');
    const removeFromPlaylistMenu = document.getElementById('menu-remove-from-playlist');
    let currentEditId = null;

    document.addEventListener('click', (e) => {
      if (e.target.closest('.more-btn')) {
        e.stopPropagation();
        const btn = e.target.closest('.more-btn');
        const row = btn.closest('.track-row');
        this.activeContextTrackId = row.dataset.id;

        // Show/Hide "Remove from Playlist" option depending on whether we are inside a custom playlist
        if (removeFromPlaylistMenu) {
          const isCustomPlaylist = Playlist.activeContextId !== 'library' && Playlist.customPlaylists.some(p => p.id === Playlist.activeContextId);
          removeFromPlaylistMenu.style.display = isCustomPlaylist ? 'flex' : 'none';
        }

        // Reveal first so offsetWidth reflects its real (possibly variable) size,
        // e.g. when "Remove from Playlist" is shown/hidden above.
        menu.classList.remove('hidden');

        const rect = btn.getBoundingClientRect();
        const menuWidth = menu.offsetWidth || 190;
        const margin = 8;

        let left = rect.left - 160;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

        menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        menu.style.left = `${left}px`;
      } else if (!e.target.closest('#track-context-menu')) {
        menu.classList.add('hidden');
      }
    });

    document.getElementById('menu-fav').addEventListener('click', () => {
      if (this.activeContextTrackId) {
        const track = Playlist.masterLibrary.find(t => t.id === this.activeContextTrackId);
        if (track) {
          Playlist.updateTrack(track.id, { favorite: !track.favorite });
          UI.renderPlaylist(Playlist.currentQueue);
        }
      }
      menu.classList.add('hidden');
    });

    document.getElementById('menu-edit').addEventListener('click', () => {
      if (this.activeContextTrackId) {
        const track = Playlist.masterLibrary.find(t => t.id === this.activeContextTrackId);
        if (track) {
          currentEditId = track.id;
          document.getElementById('edit-title').value = track.title || '';
          document.getElementById('edit-artist').value = track.artist || '';
          document.getElementById('edit-album').value = track.album || '';
          document.getElementById('edit-cover').value = track.artUrl || '';
          editModal.classList.remove('hidden');
        }
      }
      menu.classList.add('hidden');
    });

    document.getElementById('menu-add-playlist').addEventListener('click', () => {
      if (this.activeContextTrackId) {
        const listContainer = document.getElementById('playlist-options');
        listContainer.innerHTML = '';

        const availablePlaylists = Playlist.customPlaylists.filter(p => p.id !== 'favs');
        
        if (availablePlaylists.length === 0) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No custom playlists created yet.</p>';
        } else {
            availablePlaylists.forEach(pl => {
                const btn = document.createElement('button');
                btn.className = 'playlist-option-btn';
                btn.textContent = pl.name;
                btn.onclick = () => {
                    Playlist.addToPlaylist(pl.id, this.activeContextTrackId);
                    addModal.classList.add('hidden');
                    Helpers.showToast(`Added to "${pl.name}"`, 'success');
                };
                listContainer.appendChild(btn);
            });
        }
        addModal.classList.remove('hidden');
      }
      menu.classList.add('hidden');
    });

    if (removeFromPlaylistMenu) {
      removeFromPlaylistMenu.addEventListener('click', async () => {
        if (this.activeContextTrackId && Playlist.activeContextId) {
          await Playlist.removeTrackFromPlaylist(Playlist.activeContextId, this.activeContextTrackId);
          UI.renderPlaylist(Playlist.currentQueue);
        }
        menu.classList.add('hidden');
      });
    }

    document.getElementById('menu-play-next').addEventListener('click', () => {
      if (this.activeContextTrackId) {
        const track = Playlist.masterLibrary.find(t => t.id === this.activeContextTrackId);
        Playlist.addToQueueNext(track);
        Helpers.showToast('Added to play next in queue');
      }
      menu.classList.add('hidden');
    });

    document.getElementById('menu-add-queue').addEventListener('click', () => {
      if (this.activeContextTrackId) {
        const track = Playlist.masterLibrary.find(t => t.id === this.activeContextTrackId);
        Playlist.addToQueueEnd(track);
        Helpers.showToast('Added to end of queue');
      }
      menu.classList.add('hidden');
    });

    document.getElementById('menu-delete').addEventListener('click', async () => {
      if (this.activeContextTrackId) {
        const track = Playlist.masterLibrary.find(t => t.id === this.activeContextTrackId);
        const confirmed = await Helpers.confirmModal('Delete Song', `Are you sure you want to delete "${track.title}"?`);
        if (confirmed) {
          await Playlist.deleteTrackCompletely(this.activeContextTrackId);
          UI.renderPlaylist(Playlist.currentQueue);
          Helpers.showToast('Song deleted successfully', 'success');
        }
      }
      menu.classList.add('hidden');
    });

    document.getElementById('cancel-edit').addEventListener('click', () => editModal.classList.add('hidden'));
    document.getElementById('cancel-add-playlist').addEventListener('click', () => addModal.classList.add('hidden'));

    document.getElementById('save-edit').addEventListener('click', () => {
      if (currentEditId) {
        const newTitle = document.getElementById('edit-title').value.trim();
        const newArtist = document.getElementById('edit-artist').value.trim();
        const newAlbum = document.getElementById('edit-album').value.trim();
        const newCover = document.getElementById('edit-cover').value.trim();

        Playlist.updateTrack(currentEditId, {
          title: newTitle || 'Untitled Track',
          artist: newArtist || 'Unknown Artist',
          album: newAlbum || 'Unknown Album',
          artUrl: newCover
        });

        UI.renderPlaylist(Playlist.currentQueue);
        editModal.classList.add('hidden');
        Helpers.showToast('Track info updated!', 'success');

        if (Playlist.currentIndex >= 0) {
          const currentTrack = Playlist.currentQueue[Playlist.currentIndex];
          if (currentTrack && currentTrack.id === currentEditId) {
            UI.updateNowPlaying(currentTrack);
          }
        }
      }
    });
  },

  bindSettingsAndQueueEvents() {
    const settingsModal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings');
    const queuePanel = document.getElementById('queue-panel');
    const queueToggleBtn = document.getElementById('queue-toggle-btn');
    const closeQueueBtn = document.getElementById('close-queue-btn');

    settingsBtn.addEventListener('click', () => {
      UI.updateSettingsStats();
      settingsModal.classList.remove('hidden');
    });

    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

    queueToggleBtn.addEventListener('click', () => {
      queuePanel.classList.toggle('hidden');
      UI.renderQueuePanel();
    });

    closeQueueBtn.addEventListener('click', () => queuePanel.classList.add('hidden'));

    document.getElementById('export-json-btn').addEventListener('click', () => {
      Playlist.exportJSON();
      Helpers.showToast('JSON backup exported successfully!', 'success');
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
      Playlist.exportCSV();
      Helpers.showToast('CSV library exported successfully!', 'success');
    });

    // --- IMPORT JSON BACKUP HANDLER ---
    const importBtn = document.getElementById('import-json-btn');
    const importInput = document.getElementById('import-file-input');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());

      importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          await Playlist.importJSON(event.target.result);
          importInput.value = ''; // Reset file input
        };
        reader.readAsText(file);
      });
    }
  },

  bindKeyboardShortcuts() {
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    const closeShortcuts = document.getElementById('close-shortcuts');
    const queuePanel = document.getElementById('queue-panel');
    const contextMenu = document.getElementById('track-context-menu');

    if (shortcutsBtn && shortcutsModal) {
      shortcutsBtn.addEventListener('click', () => shortcutsModal.classList.remove('hidden'));
    }
    if (closeShortcuts && shortcutsModal) {
      closeShortcuts.addEventListener('click', () => shortcutsModal.classList.add('hidden'));
    }

    const isTypingContext = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    document.addEventListener('keydown', (e) => {
      // Escape always closes overlays, even while a modal text field is focused
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
        if (queuePanel) queuePanel.classList.add('hidden');
        if (contextMenu) contextMenu.classList.add('hidden');
        return;
      }

      // Don't hijack typing in text fields, or browser/OS key combos (Ctrl/Cmd/Alt)
      if (isTypingContext() || e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          AudioEngine.togglePlay();
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) AudioEngine.playNext();
          else this.nudgeSeek(5);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) AudioEngine.playPrevious();
          else this.nudgeSeek(-5);
          break;

        case 'ArrowUp':
          e.preventDefault();
          this.nudgeVolume(5);
          break;

        case 'ArrowDown':
          e.preventDefault();
          this.nudgeVolume(-5);
          break;

        case 'm':
        case 'M':
          document.getElementById('mute-btn')?.click();
          break;

        case 's':
        case 'S':
          document.getElementById('shuffle-btn')?.click();
          break;

        case 'r':
        case 'R':
          document.getElementById('repeat-btn')?.click();
          break;

        case 'q':
        case 'Q':
          document.getElementById('queue-toggle-btn')?.click();
          break;

        case '?':
          if (shortcutsModal) shortcutsModal.classList.remove('hidden');
          break;
      }
    });
  },

  nudgeSeek(deltaSeconds) {
    const audio = AudioEngine.audio;
    if (!audio.duration || isNaN(audio.duration)) return;
    const newTime = Math.min(Math.max(audio.currentTime + deltaSeconds, 0), audio.duration);
    audio.currentTime = newTime;
    AudioEngine.lastPosition = newTime;
    UI.updateProgress();
  },

  nudgeVolume(deltaPercent) {
    const slider = document.getElementById('volume-slider');
    if (!slider) return;
    const newValue = Math.min(Math.max(parseInt(slider.value, 10) + deltaPercent, 0), 100);
    slider.value = newValue;
    AudioEngine.setVolume(newValue / 100);
  },

  async loadDefaultPlaylist() {
    try {
      const response = await fetch('data/default-playlist.json');
      if (response.ok) {
        const tracks = await response.json();
        Playlist.setLibrary(tracks);
        UI.renderPlaylist(Playlist.currentQueue);
      }
    } catch (error) {
      console.warn('Starting with empty library.');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());