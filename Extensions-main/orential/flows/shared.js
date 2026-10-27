/**
 * Shared utilities for Oriental flows (form, quote, login, etc.)
 */
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clickElement(el) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.click();
  return true;
}

function qs(selector, root) {
  if (!selector) return null;
  return (root || document).querySelector(selector);
}

function setNativeInputValue(el, value) {
  const prototype = el instanceof window.HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fillInput(el, value) {
  if (!el) return;
  // Skip if admin edited this field during a pause
  const fieldId = el.id || el.name;
  if (fieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(fieldId)) {
    console.log(`[Automation] 🛡️ Skipping protected field: ${fieldId}`);
    return;
  }
  const nextValue = value == null ? '' : String(value);
  el.focus();
  el.click();
  setNativeInputValue(el, nextValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function getReactProps(el) {
  if (!el) return null;
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
  );
  return key ? el[key] : null;
}

// The KYC slide renders the full name and permanent address as disabled inputs
// built from whatever the Form 60 / OVD step stored. That record regularly
// disagrees with the request (a dropped middle name, an OCR'd address), so the
// lock comes off and the request value is written over it.
function unlockInput(el) {
  if (!el) return;
  el.disabled = false;
  el.readOnly = false;
  el.removeAttribute('disabled');
  el.removeAttribute('readonly');
  el.removeAttribute('aria-disabled');
  ['disabled', 'p-disabled', 'Mui-disabled', 'form-control-disabled'].forEach((cls) =>
    el.classList.remove(cls)
  );
}

function isFieldProtected(el) {
  const fieldId = el && (el.id || el.name);
  return !!(
    fieldId &&
    typeof AutomationPauseController !== 'undefined' &&
    AutomationPauseController.isFieldProtected(fieldId)
  );
}

// React keeps its own copy of a controlled input's value, so the write goes
// through the native setter first; if React renders its value straight back, the
// element's own onChange prop is invoked so application state moves too.
async function fillLockedInput(el, value) {
  if (!el) return false;
  if (isFieldProtected(el)) {
    console.log(`[Automation] 🛡️ Skipping protected field: ${el.id || el.name}`);
    return true;
  }
  const nextValue = value == null ? '' : String(value);
  unlockInput(el);
  fillInput(el, nextValue);
  await wait(150);
  if (String(el.value || '') === nextValue) return true;

  const props = getReactProps(el);
  if (props && typeof props.onChange === 'function') {
    setNativeInputValue(el, nextValue);
    const event = new Event('change', { bubbles: true });
    Object.defineProperty(event, 'target', { value: el });
    Object.defineProperty(event, 'currentTarget', { value: el });
    props.onChange(event);
    await wait(150);
  }
  return String(el.value || '') === nextValue;
}

// Setting .checked directly is invisible to React, and the portal paints its
// label over the box so a click on the label can miss. Click the input itself and
// fall back to the component's handler when React never saw the click.
async function setCheckboxChecked(el, checked) {
  if (!el) return false;
  const want = !!checked;
  if (!!el.checked === want) return true;
  if (isFieldProtected(el)) {
    console.log(`[Automation] 🛡️ Skipping protected field: ${el.id || el.name}`);
    return true;
  }
  unlockInput(el);
  el.scrollIntoView({ block: 'center' });
  el.click();
  await wait(150);
  if (!!el.checked === want) return true;

  const props = getReactProps(el);
  if (props && typeof props.onChange === 'function') {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
    if (setter) setter.call(el, want);
    else el.checked = want;
    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: el });
    Object.defineProperty(event, 'currentTarget', { value: el });
    props.onChange(event);
    await wait(150);
  }
  return !!el.checked === want;
}

async function typeIntoInput(el, value, options = {}) {
  if (!el) return false;

  const fieldId = el.id || el.name;
  if (fieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(fieldId)) {
    console.log(`[Automation] 🛡️ Skipping protected field: ${fieldId}`);
    return false;
  }

  const nextValue = value == null ? '' : String(value);
  const { perKeyDelay = 60, clearDelay = 60, blur = true } = options;

  el.focus();
  el.click();
  await wait(50);

  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
  if (typeof el.select === 'function') {
    el.select();
  }
  if (typeof el.setSelectionRange === 'function') {
    const valueLength = String(el.value || '').length;
    el.setSelectionRange(0, valueLength);
  }
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
  await wait(clearDelay);

  if (String(el.value || '').length > 0) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    setNativeInputValue(el, '');
    try {
      el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
    } catch (_error) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
    await wait(clearDelay);
  }

  let currentValue = String(el.value || '');
  for (const char of nextValue) {
    const code = /^[0-9]$/.test(char) ? `Digit${char}` : undefined;
    const beforeValue = String(el.value || currentValue);
    const desiredValue = beforeValue + char;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, code, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, code, bubbles: true }));

    await wait(10);
    currentValue = String(el.value || beforeValue);
    if (currentValue !== desiredValue) {
      currentValue = desiredValue;
      setNativeInputValue(el, currentValue);
    }

    try {
      el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
    } catch (_error) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, code, bubbles: true }));
    await wait(perKeyDelay);
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (blur) {
    el.blur();
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  return true;
}

function findElementByText(tagName, text, root) {
  const searchText = (text || '').toLowerCase().trim();
  const els = (root || document).querySelectorAll(tagName);
  for (const el of els) {
    if (el.textContent.trim().toLowerCase().includes(searchText)) return el;
  }
  return null;
}

/**
 * Poll until element is found or timeout. Returns the element or null.
 */
function waitForElement(selector, options = {}) {
  const { timeoutMs = 8000, root = document } = options;
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      const el = root.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, 150);
    }
    check();
  });
}

function waitForButtonEnabled(buttonSelectorOrText, timeoutMs = 8000, root = document) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      let btn = null;
      const isSelector = /^[#.\[]/.test(buttonSelectorOrText) || buttonSelectorOrText.includes(' ');
      if (isSelector) {
        btn = root.querySelector(buttonSelectorOrText);
      } else {
        btn = findElementByText('button', buttonSelectorOrText, root);
      }
      if (!btn) {
        btn = findElementByText('button', 'Continue', root) || findElementByText('button', 'Next', root);
      }
      if (btn && !btn.disabled) {
        resolve(btn);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(btn);
        return;
      }
      setTimeout(check, 200);
    }
    check();
  });
}

/**
 * Scroll to the bottom of the page smoothly.
 */
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/**
 * Wait until all skeleton loading placeholders (.p-skeleton) disappear.
 * The Oriental site uses PrimeNG skeletons while API data loads.
 * The Continue button is visible even during skeleton state — so we must
 * wait for skeletons to be gone before interacting.
 * Also checks for common spinner selectors as a fallback.
 */
function waitForSkeletonsToDisappear(timeoutMs = 15000) {
  const loadingSelectors = [
    '.p-skeleton',
    '.p-progress-spinner',
    '.spinner',
    '.loading-spinner',
    '.loader',
    '.p-blockui',
    '.overlay',
    '.loading-overlay'
  ];
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      // Rendered plan cards mean the slide is ready even if a decorative
      // skeleton is still in the DOM.
      const planCardsVisible = Array.from(document.querySelectorAll('.choose-plan'))
        .some((el) => isElementVisible(el));
      const stillLoading = planCardsVisible ? false : loadingSelectors.some(sel => {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (isElementVisible(el)) return true;
        }
        return false;
      });
      if (!stillLoading) {
        console.log('✅ Skeletons/spinners cleared');
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        console.log('⚠️ Skeletons did not disappear within timeout');
        resolve(false);
        return;
      }
      setTimeout(check, 400);
    }
    // Initial delay to let skeletons appear first
    setTimeout(check, 400);
  });
}

/**
 * Wait until the NDP dialog (popup-form / p-dialog) is fully closed/removed.
 */
function waitForDialogToClose(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      const dialog = document.querySelector('.p-dialog');
      // Dialog gone or has leave animation class
      if (!dialog || dialog.classList.contains('p-dialog-leave') || dialog.offsetParent === null) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        console.log('⚠️ Dialog did not close within timeout');
        resolve(false);
        return;
      }
      setTimeout(check, 300);
    }
    setTimeout(check, 300);
  });
}

const ORIENTAL_PAGE_ALERT_ATTR = 'data-oriental-last-alert';
const ORIENTAL_PAGE_ALERT_BRIDGE_ATTR = 'data-oriental-alert-bridge';
const ORIENTAL_OTP_MEMORY_KEY = 'oriental_otp_memory';
const ORIENTAL_OTP_MEMORY_TTL_MS = 2 * 60 * 60 * 1000;

function ensureOrientalPageAlertInterceptor() {
  const root = document.documentElement;
  if (!root || root.getAttribute(ORIENTAL_PAGE_ALERT_BRIDGE_ATTR) === '1') {
    return;
  }

  const script = document.createElement('script');
  script.textContent = `
    (() => {
      if (window.__orientalAlertBridgeInstalled) return;
      window.__orientalAlertBridgeInstalled = true;
      const attrName = ${JSON.stringify(ORIENTAL_PAGE_ALERT_ATTR)};
      const publish = (type, message) => {
        try {
          const payload = JSON.stringify({
            type,
            message: String(message == null ? '' : message),
            ts: Date.now()
          });
          document.documentElement.setAttribute(attrName, payload);
        } catch (_error) {
          // ignore serialization errors
        }
      };

      window.alert = function(message) {
        publish('alert', message);
        console.warn('[Oriental alert suppressed]', message);
        return undefined;
      };
    })();
  `;

  (document.documentElement || document.head || document.body).appendChild(script);
  script.remove();
  root.setAttribute(ORIENTAL_PAGE_ALERT_BRIDGE_ATTR, '1');
}

