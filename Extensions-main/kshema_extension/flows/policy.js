(function () {
  'use strict';

  const NEW_QUOTE_SELECTOR = 'div[title="New Quote"], [title="New Quote"]';
  const ACTION_DELAY = 500;

  let stopRequested = false;

  function getController() {
    return window.KshemaAutomationController || null;
  }

  async function checkpoint(stepLabel) {
    const controller = getController();
    if (controller?.checkpoint) {
      await controller.checkpoint(stepLabel);
    }
    if (stopRequested) {
      throw new Error('Policy flow stopped');
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

  function isExplicitFalse(value) {
    const normalized = normalize(value);
    return value === false || value === 0 || normalized === 'false' || normalized === '0' || normalized === 'no';
  }

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function formatRto(value) {
    const parts = compact(value).toUpperCase().split(/[\s-]+/).filter(Boolean);
    if (parts.length > 1 && parts[0] === parts[1]) {
      parts.splice(1, 1);
    }
    if (parts.length >= 3) {
      return `${parts[0]}-${parts[1]} ${parts.slice(2).join(' ')}`;
    }
    return parts.join('-');
  }

  function formatToday() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${now.getFullYear()}`;
  }

  async function waitUntil(log, description, callback, timeout = 20000) {
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

  async function waitForVisible(selector, log, timeout) {
    return waitUntil(log, `visible ${selector}`, () => {
      return Array.from(document.querySelectorAll(selector)).find(isVisible);
    }, timeout);
  }

  function findExactTextAction(text) {
    const expected = normalize(text);
    return Array.from(document.querySelectorAll('button, a, [role="button"]')).find(element => {
      return isVisible(element) && normalize(element.textContent) === expected;
    }) || null;
  }

  async function clickOkIfPresent(log, timeout = 3000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await checkpoint('Checking for OK dialog');
      const okButton = findExactTextAction('OK');
      if (okButton) {
        okButton.scrollIntoView({ block: 'center', inline: 'nearest' });
        okButton.click();
        log('OK dialog clicked after Limited TPPD Yes; switching Limited TPPD to No');
        await pace();
        return true;
      }

      await sleep(250);
    }

    return false;
  }

  function getNewQuoteButton() {
    return Array.from(document.querySelectorAll(NEW_QUOTE_SELECTOR)).find(isVisible);
  }

  async function openNewQuoteIfNeeded(log) {
    const existingForm = document.querySelector('mat-select[data-iid="c_category"], input[data-iid="c_first_name"]');
    if (existingForm) {
      log('Policy form already visible, skipping New Quote click');
      return;
    }

    const newQuoteButton = await waitUntil(log, 'New Quote / two wheeler tile', getNewQuoteButton, 60000);
    newQuoteButton.scrollIntoView({ block: 'center', inline: 'nearest' });
    newQuoteButton.click();
    log('New Quote / two wheeler tile clicked');
    await pace();
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

    element.dispatchEvent(new Event('focus', { bubbles: true }));
    if (typeof InputEvent === 'function') {
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: stringValue
      }));
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

    if (String(input.value) !== String(value)) {
      setNativeValue(input, value);
      await pace();
    }

    if (String(input.value) !== String(value)) {
      throw new Error(`${label} was not accepted by the page`);
    }

    log(`${label} entered: ${value}`);
  }

  async function fillOptionalInput(selector, value, label, log) {
    await checkpoint(`Entering ${label}`);
    const input = await waitForVisible(selector, log);
    const stringValue = value === undefined || value === null ? '' : String(value);
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    input.focus();
    setNativeValue(input, stringValue);
    await pace();

    if (String(input.value) !== stringValue) {
      setNativeValue(input, stringValue);
      await pace();
    }

    if (String(input.value) !== stringValue) {
      throw new Error(`${label} was not accepted by the page`);
    }

    log(`${label} entered: ${stringValue || '(blank)'}`);
  }

  async function fillInputWithoutStrictVerify(selector, value, label, log) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Entering ${label}`);
    const input = await waitForVisible(selector, log);
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    input.focus();
    setNativeValue(input, value);
    await pace();
    log(`${label} entered: ${value}; page value: ${input.value || '(empty)'}`);
  }

  async function clickVisible(selector, label, log, timeout) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitForVisible(selector, log, timeout);
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  function isDisabled(element) {
    return element.disabled ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.classList.contains('mat-mdc-button-disabled') ||
      element.classList.contains('mdc-button--disabled');
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

  async function clickWhenReady(selector, label, log, timeout = 60000) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitUntil(log, `${label} ready`, () => {
      const found = Array.from(document.querySelectorAll(selector)).find(item => {
        return isVisible(item) && !isDisabled(item);
      });
      return found || null;
    }, timeout);

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  async function clickFirstAvailable(selectors, label, log, timeout = 20000) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitUntil(log, label, () => {
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)).find(isVisible);
        if (found) return found;
      }
      return null;
    }, timeout);

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
  }

  function readPayload(payload) {
    const customerDetails = payload?.customerDetails || payload?.customerdetails;
    const vehicleDetails = payload?.vehicleDetails || payload?.vehicledetails;
    const covers = payload?.covers || {};
    const coverageDetails = payload?.coverageDetails || payload?.coveragedetails || {};
    const vehicleInformation = payload?.vehicleInformation || payload?.vehicleinformation;
    const agentDetails = payload?.agentDetails || payload?.agentdetails || {};
    const address = customerDetails?.address || {};

    if (!customerDetails) throw new Error('Missing customerDetails in pasted JSON');
    if (!vehicleDetails) throw new Error('Missing vehicleDetails in pasted JSON');
    if (!vehicleInformation) throw new Error('Missing vehicleInformation in pasted JSON');

    return {
      customerDetails,
      vehicleDetails,
      covers,
      coverageDetails,
      vehicleInformation,
      agentDetails,
      address
    };
  }

  function getProductType(vehicleDetails, coverageDetails) {
    const vehicleClass = normalize(vehicleDetails.vehicleClass);
    const coverage = normalize(coverageDetails.coverage || 'Bundled');
    const vehicleType = vehicleClass.includes('scooter') || vehicleClass.includes('motorcycle') || vehicleClass.includes('bike')
      ? 'Two Wheeler'
      : compact(vehicleDetails.vehicleClass);
    const coverType = coverage.includes('bundled') ? 'Bundled' : compact(coverageDetails.coverage || 'Bundled');

    if (!vehicleType || !coverType) {
      throw new Error('Unable to derive product type from vehicleDetails.vehicleClass');
    }

    return `${vehicleType}-${coverType}`;
  }

  async function selectMatOption(selectSelector, expectedValue, label, log, options = {}) {
    if (!expectedValue) {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Selecting ${label}`);
    await clickVisible(selectSelector, `${label} dropdown`, log);
    await sleep(options.delay || ACTION_DELAY);

    const expected = normalize(expectedValue);
    const matcher = options.match === 'startsWith'
      ? text => text.startsWith(expected)
      : options.match === 'includes'
        ? text => text.includes(expected)
        : text => text === expected;

    const findMatchingOption = () => {
      const items = Array.from(document.querySelectorAll('mat-option'));
      return items.find(item => matcher(normalize(item.textContent)));
    };

    let iQubeBeforeJStartingModel = null;
    const findOptionPanel = () => {
      const visibleOption = Array.from(document.querySelectorAll('mat-option')).find(isVisible);
      return visibleOption?.closest('.mat-mdc-select-panel, .mat-select-panel, [role="listbox"]') || null;
    };

    const scrollOptionPanelDown = () => {
      const panel = findOptionPanel();
      if (!panel) return;

      panel.scrollTop += Math.max(panel.clientHeight * 0.75, 200);
      panel.dispatchEvent(new Event('scroll', { bubbles: true }));
    };

    const findIQubeOptionBeforeJModels = () => {
      const items = Array.from(document.querySelectorAll('mat-option')).filter(isVisible);
      const jStartingModelIndex = items.findIndex(item => normalize(item.textContent).startsWith('j'));
      const optionsBeforeJModels = jStartingModelIndex === -1
        ? items
        : items.slice(0, jStartingModelIndex);
      const iQubeOption = optionsBeforeJModels.filter(item => normalize(item.textContent) === expected).pop();

      if (iQubeOption) {
        iQubeBeforeJStartingModel = iQubeOption;
      }

      if (jStartingModelIndex === -1) {
        scrollOptionPanelDown();
      }

      return jStartingModelIndex === -1 ? null : iQubeBeforeJStartingModel;
    };

    let option;
    let temporaryFallbackSelected = false;
    if (options.preferMatchAfterJModels) {
      try {
        option = await waitUntil(log, `${label} iQube option before J models`, findIQubeOptionBeforeJModels, options.timeout || 15000);
      } catch (error) {
        log('iQube option before J models was not found; temporarily selecting the standard iQube option before retrying');
        const temporaryOption = await waitUntil(log, `${label} temporary iQube option`, findMatchingOption, options.timeout || 15000);
        temporaryOption.click();
        temporaryFallbackSelected = true;
        await sleep(options.after || ACTION_DELAY);

        await clickVisible(selectSelector, `${label} dropdown retry`, log);
        await sleep(options.delay || ACTION_DELAY);
        iQubeBeforeJStartingModel = null;
        const panel = findOptionPanel();
        if (panel) panel.scrollTop = 0;

        try {
          option = await waitUntil(log, `${label} iQube option before J models retry`, findIQubeOptionBeforeJModels, options.timeout || 15000);
        } catch (retryError) {
          log('iQube option before J models was still not found; keeping the temporarily selected iQube option as fallback');
        }
      }
    }

    if (!option) {
      if (temporaryFallbackSelected) {
        return;
      }
      option = await waitUntil(log, `${label} option ${expectedValue}`, () => {
        return findMatchingOption();
      }, options.timeout || 15000);
    }

    option.click();
    log(`${label} selected: ${compact(option.textContent)}`);
    await sleep(options.after || ACTION_DELAY);
  }

  async function fillIdv(value, log) {
    await fillInput('input[data-iid="insured_declared_value"]', value, 'IDV', log);
    await fillInputWithoutStrictVerify('input[data-iid="policy_start_date"]', formatToday(), 'Policy start date', log);
  }

  async function ensureCpaCheckboxChecked(log) {
    await checkpoint('Checking CPA checkbox');
    const checkbox = await waitUntil(log, 'CPA checkbox', () => {
      const container = document.querySelector('mat-checkbox[data-iid="cpa_yn"]');
      if (!container || !isVisible(container)) {
        return null;
      }

      return container.querySelector('input[type="checkbox"]');
    }, 20000);

    checkbox.scrollIntoView({ block: 'center', inline: 'nearest' });

    if (!checkbox.checked) {
      checkbox.click();
      await pace();
    }

    if (!checkbox.checked) {
      const container = checkbox.closest('mat-checkbox[data-iid="cpa_yn"]');
      const label = container?.querySelector('label.mdc-label');
      label?.click();
      await pace();
    }

    if (!checkbox.checked) {
      throw new Error('CPA checkbox did not register as checked after click attempts');
    }

    log('CPA checkbox checked');
  }

  async function uncheckFirstCheckbox(log) {
    const checkbox = await waitUntil(log, 'checkbox', () => {
      const target = document.querySelector('.mat-mdc-checkbox-touch-target');
      return target?.closest('mat-checkbox')?.querySelector('input[type="checkbox"]');
    });

    if (checkbox.checked) {
      checkbox.click();
      log('Checkbox unchecked');
      await pace();
    } else {
      log('Checkbox already unchecked');
      await pace();
    }
  }

  async function selectReasonForUnselecting(log) {
    const select = await waitUntil(log, 'Reason for Unselecting dropdown', () => {
      return Array.from(document.querySelectorAll('mat-select')).find(item => {
        const formField = item.closest('mat-form-field');
        return formField &&
          normalize(formField.innerText).includes('reason for unselecting') &&
          isVisible(item);
      });
    }, 20000);

    select.scrollIntoView({ block: 'center', inline: 'nearest' });
    select.click();
    log('Reason for Unselecting dropdown clicked');
    await pace();

    const option = await waitUntil(log, 'Personal accident policy 15L option', () => {
      return Array.from(document.querySelectorAll('mat-option')).find(item => {
        return normalize(item.textContent) === 'already have personal accident policy with 15l sum insured';
      });
    }, 15000);

    option.click();
    log('Reason selected: Already have personal accident policy With 15L Sum Insured');
    await pace();
  }

  function clickElement(element) {
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  function findRadioClickTarget(input) {
    if (!input) return null;

    return input.closest('.mdc-form-field')?.querySelector('label, .mat-mdc-radio-touch-target, .mdc-radio') ||
      input.closest('mat-radio-button')?.querySelector('label, .mat-mdc-radio-touch-target, .mdc-radio') ||
      input.closest('.mat-mdc-radio-button')?.querySelector('label, .mat-mdc-radio-touch-target, .mdc-radio') ||
      input.closest('.mdc-radio') ||
      input;
  }

  function getNearbyText(element) {
    const parts = [];
    let current = element;

    for (let depth = 0; current && depth < 4; depth += 1) {
      parts.push(current.previousElementSibling?.textContent);
      parts.push(current.parentElement?.previousElementSibling?.textContent);
      current = current.parentElement;
    }

    return normalize(parts.filter(Boolean).join(' '));
  }

  function getGroupContextText(group) {
    const container = group.closest('.radio-container, mat-form-field, .row, [class*="field"]') || group.parentElement;
    return normalize(`${getNearbyText(container || group)} ${container?.textContent || ''} ${group.textContent || ''}`);
  }

  function findRadioInGroup(group, targetLabel) {
    return Array.from(group.querySelectorAll('input[type="radio"]')).find(input => {
      const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const radioButton = input.closest('mat-radio-button, .mat-mdc-radio-button');
      const labelText = normalize(label?.textContent || radioButton?.textContent);
      return normalize(input.value) === targetLabel ||
        labelText === targetLabel ||
        labelText.includes(` ${targetLabel} `);
    });
  }

  function findLimitedTppdRadio(wantYes) {
    const targetLabel = wantYes ? 'yes' : 'no';

    const groups = Array.from(document.querySelectorAll('mat-radio-group')).filter(isVisible);

    for (const group of groups) {
      if (getGroupContextText(group).includes('limited tppd')) {
        const input = findRadioInGroup(group, targetLabel);
        if (input && !input.disabled) {
          return input;
        }
      }
    }

    return Array.from(document.querySelectorAll('input[type="radio"]')).find(input => {
      const wrapper = input.closest('.radio-container, mat-radio-group, mat-radio-button, .mat-mdc-radio-button, .mdc-form-field') || input;
      const group = input.closest('mat-radio-group');
      const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const labelText = normalize(label?.textContent || input.closest('mat-radio-button, .mat-mdc-radio-button')?.textContent);
      const contextText = normalize(`${getGroupContextText(group || wrapper)} ${wrapper.textContent || ''}`);

      return isVisible(wrapper) &&
        !input.disabled &&
        contextText.includes('limited tppd') &&
        (normalize(input.value) === targetLabel || labelText === targetLabel || labelText.includes(` ${targetLabel} `));
    }) || null;
  }

async function selectLimitedTppdRadioOption(wantYes, log) {
  const label = wantYes ? 'Yes' : 'No';
  await checkpoint(`Selecting Limited TPPD ${label}`);
  await waitForLoadingComplete(log);
  const radioInput = await waitUntil(log, `Limited TPPD "${label}" radio option`, () => {
    return findLimitedTppdRadio(wantYes);
  }, 30000);
  const radioButton = radioInput.closest('mat-radio-button, .mat-mdc-radio-button') || radioInput;
  radioButton.scrollIntoView({ block: 'center', inline: 'nearest' });

  if (!radioInput.checked) {
    clickElement(findRadioClickTarget(radioInput) || radioInput);
    await sleep(100);

    if (!radioInput.checked) {
      radioInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      radioInput.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      radioInput.click();
      await sleep(100);
    }

    if (!radioInput.checked) {
      const label = radioButton.querySelector('label.mdc-label');
      if (label) {
        label.click();
        await sleep(100);
      }
    }

    log(`"${label}" radio option clicked; checked state now: ${radioInput.checked}`);
    await pace();

    if (!radioInput.checked) {
      throw new Error(`"${label}" radio did not register as selected after click attempts`);
    }
  } else {
    log(`"${label}" radio option already selected`);
    await pace();
  }
}

async function selectYesRadioOption(log) {
  await selectLimitedTppdRadioOption(true, log);
}

async function selectLimitedTppdYesWithNoFallback(log) {
  await selectLimitedTppdRadioOption(true, log);

  if (await clickOkIfPresent(log)) {
    throw new Error('tppd discount rejected in this rto');
  }

  return true;
}

async function selectDiscountRadioOption(log) {
  await checkpoint('Selecting Discount radio');
  const radioButton = await waitUntil(log, 'Discount radio option', () => {
    return Array.from(document.querySelectorAll('mat-radio-button')).find(btn => {
      const input = btn.querySelector('input[type="radio"][value="Discount" i]');
      return input && isVisible(btn);
    });
  }, 20000);

  const radioInput = radioButton.querySelector('input[type="radio"]');
  radioButton.scrollIntoView({ block: 'center', inline: 'nearest' });

  if (!radioInput.checked) {
    radioInput.click();
    await sleep(100);

    if (!radioInput.checked) {
      radioInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      radioInput.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      radioInput.click();
      await sleep(100);
    }

    if (!radioInput.checked) {
      const label = radioButton.querySelector('label.mdc-label');
      if (label) {
        label.click();
        await sleep(100);
      }
    }

    log(`Discount radio clicked; checked state now: ${radioInput.checked}`);
    await pace();

    if (!radioInput.checked) {
      throw new Error('Discount radio did not register as selected after click attempts');
    }
  } else {
    log('Discount radio already selected');
    await pace();
  }
}

function getAllowedDiscount(vehicleDetails) {
  const allowedDiscount = vehicleDetails?.alloweddiscount ?? vehicleDetails?.allowedDiscount;
  return allowedDiscount === undefined || allowedDiscount === null || String(allowedDiscount).trim() === ''
    ? 50
    : allowedDiscount;
}

async function fillBrokerLoadDiscountValue(vehicleDetails, log) {
  const allowedDiscount = getAllowedDiscount(vehicleDetails);
  await fillInput('input[data-iid="broker_load_disc_value"]', allowedDiscount, 'Broker load/discount value', log);
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

async function saveAndContinue(log) {
  await waitForLoadingComplete(log);
  // Start listening before the click so the response for this exact save is not missed.
  const quoteResponseErrors = waitForQuoteResponseErrors();
  await clickWhenReady('button[data-iid="save_continue"]', 'Save and Continue', log);
  await waitForLoadingComplete(log);

  const errors = await quoteResponseErrors;
  if (errors === null) {
    log('No /api/v1/quote response captured after Save and Continue');
    return;
  }

  // Add-on selection happens in the following KshemaAddon flow, so this
  // intermediate policy-save validation must not stop execution.
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


  window.KshemaPolicy = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isNewQuoteAvailable() {
      return !!getNewQuoteButton();
    },

    async run(payload, log) {
      stopRequested = false;
      log('Policy flow started');

      await openNewQuoteIfNeeded(log);

      const { customerDetails, vehicleDetails, covers, coverageDetails, vehicleInformation, agentDetails, address } = readPayload(payload);
      const middleName = customerDetails.middleName || customerDetails.middlename || '';
      const surname = customerDetails.lastName || customerDetails.lastname || '';
      const lastName = [middleName, surname].filter(Boolean).join(' ').trim();
      const mobile = customerDetails.mobile || customerDetails.Mobile || customerDetails.mobileNumber || customerDetails.mobile_number;
      const locality = address.locality || customerDetails.locality || address.street || address.city || customerDetails.city;
      const pincode = address.pincode || customerDetails.pincode;
      const rto = formatRto(vehicleDetails.rto || vehicleDetails.RTO || vehicleDetails.rtoCode);
      const productType = getProductType(vehicleDetails, coverageDetails);
      const withoutCpa =
        customerDetails?.withoutcpa === true ||
        customerDetails?.withoutCpa === true ||
        agentDetails?.withoutcpa === true;
      let shouldSelectLimitedTppd = !isExplicitFalse(covers?.tppdristricted);

      log('Payload mapped: customerDetails, customerDetails.address, vehicleDetails, vehicleInformation');

      await selectMatOption('mat-select[data-iid="c_category"]', customerDetails.customerType, 'Customer category', log);
      await fillInput('input[data-iid="c_first_name"]', customerDetails.firstName, 'First name', log);
      await fillOptionalInput('input[data-iid="c_last_name"]', lastName, 'Last name', log);
      await fillInput('input[data-iid="c_mobile_number"]', mobile, 'Mobile number', log);
      await fillInput('input[data-iid="c_pincode"]', pincode, 'Pin code', log);
      await selectMatOption('mat-select[data-iid="pincode_locality"]', locality, 'Locality', log);

      await clickFirstAvailable([
        'input#mat-radio-13-input',
        'mat-radio-button input[type="radio"]',
        '.mat-mdc-radio-button input[type="radio"]',
        '.mat-mdc-radio-touch-target'
      ], 'First available radio after locality', log);

      await selectMatOption('mat-select[data-iid="make_mmv"]', vehicleDetails.make, 'Make', log);
      const isIQubeModel = normalize(vehicleDetails.model).replace(/\s+/g, '') === 'iqube';
      await selectMatOption('mat-select[data-iid="model_mmv"]', vehicleDetails.model, 'Model', log, {
        preferMatchAfterJModels: isIQubeModel
      });
      await selectMatOption('mat-select[data-iid="variant_mmv"]', vehicleDetails.variant, 'Variant', log);

      await fillInput('input[data-iid="engine_number"]', vehicleInformation.engineNumber, 'Engine number', log);
      await fillInput('input[data-iid="chassis_number"]', vehicleInformation.chassisNumber, 'Chassis number', log);
      await fillInputWithoutStrictVerify('input[data-iid="invoice_date"]', formatToday(), 'Invoice date', log);

      await selectMatOption('mat-select[data-iid="rto_location_mmv_1"]', rto, 'RTO', log, { match: 'startsWith' });
      await selectMatOption('mat-select[data-iid="product_type"]', productType, 'Product type', log);

      await fillIdv(vehicleDetails.idv, log);

      if (withoutCpa) {
        await ensureCpaCheckboxChecked(log);
      } else {
        await uncheckFirstCheckbox(log);
        await selectReasonForUnselecting(log);
      }

      if (shouldSelectLimitedTppd) {
        shouldSelectLimitedTppd = await selectLimitedTppdYesWithNoFallback(log);
      } else {
        log('Selecting Limited TPPD No because covers.tppdristricted is false');
        await selectLimitedTppdRadioOption(false, log);
      }

      await selectDiscountRadioOption(log);
      if (shouldSelectLimitedTppd) {
        shouldSelectLimitedTppd = await selectLimitedTppdYesWithNoFallback(log);
      }
      await fillBrokerLoadDiscountValue(vehicleDetails, log);
      await saveAndContinue(log);

      if (window.KshemaAddon && typeof window.KshemaAddon.run === 'function') {
        log('Starting addon flow after policy save and continue');
        const addonResult = await window.KshemaAddon.run(payload, log);
        return addonResult;
      }

      return { success: true, message: 'Kshema policy form completed' };
    }
  };
})();

