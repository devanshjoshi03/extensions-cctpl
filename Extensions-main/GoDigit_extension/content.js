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
      if (window.location.hostname === 'plus.godigit.com') completeAfterRedirect();
      else run(message.payload, document.querySelector('#username') ? 'user' : document.querySelector('#phone') ? 'phone' : 'otp', true);
      return true;
    }
    if (message.action === 'PAUSE_AUTOMATION') { AutomationPauseController.pause(); sendResponse({ status: 'paused' }); return true; }
    if (message.action === 'RESUME_AUTOMATION') { AutomationPauseController.resume(); sendResponse({ status: 'resumed' }); return true; }
    if (message.action === 'STOP_AUTOMATION') { AutomationPauseController.stop(); window.GoDigitSetRun({ active: false, phase: 'stopped' }); sendResponse({ status: 'stopped' }); return true; }
    if (message.action === 'GET_AUTOMATION_STATUS') { sendResponse(AutomationPauseController.getStatus()); return true; }
  });
  AutomationPauseController.injectUI();
  async function completeAfterRedirect(state) {
    if (postLoginRunning) return;
    const runState = state || await readRun();
    if (!runState?.active || !['otp', 'vehicle'].includes(runState.phase)) return;
    postLoginRunning = true;
    AutomationPauseController.startRun();
    try {
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
      AutomationPauseController.complete(result.quoteSubmitted ? 'Quote and customer details filled' : result.success ? 'Vehicle details filled' : 'Vehicle flow failed');
    } catch (error) {
      await window.GoDigitSetRun({ ...runState, active: false, phase: 'vehicle-failed' });
      AutomationPauseController.complete(error.message);
      report(error.message);
    } finally { postLoginRunning = false; }
  }
  readRun().then((state) => {
    if (window.location.hostname === 'plus.godigit.com') completeAfterRedirect(state);
    else if (state?.active && ['user', 'otp'].includes(state.phase)) run(state.payload, state.phase);
  });
})();