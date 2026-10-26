(function () {
  'use strict';

  const PAGE_SOURCE = 'ROYAL_POLICY_PRINT_FLOW';
  const EXTENSION_SOURCE = 'ROYAL_POLICY_PRINT_EXTENSION';

  function postStartToPage() {
    window.postMessage({
      source: EXTENSION_SOURCE,
      type: 'START_POLICY_PRINT_FLOW'
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== PAGE_SOURCE) return;

    if (event.data.type === 'SAVE_PDF') {
      const requestId = event.data.requestId;
      chrome.runtime.sendMessage({
        action: 'POLICY_PRINT_SAVE_PDF',
        policyCode: event.data.policyCode,
        file: event.data.file
      }, (response) => {
        const result = chrome.runtime.lastError
          ? { success: false, error: chrome.runtime.lastError.message }
          : (response || { success: false, error: 'No response from background.' });

        window.postMessage({
          source: EXTENSION_SOURCE,
          type: 'SAVE_PDF_RESPONSE',
          requestId,
          result
        }, '*');
      });
      return;
    }

    chrome.runtime.sendMessage({
      action: 'POLICY_PRINT_EVENT',
      event: {
        type: event.data.type,
        message: event.data.message,
        color: event.data.color,
        success: event.data.success
      }
    }, () => void chrome.runtime.lastError);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === 'START_POLICY_PRINT_FLOW') {
      postStartToPage();
      sendResponse({ success: true });
      return true;
    }

    if (message?.action === 'PING_POLICY_PRINT_CONTENT') {
      sendResponse({ success: true });
      return true;
    }

    return false;
  });
})();
