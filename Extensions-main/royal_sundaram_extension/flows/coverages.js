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

  async function setUiStep(step, key = step) {
    await getController()?.setStep(step, key);
  }

  async function commitUiStep(step, key = step, holdMs = 350) {
    await setUiStep(step, key);
    await sleep(holdMs);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isTruthyCoverFlag(value) {
    return value === true || value === 1 || value === '1';
  }

  function getCoverSelection(payload) {
    return payload?.covers || payload?.coverages || {};
  }

  function getCustomerFirstName(payload) {
    return payload?.customerDetails?.firstName ||
      payload?.customerDetails?.first_name ||
      payload?.firstName ||
      '';
  }

  function getCustomerMiddleName(payload) {
    return payload?.customerDetails?.middleName ||
      payload?.customerDetails?.middle_name ||
      payload?.middleName ||
      '';
  }

  function getCustomerLastName(payload) {
    return payload?.customerDetails?.lastName ||
      payload?.customerDetails?.last_name ||
      payload?.lastName ||
      '';
  }

  function getCustomerFullName(payload) {
    return payload?.customerDetails?.fullName ||
      payload?.customerDetails?.customerName ||
      payload?.customerDetails?.name ||
      payload?.fullName ||
      payload?.name ||
      '';
  }

  function splitFullName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  function resolveCustomerName(payload) {
    const firstName = String(getCustomerFirstName(payload) || '').trim();
    const middleName = String(getCustomerMiddleName(payload) || '').trim();
    const lastName = String(getCustomerLastName(payload) || '').trim();
    const trailingName = [middleName, lastName].filter(Boolean).join(' ').trim();

    if (firstName || trailingName) {
      return {
        firstName: firstName || trailingName,
        lastName: trailingName || firstName
      };
    }

    return splitFullName(getCustomerFullName(payload));
  }

  function getCustomerMobile(payload) {
    return payload?.customerDetails?.mobile ||
      payload?.customerDetails?.mobileNumber ||
      payload?.customerDetails?.phone ||
      payload?.customerDetails?.whatsAppNumber ||
      payload?.mobile ||
      '';
  }

  function getCustomerTitle(payload) {
    const title = payload?.customerDetails?.title ||
      payload?.customerDetails?.salutation ||
      payload?.title ||
      'Ms';

    return normalizeText(title) === 'miss' ? 'Ms' : title;
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
      await sleep(250);
    }
  }

  async function pauseForVisibility(ms = 800) {
    await sleep(ms);
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await pauseForVisibility();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    await pauseForVisibility();
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Coverages] ${step}`);
      return;
    }
    log(`[Coverages] ${step}`, details);
  }

  function findMandatoryCoveragesAccordion() {
    return Array.from(document.querySelectorAll('.p-accordion-header-link'))
      .find((element) => isVisible(element) && element.textContent.includes('Mandatory Coverages')) || null;
  }

  function findAccordionByText(text) {
    return Array.from(document.querySelectorAll('.p-accordion-header-link'))
      .find((element) => isVisible(element) && element.textContent.includes(text)) || null;
  }

  async function clickMandatoryCoverages(log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const accordion = findMandatoryCoveragesAccordion();
      if (accordion) {
        log('Clicking Mandatory Coverages accordion');
        await clickElement(accordion);
        await sleep(1000);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Mandatory Coverages accordion not found.');
  }

  async function clickOptionalCoverages(log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const accordion = findAccordionByText('Optional Coverages');
      if (accordion) {
        log('Clicking Optional Coverages accordion');
        await clickElement(accordion);
        await sleep(1000);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Optional Coverages accordion not found.');
  }

  async function clickAddOnCoverages(log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const accordion = findAccordionByText('Add-On Coverages');
      if (accordion) {
        const isExpanded = accordion.getAttribute('aria-expanded') === 'true';
        if (!isExpanded) {
          log('Clicking Add-On Coverages accordion');
          await clickElement(accordion);
          await sleep(1000);
          await waitForPageReady(log);
        }
        return true;
      }
      await sleep(250);
    }

    throw new Error('Add-On Coverages accordion not found.');
  }

  async function selectLiabilityCoverLimit(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const select = document.querySelector('#selectedLimit_VMC_LiabilityCover0');
      if (isVisible(select)) {
        log('Selecting VMC liability cover limit: 6000.0');
        select.scrollIntoView({ block: 'center' });
        await pauseForVisibility();
        select.value = '6000.0';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(1200);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('VMC liability cover limit dropdown not found.');
  }

  async function selectDriverLicenseAnswer(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const select = document.querySelector('#hasValidDriverLisence3');
      if (isVisible(select)) {
        log('Selecting valid driver license answer: Yes');
        select.scrollIntoView({ block: 'center' });
        await pauseForVisibility();
        select.value = 'Yes';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(1200);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Valid driver license dropdown not found.');
  }

  async function uncheckPaOwnerDriverCover(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const checkbox = document.querySelector('#isSelected_VMC_PAOwnerDriverCover');

      if (isVisible(checkbox)) {
        checkbox.scrollIntoView({ block: 'center' });
        await pauseForVisibility();

        if (checkbox.checked) {
          log('Unchecking PA Owner Driver cover');
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(1200);
          await waitForPageReady(log);
        } else {
          log('PA Owner Driver cover already unchecked');
        }

        return true;
      }

      await sleep(250);
    }

    throw new Error('PA Owner Driver cover checkbox not found.');
  }

  async function selectStandalonePaPolicyOption(log = console.log, timeout = 20000) {
    const expectedOption = 'The registered owner driver, has a standalone PA policy';
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const select = document.querySelector('#paWaiverReason3');

      if (isVisible(select)) {
        const option = Array.from(select.options || []).find(item => {
          return normalizeText(item.textContent) === normalizeText(expectedOption) ||
            normalizeText(item.value) === normalizeText(expectedOption);
        });

        if (!option) {
          throw new Error(`Standalone PA policy option not found in PA waiver dropdown: ${expectedOption}`);
        }

        log(`Selecting PA waiver reason: ${expectedOption}`);
        select.scrollIntoView({ block: 'center' });
        await pauseForVisibility();
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(1200);
        await waitForPageReady(log);
        return true;
      }

      await sleep(250);
    }

    throw new Error('PA waiver reason dropdown not found.');
  }
  async function clickRecalculate(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const recalculateButton = Array.from(document.querySelectorAll('a.next.hiding_offcanvas.btn_blue'))
        .find((element) => isVisible(element) && normalizeText(element.textContent).startsWith('recalculate'));

      if (recalculateButton) {
        log('Clicking Recalculate button');
        await clickElement(recalculateButton);
        await sleep(1800);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Recalculate button not found.');
  }

  async function clickFreezeQuote(log = console.log, timeout = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const freezeButton = Array.from(document.querySelectorAll('a.next.hiding_offcanvas.btn_blue'))
        .find((element) => isVisible(element) && normalizeText(element.textContent).includes('freeze quote'));

      if (freezeButton) {
        log('Clicking Freeze Quote button');
        await clickElement(freezeButton);
        await sleep(1800);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Freeze Quote button not found.');
  }

  async function fillInputBySelector(selector, value) {
    const input = document.querySelector(selector);
    if (!input) {
      throw new Error(`Input not found: ${selector}`);
    }

    input.scrollIntoView({ block: 'center' });
    await pauseForVisibility();
    input.focus();
    input.value = value;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await pauseForVisibility();
  }

  async function verifyCustomerSalutation(payload, log = console.log) {
    const expectedTitle = String(getCustomerTitle(payload) || '').trim();
    const select = document.querySelector('select[name="salutation"]');
    if (!select) {
      throw new Error('Salutation dropdown not found before entering first name.');
    }

    const selectedOptionText = select.options?.[select.selectedIndex]?.textContent || '';
    const actualTitle = String(select.value || selectedOptionText || '').trim();
    log(`Confirming salutation before first name: ${actualTitle || '(blank)'}`);

    if (normalizeText(actualTitle) !== normalizeText(expectedTitle) &&
      normalizeText(selectedOptionText) !== normalizeText(expectedTitle)) {
      const matchingOption = Array.from(select.options || []).find(option => {
        return normalizeText(option.value) === normalizeText(expectedTitle) ||
          normalizeText(option.textContent) === normalizeText(expectedTitle);
      });

      if (matchingOption) {
        select.value = matchingOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        log(`Selected salutation before first name: ${matchingOption.value}`);
        await pauseForVisibility();
        return;
      }

      throw new Error(`Salutation mismatch before entering first name. Expected "${expectedTitle}", found "${actualTitle || selectedOptionText}"`);
    }
  }

  async function ensureCheckboxChecked(selector, label, log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const checkbox = document.querySelector(selector);
      if (isVisible(checkbox)) {
        if (!checkbox.checked) {
          log(`Checking ${label}`);
          checkbox.scrollIntoView({ block: 'center' });
          await pauseForVisibility();
          checkbox.click();
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(1000);
          await waitForPageReady(log);
        }
        return true;
      }
      await sleep(250);
    }

    throw new Error(`${label} checkbox not found.`);
  }

  async function applyAddOnCoverages(payload, log = console.log) {
    const covers = getCoverSelection(payload);
    const shouldSelectReturnToInvoice = isTruthyCoverFlag(covers?.returnToInvoice);
    const shouldSelectEngineProtector = isTruthyCoverFlag(covers?.engineProtector);

    if (!shouldSelectReturnToInvoice && !shouldSelectEngineProtector) {
      logStep(log, 'No add-on coverages requested');
      return;
    }

    await checkpoint('Opening add-on coverages', 'coverages:add-on-coverages');
    logStep(log, 'Opening add-on coverages');
    await clickAddOnCoverages(log);
    await commitUiStep('Add-on coverages opened', 'coverages:add-on-coverages-opened');
    logStep(log, 'Add-on coverages opened');

    if (shouldSelectReturnToInvoice) {
      await checkpoint('Selecting Return To Invoice cover', 'coverages:return-to-invoice');
      logStep(log, 'Selecting Return To Invoice cover');
      await ensureCheckboxChecked('#isSelected_InvoicePriceCover_TW', 'Return To Invoice cover', log);
      await commitUiStep('Return To Invoice cover selected', 'coverages:return-to-invoice-selected');
      logStep(log, 'Return To Invoice cover selected');
    }

    if (shouldSelectEngineProtector) {
      await checkpoint('Selecting Engine Protector cover', 'coverages:engine-protector');
      logStep(log, 'Selecting Engine Protector cover');
      await ensureCheckboxChecked('#isSelected_EngineProtectorCover_TW', 'Engine Protector cover', log);
      await commitUiStep('Engine Protector cover selected', 'coverages:engine-protector-selected');
      logStep(log, 'Engine Protector cover selected');
    }
  }

  async function fillCustomerName(payload, log = console.log) {
    const { firstName, lastName } = resolveCustomerName(payload);

    if (!firstName) {
      throw new Error('Missing customerDetails.firstName in payload.');
    }
    if (!lastName) {
      throw new Error('Missing customerDetails.lastName in payload.');
    }

    await waitForPageReady(log);
    await verifyCustomerSalutation(payload, log);
    log(`Entering customer name: ${firstName} ${lastName}`);
    await fillInputBySelector('#firstName', firstName);
    await sleep(800);
    await fillInputBySelector('#lastName', lastName);
    await sleep(1000);
    await waitForPageReady(log);
  }

  async function fillCustomerMobile(payload, log = console.log) {
    const mobile = getCustomerMobile(payload);
    if (!mobile) {
      throw new Error('Missing customerDetails.mobile in payload.');
    }

    await waitForPageReady(log);
    log(`Entering WhatsApp number: ${mobile}`);
    await fillInputBySelector('#whatsAppNumber', String(mobile).trim());
    await sleep(1000);
    await waitForPageReady(log);
  }

  async function clickSecondPolicySelect(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const policyButton = document.querySelectorAll('#policy_select')[1];
      if (isVisible(policyButton)) {
        log('Clicking second policy select button');
        await clickElement(policyButton);
        await sleep(1800);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Second policy select button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing coverages page', 'coverages:start');
    log('Royal Sundaram coverages flow started', payload);
    logStep(log, 'Flow started');
    await waitForPageReady(log);

    await checkpoint('Opening mandatory coverages', 'coverages:mandatory-coverages');
    logStep(log, 'Opening mandatory coverages');
    await clickMandatoryCoverages(log);
    await commitUiStep('Mandatory coverages opened', 'coverages:mandatory-coverages-opened');
    logStep(log, 'Mandatory coverages opened');
    await checkpoint('Selecting liability cover limit', 'coverages:liability-cover');
    logStep(log, 'Selecting liability cover limit');
    await selectLiabilityCoverLimit(log);
    await commitUiStep('Liability cover selected', 'coverages:liability-cover-selected');
    logStep(log, 'Liability cover selected');
    await checkpoint('Opening optional coverages', 'coverages:optional-coverages');
    logStep(log, 'Opening optional coverages');
    await clickOptionalCoverages(log);
    await commitUiStep('Optional coverages opened', 'coverages:optional-coverages-opened');
    logStep(log, 'Optional coverages opened');
    await checkpoint('Selecting standalone PA policy option', 'coverages:standalone-pa-policy');
    logStep(log, 'Selecting standalone PA policy option');
    await uncheckPaOwnerDriverCover(log);
    await selectStandalonePaPolicyOption(log);
    await commitUiStep('Standalone PA policy option selected', 'coverages:standalone-pa-policy-selected');
    logStep(log, 'Standalone PA policy option selected');
    await checkpoint('Selecting driver license answer', 'coverages:driver-license');
    logStep(log, 'Selecting driver license answer');
    await selectDriverLicenseAnswer(log);
    await commitUiStep('Driver license answer selected', 'coverages:driver-license-selected');
    logStep(log, 'Driver license answer selected');
    await applyAddOnCoverages(payload, log);
    await checkpoint('Recalculating premium', 'coverages:recalculate');
    logStep(log, 'Recalculating premium');
    await clickRecalculate(log);
    await commitUiStep('Premium recalculated', 'coverages:recalculated');
    logStep(log, 'Premium recalculated');
    await checkpoint('Freezing quote', 'coverages:freeze-quote');
    logStep(log, 'Freezing quote');
    await clickFreezeQuote(log);
    await commitUiStep('Quote frozen', 'coverages:frozen');
    logStep(log, 'Quote frozen');
    await checkpoint('Filling customer name', 'coverages:customer-name');
    logStep(log, 'Filling customer name');
    await fillCustomerName(payload, log);
    await commitUiStep('Customer name filled', 'coverages:customer-name-filled');
    logStep(log, 'Customer name filled');
    await checkpoint('Filling customer mobile', 'coverages:customer-mobile');
    logStep(log, 'Filling customer mobile');
    await fillCustomerMobile(payload, log);
    await commitUiStep('Customer mobile filled', 'coverages:customer-mobile-filled');
    logStep(log, 'Customer mobile filled');
    await checkpoint('Selecting final policy option', 'coverages:final-policy');
    logStep(log, 'Selecting final policy option');
    await clickSecondPolicySelect(log);
    await commitUiStep('Final policy selected', 'coverages:final-policy-selected');
    logStep(log, 'Final policy selected');

    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'Coverages completed and final policy selected.' };
  }

  window.RoyalCoverages = { run };
})();
