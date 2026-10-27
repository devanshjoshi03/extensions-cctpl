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
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const KSHEMA_HOME_URL = 'https://motorinsurance.kshema.co/app/home';

  const MAX_LOGS = 300;
  let logLines = [];
  let statusPollTimer = null;

  chrome.storage.local.get(['kshemaLastJsonPayload'], result => {
    if (result.kshemaLastJsonPayload) {
      jsonInput.value = result.kshemaLastJsonPayload;
    }
  });

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function showStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 4000);
  }

  function addLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    logLines.push({ timestamp, message, level });
    if (logLines.length > MAX_LOGS) {
      logLines.shift();
    }
    renderLogs();
  }

  function renderLogs() {
    logsOutput.innerHTML = logLines.map(entry => `
      <div class="log-line ${escapeHtml(entry.level)}">
        <span class="log-time">${escapeHtml(entry.timestamp)}</span>
        <span class="log-message">${escapeHtml(entry.message)}</span>
      </div>
    `).join('');
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }

  function updateControlsUI(state) {
    if (!state) return;

    controlsRow.style.display = 'flex';
    autoStatusEl.style.display = 'block';

    if (state.isStopped) {
      autoBadge.textContent = 'Stopped';
      autoBadge.className = 'auto-badge stopped';
      autoStep.textContent = state.currentStep || 'Stopped';
      pauseBtn.disabled = true;
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
      startBtn.disabled = false;
      return;
    }

    if (!state.isRunning) {
      autoBadge.textContent = 'Idle';
      autoBadge.className = 'auto-badge idle';
      autoStep.textContent = state.currentStep || '-';
      pauseBtn.disabled = true;
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
      startBtn.disabled = false;
      return;
    }

    if (state.isPaused) {
      autoBadge.textContent = 'Paused';
      autoBadge.className = 'auto-badge paused';
      autoStep.textContent = state.currentStep || 'Paused';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      resumeBtn.disabled = false;
      stopBtn.disabled = false;
      startBtn.disabled = true;
      return;
    }

    autoBadge.textContent = 'Running';
    autoBadge.className = 'auto-badge running';
    autoStep.textContent = state.currentStep || 'Starting...';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.disabled = false;
    resumeBtn.style.display = 'none';
    stopBtn.disabled = false;
    startBtn.disabled = true;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function sendToTab(tabId, message) {
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, message, response => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  async function sendToKshemaTab(message) {
    const tab = await getActiveTab();
    if (!tab) {
      throw new Error('No active tab found');
    }

    if (tab.url?.startsWith('https://motorinsurance.kshema.co/') || tab.url?.startsWith('https://assurehub.kshema.co/')) {
      return sendToTab(tab.id, message);
    }

    addLog(`Redirecting to ${KSHEMA_HOME_URL}`, 'info');
    const updatedTab = await chrome.tabs.update(tab.id, { url: KSHEMA_HOME_URL });

    await new Promise(resolve => {
      const listener = (tabId, info) => {
        if (tabId !== updatedTab.id || info.status !== 'complete') {
          return;
        }
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    addLog('Kshema page loaded', 'success');
    return sendToTab(updatedTab.id, message);
  }

  async function pollStatus() {
    const tab = await getActiveTab();
    if (!tab) return;
    const state = await sendToTab(tab.id, { type: 'GET_KSHEMA_AUTOMATION_STATUS' });
    if (state) {
      updateControlsUI(state);
    }
  }

  function startPolling() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
    }
    pollStatus();
    statusPollTimer = setInterval(pollStatus, 1200);
  }

  chrome.runtime.onMessage.addListener(request => {
    if (request.type === 'KSHEMA_LOG') {
      const prefix = request.step ? `${request.step}: ` : '';
      addLog(`${prefix}${request.message}`, request.level || 'info');
    }
  });

  clearLogsBtn.addEventListener('click', () => {
    logLines = [];
    renderLogs();
  });

  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ kshemaLastJsonPayload: jsonInput.value });
  });

  pauseBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'PAUSE_KSHEMA_FLOW' });
    if (response?.status === 'paused') {
      addLog('Automation paused', 'info');
      showStatus('Automation paused', 'info');
      pollStatus();
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'RESUME_KSHEMA_FLOW' });
    if (response?.status === 'resumed') {
      addLog('Automation resumed', 'success');
      showStatus('Automation resumed', 'info');
      pollStatus();
    }
  });

  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'STOP_KSHEMA_FLOW' });
    if (response?.status === 'stopped') {
      addLog('Automation stopped', 'error');
      showStatus('Automation stopped', 'error');
      pollStatus();
    }
  });

  startBtn.addEventListener('click', async () => {
    const raw = jsonInput.value.trim();
    if (!raw) {
      showStatus('Paste JSON payload first', 'error');
      addLog('Missing JSON payload', 'error');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      showStatus('Invalid JSON format', 'error');
      addLog(`Invalid JSON: ${error.message}`, 'error');
      return;
    }

    chrome.storage.local.set({ kshemaLastJsonPayload: raw });
    addLog('Starting Kshema automation', 'success');
    showStatus('Automation started', 'success');

    try {
      updateControlsUI({ isRunning: true, isPaused: false, isStopped: false, currentStep: 'Starting automation' });
      startPolling();
      const response = await sendToKshemaTab({ type: 'START_KSHEMA_FLOW', payload });
      if (response?.success === false) {
        showStatus(response.error || 'Automation failed', 'error');
        addLog(response.error || 'Automation failed', 'error');
      } else if (response?.message) {
        showStatus(response.message, 'success');
        addLog(response.message, 'success');
      }
      pollStatus();
    } catch (error) {
      showStatus(error.message || 'Unable to start automation', 'error');
      addLog(error.message || 'Unable to start automation', 'error');
    }
  });

  addLog('Kshema automation ready', 'info');
  startPolling();
});
