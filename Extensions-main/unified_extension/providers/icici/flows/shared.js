/**
 * Shared utilities for ICICI Lombard Insurance flows
 * Loaded first via manifest content_scripts load order.
 */

// ─── BASIC HELPERS ───────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function qs(selector, root) {
  return (root || document).querySelector(selector);
}

function highlightElement(el, color = '#4CAF50', duration = 2000) {
  if (!el) return;
  const orig = { outline: el.style.outline, boxShadow: el.style.boxShadow };
  el.style.outline = `3px solid ${color}`;
  el.style.boxShadow = `0 0 12px ${color}80`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    el.style.outline = orig.outline;
    el.style.boxShadow = orig.boxShadow;
  }, duration);
}

function clickElement(el) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') {
    el.focus({ preventScroll: true });
  }
  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  return true;
}

function clickElementNoScroll(el) {
  if (!el) return false;

  try {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}
  try {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
  }

  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  try {
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}
  try {
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  return true;
}

function fillInput(el, value) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  el.value = '';
  
  for (let char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  return true;
}

function waitForSwalToClose(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const popup = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (!popup || popup.offsetParent === null) { resolve(true); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 150);
    };
    check();
  });
}

// ─── ANGULAR-SPECIFIC HELPERS ────────────────────────────────────────────────

function getAngularElement(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  
  try {
    const ng = window.ng;
    if (ng && ng.probe) {
      return ng.probe(el).componentInstance;
    }
  } catch (_) {}
  
  return el;
}

function fillAngularInput(selector, value) {
  const input = document.querySelector(selector);
  if (!input) return false;
  
  fillInput(input, value);
  
  // Trigger Angular change detection
  try {
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch (_) {}
  
  return true;
}

// ─── WAIT & POLL HELPERS ─────────────────────────────────────────────────────

function waitForElementVisible(selector, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        return resolve(el);
      }
      if (Date.now() - start > timeout) {
        return reject(new Error(`Element not visible: ${selector}`));
      }
      setTimeout(check, 200);
    };
    check();
  });
}

function waitForUrlChange(targetUrl, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.location.href.includes(targetUrl)) {
        return resolve(true);
      }
      if (Date.now() - start > timeout) {
        return reject(new Error(`URL did not change to: ${targetUrl}`));
      }
      setTimeout(check, 300);
    };
    check();
  });
}

// Make utilities available globally for flow modules
window.flowUtils = {
  wait,
  qs,
  highlightElement,
  clickElement,
  clickElementNoScroll,
  fillInput,
  fillAngularInput,
  waitForElement,
  waitForElementVisible,
  waitForUrlChange,
  waitForSwalToClose,
  getAngularElement
};