function readOrientalPageAlert() {
  const raw = document.documentElement?.getAttribute(ORIENTAL_PAGE_ALERT_ATTR);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearOrientalPageAlert() {
  document.documentElement?.removeAttribute(ORIENTAL_PAGE_ALERT_ATTR);
}

function matchesOrientalAlertMessage(message, patterns = []) {
  const text = String(message || '').trim().toLowerCase();
  return patterns.some((pattern) => text.includes(String(pattern || '').trim().toLowerCase()));
}

async function waitForOrientalPageAlert(patterns, timeoutMs = 4000, afterTs = 0) {
  ensureOrientalPageAlertInterceptor();
  const start = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const alertRecord = readOrientalPageAlert();
      if (alertRecord && Number(alertRecord.ts || 0) > Number(afterTs || 0) && matchesOrientalAlertMessage(alertRecord.message, patterns)) {
        clearOrientalPageAlert();
        resolve(alertRecord);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

function getRememberedOtpEntries() {
  try {
    const raw = sessionStorage.getItem(ORIENTAL_OTP_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && (now - Number(entry.ts || 0)) < ORIENTAL_OTP_MEMORY_TTL_MS);
  } catch {
    return [];
  }
}

function saveRememberedOtpEntries(entries) {
  sessionStorage.setItem(ORIENTAL_OTP_MEMORY_KEY, JSON.stringify((entries || []).slice(-20)));
}

function rememberOtpInMemory(otpData, status = 'used') {
  if (!otpData?.otp && !otpData?.id && !otpData?._id) return;
  const otp = String(otpData?.otp || '').trim();
  const otpId = otpData?.id || otpData?._id || null;
  const existingEntries = getRememberedOtpEntries().filter((entry) => {
    if (otpId && entry.id === otpId) return false;
    if (otp && entry.otp === otp) return false;
    return true;
  });

  existingEntries.push({
    id: otpId,
    otp,
    status,
    ts: Date.now(),
  });

  saveRememberedOtpEntries(existingEntries);
}

function isOtpRemembered(otpData) {
  const otp = String(otpData?.otp || '').trim();
  const otpId = otpData?.id || otpData?._id || null;
  return getRememberedOtpEntries().some((entry) => {
    if (otpId && entry.id && entry.id === otpId) return true;
    if (otp && entry.otp && entry.otp === otp) return true;
    return false;
  });
}

function clearRememberedOtpEntries() {
  sessionStorage.removeItem(ORIENTAL_OTP_MEMORY_KEY);
}

async function setOtpSinceTimestampNow() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await new Promise((resolve) => {
    chrome.storage.local.set({ otpSinceTimestamp: Date.now() }, resolve);
  });
}

async function waitForOtpFailureSignal(timeoutMs = 5000, afterTs = 0) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = async () => {
      const alertRecord = readOrientalPageAlert();
      if (alertRecord && Number(alertRecord.ts || 0) > Number(afterTs || 0)
        && matchesOrientalAlertMessage(alertRecord.message, ['otp verification failed', 'please fill the form again'])) {
        clearOrientalPageAlert();
        resolve({ type: 'alert', message: alertRecord.message });
        return;
      }

      if (isOtpInvalid()) {
        resolve({ type: 'dom', message: 'Invalid OTP' });
        return;
      }

      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }

      setTimeout(check, 200);
    };
    check();
  });
}

/**
 * Find a visible, enabled button whose text contains the given string
 * (case-insensitive). Specifically targets .policy-btn inside
 * .policy-form-footer first (the real Continue on the Oriental form),
 * then falls back to any button matching the text.
 * Polls until found + enabled or timeout.
 */
function waitForContinueButton(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      // Prefer the exact .policy-btn inside the active slide
      const activeSlide = document.querySelector('.slick-slide.slick-active .policy-form-footer');
      if (activeSlide) {
        const btn = activeSlide.querySelector('button.policy-btn, button.Confirm-Continue-btn');
        if (btn && !btn.disabled) {
          resolve(btn);
          return;
        }
      }
      // Fallback: any .policy-btn
      const policyBtn = document.querySelector('.policy-form-footer button.policy-btn, .payment-section .Confirm-Continue-btn, .payment-section button[type="submit"]');
      if (policyBtn && !policyBtn.disabled) {
        resolve(policyBtn);
        return;
      }
      // Last resort: button containing "continue"
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt.includes('continue') && !btn.disabled && !btn.closest('.p-dialog')) {
          resolve(btn);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        const fallback = document.querySelector('.policy-form-footer button.policy-btn, .payment-section .Confirm-Continue-btn, .payment-section button[type="submit"]') || findElementByText('button', 'Continue');
        resolve(fallback || null);
        return;
      }
      setTimeout(check, 300);
    }
    check();
  });
}

// async function searchAndSelectDropdown(inputEl, searchText, logger = () => {}) {
//   if (!inputEl || !searchText) return;
//   fillInput(inputEl, searchText);
//   await wait(800);
//   const option = document.querySelector('.p-dropdown-panel [role="option"], .p-autocomplete-panel [role="option"], li[role="option"]');
//   if (option) {
//     clickElement(option);
//     logger('Selected option:', searchText);
//   }
// }
async function selectPrimeDropdown(dropdownSelector, value, isExactMatch = false) {
  const dropdown = document.querySelector(dropdownSelector);
  if (!dropdown) return;

  clickElement(dropdown);
  await wait(500);

  let panel = document.querySelector('.p-dropdown-panel');
  for (let i = 0; i < 10 && !panel; i++) {
    await wait(200);
    panel = document.querySelector('.p-dropdown-panel');
  }
  if (!panel) return;

  const filter = panel.querySelector('.p-dropdown-filter');
  if (filter) {
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(filter, value);
    else filter.value = value;
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(500);
  }

  // Re-query options after filter
  const options = panel.querySelectorAll('.p-dropdown-item');
  
  // First pass: Try exact match (== comparison) to avoid "petrol" matching "petrol+cng"
  let exactMatch = null;
  for (const option of options) {
    if (option.innerText.trim().toLowerCase() === value.toLowerCase()) {
      exactMatch = option;
      break;
    }
  }
  
  // If exact match found, use it
  if (exactMatch) {
    clickElement(exactMatch);
    await wait(800);
    return;
  }
  
  // Second pass: Only if no exact match, try loose matching (includes)
  if (!isExactMatch) {
    for (const option of options) {
      if (option.innerText.toLowerCase().includes(value.toLowerCase())) {
        clickElement(option);
        break;
      }
    }
  }
  await wait(800);
}

async function fillPrimeDropdownByLabel(labelText, value) {

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function click(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function getDropdownByLabel(labelText) {
    const labels = document.querySelectorAll('.detailsForm-insurance label');

    for (const label of labels) {
      if (label.innerText.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const container = label.closest('.float-label-form');
        if (container) {
          return container.querySelector('.p-dropdown');
        }
      }
    }
    return null;
  }

  const dropdown = getDropdownByLabel(labelText);
  if (!dropdown) {
    console.log("Dropdown not found:", labelText);
    return;
  }

  click(dropdown);
  await wait(500);

  const panel = document.querySelector('.p-dropdown-panel');
  if (!panel) return;

  const filter = panel.querySelector('.p-dropdown-filter');

  if (filter) {
    filter.value = value;
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
  }

  const options = panel.querySelectorAll('.p-dropdown-item');

  for (const option of options) {
    if (option.innerText.trim().toLowerCase().includes(value.toLowerCase())) {
      click(option);
      break;
    }
  }

  await wait(800);
}

async function getUploadFileById(id, fileName = "upload.jpg", mimeType = "image/jpeg") {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    throw new Error('Invalid file id');
  }
  const url = `https://instapolicy.coverscrafter.com/v1/uploads/${id.trim()}`;
  const result = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'FETCH_UPLOAD', url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.success) {
        reject(new Error(response?.error || 'Fetch failed'));
      } else {
        resolve(response.buffer);
      }
    });
  });
  const file = new File([result], ensureFileNameHasExtension(fileName, mimeType), { type: mimeType });
  return file;
}

function resolveInputElement(selectorOrSelectors) {
  const selectors = Array.isArray(selectorOrSelectors) ? selectorOrSelectors : [selectorOrSelectors];
  for (const selector of selectors) {
    if (!selector) continue;
    const input = document.querySelector(selector);
    if (input) return input;
  }
  return null;
}

function looksLikeBase64Payload(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:')) return true;
  if (trimmed.length < 512) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

function getExtensionForMimeType(mimeType = '') {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('pdf')) return '.pdf';
  if (normalized.includes('jpg') || normalized.includes('jpeg')) return '.jpg';
  return '.bin';
}

function ensureFileNameHasExtension(fileName, mimeType) {
  if (/\.[a-z0-9]+$/i.test(fileName)) return fileName;
  return fileName + getExtensionForMimeType(mimeType);
}

function createFileFromBase64(dataValue, fileName = "upload.jpg", fallbackMimeType = "image/jpeg") {
  const trimmed = dataValue.trim();
  let mimeType = fallbackMimeType;
  let base64 = trimmed;

  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || fallbackMimeType;
    base64 = dataUrlMatch[2];
  }

  const cleaned = base64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], ensureFileNameHasExtension(fileName, mimeType), { type: mimeType });
}

async function resolveUploadFile(uploadSource, fileName = "upload.jpg", mimeType = "image/jpeg") {
  if (!uploadSource) return null;
  if (uploadSource instanceof File) return uploadSource;

  if (typeof uploadSource === 'object' && !Array.isArray(uploadSource)) {
    const nextFileName = uploadSource.fileName || fileName;
    const nextMimeType = uploadSource.mimeType || mimeType;

    if (uploadSource.file instanceof File) return uploadSource.file;
    if (typeof uploadSource.dataUrl === 'string' && uploadSource.dataUrl.trim()) {
      return createFileFromBase64(uploadSource.dataUrl, nextFileName, nextMimeType);
    }
    if (typeof uploadSource.base64 === 'string' && uploadSource.base64.trim()) {
      return createFileFromBase64(uploadSource.base64, nextFileName, nextMimeType);
    }
    if (typeof uploadSource.fileId === 'string' && uploadSource.fileId.trim()) {
      return getUploadFileById(uploadSource.fileId, nextFileName, nextMimeType);
    }
    return null;
  }

  if (typeof uploadSource === 'string') {
    const trimmed = uploadSource.trim();
    if (!trimmed) return null;
    if (looksLikeBase64Payload(trimmed)) {
      return createFileFromBase64(trimmed, fileName, mimeType);
    }
    return getUploadFileById(trimmed, fileName, mimeType);
  }

  return null;
}

async function selectUserType(type) {
  const options = document.querySelectorAll('.item-tpa');

  for (const option of options) {
    if (option.innerText.trim().toLowerCase() === type.toLowerCase()) {
      option.click();
      console.log("Selected:", type);
      break;
    }
  }
}

async function uploadFile(selectorOrSelectors, uploadSource, fileName = "upload.jpg", mimeType = "image/jpeg") {
  const input = resolveInputElement(selectorOrSelectors);
  if (!input) {
    console.log("File input not found:", selectorOrSelectors);
    return false;
  }

  const uploadConfig = uploadSource && typeof uploadSource === 'object' && !Array.isArray(uploadSource) && !(uploadSource instanceof File)
    ? uploadSource
    : null;
  const nextFileName = uploadConfig?.fileName || fileName;
  const nextMimeType = uploadConfig?.mimeType || mimeType;
  const res = await resolveUploadFile(uploadSource, nextFileName, nextMimeType);
  if (!res) {
    console.log("❌ File not found:", uploadSource);
    return false;
  }

  const minimumBytes = Number(uploadConfig?.minimumBytes) || 0;
  if (minimumBytes && res.size < minimumBytes) {
    console.log(`⚠️ Upload file may be rejected: ${res.name} is ${(res.size / 1024).toFixed(1)} KB, minimum required is ${(minimumBytes / 1024).toFixed(0)} KB`);
  }

  const dt = new DataTransfer();
  dt.items.add(res);
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  console.log(`✅ File uploaded: ${res.name} (${(res.size / 1024).toFixed(1)} KB)`);
  return true;
}

