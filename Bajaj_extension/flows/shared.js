/**
 * Shared utilities for Bajaj General Insurance flows
 * Loaded first via manifest content_scripts load order.
 */

// ─── BASIC HELPERS ───────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function qs(selector, root) {
  return (root || document).querySelector(selector);
}

function highlightElement(el, color = '#4CAF50', duration = 2000) {
  if (!el) return;
  const orig = { outline: el.style.outline, boxShadow: el.style.boxShadow };
  el.style.outline = `3px solid ${color}`;
  el.style.boxShadow = `0 0 12px ${color}80`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    el.style.outline = orig.outline;
    el.style.boxShadow = orig.boxShadow;
  }, duration);
}

function clickElement(el) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') {
    el.focus({ preventScroll: true });
  }
  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  return true;
}

function clickElementNoScroll(el) {
  if (!el) return false;

  try {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}
  try {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
  }

  if (typeof el.click === 'function') {
    el.click();
  } else {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  try {
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}
  try {
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  return true;
}

function waitForSwalToClose(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const popup = document.querySelector('.swal2-popup.swal2-show, .swal2-popup');
      if (!popup || popup.offsetParent === null) { resolve(true); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 150);
    };
    check();
  });
}

function getVisibleSwalPopup() {
  const popup = document.querySelector('.swal2-container .swal2-popup.swal2-show, .swal2-popup.swal2-show, .swal2-popup');
  return popup && popup.offsetParent !== null ? popup : null;
}

function forceCloseSwalPopup(popup) {
  const currentPopup = popup || getVisibleSwalPopup();
  if (!currentPopup) return false;

  const container = currentPopup.closest('.swal2-container') || document.querySelector('.swal2-container');

  currentPopup.classList.remove('swal2-show');
  currentPopup.classList.add('swal2-hide');
  currentPopup.style.display = 'none';
  currentPopup.setAttribute('aria-hidden', 'true');

  if (container) {
    container.classList.remove('swal2-backdrop-show');
    container.style.display = 'none';
    container.setAttribute('aria-hidden', 'true');
    container.remove();
  } else {
    currentPopup.remove();
  }

  document.body.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
  document.documentElement.classList.remove('swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');

  return true;
}

function getVisibleSwalConfirmButton(popup) {
  const currentPopup = popup || getVisibleSwalPopup();
  if (!currentPopup) return null;

  const selectors = [
    '.swal2-confirm',
    '.swal2-actions .swal2-styled',
    '.swal2-actions button',
    'button',
  ];

  for (const selector of selectors) {
    for (const button of currentPopup.querySelectorAll(selector)) {
      if (button.offsetParent === null || button.disabled) continue;
      const text = button.textContent?.trim().toLowerCase();
      if (text === 'ok' || text === 'okay' || text === 'confirm' || text === 'done' || text === 'close') {
        return button;
      }
    }
  }

  return null;
}

