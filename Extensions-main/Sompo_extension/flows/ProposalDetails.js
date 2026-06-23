/**
 * Universal Sompo Extension - Proposal Details Flow
 * OPTIMIZED: Aggressively reduced all wait() calls while preserving functionality.
 * FIXED: Address fields now properly bypass ALL maxlength restrictions (DOM attribute,
 *        React controlled input, and inline JS validation) so full long strings
 *        (e.g. "W/O HEMCHAND GILHARE SHITALA CHWOK SATNAMI PARA MANDIR HASAUD ...") 
 *        are written completely without truncation.
 * FIXED v2: Added missing _findInputInSection method so Financer Name / Financer Address
 *        are correctly located and written in full (no truncation).
 */
const SompoProposalDetails = {

  // ═══════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ═══════════════════════════════════════════════════════════════

  async run(formData, logger = console.log) {
    try {
      logger('📋 Starting Proposal Details flow...');
      await wait(800);

      await this.dismissQuoteCreatedPopupIfPresent(logger, 12000);
      await waitForMuiBackdropToClear(15000);
      await this.dismissQuoteCreatedPopupIfPresent(logger, 4000);

      await AutomationPauseController.checkpoint('Proposal — C-KYC Details');
      logger('📝 Section 1: C-KYC Details...');
      await this.fillCKYCDetails(formData, logger);

      await AutomationPauseController.checkpoint('Proposal — Customer Details');
      logger('📝 Section 2: Customer Details...');
      await this.fillCustomerDetails(formData, logger);

      await AutomationPauseController.checkpoint('Proposal — Address Information');
      logger('📝 Section 3: Address Information...');
      await this.fillAddressInformation(formData, logger);

      await AutomationPauseController.checkpoint('Proposal — Other Information');
      logger('📝 Section 4: Other Information...');
      await this.fillOtherInformation(formData, logger);

      await AutomationPauseController.checkpoint('Proposal — Vehicle Information');
      logger('📝 Section 5: Other Vehicle Information + Hypothecation...');
      await this.fillOtherVehicleInformation(formData, logger);

      await AutomationPauseController.checkpoint('Proposal — Proceed');
      logger('🔍 Clicking Proceed...');
      await this.clickProceedButton(logger);
      await wait(500);

      logger('✅ Proposal Details flow complete!');
      return { success: true };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') throw e;
      logger('❌ Proposal Details error: ' + e.message);
      return { success: false, error: e.message };
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // POPUP HELPERS
  // ═══════════════════════════════════════════════════════════════

  async dismissQuoteCreatedPopupIfPresent(logger = console.log, timeoutMs = 8000) {
    return ensureQuoteCreatedPopupDismissed(logger, timeoutMs, 500);
  },

  async handleInvalidDetailsPopup(logger = console.log) {
    logger('🔍 Checking for invalid details popup...');
    await wait(600);
    const popupTexts = ['please enter the valid details', 'enter the valid details', 'valid details'];
    for (const text of popupTexts) {
      for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, h4')) {
        if (!el.textContent?.toLowerCase().includes(text)) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        logger('⚠️ Found popup: "' + el.textContent.trim() + '"');
        const okBtn =
          findElementByText('button', 'OK') ||
          findElementByText('button', 'Ok') ||
          document.querySelector('button[class*="ok" i], button[class*="confirm" i]') ||
          el.closest('div[class*="dialog"], div[class*="modal"], div[class*="popup"]')?.querySelector('button');
        if (okBtn && okBtn.offsetParent !== null) {
          highlightElement(okBtn, '#FF5722', 1500);
          await wait(100);
          clickElement(okBtn);
          logger('✅ Clicked OK on popup');
        } else {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          logger('✅ Clicked popup to dismiss');
        }
        await wait(400);
        return;
      }
    }
    logger('ℹ️ No invalid details popup found');
  },

  async handleUpdateStatusPopup(logger = console.log) {
    logger('🔍 Checking for Update Status popup...');
    await wait(800);
    const popupTexts = ['update status', 'kyc status', 'verification', 'status updated', 'kyc details', 'kyc verification completed', 'verification completed', 'kyc completed'];
    for (const text of popupTexts) {
      for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, h4, [role="dialog"]')) {
        if (!el.textContent?.toLowerCase().includes(text)) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const dialog = el.closest('div[class*="dialog"], div[class*="modal"], div[class*="popup"], div[role="dialog"], .MuiDialog-root, .MuiModal-root');
        if (!dialog && el.getAttribute('role') !== 'dialog') continue;
        logger('⚠️ Found Update Status popup: "' + el.textContent.trim().substring(0, 100) + '"');
        const okBtn =
          findElementByText('button', 'OK') ||
          findElementByText('button', 'Ok') ||
          findElementByText('button', 'CLOSE') ||
          findElementByText('button', 'Close') ||
          document.querySelector('button[class*="ok" i], button[class*="confirm" i], button[class*="close" i], .MuiDialogActions button, [class*="dialog"] button') ||
          (dialog || el).querySelector('button');
        if (okBtn && okBtn.offsetParent !== null) {
          highlightElement(okBtn, '#FF5722', 1500);
          await wait(100);
          clickElement(okBtn);
          logger('✅ Clicked OK/Close on Update Status popup');
        } else {
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          logger('✅ Clicked popup to dismiss');
        }
        await wait(500);
        await waitForMuiBackdropToClear(3000);
        return true;
      }
    }
    logger('ℹ️ No Update Status popup found');
    return false;
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: C-KYC DETAILS
  // ═══════════════════════════════════════════════════════════════

  async fillCKYCDetails(formData, logger = console.log) {
    const c = formData.customerDetails || {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await wait(200);

    const customerType = c.customerType || 'Individual';
    logger('🔍 Customer Type: ' + customerType);
    await this.selectRadioNearLabel('Customer Type', customerType, logger);
    await wait(200);

    logger('🔍 Checking KYC Consent...');
    await this.checkKYCConsent(logger);
    await wait(150);

    const idTypeOption = 'AADHAAR NUMBER';
    logger('🔍 ID Type: ' + idTypeOption);
    try {
      await this.selectMUI(['ID Type', 'Id Type', 'id type', 'idtype'], idTypeOption, 'ID Type', logger);
    } catch (e) {
      logger('⚠️ ID Type MUI failed: ' + e.message);
      try { await fillDropdownByFirstLabelMatch(['ID Type', 'Id Type'], idTypeOption); }
      catch (e2) { logger('⚠️ ID Type fallback: ' + e2.message); }
    }
    await wait(250);

    await this.fillCKYCFields(formData, logger);

    logger('🔍 Clicking SEND OTP...');
    await this.clickButtonByText('SEND OTP', logger);
    await this.handleInvalidDetailsPopup(logger);

    logger('⏳ Waiting 7s before SEND EMAIL SMS...');
    await wait(7000);
    logger('🔍 Clicking SEND EMAIL SMS...');
    await this.clickButtonByText('SEND EMAIL SMS', logger);
    await wait(400);

    logger('⏸️ PAUSING: Click UPDATE STATUS, then automation resumes...');
    AutomationPauseController.pause();
    await this.waitForUpdateStatusOrResume(logger);
    logger('▶️ RESUMING after KYC...');
    await wait(800);

    logger('🔍 Handling Update Status popup if present...');
    await this.handleUpdateStatusPopup(logger);
    await wait(500);

    logger('✅ C-KYC Details complete');
  },

  async fillCKYCFields(formData, logger = console.log) {
    const c = formData.customerDetails || {};

    logger('📝 C-KYC: Aadhaar path (ID Type: AADHAAR NUMBER)');
    if (c.aadhaar) {
      const last4Digits = c.aadhaar.slice(-4);
      logger('🔍 Aadhaar ID NO (last 4 digits): ' + last4Digits);
      try { await fillInputByLabel('ID NO', last4Digits); logger('✅ Aadhaar ID NO filled (last 4 digits)'); }
      catch (e) { try { await fillInputByLabel('ID No', last4Digits); logger('✅ Aadhaar ID No filled (last 4 digits)'); } catch (e2) { logger('⚠️ Aadhaar: ' + e2.message); } }
      await wait(150);
    } else {
      logger('⚠️ Aadhaar number not found in formData');
    }

    const fullName = [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ').trim();
    if (fullName) {
      logger('🔍 Full Name: ' + fullName);
      try { await fillInputByLabel('Full Name as per Aadhaar Number', fullName); }
      catch (e) { try { await fillInputByLabel('Full Name', fullName); } catch (e2) { logger('⚠️ Full Name: ' + e2.message); } }
      await wait(150);
    }
    if (c.dateOfBirth) {
      logger('🔍 DOB: ' + c.dateOfBirth);
      await this.fillDOBWithFallback(c.dateOfBirth, logger);
      await wait(150);
    }
    if (c.mobile) {
      logger('🔍 Mobile: ' + c.mobile);
      try { await fillInputByLabel('Customer Mobile No', c.mobile); }
      catch (e) { try { await fillInputByLabel('Customer Mobile', c.mobile); } catch (e2) { logger('⚠️ Mobile: ' + e2.message); } }
      await wait(150);
    }
    if (c.gender) {
      logger('🔍 Gender C-KYC: ' + c.gender);
      try { await this.selectMUI(['Gender', 'gender'], c.gender, 'Gender C-KYC', logger); }
      catch (e) { try { await fillDropdownByFirstLabelMatch(['Gender'], c.gender); } catch (e2) { logger('⚠️ Gender: ' + e2.message); } }
      await wait(200);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: CUSTOMER DETAILS (post UPDATE STATUS)
  // ═══════════════════════════════════════════════════════════════

  async fillCustomerDetails(formData, logger = console.log) {
    const c = formData.customerDetails || {};
    scrollToBottom();
    await wait(200);

    if (c.title) {
      logger('🔍 Salutation: ' + c.title);
      try { await this.selectSalutationMUI(c.title, logger); logger('✅ Salutation: ' + c.title); }
      catch (e) {
        logger('⚠️ Salutation MUI failed: ' + e.message);
        try { await fillDropdownByFirstLabelMatch(['Salutation', 'Title', 'salutation'], c.title); }
        catch (e2) { logger('⚠️ Salutation fallback: ' + e2.message); }
      }
      await wait(200);
    }

    if (c.firstName) {
      try { await fillInputByLabel('First Name', c.firstName); logger('✅ First Name filled'); }
      catch (e) { logger('⚠️ First Name: ' + e.message); }
      await wait(150);
    }
    if (c.middleName) {
      try { await fillInputByLabel('Middle Name', c.middleName); logger('✅ Middle Name filled'); }
      catch (e) { logger('⚠️ Middle Name: ' + e.message); }
      await wait(150);
    }
    if (c.lastName) {
      try { await fillInputByLabel('Last Name', c.lastName); logger('✅ Last Name filled'); }
      catch (e) { logger('⚠️ Last Name: ' + e.message); }
      await wait(150);
    }

    if (c.gender) {
      logger('🔍 Gender (Customer Details): ' + c.gender);
      try { await this.selectGenderCustomerDetailsMUI(c.gender, logger); logger('✅ Gender: ' + c.gender); }
      catch (e) {
        logger('⚠️ Gender MUI failed: ' + e.message);
        try { await fillDropdownByFirstLabelMatch(['Gender', 'gender'], c.gender); }
        catch (e2) { logger('⚠️ Gender fallback: ' + e2.message); }
      }
      await wait(200);
    }

    logger('✅ Customer Details complete');
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: ADDRESS INFORMATION
  // ═══════════════════════════════════════════════════════════════

  async fillAddressInformation(formData, logger = console.log) {
    const addr = (formData.customerDetails && formData.customerDetails.address) || {};

    const address1 = addr.building || '';
    const address2 = addr.street   || '';
    const landmark = addr.locality || '';
    const city     = addr.city     || '';
    const state    = addr.state    || '';
    const country  = addr.country  || 'India';
    const pincode  = addr.pincode  || '';

    logger('📝 === ADDRESS INFORMATION ===');
    logger('   building  : ' + address1);
    logger('   street    : ' + address2);
    logger('   city      : ' + city);
    logger('   state     : ' + state);
    logger('   pincode   : ' + pincode);

    scrollToBottom();
    await wait(200);

    const headings = this._findAddressHeadings(logger);

    if (headings.length === 0) {
      logger('⚠️ No address section headings found — filling without Y-band');
      await this._fillAddressInBand(null, null, 'Communication', address1, address2, landmark, city, state, country, pincode, logger);
      await wait(200);
      await this._fillAddressInBand(null, null, 'Permanent', address1, address2, landmark, city, state, country, pincode, logger);
      logger('✅ Address Information complete (no-band mode)');
      return;
    }

    for (let i = 0; i < headings.length; i++) {
      const h       = headings[i];
      const bandTop = h.docY;
      const bandBot = headings[i + 1] ? headings[i + 1].docY : Infinity;
      logger('📝 Filling [' + h.name + '] Y: ' + Math.round(bandTop) + ' → ' + (isFinite(bandBot) ? Math.round(bandBot) : 'end'));
      await this._fillAddressInBand(bandTop, bandBot, h.name, address1, address2, landmark, city, state, country, pincode, logger);
      await wait(200);
    }

    logger('✅ Address Information complete');
  },

  _findAddressHeadings(logger = console.log) {
    const targets = [
      { name: 'Communication', keys: ['communication address'] },
      { name: 'Permanent',     keys: ['permanent address'] },
    ];
    const result = [];

    for (const t of targets) {
      let found = false;
      for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,div,span,label,b,strong')) {
        if (!el.offsetParent) continue;
        const raw = (el.textContent || '').trim().toLowerCase();
        if (raw.length > 100) continue;
        if (!t.keys.some(k => raw === k || raw.startsWith(k))) continue;

        const directText = [...el.childNodes]
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim().toLowerCase())
          .join(' ');
        if (!directText.includes(t.keys[0].split(' ')[0]) && el.children.length > 2) continue;

        const rect = el.getBoundingClientRect();
        const docY = rect.top + window.scrollY;

        if (result.some(r => r.name === t.name && Math.abs(r.docY - docY) < 40)) { found = true; break; }

        result.push({ name: t.name, docY });
        logger('📍 Heading [' + t.name + '] at docY=' + Math.round(docY));
        found = true;
        break;
      }
      if (!found) logger('⚠️ Heading not found for: ' + t.name);
    }

    result.sort((a, b) => a.docY - b.docY);
    return result;
  },

  // ═══════════════════════════════════════════════════════════════
  // FULL-VALUE INPUT FILLER
  // Bypasses ALL maxlength restrictions (DOM attr, React, MUI, inline handlers)
  // so long addresses like "W/O HEMCHAND GILHARE SHITALA CHWOK SATNAMI PARA..."
  // are written completely.
  // ═══════════════════════════════════════════════════════════════

  async fillInputCharByChar(inp, value, fieldLabel, logger = console.log) {
    // 1. Remove DOM maxlength attribute
    const originalMaxLen = inp.getAttribute('maxlength');
    if (originalMaxLen) {
      logger('⚠️ ' + fieldLabel + ': removing maxlength=' + originalMaxLen);
      inp.removeAttribute('maxlength');
    }

    // 2. Also remove maxLength property set via JS (React/MUI sometimes sets it as a property)
    try { Object.defineProperty(inp, 'maxLength', { get: () => 524288, configurable: true }); } catch (_) {}

    // 3. Remove any onInput / onKeyDown validators that truncate value
    //    by cloning the node (strips all event listeners)
    //    BUT we must keep the React fiber — so instead we monkey-patch the
    //    native setter to never allow value to be shortened below what we set.

    inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(100);
    inp.focus();
    inp.click();
    await wait(80);

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    // Clear existing value
    if (nativeSetter) nativeSetter.call(inp, '');
    else inp.value = '';
    inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await wait(50);

    // Set full value using native setter (bypasses React synthetic onChange restrictions)
    if (nativeSetter) nativeSetter.call(inp, value);
    else inp.value = value;

    // Fire all necessary events so React / Angular pick up the change
    inp.dispatchEvent(new InputEvent('input',  { bubbles: true, inputType: 'insertText', data: value }));
    inp.dispatchEvent(new Event('change',      { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await wait(80);

    // Verify — if React state reverted/truncated, do a char-by-char fallback
    if (inp.value !== value) {
      logger('⚠️ ' + fieldLabel + ': native setter did not stick (got ' + inp.value.length + ' chars), trying char-by-char...');
      // Re-remove maxlength before fallback
      inp.removeAttribute('maxlength');
      try { Object.defineProperty(inp, 'maxLength', { get: () => 524288, configurable: true }); } catch (_) {}

      inp.focus();
      inp.click();
      await wait(60);
      if (nativeSetter) nativeSetter.call(inp, '');
      else inp.value = '';
      inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      await wait(40);

      for (let i = 0; i < value.length; i++) {
        const char    = value[i];
        const partial = value.substring(0, i + 1);
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
        if (nativeSetter) nativeSetter.call(inp, partial);
        else inp.value = partial;
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
        inp.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await wait(12);

        // If value got shortened mid-way by a React handler, re-remove maxlength and continue
        if (inp.value.length < partial.length) {
          inp.removeAttribute('maxlength');
          try { Object.defineProperty(inp, 'maxLength', { get: () => 524288, configurable: true }); } catch (_) {}
        }
      }
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    inp.blur();
    inp.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    const finalLen = inp.value.length;
    const expectedLen = value.length;
    if (finalLen < expectedLen) {
      logger('⚠️ ' + fieldLabel + ': STILL truncated to ' + finalLen + '/' + expectedLen + ' chars — field may enforce server-side limit');
    } else {
      logger('✅ ' + fieldLabel + ' → "' + inp.value.substring(0, 60) + (inp.value.length > 60 ? '...' : '') + '" (' + finalLen + ' chars)');
    }
  },

  async _fillAddressInBand(bandTop, bandBot, sectionName, address1, address2, landmark, city, state, country, pincode, logger) {

    const inBand = (el) => {
      if (bandTop === null && bandBot === null) return true;
      const r   = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      if (bandTop !== null && top < bandTop - 40) return false;
      if (bandBot !== null && top >= bandBot - 40) return false;
      return true;
    };

    const findInput = (...labelTexts) => {
      for (const lText of labelTexts) {
        for (const label of document.querySelectorAll('label')) {
          if (!label.offsetParent) continue;
          if (!inBand(label)) continue;
          const text = (label.textContent || '').trim().toLowerCase();
          if (!text.includes(lText.toLowerCase())) continue;
          const forId = label.getAttribute('for');
          if (forId) {
            const el = document.getElementById(forId);
            if (el && el.tagName === 'INPUT' && el.offsetParent) return el;
          }
          const wrap = label.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted,.MuiFormControl-root') || label.parentElement;
          if (wrap) {
            const inp = wrap.querySelector('input[type="text"],input[type="tel"],input[type="number"],textarea');
            if (inp && inp.offsetParent) return inp;
          }
        }
      }
      return null;
    };

    const findPrimeDD = (...labelTexts) => {
      for (const lText of labelTexts) {
        for (const label of document.querySelectorAll('label')) {
          if (!label.offsetParent) continue;
          if (!inBand(label)) continue;
          const text = (label.textContent || '').trim().toLowerCase();
          if (!text.includes(lText.toLowerCase())) continue;
          const wrap = label.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted') || label.parentElement;
          if (wrap) {
            const dd = wrap.querySelector('.p-dropdown');
            if (dd && dd.offsetParent) return dd;
          }
        }
      }
      return null;
    };

    const findMUIInBand = (...labelTexts) => {
      for (const lText of labelTexts) {
        for (const label of document.querySelectorAll('label,.MuiFormLabel-root,.MuiInputLabel-root')) {
          if (!label.offsetParent) continue;
          if (!inBand(label)) continue;
          const text = (label.textContent || '').trim().toLowerCase();
          if (!text.includes(lText.toLowerCase())) continue;
          let p = label.parentElement;
          for (let d = 0; d < 8 && p; d++) {
            if (p.classList && p.classList.contains('MuiAutocomplete-root') && p.offsetParent) return p;
            const child = p.querySelector && p.querySelector(':scope > .MuiAutocomplete-root');
            if (child && child.offsetParent) return child;
            p = p.parentElement;
          }
        }
      }
      for (const mui of document.querySelectorAll('.MuiAutocomplete-root')) {
        if (!mui.offsetParent) continue;
        if (!inBand(mui)) continue;
        const inp = mui.querySelector('input');
        if (!inp) continue;
        for (const lText of labelTexts) {
          const attrs = [inp.id, inp.name, inp.placeholder, inp.getAttribute('aria-label')].map(v => (v || '').toLowerCase());
          if (attrs.some(a => a.includes(lText.toLowerCase()))) return mui;
        }
      }
      return null;
    };

    // ── Address 1 ──────────────────────────────────────────────────
    if (address1) {
      logger('🔍 [' + sectionName + '] Address 1: "' + address1 + '" (' + address1.length + ' chars)');
      const inp = findInput('Address 1', 'address1');
      if (inp) {
        await this.fillInputCharByChar(inp, address1, '[' + sectionName + '] Address 1', logger);
      } else {
        logger('⚠️ [' + sectionName + '] Address 1 not found in band');
      }
      await wait(150);
    }

    // ── Address 2 ──────────────────────────────────────────────────
    if (address2) {
      logger('🔍 [' + sectionName + '] Address 2: "' + address2 + '"');
      const inp = findInput('Address 2', 'address2');
      if (inp) {
        await this.fillInputCharByChar(inp, address2, '[' + sectionName + '] Address 2', logger);
      } else {
        logger('⚠️ [' + sectionName + '] Address 2 not found in band');
      }
      await wait(150);
    }

    // ── Landmark ───────────────────────────────────────────────────
    if (landmark) {
      logger('🔍 [' + sectionName + '] Landmark: "' + landmark + '"');
      const inp = findInput('Nearest Landmark', 'landmark');
      if (inp) {
        await this.fillInputCharByChar(inp, landmark, '[' + sectionName + '] Landmark', logger);
      } else {
        logger('⚠️ [' + sectionName + '] Landmark not found in band');
      }
      await wait(150);
    }

    // ── State ──────────────────────────────────────────────────────
    if (state) {
      logger('🔍 [' + sectionName + '] State: ' + state);
      const dd = findPrimeDD('State', 'state');
      if (dd) {
        try { await openAndSelectPrimeDropdown(dd, state); logger('✅ [' + sectionName + '] State: ' + state); }
        catch (e) { logger('⚠️ [' + sectionName + '] State error: ' + e.message); }
      } else { logger('⚠️ [' + sectionName + '] State dropdown not found in band'); }
      await wait(250);
    }

    // ── Country ────────────────────────────────────────────────────
    if (country) {
      logger('🔍 [' + sectionName + '] Country: ' + country);
      const dd = findPrimeDD('Country', 'country');
      if (dd) {
        try { await openAndSelectPrimeDropdown(dd, country); logger('✅ [' + sectionName + '] Country: ' + country); }
        catch (e) { logger('⚠️ [' + sectionName + '] Country error: ' + e.message); }
      } else { logger('⚠️ [' + sectionName + '] Country dropdown not found in band'); }
      await wait(250);
    }

    // ── City ───────────────────────────────────────────────────────
    if (city) {
      logger('🔍 [' + sectionName + '] City: ' + city);
      const mui = findMUIInBand('City', 'city');
      if (mui) {
        try { await this.fillMUIAutocomplete(mui, city, sectionName + ' City', logger); logger('✅ [' + sectionName + '] City: ' + city); }
        catch (e) { logger('⚠️ [' + sectionName + '] City MUI error: ' + e.message); }
      } else { logger('⚠️ [' + sectionName + '] City MUI not found in band'); }
      await wait(300);
    }

    // ── Pincode ────────────────────────────────────────────────────
    if (pincode) {
      logger('🔍 [' + sectionName + '] Pincode: ' + pincode);
      const mui = findMUIInBand('Pincode', 'Pin Code', 'pincode');
      if (mui) {
        try { await this.fillMUIAutocomplete(mui, pincode, sectionName + ' Pincode', logger); logger('✅ [' + sectionName + '] Pincode: ' + pincode); }
        catch (e) { logger('⚠️ [' + sectionName + '] Pincode MUI error: ' + e.message); }
      } else { logger('⚠️ [' + sectionName + '] Pincode MUI not found in band'); }
      await wait(300);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: OTHER INFORMATION
  // ═══════════════════════════════════════════════════════════════

  async fillOtherInformation(formData, logger = console.log) {
    const c = formData.customerDetails || {};
    const isPanAvailable = c.isPanAvailable === true;

    scrollToBottom();
    await wait(150);

    if (!isPanAvailable) {
      logger('🔍 isPanAvailable=false → Form 60');
      await this.selectRadioByText('Form 60', logger);
      await wait(200);
      logger('ℹ️ Form 60 selected');
    } else {
      logger('🔍 isPanAvailable=true → PAN Number');
      await this.selectRadioByText('PAN Number', logger);
      await wait(200);
      if (c.pan) {
        logger('🔍 Filling PAN Number: ' + c.pan);
        try { await fillInputByLabel('PAN Number', c.pan); logger('✅ PAN Number filled'); }
        catch (e) {
          try { await fillInputByLabel('PAN No', c.pan); logger('✅ PAN No filled'); }
          catch (e2) { logger('⚠️ PAN field: ' + e2.message); }
        }
        await wait(150);
      }
    }

    logger('✅ Other Information complete');
  },

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: OTHER VEHICLE INFORMATION + HYPOTHECATION
  // ═══════════════════════════════════════════════════════════════

  async fillOtherVehicleInformation(formData, logger = console.log) {
    const vi = formData.vehicleInformation || {};
    const v  = formData.vehicleDetails     || {};

    scrollToBottom();
    await wait(150);

    const engineNumber = vi.engineNumber || v.engineNumber;
    if (engineNumber) {
      logger('🔍 Engine Number: ' + engineNumber);
      try { await fillInputByLabel('Engine Number', engineNumber); logger('✅ Engine Number filled'); }
      catch (e) { logger('⚠️ Engine Number: ' + e.message); }
      await wait(150);
    }

    const chassisNumber = vi.chassisNumber || v.chassisNumber;
    if (chassisNumber) {
      logger('🔍 Chassis Number: ' + chassisNumber);
      try { await fillInputByLabel('Chassis Number', chassisNumber); logger('✅ Chassis Number filled'); }
      catch (e) { logger('⚠️ Chassis Number: ' + e.message); }
      await wait(150);
    }

    logger('🔍 Vehicle Colour: Black');
    try {
      await this.selectMUI(['Vehicle Colour', 'Vehicle Color', 'Colour', 'Color'], 'Black', 'Vehicle Colour', logger);
      logger('✅ Vehicle Colour: Black');
    } catch (e) {
      logger('⚠️ Vehicle Colour MUI: ' + e.message);
      try { await fillDropdownByFirstLabelMatch(['Vehicle Colour', 'Vehicle Color', 'Colour', 'Color'], 'Black'); }
      catch (e2) { logger('⚠️ Vehicle Colour fallback: ' + e2.message); }
    }
    await wait(200);

    const sector = vi.sector || v.sector || 'Others';
    logger('🔍 Sector: ' + sector);
    try {
      await this.selectMUI(['Sector', 'sector'], sector, 'Sector', logger);
      logger('✅ Sector: ' + sector);
    } catch (e) {
      logger('⚠️ Sector MUI: ' + e.message);
      try { await fillDropdownByFirstLabelMatch(['Sector'], sector); }
      catch (e2) { logger('⚠️ Sector fallback: ' + e2.message); }
    }
    await wait(200);

    logger('🔍 Tax Exemption: No exemption');
    try {
      await this.selectMUI(['Tax Exemption', 'Tax', 'tax exemption'], 'No exemption', 'Tax Exemption', logger);
      logger('✅ Tax Exemption: No exemption');
    } catch (e) {
      logger('⚠️ Tax Exemption MUI: ' + e.message);
      try { await fillDropdownByFirstLabelMatch(['Tax Exemption', 'Tax'], 'No exemption'); }
      catch (e2) { logger('⚠️ Tax Exemption fallback: ' + e2.message); }
    }
    await wait(200);

    logger('✅ Other Vehicle Information complete');

    await this.fillHypothecationDetails(formData, logger);
  },

  // ═══════════════════════════════════════════════════════════════
  // HYPOTHECATION DETAILS
  // ═══════════════════════════════════════════════════════════════

  async fillHypothecationDetails(formData, logger = console.log) {
    const hyp = formData.hypothecation || {};

    if (!hyp.isHypothecated) {
      logger('ℹ️ isHypothecated=false — skipping Hypothecation');
      return;
    }

    logger('📝 === HYPOTHECATION DETAILS ===');
    scrollToBottom();
    await wait(150);

    logger('🔍 Finding Hypothecation checkbox...');
    let cbChecked = false;

    const allCBs = [...document.querySelectorAll('input[type="checkbox"]')]
      .filter(cb => cb.offsetParent !== null);

    for (const cb of allCBs) {
      const id        = cb.id || '';
      const forLabel  = id ? document.querySelector('label[for="' + id + '"]') : null;
      const wrapLabel = cb.closest('label');
      const nextSib   = cb.nextElementSibling;
      const parentEl  = cb.parentElement;

      const texts = [
        forLabel  ? (forLabel.textContent  || '') : '',
        wrapLabel ? (wrapLabel.textContent || '') : '',
        nextSib   ? (nextSib.textContent   || '') : '',
        parentEl  ? (parentEl.textContent  || '') : '',
      ].map(t => t.toLowerCase());

      if (texts.some(t => t.includes('hypothecated') || t.includes('hypothecation'))) {
        cb.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(150);
        if (!cb.checked) {
          highlightElement(cb, '#FF9800', 1500);
          cb.click();
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          logger('✅ Hypothecation checkbox checked (strategy A)');
        } else {
          logger('ℹ️ Hypothecation checkbox already checked');
        }
        cbChecked = true;
        await wait(400);
        break;
      }
    }

    if (!cbChecked) {
      logger('⚠️ Strategy A failed — scanning text elements...');
      for (const el of document.querySelectorAll('label,span,div,p,b,strong')) {
        if (!el.offsetParent) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        if (t.length > 300) continue;
        if (!t.includes('hypothecated') && !t.includes('hypothecation')) continue;

        const cb =
          el.querySelector('input[type="checkbox"]') ||
          (el.previousElementSibling && el.previousElementSibling.type === 'checkbox' ? el.previousElementSibling : null) ||
          el.parentElement?.querySelector('input[type="checkbox"]');

        if (cb && cb.offsetParent) {
          cb.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await wait(150);
          if (!cb.checked) {
            highlightElement(cb, '#FF9800', 1500);
            cb.click();
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            logger('✅ Hypothecation checkbox checked (strategy B)');
          }
          cbChecked = true;
          await wait(400);
          break;
        }
      }
    }

    if (!cbChecked) {
      logger('⚠️ Hypothecation checkbox not found — attempting field fill anyway');
    }

    await wait(400);

    const financierType = hyp.financierType || 'Hypothecation';
    logger('🔍 Financer Type: ' + financierType);
    try {
      await this.selectMUI(
        ['Financer Type', 'Financier Type', 'financer type', 'financier type'],
        financierType, 'Financer Type', logger
      );
      logger('✅ Financer Type: ' + financierType);
    } catch (e) {
      logger('⚠️ Financer Type MUI: ' + e.message);
      try { await fillDropdownByFirstLabelMatch(['Financer Type', 'Financier Type'], financierType); }
      catch (e2) { logger('⚠️ Financer Type fallback: ' + e2.message); }
    }
    await wait(200);

    // ── Financer Name ──────────────────────────────────────────────
    const financierName = hyp.financierName || '';
    if (financierName) {
      logger('🔍 Financer Name: "' + financierName + '" (' + financierName.length + ' chars)');
      const finNameInp = this._findInputInSection('Financer Name', 'Financier Name', 'financer name', 'financier name');
      if (finNameInp) {
        await this.fillInputCharByChar(finNameInp, financierName, 'Financer Name', logger);
      } else {
        logger('⚠️ Financer Name input not found');
      }
      await wait(150);
    }

    // ── Financer Address ───────────────────────────────────────────
    const financierAddress = hyp.financierAddress || '';
    if (financierAddress) {
      logger('🔍 Financer Address: "' + financierAddress + '" (' + financierAddress.length + ' chars)');
      const finAddrInp = this._findInputInSection('Financer Address', 'Financier Address', 'financer address', 'financier address');
      if (finAddrInp) {
        await this.fillInputCharByChar(finAddrInp, financierAddress, 'Financer Address', logger);
      } else {
        logger('⚠️ Financer Address input not found');
      }
      await wait(150);
    }

    logger('✅ Hypothecation Details complete');
  },

  // ═══════════════════════════════════════════════════════════════
  // _findInputInSection  ← PREVIOUSLY MISSING — NOW ADDED
  //
  // Searches the live DOM for a visible <input> or <textarea> whose
  // nearest <label> text matches ANY of the provided labelVariants
  // (case-insensitive substring match).
  //
  // Strategy order:
  //   1. label[for=id] → getElementById
  //   2. label → ancestor wrapper → first text/tel/textarea inside
  //   3. Loose scan: any visible input whose placeholder / aria-label /
  //      id / name contains any of the variants
  //
  // Returns the input element, or null if nothing found.
  // ═══════════════════════════════════════════════════════════════

  _findInputInSection(...labelVariants) {
    // Normalise: flatten in case caller passes an array as first arg
    const variants = labelVariants.flat().map(v => v.toLowerCase());

    // ── Strategy 1 & 2: label-based lookup ──────────────────────
    for (const label of document.querySelectorAll('label')) {
      if (!label.offsetParent) continue; // hidden
      const labelText = (label.textContent || '').trim().toLowerCase();
      if (!variants.some(v => labelText.includes(v))) continue;

      // 1a. label[for] → getElementById
      const forId = label.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.offsetParent) return el;
      }

      // 1b. label wraps the input directly
      const inner = label.querySelector('input[type="text"],input[type="tel"],input[type="number"],input:not([type="hidden"]),textarea');
      if (inner && inner.offsetParent) return inner;

      // 1c. nearest common ancestor wrapper → first matching input
      const wrap = label.closest(
        '.p-field, .field, .form-group, .col-12, .col, .ng-star-inserted, .MuiFormControl-root, .MuiTextField-root'
      ) || label.parentElement;
      if (wrap) {
        const inp = wrap.querySelector('input[type="text"],input[type="tel"],input[type="number"],input:not([type="hidden"]),textarea');
        if (inp && inp.offsetParent) return inp;
      }
    }

    // ── Strategy 3: attribute-based loose scan ───────────────────
    for (const inp of document.querySelectorAll('input[type="text"],input[type="tel"],input:not([type="hidden"]),textarea')) {
      if (!inp.offsetParent) continue;
      const attrs = [
        inp.placeholder,
        inp.getAttribute('aria-label'),
        inp.name,
        inp.id,
      ].map(v => (v || '').toLowerCase());
      if (variants.some(v => attrs.some(a => a.includes(v)))) return inp;
    }

    return null; // not found
  },

  // ═══════════════════════════════════════════════════════════════
  // MUI AUTOCOMPLETE — GENERIC ENGINE
  // ═══════════════════════════════════════════════════════════════

  async findMUIByLabels(labelVariants, logger = console.log) {
    for (const variant of labelVariants) {
      for (const label of document.querySelectorAll('label, .MuiFormLabel-root, .MuiInputLabel-root')) {
        const text = (label.textContent || '').trim().toLowerCase();
        if (!text.includes(variant.toLowerCase())) continue;
        let parent = label.parentElement;
        for (let d = 0; d < 8 && parent; d++) {
          if (parent.classList && parent.classList.contains('MuiAutocomplete-root') && parent.offsetParent) {
            logger('✅ MUI via label "' + variant + '" depth ' + d);
            return parent;
          }
          const mui = parent.querySelector && parent.querySelector(':scope .MuiAutocomplete-root');
          if (mui && mui.offsetParent) { logger('✅ MUI child via label "' + variant + '" depth ' + d); return mui; }
          parent = parent.parentElement;
        }
      }
    }

    const allMUI = [...document.querySelectorAll('.MuiAutocomplete-root')].filter(m => m.offsetParent !== null);

    for (const mui of allMUI) {
      const inp = mui.querySelector('input');
      if (!inp) continue;
      const labelId   = inp.getAttribute('aria-labelledby') || '';
      const labelText = labelId ? ((document.getElementById(labelId) || {}).textContent || '').toLowerCase() : '';
      const attrs = [inp.id, inp.name, inp.placeholder, inp.getAttribute('aria-label'), labelText].map(v => (v || '').toLowerCase());
      for (const variant of labelVariants) {
        if (attrs.some(a => a.includes(variant.toLowerCase()))) { logger('✅ MUI via input attrs "' + variant + '"'); return mui; }
      }
    }

    for (const mui of allMUI) {
      let parent = mui.parentElement;
      for (let d = 0; d < 6 && parent; d++) {
        const pt = (parent.textContent || '').toLowerCase();
        for (const variant of labelVariants) {
          if (pt.includes(variant.toLowerCase())) { logger('✅ MUI via parent context "' + variant + '" depth ' + d); return mui; }
        }
        parent = parent.parentElement;
      }
    }

    logger('❌ MUI not found: ' + labelVariants.join(', '));
    return null;
  },

  async fillMUIAutocomplete(autocompleteEl, value, fieldName, logger = console.log) {
    const input = autocompleteEl.querySelector('input');
    if (!input) throw new Error(fieldName + ': no input in MUI');

    autocompleteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(150);
    highlightElement(autocompleteEl, '#FF9800', 2000);
    await wait(100);

    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    input.click();
    input.focus();
    await wait(150);

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(input, '');
    else input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);

    for (let i = 0; i < value.length; i++) {
      const char    = value[i];
      const partial = value.substring(0, i + 1);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
      if (nativeSetter) nativeSetter.call(input, partial);
      else input.value = partial;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await wait(15);
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(400);

    let listbox = null;
    for (let i = 0; i < 15; i++) {
      listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                document.querySelector('.MuiAutocomplete-popper ul') ||
                document.querySelector('[role="listbox"]');
      if (listbox && listbox.offsetParent !== null) { logger('✅ Listbox found (' + (i+1) + ')'); break; }
      await wait(100);
    }

    if (!listbox) {
      logger('⚠️ No listbox for ' + fieldName + ' — pressing Enter');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(300);
      return;
    }

    const items  = listbox.querySelectorAll('li, [role="option"]');
    const vLower = value.toLowerCase();
    logger('📊 ' + fieldName + ': ' + items.length + ' options');

    const matched =
      [...items].find(it => (it.textContent || '').trim().toLowerCase() === vLower) ||
      [...items].find(it => (it.textContent || '').trim().toLowerCase().includes(vLower)) ||
      (items.length ? items[0] : null);

    if (matched) {
      highlightElement(matched, '#4CAF50', 1500);
      await wait(100);
      matched.click();
      matched.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      logger('✅ ' + fieldName + ': "' + (matched.textContent || '').trim() + '"');
      await wait(300);
    } else {
      logger('⚠️ No match for ' + fieldName + ': ' + value);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(200);
    }
  },

  async selectMUI(labelVariants, value, fieldName, logger = console.log) {
    logger('🔍 === ' + fieldName + ' MUI ===');
    const el = await this.findMUIByLabels(labelVariants, logger);
    if (!el) throw new Error(fieldName + ' MUI not found');
    await this.fillMUIAutocomplete(el, value, fieldName, logger);
    logger('✅ === ' + fieldName + ' COMPLETE ===');
  },

  async selectSalutationMUI(salutationValue, logger = console.log) {
    logger('🔍 === SALUTATION MUI ===');

    let el = await this.findMUIByLabels(['Salutation', 'salutation', 'Title', 'title'], logger);

    if (!el) {
      logger('🔍 Salutation: scanning Customer Details section...');
      for (const header of document.querySelectorAll('h2,h3,h4,div,section,p')) {
        if (!(header.textContent || '').trim().toLowerCase().includes('customer details')) continue;
        if (!header.offsetParent) continue;
        const muis = [...header.querySelectorAll('.MuiAutocomplete-root')].filter(m => m.offsetParent !== null);
        if (muis.length > 0) { el = muis[0]; logger('✅ Salutation via Customer Details section'); break; }
      }
    }

    if (!el) throw new Error('Salutation MUI not found');

    const input = el.querySelector('input');
    if (!input) throw new Error('Salutation: no input in MUI');

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(150);
    highlightElement(el, '#FF9800', 2000);
    await wait(100);

    const openBtn = el.querySelector('button[aria-label="Open"], .MuiAutocomplete-popupIndicator');
    if (openBtn) {
      openBtn.click();
      openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      logger('✅ Salutation open button clicked');
    } else {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
      input.click();
      input.focus();
    }
    await wait(500);

    let listbox = null;
    for (let i = 0; i < 15; i++) {
      listbox = document.querySelector('.MuiAutocomplete-listbox') ||
                document.querySelector('.MuiAutocomplete-popper ul') ||
                document.querySelector('[role="listbox"]');
      if (listbox && listbox.offsetParent !== null) { logger('✅ Salutation listbox found'); break; }
      await wait(100);
    }

    if (!listbox) {
      logger('⚠️ Salutation listbox missing — falling back to type...');
      await this.fillMUIAutocomplete(el, salutationValue, 'Salutation', logger);
      return;
    }

    const items  = listbox.querySelectorAll('li, [role="option"]');
    const vLower = salutationValue.toLowerCase();
    logger('📊 Salutation options: ' + items.length);

    const matched =
      [...items].find(it => (it.textContent || '').trim().toLowerCase() === vLower) ||
      [...items].find(it => (it.textContent || '').trim().toLowerCase().includes(vLower)) ||
      (items.length ? items[0] : null);

    if (matched) {
      highlightElement(matched, '#4CAF50', 1500);
      await wait(100);
      matched.click();
      matched.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      logger('✅ Salutation: "' + (matched.textContent || '').trim() + '"');
      await wait(300);
    } else { logger('⚠️ No Salutation match: ' + salutationValue); }

    logger('✅ === SALUTATION COMPLETE ===');
  },

  async selectGenderCustomerDetailsMUI(genderValue, logger = console.log) {
    logger('🔍 === GENDER MUI (Customer Details) ===');

    const allMUI = [...document.querySelectorAll('.MuiAutocomplete-root')].filter(m => m.offsetParent !== null);
    logger('📊 Visible MUI: ' + allMUI.length);

    let lastNameBottom = 0;
    for (const label of document.querySelectorAll('label')) {
      if ((label.textContent || '').trim().toLowerCase().includes('last name')) {
        const rect = label.getBoundingClientRect();
        if (rect.bottom > lastNameBottom) lastNameBottom = rect.bottom;
      }
    }
    logger('📍 Last Name bottom Y: ' + lastNameBottom);

    let autocompleteEl = null;

    for (const mui of allMUI) {
      const rect = mui.getBoundingClientRect();
      if (rect.top < lastNameBottom - 5) continue;
      let parent = mui.parentElement;
      let hasGender = false;
      for (let d = 0; d < 8 && parent; d++) {
        if (((parent.textContent || '').toLowerCase()).includes('gender')) { hasGender = true; break; }
        parent = parent.parentElement;
      }
      const inp = mui.querySelector('input');
      if (inp) {
        const attrs = [inp.placeholder, inp.getAttribute('aria-label'), inp.name, inp.id].map(v => (v || '').toLowerCase());
        if (attrs.some(a => a.includes('gender'))) hasGender = true;
      }
      if (hasGender) { autocompleteEl = mui; logger('✅ Gender MUI below Last Name Y=' + rect.top); break; }
    }

    if (!autocompleteEl) {
      logger('🔍 Fallback: bottommost gender MUI...');
      let bottomY = -1;
      for (const mui of allMUI) {
        let parent = mui.parentElement;
        let hasGender = false;
        for (let d = 0; d < 8 && parent; d++) {
          if (((parent.textContent || '').toLowerCase()).includes('gender')) { hasGender = true; break; }
          parent = parent.parentElement;
        }
        if (hasGender) {
          const rect = mui.getBoundingClientRect();
          if (rect.top > bottomY) { bottomY = rect.top; autocompleteEl = mui; }
        }
      }
      if (autocompleteEl) logger('✅ Gender MUI (bottommost) Y=' + bottomY);
    }

    if (!autocompleteEl) throw new Error('Gender MUI not found');
    await this.fillMUIAutocomplete(autocompleteEl, genderValue, 'Gender (Customer Details)', logger);
    logger('✅ === GENDER COMPLETE ===');
  },

  // ═══════════════════════════════════════════════════════════════
  // DOB HELPERS
  // ═══════════════════════════════════════════════════════════════

  async fillDOBWithFallback(dateValue, logger = console.log) {
    try { await this.fillCustomerDOBCalendar(dateValue, logger); }
    catch (e) {
      logger('⚠️ DOB calendar failed: ' + e.message + ', trying input...');
      try { await this.fillCustomerDOBInput(dateValue, logger); }
      catch (e2) { logger('⚠️ DOB input failed: ' + e2.message); }
    }
  },

  async fillCustomerDOBCalendar(dateValue, logger = console.log) {
    logger('🔍 === DOB CALENDAR ===');
    const parts = String(dateValue).split(/[-\/]/);
    if (parts.length !== 3) throw new Error('Bad date (need DD-MM-YYYY): ' + dateValue);
    const targetDay = parseInt(parts[0],10), targetMonth = parseInt(parts[1],10), targetYear = parseInt(parts[2],10);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    logger('📅 Target: ' + targetDay + ' ' + monthNames[targetMonth-1] + ' ' + targetYear);

    const dobLabel = findElementByText('label','Customer DOB') || findElementByText('label','Date of Birth') || findElementByText('label','DOB');
    if (!dobLabel) throw new Error('DOB label not found');
    const container = dobLabel.closest('.p-field,.field,.form-group,.col-12,.col,.MuiFormControl-root') || dobLabel.parentElement;
    const dateInput = container?.querySelector('input[type="text"],input[type="date"],input:not([type="hidden"])');
    if (!dateInput) throw new Error('DOB input not found');

    dateInput.scrollIntoView({behavior:'smooth',block:'center'}); await wait(200);
    highlightElement(dateInput,'#FF9800',2000);
    dateInput.click(); dateInput.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); dateInput.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); dateInput.focus(); await wait(600);

    const getCalendarPanel = () => {
      for (const sel of document.querySelectorAll('select')) {
        if (!sel.offsetParent) continue;
        if (!Array.from(sel.options).some(o=>monthNames.some(m=>o.textContent.includes(m)))) continue;
        let p=sel.parentElement; while(p&&p!==document.body){if(p.querySelector('table')||p.querySelector('td'))return p; p=p.parentElement;}
        return sel.closest('div[class*="panel"],div[class*="picker"],div[class*="calendar"]')||sel.parentElement?.parentElement;
      }
      for (const div of document.querySelectorAll('div')) {
        if (!div.offsetParent) continue;
        const rect=div.getBoundingClientRect(); if(rect.height<200||rect.width<200) continue;
        if(div.querySelector('table')&&div.querySelectorAll('td').length>=28){const ir=dateInput.getBoundingClientRect(); if(Math.abs(rect.top-ir.bottom)<400||Math.abs(ir.top-rect.bottom)<400)return div;}
      }
      return null;
    };

    let calPanel=null;
    for(let i=0;i<20;i++){calPanel=getCalendarPanel();if(calPanel){logger('✅ Calendar found ('+(i+1)+')');break;} await wait(150);}
    if(!calPanel) throw new Error('Calendar did not open');

    const yearInput=calPanel.querySelector('input[type="number"]')||(() => {for(const i of calPanel.querySelectorAll('input')){const v=parseInt(i.value,10);if(v>=1900&&v<=2100)return i;}return null;})();
    if(!yearInput) throw new Error('Year input not found');
    yearInput.focus(); yearInput.click(); await wait(100);
    const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    nativeSetter.call(yearInput,String(targetYear));
    yearInput.dispatchEvent(new Event('input',{bubbles:true})); yearInput.dispatchEvent(new Event('change',{bubbles:true})); yearInput.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));
    logger('✅ Year: '+targetYear); await wait(400);

    const monthSelect=calPanel.querySelector('select');
    if(!monthSelect) throw new Error('Month select not found');
    let monthSet=false;
    for(const opt of monthSelect.options){if(opt.textContent.trim().toLowerCase().startsWith(monthNames[targetMonth-1].toLowerCase())){monthSelect.value=opt.value;monthSelect.dispatchEvent(new Event('change',{bubbles:true}));logger('✅ Month: '+opt.textContent.trim());monthSet=true;break;}}
    if(!monthSet){monthSelect.selectedIndex=targetMonth-1;monthSelect.dispatchEvent(new Event('change',{bubbles:true}));}
    await wait(400);

    logger('🔍 Day: '+targetDay); await wait(200);
    let dayCell=null;
    for(const td of calPanel.querySelectorAll('td')){if((td.className||'').includes('other-month')||(td.className||'').includes('disabled'))continue;const inner=td.querySelector('span')||td.querySelector('button')||td.querySelector('a')||td;if(inner.textContent?.trim()&&parseInt(inner.textContent.trim(),10)===targetDay){dayCell=inner;break;}}
    if(!dayCell){for(const el of calPanel.querySelectorAll('span,button,a,td')){const text=(el.textContent||'').trim();if(!text||parseInt(text,10)!==targetDay)continue;if(parseFloat(window.getComputedStyle(el).opacity)<0.5)continue;const r=el.getBoundingClientRect();if(r.width<10||r.height<10)continue;dayCell=el;break;}}
    if(!dayCell) throw new Error('Day '+targetDay+' not found');

    highlightElement(dayCell,'#4CAF50',1500); await wait(100);
    dayCell.click(); dayCell.dispatchEvent(new MouseEvent('click',{bubbles:true})); logger('✅ Day '+targetDay); await wait(400);

    if(getCalendarPanel()){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(200);if(getCalendarPanel()){document.body.click();document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));await wait(150);dateInput.click();dateInput.blur();await wait(100);}}
    logger('✅ DOB set: '+dateValue);
  },

  async fillCustomerDOBInput(dateValue, logger = console.log) {
    logger('🔍 === DOB INPUT: '+dateValue+' ===');
    const parts=String(dateValue).split(/[-\/]/); if(parts.length!==3){logger('⚠️ Bad DOB: '+dateValue);return;}
    const dd=parts[0].padStart(2,'0'),mm=parts[1].padStart(2,'0'),yyyy=parts[2];
    const isoValue=yyyy+'-'+mm+'-'+dd, textValue=dd+'/'+mm+'/'+yyyy;

    let dobInput=null;
    for(const variant of ['Customer DOB','DOB','Date of Birth']){
      for(const label of document.querySelectorAll('label')){
        if(!(label.textContent||'').trim().toLowerCase().includes(variant.toLowerCase()))continue;
        const forId=label.getAttribute('for'); if(forId){const el=document.getElementById(forId);if(el&&el.tagName==='INPUT'&&el.offsetParent){dobInput=el;break;}}
        const wrap=label.closest('.MuiFormControl-root,.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted')||label.parentElement;
        if(wrap){const inp=wrap.querySelector('input[type="date"],input[type="text"],input:not([type="hidden"])');if(inp&&inp.offsetParent){dobInput=inp;break;}}
      }
      if(dobInput)break;
    }
    if(!dobInput){try{await fillDateByLabel('Customer DOB',dateValue);logger('✅ DOB via fillDateByLabel');}catch(e){logger('⚠️ fillDateByLabel: '+e.message);}return;}

    dobInput.scrollIntoView({behavior:'smooth',block:'center'}); await wait(150);
    highlightElement(dobInput,'#FF9800',2000);
    const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
    const inputType=dobInput.getAttribute('type')||'text';

    if(inputType==='date'){
      dobInput.focus();dobInput.click();await wait(100);
      if(nativeSetter)nativeSetter.call(dobInput,isoValue);else dobInput.value=isoValue;
      dobInput.dispatchEvent(new Event('input',{bubbles:true}));dobInput.dispatchEvent(new Event('change',{bubbles:true}));dobInput.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true}));
      dobInput.blur();dobInput.dispatchEvent(new FocusEvent('blur',{bubbles:true}));await wait(150);
      logger('✅ HTML5 date DOB: '+dobInput.value);
    } else {
      dobInput.focus();dobInput.click();await wait(100);dobInput.select();
      if(nativeSetter)nativeSetter.call(dobInput,'');else dobInput.value='';
      dobInput.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));await wait(60);
      for(let i=0;i<textValue.length;i++){const char=textValue[i],partial=textValue.substring(0,i+1);dobInput.dispatchEvent(new KeyboardEvent('keydown',{key:char,bubbles:true}));if(nativeSetter)nativeSetter.call(dobInput,partial);else dobInput.value=partial;dobInput.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:char}));dobInput.dispatchEvent(new KeyboardEvent('keyup',{key:char,bubbles:true}));await wait(15);}
      dobInput.dispatchEvent(new Event('change',{bubbles:true}));dobInput.blur();dobInput.dispatchEvent(new FocusEvent('blur',{bubbles:true}));await wait(150);
      logger('✅ Text DOB: '+dobInput.value);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // RADIO BUTTON HELPERS
  // ═══════════════════════════════════════════════════════════════

  async selectRadioNearLabel(sectionLabel, optionText, logger = console.log) {
    const label = findElementByText('label', sectionLabel);
    if (!label) { logger('⚠️ Label not found: ' + sectionLabel); return; }
    const container = label.closest('.p-field,.field,.form-group,.col,.col-12,.ng-star-inserted') || label.parentElement?.parentElement;
    if (container) {
      for (const radio of container.querySelectorAll('input[type="radio"]')) {
        const rl    = radio.closest('label') || document.querySelector('label[for="' + radio.id + '"]');
        const rtext = rl ? rl.textContent.trim() : radio.value;
        if (rtext.toLowerCase().includes(optionText.toLowerCase())) {
          if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change',{bubbles:true})); }
          logger('✅ Radio [' + sectionLabel + '] = ' + optionText);
          await wait(100); return;
        }
      }
    }
    await this.selectRadioByText(optionText, logger);
  },

  async selectRadioByText(optionText, logger = console.log) {
    for (const label of document.querySelectorAll('label')) {
      if (!(label.textContent||'').trim().toLowerCase().includes(optionText.toLowerCase())) continue;
      const forId = label.getAttribute('for');
      const radio = forId ? document.getElementById(forId) : label.querySelector('input[type="radio"]');
      if (radio && radio.type === 'radio') {
        if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change',{bubbles:true})); }
        logger('✅ Radio: ' + optionText); await wait(100); return;
      }
    }
    for (const span of document.querySelectorAll('span,div')) {
      if ((span.textContent||'').trim().toLowerCase() !== optionText.toLowerCase()) continue;
      const radio = span.closest('label')?.querySelector('input[type="radio"]') || span.parentElement?.querySelector('input[type="radio"]');
      if (radio) { if (!radio.checked) { radio.click(); radio.dispatchEvent(new Event('change',{bubbles:true})); } logger('✅ Radio (span): ' + optionText); await wait(100); return; }
    }
    logger('⚠️ Radio not found: ' + optionText);
  },

  // ═══════════════════════════════════════════════════════════════
  // KYC CONSENT
  // ═══════════════════════════════════════════════════════════════

  async checkKYCConsent(logger = console.log) {
    for (const label of document.querySelectorAll('label')) {
      if (label.textContent.includes('Central KYC Registry') || label.textContent.toLowerCase().includes('kyc consent')) {
        const cb = label.querySelector('input[type="checkbox"]') || label.previousElementSibling;
        if (cb && cb.type === 'checkbox') {
          if (!cb.checked) { cb.click(); cb.dispatchEvent(new Event('change',{bubbles:true})); }
          logger('✅ KYC Consent checked'); return;
        }
      }
    }
    logger('⚠️ KYC Consent not found');
  },

  // ═══════════════════════════════════════════════════════════════
  // UPDATE STATUS WAIT
  // ═══════════════════════════════════════════════════════════════

  async waitForUpdateStatusOrResume(logger = console.log) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger('⏱️ KYC pause 5min timeout — auto-resuming');
        AutomationPauseController.resume(); resolve();
      }, 5 * 60 * 1000);

      const interval = setInterval(() => {
        const state = AutomationPauseController.getState();
        if (!state.isPaused) { clearInterval(interval); clearTimeout(timeout); resolve(); return; }
        const updateBtn = findElementByText('button', 'UPDATE STATUS');
        if (updateBtn && (updateBtn.disabled || updateBtn.style.opacity === '0.5' || updateBtn.style.display === 'none')) {
          logger('✅ UPDATE STATUS clicked — resuming');
          AutomationPauseController.resume(); clearInterval(interval); clearTimeout(timeout); resolve();
        }
      }, 500);
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // BUTTON HELPERS
  // ═══════════════════════════════════════════════════════════════

  async clickButtonByText(text, logger = console.log) {
    for (let i = 0; i < 15; i++) {
      const btn = findElementByText('button', text);
      if (btn && !btn.disabled) { clickElement(btn); logger('✅ Clicked: ' + text); return; }
      await wait(200);
    }
    logger('⚠️ Button not found: ' + text);
  },

  async clickProceedButton(logger = console.log) {
    for (let i = 0; i < 25; i++) {
      const btn = findElementByText('button','Proceed') || findElementByText('button','Next') || findElementByText('button','Continue');
      if (btn && !btn.disabled) { clickElement(btn); logger('✅ Proceed clicked'); return; }
      await wait(200);
    }
    logger('⚠️ Proceed/Next/Continue not found');
  },

  // ═══════════════════════════════════════════════════════════════
  // LEGACY SECTION HELPERS (kept for internal fallback)
  // ═══════════════════════════════════════════════════════════════

  async fillSectionInput(sectionName, fieldLabel, value, logger = console.log) {
    const needle = fieldLabel.toLowerCase();
    for (const label of document.querySelectorAll('label')) {
      if (!(label.textContent||'').trim().toLowerCase().includes(needle)) continue;
      const wrap = label.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted') || label.parentElement;
      const input = wrap?.querySelector('input[type="text"],input[type="tel"],input[type="number"],textarea');
      if (!input || !input.offsetParent) continue;
      fillInput(input, value); logger('✅ '+sectionName+' '+fieldLabel+': '+value); return;
    }
    await fillInputByLabel(fieldLabel, value); logger('✅ '+fieldLabel+' (no-section): '+value);
  },

  async fillSectionDropdown(sectionName, fieldLabel, value, logger = console.log) {
    const needle = fieldLabel.toLowerCase();
    for (const label of document.querySelectorAll('label')) {
      if (!(label.textContent||'').trim().toLowerCase().includes(needle)) continue;
      const wrap = label.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted') || label.parentElement;
      const dd = wrap?.querySelector('.p-dropdown');
      if (!dd || !dd.offsetParent) continue;
      const ok = await openAndSelectPrimeDropdown(dd, value);
      if (ok) { logger('✅ '+sectionName+' '+fieldLabel+': '+value); return; }
    }
    await fillDropdownByFirstLabelMatch([fieldLabel], value); logger('✅ '+fieldLabel+' (fallback): '+value);
  },

  async fillSectionAutocompleteOrDropdown(sectionName, fieldLabel, value, logger = console.log) {
    const needle = fieldLabel.toLowerCase();
    for (const label of document.querySelectorAll('label')) {
      if (!(label.textContent||'').trim().toLowerCase().includes(needle)) continue;
      const wrap = label.closest('.p-field,.field,.form-group,.col-12,.col,.ng-star-inserted') || label.parentElement;
      if (!wrap) continue;
      const acInput = wrap.querySelector('.p-autocomplete input, input.p-autocomplete-input');
      if (acInput && acInput.offsetParent) {
        acInput.focus(); fillInput(acInput, value); await wait(300);
        const deadline = Date.now()+10000;
        while (Date.now()<deadline) {
          await wait(150);
          const panel = document.querySelector('.p-autocomplete-panel:not([style*="display: none"])') || document.querySelector('.p-autocomplete-panel');
          if (!panel||!panel.offsetParent) continue;
          const items = panel.querySelectorAll('.p-autocomplete-item, li[role="option"]');
          const vlow  = value.toLowerCase();
          const pick  = [...items].find(it=>it.textContent.trim().toLowerCase()===vlow) || [...items].find(it=>it.textContent.trim().toLowerCase().includes(vlow)) || (items.length?items[0]:null);
          if (pick) { clickElement(pick); await wait(150); logger('✅ '+fieldLabel+' AC: '+value); return; }
        }
        acInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await wait(150); return;
      }
      const dd = wrap.querySelector('.p-dropdown');
      if (dd && dd.offsetParent) { await openAndSelectPrimeDropdown(dd, value); logger('✅ '+fieldLabel+' DD: '+value); return; }
    }
    throw new Error('No AC/DD for '+fieldLabel);
  },
};