function uploadFileObject(selectorOrSelectors, file) {
  const input = resolveInputElement(selectorOrSelectors);
  if (!input) {
    console.log("File input not found:", selectorOrSelectors);
    return false;
  }
  if (!(file instanceof File)) {
    console.log("❌ Invalid file object:", file);
    return false;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  console.log("✅ File uploaded (direct):", file.name);
  return true;
}

function generateForm60Pdf(form60Data) {
  const d = form60Data;
  const fullName = [d.firstName, d.middleName, d.surname].filter(Boolean).join(' ');
  const fatherName = [d.fatherFirstName, d.fatherMiddleName, d.fatherSurname].filter(Boolean).join(' ');

  const textItems = [];
  let y = 750;
  const addLine = (text, size = 10, x = 50) => {
    textItems.push({ text, x, y, size });
    y -= (size + 4);
  };
  const addField = (label, value) => {
    addLine(label + ': ' + (value || ''));
  };

  addLine('FORM NO. 60', 16, 230);
  addLine('[See second proviso to rule 114B]', 9, 190);
  addLine('', 6);
  addLine('Declaration to be filed by a person who does not have', 10, 100);
  addLine('a Permanent Account Number (PAN)', 10, 180);
  addLine('', 10);
  addField('1. Full Name', fullName);
  addField('2. Date of Birth', d.dateOfBirth || '');
  addField("3. Father's Name", fatherName);
  addField('4. Address', '');
  addField('   Flat/Room No', d.flatRoomNo || '');
  addField('   Road/Street/Lane', d.roadStreetLane || '');
  addField('   Area/Locality', d.areaLocality || '');
  addField('   Town/City', d.townCity || '');
  addField('   District', d.district || '');
  addField('   State', d.state || '');
  addField('   Pin Code', d.pinCode || '');
  addField('5. Telephone/Mobile', d.mobileNumber || d.telephoneNumber || '');
  addField('6. Amount of Transaction', String(d.amountOfTransaction || ''));
  addField('7. Date of Transaction', d.dateOfTransaction || '');
  addField('8. Aadhaar Number', d.aadhaarNumber || '');
  addLine('', 10);
  addField('Place', d.place || '');
  addField('Date', d.signatureDate || '');

  let streamContent = '';
  for (const item of textItems) {
    const escaped = item.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    streamContent += 'BT /F1 ' + item.size + ' Tf ' + item.x + ' ' + item.y + ' Td (' + escaped + ') Tj ET\n';
  }

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    '4 0 obj\n<< /Length ' + streamContent.length + ' >>\nstream\n' + streamContent + 'endstream\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }

  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += '0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  }

  pdf += 'trailer\n';
  pdf += '<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n';
  pdf += xrefOffset + '\n';
  pdf += '%%EOF';

  const blob = new Blob([pdf], { type: 'application/pdf' });
  return new File([blob], 'form60.pdf', { type: 'application/pdf' });
}

/**
 * Replaces the contents of a PrimeNG InputNumber (IDV, NDP discount,
 * underwriting discount).
 *
 * These are NOT plain inputs. Assigning through the native value setter only
 * changes the DOM; the component keeps its own model and re-renders from it
 * on the next keystroke, so the new digits land *after* the old ones - the
 * portal pre-fills IDV with its maximum, and typing 62416 over 67468 gives
 * 6746862416. Clearing through execCommand runs a real editing operation, so
 * the component's model is cleared along with the DOM.
 */
async function setPrimeInputNumberValue(input, value) {
  if (!input) return false;

  const fieldId = input.id || input.name;
  if (fieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(fieldId)) {
    console.log('[Automation] Skipping protected field: ' + fieldId);
    return false;
  }

  const digitsOf = (text) => String(text == null ? '' : text).replace(/[^\d.]/g, '');
  const desired = String(value == null ? '' : value).trim();
  const desiredDigits = digitsOf(desired);

  // Leave a field that already holds the right value completely alone.
  // Clearing and retyping risks desynchronising PrimeNG's internal model from
  // the DOM, and then Submit silently does nothing - which is how the NDP
  // dialog ended up staying open with a field that visibly read 40.
  if (digitsOf(input.value) === desiredDigits) {
    console.log('setPrimeInputNumberValue: already ' + desired + ', leaving it as is');
    return true;
  }

  input.focus();
  input.click();
  await wait(50);

  const pressKey = (key, code) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keypress', { key, code, bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true, cancelable: true }));
  };

  // Clear with real Backspace keys first: PrimeNG InputNumber drives its own
  // model from keydown, so key events keep model and DOM in step. A native
  // value setter only moves the DOM, and the component then re-renders its
  // old value on the next keystroke - that is what appended the requested IDV
  // onto the portal's pre-filled maximum.
  for (let i = 0; i < 40 && String(input.value || '').length > 0; i++) {
    input.setSelectionRange?.(String(input.value || '').length, String(input.value || '').length);
    pressKey('Backspace', 'Backspace');
    await wait(30);
  }

  // Fall back to an editing command if the component swallowed the keys.
  if (String(input.value || '').length > 0) {
    try {
      input.select();
      document.execCommand('delete');
    } catch (_error) {
      // Nothing more to try; the verification below will catch it.
    }
    await wait(100);
    if (String(input.value || '').length > 0) {
      setNativeInputValue(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(100);
    }
  }

  // Type per keystroke, again so the component builds its own value.
  for (const char of desired) {
    const code = /^[0-9]$/.test(char) ? 'Digit' + char : undefined;
    pressKey(char, code);
    if (digitsOf(input.value).length < digitsOf(desired.slice(0, desired.indexOf(char) + 1)).length) {
      // The component ignored the key; nudge it with an input event.
      try {
        input.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
      } catch (_error) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    await wait(60);
  }

  // Last resort for components that take neither.
  if (digitsOf(input.value) !== desiredDigits) {
    try {
      input.select();
      document.execCommand('insertText', false, desired);
    } catch (_error) {
      setNativeInputValue(input, desired);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(150);
  }

  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.blur();
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  await wait(250);

  const actual = digitsOf(input.value) || digitsOf(input.getAttribute('aria-valuenow'));
  const matched = actual === desiredDigits;
  console.log('setPrimeInputNumberValue: wanted ' + desired + ', field now "' + input.value + '"'
    + (matched ? '' : ' (MISMATCH)'));
  return matched;
}

/**
 * Drives a PrimeNG autocomplete (Vehicle Brand / Model / Variant).
 *
 * Mirrors handlePrimeAutocomplete in the Playwright target: type per
 * keystroke, wait out the search spinner, and require a real text match.
 * Returns the selected option text.
 */
async function selectPrimeAutocomplete(inputSelector, value) {
  if (!value) {
    console.log('selectPrimeAutocomplete: no value provided');
    return false;
  }

  let input = null;
  const inputDeadline = Date.now() + 10000;
  while (Date.now() < inputDeadline) {
    input = document.querySelector(inputSelector);
    if (input) break;
    await wait(150);
  }
  if (!input) {
    throw new Error('Autocomplete input not found: ' + inputSelector);
  }

  const searchText = String(value).trim();

  // Clear through real key events. Assigning el.value only changes the DOM:
  // PrimeNG can restore its old model when the next search starts, which
  // appends a retry to the previous search text.
  input.focus();
  input.click();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
  if (typeof input.select === 'function') input.select();
  setNativeInputValue(input, '');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
  try {
    input.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
  } catch (_error) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
  await wait(200);

  // Type once, per keystroke: the search fires on each key, not on a bulk set.
  await typeIntoInput(input, searchText, { perKeyDelay: 50, blur: false });

  // Let the search API answer and its spinner clear.
  const spinnerDeadline = Date.now() + 10000;
  while (Date.now() < spinnerDeadline) {
    const spinner = document.querySelector('.p-icon-spin, .p-autocomplete-loader, .p-progress-spinner');
    if (!spinner || !isElementVisible(spinner)) break;
    await wait(200);
  }
  // Oriental offers manual entry when the vehicle is not in its catalogue.
  // Its wording uses a typographic apostrophe, so match the part without one.
  const findManualPrompt = () => Array.from(document.querySelectorAll('.p-dialog')).find((dialog) => {
    if (!isElementVisible(dialog)) return false;
    const text = String(dialog.textContent || '').toLowerCase();
    return text.includes('find your vehicle') || text.includes('enter the details manually');
  });

  // Poll for the suggestions: PrimeNG renders the panel before its async
  // options arrive, and the option rows are not always given the
  // .p-autocomplete-item class - plain <li>s inside the panel are common.
  const collectItems = () => {
    const panels = Array.from(document.querySelectorAll('.p-autocomplete-panel, .p-dropdown-panel'))
      .filter((panel) => isElementVisible(panel));
    const found = [];
    for (const panel of panels) {
      for (const item of panel.querySelectorAll('.p-autocomplete-item, .p-dropdown-item, li[role="option"], li')) {
        // Skip wrappers that merely contain other option rows.
        if (item.querySelector('li')) continue;
        if (!isElementVisible(item)) continue;
        if (!String(item.textContent || '').trim()) continue;
        found.push(item);
      }
    }
    if (found.length > 0) return found;
    // Panel markup varies by portal build; fall back to a document-wide look.
    return Array.from(document.querySelectorAll('.p-autocomplete-item, .p-dropdown-item'))
      .filter((item) => isElementVisible(item));
  };

  // A search answers with either suggestions or the manual-entry dialog, so poll
  // for both: checking the dialog once, after a fixed pause, misses it whenever
  // the portal renders it a moment later and sends the run into this 12s wait.
  let items = [];
  const itemsDeadline = Date.now() + 12000;
  while (Date.now() < itemsDeadline) {
    if (findManualPrompt()) {
      throw new Error('MANUAL_VEHICLE_PROMPT: Oriental has no catalogue entry for "' + searchText + '"');
    }
    items = collectItems();
    if (items.length > 0) break;
    await wait(250);
  }

  if (items.length === 0) {
    throw new Error('Vehicle model "' + searchText + '" not found: no autocomplete options returned');
  }

  const itemText = (item) => String(item.textContent || '').trim();
  const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lowerValue = searchText.toLowerCase();
  const normalizedValue = normalize(searchText);

  // Exact match, then one that ignores punctuation and spacing differences.
  let match = items.find((item) => itemText(item).toLowerCase() === lowerValue)
    || items.find((item) => normalize(itemText(item)) === normalizedValue);

  // No first-item fallback: picking the nearest option silently books a
  // different variant than the one that was quoted.
  if (!match) {
    throw new Error('Model not found (100% match required): "' + searchText
      + '". Portal offered: ' + items.map(itemText).join(' | '));
  }

  const selectedText = itemText(match);
  // The row can carry the click handler on an inner element, so send a full
  // mouse sequence rather than relying on a bare .click().
  match.scrollIntoView({ block: 'center' });
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    match.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  match.click();

  // Confirm the panel closed and the input kept a value.
  const closeDeadline = Date.now() + 3000;
  while (Date.now() < closeDeadline) {
    if (collectItems().length === 0) break;
    await wait(150);
  }
  await wait(300);

  if (!String(input.value || '').trim()) {
    throw new Error('Vehicle model "' + searchText + '" selection failed: the input is empty after clicking the option');
  }
  console.log('Selected autocomplete item:', selectedText);
  return selectedText;
}

// ─── Manual vehicle entry ───────────────────────────────────────────────────
//
// Oriental offers "enter the details manually" when a vehicle is not in its
// catalogue. The quote still goes through, but the portal then routes the
// proposal to Maker-Checker approval by the issuing office. Mirrors
// fillManualVehicleDetails in the Playwright target.

function findVisibleDialog(predicate) {
  return Array.from(document.querySelectorAll('.p-dialog')).find(
    (dialog) => isElementVisible(dialog) && predicate(dialog)
  ) || null;
}

function findManualVehiclePrompt() {
  // Oriental's wording uses a typographic apostrophe, so match the part without one.
  return findVisibleDialog((dialog) => {
    const text = String(dialog.textContent || '').toLowerCase();
    return text.includes('find your vehicle') || text.includes('enter the details manually');
  });
}

function findManualVehicleForm() {
  // Identify the Add Details dialog by a field it has to contain rather than by
  // its title, which is rendered after the dialog opens.
  return findVisibleDialog((dialog) => !!dialog.querySelector('input[name="cubicCapacity"]'));
}

async function fillManualVehicleDetails(v, logger = console.log) {
  // The portal drops the first click on Proceed often enough that a single
  // attempt fails the quote while the prompt is still sitting there.
  let form = findManualVehicleForm();
  for (let attempt = 1; attempt <= 3 && !form; attempt++) {
    const prompt = findManualVehiclePrompt();
    if (prompt) {
      const proceed = Array.from(prompt.querySelectorAll('button.footer-red, button'))
        .find((btn) => /proceed/i.test(btn.textContent || ''));
      if (proceed) clickElement(proceed);
    }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !form) {
      await wait(200);
      form = findManualVehicleForm();
    }
  }
  if (!form) {
    throw new Error('Oriental did not open its Add Details dialog after the manual vehicle entry prompt');
  }
  logger('Add Details dialog open - entering the vehicle manually');

  // Make is a PrimeNG autocomplete: it only searches on real keystrokes, so
  // setting the value leaves the field populated with no suggestion list.
  const makeInput = form.querySelector('input[name="make"]');
  if (!makeInput) throw new Error('Add Details dialog has no Make field');
  if (!v.make) throw new Error('vehicleDetails.make is required for manual vehicle entry');
  await typeIntoInput(makeInput, v.make, { perKeyDelay: 60, blur: false });

  const makeLoaderVisible = () => {
    const wrapper = makeInput.closest('.carmodelclass') || form;
    const loader = wrapper.querySelector('.p-autocomplete-loader');
    return !!loader && isElementVisible(loader);
  };
  const loaderDeadline = Date.now() + 15000;
  while (Date.now() < loaderDeadline && makeLoaderVisible()) await wait(200);

  const wantedMake = String(v.make).trim().toLowerCase();
  const collectMakeOptions = () =>
    Array.from(document.querySelectorAll('.p-autocomplete-item, .p-autocomplete-option'))
      .filter((item) => isElementVisible(item));
  const findMakeOption = () =>
    collectMakeOptions().find((item) => String(item.textContent || '').trim().toLowerCase() === wantedMake) || null;
  const waitForMakeOption = async () => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const option = findMakeOption();
      if (option) return option;
      await wait(200);
    }
    return null;
  };

  let makeOption = await waitForMakeOption();
  if (!makeOption) {
    // The field carries a dropdown button that lists every make the portal
    // knows, which also covers a search that returned nothing.
    const dropdownBtn = form.querySelector('button.p-autocomplete-dropdown');
    if (dropdownBtn) clickElement(dropdownBtn);
    makeOption = await waitForMakeOption();
  }
  if (!makeOption) {
    const available = collectMakeOptions()
      .map((item) => String(item.textContent || '').trim())
      .filter(Boolean);
    throw new Error(
      'Oriental does not list the make "' + v.make + '" for manual vehicle entry'
      + (available.length ? '. Available: ' + available.slice(0, 15).join(', ') : '')
    );
  }

  // The row can carry the click handler on an inner element, so send a full
  // mouse sequence rather than relying on a bare .click().
  makeOption.scrollIntoView({ block: 'center' });
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    makeOption.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  await wait(400);

  // The dialog only validates a field once it has been touched, and Continue
  // stays disabled until every field validates - so each one is focused,
  // filled and blurred rather than just assigned.
  const fillField = (name, value) => {
    const field = form.querySelector('input[name="' + name + '"]');
    if (!field) throw new Error('Add Details dialog has no "' + name + '" field');
    fillInput(field, value);
  };

  fillField('model', v.model);
  fillField('variant', v.variant);
  fillField('seatingCapacity', String(v.seatingCapacity == null ? 2 : v.seatingCapacity));

  const capacity = v.cubicCapacity != null ? v.cubicCapacity
    : (v.motorCapacityKw != null ? v.motorCapacityKw : v.motorCapacity);
  if (capacity == null || String(capacity).trim() === '') {
    throw new Error('vehicleDetails.cubicCapacity is required for manual vehicle entry');
  }
  fillField('cubicCapacity', String(capacity));

  if (v.msp == null || String(v.msp).trim() === '') {
    throw new Error('vehicleDetails.msp is required for manual vehicle entry (the portal asks for the IDV)');
  }
  fillField('idv', String(v.msp));

  // Oriental keeps Continue disabled until every field passes validation, and
  // writes the reason into the per-field .error-msg elements.
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) throw new Error('Add Details dialog has no Continue button');
  const enabledBy = Date.now() + 15000;
  while (submitBtn.disabled) {
    if (Date.now() > enabledBy) {
      const errors = Array.from(form.querySelectorAll('.error-msg'))
        .map((el) => String(el.textContent || '').trim())
        .filter(Boolean);
      throw new Error(
        'Oriental kept the Add Details Continue button disabled'
        + (errors.length ? ': ' + errors.join('; ') : '')
      );
    }
    await wait(250);
  }
  clickElement(submitBtn);

  const closeBy = Date.now() + 15000;
  while (Date.now() < closeBy) {
    if (!findManualVehicleForm()) return true;
    await wait(250);
  }
  throw new Error('Oriental did not close its Add Details dialog after Continue');
}

