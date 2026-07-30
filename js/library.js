/* ==========================================================================
   Library Management Module
   ========================================================================== */

const Library = {
  supportedFormats: ['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const folderInput = document.getElementById('folder-input');
    const fileInput = document.getElementById('file-input');
    const addFolderBtn = document.getElementById('add-folder-btn');
    const addFileBtn = document.getElementById('add-file-btn');
    const mainView = document.getElementById('main-view');

    if (addFolderBtn && folderInput) {
      addFolderBtn.addEventListener('click', () => folderInput.click());
      folderInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    if (addFileBtn && fileInput) {
      addFileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    if (mainView) {
      mainView.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainView.classList.add('drag-active');
      });

      mainView.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainView.classList.remove('drag-active');
      });

      mainView.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainView.classList.remove('drag-active');

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.processFiles(Array.from(e.dataTransfer.files));
        }
      });
    }
  },

  handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    this.processFiles(files);
    event.target.value = '';
  },

  processFiles(files) {
    const audioFiles = files.filter(file => this.isSupportedAudio(file.name));
    if (audioFiles.length === 0) {
      Helpers.showToast('No supported audio files found (.mp3, .flac, .wav, .ogg, .aac, .m4a).', 'error');
      return;
    }

    const newTracks = audioFiles.map((file, index) => this.fileToTrack(file, index));
    Playlist.addTracksToLibrary(newTracks);

    if (Playlist.activeContextId === 'library') {
      UI.renderPlaylist(Playlist.currentQueue);
    }
    Helpers.showToast(`Successfully added ${newTracks.length} song(s)!`, 'success');
  },

  isSupportedAudio(filename) {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return this.supportedFormats.includes(ext);
  },

  fileToTrack(file, index) {
    const parsed = this.parseFilename(file.name);
    return {
      id: `local-${Date.now()}-${index}`,
      title: parsed.title,
      artist: parsed.artist,
      album: 'Local Import',
      genre: 'Unknown',
      year: null,
      src: URL.createObjectURL(file),
      artUrl: '',
      favorite: false,
      playCount: 0,
      fileRef: file
    };
  },

  parseFilename(filename) {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim()
      };
    }
    return {
      artist: 'Unknown Artist',
      title: nameWithoutExt.trim()
    };
  }
};