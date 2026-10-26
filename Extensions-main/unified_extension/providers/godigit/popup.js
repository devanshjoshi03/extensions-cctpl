document.addEventListener('DOMContentLoaded', () => {
  const jsonInput = document.getElementById('json-input');
  const startBtn = document.getElementById('start-btn');
  const statusEl = document.getElementById('status');
  const pauseBtn = document.getElementById('pause-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const stopBtn = document.getElementById('stop-btn');
  const controls = document.getElementById('automation-controls');
  const statusRow = document.getElementById('auto-status');
  const badge = document.getElementById('auto-badge');
  const step = document.getElementById('auto-step');
  const logsOutput = document.getElementById('logs-output');
  let pollTimer;
  chrome.storage.local.get(['godigitJSON', 'godigitLogs'], (result) => {
    if (result.godigitJSON) jsonInput.value = result.godigitJSON;
    renderLogs(result.godigitLogs || []);
  });
  function renderLogs(logs) {
    logsOutput.textContent = logs.length ? logs.map((entry) => `[${entry.time}] ${entry.message}`).join('\n') : 'No activity yet.';
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.godigitLogs) renderLogs(changes.godigitLogs.newValue || []);
  });
  const activeTab = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const send = (tabId, message) => new Promise((resolve) => chrome.tabs.sendMessage(tabId, message, (response) => resolve(chrome.runtime.lastError ? null : response)));
  function showMessage(message) { statusEl.textContent = message; }
  function updateStatus(state) {
    if (!state) return;
    controls.style.display = 'flex'; statusRow.style.display = 'flex';
    badge.textContent = state.isStopped ? 'Stopped' : state.isPaused ? 'Paused' : state.isRunning ? 'Running' : 'Idle';
    step.textContent = state.currentStep || 'Ready'; startBtn.disabled = state.isRunning && !state.isStopped;
    pauseBtn.style.display = state.isPaused ? 'none' : 'inline-block'; pauseBtn.disabled = !state.isRunning || state.isStopped;
    resumeBtn.style.display = state.isPaused ? 'inline-block' : 'none'; resumeBtn.disabled = !state.isPaused || state.isStopped;
    stopBtn.disabled = !state.isRunning || state.isStopped;
  }
  async function pollStatus() { const tab = await activeTab(); if (tab) updateStatus(await send(tab.id, { action: 'GET_AUTOMATION_STATUS' })); }
  async function control(action) {
    const tab = await activeTab(); if (!tab) return showMessage('No active tab');
    const response = await send(tab.id, { action });
    if (action === 'STOP_AUTOMATION' && response?.status === 'stopped') showMessage('Automation stopped');
    else if (!response) showMessage('Open the Go Digit login tab and retry');
    await pollStatus();
  }
  pauseBtn.addEventListener('click', () => control('PAUSE_AUTOMATION'));
  resumeBtn.addEventListener('click', () => control('RESUME_AUTOMATION'));
  stopBtn.addEventListener('click', () => control('STOP_AUTOMATION'));
  startBtn.addEventListener('click', async () => {
    let payload;
    try { payload = jsonInput.value.trim() ? JSON.parse(jsonInput.value.trim()) : {}; } catch (error) { showMessage(`Invalid JSON: ${error.message}`); return; }
    const tab = await activeTab(); if (!tab) return showMessage('No active tab');
    if (tab.url?.startsWith('https://plus.godigit.com/')) {
      const session = await send(tab.id, { action: 'CHECK_GODIGIT_SESSION' });
      if (!session) return showMessage('Could not check the Go Digit session. Reload the page and retry.');
      if (session.error) return showMessage(`Could not check the Go Digit session: ${session.error}`);
      if (session.authenticated) {
        await new Promise((resolve) => chrome.storage.local.set({
          godigitJSON: jsonInput.value.trim(),
          godigitLogs: [],
          godigitRun: { active: true, phase: 'vehicle', payload }
        }, resolve));
        const response = await send(tab.id, { action: 'START_GODIGIT_LOGIN', payload });
        if (response?.status !== 'started') return showMessage('Could not start vehicle details on Go Digit. Reload the page and retry.');
        showMessage('Existing Go Digit session detected. Filling vehicle details...');
        await pollStatus();
        return;
      }
    }
    const agent = payload?.agentDetails || payload?.agentdetails || {};
    const settings = await new Promise((resolve) => chrome.storage.local.get(['godigitAgentConfig'], resolve));
    payload.agentDetails = {
      ...agent,
      username: agent.username || settings.godigitAgentConfig?.username || '',
      usercode: agent.usercode || settings.godigitAgentConfig?.usercode || '',
      password: agent.password || settings.godigitAgentConfig?.password || ':OTP'
    };
    if (!/^\d{10}$/.test(String(payload.agentDetails.username).trim()) || !String(payload.agentDetails.usercode).trim()) {
      showMessage('agentDetails.username (10-digit phone) and agentDetails.usercode are required'); return;
    }
    await new Promise((resolve) => chrome.storage.local.set({ godigitJSON: jsonInput.value.trim(), godigitLogs: [], godigitRun: { active: false, phase: 'starting', payload } }, resolve));
    const loginUrl = 'https://accounts.godigit.com/auth/realms/ABS-21/protocol/openid-connect/auth?client_id=DigitPlus&redirect_uri=https%3A%2F%2Fplus.godigit.com%2F%23%2Fmotor-new&state=ce36f05d-5ce6-409c-8dc1-3139a159a9eb&response_mode=fragment&response_type=code&scope=openid&nonce=95ce0977-7203-469c-88c7-83b64ba422d6&code_challenge=Fmw7jtDfMVvK9covTZ-tcwV_5J9NEGDYHv2guHVeRJo&code_challenge_method=S256';
    if (!tab.url?.startsWith('https://accounts.godigit.com/')) {
      showMessage('Opening Go Digit login...');
      const listener = (tabId, changeInfo) => {
        if (tabId !== tab.id || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener); setTimeout(() => startOnTab(tab.id, payload), 500);
      };
      chrome.tabs.onUpdated.addListener(listener);
      await chrome.tabs.update(tab.id, { url: loginUrl }); return;
    }
    startOnTab(tab.id, payload);
  });
  async function startOnTab(tabId, payload) {
    const response = await send(tabId, { action: 'START_GODIGIT_LOGIN', payload });
    if (response?.status === 'started') { showMessage('Phone login started'); await pollStatus(); }
    else showMessage('Could not reach Go Digit. Reload the login page and retry.');
  }
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'GODIGIT_LOG') showMessage(message.message);
    if (message.action === 'GODIGIT_FLOW_RESULT' && message.result?.success === false) showMessage(message.result.error);
  });
  pollStatus(); pollTimer = setInterval(pollStatus, 1500);
  window.addEventListener('unload', () => clearInterval(pollTimer));
});