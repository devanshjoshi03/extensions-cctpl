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
  /** No storage update for this long => treat as not running (unblocks Start). */
  const STALE_MS = 90000;

  let statusPollTimer = null;
  let lastLogCount = 0;
  let finishedNotified = false;

  function addLog(msg, color = '#00ff00') {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = `[${timestamp}] ${msg}`;
    logsOutput.innerHTML += `<span style="color: ${color};">${escapeHtml(logLine)}</span>\n`;
    logsOutput.scrollTop = logsOutput.scrollHeight;
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])
    );
  }

  addLog('🛡️ ICICI Lombard Insurance Automation - Ready', '#2a9fd8');

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
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
  }

  function enableStart() {
    startBtn.disabled = false;
    stopPolling();
  }

  function updateControlsUI(state) {
    const active = isAutomationActive(state);

    startBtn.disabled = active;

    if (!state || (!active && !isTerminalPhase(state.phase) && !state.lastError)) {
      return;
    }

    controlsRow.style.display = 'flex';
    autoStatusEl.style.display = 'block';

    if (state.isStopped || state.phase === 'stopped') {
      autoBadge.textContent = '⛔ Stopped';
      autoBadge.className = 'auto-badge stopped';
    } else if (active) {
      autoBadge.textContent = '🤖 Running';
      autoBadge.className = 'auto-badge running';
    } else if (state.phase === 'done') {
      autoBadge.textContent = '✅ Done';
      autoBadge.className = 'auto-badge running';
    } else if (state.phase === 'error' || state.lastError) {
      autoBadge.textContent = '❌ Error';
      autoBadge.className = 'auto-badge stopped';
    } else {
      autoBadge.textContent = '💤 Idle';
      autoBadge.className = 'auto-badge idle';
    }

    autoStep.textContent = state.currentStep || state.phase || '—';
  }

  function notifyFinished(state) {
    if (finishedNotified || !state) return;
    if (isAutomationActive(state)) return;

    finishedNotified = true;
    if (state.phase === 'done') {
      showStatus('Automation completed', 'success');
      addLog('✅ ' + (state.currentStep || 'Automation completed'), '#4caf50');
    } else if (state.lastError) {
      showStatus(state.lastError, 'error');
      addLog('❌ ' + state.lastError, '#ff6b6b');
    } else if (state.phase === 'stopped') {
      addLog('⛔ Automation stopped', '#ff6b6b');
    }
  }

  function syncLogsFromState(state) {
    const logs = state?.logs || [];
    if (logs.length <= lastLogCount) return;
    for (let i = lastLogCount; i < logs.length; i++) {
      addLog(logs[i].text, '#2a9fd8');
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

      // Finished, failed, or stale — clear isRunning so Start works again
      const next = {
        ...state,
        isRunning: false,
        isPaused: false,
      };
      if (state.isRunning && !isTerminalPhase(state.phase)) {
        next.phase = 'error';
        next.lastError =
          next.lastError || 'Automation session ended (page reload or timeout). Click Start to run again.';
      }

      chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
        callback(next);
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
    if (statusPollTimer) clearInterval(statusPollTimer);
    pollAutomationStatus();
    statusPollTimer = setInterval(pollAutomationStatus, 800);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    applyAutomationState(changes[STORAGE_KEY].newValue || null);
  });

  startBtn.addEventListener('click', async () => {
    const jsonText = jsonInput.value.trim();

    if (!jsonText) {
      addLog('❌ Please paste a JSON payload', '#ff6b6b');
      showStatus('Please provide JSON payload', 'error');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(jsonText);
    } catch (err) {
      addLog(`❌ Invalid JSON: ${err.message}`, '#ff6b6b');
      showStatus('Invalid JSON format', 'error');
      return;
    }

    chrome.storage.local.set({ lastJsonPayload: jsonText });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      addLog('❌ No active tab', '#ff6b6b');
      return;
    }

    if (!tab.url?.includes('icicilombard.com')) {
      addLog('❌ Open the ICICI NYSA portal tab first', '#ff6b6b');
      showStatus('Open nysa.icicilombard.com first', 'error');
      return;
    }

    finishedNotified = false;
    startBtn.disabled = true;
    logsOutput.innerHTML = '';
    lastLogCount = 0;
    addLog('🚀 Starting ICICI automation flow...', '#4caf50');
    showStatus('Automation started...', 'success');
    startPolling();

    chrome.tabs.sendMessage(
      tab.id,
      { type: 'START_ICICI_FLOW', payload },
      (response) => {
        if (chrome.runtime.lastError) {
          addLog(`❌ Error: ${chrome.runtime.lastError.message}`, '#ff6b6b');
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
          addLog('✅ Automation started (continues across page loads)', '#4caf50');
        }
      }
    );
  });

  pauseBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_ICICI_FLOW' });
      addLog('⏸️ Automation paused', '#ff9800');
    });
  });

  resumeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_ICICI_FLOW' });
      addLog('▶️ Automation resumed', '#4caf50');
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_ICICI_FLOW' });
    });
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        isRunning: false,
        isStopped: true,
        phase: 'stopped',
        currentStep: 'Stopped by user',
      },
    });
    controlsRow.style.display = 'none';
    autoStatusEl.style.display = 'none';
    enableStart();
    addLog('⛔ Automation stopped', '#ff6b6b');
  });

  chrome.storage.local.get('lastJsonPayload', (result) => {
    if (result.lastJsonPayload) jsonInput.value = result.lastJsonPayload;
  });

  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ lastJsonPayload: jsonInput.value });
  });

  // On popup open: fix stale isRunning and sync UI
  reconcileAutomationState((state) => {
    if (state) {
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
    } else {
      enableStart();
    }
  });
});
