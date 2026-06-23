(function () {
  'use strict';

  const CAPTCHA_MAX_ATTEMPTS = 3;

  const DEFAULT_USERNAME = 'MUMBAIGK01';
  const DEFAULT_PASSWORD = 'Coverscrafter@1';

  const SOMPO_POST_LOGIN_URL = 'https://agencyforce.universalsompo.com/Home/Dashboard';

  function log(...args) {
    console.log('%c[Sompo]', 'color: #e53935; font-weight: bold;', ...args);
  }

  window.addEventListener('sompo:download-blocked', (event) => {
    const detail = event.detail || {};
    log('🛑 Blocked download trigger:', detail.kind || 'unknown', detail.url || '');
  });

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
      setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout: element with text "${text}"`)); }, timeout);
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
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  async function fillField(selector, value, name) {
    const field = document.querySelector(selector);
    if (!field) throw new Error(`${name} field not found (${selector})`);
    setInputValue(field, '');
    await sleep(200);
    setInputValue(field, value);
    await sleep(400);
    if (!validate(field, value, name)) {
      log(`🔄 Retrying ${name}...`);
      field.focus();
      setInputValue(field, '');
      await sleep(200);
      for (const ch of value) {
        setInputValue(field, field.value + ch);
        await sleep(30);
      }
      await sleep(300);
      if (!validate(field, value, name)) throw new Error(`Failed to fill ${name}`);
    }
    return field;
  }

  // ── CAPTCHA ──────────────────────────────────────────────────────────────────

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
    log('🔐 Checking for CAPTCHA...');
    let captchaEl = null;
    try {
      captchaEl = await waitForElement('awswaf-captcha', 10000);
    } catch (e) {
      log('ℹ️ No AWS WAF CAPTCHA detected');
      return false;
    }
    log('✅ CAPTCHA element found');

    for (let attempt = 1; attempt <= CAPTCHA_MAX_ATTEMPTS; attempt++) {
      log(`🔄 CAPTCHA attempt ${attempt}/${CAPTCHA_MAX_ATTEMPTS}`);
      await sleep(2000);

      const shadow = captchaEl.shadowRoot;
      if (!shadow) { log('❌ Cannot access CAPTCHA shadow DOM'); return false; }

      const challengeDiv = shadow.querySelector('div[tabindex="-1"]');
      let challengeText = '';
      if (challengeDiv) {
        const em = challengeDiv.querySelector('em');
        challengeText = em ? em.textContent.trim() : challengeDiv.textContent.trim();
      }
      log('🎯 Challenge:', challengeText);

      const canvas = shadow.querySelector('canvas');
      if (!canvas) { log('❌ CAPTCHA canvas not found'); return false; }

      let imageData;
      try {
        imageData = await getCaptchaImageData(canvas);
      } catch (e) {
        log('❌ Failed to get CAPTCHA image:', e.message);
        return false;
      }

      log('📡 Sending to OpenAI...');
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'SOLVE_CAPTCHA', challengeText, imageData }, resolve);
      });

      if (!result || !result.success || !result.indices || result.indices.length === 0) {
        log('❌ CAPTCHA solve failed:', result?.error);
        const refreshBtn = shadow.querySelector('#amzn-btn-refresh-internal');
        if (refreshBtn) { refreshBtn.click(); await sleep(2000); }
        continue;
      }

      log('✅ Solution:', result.indices);
      for (const idx of result.indices) {
        clickCaptchaCell(canvas, idx);
        await sleep(500);
        log(`✅ Clicked cell ${idx}`);
      }

      await sleep(1000);
      const confirmBtn = shadow.querySelector('#amzn-btn-verify-internal');
      if (confirmBtn) { confirmBtn.click(); log('✅ Clicked Confirm'); }

      await sleep(2000);

      const errorAlert = shadow.querySelector('[role="alert"]');
      if (errorAlert && errorAlert.style.display !== 'none' && errorAlert.textContent.includes('try again')) {
        log('⚠️ CAPTCHA failed, retrying...');
        const refreshBtn = shadow.querySelector('#amzn-btn-refresh-internal');
        if (refreshBtn) { refreshBtn.click(); await sleep(2000); }
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

  // ── LOGIN ────────────────────────────────────────────────────────────────────

  async function runFullSompoLogin(payload) {
    const agent = payload?.agentDetails || {};
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(['agentConfig'], resolve);
    });
    const ac = stored.agentConfig || {};
    const username = agent.username || ac.username || DEFAULT_USERNAME;
    const password = agent.password || ac.password || DEFAULT_PASSWORD;

    if (!username || !password) {
      log('❌ Missing username or password');
      return { success: false, error: 'Missing username or password' };
    }

    log('🚀 Starting login flow...');
    log('Username:', username);
    log('Current URL:', window.location.href);

    try {
      if (window.location.href.includes('/Home/Dashboard')) {
        log('ℹ️ Dashboard URL detected. Skipping login.');
        return { success: true, skipped: true };
      }

      const userDisplay = document.querySelector('.user-name, .agent-name, [class*="username"], [class*="profile"]');
      if (userDisplay && userDisplay.textContent.trim()) {
        log('✅ Already logged in:', userDisplay.textContent.trim());
      } else {
        log('🔐 Executing SompoLogin...');
        if (typeof SompoLogin === 'undefined' || !SompoLogin.run) {
          throw new Error('SompoLogin module not loaded');
        }
        const result = await SompoLogin.run({ username, password }, log);
        if (!result.success) {
          log('❌ Login failed:', result.error);
          return result;
        }
        log('✅ Login successful');
      }

      log('⏳ Running post-login checks...');
      await solveCaptcha();
      await sleep(1500);

      log('✅ Login flow complete!');
      return { success: true };
    } catch (err) {
      log('❌ Failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── POST-LOGIN FORM FILLING ──────────────────────────────────────────────────

  async function handlePostLoginNavigation() {
    log('🔄 handlePostLoginNavigation called');
    const r = await chrome.storage.local.get(['sompoAfterLoginTwoWheeler', 'sompoFormPayload']);
    log('📦 Flags:', { sompoAfterLoginTwoWheeler: r.sompoAfterLoginTwoWheeler });
    
    if (!r.sompoAfterLoginTwoWheeler) {
      log('❌ sompoAfterLoginTwoWheeler flag not set, returning');
      return;
    }

    const href = window.location.href;
    log('📍 Current URL in handlePostLoginNavigation:', href);
    
    if (!href.includes('universalsompo.com') || !href.includes('TwoWheeler')) {
      log('❌ Not on Two Wheeler page, returning');
      return;
    }

    log('✅ On Two Wheeler page, starting form filling...');
    await chrome.storage.local.remove(['sompoAfterLoginTwoWheeler', 'sompoFormPayload']);
    const formPayload = r.sompoFormPayload || {};

    const setDownloadSuppression = (enabled) => new Promise((resolve) => {
      window.dispatchEvent(new CustomEvent('sompo:set-download-suppression', { detail: { enabled } }));
      chrome.runtime.sendMessage({ action: 'SET_DOWNLOAD_SUPPRESSION', enabled }, () => resolve());
    });

    try {
      await setDownloadSuppression(true);

      log('📋 Step 1/3: Running Quote Details…');
      if (typeof SompoQuoteDetails !== 'undefined' && SompoQuoteDetails.run) {
        const qr = await SompoQuoteDetails.run(formPayload, log);
        if (!qr?.success) { log('❌ Quote Details failed:', qr?.error); return; }
        log('✅ Quote Details complete');
      } else { log('⚠️ SompoQuoteDetails not loaded'); return; }

      await sleep(2000);

      log('📋 Step 2/4: Running Proposal Details…');
      if (typeof SompoProposalDetails !== 'undefined' && SompoProposalDetails.run) {
        const pr = await SompoProposalDetails.run(formPayload, log);
        if (!pr?.success) { log('❌ Proposal Details failed:', pr?.error); return; }
        log('✅ Proposal Details complete');
      } else { log('⚠️ SompoProposalDetails not loaded'); return; }

      await sleep(2000);

      log('📋 Step 3/4: Running Cover Details…');
      if (typeof SompoCoverDetails !== 'undefined' && SompoCoverDetails.run) {
        const cr = await SompoCoverDetails.run(formPayload, log);
        if (!cr?.success) { log('❌ Cover Details failed:', cr?.error); return; }
        log('✅ Cover Details complete');
      } else { log('⚠️ SompoCoverDetails not loaded'); return; }

      await sleep(2000);

      log('📋 Step 4/4: Running Additional Details…');
      if (typeof SompoAdditionalDetails !== 'undefined' && SompoAdditionalDetails.run) {
        const ar = await SompoAdditionalDetails.run(formPayload, log);
        if (!ar?.success) { log('❌ Additional Details failed:', ar?.error); return; }
        log('✅ Additional Details complete');
      } else { log('⚠️ SompoAdditionalDetails not loaded'); return; }

      log('✅✅✅ COMPLETE: All steps successfully automated! ✅✅✅');
    } catch (e) {
      log('❌ Post-login error:', e.message);
    } finally {
      await setDownloadSuppression(false);
    }
  }

  // ── MESSAGE LISTENER ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_LOGIN') {
      log('📨 Received START_LOGIN');
      sendResponse({ status: 'started' });
      runFullSompoLogin(msg.payload).then((result) => {
        chrome.runtime.sendMessage({ action: 'LOGIN_RESULT', result, payload: msg.payload });
      }).catch(err => log('❌ Unexpected error:', err.message));
      return true;
    }

    if (msg.action === 'START_FULL_FLOW') {
      log('📨 Received START_FULL_FLOW');
      sendResponse({ status: 'started' });

      (async () => {
        const currentUrl = window.location.href;
        log('📍 Current URL:', currentUrl);

        // Check if already on Two Wheeler form page - start QuoteDetails directly
        if (currentUrl.includes('/Motor/TwoWheeler')) {
          log('✅ Detected Two Wheeler page — starting Quote Details directly');
          const formPayload = msg.payload || {};
          
          try {
            log('📋 Starting Quote Details flow...');
            if (typeof SompoQuoteDetails !== 'undefined' && SompoQuoteDetails.run) {
              const qr = await SompoQuoteDetails.run(formPayload, log);
              if (!qr?.success) { 
                log('❌ Quote Details failed:', qr?.error); 
                chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result: qr, payload: formPayload });
                return; 
              }
              log('✅ Quote Details complete');
              chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result: { success: true }, payload: formPayload });
            } else { 
              log('⚠️ SompoQuoteDetails not loaded'); 
              chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result: { success: false, error: 'SompoQuoteDetails not loaded' }, payload: formPayload });
            }
          } catch (e) {
            log('❌ Quote Details error:', e.message);
            chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result: { success: false, error: e.message }, payload: formPayload });
          }
          return;
        }

        // Check if on Motor Dashboard or base agencyforce URL - skip login, go directly to Motor sidebar then form filling
        if (currentUrl.includes('/MotorDashboard') || currentUrl.includes('/USGI/Motor') ||
            currentUrl === 'https://agencyforce.universalsompo.com/' ||
            currentUrl === 'https://agencyforce.universalsompo.com') {
          log('✅ Detected Motor Dashboard — skipping login, navigating to Motor sidebar...');
          await new Promise((resolve) => {
            chrome.storage.local.set({
              sompoAfterLoginTwoWheeler: true,
              sompoFormPayload: msg.payload || {}
            }, resolve);
          });

          // Navigate to Motor → Two Wheeler using SompoLogin
          // Note: initOnTwoWheeler IIFE will detect the Two Wheeler page and start form filling
          if (typeof SompoLogin !== 'undefined' && SompoLogin.navigateToMotorSidebar) {
            const result = await SompoLogin.navigateToMotorSidebar(log);
            if (result.success) {
              log('✅ Motor → Two Wheeler navigation initiated — form filling will start when page loads...');
              // initOnTwoWheeler IIFE (lines ~581-601) will detect the Two Wheeler page and call handlePostLoginNavigation()
            } else {
              log('❌ Navigation failed:', result.error);
            }
          } else {
            log('⚠️ SompoLogin.navigateToMotorSidebar not available');
          }
          return;
        }

        // Check if on Dashboard - navigate to Motor sidebar directly
        if (currentUrl.includes('/Home/Dashboard')) {
          log('🔄 On Dashboard — navigating to Motor sidebar...');
          
          // Navigate to Motor → Two Wheeler using SompoLogin
          if (typeof SompoLogin !== 'undefined' && SompoLogin.navigateToMotorSidebar) {
            const result = await SompoLogin.navigateToMotorSidebar(log);
            if (result.success) {
              log('✅ Motor → Two Wheeler navigation complete');
            } else {
              log('❌ Navigation failed:', result.error);
            }
          } else {
            log('⚠️ SompoLogin.navigateToMotorSidebar not available');
          }
          return;
        }

        log('ℹ️ Not on Two Wheeler or Dashboard, running login flow...');

        // Run login flow (which includes AVO 2.0 switch click after login)
        const result = await runFullSompoLogin(msg.payload);
        if (!result.success) {
          log('❌ Login failed:', result.error);
          chrome.runtime.sendMessage({ action: 'FLOW_RESULT', result, payload: msg.payload });
          return;
        }

        log('✅ Login done, navigating to AgencyForce dashboard...');
        await new Promise((resolve) => {
          chrome.storage.local.set({
            sompoAfterLoginTwoWheeler: true,
            sompoFormPayload: msg.payload || {}
          }, resolve);
        });
        window.location.href = SOMPO_POST_LOGIN_URL;
      })();

      return true;
    }

    if (msg.action === 'START_POST_LOGIN_FLOWS') {
      log('📨 Received START_POST_LOGIN_FLOWS');
      sendResponse({ status: 'started' });
      handlePostLoginNavigation();
      return true;
    }

    if (msg.action === 'PAUSE_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.pause(); sendResponse({ status: 'paused' });
      } else { sendResponse({ status: 'error', error: 'Controller not loaded' }); }
      return true;
    }
    if (msg.action === 'RESUME_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.resume(); sendResponse({ status: 'resumed' });
      } else { sendResponse({ status: 'error', error: 'Controller not loaded' }); }
      return true;
    }
    if (msg.action === 'STOP_AUTOMATION') {
      if (typeof AutomationPauseController !== 'undefined') {
        AutomationPauseController.stop(); sendResponse({ status: 'stopped' });
      } else { sendResponse({ status: 'error', error: 'Controller not loaded' }); }
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

  // ── INIT ──────────────────────────────────────────────────────────────────────

  log('📌 Loaded on:', window.location.href);

  // Reset automation state on page reload
  if (typeof AutomationPauseController !== 'undefined') {
    AutomationPauseController.reset();
    log('🔄 Automation state reset on page load');
  }

  if (typeof AutomationPauseController !== 'undefined') {
    AutomationPauseController.injectUI();
  }

  // ── CORPORATE PORTAL PAGE HANDLER ────────────────────────────────────────────
  // After AVO 2.0 redirect, handle Motor → Two Wheeler navigation
  (function initOnCorporatePortal() {
    const href = window.location.href;
    if (!href.includes('corporateportal.universalsompo.com')) return;

    log('📌 Corporate Portal page detected');

    chrome.storage.local.get(['sompoAfterLoginTwoWheeler', 'sompoFormPayload'], async (r) => {
      if (!r.sompoAfterLoginTwoWheeler) {
        log('ℹ️ No active automation flag — standing by');
        return;
      }

      log('🚦 Post-redirect flag found — starting Motor → Two Wheeler navigation...');

      // Wait for sidebar to load
      await sleep(3000);

      // Navigate to Motor → Two Wheeler using SompoLogin
      if (typeof SompoLogin !== 'undefined' && SompoLogin.navigateToMotorSidebar) {
        const result = await SompoLogin.navigateToMotorSidebar(log);
        if (result.success) {
          log('✅ Motor → Two Wheeler navigation complete');
        } else {
          log('❌ Navigation failed:', result.error);
        }
      } else {
        log('⚠️ SompoLogin.navigateToMotorSidebar not available');
      }
    });
  })();

  // ── DASHBOARD PAGE HANDLER ────────────────────────────────────────────────────
  // After login redirect, handle AVO 2.0 switch on Dashboard
  (function initOnDashboard() {
    const href = window.location.href;
    if (!href.includes('/Home/Dashboard')) return;

    log('📌 Dashboard page detected');

    chrome.storage.local.get(['sompoAfterLoginTwoWheeler', 'sompoFormPayload'], async (r) => {
      if (!r.sompoAfterLoginTwoWheeler) {
        log('ℹ️ No active automation flag — standing by');
        return;
      }

      log('🚦 Post-login flag found — navigating to Motor sidebar...');

      // Navigate to Motor → Two Wheeler using SompoLogin
      if (typeof SompoLogin !== 'undefined' && SompoLogin.navigateToMotorSidebar) {
        const result = await SompoLogin.navigateToMotorSidebar(log);
        if (result.success) {
          log('✅ Motor → Two Wheeler navigation complete');
        } else {
          log('❌ Navigation failed:', result.error);
        }
      } else {
        log('⚠️ SompoLogin.navigateToMotorSidebar not available');
      }
    });
  })();

  // ── TWO WHEELER PAGE HANDLER ───────────────────────────────────────────────────
  // After Motor navigation, start form filling on Two Wheeler page
  (function initOnTwoWheeler() {
    const href = window.location.href;
    if (!href.includes('/Motor/TwoWheeler')) return;

    log('📌 Two Wheeler page detected');

    // Poll for automation flag with retries (storage might take time to sync)
    async function pollForAutomationFlag(attempts = 0) {
      if (attempts > 20) {
        log('ℹ️ No automation flag after 20 attempts — standing by');
        return;
      }

      const r = await chrome.storage.local.get(['sompoAfterLoginTwoWheeler', 'sompoFormPayload']);
      log(`🔍 Poll attempt ${attempts + 1}: sompoAfterLoginTwoWheeler = ${r.sompoAfterLoginTwoWheeler}`);

      if (!r.sompoAfterLoginTwoWheeler) {
        await sleep(500);
        return pollForAutomationFlag(attempts + 1);
      }

      log('🚦 Post-navigation flag found — starting form filling...');
      await sleep(1000);
      handlePostLoginNavigation();
    }

    pollForAutomationFlag();
  })();
})();