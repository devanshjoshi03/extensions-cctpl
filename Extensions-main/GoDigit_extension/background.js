const DEFAULT_GODIGIT_OTP_API_KEY = 'KOSmuBI8gSoZ1mNXl0ecJ5rBlOiak9aXxHO1GwNAjys=';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GODIGIT_LOG') {
    chrome.storage.local.get(['godigitLogs'], (result) => {
      const logs = result.godigitLogs || [];
      logs.push({ time: new Date().toLocaleTimeString(), message: String(message.message || '') });
      chrome.storage.local.set({ godigitLogs: logs.slice(-200) }, () => sendResponse({ success: true }));
    });
    return true;
  }
  if (message.action === 'MARK_GODIGIT_OTP_USED') {
    let requestUrl;
    try { requestUrl = new URL(message.url); }
    catch { sendResponse({ success: false, error: 'Invalid mark-used URL' }); return true; }
    if (requestUrl.protocol !== 'https:' || requestUrl.hostname !== 'otpservice.coverscrafter.com' || !/^\/api\/v1\/otp\/[^/]+\/use$/.test(requestUrl.pathname)) {
      sendResponse({ success: false, error: 'OTP mark-used URL is not permitted' });
      return true;
    }
    chrome.storage.local.get(['godigitOtpConfig'], (result) => {
      const apiKey = String(result.godigitOtpConfig?.apiKey || DEFAULT_GODIGIT_OTP_API_KEY).trim();
      fetch(requestUrl.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'Authorization': `ApiKey ${apiKey}` },
        body: JSON.stringify({})
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        sendResponse({ success: response.ok || response.status === 404, status: response.status, data, error: data?.message || (!response.ok && response.status !== 404 ? `OTP service returned ${response.status}` : '') });
      }).catch((error) => sendResponse({ success: false, error: error.message }));
    });
    return true;
  }
  if (message.action !== 'FETCH_GODIGIT_OTP') return;
  let requestUrl;
  try {
    requestUrl = new URL(message.url);
  } catch {
    sendResponse({ success: false, error: 'Invalid OTP URL' });
    return true;
  }
  if (requestUrl.protocol !== 'https:' || requestUrl.hostname !== 'otpservice.coverscrafter.com') {
    sendResponse({ success: false, error: 'OTP URL is not permitted' });
    return true;
  }
  chrome.storage.local.get(['godigitOtpConfig'], (result) => {
    const apiKey = String(result.godigitOtpConfig?.apiKey || DEFAULT_GODIGIT_OTP_API_KEY).trim();
    if (!apiKey) {
      sendResponse({ success: false, error: 'OTP service API key is missing. Set it in Go Digit settings.' });
      return;
    }
    fetch(requestUrl.href, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Authorization': `ApiKey ${apiKey}`
      }
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        sendResponse({
          success: response.ok && data?.success !== false,
          status: response.status,
          data,
          error: data?.message || (!response.ok ? `OTP service returned ${response.status}` : '')
        });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
  });
  return true;
});