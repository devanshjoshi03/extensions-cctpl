// Kshema Insurance Automation - Background Service Worker

const pendingQuoteDownloads = new Map();

function isQuoteDownloadUrl(url) {
  return typeof url === 'string' &&
    url.includes('/api/v1/quote/data/') &&
    url.includes('download=1');
}

function extractQuoteNumberFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/quote\/data\/([^/?]+)/i);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

function resolvePendingQuoteDownload(tabId, url) {
  if (!isQuoteDownloadUrl(url)) {
    return false;
  }

  const directMatch = pendingQuoteDownloads.get(tabId);
  if (directMatch) {
    clearTimeout(directMatch.timeoutId);
    pendingQuoteDownloads.delete(tabId);
    directMatch.resolve({
      url,
      quoteNumber: extractQuoteNumberFromUrl(url)
    });
    return true;
  }

  for (const [pendingTabId, pending] of pendingQuoteDownloads.entries()) {
    clearTimeout(pending.timeoutId);
    pendingQuoteDownloads.delete(pendingTabId);
    pending.resolve({
      url,
      quoteNumber: extractQuoteNumberFromUrl(url)
    });
    return true;
  }

  return false;
}

chrome.downloads.onCreated.addListener((item) => {
  resolvePendingQuoteDownload(item.tabId, item.finalUrl || item.url);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.id) {
    return;
  }

  chrome.downloads.search({ id: delta.id }, (items) => {
    if (chrome.runtime.lastError || !items || !items[0]) {
      return;
    }

    const item = items[0];
    resolvePendingQuoteDownload(item.tabId, item.finalUrl || item.url);
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Kshema] Extension installed/updated:', details);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Kshema] Background received:', request);

  if (request.action === 'getStatus') {
    sendResponse({ status: 'Kshema extension is active' });
    return;
  }

  if (request.action === 'startAutomation') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'START_KSHEMA_FLOW', payload: request.payload },
        (response) => {
          sendResponse(response || { success: true });
        }
      );
    });
    return true;
  }

  if (request.type === 'AWAIT_KSHEMA_QUOTE_DOWNLOAD') {
    const tabId = sender.tab?.id;

    if (typeof tabId !== 'number') {
      sendResponse({ success: false, error: 'Missing tab context for quote download tracking' });
      return;
    }

    const existing = pendingQuoteDownloads.get(tabId);
    if (existing) {
      clearTimeout(existing.timeoutId);
      pendingQuoteDownloads.delete(tabId);
      existing.resolve({ url: null, quoteNumber: null, cancelled: true });
    }

    const timeoutMs = Number(request.timeoutMs) || 15000;
    const timeoutId = setTimeout(() => {
      const pending = pendingQuoteDownloads.get(tabId);
      if (!pending) {
        return;
      }

      pendingQuoteDownloads.delete(tabId);
      pending.reject(new Error('Timed out waiting for quote download'));
    }, timeoutMs);

    pendingQuoteDownloads.set(tabId, {
      resolve: (payload) => sendResponse({ success: true, ...payload }),
      reject: (error) => sendResponse({ success: false, error: error.message }),
      timeoutId
    });

    return true;
  }
});
