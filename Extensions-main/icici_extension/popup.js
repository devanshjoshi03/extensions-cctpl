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

  const STORAGE_KEY = 'iciciAutomation';
  const STALE_MS = 90000;
  const ICICI_LOGIN_URL = 'https://nysa.icicilombard.com/#/login';

  let statusPollTimer = null;
  let lastLogCount = 0;
  let finishedNotified = false;
  let currentAutomationState = null;

  function addLog(message, color = '#00ff00') {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    logsOutput.innerHTML += `<span style="color: ${color};">${escapeHtml(line)}</span>\n`;
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }

  function clearLiveLogs() {
    logsOutput.innerHTML = '';
    lastLogCount = 0;
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]
    ));
  }

  function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 4000);
  }

  function isTerminalPhase(phase) {
    return phase === 'done' || phase === 'error' || phase === 'stopped';
  }

  function isAutomationActive(state) {
    if (!state) return false;
    if (state.lastError || state.phase === 'error') return false;
    if (state.isStopped || state.phase === 'stopped') return false;
    if (!state.isRunning) return false;
    if (isTerminalPhase(state.phase)) return false;

    const updated = state.updatedAt || state.startedAt || 0;
    if (updated && Date.now() - updated > STALE_MS) return false;
    return true;
  }

  function stopPolling() {
    if (!statusPollTimer) return;
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }

  function enableStart() {
    startBtn.disabled = false;
    stopPolling();
  }

  function updateControlsUI(state) {
    currentAutomationState = state;
    const active = isAutomationActive(state);

    startBtn.disabled = active;

    if (!state || (!active && !isTerminalPhase(state.phase) && !state.lastError)) {
      return;
    }

    controlsRow.style.display = 'flex';
    autoStatusEl.style.display = 'block';

    if (state.isStopped || state.phase === 'stopped') {
      startBtn.disabled = false;
      autoBadge.textContent = 'Stopped';
      autoBadge.className = 'auto-badge stopped';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.disabled = true;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
    } else if (active && state.isPaused) {
      autoBadge.textContent = 'Paused';
      autoBadge.className = 'auto-badge paused';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      resumeBtn.disabled = false;
      stopBtn.disabled = false;
    } else if (active) {
      autoBadge.textContent = 'Running';
      autoBadge.className = 'auto-badge running';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.disabled = false;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = false;
    } else if (state.phase === 'done') {
      autoBadge.textContent = 'Done';
      autoBadge.className = 'auto-badge running';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.disabled = true;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
    } else if (state.phase === 'error' || state.lastError) {
      startBtn.disabled = false;
      autoBadge.textContent = 'Error';
      autoBadge.className = 'auto-badge stopped';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.disabled = true;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
    } else {
      startBtn.disabled = false;
      autoBadge.textContent = 'Idle';
      autoBadge.className = 'auto-badge idle';
      pauseBtn.style.display = 'inline-block';
      pauseBtn.disabled = true;
      resumeBtn.style.display = 'none';
      stopBtn.disabled = true;
    }

    autoStep.textContent = state.currentStep || state.phase || '-';
  }

  function notifyFinished(state) {
    if (finishedNotified || !state) return;
    if (isAutomationActive(state)) return;

    finishedNotified = true;
    if (state.phase === 'done') {
      showStatus('Automation completed', 'success');
      addLog(state.currentStep || 'Automation completed', '#4caf50');
    } else if (state.lastError) {
      showStatus(state.lastError, 'error');
      addLog(state.lastError, '#ff6b6b');
    } else if (state.phase === 'stopped') {
      clearLiveLogs();
      addLog('Automation stopped', '#ff6b6b');
    }
  }

  function syncLogsFromState(state) {
    const logs = state?.logs || [];
    if (logs.length <= lastLogCount) return;
    for (let index = lastLogCount; index < logs.length; index += 1) {
      addLog(logs[index].text, '#2a9fd8');
    }
    lastLogCount = logs.length;
  }

  function applyAutomationState(state) {
    syncLogsFromState(state);
    updateControlsUI(state);

    if (!isAutomationActive(state)) {
      enableStart();
      notifyFinished(state);
    }
  }

  function reconcileAutomationState(callback) {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const state = result[STORAGE_KEY];
      if (!state) {
        enableStart();
        callback(null);
        return;
      }

      if (isAutomationActive(state)) {
        callback(state);
        return;
      }

      const nextState = {
        ...state,
        isRunning: false,
        isPaused: false,
      };
      if (state.isRunning && !isTerminalPhase(state.phase)) {
        nextState.phase = 'error';
        nextState.lastError =
          nextState.lastError || 'Automation session ended (page reload or timeout). Click Start to run again.';
      }

      chrome.storage.local.set({ [STORAGE_KEY]: nextState }, () => {
        callback(nextState);
      });
    });
  }

  function pollAutomationStatus() {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      applyAutomationState(result[STORAGE_KEY] || null);
    });
  }

  function startPolling() {
    finishedNotified = false;
    stopPolling();
    pollAutomationStatus();
    statusPollTimer = setInterval(pollAutomationStatus, 800);
  }

  function sendControlMessage(type, onSuccess, successLog, errorLabel) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        showStatus('No active tab', 'error');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type }, (response) => {
        if (chrome.runtime.lastError || !response) {
          showStatus(`Could not ${errorLabel}`, 'error');
          addLog(`${errorLabel} failed`, '#ff6b6b');
          return;
        }
        onSuccess(response);
        if (successLog) addLog(successLog.text, successLog.color);
      });
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    applyAutomationState(changes[STORAGE_KEY].newValue || null);
  });

  addLog('ICICI Lombard Insurance Automation - Ready', '#2a9fd8');

  function startAutomationInTab(tabId, payload) {
    chrome.tabs.sendMessage(tabId, { type: 'START_ICICI_FLOW', payload }, (response) => {
      if (chrome.runtime.lastError) {
        addLog(`Error: ${chrome.runtime.lastError.message}`, '#ff6b6b');
        showStatus('Reload the portal tab and try again', 'error');
        chrome.storage.local.set({
          [STORAGE_KEY]: {
            isRunning: false,
            phase: 'error',
            lastError: chrome.runtime.lastError.message,
            currentStep: 'Could not reach page script',
          },
        });
        enableStart();
        return;
      }
      if (response?.status === 'started') {
        addLog('Automation started (continues across page loads)', '#4caf50');
      }
    });
  }

  startBtn.addEventListener('click', async () => {
    const jsonText = jsonInput.value.trim();
    if (!jsonText) {
      addLog('Please paste a JSON payload', '#ff6b6b');
      showStatus('Please provide JSON payload', 'error');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (error) {
      addLog(`Invalid JSON: ${error.message}`, '#ff6b6b');
      showStatus('Invalid JSON format', 'error');
      return;
    }

    chrome.storage.local.set({ lastJsonPayload: jsonText });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      addLog('No active tab', '#ff6b6b');
      return;
    }

    finishedNotified = false;
    startBtn.disabled = true;
    clearLiveLogs();
    addLog('Starting ICICI automation flow...', '#4caf50');
    showStatus('Automation started...', 'success');
    startPolling();

    if (!tab.url?.startsWith('https://nysa.icicilombard.com')) {
      addLog(`Redirecting to ${ICICI_LOGIN_URL}`, '#2a9fd8');
      showStatus('Redirecting to ICICI login...', 'success');
      await chrome.tabs.update(tab.id, { url: ICICI_LOGIN_URL });
      chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
        if (updatedTabId !== tab.id || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => {
          startAutomationInTab(tab.id, payload);
        }, 3000);
      });
      return;
    }

    startAutomationInTab(tab.id, payload);
  });

  pauseBtn.addEventListener('click', () => {
    sendControlMessage(
      'PAUSE_ICICI_FLOW',
      (response) => {
        if (response.status !== 'paused') {
          showStatus('Could not pause', 'error');
          addLog('Pause failed', '#ff6b6b');
          return;
        }
        const nextState = {
          ...(currentAutomationState || {}),
          isRunning: true,
          isPaused: true,
          isStopped: false,
          currentStep: currentAutomationState?.currentStep || 'Paused',
        };
        chrome.storage.local.set({ [STORAGE_KEY]: nextState });
        updateControlsUI(nextState);
      },
      { text: 'Automation paused', color: '#ff9800' },
      'pause'
    );
  });

  resumeBtn.addEventListener('click', () => {
    sendControlMessage(
      'RESUME_ICICI_FLOW',
      (response) => {
        if (response.status !== 'resumed') {
          showStatus('Could not resume', 'error');
          addLog('Resume failed', '#ff6b6b');
          return;
        }
        const nextState = {
          ...(currentAutomationState || {}),
          isRunning: true,
          isPaused: false,
          isStopped: false,
          currentStep: currentAutomationState?.currentStep || 'Resumed',
        };
        chrome.storage.local.set({ [STORAGE_KEY]: nextState });
        updateControlsUI(nextState);
      },
      { text: 'Automation resumed', color: '#4caf50' },
      'resume'
    );
  });

  stopBtn.addEventListener('click', () => {
    sendControlMessage(
      'STOP_ICICI_FLOW',
      (response) => {
        if (response.status !== 'stopped') {
          showStatus('Could not stop', 'error');
          addLog('Stop failed', '#ff6b6b');
          return;
        }
        const nextState = {
          ...(currentAutomationState || {}),
          isRunning: false,
          isPaused: false,
          isStopped: true,
          phase: 'stopped',
          currentStep: 'Stopped by user',
          logs: [],
        };
        chrome.storage.local.set({ [STORAGE_KEY]: nextState });
        clearLiveLogs();
        updateControlsUI(nextState);
        enableStart();
      },
      { text: 'Automation stopped', color: '#ff6b6b' },
      'stop'
    );
  });

  chrome.storage.local.get('lastJsonPayload', (result) => {
    if (result.lastJsonPayload) jsonInput.value = result.lastJsonPayload;
  });

  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ lastJsonPayload: jsonInput.value });
  });

  reconcileAutomationState((state) => {
    if (!state) {
      enableStart();
      return;
    }

    syncLogsFromState(state);
    updateControlsUI(state);
    if (isAutomationActive(state)) {
      startPolling();
    } else {
      enableStart();
      if (isTerminalPhase(state.phase) || state.lastError) {
        notifyFinished(state);
      }
    }
  });
});
