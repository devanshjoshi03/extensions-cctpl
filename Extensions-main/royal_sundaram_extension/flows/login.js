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

  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
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

  function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    element.focus?.();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  function getStoredAgentConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['agentConfig'], (result) => {
        resolve(result.agentConfig || {});
      });
    });
  }

  function getStoredOtpConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['otpConfig'], (result) => {
        resolve(result.otpConfig || {});
      });
    });
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Login] ${step}`);
      return;
    }
    log(`[Login] ${step}`, details);
  }

  async function getUsername(payload) {
    if (payload?.agentDetails?.username || payload?.username) {
      return payload?.agentDetails?.username || payload?.username || '';
    }

    const agentConfig = await getStoredAgentConfig();
    return agentConfig.username || '';
  }

  async function waitForSignInButton(timeout = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await getController()?.checkpoint();
      const button = Array.from(document.querySelectorAll('button[type="submit"], button.btn.btn-primary'))
        .find((candidate) => isVisible(candidate) && candidate.textContent.trim().toLowerCase() === 'sign in');
      if (button) {
        return button;
      }
      await sleep(200);
    }

    throw new Error('Sign In button not found.');
  }

  async function waitForOtpInput(timeout = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await getController()?.checkpoint();
      const input =
        document.querySelector('#otp') ||
        document.querySelector('input[name="otp"]') ||
        document.querySelector('input[formcontrolname="otp"]') ||
        document.querySelector('input[placeholder*="otp" i]');
      if (isVisible(input)) return input;
      await sleep(200);
    }

    throw new Error('OTP input not found after Sign In.');
  }

  async function fetchOtp(log = console.log) {
    const cfg = await getStoredOtpConfig();
    const apiBase = cfg.apiBase || 'https://otpservice.coverscrafter.com/api/v1/otp';
    const label = cfg.label || 'Royal_sundaram';
    const email = cfg.email || 'coverscraftergk@gmail.com';
    const url = `${apiBase}/latest?label=${encodeURIComponent(label)}&mailbox_email=${encodeURIComponent(email)}`;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'FETCH_OTP', url }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (resp?.success && resp?.data?.otp) {
          log('Royal Sundaram OTP retrieved successfully from OTP service');
          resolve(resp.data);
          return;
        }
        reject(new Error(resp?.data?.message || resp?.error || 'No OTP found'));
      });
    });
  }

  async function fetchOtpWithRetry(log = console.log, attempts = 6, intervalMs = 15000) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        log(`Attempt ${attempt} to retrieve Royal Sundaram OTP from OTP service`);
        return await fetchOtp(log);
      } catch (error) {
        lastError = error;
        log(`Royal Sundaram OTP not found yet: ${error.message}`);
        if (attempt < attempts) await sleep(intervalMs);
      }
    }

    throw new Error(`OTP not found in OTP service: ${lastError?.message || 'No OTP found'}`);
  }

  function findValidateOtpButton() {
    return Array.from(document.querySelectorAll('button.btn.btn-primary, button[type="submit"], button'))
      .find((candidate) => isVisible(candidate) && candidate.textContent.trim().toLowerCase() === 'validate otp');
  }

  async function waitForValidateOtpButton(timeout = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await getController()?.checkpoint();
      const button = findValidateOtpButton();
      if (button) return button;
      await sleep(200);
    }

    throw new Error('Validate OTP button not found.');
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing login page', 'login:start');
    await waitForPageReady(log);
    logStep(log, 'Flow started');
    const username = await getUsername(payload);
    if (!username) {
      return { success: false, error: 'Missing agentDetails.username in payload.' };
    }

    await checkpoint('Waiting for username input', 'login:wait-username');
    logStep(log, 'Resolved username for login fill');
    log('Filling username on Royal Sundaram login page');
    const usernameInput = await waitForElement('input#uName[formcontrolname="uName"]');
    await checkpoint('Entering username', 'login:username');
    await waitForPageReady(log);
    logStep(log, 'Username input located');
    usernameInput.scrollIntoView({ block: 'center' });
    usernameInput.focus();
    usernameInput.click();
    setNativeInputValue(usernameInput, '');
    await sleep(100);
    setNativeInputValue(usernameInput, username);
    logStep(log, 'Username value entered', { username });

    if (usernameInput.value !== username) {
      return { success: false, error: 'Username field value did not update.' };
    }

    await checkpoint('Waiting for Sign In button', 'login:wait-signin');
    const signInButton = await waitForSignInButton();
    await checkpoint('Clicking Sign In button', 'login:click-signin');
    await waitForPageReady(log);
    clickElement(signInButton);
    logStep(log, 'Sign In button clicked');

    await checkpoint('Waiting for OTP input', 'login:wait-otp');
    const otpInput = await waitForOtpInput();
    logStep(log, 'OTP input located');

    await checkpoint('Fetching OTP', 'login:fetch-otp');
    const otpData = await fetchOtpWithRetry(log);
    const otp = String(otpData.otp || '').trim();
    if (!otp) {
      return { success: false, error: 'OTP service returned empty OTP.' };
    }

    await checkpoint('Entering OTP', 'login:otp');
    otpInput.scrollIntoView({ block: 'center' });
    otpInput.focus();
    otpInput.click();
    setNativeInputValue(otpInput, '');
    await sleep(100);
    setNativeInputValue(otpInput, otp);
    logStep(log, 'OTP value entered');

    await checkpoint('Validating OTP', 'login:validate-otp');
    const validateOtpButton = await waitForValidateOtpButton();
    clickElement(validateOtpButton);
    logStep(log, 'Validate OTP clicked');

    return { success: true, message: 'Username, OTP, and Validate OTP completed.' };
  }

  window.RoyalLogin = { run };
})();
