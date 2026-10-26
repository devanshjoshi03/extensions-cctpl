(function () {
  'use strict';

  function getController() {
    return window.RoyalAutomationController || null;
  }

  async function checkpoint(step, key = step) {
    await getController()?.checkpoint(step, key);
  }

  function waitForNewBikeButton(timeout = 15000) {
    const findButton = () => {
      const byId = document.querySelector('a#insure_bike');
      if (byId) return byId;

      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.find((anchor) => {
        const text = anchor.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
        const img = anchor.querySelector('img[src*="blue-bike-arrow.svg"]');
        return text.includes('new bike') || Boolean(img);
      });
    };

    return new Promise((resolve, reject) => {
      const existing = findButton();
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = findButton();
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout waiting for New Bike button.'));
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
      log(`[Rating Calculator] ${step}`);
      return;
    }
    log(`[Rating Calculator] ${step}`, details);
  }

  async function run(payload, log = console.log) {
    await checkpoint('Waiting for New Bike option', 'rating:wait-new-bike');
    await waitForPageReady(log);
    logStep(log, 'Flow started');
    log('Finding New Bike option on Royal Sundaram rating calculator');
    const newBikeButton = await waitForNewBikeButton();
    await checkpoint('Clicking New Bike option', 'rating:click-new-bike');
    await waitForPageReady(log);
    logStep(log, 'New Bike button located');
    clickElement(newBikeButton);
    logStep(log, 'New Bike button clicked');
    log('Waiting for navigation to get quote page');
    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'New Bike clicked. Waiting for get quote page.' };
  }

  window.RoyalRatingCalculator = { run };
})();