/**
 * Fills a DD-MM-YYYY date field.
 *
 * Two things this must not do, both of which it used to:
 *  - assign input.value directly. React overrides the value setter and
 *    updates its change tracker, so the component never sees an edit and
 *    reverts on the next render. Go through the native setter instead.
 *  - silently fall back to today's date when the input cannot be parsed.
 *    On "Date of Purchase" that books the wrong policy start date without
 *    anybody noticing.
 */
function normalizeOrientalDate(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return null;

  const isValid = (dd, mm, yyyy) => {
    const d = new Date(yyyy, mm - 1, dd);
    return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
  };

  // DD-MM-YYYY / DD/MM/YYYY
  let match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const [dd, mm, yyyy] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (isValid(dd, mm, yyyy)) {
      return String(dd).padStart(2, '0') + '-' + String(mm).padStart(2, '0') + '-' + yyyy;
    }
    return null;
  }

  // YYYY-MM-DD (ISO), which the frontend sends for some fields.
  match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const [yyyy, mm, dd] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (isValid(dd, mm, yyyy)) {
      return String(dd).padStart(2, '0') + '-' + String(mm).padStart(2, '0') + '-' + yyyy;
    }
  }

  return null;
}

async function fillMuiDate(selector, dateValue) {
  const normalized = normalizeOrientalDate(dateValue);
  if (!normalized) {
    throw new Error('Invalid date "' + dateValue + '" for ' + selector + ' (expected DD-MM-YYYY)');
  }

  const input = document.querySelector(selector);
  if (!input) throw new Error('Date input not found: ' + selector);

  const dateFieldId = input.id || input.name || selector;
  if (dateFieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(dateFieldId)) {
    console.log('[Automation] Skipping protected date field: ' + dateFieldId);
    return false;
  }

  input.focus();
  input.click();
  setNativeInputValue(input, normalized);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  await wait(200);

  if (String(input.value || '').trim() !== normalized) {
    console.log('fillMuiDate: field reads "' + input.value + '" after writing ' + normalized);
  }
  return true;
}

async function selectYearOfManufacture(year, purchaseDate) {
  // const radiosVisible = await waitForElement('.p-radiobutton-box', { timeoutMs: 15000, root: document });
  // if (!radiosVisible) return;

  // get year from purchase date if provided
  if (!year && purchaseDate) {
    year = new Date(purchaseDate.split("-").reverse().join("-")).getFullYear();
  }

  // fallback to current year
  if (!year) {
    year = new Date().getFullYear();
  }

  const radio = document.querySelector('input[name="yearOfManufacture"][value="' + year + '"]');
  if (!radio) {
    throw new Error('Year of manufacture "' + year + '" not available (out of range or not found)');
  }

  // The radio input sits behind the PrimeNG radio box, so click the wrapping
  // label and verify Angular actually registered the selection.
  const label = radio.closest('label');
  clickElement(label || radio);
  await wait(200);
  if (!radio.checked) {
    clickElement(radio);
    await wait(200);
  }
  return radio.checked;
}

/**
 * Selects a Finance Type radio ("Hypothecation" / "Lease" / "Hire" / "None").
 * The slide always needs one picked - including "None" for an unfinanced
 * vehicle - or Continue stays disabled.
 */
function selectFinanceType(text) {
  const type = String(text || 'None').trim();

  const radio = document.querySelector('input[id="' + type + '"]')
    || document.querySelector('input[name="hypothecationType"][value="' + type + '"]')
    || document.querySelector('input[value="' + type + '"]');
  if (radio) {
    // Click the wrapping label when there is one: the radio itself sits behind
    // the PrimeNG radio box and does not always take a direct click.
    const label = radio.closest('label');
    clickElement(label || radio);
    if (!radio.checked) clickElement(radio);
    return radio.checked || Boolean(label);
  }

  const labels = document.querySelectorAll('.hypothecation-radios label');
  for (const label of labels) {
    const labelText = (label.querySelector('.car')?.innerText || label.innerText || '').trim();
    if (labelText.toLowerCase() === type.toLowerCase()) {
      clickElement(label);
      return true;
    }
  }

  console.log('Finance type not found:', type);
  return false;
}

