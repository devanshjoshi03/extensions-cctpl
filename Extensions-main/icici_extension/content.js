(function () {
  'use strict';

  const STORAGE_KEY = 'iciciAutomation';
  let automationRunning = false;

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
  });

  function log(...args) {
    console.log('%c[ICICI]', 'color: #2a9fd8; font-weight: bold;', ...args);
  }

  function isReloadNavigation() {
    try {
      const navEntry = performance.getEntriesByType?.('navigation')?.[0];
      if (navEntry?.type) return navEntry.type === 'reload';
    } catch (_) {}

    try {
      return performance.navigation?.type === performance.navigation.TYPE_RELOAD;
    } catch (_) {}

    return false;
  }

  async function getAutomationState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (d) => resolve(d[STORAGE_KEY] || null));
    });
  }

  function waitForAutomationStateChange(timeoutMs = 50) {
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
        if (area === 'local' && changes?.[STORAGE_KEY]) done();
      };
      const timer = setTimeout(done, timeoutMs);
      chrome.storage.onChanged.addListener(onChange);
    });
  }

  async function waitForAutomationGate() {
    while (true) {
      const state = await getAutomationState();
      if (state?.isStopped) throw new Error('Automation stopped');
      if (!state?.isPaused) return state;
      await waitForAutomationStateChange();
    }
  }

  async function sleep(ms) {
    const deadline = Date.now() + Math.max(0, Number(ms) || 0);
    while (Date.now() < deadline) {
      await waitForAutomationGate();
      await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, deadline - Date.now()))));
    }
  }

  let stateWriteChain = Promise.resolve();

  async function setAutomationState(patch) {
    const task = stateWriteChain.then(async () => {
      const cur = (await getAutomationState()) || {};
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      await new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: next }, resolve);
      });
      return next;
    });
    stateWriteChain = task.catch(() => {});
    return task;
  }

  async function stepLog(msg) {
    log(msg);
    const cur = (await getAutomationState()) || {};
    const logs = [...(cur.logs || []), { text: msg, ts: Date.now() }].slice(-200);
    await setAutomationState({ currentStep: msg, logs });
  }

  async function waitForSpinnerIdle(logger) {
    await waitForAutomationGate();
    if (!window.flowUtils?.waitForSpinnerToFinish) return;
    await window.flowUtils.waitForSpinnerToFinish(120000, () =>
      logger('⏳ Spinner on screen — waiting before next step...')
    );
  }

  async function waitAfterNavigation(ms, logger) {
    await waitForSpinnerIdle(logger);
    await sleep(ms);
  }

  function urlIncludesQuote() {
    const u = window.location.href;
    return u.includes('/NysaMotor/quote') || u.includes('/#/quote');
  }

  function urlIncludesPremium() {
    return window.location.href.includes('/NysaMotor/premium');
  }

  function urlIncludesProposal() {
    return window.location.href.includes('/NysaMotor/proposal');
  }

  async function waitForUrl(testFn, label, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await getAutomationState();
      if (state?.isStopped) throw new Error('Automation stopped');

      if (testFn()) return true;

      await waitForSpinnerIdle(stepLog);
      await sleep(300);
    }
    throw new Error(`Timeout waiting for ${label}`);
  }

  async function runProposalFlow(payload, logger) {
    await waitForAutomationGate();
    if (!window.ICICIProposal?.run) {
      throw new Error(
        'Proposal module not loaded (script error). Reload the extension in chrome://extensions'
      );
    }
    await setAutomationState({ phase: 'proposal' });
    await stepLog('Starting proposal flow...');
    await waitForSpinnerIdle(logger);
    await waitForUrl(urlIncludesProposal, 'proposal page');
    const proposalResult = await window.ICICIProposal.run(payload, logger);
    if (!proposalResult?.success) {
      throw new Error(proposalResult?.error || 'Proposal flow failed');
    }
  }

  async function runQuoteChain(payload, logger) {
    if (window.ICICIQuote && typeof window.ICICIQuote.run === 'function') {
      await waitForAutomationGate();
      await setAutomationState({ phase: 'quote' });
      await stepLog('Starting quote flow...');
      const quoteResult = await window.ICICIQuote.run(payload, logger);
      if (!quoteResult?.success) throw new Error('Quote flow failed');
      await stepLog('Quote completed — waiting for premium page...');
      await setAutomationState({ phase: 'awaiting_premium' });
      await waitForUrl(urlIncludesPremium, 'premium page');
    }

    if (window.ICICIPremium && typeof window.ICICIPremium.run === 'function') {
      await waitForAutomationGate();
      await setAutomationState({ phase: 'premium' });
      await stepLog('Starting premium flow...');
      const premiumResult = await window.ICICIPremium.run(payload, logger);
      if (!premiumResult?.success) throw new Error('Premium flow failed');
      await stepLog('Premium completed — waiting for proposal page...');
      await setAutomationState({ phase: 'awaiting_proposal' });
      await waitForUrl(urlIncludesProposal, 'proposal page');
    }

    if (window.ICICIProposal && typeof window.ICICIProposal.run === 'function') {
      await runProposalFlow(payload, logger);
    }
  }

  async function runIciciAutomation(payload, options = {}) {
    if (automationRunning) {
      log('Automation already running in this tab');
      return;
    }
    automationRunning = true;

    const logger = async (...args) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      await stepLog(msg);
    };

    try {
      await setAutomationState({
        isRunning: true,
        isStopped: false,
        payload,
        lastError: null,
        startedAt: Date.now(),
      });

      await waitForSpinnerIdle(logger);

      const resumePhase = options.resume ? (await getAutomationState())?.phase : null;

      // ── Resume after navigation ─────────────────────────────────────────────
      if (resumePhase === 'awaiting_quote' || (resumePhase === 'quote' && urlIncludesQuote())) {
        await stepLog('Resuming after navigation to quote...');
        await waitForUrl(urlIncludesQuote, 'quote page');
        await waitForSpinnerIdle(logger);
        await runQuoteChain(payload, logger);
        await setAutomationState({
          isRunning: false,
          phase: 'done',
          currentStep: 'Automation completed',
        });
        return;
      }

      if (resumePhase === 'awaiting_premium' || (resumePhase === 'premium' && urlIncludesPremium())) {
        await stepLog('Resuming on premium page...');
        await waitForUrl(urlIncludesPremium, 'premium page');
        await waitForSpinnerIdle(logger);
        await setAutomationState({ phase: 'premium' });
        if (window.ICICIPremium) {
          const r = await window.ICICIPremium.run(payload, logger);
          if (!r?.success) throw new Error('Premium flow failed');
        }
        await setAutomationState({ phase: 'awaiting_proposal' });
        await waitForUrl(urlIncludesProposal, 'proposal page');
        await runProposalFlow(payload, logger);
        await setAutomationState({ isRunning: false, phase: 'done', currentStep: 'Automation completed' });
        return;
      }

      if (resumePhase === 'awaiting_proposal' || (resumePhase === 'proposal' && urlIncludesProposal())) {
        await stepLog('Resuming on proposal page...');
        await runProposalFlow(payload, logger);
        await setAutomationState({ isRunning: false, phase: 'done', currentStep: 'Automation completed' });
        return;
      }

      // ── Fresh start by current URL ──────────────────────────────────────────
      if (urlIncludesProposal()) {
        await stepLog('On proposal page — running proposal flow...');
        await runProposalFlow(payload, logger);
        await setAutomationState({ isRunning: false, phase: 'done', currentStep: 'Automation completed' });
        return;
      }

      if (urlIncludesPremium()) {
        await stepLog('On premium page — running premium → proposal...');
        if (window.ICICIPremium) {
          const r = await window.ICICIPremium.run(payload, logger);
          if (!r?.success) throw new Error('Premium flow failed');
        }
        await setAutomationState({ phase: 'awaiting_proposal' });
        await waitForUrl(urlIncludesProposal, 'proposal page');
        await runProposalFlow(payload, logger);
        await setAutomationState({ isRunning: false, phase: 'done', currentStep: 'Automation completed' });
        return;
      }

      if (urlIncludesQuote()) {
        await stepLog('On quote page — running quote → premium → proposal...');
        await runQuoteChain(payload, logger);
        await setAutomationState({ isRunning: false, phase: 'done', currentStep: 'Automation completed' });
        return;
      }

      if (!window.location.href.includes('/#/dashboard')) {
        await stepLog('Starting login flow...');
        if (window.ICICILogin) {
          const loginResult = await window.ICICILogin.run(payload, logger);
          if (!loginResult?.success && !loginResult?.skipped) throw new Error('Login failed');
        }
      } else {
        await stepLog('Already on dashboard — skipping login');
      }

      await setAutomationState({ phase: 'dashboard' });
      if (!window.ICICIDashboard) throw new Error('Dashboard module not available');

      const dashboardResult = await window.ICICIDashboard.run(payload, logger);
      if (!dashboardResult?.success) throw new Error('Dashboard flow failed');

      await stepLog('Dashboard done — waiting for quote page (long load)...');
      await setAutomationState({ phase: 'awaiting_quote' });

      await waitForUrl(urlIncludesQuote, 'quote page');
      await waitForSpinnerIdle(logger);

      await runQuoteChain(payload, logger);
      await setAutomationState({
        isRunning: false,
        phase: 'done',
        currentStep: 'Automation completed',
      });
    } catch (err) {
      log('❌ Automation error:', err.message);
      await setAutomationState({
        isRunning: false,
        phase: 'error',
        lastError: err.message,
        currentStep: `Error: ${err.message}`,
      });
    } finally {
      automationRunning = false;
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === 'START_ICICI_FLOW') {
      const payload = request.payload;
      sendResponse({ success: true, status: 'started' });
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          isRunning: true,
          isStopped: false,
          phase: 'starting',
          currentStep: 'Starting...',
          payload,
          logs: [],
          startedAt: Date.now(),
        },
        lastJsonPayload: JSON.stringify(payload),
      });
      void runIciciAutomation(payload);
      return false;
    }

    if (request.type === 'GET_ICICI_STATUS') {
      getAutomationState().then((state) => sendResponse(state || {}));
      return true;
    }

    if (request.type === 'PAUSE_ICICI_FLOW') {
      setAutomationState({ isPaused: true, currentStep: 'Paused' }).then(() =>
        sendResponse({ status: 'paused' })
      );
      return true;
    }

    if (request.type === 'RESUME_ICICI_FLOW') {
      setAutomationState({ isPaused: false, currentStep: 'Resumed' }).then(() =>
        sendResponse({ status: 'resumed' })
      );
      return true;
    }

    if (request.type === 'STOP_ICICI_FLOW') {
      setAutomationState({
        isStopped: true,
        isRunning: false,
        phase: 'stopped',
        currentStep: 'Stopped',
      }).then(() => sendResponse({ status: 'stopped' }));
      return true;
    }
  });

  const STALE_MS = 90000;

  function isStateStale(state) {
    const updated = state?.updatedAt || state?.startedAt || 0;
    return updated && Date.now() - updated > STALE_MS;
  }

  // Resume after full navigation (dashboard → quote tears down the old script context)
  (async () => {
    const state = await getAutomationState();
    if (!state?.isRunning || state?.isStopped) return;

    if (isReloadNavigation()) {
      log('Manual refresh detected - stopping active automation');
      await setAutomationState({
        isStopped: true,
        isRunning: false,
        isPaused: false,
        phase: 'stopped',
        lastError: null,
        currentStep: 'Stopped (manual refresh)',
      });
      return;
    }

    if (isStateStale(state)) {
      log('Stale automation state — not resuming');
      await setAutomationState({
        isRunning: false,
        phase: 'error',
        lastError: 'Automation timed out. Open the popup and click Start again.',
        currentStep: 'Session expired',
      });
      return;
    }

    if (
      ['awaiting_quote', 'awaiting_premium', 'awaiting_proposal', 'quote', 'premium', 'proposal'].includes(
        state.phase
      )
    ) {
      log('Resuming ICICI automation after page load, phase:', state.phase);
      await sleep(500);
      void runIciciAutomation(state.payload, { resume: true });
    }
  })();

  log('✅ ICICI Content script loaded');

})();
