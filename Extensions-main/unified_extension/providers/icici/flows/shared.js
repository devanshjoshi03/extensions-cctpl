/**
 * Shared utilities for ICICI Lombard Insurance flows
 * Loaded first via manifest content_scripts load order.
 */

// ─── SPINNER / LOADING GUARD ─────────────────────────────────────────────────
// ICICI shows <div class="spinner"> while pages load; block all actions until gone.

const SPINNER_SELECTOR = 'div.spinner';
const ICICI_AUTOMATION_STORAGE_KEY = 'iciciAutomation';

async function getIciciAutomationState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(ICICI_AUTOMATION_STORAGE_KEY, (result) => {
        resolve(result?.[ICICI_AUTOMATION_STORAGE_KEY] || null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

function waitForIciciAutomationChange(timeoutMs = 50) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      chrome.storage.onChanged.removeListener(onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = (changes, area) => {
      if (area === 'local' && changes?.[ICICI_AUTOMATION_STORAGE_KEY]) done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.storage.onChanged.addListener(onChange);
  });
}

async function waitForIciciAutomationReady() {
  while (true) {
    const state = await getIciciAutomationState();
    if (state?.isStopped) throw new Error('Automation stopped');
    if (!state?.isPaused) return state;
    await waitForIciciAutomationChange();
  }
}

function isElementVisible(el) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return el.offsetParent !== null || style.position === 'fixed';
}

function isSpinnerVisible() {
  const spinners = document.querySelectorAll(SPINNER_SELECTOR);
  for (const el of spinners) {
    if (isElementVisible(el)) return true;
  }
  return false;
}

function waitForSpinnerToFinish(timeoutMs = 120000, onWaiting) {
  if (!isSpinnerVisible()) return Promise.resolve(true);

  const start = Date.now();
  let notified = false;

  return new Promise((resolve) => {
    const check = async () => {
      try {
        await waitForIciciAutomationReady();
      } catch (_) {
        resolve(false);
        return;
      }
      if (!isSpinnerVisible()) {
        resolve(true);
        return;
      }
      if (!notified && typeof onWaiting === 'function') {
        notified = true;
        onWaiting();
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 150);
    };
    void check();
  });
}

async function beforeUiAction() {
  await waitForSpinnerToFinish();
}

// ─── BASIC HELPERS ───────────────────────────────────────────────────────────

async function wait(ms) {
  const deadline = Date.now() + Math.max(0, Number(ms) || 0);
  while (Date.now() < deadline) {
    await waitForIciciAutomationReady();
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, deadline - Date.now()))));
  }
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

async function clickElement(el) {
  if (!el) return false;
  await beforeUiAction();
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

async function clickElementNoScroll(el) {
  if (!el) return false;
  await beforeUiAction();

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

async function fillInput(el, value) {
  if (!el) return false;
  await beforeUiAction();
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

async function fillAngularInput(selector, value) {
  const input = document.querySelector(selector);
  if (!input) return false;

  await fillInput(input, value);
  
  // Trigger Angular change detection
  try {
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch (_) {}
  
  return true;
}

// ─── WAIT & POLL HELPERS ─────────────────────────────────────────────────────

function waitForElement(selector, timeout = 10000, parent = document) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (isSpinnerVisible()) {
        await waitForSpinnerToFinish(timeout - (Date.now() - start));
      }
      const el = parent.querySelector(selector);
      if (el && el.offsetParent !== null && !isSpinnerVisible()) {
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

function waitForElementVisible(selector, timeout = 10000) {
  return waitForElement(selector, timeout);
}

/**
 * Wait until no spinner is visible and isReadyFn() returns true.
 */
function waitForPageReady(isReadyFn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const pollMs = options.pollMs ?? 300;
  const onSpinnerWait = options.onSpinnerWait;
  const start = Date.now();
  let spinnerLogged = false;

  return new Promise((resolve) => {
    const tick = () => {
      if (isSpinnerVisible()) {
        if (!spinnerLogged && typeof onSpinnerWait === 'function') {
          spinnerLogged = true;
          onSpinnerWait();
        }
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 150);
        return;
      }
      spinnerLogged = false;
      try {
        if (isReadyFn()) return resolve(true);
      } catch (_) {}
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, pollMs);
    };
    tick();
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
  getAngularElement,
  isSpinnerVisible,
  waitForSpinnerToFinish,
  waitForPageReady,
  beforeUiAction,
};
