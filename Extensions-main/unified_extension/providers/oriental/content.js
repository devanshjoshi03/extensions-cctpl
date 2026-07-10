(function () {
  'use strict';

  const OTP_MAX_ATTEMPTS = 6;
  const OTP_INTERVAL = 15000;
  const CAPTCHA_MAX_ATTEMPTS = 3;
  let currentStartRunId = 0;

  function log(...args) {
    console.log('%c[Oriental]', 'color: #e94560; font-weight: bold;', ...args);
  }

  async function sleep(ms) {
    const deadline = Date.now() + Math.max(0, Number(ms) || 0);
    while (Date.now() < deadline) {
      let state = null;
      try {
        if (typeof AutomationPauseController !== 'undefined') {
          state = AutomationPauseController.getState();
        }
      } catch (_) {}
      if (state?.isStopped) throw new Error('AUTOMATION_STOPPED');
      while (state?.isPaused) {
        await new Promise((r) => setTimeout(r, 100));
        state = AutomationPauseController?.getState?.() || null;
        if (state?.isStopped) throw new Error('AUTOMATION_STOPPED');
      }
      await new Promise((r) => setTimeout(r, Math.min(100, Math.max(0, deadline - Date.now()))));
    }
  }

  function waitForElement(selector, timeout = 10000, parent = document) {
    return new Promise((resolve, reject) => {
      const el = parent.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = parent.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(parent === document ? document.body : parent, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  function waitForElementByText(tagName, text, timeout = 10000, parent = document) {
    const searchText = text.toLowerCase().trim();
    const check = (root) => {
      const els = root.querySelectorAll(tagName);
      for (const el of els) {
        if (el.textContent.trim().toLowerCase().includes(searchText)) return el;
      }
      return null;
    };
    return new Promise((resolve, reject) => {
      const found = check(parent);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = check(parent);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(parent === document ? document.body : parent, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout: element with text "' + text + '"')); }, timeout);
    });
  }

  function setInputValue(el, value) {
    el.focus();
    el.click();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return el.value === value;
  }

  function validate(el, expected, name) {
    const ok = el.value === expected;
    log(ok ? `✅ ${name} OK` : `❌ ${name} FAIL: got "${el.value}"`);
    return ok;
  }

  function safeClick(el) {
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return true;
  }

  function assertCurrentRun(runId) {
    if (runId == null) return;
    if (runId !== currentStartRunId) {
      throw new Error('AUTOMATION_SUPERSEDED');
    }
  }

  async function fillField(selector, value, name) {
    const field = document.querySelector(selector);
    if (!field) throw new Error(`${name} field not found (${selector})`);
    setInputValue(field, '');
    await sleep(100);
    setInputValue(field, value);
    await sleep(200);
    if (!validate(field, value, name)) {
      log(`🔄 Retrying ${name}...`);
      field.focus();
      setInputValue(field, '');
      await sleep(100);
      for (const ch of value) {
        setInputValue(field, field.value + ch);
        await sleep(15);
      }
      await sleep(150);
      if (!validate(field, value, name)) throw new Error(`Failed to fill ${name}`);
    }
    return field;
  }

  function clickCaptchaCell(canvas, index) {
    const rect = canvas.getBoundingClientRect();
    const cellW = rect.width / 3;
    const cellH = rect.height / 3;
    const col = index % 3;
    const row = Math.floor(index / 3);
    const clientX = rect.left + col * cellW + cellW / 2;
    const clientY = rect.top + row * cellH + cellH / 2;
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX, clientY, pointerId: 1, pointerType: 'mouse'
      }));
    });
  }

  async function getCaptchaImageData(canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      log('⚠️ Canvas tainted, capturing tab...');
      const rect = canvas.getBoundingClientRect();
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'CAPTURE_TAB' }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.dataUrl) {
            return reject(new Error('Tab capture failed'));
          }
          const img = new Image();
          img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            const c = document.createElement('canvas');
            c.width = rect.width * dpr;
            c.height = rect.height * dpr;
            const ctx = c.getContext('2d');
            ctx.drawImage(img,
              rect.left * dpr, rect.top * dpr,
              rect.width * dpr, rect.height * dpr,
              0, 0, c.width, c.height
            );
            resolve(c.toDataURL('image/png'));
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = resp.dataUrl;
        });
      });
    }
  }

  async function solveCaptcha() {
    log('🔐 Checking for AWS WAF CAPTCHA...');
    let captchaEl = null;
    try {
      captchaEl = await waitForElement('awswaf-captcha', 10000);
    } catch (e) {
      log('ℹ️ No CAPTCHA detected');
      return false;
    }
    log('✅ CAPTCHA element found');

    for (let attempt = 1; attempt <= CAPTCHA_MAX_ATTEMPTS; attempt++) {
      log(`🔄 CAPTCHA attempt ${attempt}/${CAPTCHA_MAX_ATTEMPTS}`);
      await sleep(1000);

      const shadow = captchaEl.shadowRoot;
      if (!shadow) {
        log('❌ Cannot access CAPTCHA shadow DOM');
        return false;
      }

      const challengeDiv = shadow.querySelector('div[tabindex="-1"]');
      let challengeText = '';
      if (challengeDiv) {
        const em = challengeDiv.querySelector('em');
        challengeText = em ? em.textContent.trim() : challengeDiv.textContent.trim();
      }
      log('🎯 Challenge:', challengeText);

      const canvas = shadow.querySelector('canvas');
      if (!canvas) {
        log('❌ CAPTCHA canvas not found');
        return false;
      }

      let imageData;
      try {
        imageData = await getCaptchaImageData(canvas);
      } catch (e) {
        log('❌ Failed to get CAPTCHA image:', e.message);
        return false;
      }

      log('📡 Sending to OpenAI...');
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'SOLVE_CAPTCHA',
          challengeText,
          imageData
        }, resolve);
      });

      if (!result || !result.success || !result.indices || result.indices.length === 0) {
        log('❌ CAPTCHA solve failed:', result?.error);
        const refreshBtn = shadow.querySelector('#amzn-btn-refresh-internal');
        if (refreshBtn) { refreshBtn.click(); await sleep(1000); }
        continue;
      }

      log('✅ Solution:', result.indices);

      for (const idx of result.indices) {
        clickCaptchaCell(canvas, idx);
        await sleep(250);
        log(`✅ Clicked cell ${idx}`);
      }

      await sleep(500);

      const confirmBtn = shadow.querySelector('#amzn-btn-verify-internal');
      if (confirmBtn) {
        confirmBtn.click();
        log('✅ Clicked Confirm');
      }

      await sleep(2000);

      const errorAlert = shadow.querySelector('[role="alert"]');
      if (errorAlert && errorAlert.style.display !== 'none' && errorAlert.textContent.includes('try again')) {
        log('⚠️ CAPTCHA failed, retrying...');
        const refreshBtn = shadow.querySelector('#amzn-btn-refresh-internal');
        if (refreshBtn) { refreshBtn.click(); await sleep(1000); }
        continue;
      }

      const stillThere = document.querySelector('awswaf-captcha');
      if (!stillThere || !stillThere.shadowRoot?.querySelector('canvas')) {
        log('✅ CAPTCHA solved!');
        return true;
      }

      log('⚠️ CAPTCHA may not be solved yet...');
    }

    log('❌ CAPTCHA failed after all attempts');
    return false;
  }

  async function getOTPConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['otpConfig'], (r) => {
        resolve(r.otpConfig || {
          email: 'otpcoverscrafter@gmail.com',
          label: 'ORIENTAL_INSURANCE',
          apiBase: 'https://otpservice.coverscrafter.com/api/v1/otp'
        });
      });
    });
  }

  async function fetchOTPFromAPI() {
    const cfg = await getOTPConfig();
    const url = `${cfg.apiBase}/latest?label=${encodeURIComponent(cfg.label)}&mailbox_email=${encodeURIComponent(cfg.email)}`;
   
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'FETCH_OTP', url }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp && resp.success && resp.data && resp.data.otp) {
          resolve(resp.data.otp);
        } else {
          reject(new Error(resp?.data?.message || resp?.error || 'No OTP'));
        }
      });
    });
  }

  async function fetchOTPWithRetry() {
    for (let i = 1; i <= OTP_MAX_ATTEMPTS; i++) {
      log(`🔄 OTP attempt ${i}/${OTP_MAX_ATTEMPTS}...`);
      try {
        const otp = await fetchOTPFromAPI();
        log(`✅ OTP received: ${otp}`);
        return otp;
      } catch (e) {
        log(`⚠️ Attempt ${i} failed: ${e.message}`);
        if (i < OTP_MAX_ATTEMPTS) {
          log(`⏳ Waiting ${OTP_INTERVAL / 1000}s...`);
          await sleep(OTP_INTERVAL);
        }
      }
    }
    throw new Error('OTP fetch failed after all attempts');
  }

  async function handleOTP() {
    log('🔐 Checking for OTP...');
    let otpInput = null;
    try {
      otpInput = await waitForElement('input[type="text"][placeholder*="OTP"], input[name*="otp"], input[id*="otp"], .otp-input, input[maxlength="6"]', 10000);
    } catch (e) {
      log('ℹ️ No OTP detected');
      return false;
    }

    await sleep(5000);
    log('✅ OTP input found, fetching...');
    const otp = await fetchOTPWithRetry();

    const otpInputs = document.querySelectorAll('input[type="text"][maxlength="1"], .otp-input input');
    if (otpInputs.length >= 4) {
      for (let i = 0; i < otp.length && i < otpInputs.length; i++) {
        setInputValue(otpInputs[i], otp[i]);
        await sleep(50);
      }
    } else if (otpInput) {
      setInputValue(otpInput, otp);
    }

    await sleep(250);

    let otpSubmit = null;
    for (const btn of document.querySelectorAll('button')) {
      const txt = btn.textContent.trim().toLowerCase();
      if (txt.includes('verify') || txt.includes('submit') || txt.includes('confirm') || txt.includes('validate')) {
        otpSubmit = btn; break;
      }
    }
    if (otpSubmit) { safeClick(otpSubmit); await sleep(1500); }

    return true;
  }

  async function performLogin(payload, runId) {
    const creds = payload.agentDetails;
    assertCurrentRun(runId);
    log('🚀 Starting login...');
    log('Username:', creds.username);

    try {
      await sleep(1000);
      assertCurrentRun(runId);

      const banner = document.querySelector('.homepage-banner-popup');
      if (banner) {
        log('📢 Closing banner...');
        const closeBtn = banner.querySelector('.p-dialog-header-close');
        if (closeBtn) { safeClick(closeBtn); await sleep(500); }
        const overlay = document.querySelector('.p-dialog-mask');
        if (overlay) { overlay.click(); await sleep(250); }
      }

      await sleep(500);
      assertCurrentRun(runId);

      let loginBtn = document.querySelector('#login-btn') || document.querySelector('.login-btn');
      if (!loginBtn) {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent.trim().toLowerCase().includes('login') && !btn.classList.contains('p-dialog-header-close')) {
            loginBtn = btn; break;
          }
        }
      }
      if (!loginBtn) {
        // if button not found then check userrole class contain username text  if not then throw error other wise give success response
        const userRole = document.querySelector('.userrole');
        if (!userRole) throw new Error('User role not found');
        if (!userRole.textContent.trim()) throw new Error('Username is not visible on page');
        log('✅ Username is visible on page');
        return { success: true };
      }

      safeClick(loginBtn);
      await sleep(1000);
      assertCurrentRun(runId);

      try { await waitForElement('.login-popup-box', 8000); } catch (e) {
        if (!document.querySelector('.popup-form.login-popup-box')) throw new Error('Login dialog not found');
      }
      await sleep(500);
      assertCurrentRun(runId);

      const tabs = document.querySelectorAll('.p-tabview-nav-link');
      if (tabs.length > 0 && !tabs[0].closest('li').classList.contains('p-tabview-selected')) {
        safeClick(tabs[0]);
        await sleep(250);
      }

      await fillField('#username', creds.username, 'Username');
      await fillField('#password', creds.password, 'Password');
      assertCurrentRun(runId);

      const uField = document.querySelector('#username');
      const pField = document.querySelector('#password');
      if (!validate(uField, creds.username, 'Username (final)') || !validate(pField, creds.password, 'Password (final)')) {
        throw new Error('Final validation failed');
      }

      // Auto-solve captcha on the login form
      log('🔐 Solving login captcha...');
      const captchaInput = document.querySelector('#captcha');
      // Only refresh if captcha wasn't already auto-filled by the MAIN world hook
      if (!captchaInput || !captchaInput.value || captchaInput.value.length < 4) {
        document.documentElement.setAttribute('data-captcha-reset', '1');
        const refreshCaptchaBtn = document.querySelector('button[aria-label="Refresh CAPTCHA image"]');
        if (refreshCaptchaBtn) {
          safeClick(refreshCaptchaBtn);
          log('[CAPTCHA] Clicked refresh');
        }
        if (captchaInput) {
          for (let i = 0; i < 30; i++) {
            await sleep(150);
            if (captchaInput.value && captchaInput.value.length >= 4) break;
          }
        }
      }
      if (captchaInput) {
        log('[CAPTCHA] Value:', captchaInput.value);
      }
      assertCurrentRun(runId);

      const submitBtn = document.querySelector('#continue-btn');
      if (!submitBtn) throw new Error('Submit button not found');
      safeClick(submitBtn);
      log('🎉 Login submitted!');

      await sleep(1500);
      assertCurrentRun(runId);

      let hasError = false;
      document.querySelectorAll('.error-msg, .error-message').forEach(el => {
        if (el.textContent.trim()) { log('❌ Error:', el.textContent.trim()); hasError = true; }
      });

      if (hasError) return { success: false };
      assertCurrentRun(runId);

      await sleep(1000);
      assertCurrentRun(runId);
     
      // Set automation flags BEFORE navigation so they survive page unload.
      // The LOGIN_RESULT message to background.js is unreliable because
      // window.location.href starts unloading the page immediately.
      await new Promise((resolve) => {
        chrome.storage.local.set({
          clickGetQuoteAfterLoad: true,
          orientalFormPayload: payload
        }, resolve);
      });
      log('✅ Automation flags saved to storage');

      // redirect on motor policy page
      window.location.href = 'https://orientalinsurance.org.in/policy/motor/TWO_WHEELER';

      log('✅ Login flow complete!');
      return { success: true };
    } catch (err) {
      log('❌ Failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async function clickGetQuoteButtonIfPending() {
    const r = await chrome.storage.local.get(['clickGetQuoteAfterLoad', 'orientalFormPayload']);
    if (!r.clickGetQuoteAfterLoad || !window.location.href.includes('TWO_WHEELER')) return;
    await chrome.storage.local.remove(['clickGetQuoteAfterLoad', 'orientalFormPayload']);
    const formPayload = r.orientalFormPayload || {};
    try {
      log('🔍 Selecting Brand New Vehicle...');
      const brandNewRadio = await waitForElement('input[value="BRAND_NEW"]', 10000)
        .catch(() => waitForElementByText('label', 'Brand New Vehicle', 5000));
      if (brandNewRadio) {
        const el = brandNewRadio.matches('input') ? brandNewRadio : brandNewRadio.querySelector('input') || brandNewRadio;
        safeClick(el);
        log('✅ Selected Brand New Vehicle');
        await sleep(250);
      }

      log('🔍 Looking for Get Quote button by text...');
      const btn = await waitForElementByText('button', 'get quote', 15000)
        .catch(() => waitForElementByText('a', 'get quote', 5000));
      if (btn) {
        safeClick(btn);
        log('✅ Clicked Get Quote button');
        await sleep(1000);

        if (typeof OrientalForm !== 'undefined' && OrientalForm.run) {
          log('📋 Starting Oriental form section...');
          if (typeof AutomationPauseController !== 'undefined') {
            AutomationPauseController.startRun();
          }
          const formResult = await OrientalForm.run(formPayload, log);
          log(formResult?.success ? '✅ Form flow complete' : '⚠️ Form flow:', formResult?.error || 'done');
        } else {
          log('⚠️ OrientalForm not available');
        }
        
        if (typeof OrientalKYC !== 'undefined' && OrientalKYC.run) {
          log('📋 Starting Oriental KYC section...');
          const kycResult = await OrientalKYC.run({...formPayload,
            // proposalNumber:"R/211200/31/2026/PRTL/16480917"

          }, log);
          log(kycResult?.success ? '✅ KYC flow complete' : '⚠️ KYC flow:', kycResult?.error || 'done');
        } else {
          log('⚠️ OrientalKYC not available');
        }
      }
    } catch (e) {
      log('⚠️ Failed:', e.message);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_LOGIN') {
      const runId = ++currentStartRunId;
      sendResponse({ status: 'started' });
      performLogin(msg.payload, runId).then(result => {
        if (runId !== currentStartRunId) return;
        chrome.runtime.sendMessage({ action: 'LOGIN_RESULT', result, payload: msg.payload });
      });
      return true;
    }
    if (msg.action === 'PAUSE_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.pause();
        sendResponse({ status: 'paused' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }
    if (msg.action === 'RESUME_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.resume();
        sendResponse({ status: 'resumed' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }
    if (msg.action === 'STOP_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.stop();
        sendResponse({ status: 'stopped' });
      } else {
        sendResponse({ status: 'error', error: 'Controller not loaded' });
      }
      return true;
    }
    if (msg.action === 'GET_AUTOMATION_STATUS') {
      if (typeof AutomationPauseController !== 'undefined') {
        sendResponse(AutomationPauseController.getState());
      } else {
        sendResponse({ isRunning: false, isPaused: false, isStopped: false, currentStep: null });
      }
      return true;
    }
    if (msg.action === 'PING') { sendResponse({ status: 'alive' }); return true; }
  });

  log('📌 Loaded on:', window.location.href);

  // Inject the floating pause/resume panel
  if (typeof AutomationPauseController !== 'undefined') {
    AutomationPauseController.injectUI();
  }

  chrome.storage.local.get(['clickGetQuoteAfterLoad'], (r) => {
    if (r.clickGetQuoteAfterLoad && window.location.href.includes('TWO_WHEELER')) {
    // if (r.clickGetQuoteAfterLoad && window.location.href.includes('make-payments')) {
      setTimeout(() => clickGetQuoteButtonIfPending(), 2000);
    }
  });
})();