function clickSwalConfirmButton(button) {
  if (!button) return false;

  try {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  } catch (_) {}
  try {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  if (typeof button.focus === 'function') {
    try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
  }

  try {
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
  } catch (_) {}
  try {
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  } catch (_) {}

  if (typeof button.click === 'function') {
    button.click();
  } else {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  return true;
}

async function dismissVisibleSwalPopup(logger = console.log, context = 'SweetAlert', options = {}) {
  const { allowForceClose = true, waitForCloseMs = 2000 } = options;
  const popup = getVisibleSwalPopup();
  if (!popup) return false;

  const okBtn = getVisibleSwalConfirmButton(popup);
  if (okBtn) {
    clickSwalConfirmButton(okBtn);
    const closed = await waitForSwalToClose(waitForCloseMs);
    if (closed) {
      logger(`✅ ${context} dismissed`);
      return true;
    }

    logger(`⚠️ ${context} OK click did not close the popup within ${waitForCloseMs}ms`);
  }

  if (!allowForceClose) return false;

  const forced = forceCloseSwalPopup(popup);
  if (forced) {
    logger(`✅ ${context} force-closed`);
    await wait(200);
    return true;
  }

  return false;
}

function isQuoteCreatedSwal(popup) {
  if (!popup) return false;
  const titleText = popup.querySelector('#swal2-title, .swal2-title')?.textContent?.trim().toLowerCase() || '';
  const bodyText = popup.querySelector('#swal2-html-container, .swal2-html-container')?.textContent?.trim().toLowerCase() || '';
  const combined = `${titleText} ${bodyText}`;
  return combined.includes('quote created successfully') || combined.includes('quote no:');
}

async function ensureQuoteCreatedPopupDismissed(logger = console.log, timeoutMs = 8000, quietMs = 800) {
  const deadline = Date.now() + timeoutMs;
  let quietSince = 0;
  let dismissedAny = false;

  while (Date.now() < deadline) {
    const popup = getVisibleSwalPopup();
    if (popup && isQuoteCreatedSwal(popup)) {
      quietSince = 0;
      if (await dismissVisibleSwalPopup(logger, 'Quote-created popup', { allowForceClose: false, waitForCloseMs: 12000 })) {
        dismissedAny = true;
        continue;
      }
    }

    if (!popup || !isQuoteCreatedSwal(popup)) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= quietMs) return dismissedAny;
    }

    await wait(200);
  }

  return dismissedAny;
}

/**
 * fillInput — works with Angular/PrimeNG reactive forms.
 * Uses the native HTMLInputElement setter so Angular's change detection fires.
 */
function fillInput(el, value) {
  if (!el) return;
  const fieldId = el.id || el.name;
  if (fieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(fieldId)) {
    console.log(`[Automation] 🛡️ Skipping protected field: ${fieldId}`);
    return;
  }
  el.focus();
  el.click();

  // Angular native setter trick — required for reactive forms
  const nativeSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur',   { bubbles: true }));
}

function findElementByText(tagName, text, root) {
  const needle = (text || '').toLowerCase().trim();
  const els = (root || document).querySelectorAll(tagName);
  for (const el of els) {
    if (el.textContent.trim().toLowerCase().includes(needle)) return el;
  }
  return null;
}

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ─── WAIT HELPERS ────────────────────────────────────────────────────────────

function waitForElement(selector, options = {}) {
  const { timeoutMs = 10000, root = document } = options;
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const el = root.querySelector(selector);
      if (el && el.offsetParent !== null) { resolve(el); return; }
      if (Date.now() - start > timeoutMs) { resolve(null); return; }
      setTimeout(check, 150);
    };
    check();
  });
}

function waitForSkeletonsToDisappear(timeoutMs = 15000) {
  const sel = '.skeleton,.skeleton-loader,[class*="skeleton"],.loading-placeholder';
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (!document.querySelector(sel)) { resolve(); return; }
      if (Date.now() - start > timeoutMs) { resolve(); return; }
      setTimeout(check, 300);
    };
    check();
  });
}

