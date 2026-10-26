(() => {
  let flowRunning = false;
  let postLoginRunning = false;
  const readRun = () => new Promise((resolve) => chrome.storage.local.get('godigitRun', (result) => resolve(result.godigitRun || null)));
  window.GoDigitSetRun = (state) => new Promise((resolve) => chrome.storage.local.set({ godigitRun: state }, resolve));
  function report(message) {
    console.log(`[Go Digit] ${message}`);
    chrome.runtime.sendMessage({ action: 'GODIGIT_LOG', message }, () => void chrome.runtime.lastError);
  }
  async function run(payload, phase, isNewRun = false) {
    if (flowRunning) return;
    flowRunning = true;
    if (isNewRun) AutomationPauseController.startRun();
    report(`Starting Go Digit flow at ${phase} stage`);
    try {
      const result = await GoDigitLogin.run(payload, phase, report);
      if (result.otpSubmitted) report(result.otpMarkedUsed ? 'Login successful; OTP marked used.' : 'Login successful; OTP had no service ID to mark used.');
      chrome.runtime.sendMessage({ action: 'GODIGIT_FLOW_RESULT', result });
    } catch (error) {
      if (error.message === 'AUTOMATION_STOPPED') report('Automation stopped');
      else {
        await window.GoDigitSetRun({ active: false, phase: 'failed', payload });
        AutomationPauseController.complete(error.message);
        report(error.message);
        chrome.runtime.sendMessage({ action: 'GODIGIT_FLOW_RESULT', result: { success: false, error: error.message } });
      }
    } finally { flowRunning = false; }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_GODIGIT_LOGIN') {
      sendResponse({ status: 'started' });
      if (window.location.hostname === 'plus.godigit.com') {
        completeAfterRedirect({ active: true, phase: 'vehicle', payload: message.payload });
      }
      else run(message.payload, document.querySelector('#username') ? 'user' : document.querySelector('#phone') ? 'phone' : 'otp', true);
      return true;
    }
    if (message.action === 'CHECK_GODIGIT_SESSION') {
      checkAuthenticatedSession().then(
        (authenticated) => sendResponse({ authenticated }),
        (error) => {
          report(`Could not check Go Digit login status: ${error.message}`);
          sendResponse({ authenticated: false, error: error.message });
        }
      );
      return true;
    }
    if (message.action === 'PAUSE_AUTOMATION') { AutomationPauseController.pause(); sendResponse({ status: 'paused' }); return true; }
    if (message.action === 'RESUME_AUTOMATION') { AutomationPauseController.resume(); sendResponse({ status: 'resumed' }); return true; }
    if (message.action === 'STOP_AUTOMATION') { AutomationPauseController.stop(); window.GoDigitSetRun({ active: false, phase: 'stopped' }); sendResponse({ status: 'stopped' }); return true; }
    if (message.action === 'GET_AUTOMATION_STATUS') { sendResponse(AutomationPauseController.getStatus()); return true; }
  });
  AutomationPauseController.injectUI();
  async function checkAuthenticatedSession() {
    const visibleLogout = () => [...document.querySelectorAll('.dropdown-content a')]
      .some((link) => link.textContent.trim().toLowerCase() === 'logout' &&
        link.getClientRects().length > 0 &&
        getComputedStyle(link).visibility !== 'hidden');
    if (visibleLogout()) return true;
    const menuDeadline = Date.now() + 5000;
    let accountMenu;
    while (!accountMenu && Date.now() < menuDeadline) {
      accountMenu = document.querySelector('.dropbtn.display-flex');
      if (!accountMenu) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!accountMenu) return false;
    accountMenu.click();
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (visibleLogout()) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }
  async function completeAfterRedirect(state) {
    const runState = state || await readRun();
    if (!runState?.active || !['otp', 'vehicle'].includes(runState.phase) || postLoginRunning) return;
    postLoginRunning = true;
    try {
      AutomationPauseController.startRun();
      if (runState.phase === 'otp') {
        if (runState.lastOtpId) {
          try { await GoDigitLogin.markOtpAsUsed(runState.lastOtpId, report); }
          catch (error) { report(`Login succeeded; OTP mark-used failed: ${error.message}`); }
        } else report('Login succeeded; OTP service returned no ID to mark used.');
        runState.phase = 'vehicle';
        await window.GoDigitSetRun(runState);
      }
      if (!runState.payload?.vehicleDetails) {
        await window.GoDigitSetRun({ ...runState, active: false, phase: 'complete' });
        AutomationPauseController.complete('Login successful');
        return;
      }
      const result = await GoDigitMotorFlow.run(runState.payload, report);
      await window.GoDigitSetRun({ ...runState, active: false, phase: 'complete' });
      const savedMessage = result.quoteNumber
        ? `Quote ${result.quoteNumber} saved; ready to generate policy`
        : 'Quote saved; ready to generate policy';
      AutomationPauseController.complete(result.quoteSaved ? savedMessage : result.quoteSubmitted ? 'Quote, customer and vehicle details filled' : result.success ? 'Vehicle details filled' : 'Vehicle flow failed');
    } catch (error) {
      if (runState) await window.GoDigitSetRun({ ...runState, active: false, phase: 'vehicle-failed' });
      AutomationPauseController.complete(error.message);
      report(error.message);
    } finally {
      postLoginRunning = false;
    }
  }
  readRun().then((state) => {
    if (window.location.hostname === 'plus.godigit.com') completeAfterRedirect(state);
    else if (state?.active && ['user', 'otp'].includes(state.phase)) run(state.payload, state.phase);
  });
})();