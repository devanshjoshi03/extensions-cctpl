(function () {
  'use strict';

  // Block ALL dialogs globally - no alerts anywhere in the entire extension
  if (typeof window !== 'undefined') {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};
  }

  function log(...args) {
    console.log('%c[Bajaj]', 'color: #0054A6; font-weight: bold;', ...args);
  }

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

  // ── LOGIN FLOW ─────────────────────────────────────────────────────────────

  async function runFullBajajLogin(payload) {
    log('🚀 Starting Bajaj login flow...');
    log('Current URL:', window.location.href);

    try {
      // Check if already on Bajaj login page
      if (!window.location.href.includes('portal.bajajgeneral.com')) {
        log('🔄 Navigating to Bajaj login page...');
        window.location.href = 'https://portal.bajajgeneral.com/BagicNxt/plogin.jsp';
        return { success: true, navigated: true };
      }

      // Execute login
      if (typeof BajajLogin === 'undefined' || !BajajLogin.run) {
        throw new Error('BajajLogin module not loaded');
      }

      const result = await BajajLogin.run(payload, log);
      if (!result.success) {
        log('❌ Login failed:', result.error);
        return result;
      }

      log('✅ Login successful');
      return { success: true };
    } catch (err) {
      log('❌ Login error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── FORM FLOW ─────────────────────────────────────────────────────────────

  async function runBajajFormFlow(payload) {
    log('🚀 Starting Bajaj form flow...');
    log('Current URL:', window.location.href);

    try {
      // Check if on partner login page
      if (!window.location.href.includes('portal.bajajgeneral.com/BagicNxt/partner/login.do')) {
        log('❌ Not on partner login page for form flow');
        return { success: false, error: 'Not on partner login page' };
      }

      // Execute form flow
      if (typeof BajajForm === 'undefined' || !BajajForm.run) {
        throw new Error('BajajForm module not loaded');
      }

      const result = await BajajForm.run(payload, log);
      if (!result.success) {
        log('❌ Form flow failed:', result.error);
        return result;
      }

      log('✅ Form flow completed successfully');
      return { success: true };
    } catch (err) {
      log('❌ Form flow error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async function runBajajVehicleDetailsFlow(payload) {
    log('🚀 Starting Bajaj vehicle details flow...');

    try {
      // Check if on vehicle details page
      if (!window.location.href.includes('motorload.do')) {
        log('❌ Not on vehicle details page. Current URL:', window.location.href);
        return { success: false, error: 'Not on vehicle details page' };
      }

      // Execute vehicle details flow
      if (typeof BajajVehicleDetails === 'undefined' || !BajajVehicleDetails.run) {
        throw new Error('BajajVehicleDetails module not loaded');
      }

      const result = await BajajVehicleDetails.run(payload, log);
      if (!result.success) {
        log('❌ Vehicle details flow failed:', result.error);
        return result;
      }

      log('✅ Vehicle details flow completed successfully');
      return { success: true };
    } catch (err) {
      log('❌ Vehicle details flow error:', err.message);
      return { success: false, error: err.message };
    }
  }

  // ── MESSAGE LISTENER ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_LOGIN') {
      log('📨 Received START_LOGIN');
      sendResponse({ status: 'started' });

      (async () => {
        try {
          const result = await runFullBajajLogin(msg.payload);
          
          // If login result indicates we should start vehicle details flow, do it
          if (result.startVehicleDetailsFlow) {
            log('🔄 Starting vehicle details flow from login result...');
            const vehicleResult = await runBajajVehicleDetailsFlow(msg.payload);
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result: vehicleResult, 
              payload: msg.payload 
            });
          } else if (result.startFormFlow) {
            log('🔄 Starting form flow from login result...');
            const formResult = await runBajajFormFlow(msg.payload);
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result: formResult, 
              payload: msg.payload 
            });
          } else {
            chrome.runtime.sendMessage({ 
              action: 'LOGIN_RESULT', 
              result, 
              payload: msg.payload 
            });
          }
        } catch (e) {
          log('❌ Login error:', e.message);
          chrome.runtime.sendMessage({ 
            action: 'LOGIN_RESULT', 
            result: { success: false, error: e.message }, 
            payload: msg.payload 
          });
        }
      })();

      return true;
    }

    if (msg.action === 'START_VEHICLE_DETAILS') {
      log('📨 Received START_VEHICLE_DETAILS');
      log('📍 Current URL:', window.location.href);
      sendResponse({ status: 'started' });

      (async () => {
        try {
          // Check if already on motorload.do - if so, run vehicle details directly
          if (window.location.href.includes('motorload.do')) {
            log('✅ Already on vehicle details page, running vehicle details flow directly...');
            const result = await runBajajVehicleDetailsFlow(msg.payload);
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result, 
              payload: msg.payload 
            });
          } else {
            log('⚠️ Not on motorload.do page, but received START_VEHICLE_DETAILS message');
            log('ℹ️ Current page:', window.location.href);
            const result = { success: false, error: 'Not on vehicle details page (motorload.do)' };
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result, 
              payload: msg.payload 
            });
          }
        } catch (e) {
          log('❌ Vehicle details error:', e.message);
          chrome.runtime.sendMessage({ 
            action: 'FLOW_RESULT', 
            result: { success: false, error: e.message }, 
            payload: msg.payload 
          });
        }
      })();

      return true;
    }

    if (msg.action === 'START_AUTOMATION') {
      log('📨 Received START_AUTOMATION');
      sendResponse({ status: 'started' });

      (async () => {
        try {
          let result;
          
          // Check current URL to decide which flow to run
          if (window.location.href.includes('motorload.do')) {
            log('📍 Already on vehicle details page, skipping form flow...');
            result = await runBajajVehicleDetailsFlow(msg.payload);
          } else if (window.location.href.includes('login.do')) {
            log('📍 On login page, running form flow first...');
            const formResult = await runBajajFormFlow(msg.payload);
            if (formResult.success) {
              log('✅ Form flow completed, vehicle details flow will be triggered automatically');
              result = formResult;
            } else {
              result = formResult;
            }
          } else {
            log('❌ Not on a supported page. Current URL:', window.location.href);
            result = { success: false, error: 'Not on a supported page (login.do or motorload.do)' };
          }

          chrome.runtime.sendMessage({ 
            action: 'FLOW_RESULT', 
            result, 
            payload: msg.payload 
          });
        } catch (e) {
          log('❌ Automation error:', e.message);
          chrome.runtime.sendMessage({ 
            action: 'FLOW_RESULT', 
            result: { success: false, error: e.message }, 
            payload: msg.payload 
          });
        }
      })();

      return true;
    }

    if (msg.action === 'START_FORM_FILL') {
      log('📨 Received START_FORM_FILL');
      log('📍 Current URL:', window.location.href);
      sendResponse({ status: 'started' });

      (async () => {
        try {
          // Check if already on motorload.do - if so, skip form and run vehicle details directly
          if (window.location.href.includes('motorload.do')) {
            log('✅ Already on vehicle details page, skipping form flow and running vehicle details directly...');
            const result = await runBajajVehicleDetailsFlow(msg.payload);
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result, 
              payload: msg.payload 
            });
          } else {
            log('📍 Not on motorload.do, running form flow...');
            const result = await runBajajFormFlow(msg.payload);
            chrome.runtime.sendMessage({ 
              action: 'FLOW_RESULT', 
              result, 
              payload: msg.payload 
            });
          }
        } catch (e) {
          log('❌ Form filling error:', e.message);
          chrome.runtime.sendMessage({ 
            action: 'FLOW_RESULT', 
            result: { success: false, error: e.message }, 
            payload: msg.payload 
          });
        }
      })();

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

  log('📌 Bajaj Extension loaded on:', window.location.href);

  // Reset automation state on page reload
  if (typeof AutomationPauseController !== 'undefined') {
    AutomationPauseController.reset();
    log('🔄 Automation state reset on page load');
  }

  if (typeof AutomationPauseController !== 'undefined') {
    AutomationPauseController.injectUI();
  }

  log('ℹ️ Bajaj Extension ready - login flow available');
})();