// Kept so older call sites keep working.
function selectHypothecationByText(text) {
  return selectFinanceType(text);
}

function findAddonCard(addonName) {
  const searchName = String(addonName || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.choose-plan, .addon-item, .choose-offline-items');
  return [...cards].find((card) =>
    String(card.textContent || '').trim().toLowerCase().includes(searchName)) || null;
}

function isAddonApplied(card) {
  if (!card) return false;
  if (card.classList.contains('active') || card.classList.contains('selected')) return true;
  const btnText = String(card.querySelector('.handle-addons-btn')?.textContent || '').trim().toLowerCase();
  // The portal flips the button off "Add" once the cover is on the quote.
  return btnText !== '' && btnText !== 'add';
}

/**
 * Opens an add-on card's dialog.
 *
 * Returns { card, dialog, alreadyApplied }. The dialog element itself is
 * returned, not a boolean: `document.querySelector('.p-dialog')` picks the
 * FIRST dialog in the document, which is not necessarily the one that just
 * opened, and waiting on the wrong node makes a dialog that did close look
 * like one that never did.
 */
async function selectAddon(addonName) {
  let card = null;
  const cardDeadline = Date.now() + 15000;
  while (Date.now() < cardDeadline) {
    card = findAddonCard(addonName);
    if (card) break;
    await wait(250);
  }
  if (!card) {
    console.log('Addon card not found:', addonName);
    return null;
  }

  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(250);

  if (isAddonApplied(card)) {
    console.log('Addon already applied:', addonName);
    return { card, dialog: null, alreadyApplied: true };
  }

  const addBtn = card.querySelector('.handle-addons-btn');
  if (!addBtn) {
    console.log('Add button not found for:', addonName);
    return { card, dialog: null, alreadyApplied: false };
  }

  // Note which dialogs are already on screen so we can tell the new one apart.
  const preExisting = new Set(
    Array.from(document.querySelectorAll('.p-dialog')).filter((d) => isElementVisible(d))
  );
  const newDialog = () => Array.from(document.querySelectorAll('.p-dialog'))
    .find((d) => isElementVisible(d) && !preExisting.has(d)) || null;

  // Some add-ons apply straight away with no dialog at all, so accept either.
  await clickUntil(addBtn, async () => Boolean(newDialog()) || isAddonApplied(findAddonCard(addonName) || card), {
    attempts: 4,
    settleMs: 2500,
    label: 'Add (' + addonName + ')',
  });

  const opened = newDialog();
  if (opened) {
    console.log('Dialog opened for:', addonName);
    await wait(250);
    return { card, dialog: opened, alreadyApplied: false };
  }
  if (isAddonApplied(findAddonCard(addonName) || card)) {
    console.log('Addon applied without a dialog:', addonName);
    return { card, dialog: null, alreadyApplied: true };
  }

  console.log('Dialog did not open for:', addonName);
  return { card, dialog: null, alreadyApplied: false };
}

function isOtpInvalid() {
  const errorEl = document.querySelector('.signupOTPForm .error-msg');

  if (errorEl && errorEl.innerText.toLowerCase().includes('invalid otp')) {
    console.log("❌ OTP is Invalid");
    return true;
  }

  console.log("✅ OTP seems valid or not yet verified");
  return false;
}

// fetch otp via background script (avoids CORS, runs in extension context)
async function fetchOTP(attempt = 0, labelOverride = null) {
  ensureOrientalPageAlertInterceptor();
  const cfg = await new Promise((resolve) => {
    chrome.storage.local.get(['otpConfig'], (r) => resolve(r.otpConfig || {
      email: 'otpcoverscrafter@gmail.com',
      label: 'ORIENTAL_INSURANCE',
      apiBase: 'https://otpservice.coverscrafter.com/api/v1/otp'
    }));
  });
  if (!cfg.email || !cfg.apiBase) {
    throw new Error('OTP not configured. Right-click extension > Options.');
  }
  const label = labelOverride || cfg.label;
  let url = `${cfg.apiBase}/latest?label=${encodeURIComponent(label)}&mailbox_email=${encodeURIComponent(cfg.email)}`;
  console.log('🔗 OTP fetch URL:', url);
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'FETCH_OTP', url }, (resp) => {
      console.log('📨 OTP raw response:', JSON.stringify(resp));
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.success || !resp.data) {
        return reject(new Error(resp?.data?.message || resp?.error || 'No OTP'));
      }
      // Support both { data: { data: { otp, id } } } and { data: { otp, id } } / { data: { otp, _id } }
      const payload = resp.data.data && resp.data.data.otp != null ? resp.data.data : resp.data;
      const otp = payload?.otp;
      const id = payload?.id || payload?._id;
      if (otp == null) return reject(new Error(resp?.data?.message || resp?.error || 'No OTP'));
      resolve({ otp, id });
    });
  });
}

// mark otp as used (via background, same pattern as fetchOTP)
async function markOtpAsUsed(otpId) {
  const cfg = await new Promise((resolve) => {
    chrome.storage.local.get(['otpConfig'], (r) => resolve(r.otpConfig || {}));
  });
  if (!cfg.apiBase) {
    throw new Error('OTP not configured. Right-click extension > Options.');
  }
  const url = `${cfg.apiBase}/${otpId}/use`;
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'MARK_OTP_USED', url }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp && resp.success) resolve(resp.data);
      else reject(new Error(resp?.error || 'Mark OTP used failed'));
    });
  });
}

// Check if OTP dialog/inputs are still visible on the page
function isOtpDialogStillVisible() {
  const dialog = document.querySelector('#otp-dialog, .signupOTPForm');
  if (dialog && dialog.offsetParent !== null) return true;
  const otpInputs = document.querySelectorAll('input[name^="mobile"], input[name^="otp"], input[name^="digit"], .otpinput input, .otp-input input');
  return Array.from(otpInputs).some(inp => inp.offsetParent !== null);
}

// Timings mirror handleOtpDialog in the Playwright target so both paths wait
// the same amount for the same mailbox.
const ORIENTAL_OTP_CONFIG = {
  SERVICE_LABEL: 'ORIENTAL_INSURANCE',
  DECLARATION_SERVICE_LABEL: 'ORIENTAL_INSURANCE_DECLERATION',
  MAILBOX: 'otpcoverscrafter@gmail.com',
  RETRY_INTERVAL_MS: 10000,
  MAX_FETCH_ATTEMPTS: 5,
  // Declaration and Form 60 OTPs take noticeably longer to arrive.
  MAX_FETCH_ATTEMPTS_LONG: 15,
  MAX_VERIFY_ATTEMPTS: 2,
  MANUAL_POLL_MS: 500,
};

function otpFetchAttemptsFor(contextLabel) {
  const label = String(contextLabel || '').toLowerCase();
  return (label.includes('declaration') || label.includes('form 60'))
    ? ORIENTAL_OTP_CONFIG.MAX_FETCH_ATTEMPTS_LONG
    : ORIENTAL_OTP_CONFIG.MAX_FETCH_ATTEMPTS;
}

/**
 * Reads the latest OTP id BEFORE the portal is asked to send a new one.
 * Without this baseline the next fetch happily returns the previous OTP,
 * which the portal then rejects as invalid.
 */
async function captureLatestOtpId(labelOverride = null) {
  try {
    const latest = await fetchOTP(0, labelOverride);
    const id = latest?.id || latest?._id || null;
    console.log('OTP baseline id:', id);
    return id ? String(id) : null;
  } catch (_error) {
    // No baseline is fine; the first OTP that arrives is then accepted.
    return null;
  }
}

/**
 * Blocks until the operator fills the OTP themselves.
 *
 * Nothing here closes or clears the dialog: once automation has run out of
 * OTPs to try, the dialog is the operator's to finish.
 */
async function waitForManualOtpCompletion(contextLabel = 'OTP') {
  console.log('Waiting for manual ' + contextLabel + ' entry; the dialog is left open');
  if (typeof AutomationPauseController !== 'undefined') {
    await AutomationPauseController.checkpoint('Waiting for manual ' + contextLabel + ' entry');
  }
  let nextLog = Date.now() + 30000;
  while (true) {
    await wait(ORIENTAL_OTP_CONFIG.MANUAL_POLL_MS);
    if (!isOtpDialogStillVisible()) {
      console.log(contextLabel + ' dialog closed - filled manually');
      return { otp: '__MANUAL__', id: null, manualFill: true };
    }
    if (Date.now() >= nextLog) {
      console.log('Still waiting for manual ' + contextLabel + ' entry...');
      nextLog = Date.now() + 30000;
    }
  }
}

/**
 * Polls the OTP service on the automation's schedule, skipping any OTP that
 * is not newer than the baseline, and watching for a manual fill throughout.
 * It never gives up with an error: if no OTP arrives it hands the dialog to
 * the operator.
 */
async function fetchOTPWithRetry(options = {}) {
  const {
    labelOverride = null,
    contextLabel = 'OTP',
    previousOtpId = null,
    maxAttempts = otpFetchAttemptsFor(contextLabel),
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log('Attempt ' + attempt + '/' + maxAttempts + ' to retrieve the ' + contextLabel + ' OTP');
    try {
      const candidate = await fetchOTP(attempt, labelOverride);
      const candidateId = candidate?.id ? String(candidate.id) : null;

      if (previousOtpId && candidateId && candidateId === previousOtpId) {
        console.log('Skipping the OTP that was already there before this request');
      } else if (isOtpRemembered(candidate)) {
        console.log('Skipping a previously used or rejected OTP:', candidateId || candidate?.otp);
      } else if (candidate?.otp) {
        console.log('OTP retrieved:', candidate.otp);
        return candidate;
      }
    } catch (e) {
      console.log('Attempt ' + attempt + ' failed:', e?.message);
    }

    if (attempt < maxAttempts) {
      // Poll through the wait so a manual fill is noticed immediately.
      const waitUntil = Date.now() + ORIENTAL_OTP_CONFIG.RETRY_INTERVAL_MS;
      while (Date.now() < waitUntil) {
        await wait(ORIENTAL_OTP_CONFIG.MANUAL_POLL_MS);
        if (!isOtpDialogStillVisible()) {
          console.log(contextLabel + ' dialog closed while waiting - filled manually');
          return { otp: '__MANUAL__', id: null, manualFill: true };
        }
      }
    }
  }

  console.log('No fresh ' + contextLabel + ' OTP after ' + maxAttempts + ' attempts; handing over to manual entry');
  return waitForManualOtpCompletion(contextLabel);
}

