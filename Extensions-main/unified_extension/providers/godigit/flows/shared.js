function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AutomationPauseController = {
  STORAGE_KEY: 'godigitAutomationState',
  manualContinueResolver: null,
  getState() {
    try { return JSON.parse(sessionStorage.getItem(this.STORAGE_KEY)) || this.defaultState(); }
    catch { return this.defaultState(); }
  },
  defaultState() { return { isRunning: false, isPaused: false, isStopped: false, currentStep: 'Waiting for Start in the extension popup', panelDismissed: false }; },
  save(state) {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    this._updateUI();
  },
  startRun() { this.save({ ...this.defaultState(), isRunning: true, currentStep: 'Starting login' }); },
  async checkpoint(step) {
    const state = this.getState();
    if (state.isStopped) throw new Error('AUTOMATION_STOPPED');
    if (step) { state.isRunning = true; state.currentStep = step; this.save(state); }
    while (this.getState().isPaused) await new Promise((resolve) => setTimeout(resolve, 250));
    if (this.getState().isStopped) throw new Error('AUTOMATION_STOPPED');
  },
  waitForManualEntry(step, fields) {
    if (this.manualContinueResolver) throw new Error('A manual Go Digit entry is already waiting to continue');
    const state = this.getState();
    state.isRunning = true;
    state.isPaused = false;
    state.isStopped = false;
    state.currentStep = step;
    this.save(state);
    const continueButton = document.getElementById('godigit-auto-continue');
    if (!continueButton) throw new Error('Go Digit Continue control is not available');
    continueButton.style.display = 'block';
    return new Promise((resolve, reject) => {
      this.manualContinueResolver = {
        resolve: () => {
          continueButton.style.display = 'none';
          this.manualContinueResolver = null;
          resolve();
        },
        reject: (error) => {
          continueButton.style.display = 'none';
          this.manualContinueResolver = null;
          reject(error);
        },
        fields
      };
    });
  },
  pause() { const state = this.getState(); if (state.isRunning && !state.isStopped) { state.isPaused = true; this.save(state); } },
  resume() { const state = this.getState(); if (!state.isStopped) { state.isPaused = false; this.save(state); } },
  stop() {
    this.save({ ...this.getState(), isRunning: false, isPaused: false, isStopped: true, currentStep: 'Stopped' });
    this.manualContinueResolver?.reject(new Error('AUTOMATION_STOPPED'));
  },
  complete(step) {
    this.save({ ...this.getState(), isRunning: false, isPaused: false, currentStep: step });
    const continueButton = document.getElementById('godigit-auto-continue');
    if (continueButton) continueButton.style.display = 'none';
  },
  getStatus() { return this.getState(); },
  _updateUI() {
    const panel = document.getElementById('godigit-automation-panel');
    if (!panel) return;
    const state = this.getState();
    if (state.panelDismissed) { panel.style.display = 'none'; return; }
    panel.style.display = 'flex';
    const badge = document.getElementById('godigit-auto-badge');
    const step = document.getElementById('godigit-auto-step');
    const pauseButton = document.getElementById('godigit-auto-pause');
    const stopButton = document.getElementById('godigit-auto-stop');
    badge.textContent = state.isStopped ? 'Stopped' : state.isPaused ? 'Paused' : state.isRunning ? 'Running' : 'Idle';
    badge.style.background = state.isStopped ? '#7f1d1d' : state.isPaused ? '#b45309' : state.isRunning ? '#087e75' : '#526168';
    step.textContent = state.currentStep || (state.isRunning ? 'Starting...' : 'Waiting for Start in the extension popup');
    pauseButton.textContent = state.isPaused ? 'Resume' : 'Pause';
    pauseButton.disabled = !state.isRunning || state.isStopped;
    stopButton.disabled = !state.isRunning || state.isStopped;
    pauseButton.style.opacity = pauseButton.disabled ? '0.5' : '1';
    stopButton.style.opacity = stopButton.disabled ? '0.5' : '1';
  },
  injectUI() {
    if (!document.body || document.getElementById('godigit-automation-panel')) return;
    const panel = document.createElement('aside');
    panel.id = 'godigit-automation-panel';
    panel.setAttribute('aria-label', 'Go Digit automation controls');
    panel.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;display:flex;flex-direction:column;gap:9px;width:min(320px,calc(100vw - 32px));padding:14px;background:#172126;border:1px solid #087e75;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);color:#f4f7f8;font:13px Segoe UI,sans-serif;';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <strong id="godigit-auto-badge" style="padding:3px 8px;border-radius:4px;background:#526168;color:#fff;font-size:11px">Idle</strong>
        <span style="color:#c3cdd1;font-size:12px">Go Digit Automation</span>
        <button id="godigit-auto-close" type="button" aria-label="Close automation widget" style="border:0;background:transparent;color:#c3cdd1;font-size:18px;line-height:1;cursor:pointer">×</button>
      </div>
      <div id="godigit-auto-step" aria-live="polite" style="color:#e6eff1;line-height:1.4;overflow-wrap:anywhere">Waiting for Start in the extension popup</div>
      <button id="godigit-auto-continue" type="button" style="display:none;min-height:34px;border:1px solid #2563eb;border-radius:4px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Continue</button>
      <div style="display:flex;gap:8px">
        <button id="godigit-auto-pause" type="button" disabled style="flex:1;min-height:34px;border:1px solid #087e75;border-radius:4px;background:#087e75;color:#fff;font-weight:600;cursor:pointer">Pause</button>
        <button id="godigit-auto-stop" type="button" disabled style="flex:1;min-height:34px;border:1px solid #a73737;border-radius:4px;background:#a73737;color:#fff;font-weight:600;cursor:pointer">Stop</button>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('godigit-auto-pause').addEventListener('click', () => {
      const state = this.getState();
      if (!state.isRunning || state.isStopped) return;
      state.isPaused ? this.resume() : this.pause();
    });
    document.getElementById('godigit-auto-stop').addEventListener('click', () => {
      const state = this.getState();
      if (state.isRunning && !state.isStopped && window.confirm('Stop Go Digit automation?')) this.stop();
    });
    document.getElementById('godigit-auto-continue').addEventListener('click', () => {
      const pending = this.manualContinueResolver;
      if (!pending) return;
      const missing = pending.fields.filter(({ selector }) => {
        const element = [...document.querySelectorAll(selector)].find((candidate) =>
          candidate.offsetParent !== null && !candidate.disabled
        );
        return !element || !String(element.value || '').trim() || element.classList.contains('ng-invalid');
      });
      if (missing.length) {
        const state = this.getState();
        state.currentStep = `Complete and select: ${missing.map(({ label }) => label).join(', ')}`;
        this.save(state);
        return;
      }
      pending.resolve();
      const state = this.getState();
      state.currentStep = 'Continuing automation';
      this.save(state);
    });
    document.getElementById('godigit-auto-close').addEventListener('click', () => {
      const state = this.getState();
      state.panelDismissed = true;
      this.save(state);
    });
    this._updateUI();
  }
};
