(function () {
  'use strict';

  let suppressDownloads = false;
  const blockedBlobUrls = new Set();

  function normalizeUrl(url) {
    try {
      return String(url || '').trim();
    } catch (_) {
      return '';
    }
  }

  function shouldBlockUrl(url) {
    const normalized = normalizeUrl(url);
    if (!suppressDownloads || !normalized) return false;

    const lower = normalized.toLowerCase();
    if (blockedBlobUrls.has(normalized)) return true;
    if (lower.startsWith('blob:') || lower.startsWith('data:application/pdf')) return true;
    if (lower.includes('.pdf')) return true;
    if (lower.includes('quote') || lower.includes('policy') || lower.includes('proposal')) return true;
    if ((lower.includes('royal') || lower.includes('sundaram')) && (lower.includes('print') || lower.includes('document'))) return true;
    return false;
  }

  function reportBlocked(kind, url) {
    window.dispatchEvent(new CustomEvent('royal:download-blocked', {
      detail: { kind, url: normalizeUrl(url) }
    }));
  }

  window.addEventListener('royal:set-download-suppression', (event) => {
    suppressDownloads = Boolean(event.detail && event.detail.enabled);
  });

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (object) {
    const result = originalCreateObjectURL(object);
    if (object && typeof object.type === 'string' && object.type.toLowerCase().includes('pdf')) {
      blockedBlobUrls.add(result);
    }
    return result;
  };

  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function (url) {
    blockedBlobUrls.delete(url);
    return originalRevokeObjectURL(url);
  };

  const originalWindowOpen = window.open;
  window.open = function (url, ...args) {
    if (shouldBlockUrl(url)) {
      reportBlocked('window.open', url);
      return null;
    }
    return originalWindowOpen.call(window, url, ...args);
  };

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (suppressDownloads && (this.hasAttribute('download') || shouldBlockUrl(this.href))) {
      reportBlocked('anchor.click', this.href);
      return;
    }
    return originalAnchorClick.call(this);
  };

  document.addEventListener('click', (event) => {
    if (!suppressDownloads) return;
    const anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!anchor) return;
    if (!anchor.hasAttribute('download') && !shouldBlockUrl(anchor.href)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    reportBlocked('anchor.event', anchor.href);
  }, true);

  if (typeof window.showSaveFilePicker === 'function') {
    const originalShowSaveFilePicker = window.showSaveFilePicker.bind(window);
    window.showSaveFilePicker = function (...args) {
      if (suppressDownloads) {
        reportBlocked('showSaveFilePicker', 'native-dialog');
        return Promise.reject(new DOMException('Blocked by automation', 'AbortError'));
      }
      return originalShowSaveFilePicker(...args);
    };
  }
})();
