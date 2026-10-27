async function solveTextCaptchaWithOpenAI(apiKey, model, imageData) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Read CAPTCHA text. Return only the visible alphanumeric characters.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the text from this CAPTCHA image. Return only the characters.' },
            { type: 'image_url', image_url: { url: imageData } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 50
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return text.replace(/[^a-zA-Z0-9]/g, '');
}

let suppressAutomationDownloads = false;

function shouldCancelAutomationDownload(downloadItem) {
  if (!suppressAutomationDownloads || !downloadItem) return false;

  const url = String(downloadItem.finalUrl || downloadItem.url || '').toLowerCase();
  const filename = String(downloadItem.filename || '').toLowerCase();
  return url.includes('royal') ||
    url.includes('sundaram') ||
    filename.includes('quote') ||
    filename.includes('policy') ||
    filename.includes('proposal');
}

if (chrome.downloads?.onCreated) {
  chrome.downloads.onCreated.addListener((downloadItem) => {
    if (!shouldCancelAutomationDownload(downloadItem)) return;

    chrome.downloads.cancel(downloadItem.id, () => {
      chrome.downloads.erase({ id: downloadItem.id }, () => {});
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SET_DOWNLOAD_SUPPRESSION') {
    suppressAutomationDownloads = Boolean(msg.enabled);
    sendResponse({ success: true, enabled: suppressAutomationDownloads });
    return true;
  }

  if (msg.action === 'FETCH_OTP') {
    fetch(msg.url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'MARK_OTP_USED') {
    const url = msg.url;
    if (!url || !url.includes('/use')) {
      sendResponse({ success: false, error: 'Invalid mark-used URL' });
      return true;
    }

    fetch(url, { method: 'POST' })
      .then((r) => {
        if (!r.ok) {
          return r.text().then((text) => sendResponse({ success: false, error: text || String(r.status) }));
        }
        const contentType = r.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return r.json().then((data) => sendResponse({ success: true, data }));
        }
        sendResponse({ success: true, data: {} });
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'API_CALL') {
    const opts = {
      method: msg.options?.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...msg.options?.headers }
    };
    if (msg.options?.body) {
      opts.body = typeof msg.options.body === 'string' ? msg.options.body : JSON.stringify(msg.options.body);
    }

    fetch(msg.url, opts)
      .then((r) => r.json().then((data) => sendResponse({ ok: r.ok, status: r.status, data })))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.action === 'FETCH_UPLOAD') {
    fetch(msg.url, { method: 'GET' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => sendResponse({ success: true, buffer }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
      else sendResponse({ dataUrl });
    });
    return true;
  }

  if (msg.action === 'SOLVE_TEXT_CAPTCHA') {
    chrome.storage.local.get(['openaiConfig'], async (r) => {
      const config = r.openaiConfig || {};
      if (!config.apiKey) {
        sendResponse({ success: false, error: 'OpenAI API key not set. Open extension options.' });
        return;
      }

      try {
        const text = await solveTextCaptchaWithOpenAI(config.apiKey, config.model || 'gpt-4o', msg.imageData);
        sendResponse({ success: true, text });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {});
