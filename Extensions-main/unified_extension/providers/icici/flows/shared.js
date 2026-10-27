/**
 * Shared utilities for ICICI Lombard Insurance flows
 * Loaded first via manifest content_scripts load order.
 */

function installCanvasTextCapture() {
  if (window.__iciciCanvasTextCaptureInstalled) return;
  window.__iciciCanvasTextCaptureInstalled = true;
  window.__iciciCanvasTextCaptures = window.__iciciCanvasTextCaptures || [];

  const captureText = (ctx, text) => {
    try {
      const canvas = ctx?.canvas;
      if (!canvas || text == null) return;
      const value = String(text).trim();
      if (!value || value.length > 20) return;
      canvas.dataset.iciciCanvasText = value;
      window.__iciciCanvasTextCaptures.push({
        text: value,
        ts: Date.now(),
        width: canvas.width,
        height: canvas.height,
      });
      if (window.__iciciCanvasTextCaptures.length > 30) {
        window.__iciciCanvasTextCaptures.shift();
      }
    } catch (_) {}
  };

  ['fillText', 'strokeText'].forEach((method) => {
    const original = CanvasRenderingContext2D.prototype[method];
    if (typeof original !== 'function') return;
    CanvasRenderingContext2D.prototype[method] = function patchedCanvasText(text, ...args) {
      captureText(this, text);
      return original.call(this, text, ...args);
    };
  });
}

installCanvasTextCapture();

function wait(ms) {
  const totalMs = Math.max(0, Number(ms) || 0);
  return (async () => {
    let remaining = totalMs;
    while (remaining > 0) {
      if (typeof window.AutomationPauseController !== 'undefined') {
        await window.AutomationPauseController.checkpoint();
      }
      const chunk = Math.min(remaining, 150);
      await new Promise((resolve) => setTimeout(resolve, chunk));
      remaining -= chunk;
    }
  })();
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
  const fieldId = el.id || el.name;
  if (
    fieldId &&
    typeof window.AutomationPauseController !== 'undefined' &&
    window.AutomationPauseController.isFieldProtected(fieldId)
  ) {
    console.log(`[Automation] Skipping protected field: ${fieldId}`);
    return false;
  }

  const nextValue = value == null ? '' : String(value);
  const nativeSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  if (nativeSetter) nativeSetter.call(el, '');
  else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  for (const char of nextValue) {
    const current = String(el.value || '');
    if (nativeSetter) nativeSetter.call(el, current + char);
    else el.value = current + char;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  el.dispatchEvent(new Event('blur', { bubbles: true }));
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
  try {
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch (_) {}
  return true;
}

function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Element not found: ${selector}`));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

function waitForElementVisible(selector, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        resolve(el);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Element not visible: ${selector}`));
        return;
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
        resolve(true);
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`URL did not change to: ${targetUrl}`));
        return;
      }
      setTimeout(check, 300);
    };
    check();
  });
}

