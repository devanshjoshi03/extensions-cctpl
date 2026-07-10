/**
 * Shared utilities for Oriental flows (form, quote, login, etc.)
 */
function getAutomationControlState() {
  try {
    if (typeof AutomationPauseController !== 'undefined' && AutomationPauseController?.getState) {
      return AutomationPauseController.getState();
    }
  } catch (_) {}
  return null;
}

async function wait(ms) {
  const deadline = Date.now() + Math.max(0, Number(ms) || 0);
  while (Date.now() < deadline) {
    let state = getAutomationControlState();
    if (state?.isStopped) throw new Error('AUTOMATION_STOPPED');
    while (state?.isPaused) {
      await new Promise((r) => setTimeout(r, 100));
      state = getAutomationControlState();
      if (state?.isStopped) throw new Error('AUTOMATION_STOPPED');
    }
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, deadline - Date.now()))));
  }
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
    '[class*="skeleton"]'
  ];
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      const stillLoading = loadingSelectors.some(sel => {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el && (el.offsetParent !== null || el.getAttribute('aria-hidden') === 'true')) {
            return true;
          }
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

async function selectPrimeAutocomplete(inputSelector, value) {
  if (!value) {
    console.log('⚠️ selectPrimeAutocomplete: No value provided');
    return false;
  }

  // Wait for the input to appear
  let input = null;
  const inputStart = Date.now();
  while (Date.now() - inputStart < 10000) {
    input = document.querySelector(inputSelector);
    if (input) break;
    await wait(150);
  }
  if (!input) {
    console.log('⚠️ selectPrimeAutocomplete: Input not found:', inputSelector);
    return false;
  }

  // Focus and clear
  input.focus();
  input.click();
  await wait(100);

  // Use native setter so Angular detects the change
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(100);

  // Type value character by character for Angular reactivity
  // Type first few chars to trigger the autocomplete search
  const searchText = value.trim();
  if (nativeSetter) nativeSetter.call(input, searchText);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('✅ Typed into autocomplete:', searchText);

  // Wait for the autocomplete panel to appear with results
  const panelStart = Date.now();
  let selected = false;
  while (Date.now() - panelStart < 12000) {
    await wait(250);
    const panel = document.querySelector('.p-autocomplete-panel');
    if (panel && panel.offsetParent !== null) {
      const items = panel.querySelectorAll('.p-autocomplete-item, li');
      if (items.length > 0) {
        console.log(`✅ Autocomplete panel visible with ${items.length} items`);

        // Try exact match first
        let match = [...items].find(item =>
          item.innerText.trim().toLowerCase() === searchText.toLowerCase()
        );

        // Try includes match
        if (!match) {
          match = [...items].find(item =>
            item.innerText.trim().toLowerCase().includes(searchText.toLowerCase())
          );
        }

        // Try reverse includes (search text contains item text)
        if (!match) {
          match = [...items].find(item =>
            searchText.toLowerCase().includes(item.innerText.trim().toLowerCase())
          );
        }

        // Fallback: pick the first item
        if (!match && items.length > 0) {
          match = items[0];
          console.log('⚠️ No text match, selecting first item:', match.innerText.trim());
        }

        if (match) {
          match.click();
          console.log('✅ Selected autocomplete item:', match.innerText.trim());
          selected = true;
          break;
        }
      }
    }
  }

  if (!selected) {
    console.log('⚠️ selectPrimeAutocomplete: Timed out waiting for panel/match');
  }

  await wait(250);
  return selected;
}

async function fillMuiDate(selector, dateValue) {

  function formatDate(d) {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  function validateDate(str) {
    const parts = str.split("-");
    if (parts.length !== 3) return false;

    const [dd, mm, yyyy] = parts.map(Number);
    const d = new Date(yyyy, mm - 1, dd);

    return (
      d.getFullYear() === yyyy &&
      d.getMonth() === mm - 1 &&
      d.getDate() === dd
    );
  }

  if (!validateDate(dateValue)) {
    dateValue = formatDate(new Date());
  }

  const input = document.querySelector(selector);
  if (!input) return;
  // Skip if admin edited this date field during a pause
  const dateFieldId = input.id || input.name || selector;
  if (dateFieldId && typeof AutomationPauseController !== 'undefined' && AutomationPauseController.isFieldProtected(dateFieldId)) {
    console.log(`[Automation] 🛡️ Skipping protected date field: ${dateFieldId}`);
    return;
  }

  input.focus();
  input.value = dateValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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

  let matched = false;

  const radio = document.querySelector('input[name="yearOfManufacture"][value="'+year+'"]');
  if(radio) {
    clickElement(radio);
  }else{
    throw new Error("Year of manufacture not found");
  }
}

function selectHypothecationByText(text) {
  const labels = document.querySelectorAll('.hypothecation-radios label');

  labels.forEach(label => {
    const labelText = label.querySelector('.car')?.innerText.trim();

    if (labelText && labelText.toLowerCase() === text.toLowerCase()) {
      label.click();
    }
  });
}

async function selectAddon(addonName) {
  // Wait for addon cards to render
  const start = Date.now();
  let target = null;
  const searchName = addonName.toLowerCase().trim();
  
  while (Date.now() - start < 15000) {
    const addons = document.querySelectorAll('.choose-plan');
    // Use loose matching (includes) instead of exact match
    target = [...addons].find(el =>
      el.querySelector('h4')?.textContent.trim().toLowerCase().includes(searchName)
    );
    if (target) break;
    await wait(250);
  }
  if (!target) {
    console.log('⚠️ Addon not found:', addonName);
    return false;
  }

  // Scroll the addon into view
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await wait(250);

  // Check if addon is already added (button says "Remove" or card has "active" class)
  const addBtn = target.querySelector('.handle-addons-btn');
  if (!addBtn) {
    console.log('⚠️ Add button not found for:', addonName);
    return false;
  }

  const btnText = addBtn.textContent.trim().toLowerCase();
  if (btnText === 'remove' || target.classList.contains('active')) {
    console.log('✅ Addon already added:', addonName, '— skipping click');
    // Addon already selected, return true so NDP input can be filled via Edit
    return false; // no dialog to fill, it's already set
  }

  addBtn.click();
  console.log('✅ Clicked Add for:', addonName);

  // Wait for the dialog to open (PrimeNG dialog is appended to body)
  const dialogStart = Date.now();
  while (Date.now() - dialogStart < 10000) {
    const dialog = document.querySelector('.p-dialog');
    if (dialog && dialog.offsetParent !== null) {
      console.log('✅ Dialog opened for:', addonName);
      await wait(250);
      return true;
    }
    await wait(150);
  }
  console.log('⚠️ Dialog did not open for:', addonName);
  return false;
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

// fetch otp from api - retry 8 attempts, 15 sec apart
// During waits, also checks if user manually filled OTP (dialog disappeared)
// After all retries fail, keeps watching for manual fill indefinitely
async function fetchOTPWithRetry(initialAttempt = 0, labelOverride = null) {
  const INTERVAL_MS = 15000;
  const POLL_MS = 1000;
  const MAX_ATTEMPTS = 8;
  let attempt = initialAttempt;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      console.log(`🔄 OTP attempt ${i + 1}/${MAX_ATTEMPTS}...`);
      const otp = await fetchOTP(attempt, labelOverride);
      if (otp) {
        if (isOtpRemembered(otp)) {
          console.log('ℹ️ Skipping previously used/rejected OTP:', otp?.id || otp?.otp);
        } else {
          return otp;
        }
      }
    } catch (e) {
      console.log(`⚠️ OTP attempt ${i + 1} failed:`, e?.message);
    }
    if (i < MAX_ATTEMPTS - 1) {
      console.log(`⏳ Waiting ${INTERVAL_MS / 1000}s before next attempt...`);
      // Poll during wait: break early if OTP dialog disappears (manual fill)
      const waitStart = Date.now();
      while (Date.now() - waitStart < INTERVAL_MS) {
        await wait(POLL_MS);
        if (!isOtpDialogStillVisible()) {
          console.log('✅ OTP dialog disappeared during wait — user likely filled OTP manually');
          return { otp: '__MANUAL__', id: null, manualFill: true };
        }
      }
    }
    attempt += 1;
  }

  // All API retries exhausted — now wait indefinitely for manual OTP fill
  console.log('⏸️ API retries exhausted. Waiting for manual OTP fill...');
  while (true) {
    await wait(POLL_MS);
    if (!isOtpDialogStillVisible()) {
      console.log('✅ OTP dialog disappeared — user filled OTP manually after retries ended');
      return { otp: '__MANUAL__', id: null, manualFill: true };
    }
  }
}


async function fillOTP(otpData, attempt = 0, labelOverride = null) {
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
        console.log('⚠️ OTP rejected by Oriental:', otpFailure.message);
        rememberOtpInMemory(otpData, 'rejected');
        await setOtpSinceTimestampNow();
        const nextAttempt = attempt + 1;
        const newOtpData = await fetchOTPWithRetry(nextAttempt, labelOverride);
        if(newOtpData) {
         const result = await fillOTP(newOtpData, nextAttempt, labelOverride);
         if(result) {
          return result;
         }
        }
        return { success: false, error: 'Fresh OTP not received after rejection' };
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
    console.log("⚠️ OTP fill incomplete");
  }

  return { success: false, error: 'OTP fill incomplete' };
}



