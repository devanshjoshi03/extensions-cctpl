(function () {
  'use strict';

  const KSHEMA_STATE_KEY = 'kshema_automation_state';

  if (typeof window !== 'undefined') {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};
  }

  const KshemaAutomationController = {
    _defaultState() {
      return {
        isPaused: false,
        isStopped: false,
        isRunning: false,
        currentStep: null,
        lastMessage: null
      };
    },

    getState() {
      try {
        const raw = sessionStorage.getItem(KSHEMA_STATE_KEY);
        return raw ? { ...this._defaultState(), ...JSON.parse(raw) } : this._defaultState();
      } catch (error) {
        return this._defaultState();
      }
    },

    _saveState(state) {
      sessionStorage.setItem(KSHEMA_STATE_KEY, JSON.stringify({ ...this._defaultState(), ...state }));
    },

    startRun(stepLabel = 'Starting automation') {
      const state = this._defaultState();
      state.isRunning = true;
      state.currentStep = stepLabel;
      this._saveState(state);
      this.updateUI();
    },

    finishRun(stepLabel = 'Completed') {
      const state = this.getState();
      state.isRunning = false;
      state.isPaused = false;
      state.isStopped = false;
      state.currentStep = stepLabel;
      this._saveState(state);
      this.updateUI();
    },

    failRun(stepLabel = 'Stopped') {
      const state = this.getState();
      state.isRunning = false;
      state.isPaused = false;
      state.currentStep = stepLabel;
      this._saveState(state);
      this.updateUI();
    },

    pause() {
      const state = this.getState();
      if (!state.isRunning || state.isStopped) return state;
      state.isPaused = true;
      this._saveState(state);
      this.updateUI();
      return state;
    },

    resume() {
      const state = this.getState();
      if (!state.isRunning || state.isStopped) return state;
      state.isPaused = false;
      this._saveState(state);
      this.updateUI();
      return state;
    },

    stop() {
      const state = this.getState();
      state.isStopped = true;
      state.isPaused = false;
      state.isRunning = false;
      state.currentStep = state.currentStep || 'Stopped';
      this._saveState(state);
      this.updateUI();
      return state;
    },

    reset() {
      this._saveState(this._defaultState());
      this.updateUI();
    },

    setStep(stepLabel) {
      if (!stepLabel) return;
      const state = this.getState();
      state.currentStep = stepLabel;
      if (!state.isStopped) {
        state.isRunning = true;
      }
      this._saveState(state);
      this.updateUI();
    },

    async checkpoint(stepLabel) {
      const initialState = this.getState();
      if (initialState.isStopped) {
        throw new Error('AUTOMATION_STOPPED');
      }

      if (stepLabel) {
        this.setStep(stepLabel);
      }

      while (true) {
        const state = this.getState();
        if (state.isStopped) {
          throw new Error('AUTOMATION_STOPPED');
        }
        if (!state.isPaused) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    },

    injectUI() {
      if (document.getElementById('kshema-automation-panel')) return;

      const panel = document.createElement('div');
      panel.id = 'kshema-automation-panel';
      panel.innerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:6px;">
          <button id="kshema-auto-close-btn" style="
            width:24px;
            height:24px;
            border:none;
            border-radius:999px;
            background:rgba(148, 163, 184, 0.16);
            color:#cbd5e1;
            font-size:13px;
            font-weight:700;
            line-height:1;
            cursor:pointer;
          ">X</button>
        </div>
        <div id="kshema-auto-badge" style="
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:4px 10px;
          border-radius:999px;
          background:#555;
          color:#fff;
          font-size:11px;
          font-weight:700;
          letter-spacing:0.3px;
          margin-bottom:8px;
        ">Idle</div>
        <div style="
          font-size:13px;
          font-weight:700;
          color:#f3f4f6;
          margin-bottom:4px;
        ">Kshema Automation</div>
        <div id="kshema-auto-step" style="
          color:#93c5fd;
          font-size:11px;
          line-height:1.4;
          min-height:32px;
          margin-bottom:10px;
          word-break:break-word;
        ">Waiting for automation</div>
        <div style="display:flex; gap:8px;">
          <button id="kshema-auto-pause-btn" style="
            flex:1;
            padding:8px 0;
            border:2px solid #c73750;
            border-radius:8px;
            background:#e94560;
            color:#fff;
            font-size:12px;
            font-weight:700;
            cursor:not-allowed;
            opacity:0.4;
          ">Pause</button>
          <button id="kshema-auto-stop-btn" style="
            flex:1;
            padding:8px 0;
            border:2px solid #b71c1c;
            border-radius:8px;
            background:#d32f2f;
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
        background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        boxShadow: '0 16px 40px rgba(2, 6, 23, 0.35)',
        fontFamily: '"Segoe UI", sans-serif'
      });

      document.body.appendChild(panel);

      document.getElementById('kshema-auto-pause-btn').addEventListener('click', () => {
        const state = this.getState();
        if (state.isStopped || !state.isRunning) return;
        if (state.isPaused) {
          this.resume();
        } else {
          this.pause();
        }
      });

      document.getElementById('kshema-auto-stop-btn').addEventListener('click', () => {
        const state = this.getState();
        if (state.isStopped || !state.isRunning) return;
        this.stop();
        stopAllFlows();
      });

      document.getElementById('kshema-auto-close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
      });

      this.updateUI();
    },

    updateUI() {
      const panel = document.getElementById('kshema-automation-panel');
      if (!panel) return;

      const state = this.getState();
      const badge = document.getElementById('kshema-auto-badge');
      const step = document.getElementById('kshema-auto-step');
      const pauseBtn = document.getElementById('kshema-auto-pause-btn');
      const stopBtn = document.getElementById('kshema-auto-stop-btn');

      step.textContent = state.currentStep || (state.isRunning ? 'Starting automation' : 'Waiting for automation');

      if (state.isStopped) {
        badge.textContent = 'Stopped';
        badge.style.background = '#b71c1c';
        pauseBtn.textContent = 'Pause';
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.4';
        pauseBtn.style.cursor = 'not-allowed';
        pauseBtn.style.background = '#e94560';
        pauseBtn.style.borderColor = '#c73750';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.4';
        stopBtn.style.cursor = 'not-allowed';
      } else if (!state.isRunning) {
        badge.textContent = 'Idle';
        badge.style.background = '#555';
        pauseBtn.textContent = 'Pause';
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.4';
        pauseBtn.style.cursor = 'not-allowed';
        pauseBtn.style.background = '#e94560';
        pauseBtn.style.borderColor = '#c73750';
        stopBtn.disabled = true;
        stopBtn.style.opacity = '0.4';
        stopBtn.style.cursor = 'not-allowed';
      } else if (state.isPaused) {
        badge.textContent = 'Paused';
        badge.style.background = '#e94560';
        pauseBtn.textContent = 'Resume';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        pauseBtn.style.cursor = 'pointer';
        pauseBtn.style.background = '#2d6a4f';
        pauseBtn.style.borderColor = '#40916c';
        stopBtn.disabled = false;
        stopBtn.style.opacity = '1';
        stopBtn.style.cursor = 'pointer';
      } else {
        badge.textContent = 'Running';
        badge.style.background = '#2d6a4f';
        pauseBtn.textContent = 'Pause';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        pauseBtn.style.cursor = 'pointer';
        pauseBtn.style.background = '#e94560';
        pauseBtn.style.borderColor = '#c73750';
        stopBtn.disabled = false;
        stopBtn.style.opacity = '1';
        stopBtn.style.cursor = 'pointer';
      }
    }
  };

  function inferLogLevel(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('error') || text.includes('failed') || text.includes('timed out') || text.includes('stopped')) {
      return 'error';
    }
    if (text.includes('waiting') || text.includes('pause') || text.includes('resume')) {
      return 'info';
    }
    if (text.includes('clicked') || text.includes('selected') || text.includes('entered') || text.includes('completed') || text.includes('started')) {
      return 'success';
    }
    return 'default';
  }

  function log(...args) {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch (error) {
        return String(arg);
      }
    }).join(' ');

    const state = KshemaAutomationController.getState();
    const stepLabel = state.currentStep ? ` | ${state.currentStep}` : '';
    const level = inferLogLevel(message);
    const style = level === 'error'
      ? 'color:#f87171;font-weight:700;'
      : level === 'success'
        ? 'color:#4ade80;font-weight:700;'
        : level === 'info'
          ? 'color:#60a5fa;font-weight:700;'
          : 'color:#dbeafe;font-weight:700;';

    console.log(`%c[Kshema]${stepLabel}`, style, message);
    chrome.runtime.sendMessage({ type: 'KSHEMA_LOG', message, level, step: state.currentStep || null }, () => {
      void chrome.runtime.lastError;
    });
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getActiveStep() {
    const steps = Array.from(document.querySelectorAll('.stepper-item-text'));
    const active = steps.find(item => item.classList.contains('stepper-active')) ||
      steps.find(item => {
        const selected = item.querySelector('.stepper-selected');
        return selected && selected.getBoundingClientRect().width > 0 && !selected.style.transform.includes('scaleX(0)');
      });

    return normalize(active?.childNodes?.[0]?.textContent || active?.textContent || '');
  }

  function resetAllFlows() {
    if (window.KshemaLogin?.reset) window.KshemaLogin.reset();
    if (window.KshemaPolicy?.reset) window.KshemaPolicy.reset();
    if (window.KshemaAddon?.reset) window.KshemaAddon.reset();
    if (window.KshemaSummary?.reset) window.KshemaSummary.reset();
    if (window.KshemaCustomerDetails?.reset) window.KshemaCustomerDetails.reset();
    if (window.KshemaOtherDetails?.reset) window.KshemaOtherDetails.reset();
    if (window.KshemaKyc?.reset) window.KshemaKyc.reset();
    if (window.KshemaPayment?.reset) window.KshemaPayment.reset();
  }

  function stopAllFlows() {
    if (window.KshemaLogin?.stop) window.KshemaLogin.stop();
    if (window.KshemaPolicy?.stop) window.KshemaPolicy.stop();
    if (window.KshemaAddon?.stop) window.KshemaAddon.stop();
    if (window.KshemaSummary?.stop) window.KshemaSummary.stop();
    if (window.KshemaCustomerDetails?.stop) window.KshemaCustomerDetails.stop();
    if (window.KshemaOtherDetails?.stop) window.KshemaOtherDetails.stop();
    if (window.KshemaKyc?.stop) window.KshemaKyc.stop();
    if (window.KshemaPayment?.stop) window.KshemaPayment.stop();
  }

  async function runKshemaFlow(payload) {
    if (window.location.href.startsWith('https://assurehub.kshema.co/kyc')) {
      if (!window.KshemaKyc || typeof window.KshemaKyc.run !== 'function') {
        throw new Error('Kshema KYC module is not loaded');
      }
      return window.KshemaKyc.run(payload, log);
    }

    if (window.location.href.startsWith('https://assurehub.kshema.co/payment')) {
      if (!window.KshemaPayment || typeof window.KshemaPayment.run !== 'function') {
        throw new Error('Kshema payment module is not loaded');
      }
      return window.KshemaPayment.run(payload, log);
    }

    if (window.location.href.startsWith('https://motorinsurance.kshema.co/app/policy')) {
      const activeStep = getActiveStep();
      log(`Active step detected: ${activeStep || 'unknown'}`);

      if (activeStep.includes('ckyc') && window.KshemaKyc) {
        return window.KshemaKyc.run(payload, log);
      }

      if ((activeStep.includes('payment') || window.KshemaPayment?.isActive?.()) && window.KshemaPayment) {
        return window.KshemaPayment.run(payload, log);
      }

      if (activeStep.includes('other details') && window.KshemaOtherDetails) {
        return window.KshemaOtherDetails.run(payload, log);
      }

      if (activeStep.includes('summary') && window.KshemaSummary) {
        return window.KshemaSummary.run(payload, log);
      }

      if (activeStep.includes('customer details') && window.KshemaCustomerDetails) {
        return window.KshemaCustomerDetails.run(payload, log);
      }

      if (activeStep.includes('addon') && window.KshemaAddon) {
        return window.KshemaAddon.run(payload, log);
      }

      if (!window.KshemaPolicy || typeof window.KshemaPolicy.run !== 'function') {
        throw new Error('Kshema policy module is not loaded');
      }

      return window.KshemaPolicy.run(payload, log);
    }

    if (window.location.href.startsWith('https://motorinsurance.kshema.co/app/home')) {
      if (window.KshemaPolicy?.isNewQuoteAvailable?.()) {
        log('Policy page shortcut detected from home');
        return window.KshemaPolicy.run(payload, log);
      }

      if (!window.KshemaLogin || typeof window.KshemaLogin.run !== 'function') {
        throw new Error('Kshema login module is not loaded');
      }

      const loginResult = await window.KshemaLogin.run(payload, log);
      log(loginResult.message);

      if (window.KshemaPolicy?.run) {
        return window.KshemaPolicy.run(payload, log);
      }

      return loginResult;
    }

    throw new Error('Open Kshema home or policy page before starting');
  }

  window.KshemaAutomationController = KshemaAutomationController;
  KshemaAutomationController.injectUI();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_KSHEMA_FLOW') {
      (async () => {
        try {
          KshemaAutomationController.startRun('Starting automation');
          resetAllFlows();
          log(`Starting automation on ${window.location.href}`);
          const result = await runKshemaFlow(request.payload);
          KshemaAutomationController.finishRun(result.message || 'Completed');
          log(result.message || 'Automation completed');
          sendResponse(result);
        } catch (error) {
          if (error.message === 'AUTOMATION_STOPPED') {
            KshemaAutomationController.failRun('Stopped');
            log('Automation stopped');
            sendResponse({ success: false, error: 'Automation stopped' });
            return;
          }

          KshemaAutomationController.failRun(`Failed: ${error.message}`);
          log(`Automation error: ${error.message}`);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }

    if (request.type === 'PAUSE_KSHEMA_FLOW') {
      KshemaAutomationController.pause();
      log('Pause requested');
      sendResponse({ status: 'paused' });
      return true;
    }

    if (request.type === 'RESUME_KSHEMA_FLOW') {
      KshemaAutomationController.resume();
      log('Resume requested');
      sendResponse({ status: 'resumed' });
      return true;
    }

    if (request.type === 'STOP_KSHEMA_FLOW') {
      KshemaAutomationController.stop();
      stopAllFlows();
      log('Stop requested');
      sendResponse({ status: 'stopped' });
      return true;
    }

    if (request.type === 'GET_KSHEMA_AUTOMATION_STATUS') {
      sendResponse(KshemaAutomationController.getState());
      return true;
    }

    return false;
  });

  log('Kshema content script loaded');

  if (window.location.href.startsWith('https://assurehub.kshema.co/kyc') &&
    window.KshemaKyc &&
    typeof window.KshemaKyc.autoRunOnAssureHub === 'function') {
    setTimeout(() => {
      const state = KshemaAutomationController.getState();
      if (state.isRunning) {
        return;
      }

      KshemaAutomationController.startRun('Resuming KYC on AssureHub');
      window.KshemaKyc.autoRunOnAssureHub(log).then(result => {
        if (result) {
          KshemaAutomationController.finishRun(result.message || 'Completed');
          log(result.message);
        } else {
          KshemaAutomationController.failRun('Idle');
        }
      }).catch(error => {
        if (error.message === 'AUTOMATION_STOPPED') {
          KshemaAutomationController.failRun('Stopped');
          log('Automation stopped');
          return;
        }

        KshemaAutomationController.failRun(`Failed: ${error.message}`);
        log(`Automation error: ${error.message}`);
      });
    }, 1000);
  }

  if (window.location.href.startsWith('https://motorinsurance.kshema.co/app/policy') &&
    window.KshemaPayment &&
    typeof window.KshemaPayment.autoRunAfterKyc === 'function') {
    setTimeout(() => {
      const state = KshemaAutomationController.getState();
      if (state.isRunning) {
        return;
      }

      KshemaAutomationController.startRun('Resuming payment after KYC');
      window.KshemaPayment.autoRunAfterKyc(log).then(result => {
        if (result) {
          KshemaAutomationController.finishRun(result.message || 'Completed');
          log(result.message);
        } else {
          KshemaAutomationController.failRun('Idle');
        }
      }).catch(error => {
        if (error.message === 'AUTOMATION_STOPPED') {
          KshemaAutomationController.failRun('Stopped');
          log('Automation stopped');
          return;
        }

        KshemaAutomationController.failRun(`Failed: ${error.message}`);
        log(`Automation error: ${error.message}`);
      });
    }, 1000);
  }

  if (window.location.href.startsWith('https://assurehub.kshema.co/payment') &&
    window.KshemaPayment &&
    typeof window.KshemaPayment.autoRunOnAssureHubPayment === 'function') {
    setTimeout(() => {
      const state = KshemaAutomationController.getState();
      if (state.isRunning) {
        return;
      }

      KshemaAutomationController.startRun('Resuming payment on AssureHub');
      window.KshemaPayment.autoRunOnAssureHubPayment(log).then(result => {
        if (result) {
          KshemaAutomationController.finishRun(result.message || 'Completed');
          log(result.message);
        } else {
          KshemaAutomationController.failRun('Idle');
        }
      }).catch(error => {
        if (error.message === 'AUTOMATION_STOPPED') {
          KshemaAutomationController.failRun('Stopped');
          log('Automation stopped');
          return;
        }

        KshemaAutomationController.failRun(`Failed: ${error.message}`);
        log(`Automation error: ${error.message}`);
      });
    }, 1000);
  }
})();
