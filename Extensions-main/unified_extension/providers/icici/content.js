(function () {
  'use strict';

  const LOG_STORAGE_KEY = 'iciciLiveLogs';
  const MAX_BRIDGED_LOGS = 500;
  let currentRunId = 0;

  const logBridge = (() => {
    const originalConsole = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    let buffer = [];
    let seq = 0;
    let flushTimer = null;

    const serialize = (value) => {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message;
      try {
        return JSON.stringify(value);
      } catch (_) {
        return String(value);
      }
    };

    const cleanConsoleArgs = (args) => {
      if (args[0] === '%c[ICICI]') {
        return ['[ICICI]', ...args.slice(2)];
      }
      return args.filter((arg, index) => !(index > 0 && typeof arg === 'string' && /^color:|font-weight:/.test(arg)));
    };

    const flush = () => {
      flushTimer = null;
      chrome.storage.local.set({ [LOG_STORAGE_KEY]: buffer.slice(-MAX_BRIDGED_LOGS) }, () => {});
    };

    ['log', 'warn', 'error'].forEach((level) => {
      console[level] = (...args) => {
        originalConsole[level](...args);
        const color = level === 'error' ? '#ff6b6b' : level === 'warn' ? '#ffb74d' : '#6ee7ff';
        const cleanArgs = cleanConsoleArgs(args);
        buffer.push({
          id: `${Date.now()}-${seq++}`,
          text: cleanArgs.map(serialize).join(' '),
          color,
          ts: Date.now(),
        });
        if (buffer.length > MAX_BRIDGED_LOGS) {
          buffer = buffer.slice(-MAX_BRIDGED_LOGS);
        }
        if (!flushTimer) {
          flushTimer = setTimeout(flush, 50);
        }
      };
    });

    return {
      clear() {
        buffer = [];
        seq = 0;
        chrome.storage.local.set({ [LOG_STORAGE_KEY]: [] }, () => {});
      },
    };
  })();

  if (typeof window !== 'undefined') {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};
  }

  console.log('[ICICI Content] Modules loaded:', {
    ICICILogin: typeof window.ICICILogin,
    ICICIDashboard: typeof window.ICICIDashboard,
    ICICIQuote: typeof window.ICICIQuote,
    ICICIPremium: typeof window.ICICIPremium,
    ICICIProposal: typeof window.ICICIProposal,
    AutomationPauseController: typeof window.AutomationPauseController,
  });

  function log(...args) {
    console.log('%c[ICICI]', 'color: #2a9fd8; font-weight: bold;', ...args);
  }

  // ICICI Unified accepts one canonical payload shape.  Keep this boundary here
  // (rather than in individual flows) so every step receives the same schema.
  function prepareIciciPayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      throw new Error('ICICI payload must be a JSON object');
    }

    const requiredObjects = [
      'vehicleDetails',
      'covers',
      'vehicleInformation',
      'customerDetails',
      'agentDetails',
      'nominee',
      'hypothecation',
    ];

    const missing = requiredObjects.filter((key) => {
      const value = rawPayload[key];
      return !value || typeof value !== 'object' || Array.isArray(value);
    });

    if (missing.length) {
      throw new Error(`Invalid ICICI payload: missing object ${missing.join(', ')}`);
    }

    // Do not pass legacy/unknown fields into the automation. Optional document
    // metadata is retained because it is part of the submitted ICICI structure.
    return {
      vehicleDetails: rawPayload.vehicleDetails,
      covers: rawPayload.covers,
      vehicleInformation: rawPayload.vehicleInformation,
      customerDetails: rawPayload.customerDetails,
      agentDetails: rawPayload.agentDetails,
      nominee: rawPayload.nominee,
      hypothecation: rawPayload.hypothecation,
      externalId: rawPayload.externalId,
      uploadedFiles: rawPayload.uploadedFiles,
      policyFiles: rawPayload.policyFiles,
      fileMetadata: rawPayload.fileMetadata,
    };
  }

  async function sleep(ms) {
    const waitFn = window.flowUtils?.controlledWait || window.flowUtils?.wait;
    if (waitFn) {
      await waitFn(ms);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function checkpoint(stepLabel) {
    if (typeof window.AutomationPauseController !== 'undefined') {
      await window.AutomationPauseController.checkpoint(stepLabel);
    }
  }

  async function runProposal(payload) {
    if (!(window.ICICIProposal && typeof window.ICICIProposal.run === 'function')) {
      log('⚠️ ICICIProposal module not available');
      return { success: true, skipped: true, message: 'Proposal module pending' };
    }

    await checkpoint('Proposal -> Fill proposal page');
    const result = await window.ICICIProposal.run(payload, log);
    if (!result.success) {
      throw new Error(result.error || 'Proposal flow failed');
    }
    log('Proposal flow completed:', result);
    return result;
  }

  async function runPremiumThenProposal(payload) {
    if (!(window.ICICIPremium && typeof window.ICICIPremium.run === 'function')) {
      log('⚠️ ICICIPremium module not available');
      return { success: true, skipped: true, message: 'Premium module pending' };
    }

    await checkpoint('Premium -> Fill premium page');
    const premiumResult = await window.ICICIPremium.run(payload, log);
    if (!premiumResult.success) {
      throw new Error(premiumResult.error || 'Premium flow failed');
    }
    log('Premium flow completed, waiting for proposal page...');
    await sleep(3000);
    return runProposal(payload);
  }

  async function runQuoteThenPremiumThenProposal(payload) {
    if (!(window.ICICIQuote && typeof window.ICICIQuote.run === 'function')) {
      log('⚠️ ICICIQuote module not available');
      return { success: true, skipped: true, message: 'Quote module pending' };
    }

    await checkpoint('Quote -> Fill quote page');
    const quoteResult = await window.ICICIQuote.run(payload, log);
    if (!quoteResult.success) {
      throw new Error(quoteResult.error || 'Quote flow failed');
    }
    log('Quote flow completed, waiting for premium page...');
    await sleep(3000);
    return runPremiumThenProposal(payload);
  }

  async function runFullIciciAutomation(payload, runId) {
    if (typeof window.AutomationPauseController !== 'undefined') {
      window.AutomationPauseController.startRun();
    }

    try {
      log('Starting ICICI automation flow...');

      if (window.location.href.includes('/NysaMotor/proposal')) {
        const proposalResult = await runProposal(payload);
        if (runId === currentRunId) window.AutomationPauseController?.endRun();
        return proposalResult;
      }

      if (window.location.href.includes('/NysaMotor/premium')) {
        const premiumResult = await runPremiumThenProposal(payload);
        if (runId === currentRunId) window.AutomationPauseController?.endRun();
        return premiumResult;
      }

      if (window.location.href.includes('/NysaMotor/quote')) {
        const quoteResult = await runQuoteThenPremiumThenProposal(payload);
        if (runId === currentRunId) window.AutomationPauseController?.endRun();
        return quoteResult;
      }

      if (!window.location.href.includes('/#/dashboard')) {
        await checkpoint('Login -> Authenticate');
        if (window.ICICILogin && typeof window.ICICILogin.run === 'function') {
          const loginResult = await window.ICICILogin.run(payload, log);
          if (!loginResult.success && !loginResult.skipped) {
            throw new Error(loginResult.error || 'Login failed');
          }
          log('Login completed or skipped');
        } else {
          log('⚠️ ICICILogin module not available');
        }
      } else {
        log('✅ Already on dashboard, skipping login');
      }

      await checkpoint('Dashboard -> Select product');
      if (!(window.ICICIDashboard && typeof window.ICICIDashboard.run === 'function')) {
        log('⚠️ ICICIDashboard module not available');
        if (runId === currentRunId) window.AutomationPauseController?.endRun();
        return { success: true, skipped: true, message: 'Dashboard module pending' };
      }

      const dashboardResult = await window.ICICIDashboard.run(payload, log);
      if (!dashboardResult.success) {
        throw new Error(dashboardResult.error || 'Dashboard flow failed');
      }

      log('Dashboard flow completed');
      await sleep(2000);
      const result = await runQuoteThenPremiumThenProposal(payload);
      if (runId === currentRunId) window.AutomationPauseController?.endRun();
      return result;
    } catch (err) {
      const message = err?.message || 'Automation failed';
      if (runId === currentRunId) {
        if (message === 'AUTOMATION_STOPPED') {
          window.AutomationPauseController?.stop();
          log('⛔ Automation stopped by user');
        } else {
          window.AutomationPauseController?.failRun(message);
          log('❌ Automation error:', message);
        }
      }
      return { success: false, error: message };
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request.action || request.type;
    if (action !== 'GET_AUTOMATION_STATUS') {
      log('Received message:', action);
    }

    if (action === 'START_AUTOMATION' || action === 'START_ICICI_FLOW') {
      const runId = ++currentRunId;
      logBridge.clear();
      let payload;
      try {
        payload = prepareIciciPayload(request.payload);
      } catch (error) {
        const message = error?.message || 'Invalid ICICI payload';
        log(message);
        sendResponse({ success: false, error: message });
        return false;
      }

      sendResponse({ status: 'started' });
      runFullIciciAutomation(payload, runId).then((result) => {
        if (runId !== currentRunId) return;
        chrome.runtime.sendMessage({
          action: 'FLOW_RESULT',
          result,
          payload,
        });
      });
      return true;
    }

    if (action === 'PAUSE_AUTOMATION' || action === 'PAUSE_ICICI_FLOW') {
      if (typeof window.AutomationPauseController !== 'undefined') {
        window.AutomationPauseController.pause();
        log('Pause requested');
        sendResponse({ status: 'paused' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }

    if (action === 'RESUME_AUTOMATION' || action === 'RESUME_ICICI_FLOW') {
      if (typeof window.AutomationPauseController !== 'undefined') {
        window.AutomationPauseController.resume();
        log('Resume requested');
        sendResponse({ status: 'resumed' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }

    if (action === 'STOP_AUTOMATION' || action === 'STOP_ICICI_FLOW') {
      currentRunId += 1;
      if (typeof window.AutomationPauseController !== 'undefined') {
        window.AutomationPauseController.stop();
        log('Stop requested');
        sendResponse({ status: 'stopped' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }

    if (action === 'GET_AUTOMATION_STATUS') {
      if (typeof window.AutomationPauseController !== 'undefined') {
        sendResponse(window.AutomationPauseController.getState());
      } else {
        sendResponse({ isRunning: false, isPaused: false, isStopped: false, currentStep: null });
      }
      return true;
    }
  });

  log('✅ ICICI Content script loaded');
  if (typeof window.AutomationPauseController !== 'undefined') {
    window.AutomationPauseController.reset();
    window.AutomationPauseController.injectUI();
  }
})();
