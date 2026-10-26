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

  function withStorageSet(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set(value, resolve);
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
      await sleep(250);
    }
  }

  function getMobile(payload) {
    return payload?.customerDetails?.mobile || payload?.customerDetails?.mobileNumber || payload?.mobile || '';
  }

  function getAddressBuilding(payload) {
    return payload?.customerDetails?.address?.building || '';
  }

  function getAddressLine2(payload) {
    const address = payload?.customerDetails?.address || {};
    return [address.city, address.street].filter(Boolean).join(' ').trim();
  }

  function getPincode(payload) {
    return payload?.customerDetails?.address?.pincode || '';
  }

  function getDateOfBirth(payload) {
    return payload?.customerDetails?.dateOfBirth || payload?.dateOfBirth || '';
  }

  function parseDate(value) {
    const text = String(value || '').trim();
    let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) return { day: match[1], month: match[2], year: match[3] };

    match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return { day: match[3], month: match[2], year: match[1] };

    match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return { day: match[1], month: match[2], year: match[3] };

    throw new Error(`Unsupported dateOfBirth format: ${text}`);
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await sleep(800);
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await sleep(800);
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Proposer Details] ${step}`);
      return;
    }
    log(`[Proposer Details] ${step}`, details);
  }

  async function waitForElement(selector, log = console.log, timeout = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const element = document.querySelector(selector);
      if (isVisible(element)) return element;
      await sleep(250);
    }
    throw new Error(`Element not found: ${selector}`);
  }

  async function fillInput(selector, value, label, log = console.log) {
    if (!value) throw new Error(`Missing value for ${label}.`);
    const input = await waitForElement(selector, log);
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

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
      return;
    }
    input.value = value;
  }

  async function selectDobFromCalendar(dateOfBirth, log = console.log) {
    const date = parseDate(dateOfBirth);
    const targetYear = Number(date.year);
    const targetMonthIndex = Number(date.month) - 1;
    const targetDay = String(Number(date.day));
    const monthNames = 'January February March April May June July August September October November December'.split(' ');
    const calendar = await waitForElement('span.p-calendar:has(input[name="dateOfBirth"])', log);
    const triggerButton = calendar.querySelector('button.p-datepicker-trigger');

    if (!triggerButton) {
      throw new Error('Date of birth calendar trigger button not found.');
    }

    log(`Selecting DOB: ${date.day}/${date.month}/${date.year}`);
    calendar.scrollIntoView({ block: 'center' });
    triggerButton.click();

    const getOpenDatepicker = () => Array.from(document.querySelectorAll('.p-datepicker')).find((element) => element.offsetParent);
    const startedAt = Date.now();

    while (Date.now() - startedAt < 15000) {
      await waitForPageReady(log);
      const picker = getOpenDatepicker();
      if (!picker) {
        await sleep(250);
        continue;
      }

      const yearText = picker.querySelector('.p-datepicker-year')?.textContent?.trim();
      const monthText = picker.querySelector('.p-datepicker-month')?.textContent?.trim();
      const visibleYear = Number(yearText);
      const visibleMonthIndex = monthNames.indexOf(monthText);

      if (visibleYear === targetYear && visibleMonthIndex === targetMonthIndex) {
        const dayCell = Array.from(picker.querySelectorAll('td:not(.p-datepicker-other-month):not(.p-disabled) span'))
          .find((element) => element.textContent.trim() === targetDay);

        if (!dayCell) {
          throw new Error(`DOB day ${targetDay} not found in calendar.`);
        }

        dayCell.click();
        await waitForPageReady(log);
        return;
      }

      const monthDelta = ((targetYear - visibleYear) * 12) + (targetMonthIndex - visibleMonthIndex);
      const navButton = picker.querySelector(monthDelta > 0 ? '.p-datepicker-next' : '.p-datepicker-prev');
      if (!navButton) {
        throw new Error('Datepicker month navigation button not found.');
      }

      navButton.click();
    }

    throw new Error('Unable to navigate datepicker to requested DOB.');
  }

  async function selectOccupation(log = console.log) {
    const select = await waitForElement('#lgdName', log);
    log('Selecting occupation: Others');
    select.scrollIntoView({ block: 'center' });
    await sleep(800);
    select.value = 'Others';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(800);
    await waitForPageReady(log);
  }

  async function clickNext(log = console.log) {
    const next = await waitForElement('button#view_plan.next.hiding_offcanvas', log);
    log('Clicking proposer details Next button');
    await clickElement(next);
    await waitForPageReady(log);
  }

  async function waitForAndClickOk(log = console.log, timeout = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const ok = Array.from(document.querySelectorAll('a.btn.btn-primary, button.btn.btn-primary'))
        .find((element) => isVisible(element) && element.textContent.trim() === 'OK');
      if (ok) {
        log('Clicking OK confirmation');
        await clickElement(ok);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }
    throw new Error('OK confirmation button not found.');
  }

  async function waitForAndClickYes(log = console.log, timeout = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const yes = Array.from(document.querySelectorAll('a.btn.btn-primary, button.btn.btn-primary'))
        .find((element) => isVisible(element) && element.textContent.trim() === 'Yes');
      if (yes) {
        log('Clicking Yes confirmation');
        await clickElement(yes);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }
    throw new Error('Yes confirmation button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing proposer details page', 'proposer-details:start');
    log('Royal Sundaram proposer details flow started', payload);
    logStep(log, 'Flow started');
    await waitForPageReady(log);
    await checkpoint('Confirming initial Yes prompt', 'proposer-details:yes');
    logStep(log, 'Confirming initial Yes prompt');
    await waitForAndClickYes(log);
    await checkpoint('Filling mobile number', 'proposer-details:mobile');
    logStep(log, 'Filling mobile number');
    await fillInput('#mobile', getMobile(payload), 'mobile number', log);
    await checkpoint('Filling email', 'proposer-details:email');
    logStep(log, 'Filling email');
    await fillInput('#email', 'otpcoverscrafter@gmail.com', 'email', log);
    await checkpoint('Filling address line 1', 'proposer-details:address1');
    logStep(log, 'Filling address line 1');
    await fillInput('#address1', getAddressBuilding(payload), 'address line 1', log);
    await checkpoint('Filling address line 2', 'proposer-details:address2');
    logStep(log, 'Filling address line 2');
    await fillInput('#address2', getAddressLine2(payload), 'address line 2', log);
    await checkpoint('Filling pincode', 'proposer-details:pincode');
    logStep(log, 'Filling pincode');
    await fillInput('#pinCode', getPincode(payload), 'pincode', log);
    await checkpoint('Selecting occupation', 'proposer-details:occupation');
    logStep(log, 'Selecting occupation');
    await selectOccupation(log);
    await checkpoint('Selecting date of birth', 'proposer-details:dob');
    logStep(log, 'Selecting date of birth');
    await selectDobFromCalendar(getDateOfBirth(payload), log);
    await checkpoint('Clicking Next on proposer details', 'proposer-details:next');
    logStep(log, 'Clicking Next');
    await clickNext(log);
    await checkpoint('Confirming final OK prompt', 'proposer-details:ok');
    logStep(log, 'Confirming final OK prompt');
    await waitForAndClickOk(log);
    await checkpoint('Clicking final Next after OK', 'proposer-details:final-next');
    logStep(log, 'Clicking final Next after OK');
    logStep(log, 'Persisting proposer-to-KYC handoff');
    await withStorageSet({ royalVehicleSummaryMode: 'afterProposer' });
    await clickNext(log);
    await checkpoint('Confirming final Yes prompt', 'proposer-details:final-yes');
    logStep(log, 'Confirming final Yes prompt');
    await waitForAndClickYes(log);

    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'Proposer details entered.' };
  }

  window.RoyalProposerDetails = { run };
})();
