(function () {
  'use strict';

  let stopRequested = false;
  let prevClickedThisRun = false;
  let nextClickedThisRun = false;
  const ACTION_DELAY = 1500;

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getController() {
    return window.KshemaAutomationController || null;
  }

  async function checkpoint(stepLabel) {
    const controller = getController();
    if (controller?.checkpoint) {
      await controller.checkpoint(stepLabel);
    }
    if (stopRequested) {
      throw new Error('Summary flow stopped');
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

  async function waitUntil(log, description, callback, timeout = 30000) {
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

  function isSummaryStepActive() {
    return Array.from(document.querySelectorAll('.stepper-item-text, [class*="stepper"]')).some(item => {
      return normalize(item.textContent).includes('summary') &&
        item.classList.contains('stepper-active');
    });
  }

  function isCustomerDetailsStepActive() {
    return Array.from(document.querySelectorAll('.stepper-item-text, [class*="stepper"]')).some(item => {
      return normalize(item.textContent).includes('customer details') &&
        item.classList.contains('stepper-active');
    });
  }

  async function waitForCustomerDetailsStep(log) {
    await waitUntil(log, 'Customer Details step active', isCustomerDetailsStepActive, 60000);
  }

  async function clickPrevChevron(log) {
    if (prevClickedThisRun) {
      await checkpoint('Previous chevron already clicked');
      log('Previous chevron already clicked');
      return;
    }

    await checkpoint('Clicking previous chevron');
    const button = await waitUntil(log, 'previous chevron', () => {
      return Array.from(document.querySelectorAll('mat-icon')).find(item => {
        return isVisible(item) &&
          item.getAttribute('data-iid') === 'prev' &&
          normalize(item.textContent) === 'chevron_left';
      });
    }, 15000);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    prevClickedThisRun = true;
    await checkpoint('Previous chevron clicked');
    log('Previous chevron clicked');
    await pace();
  }

  async function clickNextChevron(log) {
    if (nextClickedThisRun) {
      await checkpoint('Next chevron already clicked');
      log('Next chevron already clicked');
      return;
    }

    await checkpoint('Clicking next chevron');
    const button = await waitUntil(log, 'next chevron', () => {
      return Array.from(document.querySelectorAll('mat-icon')).find(item => {
        return isVisible(item) &&
          item.getAttribute('data-iid') === 'next' &&
          normalize(item.textContent) === 'chevron_right';
      });
    }, 15000);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    nextClickedThisRun = true;
    await checkpoint('Next chevron clicked');
    log('Next chevron clicked');
    await pace();
  }

  async function extractSummaryValues(log) {
    await checkpoint('Extracting summary data');
    await sleep(2000);
    const covers = arguments[1] || {};

    const readPremiumValue = async (labelText, valueSelector, key) => {
      await checkpoint(`Extracting ${key}`);
      log(`Extracting ${key}`);
      await sleep(1200);

      const value = [...document.querySelectorAll('.premium-item')]
        .find(element => element.querySelector('.item-label')?.textContent.includes(labelText))
        ?.querySelector(valueSelector)
        ?.textContent
        .trim() || null;

      console.log(`[Kshema][Summary] ${key}:`, value);
      log(`${key}: ${value}`);
      await checkpoint(`Extracted ${key}`);
      return value;
    };

    const odDiscount = await readPremiumValue('TOTAL OWN DAMAGE PREMIUM', '.item-values', 'odDiscount');
    const nd = covers.nilDepreciation === true
      ? await readPremiumValue('Nil Depreciation Premium', '.item-value', 'nd')
      : null;
    const rti = covers.returnToInvoice === true
      ? await readPremiumValue('Return to Invoice Cover', '.item-value', 'rti')
      : null;
    const engineProtectionCover = covers.engineProtector === true
      ? await readPremiumValue('Engine Protection Cover Premium', '.item-value', 'engineProtectionCover')
      : null;

    const extracted = {
      odDiscount,
      nd,
      rti,
      engineProtectionCover
    };

    window.KshemaSummaryData = extracted;
    console.log('[Kshema][Summary] Data:', extracted);
    console.log('[Kshema][Summary] odDiscount:', odDiscount);
    console.log('[Kshema][Summary] nd:', nd);
    console.log('[Kshema][Summary] rti:', rti);
    console.log('[Kshema][Summary] engineProtectionCover:', engineProtectionCover);
    log(`Summary data: ${JSON.stringify(extracted)}`);
    return extracted;
  }

  window.KshemaSummary = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
      prevClickedThisRun = false;
      nextClickedThisRun = false;
    },

    isActive: isSummaryStepActive,

    async run(payload, log) {
      stopRequested = false;
      prevClickedThisRun = false;
      nextClickedThisRun = false;
      const covers = payload?.covers || {};

      await waitForCustomerDetailsStep(log);
      await clickPrevChevron(log);
      await sleep(2500);
      await extractSummaryValues(log, covers);
      await sleep(2000);
      await clickNextChevron(log);

      if (window.KshemaCustomerDetails && typeof window.KshemaCustomerDetails.run === 'function') {
        return window.KshemaCustomerDetails.run(payload, log);
      }

      return { success: true, message: 'Kshema summary flow completed' };
    }
  };
})();