async function fillOTP(otpData, attempt = 0, labelOverride = null, contextLabel = 'OTP') {
  ensureOrientalPageAlertInterceptor();
  const otp = otpData.otp;

  const otpDigits = String(otp).split('');
  const otpLength = otpDigits.length;

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  let individualInputsFound = false;
  let allDigitsFilled = true;

  for (let i = 0; i < otpLength; i++) {

    const digitInputSelectors = [
      `input[name='mobile${i}']`,
      `input[name='otp${i}']`,
      `input[name='digit${i}']`,
      `input[id='mobile${i}']`,
      `input[id='otp${i}']`,
      `input[id='digit${i}']`,
      `.otpinput:nth-child(${i + 1}) input`,
      `.otp-input:nth-child(${i + 1}) input`,
      `input[maxlength='1']:nth-of-type(${i + 1})`
    ];

    let digitFilled = false;

    for (const selector of digitInputSelectors) {

      try {

        const input = document.querySelector(selector);
        input.value = '';
        if (!input) continue;

        individualInputsFound = true;
        console.log(`✅ Found OTP digit ${i + 1} with selector: ${selector}`);

        input.focus();
        await wait(60);

        const digit = otpDigits[i];

        // simulate real keyboard typing
        input.dispatchEvent(new KeyboardEvent('keydown', { key: digit, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: digit, bubbles: true }));

        // browser inserts character like real typing
        document.execCommand('insertText', false, digit);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: digit, bubbles: true }));

        await wait(60);

        if (input.value === digit) {
          digitFilled = true;
          console.log(`✅ OTP digit ${i + 1} typed: ${digit}`);
          break;
        }

      } catch (e) {
        continue;
      }

    }

    if (!digitFilled) {
      allDigitsFilled = false;
      console.log(`⚠️ Could not fill OTP digit ${i + 1}`);
    }
  }

  if (individualInputsFound && allDigitsFilled) {
    console.log("🎉 OTP filled successfully (typed like user)");
    let verifyBtn = null;
    const verifySearchStart = Date.now();
    while (!verifyBtn && Date.now() - verifySearchStart < 5000) {
      verifyBtn = document.querySelector('#otp-dialog button[type="submit"]:not([disabled])')
        || document.querySelector('.signupOTPForm button[type="submit"]:not([disabled])')
        || Array.from(document.querySelectorAll('button')).find((button) => {
          if (!button || button.disabled || button.offsetParent === null) return false;
          return button.textContent.trim().toLowerCase() === 'verify';
        })
        || null;
      if (!verifyBtn) {
        await wait(100);
      }
    }
    if (verifyBtn) {
      const alertBaseline = readOrientalPageAlert()?.ts || 0;
      clickElement(verifyBtn);
      await wait(500);
      const otpFailure = await waitForOtpFailureSignal(5000, alertBaseline);
      if (otpFailure) {
        console.log('OTP rejected by Oriental:', otpFailure.message);
        rememberOtpInMemory(otpData, 'rejected');
        await setOtpSinceTimestampNow();

        const nextAttempt = attempt + 1;
        if (nextAttempt >= ORIENTAL_OTP_CONFIG.MAX_VERIFY_ATTEMPTS) {
          // The automation stops retrying here too. Leave the dialog alone so
          // the operator can finish it by hand.
          console.log('OTP rejected ' + nextAttempt + ' times; handing the dialog over for manual entry');
          await waitForManualOtpCompletion(contextLabel);
          return { success: true, manualFill: true };
        }

        // Only accept an OTP newer than the one that was just rejected.
        const rejectedId = otpData?.id ? String(otpData.id) : null;
        const newOtpData = await fetchOTPWithRetry({
          labelOverride,
          contextLabel,
          previousOtpId: rejectedId,
        });
        if (newOtpData?.manualFill) return { success: true, manualFill: true };
        if (newOtpData) {
          return fillOTP(newOtpData, nextAttempt, labelOverride, contextLabel);
        }
        await waitForManualOtpCompletion(contextLabel);
        return { success: true, manualFill: true };
      }else{
        // mark otp as used and clear "since" timestamp so next OTP flow uses a fresh one
        const otpId = otpData?.id || otpData?._id;
        rememberOtpInMemory(otpData, 'used');
        if (otpId) {
          try {
            await markOtpAsUsed(otpId);
            console.log('✅ OTP marked as used:', otpId);
          } catch (e) {
            console.warn('⚠️ Mark OTP used failed:', e?.message);
          }
        } else {
          console.warn('⚠️ No OTP id to mark as used', otpData);
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove(['otpSinceTimestamp']);
        }
        return { success: true };
      }
    }
  } else {
    console.log('Could not fill the OTP inputs automatically');
  }

  // Never leave the dialog half-filled and abandoned: if the OTP could not be
  // entered or submitted, the operator finishes it.
  if (isOtpDialogStillVisible()) {
    await waitForManualOtpCompletion(contextLabel);
    return { success: true, manualFill: true };
  }
  return { success: true };
}


// ===============================================================
//  PORTAL STATE HELPERS
//  Ported from the Playwright Oriental target so the extension reads
//  the same slide / dialog state the server-side automation does.
// ===============================================================

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Clicks and checks that it took effect, re-clicking if it did not.
 *
 * The portal drops clicks: an operator often has to press Add three or four
 * times before the dialog opens. Everywhere the Playwright target clicks
 * something it matters about, it verifies and re-clicks the same way.
 */
async function clickUntil(element, isDone, options = {}) {
  if (!element) return false;
  const { attempts = 4, settleMs = 2500, pollMs = 150, label = 'element' } = options;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await isDone()) return true;

    element.scrollIntoView({ block: 'center' });
    await wait(100);
    // Some handlers sit on pointer events rather than click.
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    if (typeof element.click === 'function') element.click();

    const deadline = Date.now() + settleMs;
    while (Date.now() < deadline) {
      await wait(pollMs);
      if (await isDone()) {
        if (attempt > 1) console.log('Clicked ' + label + ' (took ' + attempt + ' attempts)');
        return true;
      }
    }
    console.log('Click on ' + label + ' did not register (attempt ' + attempt + '/' + attempts + '), re-clicking');
  }

  return await isDone();
}

function getSlickActiveSlide() {
  return document.querySelector('.slick-slide.slick-active[aria-hidden="false"]')
    || document.querySelector('.slick-slide.slick-active');
}

/** Current slick index, or -1 when the page is not a slider. */
function getSlickActiveIndex() {
  const active = getSlickActiveSlide();
  if (!active) return -1;
  // The current portal uses data-index; older builds used data-slick-index.
  const idx = active.getAttribute('data-index') ?? active.getAttribute('data-slick-index');
  return idx !== null ? Number.parseInt(idx, 10) : -1;
}

/**
 * Index + content snippet of the active slide. More reliable than the index
 * alone: the portal sometimes keeps the index and swaps the content.
 */
function getSlickActiveSignature() {
  const active = getSlickActiveSlide();
  if (!active) return 'none';
  const idx = active.getAttribute('data-index') ?? active.getAttribute('data-slick-index') ?? '?';
  const text = (active.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return idx + ':' + text;
}

/**
 * The portal reports step outcomes in a `.successfully-popup.p-dialog`.
 * Reading it is what stops the run on a portal error instead of marching on
 * into steps whose fields never render.
 */
function getVisibleOutcomeDialog() {
  const dialogs = Array.from(document.querySelectorAll('.successfully-popup.p-dialog:not(.makerchecker-popup)'));
  const dialog = dialogs.find((el) => isElementVisible(el));
  if (!dialog) return null;

  const heading = dialog.querySelector('.response-text')?.textContent?.trim() || '';
  const message = dialog.querySelector('.success-content p')?.textContent?.replace(/\s+/g, ' ').trim()
    || dialog.textContent?.replace(/\s+/g, ' ').trim()
    || heading;

  if (dialog.querySelector('.icon-error') || /^error!?$/i.test(heading)) {
    return { kind: 'error', message, dialog };
  }
  if (dialog.querySelector('.icon-success') || /^success!?$/i.test(heading)) {
    return { kind: 'success', message, dialog };
  }
  return null;
}

/**
 * Maker-checker popup - raised when the IDV slab was modified, so the proposal
 * goes to a checker instead of straight to payment. It is a `.p-dialog` too,
 * so anything looking for the sync popup has to exclude it.
 */
function getVisibleMakerCheckerDialog() {
  const dialogs = Array.from(document.querySelectorAll('.makerchecker-popup.p-dialog, .p-dialog'));
  return dialogs.find((dialog) => {
    if (!isElementVisible(dialog)) return false;
    if (dialog.classList.contains('makerchecker-popup')) return true;
    return String(dialog.textContent || '').toLowerCase().includes('checker for approval');
  }) || null;
}

async function waitForMakerCheckerDialog(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dialog = getVisibleMakerCheckerDialog();
    if (dialog) return dialog;
    await wait(200);
  }
  return null;
}

/** Sends the proposal to the checker queue and dismisses the confirmation. */
async function handleMakerCheckerDialog(dialog, logger = console.log) {
  const sendBtn = Array.from(dialog.querySelectorAll('.footer-red, button, .pointer'))
    .find((el) => String(el.textContent || '').trim().toLowerCase().includes('send for approval'));
  if (!sendBtn) {
    logger('WARN Send For Approval button not found in maker-checker dialog');
    return false;
  }
  clickElement(sendBtn);
  logger('Clicked Send For Approval; waiting for portal confirmation');

  const start = Date.now();
  while (Date.now() - start < 15000) {
    const confirmation = Array.from(document.querySelectorAll('.makerchecker-popup.p-dialog'))
      .find((el) => isElementVisible(el)
        && String(el.textContent || '').toLowerCase().includes('proposal sent for approval successfully'));
    if (confirmation) {
      logger('Proposal Sent For Approval Successfully');
      const continueBtn = Array.from(confirmation.querySelectorAll('.footer-green, button, .pointer'))
        .find((el) => String(el.textContent || '').trim().toLowerCase().includes('continue'));
      if (continueBtn) clickElement(continueBtn);
      return true;
    }
    await wait(250);
  }
  logger('WARN Maker-checker confirmation did not appear within 15s');
  return false;
}

/**
 * Finds the "Continue in English" button in the language chooser.
 *
 * The dialog is BEM-classed: `section.language-welcome__dialog` holding
 * `.language-welcome__choices > button`. A `.language-welcome button`
 * selector does NOT match `language-welcome__dialog` - CSS matches whole
 * class tokens - so scope off the real class names, widest match last.
 * Both choice buttons carry a `.language-welcome__english-name` label
 * ("Continue in English" / "Continue in Hindi"), which is what tells the
 * two apart regardless of page language.
 */
