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

  const MAX_LOGS = 300;
  const LIVE_LOG_STORAGE_KEY = 'iciciLiveLogs';
  const ICICI_HOME_URL = 'https://nysa.icicilombard.com/#/login';
  let logLines = [];
  let liveLogLines = [];
  let statusPollTimer = null;

  chrome.storage.local.get(['lastJsonPayload'], (result) => {
    if (result.lastJsonPayload) {
      jsonInput.value = result.lastJsonPayload;
    }
  });

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  }

  function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 4000);
  }

  function addLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    logLines.push({ id: `popup-${Date.now()}-${logLines.length}`, ts: Date.now(), timestamp, message, level, source: 'popup' });
    if (logLines.length > MAX_LOGS) {
      logLines.shift();
    }
    renderLogs();
  }

  function normalizeLiveLogs(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry) => !String(entry?.text || entry?.message || '').includes('GET_AUTOMATION_STATUS'))
      .slice(-MAX_LOGS)
      .map((entry, index) => ({
        id: entry.id || `live-${entry.ts || Date.now()}-${index}`,
        ts: Number(entry.ts) || Date.now(),
        timestamp: entry.ts ? new Date(entry.ts).toLocaleTimeString() : new Date().toLocaleTimeString(),
        message: entry.text || entry.message || '',
        color: entry.color,
        source: 'page',
      }));
  }

  function clearDisplayedLogs() {
    logLines = [];
    liveLogLines = [];
    chrome.storage.local.set({ [LIVE_LOG_STORAGE_KEY]: [] });
    renderLogs();
  }

  function loadLiveLogs() {
    chrome.storage.local.get([LIVE_LOG_STORAGE_KEY], (result) => {
      liveLogLines = normalizeLiveLogs(result[LIVE_LOG_STORAGE_KEY]);
      renderLogs();
    });
  }

  function renderLogs() {
    const colors = {
      info: '#6ee7ff',
      success: '#4caf50',
      warning: '#ffb74d',
      error: '#ff6b6b',
    };
    const combined = [...logLines, ...liveLogLines]
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-MAX_LOGS);
    logsOutput.innerHTML = combined.map((entry) => {
      const color = entry.color || colors[entry.level] || colors.info;
      const source = entry.source === 'page' ? 'PAGE' : 'POPUP';
      return `<span style="color: ${color};">[${escapeHtml(entry.timestamp)}] [${source}] ${escapeHtml(entry.message)}</span>\n`;
    }).join('');
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
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  async function sendToIciciTab(message) {
    const tab = await getActiveTab();
    if (!tab) {
      throw new Error('No active tab found');
    }

    if (tab.url?.startsWith('https://nysa.icicilombard.com/') || tab.url?.includes('icicilombard.com/')) {
      return sendToTab(tab.id, message);
    }

    addLog(`Redirecting to ${ICICI_HOME_URL}`, 'info');
    const updatedTab = await chrome.tabs.update(tab.id, { url: ICICI_HOME_URL });

    await new Promise((resolve) => {
      const listener = (tabId, info) => {
        if (tabId !== updatedTab.id || info.status !== 'complete') {
          return;
        }
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    addLog('ICICI page loaded', 'success');
    return sendToTab(updatedTab.id, message);
  }

  async function pollStatus() {
    const tab = await getActiveTab();
    if (!tab) return;
    const state = await sendToTab(tab.id, { type: 'GET_AUTOMATION_STATUS' });
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

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action !== 'FLOW_RESULT') return;
    const result = request.result || {};
    if (result.success === false) {
      showStatus(result.error || 'Automation failed', 'error');
      addLog(result.error || 'Automation failed', 'error');
    } else {
      showStatus(result.message || 'Automation completed', 'success');
      addLog(result.message || 'Automation completed', 'success');
    }
    pollStatus();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[LIVE_LOG_STORAGE_KEY]) return;
    liveLogLines = normalizeLiveLogs(changes[LIVE_LOG_STORAGE_KEY].newValue);
    renderLogs();
  });

  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ lastJsonPayload: jsonInput.value });
  });

  pauseBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'PAUSE_ICICI_FLOW' });
    if (response?.status === 'paused') {
      addLog('Automation paused', 'info');
      showStatus('Automation paused', 'success');
      pollStatus();
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'RESUME_ICICI_FLOW' });
    if (response?.status === 'resumed') {
      addLog('Automation resumed', 'success');
      showStatus('Automation resumed', 'success');
      pollStatus();
    }
  });

  stopBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    const response = await sendToTab(tab.id, { type: 'STOP_ICICI_FLOW' });
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

    chrome.storage.local.set({ lastJsonPayload: raw });
    clearDisplayedLogs();
    addLog('Starting ICICI automation', 'success');
    showStatus('Automation started', 'success');

    try {
      updateControlsUI({ isRunning: true, isPaused: false, isStopped: false, currentStep: 'Starting automation' });
      startPolling();
      const response = await sendToIciciTab({ type: 'START_ICICI_FLOW', payload });
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

  addLog('ICICI automation ready', 'info');
  loadLiveLogs();
  startPolling();
});