function waitForDialogToClose(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const dlg =
        document.querySelector('.modal.show') ||
        document.querySelector('[role="dialog"]:not([aria-hidden="true"])') ||
        document.querySelector('.p-dialog:not(.p-dialog-leave)');
      if (!dlg || dlg.offsetParent === null) { resolve(); return; }
      if (Date.now() - start > timeoutMs) { resolve(); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

function waitForMuiBackdropToClear(timeoutMs = 20000, stableMs = 600) {
  const start = Date.now();
  let clearSince = 0;

  const isBackdropBlocking = () => {
    for (const backdrop of document.querySelectorAll('.MuiBackdrop-root')) {
      const style = window.getComputedStyle(backdrop);
      const hasSpinner = Boolean(backdrop.querySelector('[role="progressbar"], .MuiCircularProgress-root'));
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      if (hasSpinner && visible) return true;
    }
    return false;
  };

  return new Promise((resolve) => {
    const check = () => {
      if (!isBackdropBlocking()) {
        if (!clearSince) clearSince = Date.now();
        if (Date.now() - clearSince >= stableMs) { resolve(true); return; }
      } else {
        clearSince = 0;
      }

      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 150);
    };
    check();
  });
}

function waitForButtonEnabled(textOrSelector, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      let btn = null;
      const isSel = /^[#.\[]/.test(textOrSelector) || textOrSelector.includes(' ');
      if (isSel) btn = document.querySelector(textOrSelector);
      else btn = findElementByText('button', textOrSelector);
      if (btn && !btn.disabled) { resolve(btn); return; }
      if (Date.now() - start > timeoutMs) { resolve(null); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

// ─── PRIMENG DROPDOWN ────────────────────────────────────────────────────────

/**
 * Open a PrimeNG dropdown by its container selector or element, type in filter,
 * then click the matching option from the global overlay panel.
 *
 * This is the canonical dropdown helper for all flows.
 */
async function openAndSelectPrimeDropdown(dropdownEl, value, exactMatch = false) {
  if (!dropdownEl) throw new Error('Dropdown element is null');

  // Close any open panels first
  document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(200);

  const trigger = dropdownEl.querySelector('.p-dropdown-trigger') || dropdownEl;
  clickElement(trigger);
  await wait(600);

  // Type into filter if available
  const filter =
    document.querySelector('.p-dropdown-panel .p-dropdown-filter') ||
    document.querySelector('.p-dropdown-filter');
  if (filter) {
    fillInput(filter, value);
    await wait(500);
  }

  // Wait for the panel to appear
  let panel = null;
  for (let i = 0; i < 20; i++) {
    panel = document.querySelector('.p-dropdown-panel:not([style*="display: none"])') ||
            document.querySelector('.p-dropdown-panel');
    if (panel && panel.offsetParent !== null) break;
    await wait(150);
  }

  if (!panel) {
    // Fallback: click trigger again
    clickElement(trigger);
    await wait(800);
    panel = document.querySelector('.p-dropdown-panel');
  }

  if (panel) {
    const items = panel.querySelectorAll('.p-dropdown-item, li[role="option"], li');
    const needle = (value || '').toLowerCase().trim();
    for (const item of items) {
      const txt = item.textContent.trim().toLowerCase();
      const match = exactMatch ? txt === needle : txt.includes(needle);
      if (match) {
        clickElement(item);
        await wait(400);
        return true;
      }
    }
    // Log available options to help debug mismatches
    const avail = [...items].slice(0, 6).map(i => i.textContent.trim()).join(' | ');
    console.warn(`[Sompo] Dropdown option "${value}" not found. Available: ${avail}`);
  }

  return false;
}

/**
 * Find a PrimeNG dropdown by its associated label text, then open & select.
 */
async function fillDropdownByLabel(labelText, value, exactMatch = false) {
  const needle = (labelText || '').toLowerCase().trim();
  for (const label of document.querySelectorAll('label')) {
    if (!label.textContent.trim().toLowerCase().includes(needle)) continue;

    let dropdown = null;
    const forId = label.getAttribute('for');
    if (forId) dropdown = document.getElementById(forId)?.closest('.p-dropdown');
    if (!dropdown) {
      const wrap = label.closest('.p-float-label,.field,.form-group,.p-field,.col-12,.col,.ng-star-inserted') || label.parentElement;
      dropdown = wrap?.querySelector('.p-dropdown');
    }
    if (!dropdown && label.nextElementSibling) {
      dropdown = label.nextElementSibling.querySelector?.('.p-dropdown') || (label.nextElementSibling.classList?.contains('p-dropdown') ? label.nextElementSibling : null);
    }
    if (!dropdown || !dropdown.offsetParent) continue;

    const ok = await openAndSelectPrimeDropdown(dropdown, value, exactMatch);
    if (ok) return true;
  }
  throw new Error(`Dropdown not found for label "${labelText}" or option "${value}" missing`);
}

/**
 * Try multiple label substrings for the dropdown.
 */
async function fillDropdownByFirstLabelMatch(labelSubstrings, value, exactMatch = false) {
  const list = Array.isArray(labelSubstrings) ? labelSubstrings : [labelSubstrings];
  for (const sub of list) {
    try {
      const ok = await fillDropdownByLabel(sub, value, exactMatch);
      if (ok) return true;
    } catch (_) { /* try next */ }
  }
  throw new Error(`No dropdown found for labels: ${list.join(' | ')}`);
}

// ─── PRIMENG AUTOCOMPLETE ─────────────────────────────────────────────────────

/**
 * Type into a PrimeNG autocomplete input and select the best matching suggestion.
 */
async function fillAutocompleteByLabel(labelSubstrings, searchText) {
  const list = Array.isArray(labelSubstrings) ? labelSubstrings : [labelSubstrings];
  const val = String(searchText || '').trim();

  for (const sub of list) {
    const needle = sub.toLowerCase();
    for (const label of document.querySelectorAll('label')) {
      if (!label.textContent.trim().toLowerCase().includes(needle)) continue;

      const forId = label.getAttribute('for');
      let input = forId ? document.getElementById(forId) : null;
      if (!input || input.tagName !== 'INPUT') {
        const wrap = label.closest('.p-float-label,.field,.form-group,.p-field,.col') || label.parentElement;
        input = wrap?.querySelector('.p-autocomplete input, input.p-autocomplete-input, input[type="search"]');
      }
      if (!input || !input.offsetParent) continue;

      input.focus();
      fillInput(input, val);
      await wait(700);

      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        await wait(350);
        const panel =
          document.querySelector('.p-autocomplete-panel:not([style*="display: none"])') ||
          document.querySelector('.p-autocomplete-panel');
        if (!panel || panel.offsetParent === null) continue;
        const items = panel.querySelectorAll('.p-autocomplete-item, li[role="option"]');
        const vlow = val.toLowerCase();
        let pick = [...items].find(it => it.textContent.trim().toLowerCase() === vlow);
        if (!pick) pick = [...items].find(it => it.textContent.trim().toLowerCase().includes(vlow));
        if (!pick && items.length) pick = items[0];
        if (pick) { clickElement(pick); await wait(400); return true; }
      }

      // Fallback: Enter key
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(300);
      return true;
    }
  }
  throw new Error(`Autocomplete not found for: ${list.join(' | ')}`);
}

// ─── INPUT BY LABEL ───────────────────────────────────────────────────────────

async function fillInputByLabel(labelSubstring, value, options = {}) {
  const { excludeText = '' } = options;
  const sub = (labelSubstring || '').toLowerCase();
  const excl = (excludeText || '').toLowerCase();
  const val = value == null ? '' : String(value);

  for (const label of document.querySelectorAll('label')) {
    const raw = label.textContent.trim();
    const low = raw.toLowerCase();
    if (!low.includes(sub)) continue;
    if (excl && low.includes(excl)) continue;

    const forId = label.getAttribute('for');
    let input = forId ? document.getElementById(forId) : null;
    if (input && ['checkbox', 'radio', 'hidden', 'file'].includes(input.type)) input = null;
    if (!input) {
      const wrap = label.closest('.p-float-label,.field,.form-group,.col-12,.col,.p-field,.ng-star-inserted') || label.parentElement;
      input = wrap?.querySelector('input.p-inputtext:not([type="hidden"]), input[type="text"], input[type="number"], input[type="tel"], input[type="email"]');
    }
    if (!input || !input.offsetParent) continue;

    const fieldId = input.id || input.name;
    if (fieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(fieldId)) return;
    fillInput(input, val);
    await wait(200);
    return true;
  }
  throw new Error(`Input not found for label containing "${labelSubstring}"`);
}

// ─── DATE BY LABEL ────────────────────────────────────────────────────────────

function _formatSompoDate(dateValue) {
  if (!dateValue) return '';
  const s = String(dateValue).trim();
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // DD-MM-YYYY → DD/MM/YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s.replace(/-/g, '/');
  // Try native Date parse (YYYY-MM-DD, etc.)
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }
  return s;
}

async function fillDateByLabel(labelSubstring, dateValue) {
  const formatted = _formatSompoDate(dateValue);
  const sub = (labelSubstring || '').toLowerCase();

  for (const label of document.querySelectorAll('label')) {
    if (!label.textContent.trim().toLowerCase().includes(sub)) continue;

    const forId = label.getAttribute('for');
    let el = forId ? document.getElementById(forId) : null;
    if (!el || el.tagName !== 'INPUT') {
      const wrap = label.closest('.p-float-label,.field,.form-group,.p-field,.col-12,.col') || label.parentElement;
      el = wrap?.querySelector('.p-calendar input, .p-datepicker input, input[placeholder*="DD" i], input[type="text"]') ||
           wrap?.querySelector('input.p-inputtext');
    }
    if (!el || !el.offsetParent) continue;

    const dateFieldId = el.id || el.name;
    if (dateFieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(dateFieldId)) return;
    fillInput(el, formatted);
    await wait(300);
    return true;
  }
  throw new Error(`Date input not found for label containing "${labelSubstring}"`);
}

// ─── RADIO & CHECKBOX ─────────────────────────────────────────────────────────

async function selectRadioByLabel(labelText) {
  const needle = (labelText || '').toLowerCase();
  for (const label of document.querySelectorAll('label')) {
    if (!label.textContent.trim().toLowerCase().includes(needle)) continue;
    const forId = label.getAttribute('for');
    let radio = forId ? document.getElementById(forId) : label.querySelector('input[type="radio"]');
    if (!radio) radio = label.previousElementSibling;
    if (radio && radio.type === 'radio') {
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      return true;
    }
  }
  throw new Error(`Radio button with label "${labelText}" not found`);
}

async function selectCheckboxByLabel(labelText, checked = true) {
  const needle = (labelText || '').toLowerCase();
  for (const label of document.querySelectorAll('label')) {
    if (!label.textContent.trim().toLowerCase().includes(needle)) continue;
    const forId = label.getAttribute('for');
    let cb = forId ? document.getElementById(forId) : label.querySelector('input[type="checkbox"]');
    if (!cb) cb = label.previousElementSibling;
    if (cb && cb.type === 'checkbox') {
      if (cb.checked !== checked) {
        cb.click();
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(200);
      return true;
    }
  }
  throw new Error(`Checkbox with label "${labelText}" not found`);
}

// ─── OTP HELPERS ─────────────────────────────────────────────────────────────

function isOtpInvalid() {
  const alerts = document.querySelectorAll('.error,.alert-danger,[class*="error"],[class*="invalid"]');
  for (const el of alerts) {
    const t = el.textContent.toLowerCase();
    if (t.includes('invalid otp') || t.includes('otp expired') || t.includes('wrong otp')) return true;
  }
  return false;
}

async function fetchOTP() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['otpConfig'], (r) => {
      const cfg = r.otpConfig || {
        email: 'otpcoverscrafter@gmail.com',
        label: 'UNIVERSAL_SOMPO',
        apiBase: 'https://otpservice.coverscrafter.com/api/v1/otp',
      };
      const url = `${cfg.apiBase}/latest?label=${encodeURIComponent(cfg.label)}&mailbox_email=${encodeURIComponent(cfg.email)}`;
      chrome.runtime.sendMessage({ action: 'FETCH_OTP', url }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.success && resp?.data?.otp) resolve(resp.data);
        else reject(new Error(resp?.data?.message || resp?.error || 'No OTP'));
      });
    });
  });
}

