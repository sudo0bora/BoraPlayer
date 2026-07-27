/* ==========================================================================
   Helper Utilities
   General-purpose utility functions for time, DOM manipulation, performance, 
   toasts, and custom modals.
   ========================================================================== */

const Helpers = {
  /**
   * Formats seconds into MM:SS or H:MM:SS string.
   * @param {number} seconds - Duration in seconds.
   * @returns {string} Formatted time string (e.g., "3:45" or "1:12:05").
   */
  formatTime(seconds) {
    if (isNaN(seconds) || seconds === null || seconds === undefined || seconds < 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;

    if (hrs > 0) {
      const formattedMins = mins < 10 ? `0${mins}` : `${mins}`;
      return `${hrs}:${formattedMins}:${formattedSecs}`;
    }

    return `${mins}:${formattedSecs}`;
  },

  /**
   * Converts bytes into human-readable file size strings.
   * @param {number} bytes - Size in bytes.
   * @returns {string} Formatted size string (e.g., "4.2 MB").
   */
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  /**
   * Sanitizes strings to prevent XSS attacks when displaying metadata.
   * @param {string} str - Raw input text.
   * @returns {string} HTML-escaped string.
   */
  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Lightweight helper to dynamically construct DOM elements without innerHTML.
   * @param {string} tag - HTML tag name.
   * @param {Object} [props={}] - Properties/attributes to set.
   * @param {Array<HTMLElement|string>} [children=[]] - Array of child elements or text node strings.
   * @returns {HTMLElement} Created DOM element.
   */
  createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);

    Object.entries(props).forEach(([key, value]) => {
      if (key === 'className') {
        el.className = value;
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        el.setAttribute(key, value);
      }
    });

    children.forEach((child) => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof HTMLElement) {
        el.appendChild(child);
      }
    });

    return el;
  },

  /**
   * Debounces execution of a function.
   * @param {Function} func - Function to execute.
   * @param {number} delay - Delay in milliseconds.
   * @returns {Function} Debounced function wrapper.
   */
  debounce(func, delay = 200) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  },

  /**
   * Displays a toast notification in the corner of the screen.
   * @param {string} message - Message text.
   * @param {string} [type='info'] - 'info', 'success', or 'error'.
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * Custom Promise-based prompt modal to replace window.prompt.
   * @param {string} title - Title for the modal header.
   * @param {string} placeholder - Input placeholder text.
   * @returns {Promise<string|null>} Entered string or null if canceled.
   */
  promptModal(title, placeholder = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('input-modal');
      const titleEl = document.getElementById('input-modal-title');
      const field = document.getElementById('input-modal-field');
      const confirmBtn = document.getElementById('input-modal-confirm');
      const cancelBtn = document.getElementById('input-modal-cancel');

      if (!modal) { resolve(null); return; }

      titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> ${title}`;
      field.value = '';
      field.placeholder = placeholder;
      modal.classList.remove('hidden');
      field.focus();

      const cleanup = () => {
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        modal.classList.add('hidden');
      };

      confirmBtn.onclick = () => {
        const val = field.value.trim();
        cleanup();
        resolve(val || null);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
    });
  },

  /**
   * Custom Promise-based confirmation modal to replace window.confirm.
   * @param {string} title - Title for the modal.
   * @param {string} message - Confirmation message body.
   * @returns {Promise<boolean>} True if confirmed, false if canceled.
   */
  confirmModal(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const msgEl = document.getElementById('confirm-modal-message');
      const okBtn = document.getElementById('confirm-modal-ok');
      const cancelBtn = document.getElementById('confirm-modal-cancel');

      if (!modal) { resolve(false); return; }

      titleEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${title}`;
      msgEl.textContent = message;
      modal.classList.remove('hidden');

      const cleanup = () => {
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modal.classList.add('hidden');
      };

      okBtn.onclick = () => {
        cleanup();
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }
};