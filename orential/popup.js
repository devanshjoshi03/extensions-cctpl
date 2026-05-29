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
  let pendingStartListener = null;

  chrome.storage.local.get(['orientalJSON'], (r) => {
    if (r.orientalJSON) jsonInput.value = r.orientalJSON;
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
        if (chrome.runtime.lastError) resolve(null);
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

  async function restartAutomation(tabId, payload) {
    await sendToTab(tabId, { action: 'STOP_AUTOMATION' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const resp = await sendToTab(tabId, { action: 'START_LOGIN', payload });
    if (resp?.status === 'started') {
      showStatus('✅ Login started!', 'success');
    } else {
      startBtn.disabled = false;
      showStatus('❌ Reload the page and retry', 'error');
    }
    startPolling();
  }

  // Start polling immediately when popup opens
  startPolling();

  pauseBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const resp = await sendToTab(tab.id, { action: 'PAUSE_AUTOMATION' });
    if (resp?.status === 'paused') {
      showStatus('⏸️ Automation paused', 'info');
      pollStatus();
    } else {
      showStatus('❌ Could not pause', 'error');
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const resp = await sendToTab(tab.id, { action: 'RESUME_AUTOMATION' });
    if (resp?.status === 'resumed') {
      showStatus('▶️ Automation resumed', 'info');
      pollStatus();
    } else {
      showStatus('❌ Could not resume', 'error');
    }
  });

  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const resp = await sendToTab(tab.id, { action: 'STOP_AUTOMATION' });
    if (resp?.status === 'stopped') {
      showStatus('⛔ Automation stopped permanently', 'error');
      pollStatus();
    } else {
      showStatus('❌ Could not stop', 'error');
    }
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const raw = jsonInput.value.trim();
    if (!raw) { startBtn.disabled = false; showStatus('❌ Paste JSON payload first', 'error'); return; }

    let payload;
    try { payload = JSON.parse(raw); } catch (e) { startBtn.disabled = false; showStatus('❌ Invalid JSON: ' + e.message, 'error'); return; }

    const creds = payload.agentDetails;
    if (!creds || !creds.username || !creds.password) {
      startBtn.disabled = false;
      showStatus('❌ agentDetails.username and password required', 'error');
      return;
    }

    chrome.storage.local.set({ orientalJSON: raw });

    const tab = await getActiveTab();

    if (!tab.url || !tab.url.includes('orientalinsurance.org.in')) {
      showStatus('🔄 Navigating to Oriental Insurance...', 'info');
      await chrome.tabs.update(tab.id, { url: 'https://orientalinsurance.org.in/' });
      if (pendingStartListener) {
        chrome.tabs.onUpdated.removeListener(pendingStartListener);
      }
      pendingStartListener = async function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          pendingStartListener = null;
          setTimeout(() => {
            restartAutomation(tab.id, payload);
          }, 3000);
        }
      };
      chrome.tabs.onUpdated.addListener(pendingStartListener);
    } else {
      showStatus('🚀 Starting...', 'info');
      await restartAutomation(tab.id, payload);
    }
  });
});