function findLanguageWelcomeEnglishButton() {
  const scopes = [
    ...document.querySelectorAll('.language-welcome__choices'),
    ...document.querySelectorAll('.language-welcome__dialog'),
    ...document.querySelectorAll('.language-welcome'),
    ...document.querySelectorAll('[class*="language-welcome"]'),
  ];

  for (const scope of scopes) {
    for (const button of scope.querySelectorAll('button')) {
      const englishLabel = button.querySelector('.language-welcome__english-name');
      const text = String((englishLabel || button).textContent || '').trim().toLowerCase();
      if (text.includes('continue in english')) return button;
    }
  }
  return null;
}

function isLanguageWelcomeVisible() {
  const dialog = document.querySelector('.language-welcome__dialog, .language-welcome')
    || document.querySelector('[class*="language-welcome"]');
  return Boolean(dialog && isElementVisible(dialog));
}

/**
 * The portal can open a language chooser over the whole page. Nothing is
 * clickable until it is dismissed, so this runs on load as well as before
 * login - the dialog is up long before any automation is started.
 */
async function dismissLanguageWelcome(timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const button = findLanguageWelcomeEnglishButton();
    if (button && isElementVisible(button)) {
      // A bare .click() is not always enough: the choice is a React handler
      // that can be wired to pointer events, so send the full sequence.
      button.scrollIntoView({ block: 'center' });
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      button.click();
      console.log('[Oriental] Selected English language');

      // Confirm it actually closed before reporting success.
      const closeDeadline = Date.now() + 3000;
      while (Date.now() < closeDeadline) {
        if (!isLanguageWelcomeVisible()) return true;
        await wait(150);
      }
      console.log('[Oriental] Language chooser still visible after clicking English; retrying');
    }
    await wait(250);
  }

  // The chooser is optional once the portal has stored the preference.
  return !isLanguageWelcomeVisible();
}

/**
 * Keeps dismissing the chooser for as long as the page can re-render it.
 * The portal is a SPA and shows it on first paint, well before the operator
 * triggers a run.
 */
