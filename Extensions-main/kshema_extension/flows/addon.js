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
      throw new Error('Addon flow stopped');
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

  function isTruthy(value) {
    return value === true || value === 1 || value === '1' || normalize(value) === 'true';
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

  async function waitForVisible(selector, log, timeout) {
    return waitUntil(log, `visible ${selector}`, () => {
      return Array.from(document.querySelectorAll(selector)).find(isVisible);
    }, timeout);
  }

  function isDisabled(element) {
    return element.disabled ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.classList.contains('mat-mdc-button-disabled') ||
      element.classList.contains('mdc-button--disabled');
  }

  async function clickVisible(selector, label, log, timeout) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitForVisible(selector, log, timeout);
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  async function clickAddonRadio(wantYes, log) {
    const targetValue = wantYes ? 'Yes' : 'No';
    await checkpoint(`Selecting Addon ${targetValue} radio`);
    const input = await waitUntil(log, `addon ${targetValue} radio`, () => {
      return Array.from(document.querySelectorAll(`mat-radio-group input[type="radio"][value="${targetValue}"]`)).find(item => {
        const wrapper = item.closest('.mdc-form-field, mat-radio-button, .mat-mdc-radio-button, .mdc-radio') || item;
        return isVisible(wrapper) && !item.disabled;
      });
    }, 60000);

    const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
    const clickTarget = label || findRadioClickTarget(input) || input;
    clickElement(clickTarget);
    await waitUntil(log, `addon ${targetValue} radio selected`, () => input.checked, 5000);
    log(`Addon ${targetValue} radio clicked`);
    await pace();
  }

  function hasSelectedCovers(covers) {
    if (!covers || typeof covers !== 'object') {
      return false;
    }

    return [
      covers.nilDepreciation,
      covers.returnToInvoice,
      covers.engineProtector
    ].some(isTruthy);
  }

  async function clickWhenReady(selector, label, log, timeout = 60000) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitUntil(log, `${label} ready`, () => {
      return Array.from(document.querySelectorAll(selector)).find(item => isVisible(item) && !isDisabled(item));
    }, timeout);

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  function waitForQuoteResponseErrors(timeout = 15000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, timeout);

      function onMessage(event) {
        if (event.source !== window ||
          event.data?.source !== 'KSHEMA_QUOTE_RESPONSE_HOOK' ||
          event.data?.type !== 'QUOTE_RESPONSE') {
          return;
        }

        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(Array.isArray(event.data.errors) ? event.data.errors : []);
      }

      window.addEventListener('message', onMessage);
    });
  }

  function formatQuoteErrors(errors) {
    return errors
      .map(error => {
        const name = String(error?.name || '').trim();
        const msg = String(error?.msg || '').trim();
        return name && msg ? `${name}: ${msg}` : name || msg;
      })
      .filter(Boolean)
      .join('\n');
  }

  async function clickAndCheckQuoteErrors(selector, label, log) {
    const quoteResponseErrors = waitForQuoteResponseErrors();
    await clickWhenReady(selector, label, log);

    const errors = await quoteResponseErrors;
    if (errors === null) {
      log(`No /api/v1/quote response captured after ${label}; continuing`);
      return;
    }

    const blockingErrors = errors.filter(error =>
      String(error?.name || '').trim().toLowerCase() !== 'do_you_want_addon'
    );
    const errorMessage = formatQuoteErrors(blockingErrors);
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    if (blockingErrors.length !== errors.length) {
      log('Ignoring do_you_want_addon validation; continuing to addon flow');
    } else {
      log('/api/v1/quote response has no errors; continuing');
    }
  }

  function clickElement(element) {
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  function findRadioClickTarget(input, preferBackground = false) {
    if (!input) return null;

    const radio = input.closest('.mdc-radio');
    if (preferBackground) {
      return radio?.querySelector('.mdc-radio__background') || radio || input;
    }

    return input.closest('.mdc-form-field')?.querySelector('.mat-mdc-radio-touch-target, .mdc-radio, label') ||
      input.closest('mat-radio-button')?.querySelector('.mat-mdc-radio-touch-target, .mdc-radio, label') ||
      input.closest('.mat-mdc-radio-button')?.querySelector('.mat-mdc-radio-touch-target, .mdc-radio, label') ||
      radio ||
      input;
  }

  function findAddonByLabel(label) {
    const target = normalize(label).replace(/\s+addon$/, '');
    const candidates = Array.from(document.querySelectorAll(
      'tr, mat-row, .mat-mdc-row, .mat-row, [class*="row"], [class*="addon"], [class*="cover"]'
    ));

    return candidates.find(item => {
      const text = normalize(item.textContent);
      return isVisible(item) && text.includes(target);
    });
  }

  function findYesRadio(root) {
    if (!root) return null;

    const yesInput = Array.from(root.querySelectorAll('input[type="radio"]')).find(input => {
      const value = normalize(input.value);
      const labelText = normalize(input.closest('mat-radio-button, label, .mat-mdc-radio-button')?.textContent);
      return value === 'yes' || labelText === 'yes' || labelText.includes(' yes ');
    });

    return findRadioClickTarget(yesInput);
  }

  async function waitForLoadingComplete(log, timeout = 60000) {
    const loadingSelectors = [
      '.mat-mdc-progress-spinner',
      '.mat-progress-spinner',
      '.mat-spinner',
      'mat-spinner',
      'mat-progress-spinner',
      '.cdk-overlay-backdrop',
      '.ngx-spinner-overlay',
      '.loading',
      '.loader',
      '[class*="loading"]',
      '[class*="loader"]',
      '[aria-busy="true"]'
    ];

    await waitUntil(log, 'loading to complete', () => {
      return !loadingSelectors.some(selector => {
        return Array.from(document.querySelectorAll(selector)).some(isVisible);
      });
    }, timeout);
    await pace();
  }

  function isAddonStepActive() {
    return Array.from(document.querySelectorAll('.stepper-item-text, [class*="stepper"]')).some(item => {
      return normalize(item.textContent).includes('addon') &&
        item.classList.contains('stepper-active');
    });
  }

  async function waitForAddonStep(log) {
    await waitUntil(log, 'Addon step active', isAddonStepActive, 60000);
  }

  async function clickAddonIfEnabled(selector, label, log) {
    await checkpoint(`Selecting ${label}`);
    const element = await waitUntil(log, `${label} option`, () => {
      const bySelector = Array.from(document.querySelectorAll(selector)).find(isVisible);
      if (bySelector) return bySelector;

      const addonRow = findAddonByLabel(label);
      return findYesRadio(addonRow);
    }, 20000);

    const input = element.matches('input') ? element : element.querySelector('input[type="radio"]');
    const checked = input?.checked || element.getAttribute('aria-checked') === 'true';

    if (!checked) {
      clickElement(findRadioClickTarget(input) || element);
      log(`${label} selected`);
      await pace();
    } else {
      log(`${label} already selected`);
      await pace();
    }
  }

  window.KshemaAddon = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isActive: isAddonStepActive,

    async run(payload, log) {
      stopRequested = false;
      log('Addon flow started');

      const covers = payload?.covers || payload?.Covers || {};
      const shouldSelectAddonYes = hasSelectedCovers(covers);

      await waitForAddonStep(log);
      await clickAddonRadio(shouldSelectAddonYes, log);

      if (!shouldSelectAddonYes) {
        log('No addon covers selected in JSON; Addon No radio chosen');
      }

      if (isTruthy(covers.nilDepreciation)) {
        await clickAddonIfEnabled('[data-iid="addon_cover.0.opted"]', 'Nil Depreciation addon', log);
      } else {
        log('Nil Depreciation addon skipped from JSON');
      }

      if (isTruthy(covers.returnToInvoice)) {
        await clickAddonIfEnabled('[data-iid="addon_cover.1.opted"]', 'Return To Invoice addon', log);
      } else {
        log('Return To Invoice addon skipped from JSON');
      }

      if (isTruthy(covers.engineProtector)) {
        await clickAddonIfEnabled('[data-iid="addon_cover.2.opted"]', 'Engine Protector addon', log);
      } else {
        log('Engine Protector addon skipped from JSON');
      }

      await clickAndCheckQuoteErrors('button[data-iid="save_continue"]', 'Addon Save and Continue', log);
      await waitForLoadingComplete(log);
      await clickAndCheckQuoteErrors('button[data-iid="save_finalize"]', 'Addon Save and Finalize', log);

      if (window.KshemaSummary && typeof window.KshemaSummary.run === 'function') {
        log('Waiting for Summary step after addon finalize');
        const summaryResult = await window.KshemaSummary.run(payload, log);
        return summaryResult;
      }

      return { success: true, message: 'Kshema addon flow completed' };
    }
  };
})();
