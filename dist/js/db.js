/* ==========================================================================
   IndexedDB Storage Module
   ========================================================================== */

const DB = {
  db: null,

  init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('BoraMusicDB', 1);
      
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('tracks')) {
          database.createObjectStore('tracks', { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      req.onerror = () => reject('Failed to initialize database.');
    });
  },

  async saveTrack(track) {
    return new Promise((resolve) => {
      if (!this.db) { resolve(); return; }
      const tx = this.db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(track);
      tx.oncomplete = resolve;
    });
  },

  async deleteTrack(trackId) {
    return new Promise((resolve) => {
      if (!this.db) { resolve(); return; }
      const tx = this.db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').delete(trackId);
      tx.oncomplete = resolve;
    });
  },

  async getAllTracks() {
    return new Promise((resolve) => {
      if (!this.db) { resolve([]); return; }
      const tx = this.db.transaction('tracks', 'readonly');
      const req = tx.objectStore('tracks').getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  }
};