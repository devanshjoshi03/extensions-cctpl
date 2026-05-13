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

  let statusPollTimer = null;

  // Restore last JSON payload
  chrome.storage.local.get(['bajajJSON'], (r) => {
    if (r.bajajJSON) jsonInput.value = r.bajajJSON;
  });

  function showStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
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
    const resp = await sendToTab(tab.id, { action: 'PAUSE_AUTOMATION' });
    if (resp?.status === 'paused') {
      showStatus('⏸️ Automation paused', 'info');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
    } else {
      showStatus('❌ Could not pause - refresh page', 'error');
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) { showStatus('❌ No active tab', 'error'); return; }
    const resp = await sendToTab(tab.id, { action: 'RESUME_AUTOMATION' });
    if (resp?.status === 'resumed') {
      showStatus('▶️ Automation resumed', 'info');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
    } else {
      showStatus('❌ Could not resume', 'error');
    }
  });

  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) { showStatus('❌ No active tab', 'error'); return; }
    const resp = await sendToTab(tab.id, { action: 'STOP_AUTOMATION' });
    if (resp?.status === 'stopped') {
      showStatus('⛔ Automation stopped permanently', 'error');
      pollStatus();
    } else if (resp?.error) {
      showStatus('❌ ' + resp.error, 'error');
    } else {
      showStatus('❌ Could not stop', 'error');
    }
  });

  startBtn.addEventListener('click', async () => {
    const raw = jsonInput.value.trim();
    if (!raw) { showStatus('❌ Paste JSON payload first', 'error'); return; }

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { showStatus('❌ Invalid JSON: ' + e.message, 'error'); return; }

    const creds = payload.agentDetails || {};
    const stored = await new Promise((r) => chrome.storage.local.get(['agentConfig'], r));
    const ac = stored.agentConfig || {};
    const hasCreds =
      (creds.username && creds.password) || (ac.username && ac.password);
    if (!hasCreds) {
      showStatus('❌ Set agentDetails in JSON or default username/password in extension Options', 'error');
      return;
    }

    chrome.storage.local.set({ bajajJSON: raw, bajajPayload: payload });

    const tab = await getActiveTab();

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
      showStatus('🔄 Navigating to Bajaj portal...', 'info');
      await chrome.tabs.update(tab.id, { url: 'https://portal.bajajgeneral.com/BagicNxt/plogin.jsp' });
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => {
            // Use START_LOGIN for Bajaj automation
            chrome.tabs.sendMessage(tab.id, { action: 'START_LOGIN', payload });
            startPolling();
          }, 3000);
        }
      });
    } else if (isOnVehicleDetailsPage) {
      showStatus('🚀 Starting vehicle details automation...', 'info');
      // Use START_VEHICLE_DETAILS for vehicle details automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_VEHICLE_DETAILS', payload }, (resp) => {
        if (chrome.runtime.lastError) showStatus('❌ Reload the page and retry', 'error');
        else if (resp && resp.status === 'started') showStatus('✅ Automation started!', 'success');
      });
      startPolling();
    } else if (isOnPartnerPage) {
      showStatus('🚀 Starting form automation...', 'info');
      // Use START_FORM_FILL for Bajaj form automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_FORM_FILL', payload }, (resp) => {
        if (chrome.runtime.lastError) showStatus('❌ Reload the page and retry', 'error');
        else if (resp && resp.status === 'started') showStatus('✅ Automation started!', 'success');
      });
      startPolling();
    } else {
      showStatus('🚀 Starting automation...', 'info');
      // Use START_LOGIN for Bajaj automation
      chrome.tabs.sendMessage(tab.id, { action: 'START_LOGIN', payload }, (resp) => {
        if (chrome.runtime.lastError) showStatus('❌ Reload the page and retry', 'error');
        else if (resp && resp.status === 'started') showStatus('✅ Automation started!', 'success');
      });
      startPolling();
    }
  });
});