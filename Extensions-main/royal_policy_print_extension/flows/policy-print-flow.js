(function () {
  'use strict';

  const PAGE_SOURCE = 'ROYAL_POLICY_PRINT_FLOW';
  const EXTENSION_SOURCE = 'ROYAL_POLICY_PRINT_EXTENSION';
  const GENERATE_PRINT_PATH = '/eappspolicyservices/generatePrint';
  const RESPONSE_TIMEOUT_MS = 60000;

  if (window.__royalPolicyPrintFlowInstalled) {
    postLog('Policy print flow already loaded');
    return;
  }
  window.__royalPolicyPrintFlowInstalled = true;

  let isRunning = false;
  const responseWaiters = [];
  const processedResponses = new Set();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function postToExtension(type, payload = {}) {
    window.postMessage({
      source: PAGE_SOURCE,
      type,
      ...payload
    }, '*');
  }

  function postLog(message, color = '#bfdbfe') {
    console.log('%c[Royal Policy Print]', 'color: #2563eb; font-weight: bold;', message);
    postToExtension('LOG', { message, color });
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  function getAbsoluteUrl(url) {
    try {
      return new URL(String(url || ''), window.location.href).href;
    } catch (error) {
      return String(url || '');
    }
  }

  function isGeneratePrintUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      return parsed.pathname === GENERATE_PRINT_PATH;
    } catch (error) {
      return String(url || '').includes(GENERATE_PRINT_PATH);
    }
  }

  function getFetchUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  async function clickElement(element, label) {
    element.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(250);
    element.focus?.();

    const rect = element.getBoundingClientRect();
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
    }
    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
    }
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.click();

    postLog(`Clicked ${label}`);
    await sleep(700);
  }

  async function waitForElement(finder, label, timeoutMs = 30000, options = {}) {
    const requireVisible = options.requireVisible !== false;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = finder();
      if (element && (!requireVisible || isVisible(element))) return element;
      await sleep(250);
    }
    throw new Error(`${label} not found.`);
  }

  function findPolicyDocumentsButton() {
    const anchors = Array.from(document.querySelectorAll('a.btn.btn-secondary.btn-sm.dropdown-toggle, a.dropdown-toggle, a'));
    return anchors.find((anchor) => normalizeText(anchor.textContent) === 'Policy Documents') ||
      anchors.find((anchor) => normalizeText(anchor.textContent).toLowerCase().includes('policy documents'));
  }

  function findPrintPolicyLink() {
    const exactLink = document.querySelector(
      'a.dropdown-item.text-rs.font-weight-bold[href*="/iPolicyMotor/printPolicy/"][href*="/policyprint/"]'
    );
    if (exactLink) return exactLink;

    const anchors = Array.from(document.querySelectorAll('a.dropdown-item, a[href*="/iPolicyMotor/printPolicy/"], a'));
    return anchors.find((anchor) => {
      const text = normalizeText(anchor.textContent).toLowerCase();
      const href = String(anchor.getAttribute('href') || '');
      return text.includes('print policy') ||
        (href.includes('/iPolicyMotor/printPolicy/') && href.includes('/policyprint/'));
    });
  }

  function parseJsonMaybe(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function findPolicyPdfPayload(value, seen = new Set(), depth = 0) {
    if (!value || depth > 8) return null;
    if (typeof value !== 'object') return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (typeof value.file === 'string' && value.file.trim()) {
      return {
        policyCode: value.policyCode || value.policyNo || value.policyNumber || value.policycode || 'policy',
        file: value.file
      };
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findPolicyPdfPayload(item, seen, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const key of Object.keys(value)) {
      const child = value[key];
      if (child && typeof child === 'object') {
        const found = findPolicyPdfPayload(child, seen, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  function resolveResponseWaiters(payload) {
    while (responseWaiters.length) {
      const waiter = responseWaiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
  }

  function rejectResponseWaiters(error) {
    while (responseWaiters.length) {
      const waiter = responseWaiters.shift();
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  function waitForGeneratePrintResponse(timeoutMs = RESPONSE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error('Timed out waiting for generatePrint response.');
        rejectResponseWaiters(error);
      }, timeoutMs);
      responseWaiters.push({ resolve, reject, timer });
    });
  }

  async function requestPdfSave(payload) {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ success: false, error: 'Timed out waiting for extension download response.' });
      }, 30000);

      function handleResponse(event) {
        if (event.source !== window || event.data?.source !== EXTENSION_SOURCE) return;
        if (event.data.type !== 'SAVE_PDF_RESPONSE' || event.data.requestId !== requestId) return;
        clearTimeout(timeout);
        window.removeEventListener('message', handleResponse);
        resolve(event.data.result || { success: false, error: 'Empty download response.' });
      }

      window.addEventListener('message', handleResponse);
      postToExtension('SAVE_PDF', {
        requestId,
        policyCode: payload.policyCode,
        file: payload.file
      });
    });
  }

  async function handleGeneratePrintData(data, url) {
    const parsed = parseJsonMaybe(data);
    const payload = findPolicyPdfPayload(parsed);
    if (!payload?.file) {
      postLog(`generatePrint response received, but policyCode/file was not found. URL: ${getAbsoluteUrl(url)}`, '#fde68a');
      return;
    }

    const dedupeKey = `${payload.policyCode || 'policy'}:${payload.file.length}`;
    if (processedResponses.has(dedupeKey)) {
      postLog(`Duplicate generatePrint response ignored for policy ${payload.policyCode || 'policy'}`, '#fde68a');
      return;
    }
    processedResponses.add(dedupeKey);

    postLog(`Extracted policyCode: ${payload.policyCode || 'policy'}`, '#bbf7d0');
    resolveResponseWaiters(payload);

    const result = await requestPdfSave(payload);
    if (result.success) {
      postLog(`Saved PDF request sent to downloads: ${result.filename}`, '#bbf7d0');
      postToExtension('FLOW_DONE', { success: true });
      return;
    }

    postLog(`PDF save failed: ${result.error || 'Unknown error'}`, '#fecaca');
    postToExtension('FLOW_DONE', { success: false });
  }

  function installFetchInterceptor() {
    if (typeof window.fetch !== 'function' || window.__royalPolicyPrintFetchPatched) return;
    window.__royalPolicyPrintFetchPatched = true;
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const requestUrl = getFetchUrl(args[0]);
      if (isGeneratePrintUrl(requestUrl)) {
        postLog(`Captured fetch response from ${getAbsoluteUrl(requestUrl)}`);
        response.clone().text()
          .then((text) => handleGeneratePrintData(text, requestUrl))
          .catch((error) => postLog(`Could not read fetch response: ${error.message}`, '#fecaca'));
      }
      return response;
    };
  }

  function installXhrInterceptor() {
    if (!window.XMLHttpRequest || window.__royalPolicyPrintXhrPatched) return;
    window.__royalPolicyPrintXhrPatched = true;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__royalPolicyPrintUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      const requestUrl = this.__royalPolicyPrintUrl;
      if (isGeneratePrintUrl(requestUrl)) {
        this.addEventListener('loadend', () => {
          try {
            postLog(`Captured XHR response from ${getAbsoluteUrl(requestUrl)}`);
            if (this.responseType === '' || this.responseType === 'text') {
              handleGeneratePrintData(this.responseText, requestUrl);
              return;
            }
            if (this.responseType === 'json') {
              handleGeneratePrintData(this.response, requestUrl);
              return;
            }
            postLog(`generatePrint XHR used unsupported responseType: ${this.responseType}`, '#fde68a');
          } catch (error) {
            postLog(`Could not read XHR response: ${error.message}`, '#fecaca');
          }
        });
      }
      return originalSend.apply(this, args);
    };
  }

  async function runFlow() {
    if (isRunning) {
      postLog('Policy print flow is already running.', '#fde68a');
      return;
    }

    isRunning = true;
    try {
      postLog('Starting policy print click flow.', '#bbf7d0');
      const responsePromise = waitForGeneratePrintResponse();

      const policyDocumentsButton = await waitForElement(
        findPolicyDocumentsButton,
        'Policy Documents button'
      );
      await clickElement(policyDocumentsButton, 'Policy Documents');

      const printPolicyLink = await waitForElement(
        findPrintPolicyLink,
        'Print Policy link',
        30000,
        { requireVisible: false }
      );
      postLog(`Print Policy link found: ${getAbsoluteUrl(printPolicyLink.getAttribute('href') || '')}`);
      await clickElement(printPolicyLink, 'Print Policy');

      postLog('Waiting for generatePrint response.');
      await responsePromise;
    } catch (error) {
      postLog(`Flow failed: ${error.message}`, '#fecaca');
      postToExtension('FLOW_DONE', { success: false });
    } finally {
      isRunning = false;
    }
  }

  installFetchInterceptor();
  installXhrInterceptor();
  postLog('Policy print flow loaded.');

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== EXTENSION_SOURCE) return;
    if (event.data.type === 'START_POLICY_PRINT_FLOW') {
      runFlow();
    }
  });
})();
