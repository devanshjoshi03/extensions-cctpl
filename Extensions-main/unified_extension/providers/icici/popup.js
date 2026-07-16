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
  addLog('🛡️ ICICI Lombard Insurance Automation - Ready', '#2a9fd8');

  // Start button handler
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

    startBtn.disabled = true;
    addLog('🚀 Starting ICICI automation flow...', '#4caf50');
    showStatus('Automation started...', 'success');

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'START_ICICI_FLOW',
          payload: payload
        }, (response) => {
          if (chrome.runtime.lastError) {
            addLog(`❌ Error: ${chrome.runtime.lastError.message}`, '#ff6b6b');
            showStatus('Error communicating with page', 'error');
            startBtn.disabled = false;
          } else {
            addLog(`✅ ${response?.message || 'Automation completed'}`, '#4caf50');
            showStatus('Automation completed', 'success');
            startBtn.disabled = false;
          }
        });
      }
    });
  });

  // Pause/Resume handlers
  pauseBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_ICICI_FLOW' });
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-block';
        resumeBtn.disabled = false;
        addLog('⏸️ Automation paused', '#ff9800');
      }
    });
  });

  resumeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_ICICI_FLOW' });
        resumeBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        pauseBtn.disabled = false;
        addLog('▶️ Automation resumed', '#4caf50');
      }
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_ICICI_FLOW' });
        controlsRow.style.display = 'none';
        autoStatusEl.style.display = 'none';
        startBtn.disabled = false;
        addLog('⛔ Automation stopped', '#ff6b6b');
      }
    });
  });

  function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    if (statusEl.className !== 'status hidden') {
      setTimeout(() => { statusEl.className = 'status hidden'; }, 4000);
    }
  }

  // Restore previous JSON input if available
  chrome.storage.local.get('lastJsonPayload', (result) => {
    if (result.lastJsonPayload) {
      jsonInput.value = result.lastJsonPayload;
    }
  });

  // Save JSON input on change
  jsonInput.addEventListener('change', () => {
    chrome.storage.local.set({ lastJsonPayload: jsonInput.value });
  });
});
