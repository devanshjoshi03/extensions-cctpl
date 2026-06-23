 /**
 * Universal Sompo Extension - Quote Details Flow
 * OPTIMIZED: Reduced all wait() calls while preserving functionality.
 *
 * FIX v2 — "stuck on Quote — Calculate Premium (2nd)" patches:
 *
 *  1. waitForPremiumCalculation — was silently looping 30× (9 s) when
 *     Add-On Premium stayed 0/null.  Now exits as soon as Proceed is
 *     enabled OR total-premium is visible, regardless of add-on status.
 *     Add-on check is advisory only (logged, not blocking).
 *
 *  2. _dismissPremiumPopup2nd — replaced waitForSwalToClose() (external,
 *     sometimes hangs) with an inline 3-second self-contained poll that
 *     resolves as soon as the swal2-popup disappears.
 *
 *  3. _waitForProceedOutcomePopup — reduced from 8 s to 4 s; polling
 *     interval tightened from 80 ms to 60 ms.
 *
 *  4. _waitForProposalDetailsActivation — "final wait" cap reduced from
 *     12 s to 8 s; intermediate attempts shortened accordingly.
 *
 *  5. clickCalculatePremium2ndPass — added a 300 ms "page-settle" pause
 *     after the backdrop clears before touching popup logic, so the swal
 *     has time to appear instead of being missed and the flow hanging in
 *     "no popup found" limbo.
 *
 *  6. _handleProceedToProposalDetails — each individual wait step now has
 *     a tighter cap; total budget reduced from ~35 s to ~20 s worst case.
 */
