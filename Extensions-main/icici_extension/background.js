// ICICI Lombard Insurance Automation - Background Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ICICI] Extension installed/updated:', details);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[ICICI] Background received:', request);

  if (request.action === 'getStatus') {
    sendResponse({ status: 'ICICI extension is active' });
  } else if (request.action === 'startAutomation') {
    console.log('[ICICI] Starting automation with payload:', request.payload);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_FLOW', payload: request.payload }, (response) => {
          sendResponse(response || { success: true });
        });
      }
    });
    return true;
  } else if (request.action === 'ICICI_PAGE_UNLOAD') {
    console.log('[ICICI] Page unload received - marking automation stopped');
    try {
      chrome.storage.local.set({
        iciciAutomation: {
          isStopped: true,
          isRunning: false,
          phase: 'stopped',
          currentStep: 'Stopped (page reload)',
          updatedAt: Date.now(),
        },
      });
    } catch (e) {
      console.warn('[ICICI] Failed to persist stopped state on unload', e);
    }
    sendResponse({ success: true });
  }
});

// Periodic status check
chrome.alarms.create('statusCheck', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'statusCheck') {
    console.log('[ICICI] Status check: Running');
  }
});
