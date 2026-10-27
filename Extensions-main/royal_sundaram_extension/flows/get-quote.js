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

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function normalizeCityOptionText(value) {
    return normalizeText(value).replace(/^[a-z0-9]{3}\s*-\s*/, '');
  }

  function normalizeVehicleOptionText(value) {
    return normalizeText(value)
      .replace(/^[a-z0-9]+\s*-\s*/, '')
      .replace(/\s*seat\s+cap\s*:.*$/i, '')
      .trim();
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

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dispatchKeyboard(input, type, key) {
    input.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key
    }));
  }

  function dispatchKeydownAndPress(input, key) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key
    }));
    input.dispatchEvent(new KeyboardEvent('keypress', {
      bubbles: true,
      cancelable: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key
    }));
  }

  function dispatchKeyup(input, key) {
    input.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key
    }));
  }

  async function clearInput(input) {
    input.focus();
    input.click();
    input.select?.();
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'a',
      code: 'KeyA',
      ctrlKey: true
    }));
    setNativeInputValue(input, '');
    dispatchKeyboard(input, 'keydown', 'Backspace');
    dispatchKeyboard(input, 'keyup', 'Backspace');
    await sleep(150);
  }

  async function typeLikeUser(input, value, options = {}) {
    if (!options.skipClear) {
      await clearInput(input);
    }
    for (const char of value) {
      dispatchKeydownAndPress(input, char);
      input.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char
      }));
      setNativeInputValue(input, input.value + char);
      dispatchKeyup(input, char);
      await sleep(80);
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function fillCityAutocompleteInput(input, city, log = console.log) {
    await waitForPageReady(log);
    input.scrollIntoView({ block: 'center' });
    input.focus();
    clickElement(input);
    await sleep(250);
    await waitForPageReady(log);

    input.focus();
    input.value = city;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: city
    }));
    await sleep(1000);
    await waitForPageReady(log);
  }

  function getCity(payload) {
    return payload?.customerDetails?.address?.city || '';
  }

  function getMake(payload) {
    return payload?.vehicleDetails?.make || '';
  }

  function getModelVariant(payload) {
    const model = payload?.vehicleDetails?.model || '';
    const variant = payload?.vehicleDetails?.variant || '';
    return [model, variant].filter(Boolean).join(' ').trim();
  }

  function getIdv(payload) {
    return payload?.vehicleDetails?.idv ||
      payload?.vehicleDetails?.IDV ||
      payload?.vehicleDetails?.insuredDeclaredValue ||
      '';
  }

  function findRegistrationCityInput() {
    const exact = document.querySelector(
      'input[name="city"], ' +
      'input.p-autocomplete-input[name="city"][role="searchbox"][aria-autocomplete="list"], ' +
      'input.p-autocomplete-input[name="city"][role="searchbox"], ' +
      'input[name="city"][aria-autocomplete="list"], ' +
      'p-autocomplete input[name="city"]'
    );
    if (isVisible(exact)) return exact;

    const direct = document.querySelector(
      'p-autocomplete#city input, p-autocomplete[name="city"] input, input[name="city"][role="searchbox"]'
    );
    if (isVisible(direct)) return direct;

    const labels = Array.from(document.querySelectorAll('label, .p-float-label, .field, .form-group, .col, .col-12'));
    for (const label of labels) {
      const text = normalizeText(label.textContent);
      if (!text.includes('registration') || !text.includes('city')) continue;

      const forId = label.getAttribute('for');
      const byFor = forId ? document.getElementById(forId) : null;
      if (isVisible(byFor) && byFor.tagName === 'INPUT') return byFor;

      const wrapper = label.closest('.p-field, .field, .form-group, .col, .col-12, p-autocomplete') || label.parentElement;
      const input = wrapper?.querySelector('p-autocomplete input, input.p-autocomplete-input, input[role="searchbox"], input');
      if (isVisible(input)) return input;
    }

    return null;
  }

  async function waitForRegistrationCityInput(timeout = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(console.log);
      const input = findRegistrationCityInput();
      if (input) return input;
      await sleep(250);
    }
    throw new Error('Registration city autocomplete input not found.');
  }

  function getExactCityOptions(city) {
    const expected = normalizeText(city);
    return getAutocompleteOptions().filter((option) => normalizeCityOptionText(option.textContent) === expected);
  }

  function getAutocompleteOptions() {
    const panels = Array.from(document.querySelectorAll(
      '.p-autocomplete-panel, .p-autocomplete-items, [role="listbox"]'
    )).filter(isVisible);
    const roots = panels.length ? panels : [document];
    const selectors = [
      '.p-autocomplete-item',
      'li[role="option"]',
      '[role="option"]',
      'li'
    ];

    const seen = new Set();
    const options = [];

    for (const root of roots) {
      for (const selector of selectors) {
        for (const option of root.querySelectorAll(selector)) {
          if (!isVisible(option) || seen.has(option)) continue;
          const text = normalizeText(option.textContent);
          if (!text || text.includes('no result')) continue;
          seen.add(option);
          options.push(option);
        }
      }
    }

    return options;
  }

  function describeAutocompleteOptions() {
    return getAutocompleteOptions().map((option, index) => ({
      index: index + 1,
      text: option.textContent.replace(/\s+/g, ' ').trim(),
      normalized: normalizeVehicleOptionText(option.textContent),
      className: option.className || '',
      role: option.getAttribute('role') || ''
    }));
  }

  function getExactVehicleOptions(expectedText) {
    const expected = normalizeVehicleOptionText(expectedText);
    return getAutocompleteOptions().filter((option) => normalizeVehicleOptionText(option.textContent) === expected);
  }

  async function waitForExactVehicleOption(expectedText, log = console.log, timeout = 15000) {
    const startedAt = Date.now();
    let lastOptions = [];
    let didLogOptions = false;

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const option = getExactVehicleOptions(expectedText)[0];
      if (option) return option;

      const options = describeAutocompleteOptions();
      if (options.length) {
        lastOptions = options;
        if (!didLogOptions) {
          log(`model dropdown visible options while searching "${expectedText}": ${JSON.stringify(options)}`);
          didLogOptions = true;
        }
      }
      await sleep(250);
    }

    const finalOptions = describeAutocompleteOptions();
    if (finalOptions.length) lastOptions = finalOptions;
    log(`model dropdown final options for "${expectedText}": ${JSON.stringify(lastOptions)}`);
    const availableOptionsText = lastOptions.map((option) => option.text || option.normalized || '').filter(Boolean).join(' | ') || 'none';
    throw new Error(`Exact vehicle model/variant option not found: ${expectedText}. Available options: ${availableOptionsText}`);
  }

  function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Get Quote] ${step}`);
      return;
    }
    log(`[Get Quote] ${step}`, details);
  }

  async function waitForAndClickOkPopup(log = console.log, timeout = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const okButton = Array.from(document.querySelectorAll('a.btn.btn-primary'))
        .find((element) => element.textContent.trim() === 'OK' && element.offsetParent !== null);

      if (okButton) {
        log('Clicking OK popup');
        okButton.scrollIntoView({ block: 'center' });
        ['mousedown', 'mouseup', 'click'].forEach((type) => {
          okButton.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window
          }));
        });
        await sleep(500);
        return true;
      }

      await sleep(250);
    }

    throw new Error('Visible OK popup button not found.');
  }

  async function waitForExactCityOption(city, timeout = 20000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(console.log);
      const option = getExactCityOptions(city)[0];
      if (option) return option;
      await sleep(250);
    }
    throw new Error(`Exact registration city option not found in dropdown: ${city}`);
  }

  function findTodayDateCell() {
    const today = new Date().getDate().toString();
    const selectors = [
      '.p-datepicker td:not(.p-disabled) span',
      '.p-datepicker-calendar td:not(.p-disabled) span',
      '[role="gridcell"]'
    ];

    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .find((element) => {
        if (!isVisible(element)) return false;
        if (element.closest('.p-datepicker-other-month')) return false;
        return element.textContent.trim() === today;
      });
  }

  async function selectTodayRegistrationDate(log = console.log) {
    await waitForPageReady(log);
    const dateInput = document.querySelector('input[name="dateofRegistrationOfTheVehicle"]');
    if (!dateInput) {
      throw new Error('Registration date input not found.');
    }

    log('Selecting today as registration date');
    clickElement(dateInput);
    await sleep(300);
    await waitForPageReady(log);

    const dateCell = findTodayDateCell();
    if (!dateCell) {
      throw new Error('Today date cell not found in registration date picker.');
    }

    clickElement(dateCell);
    await sleep(300);
    await waitForPageReady(log);
  }

  function findFirstMakeOption() {
    return Array.from(document.querySelectorAll('.p-autocomplete-item, [role="option"], .p-autocomplete-items li'))
      .find(isVisible) || null;
  }

  async function waitForFirstMakeOption(timeout = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(console.log);
      const option = findFirstMakeOption();
      if (option) return option;
      await sleep(250);
    }
    throw new Error('Make option not found.');
  }

  async function selectVehicleMake(make, log = console.log) {
    if (!make) {
      throw new Error('Missing vehicleDetails.make in payload.');
    }

    await waitForPageReady(log);
    const makeInput = document.querySelector('input[name="makeCode"]');
    if (!makeInput) {
      throw new Error('Vehicle make input not found.');
    }

    log(`Selecting vehicle make: ${make}`);
    makeInput.scrollIntoView({ block: 'center' });
    makeInput.focus();
    clickElement(makeInput);

    makeInput.value = '';
    makeInput.dispatchEvent(new Event('input', { bubbles: true }));

    const makeSearchText = `${make} `;
    for (const char of makeSearchText) {
      makeInput.value += char;
      makeInput.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: char,
        inputType: 'insertText'
      }));
      await sleep(50);
    }

    await sleep(700);
    await waitForPageReady(log);

    const makeOption = await waitForFirstMakeOption();
    log(`Selecting make option: ${makeOption.textContent.replace(/\s+/g, ' ').trim()}`);
    clickElement(makeOption);
    makeInput.dispatchEvent(new Event('change', { bubbles: true }));
    makeInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(1200);
    await waitForPageReady(log);
  }

  async function selectVehicleModelVariant(modelVariant, log = console.log) {
    if (!modelVariant) {
      throw new Error('Missing vehicleDetails.model / vehicleDetails.variant in payload.');
    }

    await waitForPageReady(log);
    const modelInput = document.querySelector('input[name="modelCode"]');
    if (!modelInput) {
      throw new Error('Vehicle model input not found.');
    }

    const modelSearchText = `${modelVariant} `;
    log(`Selecting exact vehicle model/variant: ${modelVariant}`);
    modelInput.scrollIntoView({ block: 'center' });
    modelInput.focus();
    clickElement(modelInput);
    modelInput.value = modelSearchText;
    modelInput.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: ' ',
      inputType: 'insertText'
    }));

    await sleep(1200);
    await waitForPageReady(log);

    const modelOption = await waitForExactVehicleOption(modelVariant, log);
    log(`Selecting exact model/variant option: ${modelOption.textContent.replace(/\s+/g, ' ').trim()}`);
    clickElement(modelOption);
    modelInput.dispatchEvent(new Event('change', { bubbles: true }));
    modelInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(1000);
    await waitForAndClickOkPopup(log);
    await sleep(1200);
    await waitForPageReady(log);
  }

  async function fillIdv(idv, log = console.log) {
    if (idv === '' || idv == null) {
      throw new Error('Missing vehicleDetails.idv in payload.');
    }

    await waitForPageReady(log);
    const idvInput = document.querySelector('input[name="idv"], input#idv');
    if (!idvInput) {
      throw new Error('IDV input not found.');
    }

    const idvValue = String(idv).trim();
    log(`Entering IDV: ${idvValue}`);
    idvInput.scrollIntoView({ block: 'center' });
    idvInput.focus();
    clickElement(idvInput);
    idvInput.value = idvValue;
    idvInput.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: idvValue,
      inputType: 'insertText'
    }));
    idvInput.dispatchEvent(new Event('change', { bubbles: true }));
    idvInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(300);
    await waitForPageReady(log);
  }

  async function clickViewPlanNext(log = console.log, timeout = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const nextButton = document.querySelector('button#view_plan, #view_plan');
      if (isVisible(nextButton) && !nextButton.disabled) {
        log('Clicking View Plan Next button');
        clickElement(nextButton);
        await sleep(1000);
        return true;
      }
      await sleep(250);
    }

    throw new Error('View Plan Next button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing quote page', 'get-quote:start');
    logStep(log, 'Waiting for loader to disappear before get quote execution');
    await waitForPageReady(log);
    logStep(log, 'Flow started');
    const city = getCity(payload);
    if (!city) {
      return { success: false, error: 'Missing customerDetails.address.city in payload.' };
    }

    await checkpoint('Selecting registration city', 'get-quote:city');
    log(`Selecting registration city: ${city}`);
    await waitForPageReady(log);
    const cityInput = await waitForRegistrationCityInput();
    logStep(log, 'Registration city input located');
    await fillCityAutocompleteInput(cityInput, city, log);
    logStep(log, 'Registration city typed', { city });

    const cityOption = await waitForExactCityOption(city);
    await waitForPageReady(log);
    log(`Selecting exact registration city option: ${cityOption.textContent.replace(/\s+/g, ' ').trim()}`);
    clickElement(cityOption);
    cityInput.dispatchEvent(new Event('change', { bubbles: true }));
    cityInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(300);
    await waitForPageReady(log);
    logStep(log, 'Registration city selected');

    await checkpoint('Selecting registration date', 'get-quote:registration-date');
    logStep(log, 'Selecting registration date');
    await selectTodayRegistrationDate(log);
    await waitForPageReady(log);
    logStep(log, 'Registration date selected');
    await checkpoint('Selecting vehicle make', 'get-quote:make');
    logStep(log, 'Selecting vehicle make');
    await selectVehicleMake(getMake(payload), log);
    await waitForPageReady(log);
    logStep(log, 'Vehicle make selected');
    await checkpoint('Selecting vehicle model and variant', 'get-quote:model-variant');
    logStep(log, 'Selecting vehicle model and variant');
    await selectVehicleModelVariant(getModelVariant(payload), log);
    await sleep(800);
    await waitForPageReady(log);
    logStep(log, 'Vehicle model and variant selected');
    await checkpoint('Entering IDV', 'get-quote:idv');
    logStep(log, 'Entering IDV');
    await fillIdv(getIdv(payload), log);
    await waitForPageReady(log);
    logStep(log, 'IDV entered');
    await checkpoint('Clicking View Plan', 'get-quote:view-plan');
    logStep(log, 'Clicking View Plan');
    await clickViewPlanNext(log);

    logStep(log, 'Keeping pending payload for select plan page handoff');
    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'City, registration date, make, model, IDV, and Next selected.' };
  }

  window.RoyalGetQuote = { run };
})();
