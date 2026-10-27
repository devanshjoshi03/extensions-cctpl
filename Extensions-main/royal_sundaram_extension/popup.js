document.addEventListener('DOMContentLoaded', () => {
  const ROYAL_LOGIN_URL = 'https://ilounge.royalsundaram.in/iPolicyMotor/login';
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

  const MAX_LOGS = 500;
  let logLines = [];
  let statusPollTimer = null;
  let pollInFlight = false;
  let logFlushScheduled = false;
  let pendingLogEntries = [];

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, (match) => map[match]);
  }

  function shouldStickToBottom() {
    return logsOutput.scrollHeight - logsOutput.scrollTop - logsOutput.clientHeight < 24;
  }

  function scheduleLogFlush() {
    if (logFlushScheduled) return;
    logFlushScheduled = true;

    requestAnimationFrame(() => {
      logFlushScheduled = false;
      if (!pendingLogEntries.length) return;

      const stickToBottom = shouldStickToBottom();
      const fragment = document.createDocumentFragment();

      pendingLogEntries.forEach((log) => {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.style.color = log.color;
        line.textContent = log.text;
        fragment.appendChild(line);
      });

      logsOutput.appendChild(fragment);
      pendingLogEntries = [];

      while (logsOutput.childElementCount > MAX_LOGS) {
        logsOutput.removeChild(logsOutput.firstElementChild);
      }

      if (stickToBottom) {
        logsOutput.scrollTop = logsOutput.scrollHeight;
      }
    });
  }

  function addLog(message, color = '#8ff0df') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { text: `[${timestamp}] ${message}`, color };
    logLines.push(entry);
    if (logLines.length > MAX_LOGS) {
      logLines.shift();
    }
    pendingLogEntries.push(entry);
    scheduleLogFlush();
  }

  function addLogs(entries, defaultColor = '#8ff0df') {
    entries.forEach((entry) => {
      if (!entry?.message) return;
      addLog(entry.message, entry.color || defaultColor);
    });
  }

  function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 4000);
  }

  function updateStatusView(state) {
    if (!state) return;

    controlsRow.style.display = 'flex';
    autoStatusEl.style.display = 'block';
    autoStep.textContent = state.currentStep || '-';

    if (state.isStopped) {
      autoBadge.textContent = 'Stopped';
      autoBadge.className = 'auto-badge stopped';
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
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      resumeBtn.disabled = false;
      stopBtn.disabled = false;
      startBtn.disabled = true;
      return;
    }

    autoBadge.textContent = 'Running';
    autoBadge.className = 'auto-badge running';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.disabled = false;
    resumeBtn.style.display = 'none';
    stopBtn.disabled = false;
    startBtn.disabled = true;
  }

  function sendToActiveTab(message) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          resolve({ error: 'No active tab found' });
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || null);
        });
      });
    });
  }

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0] || null);
      });
    });
  }

  function updateTab(tabId, updateProperties) {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, updateProperties, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tab || null);
      });
    });
  }

  function isRoyalWorkflowUrl(url) {
    return String(url || '').startsWith('https://ilounge.royalsundaram.in/') ||
      String(url || '').startsWith('https://kyc.royalsundaram.in/');
  }

  async function pollStatus() {
    if (pollInFlight) return;
    pollInFlight = true;
    const state = await sendToActiveTab({ action: 'GET_AUTOMATION_STATUS' });
    try {
      if (state && !state.error) {
        updateStatusView(state);
      }
    } finally {
      pollInFlight = false;
    }
  }

  function startStatusPolling() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
    }
    pollStatus();
    statusPollTimer = setInterval(pollStatus, 1000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'FLOW_LOG' && msg.message) {
      addLog(msg.message, '#bbf7d0');
      return;
    }

    if (msg?.action === 'FLOW_LOG_BATCH' && Array.isArray(msg.logs)) {
      addLogs(msg.logs, '#bbf7d0');
      return;
    }

    if (msg?.action === 'FLOW_RESULT' && msg.result) {
      const color = msg.result.success ? '#8ff0df' : '#fecaca';
      addLog(`Flow result: ${msg.result.message || msg.result.error || JSON.stringify(msg.result)}`, color);
    }
  });

  addLog('Royal Sundaram Insurance Automation - Ready', '#8ff0df');

  chrome.storage.local.get('royalLastJsonPayload', (result) => {
    if (result.royalLastJsonPayload) {
      jsonInput.value = result.royalLastJsonPayload;
    }
  });

  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ royalLastJsonPayload: jsonInput.value });
  });

  startBtn.addEventListener('click', async () => {
    const jsonText = jsonInput.value.trim();
    if (!jsonText) {
      addLog('Please paste a JSON payload', '#fecaca');
      showStatus('Please provide JSON payload', 'error');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (error) {
      addLog(`Invalid JSON: ${error.message}`, '#fecaca');
      showStatus('Invalid JSON format', 'error');
      return;
    }

    chrome.storage.local.set({
      royalLastJsonPayload: jsonText,
      royalPendingPayload: payload
    });
    updateStatusView({ isRunning: true, isPaused: false, isStopped: false, currentStep: 'Starting automation' });
    addLog('Starting Royal Sundaram automation flow...', '#bbf7d0');
    showStatus('Automation started', 'success');
    startStatusPolling();

    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      addLog('No active tab found', '#fecaca');
      showStatus('No active tab found', 'error');
      await pollStatus();
      return;
    }

    if (!isRoyalWorkflowUrl(activeTab.url) || activeTab.url === 'https://ilounge.royalsundaram.in/') {
      await updateTab(activeTab.id, { url: ROYAL_LOGIN_URL });
      addLog('Redirecting to Royal Sundaram login page', '#bbf7d0');
      await pollStatus();
      return;
    }

    const response = await sendToActiveTab({ action: 'START_FULL_FLOW', payload });
    if (response?.error) {
      addLog(`Error: ${response.error}`, '#fecaca');
      showStatus('Error communicating with page', 'error');
      await pollStatus();
      return;
    }

    addLog(response?.status === 'redirected' ? 'Redirecting to Royal Sundaram login page' : 'Flow request sent', '#bbf7d0');
    await pollStatus();
  });

  pauseBtn.addEventListener('click', async () => {
    const response = await sendToActiveTab({ action: 'PAUSE_AUTOMATION' });
    if (response?.status === 'paused') {
      addLog('Automation paused', '#fde68a');
      showStatus('Automation paused', 'success');
      await pollStatus();
    }
  });

  resumeBtn.addEventListener('click', async () => {
    const response = await sendToActiveTab({ action: 'RESUME_AUTOMATION' });
    if (response?.status === 'resumed') {
      addLog('Automation resumed', '#bbf7d0');
      showStatus('Automation resumed', 'success');
      await pollStatus();
    }
  });

  stopBtn.addEventListener('click', async () => {
    const response = await sendToActiveTab({ action: 'STOP_AUTOMATION' });
    if (response?.status === 'stopped') {
      addLog('Automation stopped', '#fecaca');
      showStatus('Automation stopped', 'error');
      await pollStatus();
    }
  });

  startStatusPolling();
});