async function markOtpAsUsed(otpId) {
  if (!otpId) return;
  return new Promise((resolve) => {
    chrome.storage.local.get(['otpConfig'], (r) => {
      const cfg = r.otpConfig || { apiBase: 'https://otpservice.coverscrafter.com/api/v1/otp' };
      const url = `${cfg.apiBase}/${otpId}/use`;
      chrome.runtime.sendMessage({ action: 'MARK_OTP_USED', url }, () => resolve());
    });
  });
}

async function fetchOTPWithRetry(maxAttempts = 6, intervalMs = 15000) {
  for (let i = 1; i <= maxAttempts; i++) {
    console.log(`[Sompo] 🔄 OTP attempt ${i}/${maxAttempts}...`);
    try {
      const data = await fetchOTP();
      console.log(`[Sompo] ✅ OTP received`);
      return data;
    } catch (e) {
      console.log(`[Sompo] ⚠️ OTP attempt ${i} failed: ${e.message}`);
      if (i < maxAttempts) await wait(intervalMs);
    }
  }
  throw new Error('OTP fetch failed after all attempts');
}

async function fillOTP(otpData) {
  const otp = typeof otpData === 'string' ? otpData : otpData.otp;
  if (!otp) throw new Error('No OTP value');

  const digitInputs = document.querySelectorAll('input[maxlength="1"][type="text"], input[maxlength="1"][type="number"]');
  if (digitInputs.length >= 4) {
    for (let i = 0; i < otp.length && i < digitInputs.length; i++) {
      fillInput(digitInputs[i], otp[i]);
      await wait(80);
    }
  } else {
    const otpInput =
      document.querySelector('input[name*="otp" i]') ||
      document.querySelector('input[id*="otp" i]') ||
      document.querySelector('input[placeholder*="otp" i]') ||
      document.querySelector('input[maxlength="6"]');
    if (otpInput) fillInput(otpInput, otp);
    else throw new Error('OTP input not found');
  }

  await wait(500);
  const verifyBtn =
    findElementByText('button', 'verify') ||
    findElementByText('button', 'submit') ||
    findElementByText('button', 'confirm') ||
    findElementByText('button', 'validate');
  if (verifyBtn) { clickElement(verifyBtn); await wait(3000); }
  if (otpData?.id) await markOtpAsUsed(otpData.id);
}

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────

