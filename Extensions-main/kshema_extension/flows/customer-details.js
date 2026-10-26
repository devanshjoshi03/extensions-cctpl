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
      throw new Error('Customer Details flow stopped');
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

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

  function setNativeValue(element, value) {
    const stringValue = String(value);
    const descriptor = element instanceof HTMLInputElement
      ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      : Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function fillInput(selector, value, label, log) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Entering ${label}`);
    const input = await waitForVisible(selector, log);
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    input.focus();
    setNativeValue(input, value);
    await pace();
    log(`${label} entered: ${value}`);
  }

  async function clickWhenReady(selector, label, log, timeout = 60000) {
    const element = await waitUntil(log, `${label} ready`, () => {
      return Array.from(document.querySelectorAll(selector)).find(item => isVisible(item) && !item.disabled);
    }, timeout);

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  async function clickNavigateNext(log) {
    const icon = await waitUntil(log, 'navigate_next icon', () => {
      return Array.from(document.querySelectorAll('mat-icon')).find(item => {
        return normalize(item.textContent) === 'navigate_next' && isVisible(item);
      });
    }, 30000);

    icon.scrollIntoView({ block: 'center', inline: 'nearest' });
    icon.click();
    log('navigate_next clicked');
    await pace();
  }

  function extractQuoteNumberFromUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const match = parsed.pathname.match(/\/quote\/data\/([^/?]+)/i);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  async function clickDownloadQuoteAndLogNumber(log) {
    await checkpoint('Capturing quote number');

    const downloadPromise = new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'AWAIT_KSHEMA_QUOTE_DOWNLOAD', timeoutMs: 20000 }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.success) {
          reject(new Error(response?.error || 'Unable to capture quote download'));
          return;
        }

        resolve(response);
      });
    });

    const icon = await waitUntil(log, 'download quote icon', () => {
      return Array.from(document.querySelectorAll('mat-icon')).find(item => {
        return isVisible(item) &&
          (item.getAttribute('data-iid') === 'dnld-download-quote' ||
            normalize(item.textContent) === 'download_outline');
      });
    }, 30000);

    icon.scrollIntoView({ block: 'center', inline: 'nearest' });
    icon.click();
    log('Download quote icon clicked');
    await pace();

    log('Waiting for quote download request');
    const downloadResult = await downloadPromise;
    const quoteUrl = downloadResult.url;
    const quoteNumber = downloadResult.quoteNumber || extractQuoteNumberFromUrl(quoteUrl);
    if (!quoteNumber) {
      throw new Error(`Unable to extract quote number from URL: ${quoteUrl}`);
    }

    log(`Quote download URL captured: ${quoteUrl}`);
    log(`Quote number: ${quoteNumber}`);
    return quoteNumber;
  }

  async function selectMatOption(selectSelector, expectedValue, label, log) {
    if (!expectedValue) {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Selecting ${label}`);
    const select = await waitForVisible(selectSelector, log);
    select.scrollIntoView({ block: 'center', inline: 'nearest' });
    select.click();
    log(`${label} dropdown clicked`);
    await pace();

    const expected = normalize(expectedValue);
    const option = await waitUntil(log, `${label} option ${expectedValue}`, () => {
      return Array.from(document.querySelectorAll('mat-option')).find(item => {
        return normalize(item.textContent) === expected;
      });
    }, 15000);

    option.click();
    log(`${label} selected: ${compact(option.textContent)}`);
    await pace();
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

  function readCustomerDetails(payload) {
    const customerDetails = payload?.customerDetails || payload?.customerdetails;
    if (!customerDetails) {
      throw new Error('Missing customerDetails in pasted JSON');
    }
    return customerDetails;
  }

  function buildAddress(customerDetails) {
    const address = customerDetails.address || {};
    return compact([
      address.building,
      address.street,
      address.pincode || customerDetails.pincode,
      address.city || customerDetails.city
    ].filter(Boolean).join(' '));
  }

  window.KshemaCustomerDetails = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isActive: isCustomerDetailsStepActive,

    async run(payload, log) {
      stopRequested = false;
      log('Customer Details flow started');

      await waitForCustomerDetailsStep(log);

      const customerDetails = readCustomerDetails(payload);
      const address = buildAddress(customerDetails);

      await clickDownloadQuoteAndLogNumber(log);
      await selectMatOption('mat-select[data-iid="c_gender"]', customerDetails.gender, 'Gender', log);
      await fillInput('input[data-iid="c_date_of_birth"]', customerDetails.dateOfBirth || customerDetails.dateofbirth, 'Date of birth', log);
      await fillInput('input[data-iid="c_email_id"]', 'otpcoverscrafter@gmail.com', 'Email ID', log);
      await fillInput('input[data-iid="c_address_one"]', address, 'Address line one', log);
      await clickWhenReady('button[data-iid="save"]', 'Customer Details Save and Continue', log);
      await clickNavigateNext(log);

      if (window.KshemaOtherDetails && typeof window.KshemaOtherDetails.run === 'function') {
        log('Waiting for Other Details step after customer details');
        const otherDetailsResult = await window.KshemaOtherDetails.run(payload, log);
        return otherDetailsResult;
      }

      return { success: true, message: 'Kshema customer details flow completed' };
    }
  };
})();
