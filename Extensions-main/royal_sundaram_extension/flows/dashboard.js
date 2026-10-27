(function () {
  'use strict';

  function getController() {
    return window.RoyalAutomationController || null;
  }

  async function checkpoint(step, key = step) {
    await getController()?.checkpoint(step, key);
  }

  function waitForMotorCycleItem(timeout = 15000) {
    const findItem = () => {
      const anchors = Array.from(document.querySelectorAll('li a'));
      return anchors.find((anchor) => {
        const text = anchor.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
        const img = anchor.querySelector('img[src*="motorcycle.png"]');
        return text.includes('motor cycle') || Boolean(img);
      });
    };

    return new Promise((resolve, reject) => {
      const existing = findItem();
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = findItem();
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout waiting for Motor Cycle dashboard item.'));
      }, timeout);
    });
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function isBlockingSpinnerVisible() {
    return Array.from(document.querySelectorAll(
      'div.spinner-grow[role="status"], .spinner-grow.text-dark, .spinner-grow'
    )).some(isVisible);
  }

  async function waitForPageReady(log = console.log, timeout = 30000) {
    const startedAt = Date.now();
    let didLog = false;

    while (isBlockingSpinnerVisible()) {
      if (!didLog) {
        log('Waiting for Royal Sundaram loader to finish');
        didLog = true;
      }
      if (Date.now() - startedAt > timeout) {
        throw new Error('Royal Sundaram loader did not disappear.');
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    element.focus?.();
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Dashboard] ${step}`);
      return;
    }
    log(`[Dashboard] ${step}`, details);
  }

  async function run(payload, log = console.log) {
    await checkpoint('Waiting for Motor Cycle item', 'dashboard:wait-motor-cycle');
    await waitForPageReady(log);
    logStep(log, 'Flow started');
    log('Finding Motor Cycle item on Royal Sundaram dashboard');
    const motorCycleAnchor = await waitForMotorCycleItem();
    await checkpoint('Clicking Motor Cycle item', 'dashboard:click-motor-cycle');
    await waitForPageReady(log);
    logStep(log, 'Motor Cycle item located');
    clickElement(motorCycleAnchor);
    logStep(log, 'Motor Cycle item clicked');

    if (typeof RoyalRatingCalculator !== 'undefined' && RoyalRatingCalculator.run) {
      log('Waiting for New Bike option after Motor Cycle click');
      logStep(log, 'Handing off to rating calculator flow');
      const ratingResult = await RoyalRatingCalculator.run(payload, log);
      if (!ratingResult?.success) {
        return ratingResult;
      }
      logStep(log, 'Flow completed successfully');
      return { success: true, message: 'Motor Cycle and New Bike clicked.' };
    }

    logStep(log, 'Rating calculator flow unavailable; clearing pending payload');
    await chrome.storage.local.remove(['royalPendingPayload']);
    return { success: false, error: 'Royal rating calculator flow is not loaded.' };
  }

  window.RoyalDashboard = { run };
})();