const SompoQuoteDetails = {
  async run(formData, logger = console.log) {
    try {
      this._quoteCreatedHandled = false;
      logger('📋 Starting Quote Details flow...');
      await wait(1000);

      await AutomationPauseController.checkpoint('Quote — Uncheck Quote Options');
      logger('📝 Step 0: Unchecking Email/SMS Quote checkboxes...');
      await this.uncheckQuoteCheckboxes(logger);
      await wait(300);

      await AutomationPauseController.checkpoint('Quote — Product Details');
      logger('📝 Step 1/5: Product Details...');
      await this.fillProductDetails(formData, logger);

      await AutomationPauseController.checkpoint('Quote — Basic Risk Details');
      logger('📝 Step 2/5: Basic Risk Details...');
      await this.fillBasicRiskDetails(formData, logger);

      await AutomationPauseController.checkpoint('Quote — Contact Details');
      logger('📝 Step 3/5: Contact Details...');
      await this.fillContactDetails(formData, logger);

      await AutomationPauseController.checkpoint('Quote — Calculate Premium (1st)');
      logger('🔄 Step 4/5: Calculate Premium (1st pass)...');
      await this.clickCalculatePremiumButton(logger);
      await wait(500);

      await AutomationPauseController.checkpoint('Quote — Cover Details');
      logger('📝 Step 5/5: Cover Details...');
      await this.fillCoverDetails(formData, logger);

      await AutomationPauseController.checkpoint('Quote — Calculate Premium (2nd)');
      logger('🔄 Calculate Premium (2nd pass)...');
      const secondPassResult = await this.clickCalculatePremium2ndPass(logger);
      await wait(200);

      await this._handleProceedToProposalDetails(secondPassResult, logger);

      logger('✅ Quote Details flow complete!');
      return { success: true };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') throw e;
      logger('❌ Quote Details error: ' + e.message);
      return { success: false, error: e.message };
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // ROBUST PROCEED → PROPOSAL DETAILS HANDLER
  // ═══════════════════════════════════════════════════════════════
  async _handleProceedToProposalDetails(secondPassResult, logger = console.log) {
    logger('🔄 _handleProceedToProposalDetails: starting...');

    await ensureQuoteCreatedPopupDismissed(logger, 3000, 300);   // was 4000
    await waitForMuiBackdropToClear(6000);                        // was 8000
    await this._dismissAnyVisibleSwal(logger);
    await wait(200);                                              // was 300

    if (await this._isProposalDetailsActive()) {
      logger('✅ Already on Proposal Details — no Proceed needed');
      return;
    }

    if (secondPassResult?.type === 'quote-created') {
      this._quoteCreatedHandled = true;
      logger('ℹ️ Quote was already created — waiting for Proposal Details activation...');
      const activated = await this._waitForProposalDetailsActivation(logger, 6000); // was 8000
      if (activated) return;
      logger('⚠️ Still not on Proposal Details after quote-created — clicking Proceed once...');
      await this.clickProceedButtonAdjacent(logger, false);
      await this._waitForProposalDetailsActivation(logger, 6000); // was 8000
      return;
    }

    logger('📝 Clicking Proceed...');
    await this.clickProceedButtonAdjacent(logger);

    await this._dismissAnyVisibleSwal(logger);
    await waitForMuiBackdropToClear(6000);                        // was 8000
    await wait(200);

    const activated = await this._waitForProposalDetailsActivation(logger, 6000); // was 8000
    if (activated) return;

    logger('⚠️ Proposal Details not active yet — trying Proceed again...');
    await this._dismissAnyVisibleSwal(logger);
    await ensureQuoteCreatedPopupDismissed(logger, 1500, 200);    // was 2000

    if (!await this._isProposalDetailsActive()) {
      await this.clickProceedButtonAdjacent(logger, false);
      await this._dismissAnyVisibleSwal(logger);
      await waitForMuiBackdropToClear(6000);                      // was 8000
    }

    const finalActivated = await this._waitForProposalDetailsActivation(logger, 8000); // was 12000
    if (finalActivated) {
      logger('✅ Proposal Details activated on final attempt');
    } else {
      logger('⚠️ Proposal Details activation not confirmed — continuing anyway');
    }
  },

  async _isProposalDetailsActive() {
    for (const el of document.querySelectorAll('span, div, p, button, a')) {
      if (el.offsetParent === null) continue;
      if ((el.textContent || '').trim() !== 'Proposal Details') continue;
      const classText = `${el.className || ''} ${el.parentElement?.className || ''} ${el.closest('[class*="step"]')?.className || ''}`;
      if (classText.includes('Mui-active') || classText.includes('Mui-completed') ||
          classText.includes('active') || classText.includes('selected')) {
        return true;
      }
    }
    return false;
  },

  async _dismissAnyVisibleSwal(logger = console.log) {
    const swal = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
    if (swal && swal.offsetParent !== null) {
      logger('🔍 Dismissing visible SweetAlert...');
      return dismissVisibleSwalPopup(logger, 'SweetAlert', { allowForceClose: true, waitForCloseMs: 5000 });
    }
    const muiDialog = document.querySelector('.MuiDialog-root, [role="dialog"]');
    if (muiDialog && muiDialog.offsetParent !== null) {
      const okBtn =
        findElementByText('button', 'OK') ||
        findElementByText('button', 'Ok') ||
        findElementByText('button', 'Close') ||
        muiDialog.querySelector('button');
      if (okBtn && okBtn.offsetParent !== null) {
        clickElement(okBtn);
        logger('✅ MUI dialog dismissed');
        await wait(400);
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // UNCHECK EMAIL / SMS QUOTE
  // ═══════════════════════════════════════════════════════════════
  async uncheckQuoteCheckboxes(logger = console.log) {
    logger('🔍 Unchecking Email Quote and SMS Quote checkboxes...');
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    let found = false;
    for (const cb of checkboxes) {
      const label = cb.closest('label') || document.querySelector(`label[for="${cb.id}"]`);
      const labelText = label?.textContent?.trim().toLowerCase() || '';
      if (labelText.includes('email quote') || labelText.includes('sms quote')) {
        if (cb.checked) {
          logger(`🔘 Unchecking: ${labelText}`);
          cb.click(); cb.checked = false;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('input',  { bubbles: true }));
          await wait(100); found = true;
        } else {
          logger(`ℹ️ Already unchecked: ${labelText}`);
        }
      }
    }
    if (!found) {
      for (const el of document.querySelectorAll('span, div, label')) {
        const text = el.textContent?.trim().toLowerCase() || '';
        if (text.includes('email quote') || text.includes('sms quote')) {
          const cb = el.querySelector('input[type="checkbox"]') ||
                     el.previousElementSibling?.querySelector('input[type="checkbox"]');
          if (cb && cb.checked) {
            logger(`🔘 Unchecking via text search: ${text}`);
            cb.click(); cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            await wait(100); found = true;
          }
        }
      }
    }
    logger(found ? '✅ Quote checkboxes unchecked' : 'ℹ️ No Email/SMS Quote checkboxes found or already unchecked');
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: PRODUCT DETAILS
  // ═══════════════════════════════════════════════════════════════
  async fillProductDetails(formData, logger = console.log) {
    const p = formData.planDetails || {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await wait(300);

    logger('🔍 Selecting Product (Motor Two Wheeler)...');
    await this.selectProductDropdown(logger);
    await wait(3000);

    const businessType = p.businessType || 'New Business';
    logger('🔍 Selecting Business Type: ' + businessType);
    await this.selectBusinessTypeRadio(businessType, logger);
    await wait(400);

    const tenure = p.tenure || '1 OD + 5 TP';
    logger('🔍 Selecting Tenure: ' + tenure);
    await this.selectTenureDropdown(tenure, logger);
    await wait(400);

    logger('✅ Product Details complete');
  },

  async selectProductDropdown(logger = console.log) {
    logger('🔍 === SELECT PRODUCT DROPDOWN - START ===');
    const muiAutocomplete = document.querySelector('.MuiAutocomplete-root');
    if (muiAutocomplete) {
      logger('✅ Found MUI Autocomplete dropdown');
      const input = muiAutocomplete.querySelector('input[type="text"]') ||
                    muiAutocomplete.querySelector('.MuiInputBase-input') ||
                    muiAutocomplete.querySelector('input');
      if (!input) throw new Error('❌ MUI Autocomplete input not found - STOPPING');

      muiAutocomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(150);
      highlightElement(muiAutocomplete, '#FF9800', 2000);
      await wait(200);

      input.click(); input.focus(); await wait(150);
      const productText = 'MOTOR TWO WHEELER BUNDLED POLICY (2369)';
      logger(`📝 Typing: ${productText}`);
      input.select(); input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(150);
      input.value = productText;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(400);

      let listbox = null;
      for (let i = 0; i < 10; i++) {
        listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                  document.querySelector('.MuiAutocomplete-popper ul') ||
                  document.querySelector('[role="listbox"]');
        if (listbox && listbox.offsetParent !== null) break;
        await wait(100);
      }
      if (listbox) {
        const items = listbox.querySelectorAll('li, [role="option"]');
        let motorOption = null;
        for (const item of items) {
          const text = item.textContent?.toLowerCase() || '';
          if (text.includes('motor') && text.includes('wheeler') && text.includes('bundled')) {
            motorOption = item; break;
          }
        }
        if (motorOption) {
          highlightElement(motorOption, '#4CAF50', 2000);
          await wait(100);
          motorOption.click();
          motorOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          logger('✅ MOTOR option clicked');
          await wait(400);
        } else if (items.length > 0) {
          logger('⚠️ Clicking first option as fallback');
          items[0].click(); await wait(400);
        }
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(300);
      }
      logger('✅ MOTOR TWO WHEELER selected');
      return;
    }
    throw new Error('❌ MUI Autocomplete not found - STOPPING');
  },

  async selectBusinessTypeRadio(businessType, logger = console.log) {
    const allLabels = document.querySelectorAll('label');
    for (const label of allLabels) {
      const text = label.textContent.trim();
      if (text.toLowerCase().includes(businessType.toLowerCase())) {
        const forId = label.getAttribute('for');
        const radio = forId ? document.getElementById(forId) : label.querySelector('input[type="radio"]');
        if (radio && radio.type === 'radio') {
          if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); }
          logger('✅ Business Type selected (strategy 1): ' + businessType);
          return;
        }
      }
    }
    let businessTypeLabel = null;
    for (const label of allLabels) {
      if (label.textContent.trim().toLowerCase().includes('business type')) {
        businessTypeLabel = label; break;
      }
    }
    if (businessTypeLabel) {
      let ancestor = businessTypeLabel.parentElement;
      for (let depth = 0; depth < 8 && ancestor; depth++) {
        const radios = Array.from(ancestor.querySelectorAll('input[type="radio"]'));
        if (radios.length > 0) {
          for (const radio of radios) {
            const rlabel = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`) || radio.nextElementSibling;
            const rlabelText = rlabel ? rlabel.textContent.trim() : radio.value;
            if (rlabelText.toLowerCase().includes(businessType.toLowerCase())) {
              if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); }
              logger('✅ Business Type selected (strategy 2): ' + businessType);
              return;
            }
          }
        }
        ancestor = ancestor.parentElement;
      }
    }
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.offsetParent !== null);
    for (const radio of allRadios) {
      const rlabel = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`) || radio.nextElementSibling;
      const rlabelText = (rlabel?.textContent?.trim() || radio.value || '');
      if (rlabelText.toLowerCase().includes(businessType.toLowerCase())) {
        if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); }
        logger('✅ Business Type selected (strategy 3): ' + businessType);
        return;
      }
    }
    throw new Error('❌ Business Type option not found: ' + businessType + ' - STOPPING');
  },

  async selectTenureDropdown(tenureValue, logger = console.log) {
    logger('🔍 === TENURE DROPDOWN - START ===');
    let tenureAutocomplete = null;
    for (const label of document.querySelectorAll('label')) {
      if (label.textContent?.toLowerCase().includes('tenure')) {
        let parent = label.parentElement;
        for (let depth = 0; depth < 5 && parent; depth++) {
          const mui = parent.querySelector('.MuiAutocomplete-root');
          if (mui && mui.offsetParent !== null) { tenureAutocomplete = mui; break; }
          parent = parent.parentElement;
        }
        if (tenureAutocomplete) break;
      }
    }
    if (!tenureAutocomplete) {
      const allMui = document.querySelectorAll('.MuiAutocomplete-root');
      if (allMui.length >= 2) tenureAutocomplete = allMui[1];
      else if (allMui.length === 1) tenureAutocomplete = allMui[0];
    }
    if (!tenureAutocomplete) throw new Error('❌ Tenure dropdown not found - STOPPING');

    const input = tenureAutocomplete.querySelector('input[type="text"]') ||
                  tenureAutocomplete.querySelector('.MuiInputBase-input') ||
                  tenureAutocomplete.querySelector('input');
    if (!input) throw new Error('❌ Tenure input not found - STOPPING');

    tenureAutocomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(100);
    highlightElement(tenureAutocomplete, '#FF9800', 2000);
    await wait(150);
    input.click(); input.focus(); await wait(150);
    logger(`📝 Typing: ${tenureValue}`);
    input.select(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(100);
    input.value = tenureValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(400);

    let listbox = null;
    for (let i = 0; i < 10; i++) {
      listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                document.querySelector('.MuiAutocomplete-popper ul') ||
                document.querySelector('[role="listbox"]');
      if (listbox && listbox.offsetParent !== null) break;
      await wait(100);
    }
    if (listbox) {
      const items = listbox.querySelectorAll('li, [role="option"]');
      let tenureOption = null;
      for (const item of items) {
        const text = item.textContent?.toLowerCase() || '';
        if (text.includes(tenureValue.toLowerCase()) || text.includes(tenureValue.replace(/\s/g, '').toLowerCase())) {
          tenureOption = item; break;
        }
      }
      if (tenureOption) {
        highlightElement(tenureOption, '#4CAF50', 2000);
        await wait(100);
        tenureOption.click();
        tenureOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        logger(`✅ Tenure "${tenureValue}" selected`);
        await wait(300);
      } else if (items.length > 0) {
        items[0].click(); await wait(300);
      }
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(200);
    }
    logger('✅ Tenure selection complete');
  },

  _findMuiAutocompleteByLabel(labelText) {
    for (const label of document.querySelectorAll('label')) {
      if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue;
      let parent = label.parentElement;
      for (let depth = 0; depth < 5 && parent; depth++) {
        const mui = parent.querySelector('.MuiAutocomplete-root');
        if (mui && mui.offsetParent !== null) return mui;
        parent = parent.parentElement;
      }
    }
    return null;
  },

  _getMuiAutocompleteInput(autocompleteEl) {
    if (!autocompleteEl) return null;
    return autocompleteEl.querySelector('input[type="text"]') ||
           autocompleteEl.querySelector('.MuiInputBase-input') ||
           autocompleteEl.querySelector('.MuiAutocomplete-input') ||
           autocompleteEl.querySelector('input');
  },

  _findFieldInputByLabel(labelText) {
    for (const label of document.querySelectorAll('label')) {
      if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue;
      const forId = label.getAttribute('for');
      let input = forId ? document.getElementById(forId) : null;
      if (!input) {
        const wrap = label.closest('.MuiFormControl-root, .MuiAutocomplete-root, .p-field, .field, .form-group, .col, .col-12') || label.parentElement;
        input = wrap?.querySelector('input:not([type="hidden"]), textarea, select');
      }
      if (input) return input;
    }
    return null;
  },

  _isNonEditableField(input) {
    if (!input) return false;
    return Boolean(
      input.disabled || input.readOnly ||
      input.getAttribute('readonly') !== null ||
      input.getAttribute('tabindex') === '-1' ||
      input.closest('.Mui-disabled')
    );
  },

  async _waitForFieldValueByLabel(labelText, logger = console.log, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const input = this._findFieldInputByLabel(labelText);
      const value = String(input?.value || '').trim();
      if (value) { logger(`✅ ${labelText} auto-populated: ${value}`); return value; }
      await wait(100);
    }
    return '';
  },

  _setMuiInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const prototypeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    const previousValue = input.value;
    if (prototypeSetter) prototypeSetter.call(input, value);
    else input.value = value;
    if (input._valueTracker) input._valueTracker.setValue(previousValue);
  },

  async _waitForMuiListbox(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                      document.querySelector('.MuiAutocomplete-popper ul') ||
                      document.querySelector('[role="listbox"]');
      if (listbox && listbox.offsetParent !== null) return listbox;
      await wait(100);
    }
    return null;
  },

  _getMuiVisibleOptions(listbox) {
    if (!listbox) return [];
    return Array.from(listbox.querySelectorAll('li, [role="option"]'))
      .filter(item => item.offsetParent !== null)
      .filter(item => {
        const text = item.textContent?.trim().toLowerCase() || '';
        return text && text !== 'no options';
      });
  },

  _normalizeOptionText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  },

  _vehicleSelectionLooksValid(finalValue, expectedQuery) {
    const finalNormalized = this._normalizeOptionText(finalValue);
    const queryParts = String(expectedQuery || '').split('|').map(part => this._normalizeOptionText(part)).filter(Boolean);
    if (!finalNormalized) return false;
    if (queryParts.length === 0) return true;
    return queryParts.every(part => {
      const tokens = part.split(' ').filter(Boolean);
      return tokens.every(token => finalNormalized.includes(token));
    });
  },

  _extractFuelTypeFromSelectedMakeModel(logger = console.log) {
    const autocompleteEl = this._findMuiAutocompleteByLabel('Vehicle Make/Model');
    const input = this._getMuiAutocompleteInput(autocompleteEl);
    const selectedText = input?.value?.trim() || '';
    if (!selectedText) return '';
    const match = selectedText.match(/\b(Petrol|Diesel|Electric|CNG|LPG|Hybrid)\b/i);
    if (!match) return '';
    const fuelType = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    logger(`ℹ️ Fuel Type inferred from Vehicle Make/Model selection: ${fuelType}`);
    return fuelType;
  },

  async selectMuiAutocompleteByLabel(labelText, valueToType, logger = console.log) {
    logger(`🔍 === MUI AUTOCOMPLETE: ${labelText} - START ===`);
    const desiredValue = String(valueToType || '').trim();
    if (!desiredValue) throw new Error(`❌ ${labelText}: No value provided - STOPPING`);
    const autocompleteEl = this._findMuiAutocompleteByLabel(labelText);
    if (!autocompleteEl) throw new Error(`❌ ${labelText} MUI Autocomplete not found - STOPPING`);
    const input = this._getMuiAutocompleteInput(autocompleteEl);
    if (!input) throw new Error(`❌ ${labelText} input not found - STOPPING`);

    autocompleteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(100);
    highlightElement(autocompleteEl, '#FF9800', 2000);
    await wait(100);

    const popupIndicator = autocompleteEl.querySelector('.MuiAutocomplete-popupIndicator, button[title], button[aria-label*="open" i]');
    input.click(); input.focus(); await wait(100);
    if (popupIndicator && popupIndicator.offsetParent !== null) { popupIndicator.click(); await wait(100); }

    logger(`📝 Typing: ${desiredValue}`);
    input.select();
    this._setMuiInputValue(input, '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await wait(100);
    this._setMuiInputValue(input, desiredValue);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: desiredValue }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(300);

    const listbox = await this._waitForMuiListbox(4000);
    if (listbox) {
      const allItems = Array.from(listbox.querySelectorAll('li, [role="option"]')).filter(item => item.offsetParent !== null);
      const options = this._getMuiVisibleOptions(listbox);
      logger(`📊 Found ${options.length} options`);
      const desiredNormalized = this._normalizeOptionText(desiredValue);
      let matchedOption = options.find(item => this._normalizeOptionText(item.textContent) === desiredNormalized);
      if (!matchedOption) matchedOption = options.find(item => this._normalizeOptionText(item.textContent).includes(desiredNormalized));
      if (!matchedOption && allItems.some(item => this._normalizeOptionText(item.textContent) === 'no options')) {
        throw new Error(`❌ ${labelText}: dropdown returned no options for "${desiredValue}" - STOPPING`);
      }
      if (matchedOption) {
        highlightElement(matchedOption, '#4CAF50', 2000); await wait(100);
        matchedOption.click(); await wait(300);
      } else if (options.length === 1) {
        options[0].click(); await wait(300);
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        await wait(100);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await wait(300);
      }
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await wait(300);
    }
    const finalValue = String(input.value || '').trim();
    const finalNormalized = this._normalizeOptionText(finalValue);
    const desiredNormalized = this._normalizeOptionText(desiredValue);
    if (!finalNormalized || (!finalNormalized.includes(desiredNormalized) && finalNormalized !== desiredNormalized)) {
      throw new Error(`❌ ${labelText}: selection did not stick (got "${finalValue}", expected "${desiredValue}") - STOPPING`);
    }
    logger(`✅ ${labelText} selection complete: ${finalValue}`);
  },

  async selectMuiAutocompleteFirstOption(labelText, valueToType, logger = console.log) {
    logger(`🔍 === MUI AUTOCOMPLETE FIRST OPTION: ${labelText} - START ===`);
    const desiredValue = String(valueToType || '').trim();
    if (!desiredValue) throw new Error(`❌ ${labelText}: No value provided - STOPPING`);
    const autocompleteEl = this._findMuiAutocompleteByLabel(labelText);
    if (!autocompleteEl) throw new Error(`❌ ${labelText} MUI Autocomplete not found - STOPPING`);
    const input = this._getMuiAutocompleteInput(autocompleteEl);
    if (!input) throw new Error(`❌ ${labelText} input not found - STOPPING`);

    autocompleteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(100);
    highlightElement(autocompleteEl, '#FF9800', 2000);
    await wait(100);

    const popupIndicator = autocompleteEl.querySelector('.MuiAutocomplete-popupIndicator, button[title], button[aria-label*="open" i]');
    input.click(); input.focus(); await wait(100);
    if (popupIndicator && popupIndicator.offsetParent !== null) { popupIndicator.click(); await wait(100); }

    logger(`📝 Typing: ${desiredValue}`);
    input.select();
    this._setMuiInputValue(input, '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await wait(100);
    this._setMuiInputValue(input, desiredValue);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: desiredValue }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(300);

    const listbox = await this._waitForMuiListbox(4000);
    if (listbox) {
      const allItems = Array.from(listbox.querySelectorAll('li, [role="option"]')).filter(item => item.offsetParent !== null);
      const options = this._getMuiVisibleOptions(listbox);
      logger(`📊 Found ${options.length} options`);
      if (options.length === 0 && allItems.some(item => this._normalizeOptionText(item.textContent) === 'no options')) {
        throw new Error(`❌ ${labelText}: dropdown returned no options for "${desiredValue}" - STOPPING`);
      }
      if (options.length > 0) {
        highlightElement(options[0], '#4CAF50', 2000); await wait(100);
        options[0].click();
        logger(`✅ ${labelText} - FIRST option selected: ${options[0].textContent?.trim()}`);
        await wait(300);
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
        await wait(100);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        await wait(300);
      }
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await wait(300);
    }
    const finalValue = String(input.value || '').trim();
    if (!this._vehicleSelectionLooksValid(finalValue, desiredValue)) {
      throw new Error(`❌ ${labelText}: selection did not stick (got "${finalValue}", expected query "${desiredValue}") - STOPPING`);
    }
    logger(`✅ ${labelText} selection complete: ${finalValue}`);
  },

  _inferFuelType(vehicleDetails = {}, vehicleInformation = {}) {
    const explicitFuelType = vehicleDetails.fuelType || vehicleInformation.fuelType;
    if (explicitFuelType) return String(explicitFuelType).trim();
    const combined = [vehicleDetails.variant, vehicleDetails.model, vehicleDetails.make,
      vehicleDetails.vehicleClass, vehicleDetails.vehicleType,
      vehicleInformation.sector, vehicleInformation.typeOfBody,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!combined) return '';
    if (combined.includes('electric') || combined.includes('battery') || /\bev\b/.test(combined)) return 'Electric';
    if (combined.includes('diesel')) return 'Diesel';
    if (combined.includes('cng')) return 'CNG';
    if (combined.includes('lpg')) return 'LPG';
    if (combined.includes('hybrid')) return 'Hybrid';
    if (combined.includes('petrol')) return 'Petrol';
    const isTwoWheeler = combined.includes('motor cycle') || combined.includes('motorcycle') ||
                         combined.includes('2w') || combined.includes('bike') || combined.includes('scooter');
    if (isTwoWheeler) return 'Petrol';
    return '';
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: BASIC RISK DETAILS
  // ═══════════════════════════════════════════════════════════════
  async fillBasicRiskDetails(formData, logger = console.log) {
    const v  = formData.vehicleDetails     || {};
    const vi = formData.vehicleInformation || {};
    scrollToBottom(); await wait(300);

    const regNumber = v.registrationNumber || v.registrationNo;
    if (regNumber) {
      logger('🔍 Filling Registration No: ' + regNumber);
      await this.fillRegistrationNo(regNumber, logger);
      await wait(200);
    }

    const rtoValue = v.rtoCode || v.rtoLocation;
    if (rtoValue) {
      logger('🔍 Selecting RTO Location: ' + rtoValue);
      await this.selectMuiAutocompleteByLabel('RTO Location', rtoValue, logger);
      await wait(300);
    } else {
      throw new Error('❌ RTO Location is required but not provided - STOPPING');
    }

    const makeModelValue = v.make + ' | ' + v.variant;
    if (makeModelValue) {
      logger('🔍 Selecting Vehicle Make/Model: ' + makeModelValue);
      await this.selectMuiAutocompleteFirstOption('Vehicle Make/Model', makeModelValue, logger);
      await wait(300);
    } else {
      throw new Error('❌ Vehicle Make/Model is required but not provided - STOPPING');
    }

    if (v.variant) {
      logger('🔍 Selecting Variant: ' + v.variant);
      try { await this.selectMuiAutocompleteByLabel('Variant', v.variant, logger); }
      catch (e) { logger('⚠️ Variant: ' + e.message); }
      await wait(200);
    }

    const year = String(vi.yearOfManufacture || v.yearOfManufacture || '');
    if (year) {
      logger('🔍 Selecting Manufacturing Year: ' + year);
      await this.selectMuiAutocompleteByLabel('Manufacturing Year', year, logger);
      await wait(200);
    }

    const fuelType = this._inferFuelType(v, vi) || this._extractFuelTypeFromSelectedMakeModel(logger);
    const fuelTypeInput = this._findFieldInputByLabel('Fuel Type');
    if (fuelTypeInput && this._isNonEditableField(fuelTypeInput)) {
      logger('ℹ️ Fuel Type field is readonly/disabled — not editing it');
      const actualFuelType = await this._waitForFieldValueByLabel('Fuel Type', logger, 4000);
      if (!actualFuelType) logger('⚠️ Fuel Type stayed empty in a readonly field');
      await wait(100);
    } else if (fuelType) {
      logger('🔍 Selecting Fuel Type: ' + fuelType);
      try { await this.selectMuiAutocompleteByLabel('Fuel Type', fuelType, logger); }
      catch (e) { logger('⚠️ Fuel Type: ' + e.message); }
      await wait(200);
    } else {
      logger('ℹ️ Fuel Type not provided and could not be inferred from payload');
    }

    const seats = String(v.seatingCapacity || '2');
    const seatingInput = this._findFieldInputByLabel('SEATING CAPACITY') || this._findFieldInputByLabel('Seating Capacity');
    if (seatingInput && this._isNonEditableField(seatingInput)) {
      logger('ℹ️ Seating Capacity field is readonly — not editing it');
      const actualSeats = await this._waitForFieldValueByLabel('SEATING CAPACITY', logger, 2000) ||
        await this._waitForFieldValueByLabel('Seating Capacity', logger, 300);
      if (!actualSeats) logger('⚠️ Seating Capacity stayed empty in readonly field');
    } else {
      try { await fillInputByLabel('Seating Capacity', seats); logger('✅ Seating Capacity: ' + seats); }
      catch (e) { logger('⚠️ Seating Capacity: ' + e.message); }
    }
    await wait(150);

    const ccValue = String(v.cubicCapacity || '').trim();
    const ccInput = this._findFieldInputByLabel('CC/KW');
    if (ccInput && this._isNonEditableField(ccInput)) {
      logger('ℹ️ CC/KW field is readonly — not editing it');
      const actualCC = await this._waitForFieldValueByLabel('CC/KW', logger, 2000);
      if (!actualCC) logger('⚠️ CC/KW stayed empty in readonly field');
    } else if (ccValue) {
      try { await fillInputByLabel('CC/KW', ccValue); logger('✅ CC/KW: ' + ccValue); }
      catch (e) { logger('⚠️ CC/KW: ' + e.message); }
      await wait(150);
    }

    // Use registration date from JSON if available, otherwise fallback to current date
    const regDate = v.registrationDate || this._getCurrentDateFormatted();
    logger('🔍 Filling Registration Date: ' + regDate);
    await this.fillRegistrationDate(regDate, logger);
    await wait(200);

    logger('ℹ️ Policy Start Date skipped - already filled by default');
    logger('🔍 Clicking GET IDV...');
    await this.clickGetIDVButton(logger);
    await waitForMuiBackdropToClear(20000);
    await wait(500);

    if (v.idv) {
      logger('🔍 Filling IDV: ' + v.idv);
      await this.fillIDVValue(v.idv, logger);
      await wait(200);
    }

    logger('✅ Basic Risk Details complete');
  },

  async fillRegistrationNo(regNumber, logger = console.log) {
    const clean = regNumber.replace(/[-\s]/g, '').toUpperCase();
    if (clean.length < 8) { logger('⚠️ Invalid registration: ' + regNumber); return; }
    const parts = [clean.substring(0,2), clean.substring(2,4), clean.substring(4,6), clean.substring(6)];
    const regLabel = findElementByText('label', 'Registration No');
    if (!regLabel) { logger('⚠️ Registration No label not found'); return; }
    const container = regLabel.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted') || regLabel.parentElement;
    if (!container) { logger('⚠️ Registration No container not found'); return; }
    const inputs = Array.from(container.querySelectorAll('input[type="text"]'))
      .filter(i => i.offsetParent)
      .filter(i => !this._isNonEditableField(i));
    for (let i = 0; i < Math.min(inputs.length, parts.length); i++) {
      fillInput(inputs[i], parts[i]);
      logger('✅ Reg part ' + (i+1) + ': ' + parts[i]);
      await wait(150);
    }
  },

  _getCurrentDateFormatted() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}-${month}-${year}`;
  },

  async fillRegistrationDate(dateValue, logger = console.log) {
    logger('🔍 === REGISTRATION DATE - START ===');
    logger(`📅 Setting date to: ${dateValue}`);

    try {
      // Primary method: Use the provided selector approach
      logger('🔍 Using primary method: document.querySelector and flatpickr');
      const dateInput = document.querySelector('#mui-25');
      if (!dateInput) {
        throw new Error('❌ Date input #mui-25 not found - trying fallback method');
      }
      
      // Click to open calendar
      dateInput.click();
      await wait(500);
      
      // Click today's date (current date)
      const todayElement = document.querySelector('.flatpickr-day.today:not(.disabled)');
      if (todayElement) {
        todayElement.click();
        logger('✅ Today\'s date selected using flatpickr');
        await wait(400);
      } else {
        throw new Error('❌ Today element not found in flatpickr calendar');
      }
      
      logger(`✅ Registration Date set using primary method`);
      return;
      
    } catch (primaryError) {
      logger(`⚠️ Primary method failed: ${primaryError.message}`);
      logger('🔍 Trying fallback method...');
      
      // Fallback method: Use the original complex logic
      const parts = dateValue.split(/[-/]/);
      if (parts.length !== 3) throw new Error('❌ Invalid date format - expected DD-MM-YYYY');
      const targetDay = parseInt(parts[0], 10), targetMonth = parseInt(parts[1], 10), targetYear = parseInt(parts[2], 10);
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      logger(`📅 Fallback - Target: Day=${targetDay}, Month=${monthNames[targetMonth-1]}, Year=${targetYear}`);

      const dateLabel = findElementByText('label', 'Registration/Purchase Date') || findElementByText('label', 'Registration Date');
      if (!dateLabel) throw new Error('❌ Date label not found - STOPPING');
      const container = dateLabel.closest('.p-field, .field, .form-group, .col-12, .col, .MuiFormControl-root') || dateLabel.parentElement;
      if (!container) throw new Error('❌ Date container not found - STOPPING');
      const dateInput = container.querySelector('input[type="text"], input:not([type="hidden"])');
      if (!dateInput) throw new Error('❌ Date input not found - STOPPING');

      dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(200);
      highlightElement(dateInput, '#FF9800', 2000);
      dateInput.click();
      dateInput.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      dateInput.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
      dateInput.focus();
      await wait(600);

      const getCalendarPanel = () => {
        for (const sel of document.querySelectorAll('select')) {
          if (sel.offsetParent === null) continue;
          const hasMonth = Array.from(sel.options).some(o => monthNames.some(m => o.textContent.includes(m)));
          if (hasMonth) {
            let p = sel.parentElement;
            while (p && p !== document.body) { if (p.querySelector('table') || p.querySelector('td')) return p; p = p.parentElement; }
            return sel.closest('div[class*="panel"], div[class*="picker"], div[class*="calendar"]') || sel.parentElement?.parentElement;
          }
        }
        for (const div of document.querySelectorAll('div')) {
          if (div.offsetParent === null) continue;
          const rect = div.getBoundingClientRect();
          if (rect.height < 200 || rect.width < 200) continue;
          if (div.querySelector('table') && div.querySelectorAll('td').length >= 28) {
            const ir = dateInput.getBoundingClientRect();
            if (Math.abs(rect.top - ir.bottom) < 400 || Math.abs(ir.top - rect.bottom) < 400) return div;
          }
        }
        return null;
      };

      let calPanel = null;
      for (let i = 0; i < 20; i++) {
        calPanel = getCalendarPanel();
        if (calPanel) { logger(`✅ Calendar panel found (attempt ${i+1})`); break; }
        await wait(200);
      }
      if (!calPanel) throw new Error('❌ Calendar panel did not open - STOPPING');

      const yearInput = calPanel.querySelector('input[type="number"]') ||
        (() => { for (const i of calPanel.querySelectorAll('input')) { const v = parseInt(i.value,10); if (v>=1900&&v<=2100) return i; } return null; })();
      if (!yearInput) throw new Error('❌ Year input not found - STOPPING');

      yearInput.focus(); yearInput.click(); await wait(100);
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      nativeSetter.call(yearInput, String(targetYear));
      yearInput.dispatchEvent(new Event('input',  { bubbles: true }));
      yearInput.dispatchEvent(new Event('change', { bubbles: true }));
      yearInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      logger(`✅ Year set to: ${targetYear}`);
      await wait(400);

      const monthSelect = calPanel.querySelector('select');
      if (!monthSelect) throw new Error('❌ Month select not found - STOPPING');
      let monthSet = false;
      for (const opt of monthSelect.options) {
        if (opt.textContent.trim() === monthNames[targetMonth-1] || opt.textContent.trim().toLowerCase().startsWith(monthNames[targetMonth-1].toLowerCase())) {
          monthSelect.value = opt.value;
          monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
          logger(`✅ Month set to: ${opt.textContent.trim()}`);
          monthSet = true; break;
        }
      }
      if (!monthSet) { monthSelect.selectedIndex = targetMonth-1; monthSelect.dispatchEvent(new Event('change', { bubbles: true })); }
      await wait(400);

      logger(`🔍 Looking for day: ${targetDay}`);
      await wait(200);
      let dayCell = null;
      for (const td of calPanel.querySelectorAll('td')) {
        if ((td.className||'').includes('other-month') || (td.className||'').includes('disabled')) continue;
        const span = td.querySelector('span'), btn = td.querySelector('button'), a = td.querySelector('a');
        const text = (span||btn||a||td).textContent?.trim();
        if (text && parseInt(text,10) === targetDay) { dayCell = span||btn||a||td; break; }
      }
      if (!dayCell) {
        for (const el of calPanel.querySelectorAll('span, button, a, td')) {
          const text = el.textContent?.trim();
          if (!text || parseInt(text,10) !== targetDay) continue;
          if (parseFloat(window.getComputedStyle(el).opacity) < 0.5) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 10 || r.height < 10) continue;
          dayCell = el; break;
        }
      }
      if (!dayCell) throw new Error(`❌ Day ${targetDay} not found in calendar - STOPPING`);

      highlightElement(dayCell, '#4CAF50', 1500); await wait(100);
      dayCell.click();
      dayCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      logger(`✅ Clicked day ${targetDay}`);
      await wait(400);
      if (getCalendarPanel()) { document.body.click(); await wait(200); }
      logger(`✅ Registration Date set using fallback method: ${dateValue}`);
    }
  },

  async clickGetIDVButton(logger = console.log) {
    const btn = findElementByText('button','GET IDV') || findElementByText('button','Get IDV') ||
                findElementByText('button','Fetch IDV') || document.querySelector('button[class*="idv" i]');
    if (!btn) { logger('⚠️ GET IDV button not found'); return; }
    clickElement(btn);
    logger('✅ GET IDV clicked — waiting for API...');
  },

  async fillIDVValue(idvValue, logger = console.log) {
    logger('🔍 === FILLING IDV: ' + idvValue + ' ===');
    this._lastIDVValue = this._normalizeIDVValue(idvValue);

    let idvLabel = null;
    for (const label of document.querySelectorAll('label')) {
      const text = label.textContent.trim();
      if (text === 'IDV' || text === 'IDV *' || text.startsWith('IDV')) {
        idvLabel = label; logger('✅ IDV label found: ' + text); break;
      }
    }
    if (!idvLabel) { logger('❌ IDV label not found'); return; }

    const container = idvLabel.closest('.MuiFormControl-root, .p-field, .field, .form-group, .col, .col-12') || idvLabel.parentElement;
    const input = container
      ? container.querySelector('input[type="text"], input[type="number"], input:not([type="hidden"])')
      : null;
    if (!input) { logger('❌ IDV input not found'); return; }

    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(200);
    highlightElement(input, '#FF9800', 2000);
    await this._typeIDVWithKeystrokes(input, this._lastIDVValue, logger);
    logger('✅ IDV fill complete: ' + idvValue);
    await wait(150);
  },

  _normalizeIDVValue(value) {
    return String(value == null ? '' : value).replace(/,/g, '').trim();
  },

  _parseIDVNumber(value) {
    const normalized = this._normalizeIDVValue(value);
    if (!normalized) return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  },

  _idvValuesMatch(actualValue, expectedValue) {
    const actualNumber = this._parseIDVNumber(actualValue);
    const expectedNumber = this._parseIDVNumber(expectedValue);
    if (!Number.isNaN(actualNumber) && !Number.isNaN(expectedNumber)) {
      return Math.abs(actualNumber - expectedNumber) < 0.5;
    }
    return this._normalizeIDVValue(actualValue) === this._normalizeIDVValue(expectedValue);
  },

  _setReactInputValue(input, nextValue) {
    const normalizedNext = String(nextValue);
    const previousValue = input.value;
    const prototype = Object.getPrototypeOf(input);
    const prototypeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    const ownSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
    if (prototypeSetter && ownSetter !== prototypeSetter) { prototypeSetter.call(input, normalizedNext); }
    else if (ownSetter) { ownSetter.call(input, normalizedNext); }
    else { input.value = normalizedNext; }
    if (input._valueTracker) input._valueTracker.setValue(previousValue);
  },

  async _typeIDVWithKeystrokes(input, cleanValue, logger = console.log) {
    const expectedValue = this._normalizeIDVValue(cleanValue);
    input.click(); input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await wait(150);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
    input.select();
    input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
    await wait(50);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    this._setReactInputValue(input, '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    await wait(80);

    logger(`📝 Typing IDV digit-by-digit: ${expectedValue}`);
    for (let i = 0; i < expectedValue.length; i++) {
      const char = expectedValue[i];
      const partialValue = expectedValue.substring(0, i + 1);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Digit' + char, bubbles: true }));
      this._setReactInputValue(input, partialValue);
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: char }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: 'Digit' + char, bubbles: true }));
      await wait(15);
    }
    await wait(150);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', code: 'Tab', bubbles: true }));
    input.blur();
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await wait(300);

    const actual = this._normalizeIDVValue(input.value);
    if (this._idvValuesMatch(actual, expectedValue)) {
      logger(`✅ IDV confirmed in DOM: ${input.value}`);
    } else {
      logger(`⚠️ IDV mismatch (got "${input.value}", expected "${expectedValue}") — retrying...`);
      input.click(); input.focus(); await wait(100);
      input.select(); await wait(50);
      this._setReactInputValue(input, '');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      await wait(50);
      for (const char of expectedValue) {
        this._setReactInputValue(input, input.value + char);
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
        await wait(15);
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      input.blur();
      await wait(200);
      logger(`✅ IDV retry result: ${input.value}`);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: CONTACT DETAILS
  // ═══════════════════════════════════════════════════════════════
  async selectStateDropdown(stateValue, logger = console.log) {
    logger('🔍 === COMMUNICATION ADDRESS STATE - START ===');
    const labelVariants = ['Communication Address State', 'Address State', 'State'];
    let autocompleteEl = null;

    outer:
    for (const labelText of labelVariants) {
      for (const label of document.querySelectorAll('label')) {
        if (!label.textContent?.toLowerCase().includes(labelText.toLowerCase())) continue;
        let parent = label.parentElement;
        for (let depth = 0; depth < 5 && parent; depth++) {
          const mui = parent.querySelector('.MuiAutocomplete-root');
          if (mui && mui.offsetParent !== null) { autocompleteEl = mui; break outer; }
          parent = parent.parentElement;
        }
      }
    }
    if (!autocompleteEl) {
      for (const mui of document.querySelectorAll('.MuiAutocomplete-root')) {
        if (mui.offsetParent === null) continue;
        const inp = mui.querySelector('input');
        const ph  = (inp?.placeholder || '').toLowerCase();
        const al  = (inp?.getAttribute('aria-label') || '').toLowerCase();
        if (ph.includes('state') || al.includes('state')) { autocompleteEl = mui; break; }
      }
    }
    if (!autocompleteEl) throw new Error('❌ Communication Address State MUI Autocomplete not found - STOPPING');

    const input = autocompleteEl.querySelector('input[type="text"]') ||
                  autocompleteEl.querySelector('.MuiInputBase-input') ||
                  autocompleteEl.querySelector('input');
    if (!input) throw new Error('❌ State input element not found - STOPPING');

    autocompleteEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(150);
    highlightElement(autocompleteEl, '#FF9800', 2000); await wait(200);
    input.click(); input.focus(); await wait(150);
    logger(`📝 Typing state: ${stateValue}`);
    input.select(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    input.value = stateValue;
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(600);

    let listbox = null;
    for (let i = 0; i < 15; i++) {
      listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                document.querySelector('.MuiAutocomplete-popper ul') ||
                document.querySelector('[role="listbox"]');
      if (listbox && listbox.offsetParent !== null) break;
      await wait(100);
    }
    if (listbox) {
      const items = listbox.querySelectorAll('li, [role="option"]');
      logger(`📊 Found ${items.length} state options`);
      let matched = null;
      for (const item of items) {
        if (item.textContent?.trim().toLowerCase() === stateValue.toLowerCase()) { matched = item; break; }
      }
      if (!matched) {
        for (const item of items) {
          if (item.textContent?.toLowerCase().includes(stateValue.toLowerCase())) { matched = item; break; }
        }
      }
      if (matched) {
        highlightElement(matched, '#4CAF50', 2000); await wait(150);
        matched.click();
        matched.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        logger(`✅ State "${stateValue}" selected`);
        await wait(500);
      } else {
        logger(`⚠️ State "${stateValue}" not found in dropdown — skipping`);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(200);
      }
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(400);
    }
    logger('✅ State selection complete');
  },

  async fillContactDetails(formData, logger = console.log) {
    const c  = formData.customerDetails   || {};
    const ad = formData.additionalDetails || {};
    scrollToBottom(); await wait(200);

    const mobile = c.mobile || c.mobileNumber;
    if (mobile) {
      logger('🔍 Filling Contact Number: ' + mobile);
      try { await fillInputByLabel('Contact Number', String(mobile)); logger('✅ Contact Number filled'); }
      catch (e) { logger('⚠️ Contact Number: ' + e.message); }
      await wait(150);
    }

    logger('🔍 Filling Email: otpcoverscrafter@gmail.com');
    try { await fillInputByLabel('Email', 'otpcoverscrafter@gmail.com'); logger('✅ Email filled'); }
    catch (e) { logger('⚠️ Email: ' + e.message); }
    await wait(150);

    if (c.gstin) {
      logger('🔍 Filling GSTIN: ' + c.gstin);
      try { await fillInputByLabel('GSTIN', c.gstin); logger('✅ GSTIN filled'); }
      catch (e) { logger('⚠️ GSTIN: ' + e.message); }
      await wait(150);
    }

    const stateValue = c.address?.state || c.state || ad.state;
    if (stateValue) {
      logger('🔍 Selecting Communication Address State: ' + stateValue);
      try { await this.selectStateDropdown(stateValue, logger); }
      catch (e) { logger('⚠️ State: ' + e.message); }
      await wait(200);
    }

    logger('✅ Contact Details complete');
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: COVER DETAILS
  // ═══════════════════════════════════════════════════════════════
  async fillCoverDetails(formData, logger = console.log) {
    const cov = formData.covers           || {};
    const ad  = formData.additionalDetails || {};
    const requestedAddOnLabels = [];
    scrollToBottom(); await wait(400);

    let coverSection = null;
    for (const el of document.querySelectorAll('h2,h3,h4,span,div,p')) {
      const t = el.textContent?.trim();
      if (t === 'Cover Details' || t === 'Own Damage Package') { coverSection = el; break; }
    }
    if (coverSection) {
      coverSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      logger('✅ Scrolled to Cover Details section');
    } else {
      window.scrollBy({ top: 300, behavior: 'smooth' });
      logger('ℹ️ Gentle scroll down (section header not found)');
    }
    await wait(600);

    let checkboxesVisible = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const visibleCbs = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.offsetParent !== null);
      if (visibleCbs.length > 0) { checkboxesVisible = true; logger(`✅ Found ${visibleCbs.length} visible checkboxes (attempt ${attempt + 1})`); break; }
      logger(`⏳ Waiting for checkboxes... attempt ${attempt + 1}`);
      window.scrollBy({ top: 150, behavior: 'smooth' });
      await wait(300);
    }
    if (!checkboxesVisible) throw new Error('❌ No visible checkboxes found in Cover Details - STOPPING');

    await this.setCheckboxByLabelText('BASIC - OD', true, logger); await wait(150);
    await this.setCheckboxByLabelText('BASIC - TP', true, logger); await wait(150);

    const vdl = ad.validDrivingLicense ? 'Yes' : 'No';
    logger('🔍 Setting Valid Driving License: ' + vdl);
    await this.setRadioOptionNearLabel('Valid Driving License', vdl, logger);
    await wait(150);

    if (vdl === 'No') { await this.dismissPACoverPopup(logger); await wait(200); }

    await this.setCheckboxByLabelText('TPPD Discount', true, logger); await wait(150);

    if (!ad.validDrivingLicense) {
      try { await this.setCheckboxByLabelText('PA - Owner', false, logger); await wait(150); }
      catch (e) { logger('⚠️ PA - Owner: ' + e.message); }
    }

    const addOnMap = {
      nilDepreciation: 'Nil Depreciation', returnToInvoice: 'Return to Invoice',
      engineProtector: 'Engine Protector', keyProtect:      'Key Protect',
      consumables:     'Consumables',      rsa:             'Road Side Assistance',
      ncbProtect:      'NCB Protect',
    };
    for (const [key, label] of Object.entries(addOnMap)) {
      const val = cov[key];
      if (val === true || val === '1' || val === 1) {
        requestedAddOnLabels.push(label);
        try { await this.setCheckboxByLabelText(label, true, logger); await wait(150); }
        catch (e) { logger(`⚠️ Add-on [${label}]: ${e.message}`); }
      } else if (val === false || val === '0' || val === 0) {
        try { await this.setCheckboxByLabelText(label, false, logger); await wait(150); }
        catch (e) { logger(`⚠️ Add-on [${label}] uncheck: ${e.message}`); }
      }
    }

    this._requestedAddOnLabels = requestedAddOnLabels;
    this._requestedAddOnCount  = requestedAddOnLabels.length;
    if (requestedAddOnLabels.length > 0) {
      logger(`ℹ️ Requested add-ons: ${requestedAddOnLabels.join(', ')}`);
    } else {
      logger('ℹ️ No optional add-ons requested in payload');
    }
    logger('✅ Cover Details complete');
  },

  async setCheckboxByLabelText(labelText, wantChecked, logger = console.log) {
    logger(`🔍 Looking for checkbox: "${labelText}"`);
    const allCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.offsetParent !== null);
    for (const cb of allCheckboxes) {
      const id = cb.id;
      let labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
      if (!labelEl) labelEl = cb.closest('label');
      const parent = cb.parentElement, grandParent = parent?.parentElement;
      const texts = [labelEl?.textContent?.trim() || '', parent?.textContent?.trim() || '', grandParent?.textContent?.trim() || ''];
      if (texts.some(t => t.toLowerCase().includes(labelText.toLowerCase()))) {
        cb.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(100);
        if (cb.checked !== wantChecked) { cb.click(); cb.dispatchEvent(new Event('change', { bubbles: true })); logger(`✅ Checkbox [${labelText}] → ${wantChecked ? 'checked' : 'unchecked'} (strategy 1)`); }
        else { logger(`ℹ️ Checkbox [${labelText}] already ${wantChecked ? 'checked' : 'unchecked'}`); }
        await wait(80); return;
      }
    }
    for (const label of document.querySelectorAll('label')) {
      if (!label.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())) continue;
      if (label.offsetParent === null) continue;
      let cb = label.querySelector('input[type="checkbox"]');
      if (!cb) { const forId = label.getAttribute('for'); if (forId) cb = document.getElementById(forId); }
      if (!cb) {
        const wrap = label.closest('.p-field,.field,.form-group,.col,.col-12,.ng-star-inserted,.MuiFormControlLabel-root') || label.parentElement;
        cb = wrap?.querySelector('input[type="checkbox"]');
      }
      if (!cb) {
        cb = label.previousElementSibling?.querySelector?.('input[type="checkbox"]') ||
             (label.previousElementSibling?.type === 'checkbox' ? label.previousElementSibling : null);
      }
      if (cb && cb.type === 'checkbox') {
        cb.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(100);
        if (cb.checked !== wantChecked) { cb.click(); cb.dispatchEvent(new Event('change', { bubbles: true })); logger(`✅ Checkbox [${labelText}] → ${wantChecked ? 'checked' : 'unchecked'} (strategy 2)`); }
        else { logger(`ℹ️ Checkbox [${labelText}] already ${wantChecked ? 'checked' : 'unchecked'}`); }
        await wait(80); return;
      }
    }
    throw new Error(`❌ Checkbox not found: ${labelText} - STOPPING`);
  },

  async setRadioOptionNearLabel(sectionLabelText, optionText, logger = console.log) {
    const sectionLabel = findElementByText('label', sectionLabelText);
    if (!sectionLabel) throw new Error('❌ Section label not found: ' + sectionLabelText + ' - STOPPING');
    const container = sectionLabel.closest('.p-field,.field,.form-group,.col,.col-12,.ng-star-inserted') || sectionLabel.parentElement?.parentElement;
    if (!container) throw new Error('❌ Container not found for: ' + sectionLabelText + ' - STOPPING');
    for (const radio of container.querySelectorAll('input[type="radio"]')) {
      const rlabel = radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`);
      if (rlabel && rlabel.textContent.trim().toLowerCase().includes(optionText.toLowerCase())) {
        if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change', { bubbles: true })); }
        logger('✅ Radio [' + sectionLabelText + '] = ' + optionText); return;
      }
    }
    throw new Error('❌ Radio option not found: ' + optionText + ' in ' + sectionLabelText + ' - STOPPING');
  },

  async dismissPACoverPopup(logger = console.log) {
    logger('⏳ Checking for PA cover popup...');
    const popupKeywords = ['pa cover cannot be selected','valid driving license','cannot be selected without'];
    let popupEl = null;
    for (const keyword of popupKeywords) {
      for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, h4, li')) {
        if (!el.textContent?.trim().toLowerCase().includes(keyword)) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        popupEl = el; break;
      }
      if (popupEl) break;
    }
    if (!popupEl) { logger('ℹ️ No PA cover popup detected'); return; }
    logger(`✅ PA cover popup detected`);
    await wait(200);
    let okBtn = null;
    for (const text of ['OK', 'Ok', 'ok', 'Okay', 'Close', 'Confirm']) {
      okBtn = findElementByText('button', text);
      if (okBtn && okBtn.offsetParent !== null) break;
    }
    if (!okBtn) {
      for (const sel of ['[role="dialog"] button','[role="alertdialog"] button','.MuiDialog-root button','.swal2-popup button','.swal2-actions button']) {
        for (const btn of document.querySelectorAll(sel)) {
          if (btn.offsetParent !== null) { const t = btn.textContent?.trim().toLowerCase(); if (t === 'ok' || t === 'okay' || t === 'close' || t === 'confirm') { okBtn = btn; break; } }
        }
        if (okBtn) break;
      }
    }
    if (okBtn) {
      okBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(100);
      highlightElement(okBtn, '#4CAF50', 1500); await wait(100);
      clickElement(okBtn);
      logger('✅ OK button clicked on PA cover popup');
      await wait(600);
    } else {
      logger('⚠️ OK button not found — pressing Enter as fallback');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(400);
    }
    logger('✅ PA cover popup dismissed');
  },

  // ═══════════════════════════════════════════════════════════════
  // CALCULATE PREMIUM — 1ST PASS
  // ═══════════════════════════════════════════════════════════════
  async clickCalculatePremiumButton(logger = console.log) {
    logger('🔄 ═══ CALCULATE PREMIUM — 1ST PASS ═══');
    scrollToBottom(); await wait(300);
    let btn = null;
    for (const b of document.querySelectorAll('button')) {
      if (b.offsetParent === null) continue;
      if (b.textContent?.trim().toLowerCase().includes('calculat')) { btn = b; break; }
    }
    if (!btn) btn = document.querySelector('button[class*="calculate" i]') || document.querySelector('button[class*="premium" i]');
    if (!btn) throw new Error('❌ [1st] Calculate Premium button not found - STOPPING');
    logger(`✅ [1st] Button found: "${btn.textContent?.trim()}"`);
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(150);
    highlightElement(btn, '#FF9800', 1500); await wait(100);
    clickElement(btn);
    logger('✅ [1st] Calculate Premium clicked');
    await waitForMuiBackdropToClear(30000);
    await this._dismissPremiumPopup1st(logger);
    logger('✅ [1st] Calculate Premium pass complete');
  },

  async _dismissPremiumPopup1st(logger = console.log) {
    logger('⏳ [1st] Waiting for premium popup...');
    const keywords = ['premium calculation completed','calculation completed','premium calculated','premium generated'];
    let found = false;
    for (let i = 0; i < 30; i++) {
      for (const kw of keywords) {
        for (const el of document.querySelectorAll('div,span,p,h1,h2,h3,h4,li')) {
          if (!el.textContent?.trim().toLowerCase().includes(kw)) continue;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          logger(`✅ [1st] Popup text: "${el.textContent.trim().substring(0, 60)}"`);
          found = true; break;
        }
        if (found) break;
      }
      if (found) break;
      await wait(200);
    }
    if (!found) logger('⚠️ [1st] Popup not detected — trying OK anyway');
    await wait(150);
    let okBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const sel of ['[role="dialog"] button','[role="alertdialog"] button','.MuiDialog-root button','.MuiDialogActions-root button','.p-dialog-footer button','.p-dialog button','.modal button','.popup button','.swal2-popup button','.swal2-actions button']) {
        for (const b of document.querySelectorAll(sel)) {
          if (b.offsetParent === null) continue;
          const t = b.textContent?.trim().toLowerCase();
          if (t === 'ok' || t === 'okay' || t === 'close' || t === 'confirm' || t === 'done') { okBtn = b; break; }
        }
        if (okBtn) break;
      }
      if (!okBtn) {
        for (const b of document.querySelectorAll('button')) {
          if (b.offsetParent === null) continue;
          const t = b.textContent?.trim().toLowerCase();
          if (t === 'ok' || t === 'okay' || t === 'close' || t === 'confirm' || t === 'done') { okBtn = b; break; }
        }
      }
      if (okBtn) break;
      await wait(200);
    }
    if (okBtn) {
      okBtn.scrollIntoView({ behavior: 'smooth', block: 'center' }); await wait(100);
      highlightElement(okBtn, '#4CAF50', 1000); await wait(80);
      clickElement(okBtn);
      logger('✅ [1st] OK clicked');
      await wait(600);
    } else {
      logger('⚠️ [1st] OK not found — Enter fallback');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(400);
    }
    logger('✅ [1st] Popup dismissed');
  },

  // ═══════════════════════════════════════════════════════════════
  // CALCULATE PREMIUM — 2ND PASS
  // FIX: Added 300ms page-settle after backdrop clears, changed
  //      waitForSwalToClose() to self-contained _waitForSwalClose()
  // ═══════════════════════════════════════════════════════════════
  async clickCalculatePremium2ndPass(logger = console.log) {
    logger('🔄 ═══ CALCULATE PREMIUM — 2ND PASS ═══');

    logger('📝 Step 0: Verifying Email/SMS Quote checkboxes are unchecked...');
    await this.uncheckQuoteCheckboxes(logger);
    await wait(200);

    await this._verifyAndRefillIDVIfNeeded(logger);
    await wait(200);

    let calcBtn = null;
    const bar = this._findBottomActionBar();
    if (bar) {
      logger(`✅ [2nd] Action bar found — ${bar.btns.length} buttons:`);
      bar.btns.forEach((b, i) => logger(`  [${i}] "${b.textContent?.trim()}"`));
      for (const b of bar.btns) {
        if (b.textContent?.trim().toLowerCase().includes('calculat')) { calcBtn = b; break; }
      }
    }
    if (!calcBtn) {
      for (const b of document.querySelectorAll('button')) {
        if (b.offsetParent === null) continue;
        if (b.textContent?.trim().toLowerCase().includes('calculat')) { calcBtn = b; break; }
      }
    }
    if (!calcBtn) calcBtn = document.querySelector('button[class*="calculate" i]') || document.querySelector('button[class*="premium" i]');
    if (!calcBtn) throw new Error('❌ [2nd] Calculate Premium button not found - STOPPING');
    logger(`✅ [2nd] Button found: "${calcBtn.textContent?.trim()}"`);

    const scrollBefore = window.scrollY;
    highlightElement(calcBtn, '#FF9800', 1500);
    await wait(150);
    clickElement(calcBtn);
    logger('✅ [2nd] Calculate Premium clicked');

    // ── FIX 5: wait for backdrop to clear, then a 300ms page-settle ──────────
    await waitForMuiBackdropToClear(30000);
    await wait(300); // give the swal2 popup time to mount before we start looking

    const popupResult = await this._dismissPremiumPopup2nd(logger, scrollBefore);

    if (popupResult?.type === 'quote-created') {
      this._quoteCreatedHandled = true;
      logger('✅ [2nd] Quote created popup handled during second premium flow');
      return popupResult;
    }

    await this.waitForPremiumCalculation(logger);
    await wait(500);

    logger('✅ [2nd] Calculate Premium pass complete');
    return popupResult || { type: 'premium-calculated' };
  },

  // ── Self-contained swal2 close waiter (replaces external waitForSwalToClose) ──
  async _waitForSwalClose(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const swal = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (!swal || swal.offsetParent === null) return true; // gone
      await wait(80);
    }
    return false; // timed out — caller continues anyway
  },

  async _dismissPremiumPopup2nd(logger = console.log, savedScrollY = 0) {
    logger('⏳ [2nd] Waiting for premium popup...');
    const keywords = [
      'premium calculation completed','calculation completed','premium calculated','premium generated',
      'quote generated successfully','quote generated','quote created successfully','quote created','quote no:',
    ];
    let found = false, popupText = '';
    for (let i = 0; i < 30; i++) {
      for (const kw of keywords) {
        for (const el of document.querySelectorAll('div,span,p,h1,h2,h3,h4,li')) {
          if (!el.textContent?.trim().toLowerCase().includes(kw)) continue;
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          popupText = el.textContent.trim();
          logger(`✅ [2nd] Popup text: "${popupText.substring(0, 60)}"`);
          found = true; break;
        }
        if (found) break;
      }
      if (found) break;
      await wait(200);
    }
    if (!found) logger('⚠️ [2nd] Popup not detected — trying OK anyway');
    await wait(150);

    const popupTextLower = popupText.toLowerCase();
    const isQuoteCreatedPopup = popupTextLower.includes('quote created successfully') || popupTextLower.includes('quote no:');

    let okBtn = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const sel of ['[role="dialog"] button','[role="alertdialog"] button','.MuiDialog-root button','.MuiDialogActions-root button','.p-dialog-footer button','.p-dialog button','.modal button','.popup button','.swal2-popup button','.swal2-actions button']) {
        for (const b of document.querySelectorAll(sel)) {
          if (b.offsetParent === null) continue;
          const t = b.textContent?.trim().toLowerCase();
          if (t === 'ok' || t === 'okay' || t === 'close' || t === 'confirm' || t === 'done') { okBtn = b; break; }
        }
        if (okBtn) break;
      }
      if (!okBtn) {
        for (const b of document.querySelectorAll('button')) {
          if (b.offsetParent === null) continue;
          const t = b.textContent?.trim().toLowerCase();
          if (t === 'ok' || t === 'okay' || t === 'close' || t === 'confirm' || t === 'done') { okBtn = b; break; }
        }
      }
      if (okBtn) break;
      await wait(200);
    }

    if (okBtn) {
      if (isQuoteCreatedPopup) {
        await this._acknowledgeQuoteCreatedSwal(logger);
      } else {
        // ── FIX 2: replaced waitForSwalToClose() with self-contained version ──
        clickElementNoScroll(okBtn);
        logger('✅ [2nd] OK clicked (no scroll)');
        await this._waitForSwalClose(3000); // was: await waitForSwalToClose(12000)
        await wait(150);
      }
    } else {
      logger('⚠️ [2nd] OK not found — Escape + Enter fallback');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(200);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter',  bubbles: true }));
      await wait(400);
    }

    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    await wait(150);
    logger('✅ [2nd] Popup dismissed');

    if (popupTextLower.includes('quote created successfully') || popupTextLower.includes('quote no:')) {
      return { type: 'quote-created', message: popupText };
    }
    return { type: 'premium-calculated', message: popupText };
  },

  async _acknowledgeQuoteCreatedSwal(logger = console.log) {
    return dismissVisibleSwalPopup(logger, 'Quote-created popup', {
      allowForceClose: false,
      waitForCloseMs: 8000,
    });
  },

  async _dismissVisibleSwal(logger = console.log) {
    return dismissVisibleSwalPopup(logger, 'SweetAlert popup');
  },

  // ─── Wait for Proposal Details stepper ───────────────────────────────────
  async _waitForProposalDetailsActivation(logger = console.log, timeoutMs = 8000) { // was 10000
    logger(`⏳ Waiting up to ${timeoutMs}ms for Proposal Details activation...`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const popup = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (popup && popup.offsetParent !== null) { await wait(150); continue; }
      if (await this._isProposalDetailsActive()) {
        logger('✅ Proposal Details step is active');
        return true;
      }
      await wait(150);
    }
    logger('ℹ️ Proposal Details activation not confirmed within timeout');
    return false;
  },

  _parsePremiumAmount(text) {
    if (text == null) return null;
    const normalized = String(text).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    if (!normalized) return null;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  },

  _readPremiumSummaryAmount(labelText) {
    const target = String(labelText || '').trim().toLowerCase();
    if (!target) return null;
    for (const node of document.querySelectorAll('p, span, div')) {
      if (node.offsetParent === null) continue;
      const nodeText = node.textContent?.replace(/\s+/g, ' ').trim().toLowerCase();
      if (nodeText !== target) continue;
      const row = node.closest('[class*="css-15notfb"]') || node.closest('.MuiGrid-root') || node.parentElement;
      if (!row) continue;
      const candidates = Array.from(row.querySelectorAll('p, span, div'))
        .map((el) => el.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean);
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const amount = this._parsePremiumAmount(candidates[index]);
        if (amount !== null) return amount;
      }
    }
    return null;
  },

  // ═══════════════════════════════════════════════════════════════
  // waitForPremiumCalculation — FIX 1
  // No longer blocks on add-on premium; exits as soon as Proceed
  // is enabled OR total premium is visible.  Add-on check is
  // advisory / logged only — not a gate.
  // ═══════════════════════════════════════════════════════════════
  async waitForPremiumCalculation(logger = console.log) {
    logger('⏳ Verifying premium state is committed on page...');
    let lastLoggedAddOnPremium = null;
    let lastLoggedTotalPremium = null;

    for (let i = 0; i < 20; i++) { // reduced from 30 → 20 iterations (max 6 s)
      const visibleSwal = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (visibleSwal && visibleSwal.offsetParent !== null) { await wait(200); continue; }

      const proceedBtn =
        this._findProceedButtonAdjacent(() => {}) ||
        Array.from(document.querySelectorAll('button')).find((button) => {
          if (button.offsetParent === null) return false;
          const text = button.textContent?.trim().toLowerCase();
          return text === 'proceed' || text === 'next' || text === 'continue';
        });
      const proceedReady = proceedBtn && !proceedBtn.disabled && proceedBtn.getAttribute('aria-disabled') !== 'true';

      const addOnPremium = this._readPremiumSummaryAmount('Add-On Premium');
      const totalPremium  = this._readPremiumSummaryAmount('Total Premium');

      if (addOnPremium !== null && addOnPremium !== lastLoggedAddOnPremium) {
        logger(`ℹ️ Add-On Premium: ${addOnPremium}`); lastLoggedAddOnPremium = addOnPremium;
      }
      if (totalPremium !== null && totalPremium !== lastLoggedTotalPremium) {
        logger(`ℹ️ Total Premium: ${totalPremium}`); lastLoggedTotalPremium = totalPremium;
      }

      // ── FIX 1 core: exit as soon as Proceed is ready OR we have a total ──
      if (proceedReady) {
        if (this._requestedAddOnCount > 0 && (addOnPremium === null || addOnPremium === 0)) {
          logger('ℹ️ Proceed ready but add-on premium not yet reflected (advisory)');
        }
        logger('✅ Proceed button is enabled — premium calculation confirmed');
        return true;
      }

      if (totalPremium !== null) {
        logger('✅ Total Premium is populated — premium calculation confirmed');
        return true;
      }

      // Legacy amount check
      for (const el of document.querySelectorAll('[class*="premium"], [class*="total"], [class*="price"], [class*="amount"]')) {
        if (el.textContent && /₹|\d{3,}/.test(el.textContent)) {
          logger('✅ Premium amount confirmed: ' + el.textContent.trim().substring(0, 60));
          return true;
        }
      }

      await wait(300);
    }

    logger('ℹ️ Premium state not strongly confirmed — proceeding anyway');
    return false;
  },

  async _verifyAndRefillIDVIfNeeded(logger = console.log) {
    logger('🔍 Verifying IDV value is still filled...');
    let idvInput = null;
    for (const label of document.querySelectorAll('label')) {
      const text = label.textContent?.trim();
      if (text === 'IDV' || text === 'IDV *' || (text && text.startsWith('IDV'))) {
        const container = label.closest('.MuiFormControl-root, .p-field, .field, .form-group, .col, .col-12') || label.parentElement;
        if (container) idvInput = container.querySelector('input[type="text"], input[type="number"], input:not([type="hidden"])');
        if (idvInput) break;
      }
    }
    if (!idvInput) { logger('⚠️ IDV input field not found — skipping verification'); return; }
    const currentValue = this._normalizeIDVValue(idvInput.value);
    const savedIDV = this._lastIDVValue;
    if (currentValue && savedIDV && this._idvValuesMatch(currentValue, savedIDV)) {
      logger(`✅ IDV is still correct: "${idvInput.value}"`); return;
    }
    if (!savedIDV) { logger('⚠️ IDV was cleared but no stored value available for refill'); return; }
    logger(`⚠️ IDV mismatch after re-render — refilling...`);
    highlightElement(idvInput, '#FF9800', 2000);
    await this._typeIDVWithKeystrokes(idvInput, savedIDV, logger);
    logger('✅ IDV refilled successfully');
  },

  _findBottomActionBar(logger = console.log) {
    const barSelectors = ['.action-bar','.button-row','.button-toolbar','[class*="action"][class*="bar"]','[class*="button"][class*="row"]','.bottom-toolbar','[class*="bottom"][class*="action"]'];
    for (const selector of barSelectors) {
      const bar = document.querySelector(selector);
      if (bar && bar.offsetParent !== null) {
        const btns = Array.from(bar.querySelectorAll('button'));
        if (btns.length > 0) return { element: bar, btns };
      }
    }
    const allBars = document.querySelectorAll('div[class*="row"], div[class*="bar"], .button-group');
    for (const bar of Array.from(allBars).reverse()) {
      if (bar.offsetParent === null) continue;
      const btns = Array.from(bar.querySelectorAll('button'));
      if (btns.length >= 2) return { element: bar, btns };
    }
    return null;
  },

  _findProceedButtonAdjacent(logger = console.log) {
    let calcBtn = null;
    for (const btn of document.querySelectorAll('button')) {
      if (btn.offsetParent === null) continue;
      if (btn.textContent?.trim().toLowerCase().includes('calculat')) { calcBtn = btn; break; }
    }
    if (!calcBtn) return null;
    let parent = calcBtn.parentElement;
    for (let depth = 0; depth < 3; depth++) {
      if (!parent) break;
      const proceedBtn = Array.from(parent.querySelectorAll('button')).find(btn =>
        btn.offsetParent !== null && btn.textContent?.trim().toLowerCase().includes('proceed')
      );
      if (proceedBtn) return proceedBtn;
      parent = parent.parentElement;
    }
    return null;
  },

  // ─── PROCEED BUTTON ──────────────────────────────────────────────────────
  async clickProceedButtonAdjacent(logger = console.log, allowPremiumRetry = true) {
    logger('🔍 Looking for Proceed button...');
    let btn = this._findProceedButtonAdjacent(logger);
    if (!btn) {
      const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      const viewportHeight = window.innerHeight, viewportWidth = window.innerWidth;
      for (const b of allBtns) {
        const t = b.textContent?.trim().toLowerCase();
        if (!t || (!t.includes('proceed') && !t.includes('next') && !t.includes('continue'))) continue;
        const rect = b.getBoundingClientRect();
        if (rect.top > viewportHeight * 0.6 && rect.left > viewportWidth * 0.5) { btn = b; break; }
      }
      if (!btn) {
        for (const b of allBtns) {
          const t = b.textContent?.trim().toLowerCase();
          if (t === 'proceed' || t === 'next' || t === 'continue') {
            const rect = b.getBoundingClientRect();
            if (rect.top > viewportHeight * 0.5) { btn = b; break; }
          }
        }
      }
    }
    if (!btn) {
      logger('⚠️ Proceed button not found — waiting 500ms and trying again...');
      await wait(500);
      const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      for (const b of allBtns) {
        const t = b.textContent?.trim().toLowerCase();
        if (t === 'proceed' || t === 'next' || t === 'continue') { btn = b; break; }
      }
    }
    if (!btn) { logger('⚠️ Proceed button not found — please click it manually'); return; }

    logger(`✅ Proceed button found: "${btn.textContent?.trim()}"`);
    highlightElement(btn, '#4CAF50', 800); await wait(80);
    clickElement(btn);
    logger('✅ Proceed button clicked');
    await waitForMuiBackdropToClear(10000, 300);

    // ── FIX 3: reduced _waitForProceedOutcomePopup from 8s → 4s ─────────────
    const proceedOutcome = await this._waitForProceedOutcomePopup(4000);

    if (proceedOutcome?.type === 'quote-created') {
      this._quoteCreatedHandled = true;
      logger(`✅ Proceed created quote successfully`);
      await this._acknowledgeQuoteCreatedSwal(logger);
      await wait(200); return;
    }
    if (proceedOutcome?.type === 'premium-required') {
      logger(`⚠️ Proceed blocked: "${proceedOutcome.titleText} ${proceedOutcome.bodyText}"`);
      await this._dismissVisibleSwal(logger);
      if (allowPremiumRetry) {
        logger('⏳ Waiting for backend state to settle before retry...');
        const settled = await this.waitForPremiumCalculation(logger);
        await wait(settled ? 300 : 800);
        logger('🔄 Retrying Proceed once...');
        return this.clickProceedButtonAdjacent(logger, false);
      }
      if (this._quoteCreatedHandled) throw new Error('❌ Quote was already created, but Proceed is still blocked.');
      throw new Error('❌ Proceed is still blocked after retry.');
    }
    await wait(300);
  },

  // ── FIX 3: 8000 → 4000 ms, 80ms → 60ms poll interval ────────────────────
  async _waitForProceedOutcomePopup(timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const popup = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (popup && popup.offsetParent !== null) {
        const titleText = popup.querySelector('#swal2-title, .swal2-title')?.textContent?.trim() || '';
        const bodyText  = popup.querySelector('#swal2-html-container, .swal2-html-container')?.textContent?.trim() || '';
        const combined  = `${titleText} ${bodyText}`.toLowerCase();
        if (combined.includes('quote created successfully') || combined.includes('quote no:'))
          return { type: 'quote-created', titleText, bodyText };
        if (combined.includes('please calculate the premium to proceed') || combined.includes('calculate the premium to proceed'))
          return { type: 'premium-required', titleText, bodyText };
      }
      await wait(60); // was 80
    }
    return null;
  },
};