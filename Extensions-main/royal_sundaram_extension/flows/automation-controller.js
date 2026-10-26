(function () {
  'use strict';

  const ROYAL_STATE_KEY = 'royalAutomationState';

  function withStorageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function withStorageSet(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set(value, resolve);
    });
  }

  function statesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  const RoyalAutomationController = {
    _state: null,
    _stateReady: null,

    _defaultState() {
      return {
        isPaused: false,
        isStopped: false,
        isRunning: false,
        currentStep: null,
        currentStepKey: null
      };
    },

    async _ensureStateLoaded() {
      if (this._state) return this._state;
      if (!this._stateReady) {
        this._stateReady = withStorageGet([ROYAL_STATE_KEY]).then((stored) => {
          this._state = { ...this._defaultState(), ...(stored[ROYAL_STATE_KEY] || {}) };
          return this._state;
        });
      }
      return this._stateReady;
    },

    async getState() {
      const state = await this._ensureStateLoaded();
      return { ...state };
    },

    async _saveState(state) {
      const nextState = { ...this._defaultState(), ...state };
      await this._ensureStateLoaded();

      if (statesEqual(this._state, nextState)) {
        this.updateUI(nextState);
        return { ...nextState };
      }

      this._state = nextState;
      await withStorageSet({ [ROYAL_STATE_KEY]: nextState });
      this.updateUI(nextState);
      return { ...nextState };
    },

    async startRun(stepLabel = 'Starting automation', stepKey = null) {
      return this._saveState({
        isRunning: true,
        isPaused: false,
        isStopped: false,
        currentStep: stepLabel,
        currentStepKey: stepKey
      });
    },

    async finishRun(stepLabel = 'Completed', stepKey = null) {
      const state = await this.getState();
      return this._saveState({
        ...state,
        isRunning: false,
        isPaused: false,
        isStopped: false,
        currentStep: stepLabel,
        currentStepKey: stepKey
      });
    },

    async failRun(stepLabel = 'Stopped', stepKey = null) {
      const state = await this.getState();
      return this._saveState({
        ...state,
        isRunning: false,
        isPaused: false,
        currentStep: stepLabel,
        currentStepKey: stepKey
      });
    },

    async setStep(stepLabel, stepKey = null) {
      if (!stepLabel && !stepKey) return this.getState();
      const state = await this.getState();
      const nextState = {
        ...state,
        currentStep: stepLabel || state.currentStep,
        currentStepKey: stepKey || state.currentStepKey
      };
      if (!nextState.isStopped) {
        nextState.isRunning = true;
      }

      if (statesEqual(state, nextState)) {
        return state;
      }

      return this._saveState(nextState);
    },

    async pause() {
      const state = await this.getState();
      if (!state.isRunning || state.isStopped) return state;
      return this._saveState({ ...state, isPaused: true });
    },

    async resume() {
      const state = await this.getState();
      if (state.isStopped) {
        return this._saveState({ ...state, isStopped: false, isRunning: true, isPaused: false });
      }
      if (!state.isRunning) return state;
      return this._saveState({ ...state, isPaused: false });
    },

    async stop() {
      const state = await this.getState();
      return this._saveState({
        ...state,
        isStopped: true,
        isPaused: false,
        isRunning: false,
        currentStep: state.currentStep || 'Stopped'
      });
    },

    async reset() {
      return this._saveState(this._defaultState());
    },

    async checkpoint(stepLabel = null, stepKey = null) {
      const initialState = await this._ensureStateLoaded();
      if (initialState.isStopped) {
        throw new Error('AUTOMATION_STOPPED');
      }

      if (stepLabel || stepKey) {
        await this.setStep(stepLabel || initialState.currentStep, stepKey || initialState.currentStepKey);
      }

      while (true) {
        const state = this._state || await this._ensureStateLoaded();
        if (state.isStopped) {
          throw new Error('AUTOMATION_STOPPED');
        }
        if (!state.isPaused) {
          return state;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },

    injectUI() {
      if (document.getElementById('royal-automation-panel')) return;
      if (!document.body) {
        window.addEventListener('DOMContentLoaded', () => this.injectUI(), { once: true });
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'royal-automation-panel';
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:700;color:#f8fafc;">Royal Automation</div>
          <button id="royal-auto-close-btn" style="
            width:24px;
            height:24px;
            border:none;
            border-radius:999px;
            background:rgba(148,163,184,0.18);
            color:#cbd5e1;
            font-size:12px;
            font-weight:700;
            cursor:pointer;
          ">X</button>
        </div>
        <div id="royal-auto-badge" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:4px 10px;
          border-radius:999px;
          background:#475569;
          color:#fff;
          font-size:11px;
          font-weight:700;
          margin-bottom:8px;
        ">Idle</div>
        <div id="royal-auto-step" style="
          color:#bfdbfe;
          font-size:11px;
          line-height:1.4;
          min-height:32px;
          margin-bottom:10px;
          word-break:break-word;
        ">Waiting for automation</div>
        <div style="display:flex;gap:8px;">
          <button id="royal-auto-pause-btn" style="
            flex:1;
            padding:8px 0;
            border:2px solid #d97706;
            border-radius:8px;
            background:#f59e0b;
            color:#111827;
            font-size:12px;
            font-weight:700;
            cursor:not-allowed;
            opacity:0.4;
          ">Pause</button>
          <button id="royal-auto-stop-btn" style="
            flex:1;
            padding:8px 0;
            border:2px solid #b91c1c;
            border-radius:8px;
            background:#dc2626;
            color:#fff;
            font-size:12px;
            font-weight:700;
            cursor:not-allowed;
            opacity:0.4;
          ">Stop</button>
        </div>
      `;

      Object.assign(panel.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: '260px',
        zIndex: '2147483647',
        padding: '14px',
        borderRadius: '12px',
        background: 'linear-gradient(180deg, #0f172a 0%, #0f766e 100%)',
        border: '1px solid rgba(148, 163, 184, 0.24)',
        boxShadow: '0 16px 40px rgba(2, 6, 23, 0.35)',
        fontFamily: '"Segoe UI", sans-serif'
      });

      document.body.appendChild(panel);

      document.getElementById('royal-auto-pause-btn').addEventListener('click', async () => {
        const state = await this.getState();
        if (state.isStopped || !state.isRunning) return;
        if (state.isPaused) {
          await this.resume();
        } else {
          await this.pause();
        }
      });

      document.getElementById('royal-auto-stop-btn').addEventListener('click', async () => {
        const state = await this.getState();
        if (state.isStopped || !state.isRunning) return;
        await this.stop();
      });

      document.getElementById('royal-auto-close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
      });

      this.getState().then((state) => this.updateUI(state));
    },

    updateUI(state) {
      const panel = document.getElementById('royal-automation-panel');
      if (!panel || !state) return;

      const badge = document.getElementById('royal-auto-badge');
      const step = document.getElementById('royal-auto-step');
      const pauseBtn = document.getElementById('royal-auto-pause-btn');
      const stopBtn = document.getElementById('royal-auto-stop-btn');

      step.textContent = state.currentStep || (state.isRunning ? 'Starting automation' : 'Waiting for automation');

      if (state.isStopped) {
        badge.textContent = 'Stopped';
        badge.style.background = '#b91c1c';
        pauseBtn.textContent = 'Pause';
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.4';
        pauseBtn.style.cursor = 'not-allowed';
        pauseBtn.style.background = '#f59e0b';
        pauseBtn.style.borderColor = '#d97706';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.4';
        stopBtn.style.cursor = 'not-allowed';
        return;
      }

      if (!state.isRunning) {
        badge.textContent = 'Idle';
        badge.style.background = '#475569';
        pauseBtn.textContent = 'Pause';
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.4';
        pauseBtn.style.cursor = 'not-allowed';
        pauseBtn.style.background = '#f59e0b';
        pauseBtn.style.borderColor = '#d97706';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.4';
        stopBtn.style.cursor = 'not-allowed';
        return;
      }

      if (state.isPaused) {
        badge.textContent = 'Paused';
        badge.style.background = '#f59e0b';
        pauseBtn.textContent = 'Resume';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        pauseBtn.style.cursor = 'pointer';
        pauseBtn.style.background = '#16a34a';
        pauseBtn.style.borderColor = '#15803d';
        stopBtn.disabled = false;
        stopBtn.style.opacity = '1';
        stopBtn.style.cursor = 'pointer';
        return;
      }

      badge.textContent = 'Running';
      badge.style.background = '#16a34a';
      pauseBtn.textContent = 'Pause';
      pauseBtn.disabled = false;
      pauseBtn.style.opacity = '1';
      pauseBtn.style.cursor = 'pointer';
      pauseBtn.style.background = '#f59e0b';
      pauseBtn.style.borderColor = '#d97706';
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
    }
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[ROYAL_STATE_KEY]) return;
    RoyalAutomationController._state = {
      ...RoyalAutomationController._defaultState(),
      ...(changes[ROYAL_STATE_KEY].newValue || {})
    };
    RoyalAutomationController.updateUI(RoyalAutomationController._state);
  });

  window.RoyalAutomationController = RoyalAutomationController;
  RoyalAutomationController.injectUI();
})();
