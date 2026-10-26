(function () {
  'use strict';

  let stopRequested = false;
  const ACTION_DELAY = 500;
  const AADHAAR_NUMBER_ACTION_DELAY = 1500;

  function getController() {
    return window.KshemaAutomationController || null;
  }

  async function checkpoint(stepLabel) {
    const controller = getController();
    if (controller?.checkpoint) {
      await controller.checkpoint(stepLabel);
    }
    if (stopRequested) {
      throw new Error('KYC flow stopped');
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

  async function slowAadhaarNumberPace(stepLabel) {
    await checkpoint(stepLabel);
    await sleep(AADHAAR_NUMBER_ACTION_DELAY);
    await checkpoint(stepLabel);
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

  function isCkycStepActive() {
    return Array.from(document.querySelectorAll('.stepper-item-text')).some(item => {
      return normalize(item.textContent).includes('ckyc') && item.classList.contains('stepper-active');
    });
  }

  async function waitForCkycStep(log) {
    await waitUntil(log, 'ckyc step active', isCkycStepActive, 60000);
  }

  async function clickKycButton(log) {
    await checkpoint('Clicking KYC button');
    const button = await waitUntil(log, 'KYC button', () => {
      return Array.from(document.querySelectorAll('button')).find(item => {
        return normalize(item.textContent) === 'kyc' && isVisible(item);
      });
    }, 60000);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    log('KYC button clicked');
    await pace();
  }

  async function clickAadhaarTab(log) {
    await checkpoint('Opening Aadhaar tab');
    const button = await waitUntil(log, 'AADHAAR tab', () => {
      return document.querySelector('button[aria-controls$="-content-AADHAAR"]');
    }, 60000);

    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    log('AADHAAR tab clicked');
    await pace();
  }

  function getCustomerDetails(payload) {
    const customerDetails = payload?.customerDetails || payload?.customerdetails;
    if (!customerDetails) {
      throw new Error('Missing customerDetails in pasted JSON');
    }
    return customerDetails;
  }

  function getCustomerFullName(customerDetails) {
    return [
      customerDetails.firstName || customerDetails.firstname,
      customerDetails.middleName || customerDetails.middlename,
      customerDetails.lastName || customerDetails.lastname
    ].filter(Boolean).join(' ').trim();
  }

  function getCustomerAadhaarLastFour(payload) {
    const customerDetails = getCustomerDetails(payload);
    const aadhaar = String(customerDetails.aadhaar || customerDetails.aadhar || '').replace(/\D/g, '');
    if (aadhaar.length < 4) {
      throw new Error('Missing customerDetails.aadhaar last 4 digits in pasted JSON');
    }

    return aadhaar.slice(-4);
  }

  function isPanAvailable(payload) {
    const customerDetails = getCustomerDetails(payload);
    const value = customerDetails.isPanAvailable ?? customerDetails.ispanavailable;
    return value === true || value === 1 || value === '1' || normalize(value) === 'true';
  }

  function getCustomerPan(payload) {
    const customerDetails = getCustomerDetails(payload);
    const pan = String(customerDetails.pan || customerDetails.PAN || '').replace(/\s+/g, '').trim().toUpperCase();
    if (!pan) {
      throw new Error('Missing customerDetails.pan in pasted JSON');
    }

    return pan;
  }

  function findButtonByExactText(text) {
    return Array.from(document.querySelectorAll('button')).find(item => {
      return isVisible(item) && normalize(item.textContent) === normalize(text) && !item.disabled;
    }) || null;
  }

  function dispatchPointerClick(element) {
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.focus();

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      }));
    }

    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      }));
    }

    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function findAadhaarTab() {
    return document.querySelector('button[aria-controls*="AADHAAR"]') ||
      Array.from(document.querySelectorAll('button[role="tab"], button')).find(item => {
        return isVisible(item) && normalize(item.textContent) === 'aadhaar';
      }) ||
      null;
  }

  function findPanTab() {
    return document.querySelector('button[id*="trigger-PAN"]') ||
      Array.from(document.querySelectorAll('button[role="tab"], button')).find(item => {
        return isVisible(item) && normalize(item.textContent) === 'pan';
      }) ||
      null;
  }

  async function selectAadhaarDocumentType(log) {
    await checkpoint('Selecting Aadhaar document type');
    await waitUntil(log, 'document type combobox', () => document.querySelector('[role="combobox"]'), 60000);

    document.querySelector('[role="combobox"]').click();
    setTimeout(() => [...document.querySelectorAll('[role="option"]')].find(x => /aadhaar|aadhar/i.test(x.textContent))?.click(), 300);

    await waitUntil(log, 'AADHAAR document type option selected', () => {
      return Array.from(document.querySelectorAll('[role="combobox"], [role="option"], button')).some(item => {
        return isVisible(item) && /aadhaar|aadhar/i.test(item.textContent || '');
      });
    }, 5000);
    log('AADHAAR document type selected');
    await pace();
  }

  function base64ToFile(dataUrl, filename) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) {
      throw new Error('customerDetails.ovdFrontImage must be a data URL base64 image');
    }

    const mimeType = match[1] || 'image/jpeg';
    const isBase64 = !!match[2];
    const data = isBase64 ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(data.length);

    for (let index = 0; index < data.length; index += 1) {
      bytes[index] = data.charCodeAt(index);
    }

    return new File([bytes], filename, { type: mimeType });
  }

  function getFileExtension(dataUrl) {
    const mimeType = String(dataUrl || '').match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('pdf')) return 'pdf';
    return 'jpg';
  }

  async function uploadAadhaarFrontImage(payload, log) {
    const customerDetails = getCustomerDetails(payload);
    const imageData = customerDetails.ovdFrontImage || customerDetails.OVDFrontImage || customerDetails.aadhaarFrontImage;
    if (!imageData) {
      throw new Error('Missing customerDetails.ovdFrontImage in pasted JSON');
    }

    await checkpoint('Uploading Aadhaar front image');
    const uploadButton = await waitUntil(log, 'Aadhaar upload button', () => {
      return Array.from(document.querySelectorAll('button')).find(item => {
        return isVisible(item) && /tap to upload (?:the )?(?:front of your aadhaar|your aadhaar card)/i.test(item.textContent || '');
      });
    }, 60000);

    uploadButton.scrollIntoView({ block: 'center', inline: 'nearest' });
    const fileInput = await waitUntil(log, 'Aadhaar file input', () => {
      return uploadButton.closest('form, section, div')?.querySelector('input[type="file"]') ||
        document.querySelector('input[type="file"]');
    }, 10000);

    const extension = getFileExtension(imageData);
    const file = base64ToFile(imageData, `aadhaar-front.${extension}`);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    log(`Aadhaar front image attached: ${file.name}`);
    await pace();
  }

  async function clickButtonByExactText(text, label, log, timeout = 60000) {
    await checkpoint(`Clicking ${label}`);
    const button = await waitUntil(log, `${label} button`, () => {
      return findButtonByExactText(text);
    }, timeout);

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.focus();
    button.click();
    log(`${label} clicked`);
    await pace();
  }

  async function clickSubmitForVerification(log) {
    await clickButtonByExactText('Submit for Verification', 'Submit for Verification', log);
  }

  async function clickDetailsAreCorrectVerify(payload, log) {
    await checkpoint('Verifying Aadhaar details name');
    const button = await waitUntil(log, 'Details are correct - Verify button', () => {
      return Array.from(document.querySelectorAll('button')).find(item => {
        return isVisible(item) && normalize(item.textContent) === normalize('Details are correct - Verify') && !item.disabled;
      });
    }, 60000);

    const displayedName = document.querySelector('span.font-medium.text-right')?.textContent.trim();
    const expectedName = getCustomerFullName(getCustomerDetails(payload));
    log(`Aadhaar details name found: ${displayedName || '(blank)'}`);

    if (!displayedName) {
      throw new Error('Could not read Aadhaar details name before Details are correct - Verify click');
    }

    if (normalize(displayedName) !== normalize(expectedName)) {
      throw new Error(`Aadhaar details name mismatch. Expected "${expectedName}", found "${displayedName}"`);
    }

    button.scrollIntoView({ block: 'center', inline: 'nearest' });
    button.click();
    log('Details are correct - Verify clicked');
    await pace();
  }

  async function clickReturnNow(log) {
    await clickButtonByExactText('Return now', 'Return now', log);
  }

  async function clickAadhaarNumberTab(log) {
    await checkpoint('Opening Aadhaar tab for number verification');
    const button = await waitUntil(log, 'AADHAAR tab', () => {
      return findAadhaarTab();
    }, 60000);

    dispatchPointerClick(button);
    log('AADHAAR tab clicked');
    await pace();
  }

  async function clickPanTab(log) {
    await checkpoint('Opening PAN tab for verification');
    const button = await waitUntil(log, 'PAN tab', () => {
      return findPanTab();
    }, 60000);

    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.focus();
    button.click();
    log('PAN tab clicked');
    await pace();
  }

  async function fillNumberInput(value, label, log) {
    await checkpoint(`Filling ${label}`);
    const input = await waitUntil(log, `${label} input`, () => {
      return document.querySelector('#number-input');
    }, 15000);

    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    input.focus();

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    if (typeof InputEvent === 'function') {
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value
      }));
    } else {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    log(`${label} filled: ${value}`);
    await pace();
  }

  async function fillPanNumber(payload, log) {
    await fillNumberInput(getCustomerPan(payload), 'PAN number', log);
  }

  async function fillAadhaarLastFour(payload, log) {
    await fillNumberInput(getCustomerAadhaarLastFour(payload), 'Aadhaar last 4 digits', log);
  }

  async function clickConfirmAndVerify(log) {
    await clickButtonByExactText('Confirm & Verify', 'Confirm & Verify', log);
  }

  async function waitForAadhaarNumberResult(log) {
    return waitUntil(log, 'Aadhaar number verification result', () => {
      if (findButtonByExactText('Return now')) {
        return 'return-now';
      }

      if (findButtonByExactText('Try with different document')) {
        return 'try-different-document';
      }

      return null;
    }, 60000);
  }

  async function waitForPanResult(log) {
    return waitUntil(log, 'PAN verification result', () => {
      if (findButtonByExactText('Return now')) {
        return 'return-now';
      }

      if (findButtonByExactText('Try with different document')) {
        return 'try-different-document';
      }

      return null;
    }, 60000);
  }

  async function runPanVerification(payload, log) {
    if (!isPanAvailable(payload)) {
      log('PAN verification skipped because isPanAvailable is not true');
      return null;
    }

    log('Trying PAN KYC verification');
    await clickPanTab(log);
    await slowAadhaarNumberPace('Waiting after PAN tab click');
    await fillPanNumber(payload, log);
    await slowAadhaarNumberPace('Waiting after PAN number fill');
    await clickSubmitForVerification(log);
    await slowAadhaarNumberPace('Waiting after PAN Submit for Verification');
    await clickConfirmAndVerify(log);
    await slowAadhaarNumberPace('Waiting after PAN Confirm & Verify');

    const result = await waitForPanResult(log);
    if (result === 'return-now') {
      await clickReturnNow(log);
      return { success: true, message: 'Kshema KYC PAN verified and returned' };
    }

    await clickButtonByExactText('Try with different document', 'Try with different document', log);
    await slowAadhaarNumberPace('Waiting after PAN Try with different document');
    log('PAN verification failed, falling back to Aadhaar last 4 digits KYC');
    return null;
  }

  async function runAadhaarNumberVerification(payload, log) {
    log('Trying Aadhaar last 4 digits KYC verification');
    await clickAadhaarNumberTab(log);
    await slowAadhaarNumberPace('Waiting after Aadhaar tab click');
    await fillAadhaarLastFour(payload, log);
    await slowAadhaarNumberPace('Waiting after Aadhaar last 4 fill');
    await clickSubmitForVerification(log);
    await slowAadhaarNumberPace('Waiting after Submit for Verification');
    await clickConfirmAndVerify(log);
    await slowAadhaarNumberPace('Waiting after Confirm & Verify');

    const result = await waitForAadhaarNumberResult(log);
    if (result === 'return-now') {
      await clickReturnNow(log);
      return { success: true, message: 'Kshema KYC Aadhaar last 4 digits verified and returned' };
    }

    await clickButtonByExactText('Try with different document', 'Try with different document', log);
    await slowAadhaarNumberPace('Waiting after Try with different document');
    log('Aadhaar last 4 digits verification failed, falling back to document upload KYC');
    return null;
  }

  function findAlreadyCompleteContinueButton() {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find(item => {
      return isVisible(item) && normalize(item.textContent) === 'your kyc is already complete';
    });

    if (!heading) {
      return null;
    }

    return Array.from(document.querySelectorAll('button')).find(item => {
      return isVisible(item) && normalize(item.textContent) === 'continue' && !item.disabled;
    }) || null;
  }

  async function handleAlreadyCompletedKyc(log) {
    const continueButton = await waitUntil(log, 'already completed KYC continue button', () => {
      return findAlreadyCompleteContinueButton();
    }, 15000);

    log('Detected already completed KYC screen');
    continueButton.scrollIntoView({ block: 'center', inline: 'nearest' });
    continueButton.click();
    log('Already completed KYC Continue clicked');
    await pace();
    await clickReturnNow(log);
    return { success: true, message: 'Kshema KYC already completed and returned' };
  }

  async function resolveAssureHubFlow(log) {
    return waitUntil(log, 'AssureHub KYC state', () => {
      if (findAlreadyCompleteContinueButton()) {
        return 'already-complete';
      }

      if (findPanTab() || findAadhaarTab()) {
        return 'aadhaar-upload';
      }

      return null;
    }, 20000);
  }

  async function runAssureHub(payload, log) {
    log('AssureHub KYC page detected');

    const flowState = await resolveAssureHubFlow(log);
    if (flowState === 'already-complete') {
      return handleAlreadyCompletedKyc(log);
    }

    try {
      const panResult = await runPanVerification(payload, log);
      if (panResult) {
        return panResult;
      }
    } catch (error) {
      log(`PAN KYC verification skipped: ${error.message}`);
    }

    try {
      const aadhaarNumberResult = await runAadhaarNumberVerification(payload, log);
      if (aadhaarNumberResult) {
        return aadhaarNumberResult;
      }
    } catch (error) {
      log(`Aadhaar last 4 digits KYC verification skipped: ${error.message}`);
    }

    await selectAadhaarDocumentType(log);
    await uploadAadhaarFrontImage(payload, log);
    log('Waiting 3 seconds before Submit for Verification');
    await sleep(3000);
    await clickSubmitForVerification(log);
    await clickDetailsAreCorrectVerify(payload, log);
    await clickReturnNow(log);
    return { success: true, message: 'Kshema KYC Aadhaar details verified and returned' };
  }

  window.KshemaKyc = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isActive: isCkycStepActive,

    async run(payload, log) {
      stopRequested = false;

      if (window.location.href.startsWith('https://assurehub.kshema.co/kyc')) {
        return runAssureHub(payload, log);
      }

      log('KYC flow started');
      await waitForCkycStep(log);
      await chrome.storage.local.set({ kshemaKycPayload: payload });
      await chrome.storage.local.set({ kshemaPendingPaymentResume: payload });
      await clickKycButton(log);
      return { success: true, message: 'Kshema KYC page opening' };
    },

    async autoRunOnAssureHub(log) {
      const result = await chrome.storage.local.get('kshemaKycPayload');
      if (!result.kshemaKycPayload) {
        log('No stored KYC payload found');
        return null;
      }

      return runAssureHub(result.kshemaKycPayload, log);
    }
  };
})();