async function uploadFile(selector, fileUrl, fileName = 'upload.jpg', mimeType = 'image/jpeg') {
  const input = document.querySelector(selector);
  if (!input) throw new Error(`File input not found: ${selector}`);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'FETCH_UPLOAD', url: fileUrl }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.success) return reject(new Error(resp?.error || 'Upload fetch failed'));
      const blob = new Blob([resp.buffer], { type: mimeType });
      const file = new File([blob], fileName, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      resolve(true);
    });
  });
}

// ─── PAYLOAD NORMALIZER ───────────────────────────────────────────────────────

function normalizeToSompoForm(payload) {
  return {
    vehicleDetails:    payload.vehicleDetails    || payload.vehicle    || {},
    vehicleInformation:payload.vehicleInformation|| payload.vehicleInfo|| {},
    planDetails:       payload.planDetails       || payload.plan       || {},
    additionalDetails: payload.additionalDetails || payload.additional || {},
    covers:            payload.covers            || payload.addons     || {},
    customerDetails:   payload.customerDetails   || payload.customer   || {},
    kycDetails:        payload.kycDetails        || {},
    documentDetails:   payload.documentDetails   || {},
    hypothecation:     payload.hypothecation     || {},
    nominee:           payload.nominee           || {},
    agentDetails:      payload.agentDetails      || {},
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION PAUSE / RESUME CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

const AutomationPauseController = {
  STORAGE_KEY: 'sompo_automation_state',

  _defaultState() {
    return {
      isPaused: false, isStopped: false, isRunning: false,
      currentStep: null, completedSteps: [], phase: null,
      inputSnapshot: {}, adminEditedFields: [], pausedAtTimestamp: null,
      panelDismissed: false,
    };
  },

  getState() {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this._defaultState();
    } catch { return this._defaultState(); }
  },

  _saveState(state) { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(state)); },

  captureInputSnapshot() {
    const snap = {};
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      if (el.type === 'radio' || el.type === 'checkbox') snap[key + '__' + (el.value || '')] = el.checked;
      else snap[key] = el.value;
    });
    document.querySelectorAll('.p-dropdown-label').forEach((el, i) => { snap[`__dd_${i}`] = el.textContent.trim(); });
    return snap;
  },

  detectAdminEdits(oldSnap) {
    const edited = [];
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      let sk, cv;
      if (el.type === 'radio' || el.type === 'checkbox') { sk = key + '__' + (el.value || ''); cv = el.checked; }
      else { sk = key; cv = el.value; }
      if (sk in oldSnap && String(cv) !== String(oldSnap[sk])) { const fid = el.id || el.name; if (fid) edited.push(fid); }
    });
    return [...new Set(edited)];
  },

  pause() {
    const state = this.getState();
    state.isPaused = true; state.pausedAtTimestamp = Date.now();
    state.inputSnapshot = this.captureInputSnapshot();
    this._saveState(state); this._updateUI();
    console.log('%c[Automation] ⏸️ PAUSED at: ' + state.currentStep, 'color:#e53935;font-weight:bold;font-size:14px;');
  },

  resume() {
    const state = this.getState();
    if (state.inputSnapshot && Object.keys(state.inputSnapshot).length > 0) {
      const edits = this.detectAdminEdits(state.inputSnapshot);
      if (edits.length > 0) {
        state.adminEditedFields = [...new Set([...(state.adminEditedFields || []), ...edits])];
        console.log('%c[Automation] 🛡️ Protected fields: ' + edits.join(', '), 'color:#ffd166;font-weight:bold;');
      }
    }
    state.isPaused = false; state.pausedAtTimestamp = null; state.inputSnapshot = {};
    this._saveState(state); this._updateUI();
    console.log('%c[Automation] ▶️ RESUMED from: ' + state.currentStep, 'color:#2d6a4f;font-weight:bold;font-size:14px;');
  },

  isFieldProtected(fieldIdOrName) {
    if (!fieldIdOrName) return false;
    return (this.getState().adminEditedFields || []).includes(fieldIdOrName);
  },

  async checkpoint(stepLabel) {
    const s0 = this.getState();
    if (s0.isStopped) throw new Error('AUTOMATION_STOPPED');
    if (stepLabel) {
      const state = this.getState();
      state.currentStep = stepLabel; state.isRunning = true;
      this._saveState(state); this._updateUI();
    }
    while (true) {
      const s = this.getState();
      if (s.isStopped) throw new Error('AUTOMATION_STOPPED');
      if (!s.isPaused) break;
      await wait(500);
    }
  },

  markStepComplete(stepId) {
    const state = this.getState();
    if (!state.completedSteps.includes(stepId)) state.completedSteps.push(stepId);
    this._saveState(state);
  },

  isStepCompleted(stepId) { return this.getState().completedSteps.includes(stepId); },

  setPhase(phase) {
    const state = this.getState(); state.phase = phase; state.isRunning = true;
    this._saveState(state); this._updateUI();
  },

  startRun() {
    const fresh = this._defaultState(); fresh.isRunning = true;
    this._saveState(fresh); this._updateUI();
  },

  endRun() {
    const state = this.getState(); state.isRunning = false; state.currentStep = 'Completed ✅';
    this._saveState(state); this._updateUI();
  },

  failRun(message) {
    const state = this.getState(); state.isRunning = false; state.currentStep = message || 'Failed';
    this._saveState(state); this._updateUI();
  },

  stop() {
    const state = this.getState();
    state.isStopped = true; state.isPaused = false; state.isRunning = false; state.currentStep = 'Stopped ⛔';
    this._saveState(state); this._updateUI();
    console.log('%c[Automation] ⛔ STOPPED permanently', 'color:#ff0000;font-weight:bold;font-size:16px;');
  },

  reset() { sessionStorage.removeItem(this.STORAGE_KEY); this._updateUI(); },

  _updateUI() {
    const panel = document.getElementById('sompo-automation-panel');
    if (!panel) return;
    const state = this.getState();
    const badge   = document.getElementById('sompo-auto-badge');
    const stepEl  = document.getElementById('sompo-auto-step');
    const pauseBtn= document.getElementById('sompo-auto-pause-btn');
    const stopBtn = document.getElementById('sompo-auto-stop-btn');
    const protEl  = document.getElementById('sompo-auto-protected');

    if (state.panelDismissed) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'flex';

    if (state.isStopped) {
      badge.textContent = '⛔ STOPPED'; badge.style.background = '#b71c1c';
      pauseBtn.textContent = '⏸️ Pause'; pauseBtn.disabled = true; pauseBtn.style.opacity = '0.4';
      stopBtn.disabled = true; stopBtn.style.opacity = '0.4';
    } else if (!state.isRunning) {
      badge.textContent = '💤 Idle'; badge.style.background = '#555';
      pauseBtn.textContent = '⏸️ Pause'; pauseBtn.disabled = true; pauseBtn.style.opacity = '0.4';
      stopBtn.disabled = true; stopBtn.style.opacity = '0.4';
    } else if (state.isPaused) {
      badge.textContent = '⏸️ PAUSED'; badge.style.background = '#e53935';
      pauseBtn.textContent = '▶️ Resume'; pauseBtn.disabled = false; pauseBtn.style.opacity = '1';
      pauseBtn.style.background = '#2d6a4f'; pauseBtn.style.borderColor = '#40916c';
      stopBtn.disabled = false; stopBtn.style.opacity = '1';
    } else {
      badge.textContent = '🤖 Running'; badge.style.background = '#2d6a4f';
      pauseBtn.textContent = '⏸️ Pause'; pauseBtn.disabled = false; pauseBtn.style.opacity = '1';
      pauseBtn.style.background = '#e53935'; pauseBtn.style.borderColor = '#c62828';
      stopBtn.disabled = false; stopBtn.style.opacity = '1';
    }

    stepEl.textContent = state.currentStep || (state.isRunning ? 'Starting...' : 'Waiting for automation');
    const pc = (state.adminEditedFields || []).length;
    if (protEl) {
      protEl.textContent = pc > 0 ? `🛡️ ${pc} field${pc > 1 ? 's' : ''} protected` : '';
      protEl.style.display = pc > 0 ? 'block' : 'none';
    }
  },

  injectUI() {
    if (document.getElementById('sompo-automation-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'sompo-automation-panel';
    panel.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:999999;
      background:#1a1a2e;border:2px solid #e53935;border-radius:12px;
      padding:14px 18px;min-width:260px;max-width:340px;
      font-family:'Segoe UI',sans-serif;color:#e0e0e0;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:8px;`;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span id="sompo-auto-badge" style="background:#555;color:white;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;">💤 Idle</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:10px;color:#888;">Sompo Auto</span>
          <button id="sompo-auto-close-btn" type="button" aria-label="Close automation panel" style="width:24px;height:24px;border:1px solid rgba(255,255,255,0.18);border-radius:999px;background:rgba(255,255,255,0.08);color:#f5f5f5;font-size:12px;font-weight:700;line-height:1;cursor:pointer;">X</button>
        </div>
      </div>
      <div style="font-size:10px;color:#aaa;margin-top:2px;">Current Step:</div>
      <div id="sompo-auto-step" style="font-size:12px;font-weight:600;color:#90caf9;word-break:break-word;">Waiting for automation</div>
      <div id="sompo-auto-protected" style="font-size:10px;color:#ffd166;display:none;margin-top:2px;"></div>
      <div style="display:flex;gap:8px;">
        <button id="sompo-auto-pause-btn" style="flex:1;padding:8px 0;border:2px solid #c62828;border-radius:8px;background:#e53935;color:white;font-size:12px;font-weight:700;cursor:not-allowed;letter-spacing:0.5px;transition:all 0.2s;opacity:0.4;">⏸️ Pause</button>
        <button id="sompo-auto-stop-btn" style="flex:1;padding:8px 0;border:2px solid #b71c1c;border-radius:8px;background:#d32f2f;color:white;font-size:12px;font-weight:700;cursor:not-allowed;letter-spacing:0.5px;transition:all 0.2s;opacity:0.4;">⛔ Stop</button>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById('sompo-auto-pause-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      state.isPaused ? this.resume() : this.pause();
    });
    document.getElementById('sompo-auto-stop-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      if (confirm('⛔ Permanently stop the automation?')) this.stop();
    });
    document.getElementById('sompo-auto-close-btn').addEventListener('click', () => {
      const state = this.getState();
      state.panelDismissed = true;
      this._saveState(state);
      panel.style.display = 'none';
    });
    this._updateUI();
  },
};