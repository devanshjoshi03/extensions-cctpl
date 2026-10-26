(function () {
  'use strict';

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

  function getStoredStage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['royalVehicleSummaryStage'], (result) => {
        resolve(result.royalVehicleSummaryStage || 'uploadDocuments');
      });
    });
  }

  function setStoredStage(stage) {
    return chrome.storage.local.set({ royalVehicleSummaryStage: stage });
  }

  function clearStoredStage() {
    return chrome.storage.local.remove(['royalVehicleSummaryStage', 'royalPendingPayload']);
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
      await sleep(250);
    }
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await sleep(800);
    element.focus?.();
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + (rect.width / 2);
    const clientY = rect.top + (rect.height / 2);
    const pointerOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    };

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', pointerOptions));
    }
    element.dispatchEvent(new MouseEvent('mousedown', pointerOptions));
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerup', pointerOptions));
    }
    element.dispatchEvent(new MouseEvent('mouseup', pointerOptions));
    element.click();
    await sleep(800);
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Vehicle Summary] ${step}`);
      return;
    }
    log(`[Vehicle Summary] ${step}`, details);
  }

  function getAccordionElements(text) {
    const tabs = Array.from(document.querySelectorAll(`p-accordiontab[header="${text}"]`));
    const resolved = tabs
      .map((tab) => {
        const header = tab.querySelector('.p-accordion-header-link');
        const headerText = header?.querySelector('.p-accordion-header-text') || null;
        const contentId = header?.getAttribute('aria-controls') || null;
        const content = contentId ? document.getElementById(contentId) : null;
        return { tab, header, headerText, content };
      })
      .find(({ header }) => isVisible(header)) ||
      tabs
        .map((tab) => {
          const header = tab.querySelector('.p-accordion-header-link');
          const headerText = header?.querySelector('.p-accordion-header-text') || null;
          const contentId = header?.getAttribute('aria-controls') || null;
          const content = contentId ? document.getElementById(contentId) : null;
          return { tab, header, headerText, content };
        })[0];

    return resolved || { tab: null, header: null, headerText: null, content: null };
  }

  function findAccordionByText(text) {
    const { header } = getAccordionElements(text);
    return isVisible(header) ? header : null;
  }

  function findKycVerificationButton() {
    return Array.from(document.querySelectorAll('button.btn.btn-primary, button'))
      .find((candidate) => isVisible(candidate) && String(candidate.textContent || '').replace(/\s+/g, ' ').trim() === 'KYC Verification') || null;
  }

  function isAccordionHeaderVisible(text) {
    const { header } = getAccordionElements(text);
    return isVisible(header);
  }

  async function shouldOpenRequiredDocuments(log = console.log) {
    await waitForPageReady(log);
    if (!isAccordionHeaderVisible('Required Documents')) {
      log('Skipping Required Documents accordion because it is not visible');
      return false;
    }
    if (findKycVerificationButton()) {
      log('Skipping Required Documents accordion because KYC Verification button is visible');
      return false;
    }
    return true;
  }

  function isAccordionOpen(accordion) {
    const ariaExpanded = accordion.getAttribute('aria-expanded') ||
      accordion.closest('[aria-expanded]')?.getAttribute('aria-expanded');
    if (ariaExpanded === 'true') return true;

    const tab = accordion.closest('.p-accordion-tab, p-accordiontab');
    if (tab?.classList.contains('p-accordion-tab-active')) return true;
    if (tab?.classList.contains('p-highlight')) return true;

    const controlsId = accordion.getAttribute('aria-controls');
    const controlledContent = controlsId ? document.getElementById(controlsId) : null;
    const content = controlledContent || tab?.querySelector('.p-toggleable-content, .p-accordion-content');

    if (content) {
      if (content.getAttribute('aria-hidden') === 'false') return true;
      const inlineHeight = parseFloat(content.style.height || '0');
      if (inlineHeight > 0) return true;
      if (isVisible(content) && content.scrollHeight > 0) return true;
    }

    return false;
  }

  async function waitForAccordionOpen(text, log = console.log, timeout = 10000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const { header, content } = getAccordionElements(text);
      if (header && isAccordionOpen(header)) {
        header.scrollIntoView({ block: 'center' });
        await sleep(1000);
        return true;
      }
      if (content && content.getAttribute('aria-hidden') === 'false') {
        header?.scrollIntoView({ block: 'center' });
        await sleep(1000);
        return true;
      }
      await sleep(250);
    }

    throw new Error(`${text} accordion did not open.`);
  }

  async function ensureAccordionOpen(text, log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const { header, headerText, content } = getAccordionElements(text);
      if (header && isVisible(header)) {
        if (!isAccordionOpen(header)) {
          log(`Opening ${text} accordion`);
          await clickElement(header);
          try {
            await waitForAccordionOpen(text, log, 2000);
          } catch (error) {
            header.focus?.();
            header.dispatchEvent(new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: 'Enter',
              code: 'Enter'
            }));
            header.dispatchEvent(new KeyboardEvent('keyup', {
              bubbles: true,
              cancelable: true,
              key: 'Enter',
              code: 'Enter'
            }));
            await waitForAccordionOpen(text, log);
          }
        } else {
          log(`${text} accordion is already open`);
          header.scrollIntoView({ block: 'center' });
          await sleep(800);
        }
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error(`${text} accordion not found.`);
  }

  async function ensureUploadSectionForLabel(labelText, log = console.log) {
    if (labelText === 'Renewal Notice' ||
      labelText === 'Previous Policy Copy' ||
      labelText === 'Proposal Form' ||
      labelText === 'Form 97') {
      await ensureAccordionOpen('Upload Documents', log);
      if (await shouldOpenRequiredDocuments(log)) {
        await ensureAccordionOpen('Required Documents', log);
      }
    }
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

  async function base64ToFile(base64String, baseName) {
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

  function findFileInputByButtonLabel(labelText) {
    const normalizedLabel = labelText.trim().toLowerCase();
    const uploadButtons = Array.from(document.querySelectorAll('.p-fileupload-choose'));

    for (const button of uploadButtons) {
      if (!isVisible(button)) continue;
      const label = button.querySelector('.p-button-label');
      if (!label || label.textContent.trim().toLowerCase() !== normalizedLabel) continue;

      const input = button.querySelector('input[type="file"]');
      if (input) return { button, input };
    }

    return null;
  }

  async function waitForFileInputByButtonLabel(labelText, log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const found = findFileInputByButtonLabel(labelText);
      if (found) return found;
      await sleep(250);
    }

    throw new Error(`File upload input not found for: ${labelText}`);
  }

  async function attachBase64FileToUpload(labelText, base64String, fileBaseName, log = console.log) {
    await ensureUploadSectionForLabel(labelText, log);
    const { button, input } = await waitForFileInputByButtonLabel(labelText, log);
    const file = await base64ToFile(base64String, fileBaseName);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    log(`Attaching ${file.name} to ${labelText}`);
    button.scrollIntoView({ block: 'center' });
    await sleep(1200);
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(2000);
    await waitForPageReady(log);
  }

  function getRequiredImages(payload) {
    const ovdFrontImage = getOvdFrontImage(payload);
    const ovdBackImage = getOvdBackImage(payload);

    if (!ovdFrontImage) {
      throw new Error('Missing customerDetails.ovdFrontImage in payload.');
    }
    if (!ovdBackImage) {
      throw new Error('Missing customerDetails.ovdBackImage in payload.');
    }

    return { ovdFrontImage, ovdBackImage };
  }

  async function openDocumentAccordions(log = console.log) {
    logStep(log, 'Opening Upload Documents accordion');
    await ensureAccordionOpen('Upload Documents', log);
    await sleep(1200);
    logStep(log, 'Persisting resume stage', { stage: 'openRequiredDocuments' });
    await setStoredStage('openRequiredDocuments');
    if (await shouldOpenRequiredDocuments(log)) {
      logStep(log, 'Opening Required Documents accordion');
      await ensureAccordionOpen('Required Documents', log);
      await sleep(1200);
    }
    logStep(log, 'Persisting resume stage', { stage: 'uploadDocuments:renewalNotice' });
    await setStoredStage('uploadDocuments:renewalNotice');
  }

  async function attachUploadDocuments(payload, log = console.log, stage = 'uploadDocuments:renewalNotice') {
    const { ovdFrontImage, ovdBackImage } = getRequiredImages(payload);
    logStep(log, 'Uploading documents section started', { stage });

    if (stage === 'uploadDocuments:renewalNotice') {
      logStep(log, 'Persisting resume stage', { stage: 'uploadDocuments:renewalNotice' });
      await setStoredStage('uploadDocuments:renewalNotice');
      await attachBase64FileToUpload('Renewal Notice', ovdFrontImage, 'ovd_front_renewal_notice', log);
      logStep(log, 'Persisting resume stage', { stage: 'uploadDocuments:previousPolicyCopy' });
      await setStoredStage('uploadDocuments:previousPolicyCopy');
    }

    if (stage === 'uploadDocuments:renewalNotice' || stage === 'uploadDocuments:previousPolicyCopy') {
      await attachBase64FileToUpload('Previous Policy Copy', ovdBackImage, 'ovd_back_previous_policy_copy', log);
    }

    logStep(log, 'Persisting resume stage', { stage: 'requiredDocuments' });
    await setStoredStage('requiredDocuments');
  }

  async function attachRequiredDocuments(payload, log = console.log, stage = 'requiredDocuments') {
    const { ovdFrontImage, ovdBackImage } = getRequiredImages(payload);
    logStep(log, 'Required documents section started', { stage });

    if (stage === 'requiredDocuments' || stage === 'requiredDocuments:proposalForm') {
      logStep(log, 'Persisting resume stage', { stage: 'requiredDocuments:proposalForm' });
      await setStoredStage('requiredDocuments:proposalForm');
      await attachBase64FileToUpload('Proposal Form', ovdFrontImage, 'ovd_front_proposal_form', log);
      logStep(log, 'Persisting resume stage', { stage: 'requiredDocuments:form97' });
      await setStoredStage('requiredDocuments:form97');
    }

    if (stage === 'requiredDocuments' ||
      stage === 'requiredDocuments:proposalForm' ||
      stage === 'requiredDocuments:form97') {
      await attachBase64FileToUpload('Form 97', ovdBackImage, 'ovd_back_form_97', log);
    }

    logStep(log, 'Persisting resume stage', { stage: 'done' });
    await setStoredStage('done');
  }

  async function clickSubmitDocuments(log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const submitButton = Array.from(document.querySelectorAll('button.btn.btn-primary'))
        .find((button) => isVisible(button) && button.textContent.trim() === 'Submit Documents');

      if (submitButton) {
        log('Clicking Submit Documents button');
        await clickElement(submitButton);
        await sleep(1500);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Submit Documents button not found.');
  }

  async function clickEnrichRatingCalculator(log = console.log, timeout = 45000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const directButton = document.querySelector('button[type="submit"].btn.btn-primary');
      const enrichButton = isVisible(directButton) &&
        directButton.textContent.trim() === 'Enrich Rating Calculator'
        ? directButton
        : Array.from(document.querySelectorAll('button.btn.btn-primary, button[type="submit"], button'))
            .find((button) => isVisible(button) && button.textContent.trim() === 'Enrich Rating Calculator');

      if (enrichButton) {
        log('Clicking Enrich Rating Calculator button');
        await clickElement(enrichButton);
        await sleep(2000);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Enrich Rating Calculator button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing vehicle summary page', 'vehicle-summary:start');
    log('Royal Sundaram vehicle summary flow started', payload);
    logStep(log, 'Flow started');
    await waitForPageReady(log);
    const stage = await getStoredStage();
    log(`Vehicle summary resume stage: ${stage}`);

    if (stage === 'uploadDocuments' ||
      stage === 'openRequiredDocuments' ||
      stage === 'uploadDocuments:renewalNotice') {
      await checkpoint('Opening upload document accordions', 'vehicle-summary:open-accordions');
      await openDocumentAccordions(log);
    }

    const uploadStage = await getStoredStage();
    if (uploadStage.startsWith('uploadDocuments')) {
      await checkpoint('Uploading vehicle summary documents', uploadStage);
      logStep(log, 'Processing upload documents stage', { uploadStage });
      await attachUploadDocuments(payload, log, uploadStage);
    }
    const nextStage = await getStoredStage();
    if (nextStage.startsWith('requiredDocuments')) {
      await checkpoint('Uploading required documents', nextStage);
      logStep(log, 'Processing required documents stage', { nextStage });
      await attachRequiredDocuments(payload, log, nextStage);
    }

    await checkpoint('Submitting documents', 'vehicle-summary:submit');
    logStep(log, 'Submitting documents');
    await clickSubmitDocuments(log);
    await checkpoint('Clicking Enrich Rating Calculator', 'vehicle-summary:enrich');
    logStep(log, 'Waiting for and clicking Enrich Rating Calculator');
    await clickEnrichRatingCalculator(log);

    logStep(log, 'Clearing stored summary stage and pending payload');
    await clearStoredStage();

    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'Vehicle summary documents submitted.' };
  }

  window.RoyalVehicleSummary = { run };
})();
