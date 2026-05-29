async function solveWithOpenAI(apiKey, model, challengeText, imageData) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a visual CAPTCHA solver. You will see a 3x3 image grid. Identify ALL cells containing the requested object. Return ONLY valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Solve this visual CAPTCHA.\n\nGrid layout (0-based, left-to-right, top-to-bottom):\n[0][1][2]\n[3][4][5]\n[6][7][8]\n\nChallenge: "${challengeText}"\n\nEvaluate each cell row by row, then column by column. Select ALL cells that clearly contain the target object.\nReturn ONLY JSON: {"matches": [0, 2, 5]}\nNo markdown, no explanation, no code blocks.`
            },
            { type: 'image_url', image_url: { url: imageData } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 200
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response: ' + raw.slice(0, 100));
  const parsed = JSON.parse(jsonMatch[0]);
  const matches = parsed.matches || parsed.indices || [];
  return [...new Set(matches.filter(i => typeof i === 'number' && i >= 0 && i < 9))].sort((a, b) => a - b);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'LOGIN_RESULT') {
    if (msg.result?.success && sender.tab?.id) {
      chrome.storage.local.set({
        clickGetQuoteAfterLoad: true,
        orientalFormPayload: msg.payload || {}
      });
      chrome.tabs.update(sender.tab.id, { url: 'https://orientalinsurance.org.in/policy/motor/TWO_WHEELER' });
      // chrome.tabs.update(sender.tab.id, { url: 'https://orientalinsurance.org.in/make-payments' });
    }
    return;
  }

  if (msg.action === 'FETCH_OTP') {
    fetch(msg.url, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(e => sendResponse({ success: false, error: e.message }));
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
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('application/json')) {
          return r.json().then((data) => sendResponse({ success: true, data }));
        }
        sendResponse({ success: true, data: {} });
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'API_CALL') {
    const opts = { method: msg.options?.method || 'GET', headers: { 'Content-Type': 'application/json', ...msg.options?.headers } };
    if (msg.options?.body) opts.body = typeof msg.options.body === 'string' ? msg.options.body : JSON.stringify(msg.options.body);
    fetch(msg.url, opts)
      .then(r => r.json().then(data => sendResponse({ ok: r.ok, status: r.status, data })))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.action === 'FETCH_UPLOAD') {
    fetch(msg.url, { method: 'GET' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buffer => sendResponse({ success: true, buffer }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg.action === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
      else sendResponse({ dataUrl });
    });
    return true;
  }

  if (msg.action === 'SOLVE_CAPTCHA') {
    chrome.storage.local.get(['openaiConfig'], async (r) => {
      const config = r.openaiConfig || {};
      if (!config.apiKey) {
        sendResponse({ success: false, error: 'OpenAI API key not set. Right-click extension > Options.' });
        return;
      }
      try {
        const indices = await solveWithOpenAI(config.apiKey, config.model || 'gpt-4o', msg.challengeText, msg.imageData);
        sendResponse({ success: true, indices });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {});