const AutomationPauseController = {
  STORAGE_KEY: 'icici_automation_state',

  _defaultState() {
    return {
      isPaused: false,
      isStopped: false,
      isRunning: false,
      currentStep: null,
      completedSteps: [],
      inputSnapshot: {},
      adminEditedFields: [],
      panelDismissed: false,
    };
  },

  getState() {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this._defaultState();
    } catch {
      return this._defaultState();
    }
  },

  _saveState(state) {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  captureInputSnapshot() {
    const snapshot = {};
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      if (el.type === 'radio' || el.type === 'checkbox') {
        snapshot[`${key}__${el.value || ''}`] = el.checked;
      } else {
        snapshot[key] = el.value;
      }
    });
    return snapshot;
  },

  detectAdminEdits(oldSnapshot) {
    const edited = [];
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      const snapshotKey = (el.type === 'radio' || el.type === 'checkbox')
        ? `${key}__${el.value || ''}`
        : key;
      const currentValue = (el.type === 'radio' || el.type === 'checkbox') ? el.checked : el.value;
      if (snapshotKey in oldSnapshot && String(currentValue) !== String(oldSnapshot[snapshotKey])) {
        const fieldId = el.id || el.name;
        if (fieldId) edited.push(fieldId);
      }
    });
    return [...new Set(edited)];
  },

  pause() {
    const state = this.getState();
    state.isPaused = true;
    state.inputSnapshot = this.captureInputSnapshot();
    this._saveState(state);
    this._updateUI();
    console.log('[Automation] PAUSED at:', state.currentStep);
  },

  resume() {
    const state = this.getState();
    if (state.inputSnapshot && Object.keys(state.inputSnapshot).length > 0) {
      const edits = this.detectAdminEdits(state.inputSnapshot);
      if (edits.length > 0) {
        state.adminEditedFields = [...new Set([...(state.adminEditedFields || []), ...edits])];
        console.log('[Automation] Protected fields:', edits.join(', '));
      }
    }
    state.isPaused = false;
    state.inputSnapshot = {};
    this._saveState(state);
    this._updateUI();
    console.log('[Automation] RESUMED from:', state.currentStep);
  },

  stop() {
    const state = this.getState();
    state.isStopped = true;
    state.isPaused = false;
    state.isRunning = false;
    state.currentStep = 'Stopped';
    this._saveState(state);
    this._updateUI();
    console.log('[Automation] STOPPED permanently');
  },

  reset() {
    sessionStorage.removeItem(this.STORAGE_KEY);
    this._updateUI();
  },

  startRun() {
    const fresh = this._defaultState();
    fresh.isRunning = true;
    this._saveState(fresh);
    this._updateUI();
  },

  endRun() {
    const state = this.getState();
    state.isRunning = false;
    state.currentStep = 'Completed';
    this._saveState(state);
    this._updateUI();
  },

  failRun(message) {
    const state = this.getState();
    state.isRunning = false;
    state.currentStep = message || 'Failed';
    this._saveState(state);
    this._updateUI();
  },

  isFieldProtected(fieldIdOrName) {
    if (!fieldIdOrName) return false;
    return (this.getState().adminEditedFields || []).includes(fieldIdOrName);
  },

  async checkpoint(stepLabel) {
    const initial = this.getState();
    if (initial.isStopped) {
      throw new Error('AUTOMATION_STOPPED');
    }
    if (stepLabel) {
      const state = this.getState();
      state.currentStep = stepLabel;
      state.isRunning = true;
      this._saveState(state);
      this._updateUI();
    }
    while (true) {
      const state = this.getState();
      if (state.isStopped) {
        throw new Error('AUTOMATION_STOPPED');
      }
      if (!state.isPaused) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  },

  _updateUI() {
    const panel = document.getElementById('icici-automation-panel');
    if (!panel) return;

    const state = this.getState();
    const badge = document.getElementById('icici-auto-badge');
    const stepEl = document.getElementById('icici-auto-step');
    const pauseBtn = document.getElementById('icici-auto-pause-btn');
    const stopBtn = document.getElementById('icici-auto-stop-btn');
    const protectedEl = document.getElementById('icici-auto-protected');

    if (state.panelDismissed) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'flex';

    if (state.isStopped) {
      badge.textContent = 'STOPPED';
      badge.style.background = '#b71c1c';
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    } else if (!state.isRunning) {
      badge.textContent = 'Idle';
      badge.style.background = '#555';
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    } else if (state.isPaused) {
      badge.textContent = 'Paused';
      badge.style.background = '#ff9800';
      pauseBtn.textContent = 'Resume';
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
    } else {
      badge.textContent = 'Running';
      badge.style.background = '#2d6a4f';
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
    }

    stepEl.textContent = state.currentStep || (state.isRunning ? 'Starting...' : 'Waiting for automation');
    pauseBtn.style.opacity = pauseBtn.disabled ? '0.4' : '1';
    stopBtn.style.opacity = stopBtn.disabled ? '0.4' : '1';
    protectedEl.textContent = (state.adminEditedFields || []).length
      ? `Protected fields: ${state.adminEditedFields.join(', ')}`
      : '';
    protectedEl.style.display = protectedEl.textContent ? 'block' : 'none';
  },

  injectUI() {
    if (document.getElementById('icici-automation-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'icici-automation-panel';
    panel.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #102445; border: 2px solid #2a9fd8; border-radius: 12px;
      padding: 14px 18px; min-width: 260px; max-width: 340px;
      font-family: 'Segoe UI', sans-serif; color: #e0e0e0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex; flex-direction: column; gap: 8px;
    `;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span id="icici-auto-badge" style="background:#555;color:white;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">Idle</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:10px;color:#9fb6d0;">ICICI Auto</span>
          <button id="icici-auto-close-btn" type="button" style="width:24px;height:24px;border:1px solid rgba(255,255,255,0.18);border-radius:999px;background:rgba(255,255,255,0.08);color:#f5f5f5;font-size:12px;font-weight:700;cursor:pointer;">X</button>
        </div>
      </div>
      <div style="font-size:10px;color:#aaa;">Current Step:</div>
      <div id="icici-auto-step" style="font-size:12px;font-weight:600;color:#90caf9;word-break:break-word;">Waiting for automation</div>
      <div id="icici-auto-protected" style="font-size:10px;color:#ffd166;display:none;"></div>
      <div style="display:flex;gap:8px;">
        <button id="icici-auto-pause-btn" style="flex:1;padding:8px 0;border:0;border-radius:8px;background:#ff9800;color:white;font-size:12px;font-weight:700;cursor:pointer;">Pause</button>
        <button id="icici-auto-stop-btn" style="flex:1;padding:8px 0;border:0;border-radius:8px;background:#d32f2f;color:white;font-size:12px;font-weight:700;cursor:pointer;">Stop</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('icici-auto-pause-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      if (state.isPaused) this.resume();
      else this.pause();
    });
    document.getElementById('icici-auto-stop-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      this.stop();
    });
    document.getElementById('icici-auto-close-btn').addEventListener('click', () => {
      const state = this.getState();
      state.panelDismissed = true;
      this._saveState(state);
      panel.style.display = 'none';
    });

    this._updateUI();
  },
};

window.AutomationPauseController = AutomationPauseController;
window.flowUtils = {
  wait,
  controlledWait: wait,
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
  checkpoint: async (stepLabel) => AutomationPauseController.checkpoint(stepLabel),
};
