document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const statusEl = document.getElementById('status');
  const logsOutput = document.getElementById('logs-output');
  const MAX_LOGS = 500;

  function shouldStickToBottom() {
    return logsOutput.scrollHeight - logsOutput.scrollTop - logsOutput.clientHeight < 24;
  }

  function addLog(message, color = '#bfdbfe') {
    const stick = shouldStickToBottom();
    const line = document.createElement('div');
    line.className = 'log-line';
    line.style.color = color;
    line.textContent = message;
    logsOutput.appendChild(line);

    while (logsOutput.childElementCount > MAX_LOGS) {
      logsOutput.removeChild(logsOutput.firstElementChild);
    }

    if (stick) {
      logsOutput.scrollTop = logsOutput.scrollHeight;
    }
  }

  function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
      statusEl.className = 'status hidden';
    }, 4000);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || {});
      });
    });
  }

  function sendToActiveTab(message) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          resolve({ success: false, error: 'No active tab found.' });
          return;
        }

        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || {});
        });
      });
    });
  }

  async function loadStoredLogs() {
    const response = await sendRuntimeMessage({ action: 'GET_POLICY_PRINT_LOGS' });
    if (!response.success || !Array.isArray(response.logs)) return;
    logsOutput.textContent = '';
    response.logs.forEach((entry) => addLog(entry.text, entry.color));
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === 'POLICY_PRINT_LOG') {
      addLog(message.text, message.color);
    }

    if (message?.action === 'POLICY_PRINT_DOWNLOAD_DONE') {
      startBtn.disabled = false;
      showStatus(message.success ? 'Policy PDF saved' : 'Policy PDF save failed', message.success ? 'success' : 'error');
    }
  });

  startBtn.addEventListener('click', async () => {
    logsOutput.textContent = '';
    startBtn.disabled = true;
    await sendRuntimeMessage({ action: 'START_POLICY_PRINT_SESSION' });

    const response = await sendToActiveTab({ action: 'START_POLICY_PRINT_FLOW' });
    if (response.success) {
      showStatus('Policy print flow started', 'success');
      return;
    }

    await sendRuntimeMessage({
      action: 'STOP_POLICY_PRINT_SESSION',
      reason: 'Start failed because the active tab could not receive the flow command.'
    });
    startBtn.disabled = false;
    addLog(`[${new Date().toLocaleTimeString()}] ${response.error || 'Could not start flow.'}`, '#fecaca');
    showStatus('Could not start flow', 'error');
  });

  loadStoredLogs();
});
