document.addEventListener('DOMContentLoaded', () => {
  const jsonInput = document.getElementById('json-input');
  const startBtn = document.getElementById('start-btn');
  const statusEl = document.getElementById('status');
  const pauseBtn = document.getElementById('pause-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const stopBtn = document.getElementById('stop-btn');
  const controlsRow = document.getElementById('automation-controls');
  const autoStatusEl = document.getElementById('auto-status');
  const autoBadge = document.getElementById('auto-badge');
  const autoStep = document.getElementById('auto-step');
  const logsOutput = document.getElementById('logs-output');

  let statusPollTimer = null;
  const MAX_LOGS = 500;
  let logLines = [];

  // Log display function
  function addLog(msg, color = '#00ff00') {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    logLines.push({ text: logLine, color });
    
    if (logLines.length > MAX_LOGS) {
      logLines.shift();
    }
    
    renderLogs();
  }

  function renderLogs() {
    logsOutput.innerHTML = logLines.map(log => 
      `<span style="color: ${log.color};">${escapeHtml(log.text)}</span>\n`
    ).join('');
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Initialize logs display
  addLog('🛡️ Bajaj Insurance Automation - Ready', '#0054A6');
  addLog('Waiting for automation to start...', '#888888');

  // Restore last JSON payload
  chrome.storage.local.get(['bajajJSON'], (r) => {
    if (r.bajajJSON) jsonInput.value = r.bajajJSON;
  });

  function showStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    addLog(msg, type === 'error' ? '#ff4757' : type === 'success' ? '#00ff7f' : '#00d4ff');
    setTimeout(() => { statusEl.className = 'status hidden'; }, 4000);
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError.message);
          resolve({ status: 'error', error: chrome.runtime.lastError.message });
        }
        else resolve(resp);
      });
    });
  }

  function updateControlsUI(state) {
    if (!state) return;

    controlsRow.style.display = 'flex';
    autoStatusEl.style.display = 'block';

    if (state.isStopped) {
      autoBadge.textContent = '⛔ Stopped';
      autoBadge.className = 'auto-badge stopped';
      autoStep.textContent = state.currentStep || 'Stopped';
      pauseBtn.disabled = true; pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
      startBtn.disabled = false;
    } else if (!state.isRunning) {
      autoBadge.textContent = '💤 Idle';
      autoBadge.className = 'auto-badge idle';
      autoStep.textContent = state.currentStep || '—';
      pauseBtn.disabled = true; pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
      startBtn.disabled = false;
    } else if (state.isPaused) {
      autoBadge.textContent = '⏸️ Paused';
      autoBadge.className = 'auto-badge paused';
      autoStep.textContent = state.currentStep || 'Paused';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block'; resumeBtn.disabled = false;
      stopBtn.disabled = false;
      startBtn.disabled = true;
    } else {
      autoBadge.textContent = '🤖 Running';
      autoBadge.className = 'auto-badge running';
      autoStep.textContent = state.currentStep || 'Starting...';
      pauseBtn.style.display = 'inline-block'; pauseBtn.disabled = false;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = false;
      startBtn.disabled = true;
    }
  }

  async function pollStatus() {
    const tab = await getActiveTab();
    if (!tab) return;
    const state = await sendToTab(tab.id, { action: 'GET_AUTOMATION_STATUS' });
    if (state) updateControlsUI(state);
  }

  function startPolling() {
    if (statusPollTimer) clearInterval(statusPollTimer);
    pollStatus();
    statusPollTimer = setInterval(pollStatus, 1500);
  }

  startPolling();

  pauseBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) { showStatus('❌ No active tab', 'error'); return; }
    addLog('⏸️ Sending PAUSE_AUTOMATION command...', '#ffc107');
    const resp = await sendToTab(tab.id, { action: 'PAUSE_AUTOMATION' });
    if (resp?.status === 'paused') {
      showStatus('⏸️ Automation paused', 'success');
      addLog('✅ Automation successfully paused', '#00ff7f');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
      addLog('❌ Pause error: ' + resp.error, '#ff4757');
    } else {
      showStatus('❌ Could not pause - refresh page', 'error');
      addLog('❌ Pause failed - no response from tab', '#ff4757');
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) { showStatus('❌ No active tab', 'error'); return; }
    addLog('▶️ Sending RESUME_AUTOMATION command...', '#4caf50');
    const resp = await sendToTab(tab.id, { action: 'RESUME_AUTOMATION' });
    if (resp?.status === 'resumed') {
      showStatus('▶️ Automation resumed', 'success');
      addLog('✅ Automation successfully resumed', '#00ff7f');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
      addLog('❌ Resume error: ' + resp.error, '#ff4757');
    } else {
      showStatus('❌ Could not resume', 'error');
      addLog('❌ Resume failed - no response from tab', '#ff4757');
    }
  });

  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) { showStatus('❌ No active tab', 'error'); return; }
    addLog('⛔ Sending STOP_AUTOMATION command...', '#ff4757');
    const resp = await sendToTab(tab.id, { action: 'STOP_AUTOMATION' });
    if (resp?.status === 'stopped') {
      showStatus('⛔ Automation stopped permanently', 'error');
      addLog('✅ Automation successfully stopped', '#00ff7f');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
      addLog('❌ Stop error: ' + resp.error, '#ff4757');
    } else {
      showStatus('❌ Could not stop', 'error');
      addLog('❌ Stop failed - no response from tab', '#ff4757');
    }
  });

  startBtn.addEventListener('click', async () => {
    addLog('🚀 Start button clicked', '#0054A6');
    const raw = jsonInput.value.trim();
    if (!raw) { showStatus('❌ Paste JSON payload first', 'error'); addLog('❌ No JSON payload provided', '#ff4757'); return; }

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { showStatus('❌ Invalid JSON: ' + e.message, 'error'); addLog('❌ JSON parsing error: ' + e.message, '#ff4757'); return; }

    addLog('✅ JSON payload parsed successfully', '#00ff7f');

    const creds = payload.agentDetails || {};
    const stored = await new Promise((r) => chrome.storage.local.get(['agentConfig'], r));
    const ac = stored.agentConfig || {};
    const hasCreds =
      (creds.username && creds.password) || (ac.username && ac.password);
    if (!hasCreds) {
      showStatus('❌ Set agentDetails in JSON or default username/password in extension Options', 'error');
      addLog('❌ No credentials found', '#ff4757');
      return;
    }

    addLog('✅ Credentials verified', '#00ff7f');
    const storageBase = { bajajJSON: raw, bajajPayload: payload };

    const tab = await getActiveTab();
    addLog('📍 Active tab URL: ' + (tab?.url || 'unknown'), '#888888');

    // Check if already on a valid Bajaj portal page
    const isOnBajajPortal = tab.url && (
      tab.url.includes('portal.bajajgeneral.com') ||
      tab.url.includes('bajajgeneral.com')
    );

    // Check if on specific pages
    const isOnLoginPage = tab.url && tab.url.includes('portal.bajajgeneral.com/BagicNxt/plogin.jsp');
    const isOnPartnerPage = tab.url && tab.url.includes('portal.bajajgeneral.com/BagicNxt/partner/login.do');
    const isOnVehicleDetailsPage = tab.url && tab.url.includes('portal.bajajgeneral.com/BagicNxt/partner/motorload.do');

    if (!isOnBajajPortal) {
      chrome.storage.local.set(storageBase);
      addLog('🔄 Not on Bajaj portal, navigating...', '#ffc107');
      showStatus('🔄 Navigating to Bajaj portal...', 'info');
      await chrome.tabs.update(tab.id, { url: 'https://portal.bajajgeneral.com/BagicNxt/plogin.jsp' });
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          addLog('✅ Page loaded, starting automation...', '#00ff7f');
          setTimeout(() => {
            // Use START_LOGIN for Bajaj automation
            chrome.tabs.sendMessage(tab.id, { action: 'START_LOGIN', payload });
            startPolling();
          }, 3000);
        }
      });
    } else if (isOnVehicleDetailsPage) {
      addLog('🚗 On vehicle details page (motorload.do), starting vehicle details automation...', '#00d4ff');
      showStatus('🚀 Starting vehicle details automation...', 'info');
      chrome.storage.local.set({
        ...storageBase,
        bajajPendingVehicleAfterForm: false,
      });
      // Use START_VEHICLE_DETAILS for vehicle details automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_VEHICLE_DETAILS', payload }, (resp) => {
        if (chrome.runtime.lastError) { showStatus('❌ Reload the page and retry', 'error'); addLog('❌ Message error: ' + chrome.runtime.lastError.message, '#ff4757'); }
        else if (resp && resp.status === 'started') { showStatus('✅ Automation started!', 'success'); addLog('✅ Vehicle details automation started', '#00ff7f'); }
      });
      startPolling();
    } else if (isOnPartnerPage) {
      addLog('📋 On partner page (login.do), starting form automation...', '#00d4ff');
      showStatus('🚀 Starting form automation...', 'info');
      // After Proceed → full navigation to motorload.do, content script is recreated.
      // Flag + timestamp so motorload.do autostart can run vehicle details with this payload.
      chrome.storage.local.set({
        ...storageBase,
        bajajPendingVehicleAfterForm: true,
        bajajPendingVehicleEnqueuedAt: Date.now(),
      });
      // Use START_FORM_FILL for Bajaj form automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_FORM_FILL', payload }, (resp) => {
        if (chrome.runtime.lastError) { showStatus('❌ Reload the page and retry', 'error'); addLog('❌ Message error: ' + chrome.runtime.lastError.message, '#ff4757'); }
        else if (resp && resp.status === 'started') { showStatus('✅ Automation started!', 'success'); addLog('✅ Form automation started', '#00ff7f'); addLog('Detailed steps: open DevTools (F12) on this portal tab → Console (look for [Bajaj] / [Bajaj Form]).', '#888888'); }
      });
      startPolling();
    } else {
      addLog('🤖 Starting general automation...', '#00d4ff');
      showStatus('🚀 Starting automation...', 'info');
      chrome.storage.local.set({
        ...storageBase,
        bajajPendingVehicleAfterForm: false,
      });
      // Use START_LOGIN for Bajaj automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_LOGIN', payload }, (resp) => {
        if (chrome.runtime.lastError) { showStatus('❌ Reload the page and retry', 'error'); addLog('❌ Message error: ' + chrome.runtime.lastError.message, '#ff4757'); }
        else if (resp && resp.status === 'started') { showStatus('✅ Automation started!', 'success'); addLog('✅ Automation started', '#00ff7f'); }
      });
      startPolling();
    }
  });
});