function startLanguageWelcomeWatcher() {
  if (window.__orientalLanguageWatcher) return;
  window.__orientalLanguageWatcher = true;

  let dismissing = false;
  let lastCheck = 0;
  let observer = null;

  const tryDismiss = () => {
    // The portal mutates the DOM constantly; throttle so the watcher costs
    // nothing between renders.
    const now = Date.now();
    if (dismissing || now - lastCheck < 300) return;
    lastCheck = now;
    if (!isLanguageWelcomeVisible()) return;

    dismissing = true;
    dismissLanguageWelcome(4000)
      .then((dismissed) => {
        // The choice is remembered for the session, so stop watching once
        // the chooser is gone.
        if (dismissed && observer) observer.disconnect();
      })
      .finally(() => { dismissing = false; });
  };

  tryDismiss();
  observer = new MutationObserver(tryDismiss);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Plan table mirrors ORIENTAL_CONFIG.PLANS in the Playwright target.
const ORIENTAL_PLANS = [
  { id: '0', value: 'Bundle', label: 'Long Term Bundled Policy' },
  { id: '1', value: 'OD', label: 'Standalone Own Damage Policy' },
  { id: '2', value: 'TP', label: 'Long Term Liability only policy' },
];

/** Maps whatever the frontend sent (id, value or label) to a plan value. */
function normalizeOrientalPlan(planInput) {
  if (planInput === undefined || planInput === null) return null;
  const planStr = String(planInput).trim().toLowerCase();
  if (!planStr) return null;

  const direct = ORIENTAL_PLANS.find((plan) =>
    plan.label.toLowerCase() === planStr || plan.value.toLowerCase() === planStr || plan.id === planStr);
  if (direct) return direct.value;

  const fuzzy = ORIENTAL_PLANS.find((plan) => plan.label.toLowerCase().includes(planStr));
  if (fuzzy) return fuzzy.value;

  const reverse = ORIENTAL_PLANS.find((plan) =>
    planStr.includes(plan.label.toLowerCase()) || planStr.includes(plan.value.toLowerCase()));
  if (reverse) return reverse.value;

  return null;
}


const ORIENTAL_SELECTORS = {
  rtoInput: '#cityOfRegistration input, input[name="cityOfRegistration"]',
  vehicalBrandModelVariantInput: '.carmodelclass input, input[placeholder*="Brand"], .p-autocomplete-input',
  engineNumberInput: 'input[name*="engine"], #engineNumber, #engineNumber input, input[placeholder*="Engine"]',
  chassisNumberInput: 'input[name*="chassis"], #chassisNumber, #chassisNumber input, input[placeholder*="Chassis"]',
  brandNewVehicleRadio: '#policy-BRAND_NEW, input[value="BRAND_NEW"], input[value="brandNew"]',
  getQuoteButton: '.get-quote-btn, button',
  loginButton: '#login-btn, .login-btn',
  loginModal: '.login-popup-box, .popup-form',
  usernameInput: '#username, input[name="username"]',
  passwordInput: '#password, input[name="password"]',
  loginSubmitButton: '#continue-btn, button[type="submit"]',
  productsTab: 'a[href*="Products"]',
  proposalNumberInput: 'input[name*="policyNo"], #proposalNumber,name="policyNo"',
  verifyButton: 'button',
  mobileNumberInput: 'input[name*="mobileNumber"], #mobileNumber',
  emailInput: 'input[name*="email"], #email',
  fullNameInput: 'input[name*="fullName"], #fullName',
  panInput: 'input[name*="pan"], #pan',
  continueButton: '.payment-section .Confirm-Continue-btn, .payment-section button[type="submit"], .policy-form-footer button.policy-btn, button.policy-btn',
  paymentMethodRadio: 'input[name*="previousPolicyType"]',
  branchCodeInput: 'input[name="branchOffice"]',
  permanentAddressInput: 'input[name="permanentAddress"]',
  planCards: '.choose-plan',
  idvSlider: 'input[name="idv-range-slider"]',
  idvInput: '.idv-input.p-inputnumber input.p-inputnumber-input',
  previousPolicyNcbClaimFlagNo: 'input[name="previousPolicyNcbClaimFlag"][value="false"]',
  underwritingDiscountInput: 'input[placeholder="Underwriting Discount"]',
  uwDiscountSubmitBtn: 'button[aria-label="uwDiscound-submit-btn"], .policy-form-footer button.policy-btn',
  proposalNumberText: '.sub-text',
  okayButton: '.pointer.footer-green',
  makerCheckerDialog: '.makerchecker-popup.p-dialog',
  samePermanentAddressCheckbox: '#samePermanentFlag, input[name="samePermanentFlag"]',
  currentAddressInput: 'input[name="currentAddress"], input[id="currentAddress"], input[placeholder*="Current Address"]',
};

const ORIENTAL_URLS = {
  MAKE_PAYMENTS: 'https://orientalinsurance.org.in/make-payments',
};
const ORIENTAL_DEFAULT_VALUES = {
  // No branchCode here on purpose: it is agent-specific and arrives in
  // agentDetails.branchCode with the request.
  plan: "Bundle",
  underwritingDiscount: 85,
  ndpDiscount: 40,
  nilDepreciation: false,
  cpaForOneYear: false,
  validDrivingLicense: false,
  validPuc: false,
  ownershipUnder: "Individual",
  email:"otpcoverscrafter@gmail.com",
};

function normalizeToOrientalForm(payload) {
  const v = payload.vehicleDetails || payload.vehicle || {};
  const p = payload.planDetails || payload.plan || {};
  const a = payload.additionalDetails || payload.additional || {};
  const vi = payload.vehicleInformation || payload.vehicleInfo || {};
  const c = payload.covers || payload.addons || {};
  const ag = payload.agentDetails || payload.agent || {};
  const h = payload.hypothecation || {};
  const cust = payload.customerDetails || payload.customer || {};
  return {
    agentDetails: typeof ag === 'object' ? ag : {},
    vehicleDetails: typeof v === 'object' ? v : {},
    vehicleInformation: typeof vi === 'object' ? vi : {},
    planDetails: typeof p === 'object' ? p : {},
    additionalDetails: typeof a === 'object' ? a : {},
    covers: typeof c === 'object' ? c : {},
    hypothecation: typeof h === 'object' ? h : {},
    customerDetails: typeof cust === 'object' ? cust : {},
    proposalNumber: payload.proposalNumber,
  };
}

// ═══════════════════════════════════════════════════════════════
//  AUTOMATION PAUSE / RESUME CONTROLLER
//  Uses sessionStorage to persist state across the automation run.
//  Captures input snapshots on pause, detects admin edits on resume,
//  and protects admin-edited fields from being overwritten.
// ═══════════════════════════════════════════════════════════════

const AutomationPauseController = {
  STORAGE_KEY: 'oriental_automation_state',

  _defaultState() {
    return {
      isPaused: false,
      isStopped: false,
      isRunning: false,
      isFailed: false,
      errorMessage: null,
      currentStep: null,
      completedSteps: [],
      phase: null,
      inputSnapshot: {},
      adminEditedFields: [],
      pausedAtTimestamp: null,
    };
  },

  getState() {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : this._defaultState();
    } catch { return this._defaultState(); }
  },

  _saveState(state) {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  },

  // ── Snapshot & Diff ──

  /** Capture current values of ALL visible form inputs on the page */
  captureInputSnapshot() {
    const snapshot = {};
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      if (el.type === 'radio' || el.type === 'checkbox') {
        snapshot[key + '__' + (el.value || '')] = el.checked;
      } else {
        snapshot[key] = el.value;
      }
    });
    // PrimeNG dropdown display text
    document.querySelectorAll('.p-dropdown-label').forEach((el, i) => {
      snapshot[`__dropdown_${i}`] = el.textContent.trim();
    });
    return snapshot;
  },

  /** Compare current input values with the saved snapshot.
   *  Returns an array of field identifiers (id or name) that the admin changed. */
  detectAdminEdits(oldSnapshot) {
    const edited = [];
    let idx = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((el) => {
      const key = el.id || el.name || el.getAttribute('placeholder') || `__el_${idx++}`;
      let snapshotKey, currentVal;
      if (el.type === 'radio' || el.type === 'checkbox') {
        snapshotKey = key + '__' + (el.value || '');
        currentVal = el.checked;
      } else {
        snapshotKey = key;
        currentVal = el.value;
      }
      if (snapshotKey in oldSnapshot && String(currentVal) !== String(oldSnapshot[snapshotKey])) {
        const fieldId = el.id || el.name;
        if (fieldId) edited.push(fieldId);
      }
    });
    return [...new Set(edited)];
  },

  // ── Pause / Resume ──

  pause() {
    const state = this.getState();
    state.isPaused = true;
    state.pausedAtTimestamp = Date.now();
    state.inputSnapshot = this.captureInputSnapshot();
    this._saveState(state);
    this._updateUI();
    console.log('%c[Automation] ⏸️ PAUSED at step: ' + state.currentStep,
      'color: #e94560; font-weight: bold; font-size: 14px;');
  },

  resume() {
    const state = this.getState();
    // Detect what the admin changed while paused
    if (state.inputSnapshot && Object.keys(state.inputSnapshot).length > 0) {
      const edits = this.detectAdminEdits(state.inputSnapshot);
      if (edits.length > 0) {
        state.adminEditedFields = [...new Set([...(state.adminEditedFields || []), ...edits])];
        console.log('%c[Automation] 🛡️ Admin edited fields (now protected): ' + edits.join(', '),
          'color: #ffd166; font-weight: bold;');
      } else {
        console.log('%c[Automation] ℹ️ No admin edits detected', 'color: #90caf9;');
      }
    }
    state.isPaused = false;
    state.pausedAtTimestamp = null;
    state.inputSnapshot = {};
    this._saveState(state);
    this._updateUI();
    console.log('%c[Automation] ▶️ RESUMED from step: ' + state.currentStep,
      'color: #2d6a4f; font-weight: bold; font-size: 14px;');
  },

  /** Check whether admin edited a given field (by id or name) */
  isFieldProtected(fieldIdOrName) {
    if (!fieldIdOrName) return false;
    const state = this.getState();
    return (state.adminEditedFields || []).includes(fieldIdOrName);
  },

  /**
   * Checkpoint — call before each logical step.
   * If paused, blocks (polls every 500ms) until the admin clicks Resume.
   * @param {string} [stepLabel] Human-readable label for this step.
   */
  async checkpoint(stepLabel) {
    // Check for permanent stop first
    const stoppedCheck = this.getState();
    if (stoppedCheck.isStopped) {
      throw new Error('AUTOMATION_STOPPED');
    }
    const state = this.getState();
    if (stepLabel) {
      state.currentStep = stepLabel;
      state.isRunning = true;
      this._saveState(state);
      this._updateUI();
    }
    // Block while paused
    while (true) {
      const s = this.getState();
      if (s.isStopped) throw new Error('AUTOMATION_STOPPED');
      if (!s.isPaused) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  },

  // ── Step tracking (section-level, survives page reload) ──

  markStepComplete(stepId) {
    const state = this.getState();
    if (!state.completedSteps.includes(stepId)) {
      state.completedSteps.push(stepId);
    }
    this._saveState(state);
  },

  isStepCompleted(stepId) {
    return this.getState().completedSteps.includes(stepId);
  },

  setPhase(phase) {
    const state = this.getState();
    state.phase = phase;
    state.isRunning = true;
    this._saveState(state);
    this._updateUI();
  },

  /** Call when automation begins — resets state */
  startRun() {
    const fresh = this._defaultState();
    fresh.isRunning = true;
    this._saveState(fresh);
    clearRememberedOtpEntries();
    clearOrientalPageAlert();
    this._updateUI();
  },

  /** Call when automation finishes */
  endRun() {
    const state = this.getState();
    state.isRunning = false;
    state.currentStep = 'Completed ✅';
    this._saveState(state);
    this._updateUI();
  },

  /** Permanently stop automation — checkpoint() will throw */
  stop() {
    const state = this.getState();
    state.isStopped = true;
    state.isPaused = false;
    state.isRunning = false;
    state.currentStep = 'Stopped ⛔';
    this._saveState(state);
    this._updateUI();
    console.log('%c[Automation] ⛔ STOPPED permanently',
      'color: #ff0000; font-weight: bold; font-size: 16px;');
  },

  /** Call when a step throws, so the panel shows why the run ended. */
  fail(message) {
    const state = this.getState();
    state.isRunning = false;
    state.isFailed = true;
    state.errorMessage = String(message || 'Unknown error');
    this._saveState(state);
    this._updateUI();
    console.log('%c[Automation] FAILED: ' + state.errorMessage,
      'color: #ff5252; font-weight: bold; font-size: 14px;');
  },

  reset() {
    sessionStorage.removeItem(this.STORAGE_KEY);
    clearRememberedOtpEntries();
    clearOrientalPageAlert();
    this._updateUI();
  },

  // ── Floating UI ──

  _updateUI() {
    const panel = document.getElementById('oriental-automation-panel');
    if (!panel) return;

    const state = this.getState();
    const badge = document.getElementById('oriental-auto-badge');
    const stepEl = document.getElementById('oriental-auto-step');
    const pauseBtn = document.getElementById('oriental-auto-pause-btn');
    const stopBtn = document.getElementById('oriental-auto-stop-btn');
    const protectedEl = document.getElementById('oriental-auto-protected');

    // Always show the panel once injected
    panel.style.display = 'flex';

    const errorEl = document.getElementById('oriental-auto-error');
    if (errorEl) {
      errorEl.textContent = state.errorMessage || '';
      errorEl.style.display = state.errorMessage ? 'block' : 'none';
      errorEl.title = state.errorMessage || '';
    }

    if (state.isFailed) {
      badge.textContent = '❌ FAILED';
      badge.style.background = '#b71c1c';
      pauseBtn.textContent = '⏸️ Pause';
      pauseBtn.disabled = true;
      pauseBtn.style.opacity = '0.4';
      pauseBtn.style.cursor = 'not-allowed';
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.4';
      stopBtn.style.cursor = 'not-allowed';
    } else if (state.isStopped) {
      badge.textContent = '⛔ STOPPED';
      badge.style.background = '#b71c1c';
      pauseBtn.textContent = '⏸️ Pause';
      pauseBtn.disabled = true;
      pauseBtn.style.opacity = '0.4';
      pauseBtn.style.cursor = 'not-allowed';
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.4';
      stopBtn.style.cursor = 'not-allowed';
    } else if (!state.isRunning) {
      badge.textContent = '💤 Idle';
      badge.style.background = '#555';
      pauseBtn.textContent = '⏸️ Pause';
      pauseBtn.disabled = true;
      pauseBtn.style.opacity = '0.4';
      pauseBtn.style.cursor = 'not-allowed';
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.4';
      stopBtn.style.cursor = 'not-allowed';
    } else if (state.isPaused) {
      badge.textContent = '⏸️ PAUSED';
      badge.style.background = '#e94560';
      pauseBtn.textContent = '▶️ Resume';
      pauseBtn.disabled = false;
      pauseBtn.style.opacity = '1';
      pauseBtn.style.cursor = 'pointer';
      pauseBtn.style.background = '#2d6a4f';
      pauseBtn.style.borderColor = '#40916c';
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
    } else {
      badge.textContent = '🤖 Running';
      badge.style.background = '#2d6a4f';
      pauseBtn.textContent = '⏸️ Pause';
      pauseBtn.disabled = false;
      pauseBtn.style.opacity = '1';
      pauseBtn.style.cursor = 'pointer';
      pauseBtn.style.background = '#e94560';
      pauseBtn.style.borderColor = '#c73750';
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
    }

    stepEl.textContent = state.currentStep
      || (state.isFailed ? 'Failed' : (state.isRunning ? 'Starting...' : 'Waiting for automation'));

    const protCount = (state.adminEditedFields || []).length;
    protectedEl.textContent = protCount > 0
      ? `🛡️ ${protCount} field${protCount > 1 ? 's' : ''} protected (admin-edited)`
      : '';
    protectedEl.style.display = protCount > 0 ? 'block' : 'none';
  },

  /** Inject the floating pause/resume/stop panel into the page DOM */
  injectUI() {
    if (document.getElementById('oriental-automation-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'oriental-automation-panel';
    panel.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #1a1a2e; border: 2px solid #e94560; border-radius: 12px;
      padding: 14px 18px; min-width: 260px; max-width: 340px;
      font-family: 'Segoe UI', sans-serif; color: #e0e0e0;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex; flex-direction: column; gap: 8px;
    `;

    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span id="oriental-auto-badge" style="
          background:#555; color:white; padding:3px 10px; border-radius:20px;
          font-size:11px; font-weight:700; letter-spacing:0.5px;
        ">💤 Idle</span>
        <span style="font-size:10px; color:#888;">Oriental Auto</span>
      </div>
      <div style="font-size:10px; color:#aaa; margin-top:2px;">Current Step:</div>
      <div id="oriental-auto-step" style="
        font-size:12px; font-weight:600; color:#90caf9; word-break:break-word;
      ">Waiting for automation</div>
      <div id="oriental-auto-protected" style="
        font-size:10px; color:#ffd166; display:none; margin-top:2px;
      "></div>
      <div id="oriental-auto-error" style="
        font-size:11px; color:#ff8a80; display:none; margin-top:2px;
        background:#2b1416; border:1px solid #b71c1c; border-radius:6px;
        padding:6px 8px; max-height:120px; overflow-y:auto;
        white-space:pre-wrap; word-break:break-word; user-select:text;
      "></div>
      <div style="display:flex; gap:8px;">
        <button id="oriental-auto-pause-btn" style="
          flex:1; padding:8px 0; border:2px solid #c73750; border-radius:8px;
          background:#e94560; color:white; font-size:12px; font-weight:700;
          cursor:not-allowed; letter-spacing:0.5px; transition:all 0.2s; opacity:0.4;
        ">⏸️ Pause</button>
        <button id="oriental-auto-stop-btn" style="
          flex:1; padding:8px 0; border:2px solid #b71c1c; border-radius:8px;
          background:#d32f2f; color:white; font-size:12px; font-weight:700;
          cursor:not-allowed; letter-spacing:0.5px; transition:all 0.2s; opacity:0.4;
        ">⛔ Stop</button>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('oriental-auto-pause-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      if (state.isPaused) {
        this.resume();
      } else {
        this.pause();
      }
    });

    document.getElementById('oriental-auto-stop-btn').addEventListener('click', () => {
      const state = this.getState();
      if (state.isStopped || !state.isRunning) return;
      if (confirm('⛔ Are you sure you want to permanently stop the automation?')) {
        this.stop();
      }
    });

    // Restore UI state (e.g. after page navigation within SPA)
    this._updateUI();
  },
};

ensureOrientalPageAlertInterceptor();

Object.assign(globalThis, {
  wait,
  clickElement,
  qs,
  fillInput,
  typeIntoInput,
  findElementByText,
  waitForElement,
  waitForButtonEnabled,
  scrollToBottom,
  waitForSkeletonsToDisappear,
  waitForDialogToClose,
  waitForContinueButton,
  selectPrimeDropdown,
  fillPrimeDropdownByLabel,
  getUploadFileById,
  selectUserType,
  uploadFile,
  uploadFileObject,
  generateForm60Pdf,
  selectPrimeAutocomplete,
  fillManualVehicleDetails,
  findManualVehiclePrompt,
  fillMuiDate,
  fetchOTPWithRetry,
  fillOTP,
  ORIENTAL_SELECTORS,
  ORIENTAL_URLS,
  ORIENTAL_DEFAULT_VALUES,
  normalizeToOrientalForm,
  AutomationPauseController,
});
