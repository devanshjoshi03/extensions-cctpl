const LOGS_KEY = 'policyPrintLogs';
const STATE_KEY = 'policyPrintState';
const MAX_LOGS = 500;

let inMemoryLogs = [];
let state = {
  active: false,
  startedAt: 0
};

function nowText() {
  return new Date().toLocaleTimeString();
}

function sanitizeFilenamePart(value) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'policy';
}

function withStorageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function withStorageSet(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

async function loadState() {
  const stored = await withStorageGet([LOGS_KEY, STATE_KEY]);
  inMemoryLogs = Array.isArray(stored[LOGS_KEY]) ? stored[LOGS_KEY] : [];
  state = { ...state, ...(stored[STATE_KEY] || {}) };
}

const stateReady = loadState();

async function saveState() {
  await withStorageSet({ [STATE_KEY]: state });
}

async function addLog(message, color = '#bfdbfe') {
  await stateReady;
  const text = `[${nowText()}] ${message}`;
  const entry = { text, color, timestamp: Date.now() };
  inMemoryLogs.push(entry);
  if (inMemoryLogs.length > MAX_LOGS) {
    inMemoryLogs = inMemoryLogs.slice(inMemoryLogs.length - MAX_LOGS);
  }
  await withStorageSet({ [LOGS_KEY]: inMemoryLogs });
  chrome.runtime.sendMessage({ action: 'POLICY_PRINT_LOG', ...entry }, () => void chrome.runtime.lastError);
}

function normalizeBase64Pdf(fileValue) {
  const raw = String(fileValue || '').trim();
  if (!raw) return '';
  const base64 = raw.includes(',') ? raw.split(',').pop().trim() : raw;
  return base64.replace(/\s+/g, '');
}

function downloadPdf(policyCode, fileBase64) {
  return new Promise((resolve) => {
    const normalizedBase64 = normalizeBase64Pdf(fileBase64);
    if (!normalizedBase64 || normalizedBase64.length < 100) {
      resolve({ success: false, error: 'PDF base64 file data is missing or too short.' });
      return;
    }

    const safePolicyCode = sanitizeFilenamePart(policyCode);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `RoyalSundaram/${safePolicyCode}_${stamp}.pdf`;
    const url = `data:application/pdf;base64,${normalizedBase64}`;

    chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ success: true, downloadId, filename, safePolicyCode, stamp });
    });
  });
}

function downloadPolicyCodeText(policyCode, pdfFilename, safePolicyCode, stamp) {
  return new Promise((resolve) => {
    const filename = `RoyalSundaram/${safePolicyCode}_${stamp}_policyCode.txt`;
    const content = [
      `policyCode: ${policyCode || 'policy'}`,
      `pdfFile: ${pdfFilename || ''}`,
      `savedAt: ${new Date().toISOString()}`
    ].join('\n');

    chrome.downloads.download({
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ success: true, downloadId, filename });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === 'GET_POLICY_PRINT_LOGS') {
    (async () => {
      await stateReady;
      sendResponse({ success: true, logs: inMemoryLogs });
    })();
    return true;
  }

  if (message?.action === 'START_POLICY_PRINT_SESSION') {
    (async () => {
      await stateReady;
      inMemoryLogs = [];
      state = { active: true, startedAt: Date.now() };
      await withStorageSet({ [LOGS_KEY]: inMemoryLogs, [STATE_KEY]: state });
      await addLog('Start clicked. Waiting for Royal Sundaram page actions.', '#bbf7d0');
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message?.action === 'STOP_POLICY_PRINT_SESSION') {
    (async () => {
      await stateReady;
      state = { active: false, startedAt: 0 };
      await saveState();
      await addLog(message.reason || 'Policy print session stopped.', '#fde68a');
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message?.action === 'POLICY_PRINT_EVENT') {
    const event = message.event || {};
    if (event.type === 'LOG' && event.message) {
      addLog(event.message, event.color).catch(() => {});
    }
    if (event.type === 'FLOW_DONE' && event.success === false) {
      state = { active: false, startedAt: 0 };
      saveState().catch(() => {});
    }
    sendResponse({ success: true });
    return true;
  }

  if (message?.action === 'POLICY_PRINT_SAVE_PDF') {
    (async () => {
      await stateReady;
      const sessionAge = Date.now() - Number(state.startedAt || 0);
      if (!state.active || sessionAge > 10 * 60 * 1000) {
        await addLog('Ignored generatePrint response because no active Start session was found.', '#fde68a');
        sendResponse({ success: false, error: 'No active policy print session.' });
        return;
      }

      const policyCode = message.policyCode || 'policy';
      await addLog(`generatePrint response found. Policy code: ${policyCode}`, '#bbf7d0');
      const result = await downloadPdf(policyCode, message.file);

      if (result.success) {
        const textResult = await downloadPolicyCodeText(
          policyCode,
          result.filename,
          result.safePolicyCode,
          result.stamp
        );
        state = { active: false, startedAt: 0 };
        await saveState();
        await addLog(`Policy PDF download started: ${result.filename}`, '#bbf7d0');
        if (textResult.success) {
          result.textFilename = textResult.filename;
          await addLog(`Policy code text file saved: ${textResult.filename}`, '#bbf7d0');
        } else {
          result.textError = textResult.error;
          await addLog(`Policy code text file failed: ${textResult.error}`, '#fecaca');
        }
      } else {
        await addLog(`Policy PDF download failed: ${result.error}`, '#fecaca');
      }

      chrome.runtime.sendMessage({
        action: 'POLICY_PRINT_DOWNLOAD_DONE',
        success: result.success,
        filename: result.filename,
        error: result.error
      }, () => void chrome.runtime.lastError);
      sendResponse(result);
    })();
    return true;
  }

  return false;
});
