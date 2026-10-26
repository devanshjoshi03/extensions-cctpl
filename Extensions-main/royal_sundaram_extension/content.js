(function () {
  'use strict';

  const provider = 'Royal Sundaram';
  const ROYAL_HOME_URL = 'https://ilounge.royalsundaram.in/';
  const ROYAL_LOGIN_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/login';
  const ROYAL_DASHBOARD_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/dashboard';
  const ROYAL_RATING_CALCULATOR_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator';
  const ROYAL_GET_QUOTE_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator/get-quote';
  const ROYAL_SELECT_PLAN_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator/select-plan';
  const ROYAL_COVERAGES_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator/coverages';
  const ROYAL_VEHICLE_DETAILS_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator/vehicle-details';
  const ROYAL_PROPOSER_DETAILS_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/rating-calculator/proposer-details';
  const ROYAL_VEHICLE_SUMMARY_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/vehicle-summary/';
  const ROYAL_KYC_URL = 'https://kyc.royalsundaram.in/eKyc/oem/kycVerification';
  const LOG_BATCH_WINDOW_MS = 100;
  const RELOAD_URL_STORAGE_KEY = 'royal:last-url';
  const pendingLogQueue = [];
  const AUTO_RESUME_RETRY_DELAY_MS = 500;
  let logFlushTimer = null;
  let autoResumeInFlight = false;
  let lastAutoResumedUrl = null;
  let monitoredUrl = window.location.href;

  function flushPendingLogs() {
    if (!pendingLogQueue.length) return;

    const logs = pendingLogQueue.splice(0, pendingLogQueue.length);
    chrome.runtime.sendMessage({
      action: 'FLOW_LOG_BATCH',
      provider,
      logs
    }, () => void chrome.runtime.lastError);
  }

  function queueLog(message) {
    pendingLogQueue.push({ message, color: '#bbf7d0', timestamp: Date.now() });

    if (logFlushTimer) return;
    logFlushTimer = setTimeout(() => {
      logFlushTimer = null;
      flushPendingLogs();
    }, LOG_BATCH_WINDOW_MS);
  }

  function getController() {
    return window.RoyalAutomationController;
  }

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

  function withStorageRemove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, resolve);
    });
  }

  function isManualReloadNavigation() {
    const previousUrl = (() => {
      try {
        return window.sessionStorage.getItem(RELOAD_URL_STORAGE_KEY) || '';
      } catch (error) {
        void error;
        return '';
      }
    })();
    const currentUrl = window.location.href;
    const isSameUrlReload = previousUrl && previousUrl === currentUrl;

    try {
      const navigationEntries = performance.getEntriesByType?.('navigation') || [];
      if (navigationEntries[0]?.type === 'reload' && isSameUrlReload) {
        return true;
      }
    } catch (error) {
      void error;
    }

    try {
      return performance.navigation?.type === 1 && isSameUrlReload;
    } catch (error) {
      void error;
      return false;
    }
  }

  function rememberCurrentUrlForReloadGuard() {
    try {
      window.sessionStorage.setItem(RELOAD_URL_STORAGE_KEY, window.location.href);
    } catch (error) {
      void error;
    }
  }

  function log(...args) {
    console.log('%c[Royal Sundaram]', 'color: #0f766e; font-weight: bold;', ...args);
    try {
      const message = args.map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch (error) {
          return String(arg);
        }
      }).join(' ');
      queueLog(message);
    } catch (error) {
      void error;
    }
  }

  function logStep(step, details) {
    if (typeof details === 'undefined') {
      log(`[STEP] ${step}`);
      return;
    }
    log(`[STEP] ${step}`, details);
  }

  function isRoyalWorkflowUrl(url = window.location.href) {
    return url.startsWith(ROYAL_HOME_URL) || url.startsWith(ROYAL_KYC_URL);
  }

  function hasVehicleSummaryKycButton() {
    return Array.from(document.querySelectorAll('button.btn.btn-primary, button'))
      .some((candidate) => String(candidate.textContent || '').replace(/\s+/g, ' ').trim() === 'KYC Verification');
  }

  function hasFlowDependenciesForCurrentPage() {
    if (window.location.href.startsWith(ROYAL_KYC_URL)) {
      return Boolean(getController() && window.RoyalVehicleSummaryProposer);
    }

    if (window.location.href.startsWith(ROYAL_VEHICLE_SUMMARY_URL)) {
      if (hasVehicleSummaryKycButton()) {
        return Boolean(getController() && window.RoyalVehicleSummaryProposer);
      }
      return Boolean(getController() && window.RoyalVehicleSummary);
    }

    if (window.location.href.startsWith(ROYAL_VEHICLE_DETAILS_URL)) {
      return Boolean(getController() && window.RoyalVehicleDetails);
    }

    if (window.location.href.startsWith(ROYAL_PROPOSER_DETAILS_URL)) {
      return Boolean(getController() && window.RoyalProposerDetails);
    }

    if (window.location.href.startsWith(ROYAL_COVERAGES_URL)) {
      return Boolean(getController() && window.RoyalCoverages);
    }

    if (window.location.href.startsWith(ROYAL_SELECT_PLAN_URL)) {
      return Boolean(getController() && window.RoyalSelectPlan);
    }

    if (window.location.href.startsWith(ROYAL_GET_QUOTE_URL)) {
      return Boolean(getController() && window.RoyalGetQuote);
    }

    if (window.location.href.startsWith(ROYAL_RATING_CALCULATOR_URL)) {
      return Boolean(getController() && window.RoyalRatingCalculator);
    }

    if (window.location.href.startsWith(ROYAL_DASHBOARD_URL)) {
      return Boolean(getController() && window.RoyalDashboard);
    }

    if (window.location.href.startsWith(ROYAL_LOGIN_URL)) {
      return Boolean(getController() && window.RoyalLogin);
    }

    return Boolean(getController());
  }

  async function waitForFlowDependencies(timeoutMs = 4000) {
    const startedAt = Date.now();
    while (!hasFlowDependenciesForCurrentPage()) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('Royal flow scripts did not finish loading in time.');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function resetAllFlows() {
    const flows = [
      window.RoyalLogin,
      window.RoyalDashboard,
      window.RoyalRatingCalculator,
      window.RoyalGetQuote,
      window.RoyalSelectPlan,
      window.RoyalCoverages,
      window.RoyalVehicleDetails,
      window.RoyalProposerDetails,
      window.RoyalVehicleSummary,
      window.RoyalVehicleSummaryProposer
    ];
    flows.forEach((flow) => flow?.reset?.());
  }

  async function stopAllFlows() {
    const flows = [
      window.RoyalLogin,
      window.RoyalDashboard,
      window.RoyalRatingCalculator,
      window.RoyalGetQuote,
      window.RoyalSelectPlan,
      window.RoyalCoverages,
      window.RoyalVehicleDetails,
      window.RoyalProposerDetails,
      window.RoyalVehicleSummary,
      window.RoyalVehicleSummaryProposer
    ];
    flows.forEach((flow) => flow?.stop?.());
  }

  async function dispatchFlow(moduleName, flowRef, payload, beforeStep, successStep) {
    const controller = getController();
    if (controller) {
      await controller.checkpoint(beforeStep, moduleName);
    }

    if (!flowRef || typeof flowRef.run !== 'function') {
      throw new Error(`Royal ${moduleName} flow is not loaded.`);
    }

    logStep(`Invoking ${moduleName}.run`);
    const result = await flowRef.run(payload || {}, log);

    if (controller && result?.success && successStep) {
      await controller.setStep(successStep, moduleName);
    }

    chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result, payload }, () => void chrome.runtime.lastError);
    return result;
  }

  async function startFlow(payload, options = {}) {
    const controller = getController();
    const resumeMode = Boolean(options.resumeMode);

    if (!resumeMode) {
      await controller?.startRun('Starting automation', 'start');
      await resetAllFlows();
    } else {
      const state = await controller?.getState();
      if (state?.isStopped) {
        return { success: false, error: 'Automation stopped' };
      }
      if (!state?.isRunning) {
        await controller?.startRun('Resuming automation', 'resume');
      }
    }

    log('START_FULL_FLOW received', { url: window.location.href, payload, resumeMode });
    logStep('Persisting pending payload for cross-page execution');
    await withStorageSet({ royalPendingPayload: payload || {} });

    if (window.location.href.startsWith(ROYAL_KYC_URL)) {
      logStep('Dispatching flow by URL', { matched: 'KYC', url: window.location.href });
      const result = await dispatchFlow(
        'VehicleSummaryProposer',
        window.RoyalVehicleSummaryProposer,
        payload,
        'Completing KYC',
        'KYC handled'
      );
      if (result?.success) {
        await withStorageRemove(['royalVehicleSummaryMode', 'royalPendingPayload']);
        await controller?.finishRun(result.message || 'KYC handled', 'kyc');
      }
      return result;
    }

    if (window.location.href.startsWith(ROYAL_VEHICLE_SUMMARY_URL)) {
      const { royalVehicleSummaryMode } = await withStorageGet(['royalVehicleSummaryMode']);
      if (royalVehicleSummaryMode === 'afterProposer') {
        logStep('Dispatching flow by stored mode', {
          matched: 'Vehicle Summary Proposer Branch',
          mode: royalVehicleSummaryMode,
          url: window.location.href
        });
        return dispatchFlow(
          'VehicleSummaryProposer',
          window.RoyalVehicleSummaryProposer,
          payload,
          'Handling KYC verification',
          'KYC verification handled'
        );
      }

      if (hasVehicleSummaryKycButton()) {
        logStep('Dispatching flow by page state', {
          matched: 'Vehicle Summary KYC Branch',
          url: window.location.href
        });
        const result = await dispatchFlow(
          'VehicleSummaryProposer',
          window.RoyalVehicleSummaryProposer,
          payload,
          'Handling KYC verification',
          'KYC verification handled'
        );
        if (result?.success && !result.redirected) {
          await withStorageRemove(['royalVehicleSummaryMode', 'royalPendingPayload']);
          await controller?.finishRun(result.message || 'KYC verification handled', 'vehicle-summary-kyc');
        }
        return result;
      }

      logStep('Dispatching flow by URL', { matched: 'Vehicle Summary', url: window.location.href });
      const result = await dispatchFlow(
        'VehicleSummary',
        window.RoyalVehicleSummary,
        payload,
        'Handling vehicle summary',
        'Vehicle summary handled'
      );
      if (result?.success) {
        await controller?.finishRun(result.message || 'Vehicle summary handled', 'vehicle-summary');
      }
      return result;
    }

    if (window.location.href.startsWith(ROYAL_VEHICLE_DETAILS_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Vehicle Details', url: window.location.href });
      return dispatchFlow(
        'VehicleDetails',
        window.RoyalVehicleDetails,
        payload,
        'Entering vehicle details',
        'Vehicle details entered'
      );
    }

    if (window.location.href.startsWith(ROYAL_PROPOSER_DETAILS_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Proposer Details', url: window.location.href });
      return dispatchFlow(
        'ProposerDetails',
        window.RoyalProposerDetails,
        payload,
        'Entering proposer details',
        'Proposer details entered'
      );
    }

    if (window.location.href.startsWith(ROYAL_COVERAGES_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Coverages', url: window.location.href });
      return dispatchFlow(
        'Coverages',
        window.RoyalCoverages,
        payload,
        'Handling coverages',
        'Coverages handled'
      );
    }

    if (window.location.href.startsWith(ROYAL_SELECT_PLAN_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Select Plan', url: window.location.href });
      return dispatchFlow(
        'SelectPlan',
        window.RoyalSelectPlan,
        payload,
        'Selecting plan',
        'Plan selected'
      );
    }

    if (window.location.href.startsWith(ROYAL_GET_QUOTE_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Get Quote', url: window.location.href });
      return dispatchFlow(
        'GetQuote',
        window.RoyalGetQuote,
        payload,
        'Preparing quote details',
        'Quote details entered'
      );
    }

    if (window.location.href.startsWith(ROYAL_RATING_CALCULATOR_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Rating Calculator', url: window.location.href });
      return dispatchFlow(
        'RatingCalculator',
        window.RoyalRatingCalculator,
        payload,
        'Selecting New Bike',
        'New Bike clicked'
      );
    }

    if (window.location.href.startsWith(ROYAL_DASHBOARD_URL)) {
      logStep('Dispatching flow by URL', { matched: 'Dashboard', url: window.location.href });
      return dispatchFlow(
        'Dashboard',
        window.RoyalDashboard,
        payload,
        'Opening Motor Cycle section',
        'Motor Cycle section opened'
      );
    }

    if (!isRoyalWorkflowUrl(window.location.href)) {
      await controller?.setStep('Opening Royal Sundaram login page', 'redirect-login');
      logStep('Redirecting from non-Royal page to Royal login page', { from: window.location.href, to: ROYAL_LOGIN_URL });
      window.location.href = ROYAL_LOGIN_URL;
      return { success: true, redirected: true };
    }

    if (window.location.href.startsWith(ROYAL_HOME_URL) && !window.location.href.startsWith(ROYAL_LOGIN_URL)) {
      await controller?.setStep('Opening Royal Sundaram login page', 'redirect-login');
      logStep('Redirecting Royal page to exact login page', { from: window.location.href, to: ROYAL_LOGIN_URL });
      window.location.href = ROYAL_LOGIN_URL;
      return { success: true, redirected: true };
    }

    logStep('Dispatching flow by URL', { matched: 'Login', url: window.location.href });
    return dispatchFlow(
      'Login',
      window.RoyalLogin,
      payload,
      'Filling username',
      'Username filled'
    );
  }

  async function handleAutomationStart(payload, options = {}) {
    try {
      await startFlow(payload, options);
    } catch (error) {
      if (error.message === 'AUTOMATION_STOPPED') {
        await getController()?.failRun('Stopped', 'stopped');
        await stopAllFlows();
        log('Automation stopped');
        return;
      }

      await getController()?.failRun(`Failed: ${error.message}`, 'failed');
      log('Unexpected flow error:', error.message);
      chrome.runtime.sendMessage({
        action: 'FLOW_RESULT',
        result: { success: false, error: error.message },
        payload
      }, () => void chrome.runtime.lastError);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const action = msg.action || msg.type;

    if (action === 'START_LOGIN' || action === 'START_FULL_FLOW' || action === 'START_ROYAL_FLOW') {
      handleAutomationStart(msg.payload, { resumeMode: false });
      sendResponse({ status: 'started', provider });
      return false;
    }

    if (action === 'PAUSE_AUTOMATION' || action === 'PAUSE_ROYAL_FLOW') {
      (async () => {
        await getController()?.pause();
        log('Pause requested');
        sendResponse({ status: 'paused' });
      })();
      return true;
    }

    if (action === 'RESUME_AUTOMATION' || action === 'RESUME_ROYAL_FLOW') {
      (async () => {
        await getController()?.resume();
        log('Resume requested');
        sendResponse({ status: 'resumed' });
      })();
      return true;
    }

    if (action === 'STOP_AUTOMATION' || action === 'STOP_ROYAL_FLOW') {
      (async () => {
        await getController()?.stop();
        await stopAllFlows();
        log('Stop requested');
        sendResponse({ status: 'stopped' });
      })();
      return true;
    }

    if (action === 'GET_AUTOMATION_STATUS') {
      (async () => {
        const state = await getController()?.getState();
        sendResponse(state);
      })();
      return true;
    }

    if (action === 'PING') {
      sendResponse({ status: 'alive', provider });
      return true;
    }

    return false;
  });

  async function autoResumeFromPendingPayload() {
    if (autoResumeInFlight) return;
    autoResumeInFlight = true;

    try {
    const { royalPendingPayload } = await withStorageGet(['royalPendingPayload']);
    if (!royalPendingPayload) return;

    await waitForFlowDependencies();

    const state = await getController()?.getState();
    if (state?.isStopped) return;
    if (lastAutoResumedUrl === window.location.href && state?.isRunning) return;

    lastAutoResumedUrl = window.location.href;
    logStep('Auto-resuming flow on current page', { url: window.location.href });
    handleAutomationStart(royalPendingPayload, { resumeMode: true });
    } finally {
      autoResumeInFlight = false;
    }
  }

  async function stopAutomationOnManualReload() {
    if (!isManualReloadNavigation()) return false;

    const state = await getController()?.getState();
    const { royalPendingPayload } = await withStorageGet(['royalPendingPayload']);

    if (state?.isRunning || royalPendingPayload) {
      logStep('Reload detected during active automation; keeping Royal automation running');
      return false;
    }

    logStep('Manual reload detected; stopping Royal automation state');
    await withStorageRemove(['royalPendingPayload', 'royalVehicleSummaryMode', 'royalVehicleSummaryStage']);
    await getController()?.stop();
    await stopAllFlows();
    return true;
  }

  function scheduleAutoResumeRetry() {
    setTimeout(() => {
      autoResumeFromPendingPayload().catch((error) => {
        log('Auto flow retry failed:', error.message);
      });
    }, AUTO_RESUME_RETRY_DELAY_MS);
  }

  function handleWorkflowUrlChange(nextUrl) {
    if (nextUrl === monitoredUrl) return;
    monitoredUrl = nextUrl;
    lastAutoResumedUrl = null;

    if (!isRoyalWorkflowUrl(nextUrl)) return;

    logStep('Detected workflow URL change', { url: nextUrl });
    scheduleAutoResumeRetry();
  }

  function startWorkflowUrlMonitor() {
    const observer = new MutationObserver(() => {
      handleWorkflowUrlChange(window.location.href);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener('popstate', () => handleWorkflowUrlChange(window.location.href));
    window.addEventListener('hashchange', () => handleWorkflowUrlChange(window.location.href));

    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      const result = originalPushState(...args);
      handleWorkflowUrlChange(window.location.href);
      return result;
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      const result = originalReplaceState(...args);
      handleWorkflowUrlChange(window.location.href);
      return result;
    };

    setInterval(() => {
      handleWorkflowUrlChange(window.location.href);
    }, 500);
  }

  log('Loaded on:', window.location.href);
  startWorkflowUrlMonitor();
  rememberCurrentUrlForReloadGuard();
  window.addEventListener('beforeunload', rememberCurrentUrlForReloadGuard);

  stopAutomationOnManualReload().then((didStopForReload) => {
    if (didStopForReload) {
      return;
    }

    if (
    window.location.href.startsWith(ROYAL_LOGIN_URL) ||
    window.location.href.startsWith(ROYAL_DASHBOARD_URL) ||
    window.location.href.startsWith(ROYAL_RATING_CALCULATOR_URL) ||
    window.location.href.startsWith(ROYAL_GET_QUOTE_URL) ||
    window.location.href.startsWith(ROYAL_COVERAGES_URL) ||
    window.location.href.startsWith(ROYAL_SELECT_PLAN_URL) ||
    window.location.href.startsWith(ROYAL_VEHICLE_DETAILS_URL) ||
    window.location.href.startsWith(ROYAL_PROPOSER_DETAILS_URL) ||
    window.location.href.startsWith(ROYAL_VEHICLE_SUMMARY_URL) ||
    window.location.href.startsWith(ROYAL_KYC_URL)
    ) {
      autoResumeFromPendingPayload().catch((error) => {
        log('Auto flow resume failed:', error.message);
      });
    }
  }).catch((error) => {
    log('Reload guard failed:', error.message);
  });
})();
