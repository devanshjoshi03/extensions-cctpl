(function () {
  'use strict';

  const KYC_URL_PREFIX = 'https://kyc.royalsundaram.in/eKyc/oem/kycVerification';

  function getController() {
    return window.RoyalAutomationController || null;
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      async function tick() {
        try {
          await getController()?.checkpoint();
          if (Date.now() - startedAt >= ms) {
            resolve();
            return;
          }
          setTimeout(tick, Math.min(200, ms - (Date.now() - startedAt)));
        } catch (error) {
          reject(error);
        }
      }

      tick();
    });
  }

  async function checkpoint(step, key = step) {
    await getController()?.checkpoint(step, key);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function getOvdFrontImage(payload) {
    return payload?.customerDetails?.ovdFrontImage || payload?.ovdFrontImage || '';
  }

  function getOvdBackImage(payload) {
    return payload?.customerDetails?.ovdBackImage || payload?.ovdBackImage || '';
  }

  function getGender(payload) {
    return payload?.customerDetails?.gender || '';
  }

  function getNomineeName(payload) {
    return payload?.nominee?.nomineeName || '';
  }

  function getNomineeNameParts(payload) {
    return {
      firstName: String(payload?.nominee?.firstName || payload?.nominee?.nomineeFirstName || '').trim(),
      middleName: String(payload?.nominee?.middleName || payload?.nominee?.nomineeMiddleName || '').trim(),
      lastName: String(payload?.nominee?.lastName || payload?.nominee?.nomineeLastName || '').trim()
    };
  }

  function getNomineeRelationship(payload) {
    return payload?.nominee?.nomineeRelationship || '';
  }

  function getNomineeDateOfBirth(payload) {
    return payload?.nominee?.nomineeDateOfBirth || payload?.nomineeDateOfBirth || '';
  }

  function splitNomineeName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function resolveNomineeName(payload) {
    const nomineeNameParts = getNomineeNameParts(payload);
    const firstName = nomineeNameParts.firstName;
    const trailingName = [nomineeNameParts.middleName, nomineeNameParts.lastName].filter(Boolean).join(' ').trim();

    if (firstName || trailingName) {
      return {
        firstName: firstName || trailingName,
        lastName: trailingName || firstName
      };
    }

    return splitNomineeName(getNomineeName(payload));
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await sleep(900);
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await sleep(900);
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Vehicle Summary Proposer] ${step}`);
      return;
    }
    log(`[Vehicle Summary Proposer] ${step}`, details);
  }

  async function waitForElementByPredicate(predicate, description, timeout = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const element = predicate();
      if (element) return element;
      await sleep(250);
    }
    throw new Error(`${description} not found.`);
  }

  function getMimeTypeFromBase64(base64String, fallback = 'image/jpeg') {
    const match = String(base64String || '').match(/^data:([^;]+);base64,/);
    return match ? match[1] : fallback;
  }

  function getExtensionFromMimeType(mimeType) {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'application/pdf') return 'pdf';
    return 'jpg';
  }

  function base64ToFile(base64String, baseName) {
    const mimeType = getMimeTypeFromBase64(base64String);
    const base64Data = String(base64String || '').includes(',')
      ? String(base64String).split(',')[1]
      : String(base64String || '');

    if (!base64Data || base64Data.length < 100) {
      throw new Error(`${baseName} base64 data is missing or too short.`);
    }

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    const extension = getExtensionFromMimeType(mimeType);
    return new File([new Blob([bytes], { type: mimeType })], `${baseName}.${extension}`, { type: mimeType });
  }

  async function clickKycVerification(log = console.log) {
    await checkpoint('Waiting for KYC Verification button', 'kyc:wait-verification');
    const button = await waitForElementByPredicate(() => {
      return Array.from(document.querySelectorAll('button.btn.btn-primary, button'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.trim().includes('KYC Verification')) || null;
    }, 'KYC Verification button');

    await checkpoint('Clicking KYC Verification button', 'kyc:click-verification');
    log('Clicking KYC Verification button');
    logStep(log, 'Persisting post-proposer mode before KYC redirect');
    await chrome.storage.local.set({ royalVehicleSummaryMode: 'afterProposer' });
    await clickElement(button);
    logStep(log, 'KYC Verification button clicked');

    await waitForElementByPredicate(() => {
      return window.location.href.startsWith(KYC_URL_PREFIX) ? document.documentElement : null;
    }, 'KYC verification page', 45000);

    logStep(log, 'KYC page detected after redirect');
    return { success: true, redirected: true, message: 'KYC page opened.' };
  }

  function findRequiredDocumentsAccordion() {
    return Array.from(document.querySelectorAll('p-accordiontab, .p-accordion-tab, .p-accordion-header-link, [role="tab"]'))
      .find((candidate) => isVisible(candidate) && normalizeText(candidate.textContent).includes('required documents')) || null;
  }

  function findVisibleKycVerificationButton() {
    return Array.from(document.querySelectorAll('button.btn.btn-primary, button'))
      .find((candidate) => isVisible(candidate) && candidate.textContent.trim().includes('KYC Verification')) || null;
  }

  async function shouldClickKycVerification(log = console.log) {
    const requiredDocuments = findRequiredDocumentsAccordion();
    if (!requiredDocuments) {
      return { clickKyc: true, requiredDocumentsVisible: false };
    }

    const kycButton = findVisibleKycVerificationButton();
    if (kycButton) {
      log('Required Documents accordion is visible, but KYC Verification button is visible; clicking KYC Verification');
      return { clickKyc: true, requiredDocumentsVisible: true };
    }

    log('Required Documents accordion is visible and KYC Verification button is not visible; letting required documents flow continue');
    return { clickKyc: false, requiredDocumentsVisible: true };
  }

  async function clickManualKyc(log = console.log) {
    const card = await waitForElementByPredicate(() => {
      return Array.from(document.querySelectorAll('.card'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.includes('Manual KYC')) || null;
    }, 'Manual KYC card');

    log('Clicking Manual KYC');
    await clickElement(card);
  }

  async function clickProceedHere(log = console.log) {
    const button = await waitForElementByPredicate(() => {
      return Array.from(document.querySelectorAll('button.hv-qr-proceed-laptop-button, button'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.includes('Proceed here')) || null;
    }, 'Proceed here button');

    log('Clicking Proceed here');
    await clickElement(button);
  }

  async function clickAadhaarCard(log = console.log) {
    const aadhaarButton = await waitForElementByPredicate(() => {
      return Array.from(document.querySelectorAll('.hv-document-button'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.includes('Aadhaar Card')) || null;
    }, 'Aadhaar Card document button');

    log('Clicking Aadhaar Card document');
    await clickElement(aadhaarButton);
  }

  async function waitForUploadInput(timeout = 45000) {
    return waitForElementByPredicate(() => {
      const button = Array.from(document.querySelectorAll('.hv-instruction-upload-button'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.includes('Upload document from device'));
      const input = button?.querySelector('input[type="file"]') || document.querySelector('input#uploadedFile[type="file"]');
      return input ? { button, input } : null;
    }, 'HyperVerge upload input', timeout);
  }

  async function attachKycFile(base64String, fileBaseName, log = console.log) {
    const { button, input } = await waitForUploadInput();
    const file = base64ToFile(base64String, fileBaseName);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    log(`Attaching ${file.name}`);
    button?.scrollIntoView({ block: 'center' });
    await sleep(1000);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(2500);
  }

  function selectOptionByTextOrValue(select, desired) {
    const normalizedDesired = normalizeText(desired);
    const option = Array.from(select.options).find((candidate) => {
      return normalizeText(candidate.text) === normalizedDesired || normalizeText(candidate.value) === normalizedDesired;
    });
    if (!option) return false;

    select.value = option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  async function selectGender(payload, log = console.log) {
    const gender = normalizeText(getGender(payload));
    const desired = gender === 'female' ? 'Female' : 'Male';
    const select = await waitForElementByPredicate(() => {
      const candidate = document.querySelector('#hv-form-ocrGender');
      return candidate ? candidate : null;
    }, 'gender dropdown');

    log(`Selecting KYC gender: ${desired}`);
    select.scrollIntoView({ block: 'center' });
    await sleep(800);
    select.add(new Option(desired, desired, true, true));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.blur();
  }

  function mapRelation(relationship) {
    const relation = normalizeText(relationship);
    if (relation.includes('wife') || relation.includes('husband') || relation.includes('spouse')) return 'spouse';
    if (relation.includes('son')) return 'father';
    if (relation.includes('daughter')) return 'mother';
    if (relation.includes('mother')) return 'mother';
    return 'father';
  }

  async function selectRelation(payload, log = console.log) {
    const desired = mapRelation(getNomineeRelationship(payload));
    const select = await waitForElementByPredicate(() => {
      const candidate = document.querySelector('#hv-form-relation');
      return candidate ? candidate : null;
    }, 'relation dropdown');

    log(`Selecting KYC relation: ${desired}`);
    select.scrollIntoView({ block: 'center' });
    await sleep(800);
    select.value = desired;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.blur();

    if (normalizeText(select.value) !== normalizeText(desired) && !selectOptionByTextOrValue(select, desired)) {
      const option = Array.from(select.options).find((candidate) =>
        normalizeText(candidate.text) === normalizeText(desired) || normalizeText(candidate.value) === normalizeText(desired)
      );
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.blur();
      }
    }
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
      return;
    }
    input.value = value;
  }

  async function fillInput(selector, value, label, log = console.log) {
    if (!value) throw new Error(`Missing value for ${label}.`);
    const input = await waitForElementByPredicate(() => {
      const candidate = document.querySelector(selector);
      return candidate ? candidate : null;
    }, label);

    log(`Entering ${label}: ${value}`);
    input.scrollIntoView({ block: 'center' });
    await sleep(800);
    input.focus();
    setNativeInputValue(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await sleep(800);
  }

  async function fillNomineeName(payload, log = console.log) {
    const { firstName, lastName } = resolveNomineeName(payload);
    await fillInput('#hv-form-firstName', firstName, 'nominee first name', log);
    await fillInput('#hv-form-lastName', lastName, 'nominee last name', log);
  }

  async function fillNomineeDob(payload, log = console.log) {
    const nomineeDateOfBirth = getNomineeDateOfBirth(payload);
    await fillInput('#hv-form-ocrDob', nomineeDateOfBirth, 'nominee date of birth', log);
  }

  async function clickSubmit(log = console.log, timeout = 30000) {
    const button = await waitForElementByPredicate(() => {
      return Array.from(document.querySelectorAll('#hv-form-proceedButton, button'))
        .find((candidate) => isVisible(candidate) && candidate.id === 'hv-form-proceedButton' && candidate.textContent.trim() === 'Submit') || null;
    }, 'KYC Submit button', timeout);

    log('Clicking KYC Submit button');
    await clickElement(button);
  }

  async function runKycPage(payload, log = console.log) {
    await checkpoint('Preparing KYC page', 'kyc:start');
    logStep(log, 'KYC page flow started');
    const ovdFrontImage = getOvdFrontImage(payload);
    const ovdBackImage = getOvdBackImage(payload);
    if (!ovdFrontImage) throw new Error('Missing customerDetails.ovdFrontImage in payload.');
    if (!ovdBackImage) throw new Error('Missing customerDetails.ovdBackImage in payload.');

    await checkpoint('Selecting Manual KYC', 'kyc:manual-kyc');
    logStep(log, 'Selecting Manual KYC');
    await clickManualKyc(log);
    await checkpoint('Clicking Proceed here', 'kyc:proceed-here');
    logStep(log, 'Clicking Proceed here');
    await clickProceedHere(log);
    await checkpoint('Selecting Aadhaar Card document type', 'kyc:aadhaar');
    logStep(log, 'Selecting Aadhaar Card document type');
    await clickAadhaarCard(log);
    await checkpoint('Uploading Aadhaar front image', 'kyc:front-upload');
    logStep(log, 'Uploading Aadhaar front image');
    await attachKycFile(ovdFrontImage, 'kyc_aadhaar_front', log);
    await checkpoint('Uploading Aadhaar back image', 'kyc:back-upload');
    logStep(log, 'Uploading Aadhaar back image');
    await attachKycFile(ovdBackImage, 'kyc_aadhaar_back', log);
    await checkpoint('Selecting KYC gender', 'kyc:gender');
    logStep(log, 'Selecting KYC gender');
    await selectGender(payload, log);
    await checkpoint('Selecting KYC relation', 'kyc:relation');
    logStep(log, 'Selecting KYC relation');
    await selectRelation(payload, log);
    await checkpoint('Filling nominee name', 'kyc:nominee');
    logStep(log, 'Filling nominee name');
    await fillNomineeName(payload, log);
    await checkpoint('Filling nominee date of birth', 'kyc:nominee-dob');
    logStep(log, 'Filling nominee date of birth');
    await fillNomineeDob(payload, log);
    await checkpoint('Submitting KYC form', 'kyc:submit');
    logStep(log, 'Submitting KYC form');
    await clickSubmit(log);

    await chrome.storage.local.remove(['royalPendingPayload', 'royalVehicleSummaryMode']);

    logStep(log, 'KYC page flow completed successfully');
    return { success: true, message: 'Manual KYC details entered.' };
  }

  async function run(payload, log = console.log) {
    log('Royal Sundaram post-proposer vehicle summary flow started', payload);
    logStep(log, 'Flow started', { url: window.location.href });

    if (window.location.href.startsWith(KYC_URL_PREFIX)) {
      logStep(log, 'Detected KYC page branch');
      return runKycPage(payload || {}, log);
    }

    logStep(log, 'Detected vehicle summary branch; redirecting into KYC');
    const kycDecision = await shouldClickKycVerification(log);
    if (!kycDecision.clickKyc && kycDecision.requiredDocumentsVisible) {
      return { success: false, error: 'Required Documents visible; continue required documents flow before KYC Verification.' };
    }
    return clickKycVerification(log);
  }

  window.RoyalVehicleSummaryProposer = { run };
})();
