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
      throw new Error('Other Details flow stopped');
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

  function normalizeSpaces(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

  function isDisabled(element) {
    return element.disabled ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.classList.contains('mat-mdc-button-disabled') ||
      element.classList.contains('mdc-button--disabled');
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

  function findFinancierNameInput() {
    const selectors = [
      'input[data-iid*="financier" i]',
      'input[data-iid*="finance" i]',
      'input[placeholder*="financier" i]',
      'input[placeholder*="finance" i]',
      'input[title*="financier" i]',
      'input[title*="finance" i]',
      '#mat-input-39'
    ];

    for (const selector of selectors) {
      const found = document.querySelector(selector);
      if (found && !found.disabled) return found;
    }

    const formFieldInput = Array.from(document.querySelectorAll('mat-form-field')).find(field => {
      const text = normalize(field.innerText);
      return (text.includes('financier') || text.includes('finance') || text.includes('bank')) &&
        field.querySelector('input:not([type="hidden"])');
    })?.querySelector('input:not([type="hidden"])');
    if (formFieldInput && !formFieldInput.disabled) return formFieldInput;

    return Array.from(document.querySelectorAll('input:not([type="hidden"])')).find(input => {
      const type = normalize(input.type || 'text');
      const value = String(input.value || '').trim();
      return !input.disabled && ['text', 'search', ''].includes(type) && !value;
    });
  }

  async function fillExisting(selectorOrFinder, value, label, log, timeout = 30000) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Entering ${label}`);
    const description = typeof selectorOrFinder === 'string' ? selectorOrFinder : label;
    const input = await waitUntil(log, description, () => {
      return typeof selectorOrFinder === 'function'
        ? selectorOrFinder()
        : document.querySelector(selectorOrFinder);
    }, timeout);
    input.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    input.focus?.();
    setNativeValue(input, value);
    await pace();
    log(`${label} entered: ${value}`);
  }

  function getNomineeRelationshipOption(value) {
    const relationship = normalize(value);
    if (['spouse', 'wife', 'husband'].includes(relationship)) {
      return 'spouse';
    }

    if (['son', 'daughter', 'child'].includes(relationship)) {
      return 'child';
    }

    if (['mother', 'father', 'uncle', 'aunt'].includes(relationship)) {
      return 'parent';
    }

    return 'other';
  }

  function findActionByLabel(text) {
    const expected = normalize(text);
    const label = Array.from(document.querySelectorAll('span.mdc-button__label')).find(item => {
      return normalize(item.textContent) === expected && isVisible(item);
    });

    return label?.closest('button, a, [role="button"]') || null;
  }

  function findInputByMatLabel(labelText) {
    const expected = normalize(labelText);
    const label = Array.from(document.querySelectorAll('mat-label')).find(item => {
      return normalize(item.textContent).includes(expected);
    });

    return label?.closest('mat-form-field')?.querySelector('input, textarea') || null;
  }

  async function clickActionByLabel(text, label, log, timeout = 30000) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitUntil(log, label, () => findActionByLabel(text), timeout);
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
  }

  async function selectMatOptionByText(selectSelector, value, label, log, timeout = 30000) {
    if (!value) {
      throw new Error(`Missing value for ${label}`);
    }

    await checkpoint(`Selecting ${label}`);
    const select = await waitForVisible(selectSelector, log, timeout);
    select.scrollIntoView({ block: 'center', inline: 'nearest' });
    select.click();
    await sleep(ACTION_DELAY);

    const expected = normalize(value);
    const option = await waitUntil(log, `${label} option ${value}`, () => {
      return Array.from(document.querySelectorAll('mat-option, [role="option"]')).find(item => {
        return isVisible(item) && normalize(item.textContent) === expected;
      });
    }, 15000);

    option.click();
    log(`${label} selected: ${value}`);
    await pace();
  }

  async function fillWithoutCpaNominee(payload, log) {
    const nominee = payload?.nominee || payload?.Nominee || {};
    const nomineeName = normalizeSpaces(nominee.nomineeName || nominee.nomineename);
    const nomineeRelationship = nominee.nomineeRelationship || nominee.nomineerelationship;
    const nomineeDateOfBirth = nominee.nomineeDateOfBirth || nominee.nomineedateofbirth;

    await clickActionByLabel('Add Entry', 'Nominee Add Entry', log);
    await fillExisting(() => findInputByMatLabel('Nominee name'), nomineeName, 'Nominee name', log);
    await selectMatOptionByText('mat-select[data-iid="beneficiary_type_tmpl"]', 'Individual', 'Nominee type', log);
    await selectMatOptionByText(
      'mat-select[data-iid="beneficiary_relationship_tmpl"]',
      getNomineeRelationshipOption(nomineeRelationship),
      'Nominee relationship',
      log
    );
    await fillExisting('input[data-iid="beneficiary_share_tmpl"]', '100', 'Nominee share', log);
    await fillExisting('input[data-iid="beneficiary_dob_tmpl"]', nomineeDateOfBirth, 'Nominee DOB', log);
    await clickActionByLabel('Save', 'Nominee Save', log);
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

  async function clickExisting(selector, label, log, timeout = 30000) {
    await checkpoint(`Clicking ${label}`);
    const element = await waitUntil(log, selector, () => document.querySelector(selector), timeout);
    element.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    element.click();
    log(`${label} clicked`);
    await pace();
    return element;
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
    return getNearbyText(container || group);
  }

  function findRadioInGroup(group, targetLabel) {
    return Array.from(group.querySelectorAll('input[type="radio"]')).find(input => {
      const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const radioButton = input.closest('mat-radio-button, .mat-mdc-radio-button');
      const labelText = normalize(label?.textContent || radioButton?.textContent);
      return normalize(input.value) === targetLabel || labelText === targetLabel;
    });
  }

  function findHypothecationRadio(wantYes) {
    const targetLabel = wantYes ? 'yes' : 'no';
    const groups = Array.from(document.querySelectorAll('mat-radio-group')).filter(isVisible);

    for (const group of groups) {
      if (getGroupContextText(group).includes('hypothecat')) {
        const input = findRadioInGroup(group, targetLabel);
        if (input && !input.disabled) return input;
      }
    }

    return Array.from(document.querySelectorAll('input[type="radio"]')).find(input => {
      const wrapper = input.closest('.radio-container, mat-radio-group, mat-radio-button, .mat-mdc-radio-button, .mdc-form-field') || input;
      const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const labelText = normalize(label?.textContent || input.closest('mat-radio-button, .mat-mdc-radio-button')?.textContent);
      return isVisible(wrapper) && !input.disabled && (normalize(input.value) === targetLabel || labelText === targetLabel);
    });
  }

  async function clickHypothecationRadio(wantYes, log) {
    const targetLabel = wantYes ? 'Yes' : 'No';
    await checkpoint(`Selecting Hypothecation ${targetLabel}`);
    const input = await waitUntil(log, `Hypothecation ${targetLabel} radio`, () => findHypothecationRadio(wantYes), 30000);
    const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
    clickElement(label || findRadioClickTarget(input) || input);
    await waitUntil(log, `Hypothecation ${targetLabel} radio selected`, () => input.checked, 5000);
    log(`Hypothecation ${targetLabel} radio clicked`);
    await pace();
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

  function waitForProposalResponseErrors(timeout = 30000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(null);
      }, timeout);

      function onMessage(event) {
        if (event.source !== window ||
          event.data?.source !== 'KSHEMA_QUOTE_RESPONSE_HOOK' ||
          event.data?.type !== 'PROPOSAL_RESPONSE') {
          return;
        }

        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(Array.isArray(event.data.errors) ? event.data.errors : []);
      }

      window.addEventListener('message', onMessage);
    });
  }

  async function clickSaveContinueAndCheckProposalErrors(log) {
    const proposalResponseErrors = waitForProposalResponseErrors();
    await clickWhenReady('button[data-iid="save_continue"], button[data-iid="save"]', 'Other Details Save and Continue', log);

    const errors = await proposalResponseErrors;
    if (errors === null) {
      log('No /api/v1/proposal response captured after Other Details Save and Continue; continuing');
      return;
    }

    const firstError = errors.find(error => error?.msg);
    if (firstError?.msg) {
      const fieldName = firstError.name ? `${firstError.name}: ` : '';
      throw new Error(`${fieldName}${firstError.msg}`);
    }

    log('/api/v1/proposal response has no errors; continuing');
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

  function isOtherDetailsStepActive() {
    return Array.from(document.querySelectorAll('.stepper-item-text')).some(item => {
      return normalize(item.textContent).includes('other details') && item.classList.contains('stepper-active');
    });
  }

  async function waitForOtherDetailsStep(log) {
    await waitUntil(log, 'Other Details step active', isOtherDetailsStepActive, 60000);
  }

  window.KshemaOtherDetails = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    isActive: isOtherDetailsStepActive,

    async run(payload, log) {
      stopRequested = false;
      log('Other Details flow started');

      await waitForOtherDetailsStep(log);

      const agentDetails = payload?.agentDetails || payload?.agentdetails || {};
      const customerDetails = payload?.customerDetails || payload?.customerdetails || {};
      const withoutCpa = agentDetails?.withoutcpa === true || customerDetails?.withoutcpa === true;
      if (withoutCpa) {
        await fillWithoutCpaNominee(payload, log);
      } else {
        log('Without CPA nominee entry skipped from JSON');
      }

      const hypothecation = payload?.hypothecation || payload?.Hypothecation || {};
      if (isTruthy(hypothecation.isHypothecated)) {
        await clickHypothecationRadio(true, log);
        await fillExisting(findFinancierNameInput, hypothecation.financierName, 'Financier name', log);
      } else {
        log('Hypothecation skipped from JSON');
      }

      await clickSaveContinueAndCheckProposalErrors(log);
      await waitForLoadingComplete(log);
      await clickWhenReady('button[data-iid="finalize"]', 'Other Details Save and Finalize', log);

      if (window.KshemaKyc && typeof window.KshemaKyc.run === 'function') {
        log('Waiting for CKYC step after other details finalize');
        const kycResult = await window.KshemaKyc.run(payload, log);
        return kycResult;
      }

      return { success: true, message: 'Kshema other details flow completed' };
    }
  };
})();
