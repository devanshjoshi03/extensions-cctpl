(function () {
  'use strict';

  let stopRequested = false;
  const ACTION_DELAY = 500;

  function getController() {
    return window.KshemaAutomationController || null;
  }

  async function checkpoint(stepLabel) {
    const controller = getController();
    if (controller?.checkpoint) {
      await controller.checkpoint(stepLabel);
    }
    if (stopRequested) {
      throw new Error('Payment flow stopped');
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function pace() {
    await checkpoint();
    await sleep(ACTION_DELAY);
    await checkpoint();
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0';
  }

  async function waitUntil(log, description, callback, timeout = 60000) {
    const startedAt = Date.now();
    await checkpoint(`Waiting for ${description}`);
    log(`Waiting for ${description}`);

    while (Date.now() - startedAt < timeout) {
      await checkpoint(`Waiting for ${description}`);
      const result = callback();
      if (result) {
        log(`Found ${description}`);
        return result;
      }
      await sleep(250);
    }

    throw new Error(`Timed out waiting for ${description}`);
  }

  function findMakePaymentButton() {
    return Array.from(document.querySelectorAll('button')).find(item => {
      return isVisible(item) &&
        !item.disabled &&
        (item.getAttribute('data-iid') === 'make_payment_b2b' ||
          normalize(item.textContent) === 'make payment');
    }) || null;
  }

  function isPaymentStepActive() {
    return !!findMakePaymentButton() || Array.from(document.querySelectorAll('.stepper-item-text')).some(item => {
      return normalize(item.textContent).includes('payment') && item.classList.contains('stepper-active');
    });
  }

  async function clickMakePayment(log) {
    await checkpoint('Clicking Make Payment');
    const button = await waitUntil(log, 'Make Payment button', () => {
      return findMakePaymentButton();
    }, 30000);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    log('Make Payment clicked');
    await pace();
  }

  async function selectRazorpay(log) {
    await checkpoint('Selecting Razorpay');
    const button = await waitUntil(log, 'Razorpay payment option', () => {
      return Array.from(document.querySelectorAll('button')).find(item => {
        if (!isVisible(item) || item.disabled) {
          return false;
        }

        const text = normalize(item.textContent);
        return text.includes('razorpay') && text.includes('secure payment via razorpay');
      }) || Array.from(document.querySelectorAll('button')).find(item => {
        return isVisible(item) && !item.disabled && normalize(item.textContent) === 'razorpay secure payment via razorpay';
      }) || null;
    }, 30000);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    log('Razorpay selected');
    await pace();
  }

  async function markPendingPaymentResume(payload) {
    await chrome.storage.local.set({ kshemaPendingPaymentResume: payload });
  }

  async function clearPendingPaymentResume() {
    await chrome.storage.local.remove('kshemaPendingPaymentResume');
  }

  window.KshemaPayment = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isActive: isPaymentStepActive,

    async run(payload, log) {
      stopRequested = false;
      log('Payment flow started');

      if (window.location.href.startsWith('https://assurehub.kshema.co/payment')) {
        await selectRazorpay(log);
        await clearPendingPaymentResume();
        return { success: true, message: 'Kshema payment provider selected on AssureHub' };
      }

      await markPendingPaymentResume(payload);
      await clickMakePayment(log);
      return { success: true, message: 'Kshema payment page opening' };
    },

    async autoRunAfterKyc(log) {
      const result = await chrome.storage.local.get('kshemaPendingPaymentResume');
      if (!result.kshemaPendingPaymentResume) {
        return null;
      }

      return this.run(result.kshemaPendingPaymentResume, log);
    },

    async autoRunOnAssureHubPayment(log) {
      const result = await chrome.storage.local.get('kshemaPendingPaymentResume');
      if (!result.kshemaPendingPaymentResume) {
        return null;
      }

      return this.run(result.kshemaPendingPaymentResume, log);
    }
  };
})();
