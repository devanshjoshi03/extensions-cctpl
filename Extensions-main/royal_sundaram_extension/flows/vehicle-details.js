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

  function joinParts(parts) {
    return parts
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function getAddressLine1(payload) {
    const address = payload?.customerDetails?.address || {};
    return joinParts([address.building, address.street]);
  }

  function getAddressLine2(payload) {
    const address = payload?.customerDetails?.address || {};
    return joinParts([address.pincode, address.locality, address.city, address.state, address.country]);
  }

  function getPincode(payload) {
    return payload?.customerDetails?.address?.pincode || '';
  }

  function getChassisNumber(payload) {
    return payload?.vehicleInformation?.chassisNumber ||
      payload?.vehicleDetails?.chassisNumber ||
      payload?.chassisNumber ||
      '';
  }

  function getEngineNumber(payload) {
    return payload?.vehicleInformation?.engineNumber ||
      payload?.vehicleDetails?.engineNumber ||
      payload?.engineNumber ||
      '';
  }

  function isHypothecated(payload) {
    return payload?.hypothecation?.isHypothecated === true;
  }

  function getFinancierName(payload) {
    return payload?.hypothecation?.financierName || '';
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await sleep(800);
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    await sleep(800);
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Vehicle Details] ${step}`);
      return;
    }
    log(`[Vehicle Details] ${step}`, details);
  }

  function findAccordionByText(text) {
    return Array.from(document.querySelectorAll('.p-accordion-header-link'))
      .find((element) => isVisible(element) && element.textContent.trim().includes(text)) || null;
  }

  async function openAccordionByText(text, log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const accordion = findAccordionByText(text);
      if (accordion) {
        log(`Opening ${text} accordion`);
        await clickElement(accordion);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error(`${text} accordion not found.`);
  }

  async function waitForInput(selector, log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const input = document.querySelector(selector);
      if (isVisible(input)) return input;
      await sleep(250);
    }

    throw new Error(`Input not found: ${selector}`);
  }

  async function fillInput(selector, value, label, log = console.log) {
    if (!value) {
      throw new Error(`Missing value for ${label}.`);
    }

    const input = await waitForInput(selector, log);
    log(`Entering ${label}: ${value}`);
    input.scrollIntoView({ block: 'center' });
    await sleep(800);
    input.focus();
    input.value = value;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);
    await waitForPageReady(log);
  }

  async function selectValue(selector, value, label, log = console.log) {
    const select = await waitForInput(selector, log);
    log(`Selecting ${label}: ${value}`);
    select.scrollIntoView({ block: 'center' });
    await sleep(800);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(800);
    await waitForPageReady(log);
  }

  async function fillHypothecationDetails(payload, log = console.log) {
    if (!isHypothecated(payload)) {
      log('Hypothecation is false; skipping hypothecation details.');
      return;
    }

    const financierName = getFinancierName(payload);
    if (!financierName) {
      throw new Error('Missing hypothecation.financierName in payload.');
    }

    await openAccordionByText('Hypothecation Details', log);
    await selectValue('#financierDetails', 'Hypothecated', 'financier details', log);
    await fillInput('#hypothecatedToOrLeaseOrHirePurchaseWith', financierName, 'financier name', log);
  }

  async function clickNext(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const nextButton = document.querySelector('#view_plan');
      if (isVisible(nextButton)) {
        log('Clicking vehicle details Next button');
        await clickElement(nextButton);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Vehicle details Next button not found.');
  }

  async function waitForAndClickNoConfirmation(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const noButton = Array.from(document.querySelectorAll('button.btn.btn-outline-secondary'))
        .find((button) => isVisible(button) && button.textContent.trim() === 'No');

      if (noButton) {
        log('Clicking No confirmation button');
        await clickElement(noButton);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('No confirmation button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing vehicle details page', 'vehicle-details:start');
    log('Royal Sundaram vehicle details flow started', payload);
    logStep(log, 'Flow started');
    await waitForPageReady(log);

    await checkpoint('Filling registration address line 1', 'vehicle-details:address1');
    logStep(log, 'Filling registration address line 1');
    await fillInput('#registrationAddressLine1', getAddressLine1(payload), 'registration address line 1', log);
    await checkpoint('Filling registration address line 2', 'vehicle-details:address2');
    logStep(log, 'Filling registration address line 2');
    await fillInput('#registrationAddressLine2', getAddressLine2(payload), 'registration address line 2', log);
    await checkpoint('Filling pincode', 'vehicle-details:pincode');
    logStep(log, 'Filling pincode');
    await fillInput('#pinCode', getPincode(payload), 'pincode', log);
    await checkpoint('Filling chassis number', 'vehicle-details:chassis');
    logStep(log, 'Filling chassis number');
    await fillInput('#chassisNo', getChassisNumber(payload), 'chassis number', log);
    await checkpoint('Filling engine number', 'vehicle-details:engine');
    logStep(log, 'Filling engine number');
    await fillInput('#engineNo', getEngineNumber(payload), 'engine number', log);
    await checkpoint('Handling hypothecation section', 'vehicle-details:hypothecation');
    logStep(log, 'Handling hypothecation section');
    await fillHypothecationDetails(payload, log);
    await checkpoint('Clicking Next on vehicle details', 'vehicle-details:next');
    logStep(log, 'Clicking Next');
    await clickNext(log);
    await checkpoint('Handling No confirmation popup', 'vehicle-details:no-confirmation');
    logStep(log, 'Handling no confirmation popup');
    await waitForAndClickNoConfirmation(log);

    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'Vehicle details entered and confirmation handled.' };
  }

  window.RoyalVehicleDetails = { run };
})();