const ORIENTAL_SELECTORS = {
  rtoInput: '#cityOfRegistration input, input[name="cityOfRegistration"]',
  vehicalBrandModelVariantInput: 'input[placeholder*="Brand"], .p-autocomplete-input',
  engineNumberInput: 'input[name*="engine"], #engineNumber, #engineNumber input, input[placeholder*="Engine"]',
  chassisNumberInput: 'input[name*="chassis"], #chassisNumber, #chassisNumber input, input[placeholder*="Chassis"]',
  brandNewVehicleRadio: 'input[value="BRAND_NEW"]',
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
};

const ORIENTAL_URLS = {
  MAKE_PAYMENTS: 'https://orientalinsurance.org.in/make-payments',
};
const ORIENTAL_DEFAULT_VALUES = {
  branchCode: "211201 : CB0 5 NEW DELHI",
  plan: "Long Term Bundled Policy",
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
  return {
    vehicleDetails: typeof v === 'object' ? v : {},
    vehicleInformation: typeof vi === 'object' ? vi : {},
    planDetails: typeof p === 'object' ? p : {},
    additionalDetails: typeof a === 'object' ? a : {},
    covers: typeof c === 'object' ? c : {},
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
  STATE_CHANGE_EVENT: 'coverscrafter:automation-state-change',

  _defaultState() {
    return {
      isPaused: false,
      isStopped: false,
      isRunning: false,
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
    window.dispatchEvent(new CustomEvent(this.STATE_CHANGE_EVENT, {
      detail: { storageKey: this.STORAGE_KEY }
    }));
  },

  _waitForStateChange(timeoutMs = 50) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener(this.STATE_CHANGE_EVENT, onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange = (event) => {
        if (event?.detail?.storageKey === this.STORAGE_KEY) done();
      };
      const timer = setTimeout(done, timeoutMs);
      window.addEventListener(this.STATE_CHANGE_EVENT, onChange);
    });
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
      await this._waitForStateChange();
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

    if (state.isStopped) {
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

    stepEl.textContent = state.currentStep || (state.isRunning ? 'Starting...' : 'Waiting for automation');

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
  fillMuiDate,
  fetchOTPWithRetry,
  fillOTP,
  ORIENTAL_SELECTORS,
  ORIENTAL_URLS,
  ORIENTAL_DEFAULT_VALUES,
  normalizeToOrientalForm,
  AutomationPauseController,
});
