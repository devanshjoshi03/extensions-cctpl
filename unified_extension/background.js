async function solveTextCaptchaWithOpenAI(apiKey, model, imageData) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a CAPTCHA text reader. Look at the image and extract ONLY the text characters shown. Return just the text without any explanation or formatting.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Read the text from this CAPTCHA image and return only the characters. Ignore dots, lines, or noise. Return ONLY the alphanumeric text (e.g., "RA4Ns").'
            },
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
  // Clean up the response - remove spaces, punctuation, keep only alphanumeric
  return text.replace(/[^a-zA-Z0-9]/g, '');
}

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

let suppressAutomationDownloads = false;

// ── VEHICLE DETAILS AUTO-TRIGGER ─────────────────────────────────────────────
// BajajForm runs on login.do; clicking Proceed does a full navigation to motorload.do.
// That tears down the content script before it can finish in-tab work. Form flow
// therefore sends START_VEHICLE_DETAILS here; we queue it and relay via
// chrome.tabs.sendMessage after motorload.do finishes loading (content script alive).
let pendingVehicleDetails = null;

const PENDING_VEHICLE_MAX_MS = 120000;

function clearStalePendingVehicleDetails() {
  if (!pendingVehicleDetails) return;
  const t = pendingVehicleDetails.enqueuedAt || 0;
  if (Date.now() - t > PENDING_VEHICLE_MAX_MS) {
    console.log('[BG] Clearing stale pendingVehicleDetails');
    pendingVehicleDetails = null;
  }
}

function pendingVehicleDetailsSummary() {
  if (!pendingVehicleDetails) return 'null';
  const p = pendingVehicleDetails.payload;
  let payloadKeys = [];
  try {
    payloadKeys = p && typeof p === 'object' ? Object.keys(p) : [];
  } catch (_) {}
  return JSON.stringify({
    tabId: pendingVehicleDetails.tabId,
    enqueuedAt: pendingVehicleDetails.enqueuedAt,
    payloadKeys,
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const u = tab?.url ? String(tab.url) : '';
  if (u.includes('bajajgeneral.com')) {
    console.log('[BG] tabs.onUpdated:', tabId, changeInfo.status, u);
    console.log('[BG] pendingVehicleDetails:', pendingVehicleDetailsSummary());
  }

  if (changeInfo.status !== 'complete' || !tab?.url) return;
  clearStalePendingVehicleDetails();
  if (!pendingVehicleDetails || pendingVehicleDetails.tabId !== tabId) return;
  if (!String(tab.url).includes('motorload.do')) return;

  const { payload } = pendingVehicleDetails;
  pendingVehicleDetails = null;

  const delayMs = 1500;
  console.log('[BG] motorload.do load complete — relaying START_VEHICLE_DETAILS in', delayMs, 'ms');
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { action: 'START_VEHICLE_DETAILS', payload }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error('[BG] Relay START_VEHICLE_DETAILS failed:', chrome.runtime.lastError.message);
        return;
      }
      console.log('[BG] START_VEHICLE_DETAILS relayed:', resp);
    });
  }, delayMs);
});

function shouldCancelAutomationDownload(downloadItem) {
  if (!suppressAutomationDownloads || !downloadItem) return false;

  const url = String(downloadItem.finalUrl || downloadItem.url || '').toLowerCase();
  const filename = String(downloadItem.filename || '').toLowerCase();
  return (
    url.includes('bajajgeneral.com') ||
    url.includes('universalsompo.com') ||
    filename.includes('quote') ||
    filename.includes('policy')
  );
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

  if (msg.action === 'LOGIN_RESULT') {
    const tabUrl = String(sender.tab?.url || '');
    if (tabUrl.includes('orientalinsurance.org.in')) {
      if (msg.result?.success && sender.tab?.id) {
        chrome.storage.local.set({
          clickGetQuoteAfterLoad: true,
          orientalFormPayload: msg.payload || {},
        });
        chrome.tabs.update(sender.tab.id, {
          url: 'https://orientalinsurance.org.in/policy/motor/TWO_WHEELER',
        });
      }
    }
    return;
  }

  if (msg.action === 'INJECT_MAIN_WORLD_DIALOG_LOCK') {
    const tabId = msg.tabId != null ? msg.tabId : sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'no tab id' });
      return true;
    }
    chrome.scripting
      .executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        func: function bajajMainWorldLockDialogs() {
          var n = function () {};
          var t = function () { return true; };
          try {
            if (window.__bajajDlgIv) clearInterval(window.__bajajDlgIv);
          } catch (e0) { /* ignore */ }
          window.alert = n;
          window.confirm = t;
          window.prompt = n;
          try {
            Window.prototype.alert = n;
            Window.prototype.confirm = t;
            Window.prototype.prompt = n;
          } catch (e1) { /* ignore */ }
          window.__bajajDlgIv = setInterval(function () {
            try {
              window.alert = n;
              window.confirm = t;
              window.prompt = n;
            } catch (e2) { /* ignore */ }
          }, 100);
        },
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
      );
    return true;
  }

  if (msg.action === 'START_VEHICLE_DETAILS') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ status: 'error', error: 'START_VEHICLE_DETAILS must be sent from a content script (tab)' });
      return true;
    }
    const url = String(sender.tab.url || '');
    console.log('[BG] START_VEHICLE_DETAILS from tab', tabId, 'url:', url);
    if (url.includes('motorload.do')) {
      console.log('[BG] Already on motorload.do — scheduling tabs.sendMessage relay');
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'START_VEHICLE_DETAILS', payload: msg.payload }, () => {
          void chrome.runtime.lastError;
        });
      }, 500);
      sendResponse({ status: 'relay_scheduled' });
      return true;
    }
    pendingVehicleDetails = { payload: msg.payload, tabId, enqueuedAt: Date.now() };
    console.log('[BG] START_VEHICLE_DETAILS queued for tab', tabId, '(wait for motorload.do)', '| pending:', pendingVehicleDetailsSummary());
    sendResponse({ status: 'queued' });
    return true;
  }

  if (msg.action === 'SET_DOWNLOAD_SUPPRESSION') {
    suppressAutomationDownloads = Boolean(msg.enabled);
    sendResponse({ success: true, enabled: suppressAutomationDownloads });
    return true;
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

  if (msg.action === 'SOLVE_TEXT_CAPTCHA') {
    chrome.storage.local.get(['openaiConfig'], async (r) => {
      const config = r.openaiConfig || {};
      if (!config.apiKey) {
        sendResponse({ success: false, error: 'OpenAI API key not set. Right-click extension > Options.' });
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

  // ── BAJAJ KYC TAB HANDLER ─────────────────────────────────────────────────────
  if (msg.type === 'BAJAJ_KYC_INJECT') {
    const { dob, ovdFrontImage, ovdBackImage } = msg.data || {};
    console.log('[BG] BAJAJ_KYC_INJECT received. DOB:', dob);

    let attempts = 0;
    const maxAttempts = 60; // 30 seconds

    const poll = () => {
      chrome.tabs.query({}, (tabs) => {
        const kycTab = tabs.find(t => t.url && (
          t.url.includes('kyc.bajajallianz.com') ||
          t.url.includes('BjazKYCIntegration')   ||
          t.url.includes('/token/')
        ));

        if (!kycTab) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, 500);
          } else {
            console.log('[BG] KYC tab not found after 30s');
            sendResponse({ success: false, error: 'KYC tab not found' });
          }
          return;
        }

        console.log('[BG] ✅ Found KYC tab:', kycTab.url);

        // Wait for tab to finish loading
        const waitForLoad = (tabId, cb) => {
          chrome.tabs.get(tabId, (tab) => {
            if (tab.status === 'complete') cb();
            else setTimeout(() => waitForLoad(tabId, cb), 500);
          });
        };

        waitForLoad(kycTab.id, () => {
          // Store KYC data then inject
          chrome.storage.local.set({ _bajajKycData: { dob, ovdFrontImage, ovdBackImage } }, () => {
            // Extra 2s for page JS to render form
            setTimeout(() => {
              chrome.scripting.executeScript({
                target: { tabId: kycTab.id },
                args: [kycTab.id],
                func: async function (kycTabId) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lockMainWorld = () =>
    new Promise((res) => {
      chrome.runtime.sendMessage(
        { action: 'INJECT_MAIN_WORLD_DIALOG_LOCK', tabId: kycTabId },
        () => {
          void chrome.runtime.lastError;
          res();
        }
      );
    });

  await lockMainWorld();
  window.alert = () => {}; window.confirm = () => true; window.prompt = () => {};

  console.log('[KYC] ⏳ Waiting for DOB field...');
  let dobInput = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    dobInput = document.querySelector('#dob1') ||
               document.querySelector('input[name="dob1"]') ||
               document.querySelector('input[placeholder*="dd-mm-yyyy"]');
    if (dobInput) { console.log('[KYC] ✅ DOB field found'); break; }
    await sleep(300);
  }

  const kycData = await new Promise(res =>
    chrome.storage.local.get('_bajajKycData', d => res(d._bajajKycData || {}))
  );
  const { dob, ovdFrontImage, ovdBackImage } = kycData;

  // ── Fill DOB ──────────────────────────────────────────────────────
  if (dobInput && dob) {
    dobInput.focus();
    dobInput.value = '';
    await sleep(150);
    dobInput.value = dob;
    ['input', 'change'].forEach(e =>
      dobInput.dispatchEvent(new Event(e, { bubbles: true }))
    );
    console.log('[KYC] ✅ DOB filled:', dob);
    await sleep(800);

    // ── Close calendar by pressing Escape + clicking outside ─────────
    dobInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(200);
    dobInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true }));
    dobInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(300);

    // Click somewhere neutral to dismiss calendar
    document.body.click();
    await sleep(500);

    // If calendar still open, click outside it
    const cal = document.querySelector('.datepicker, .calendar, [class*="datepick"], [class*="calendar"]');
    if (cal && cal.offsetParent !== null) {
      console.log('[KYC] ⚠️ Calendar still open, force-closing...');
      // Click label above DOB to dismiss
      const label = document.querySelector('label[for="dob1"]') || document.querySelector('.inputRow label');
      if (label) label.click();
      await sleep(300);
      // Last resort: hide it directly
      cal.style.display = 'none';
    }
    console.log('[KYC] ✅ Calendar closed');
  } else {
    console.log('[KYC] ⚠️ DOB not filled. dobInput:', !!dobInput, 'dob:', dob);
  }
  await sleep(500);

  // ── Aadhaar → No ─────────────────────────────────────────────────────────
  const aadhaarNo = document.querySelector('#isAadhaarNo');
  if (aadhaarNo) {
    aadhaarNo.click(); aadhaarNo.checked = true;
    aadhaarNo.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[KYC] ✅ Aadhaar: No');
  }
  await sleep(500);

  // ── PAN → No ─────────────────────────────────────────────────────────────
  const panNo = document.querySelector('#isPanNo');
  if (panNo) {
    panNo.click(); panNo.checked = true;
    panNo.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[KYC] ✅ PAN: No');
  }
  await sleep(500);

  // ── Policy Name Consent → No ─────────────────────────────────────────────
  const policyNo = document.querySelector('#isPolicyNameConsentNo');
  if (policyNo) {
    policyNo.click(); policyNo.checked = true;
    policyNo.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[KYC] ✅ PolicyNameConsent: No');
  }
  await sleep(500);

  // ── Wait for form to re-render after radio changes ────────────────────────
  await sleep(1000);

  // ── Change Image Type to "Single Images" then back, or keep Single ──────
// First ensure Single Image is selected (it should be by default)
const imageTypeSelect = document.querySelector('select[name="imageType"], #imageType') ||
  Array.from(document.querySelectorAll('select')).find(s =>
    Array.from(s.options).some(o => o.text.includes('Single'))
  );
if (imageTypeSelect) {
  const singleOpt = Array.from(imageTypeSelect.options).find(o => 
    o.text.toLowerCase().includes('single')
  );
  if (singleOpt) {
    imageTypeSelect.value = singleOpt.value;
    imageTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('[KYC] ✅ Image type set to Single');
    await sleep(500);
  }
}

// ── OVD PDF — request background to build it, inject result ──────────────────
if (ovdFrontImage && ovdBackImage) {
  try {
    // Ask background to build PDF (background has no CSP restrictions)
    const pdfResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'BUILD_OVD_PDF', ovdFrontImage, ovdBackImage },
        resolve
      );
    });

    if (!pdfResult?.success) throw new Error(pdfResult?.error || 'PDF build failed');

    // Convert base64 PDF back to Blob (explicit loop to avoid stack overflow)
    const raw      = atob(pdfResult.pdfB64);
    const pdfBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) pdfBytes[i] = raw.charCodeAt(i);
    const pdfBlob  = new Blob([pdfBytes], { type: 'application/pdf' });
    const file     = new File([pdfBlob], 'ovd_document.pdf', { type: 'application/pdf' });

    const fi = document.querySelector('#ocrSingleDocumentFile');
    if (fi) {
      const origStyle = fi.getAttribute('style') || '';
      fi.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; position:absolute; left:-9999px;';

      const dt = new DataTransfer();
      dt.items.add(file);
      fi.files = dt.files;

      fi.dispatchEvent(new Event('change', { bubbles: true }));
      fi.dispatchEvent(new Event('input',  { bubbles: true }));

      if (typeof window.$ !== 'undefined' || typeof window.jQuery !== 'undefined') {
        const jq = window.$ || window.jQuery;
        try { jq(fi).trigger('change'); } catch(e) {}
      }

      fi.setAttribute('style', origStyle);
      console.log('[KYC] ✅ OVD PDF injected, size:', file.size);
      await sleep(800);

      const errMsg = document.querySelector('#ocrSingleDocumentFile-error-msg');
      if (errMsg) errMsg.style.display = 'none';
    } else {
      console.log('[KYC] ⚠️ #ocrSingleDocumentFile not found');
    }
  } catch (e) {
    console.log('[KYC] ⚠️ PDF inject error:', e.message);
  }
} else {
  console.log('[KYC] ⚠️ OVD images missing');
}
await sleep(500);

  // ── Captcha — safe math eval (no unsafe-eval needed) ─────────────────────────
const captchaValEl = document.querySelector('#captchaVal');
if (captchaValEl) {
  try {
    const expr = captchaValEl.textContent.trim();
    const norm = expr.replace(/×/g,'*').replace(/÷/g,'/').replace(/\s+/g,'').replace(/x/gi,'*');
    
    // CSP-safe math parser (supports +, -, *, / with integers only)
    const safeCalc = (str) => {
      // Tokenize
      const tokens = str.match(/(\d+|[+\-*/])/g);
      if (!tokens) throw new Error('Cannot parse: ' + str);
      
      // Two-pass: first handle * and /, then + and -
      let nums = [], ops = [];
      let i = 0;
      nums.push(parseInt(tokens[i++], 10));
      while (i < tokens.length) {
        const op  = tokens[i++];
        const num = parseInt(tokens[i++], 10);
        if (op === '*') { nums[nums.length - 1] *= num; }
        else if (op === '/') { nums[nums.length - 1] = Math.round(nums[nums.length - 1] / num); }
        else { ops.push(op); nums.push(num); }
      }
      let result = nums[0];
      for (let j = 0; j < ops.length; j++) {
        result = ops[j] === '+' ? result + nums[j+1] : result - nums[j+1];
      }
      return result;
    };

    const answer = safeCalc(norm);
    console.log('[KYC] 🔢 Captcha:', expr, '=', answer);

    const ci = document.querySelector('#captcha');
    if (ci) {
      // Use nativeInputValueSetter to bypass React/framework value setter if present
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(ci, String(answer));
      } else {
        ci.value = String(answer);
      }
      
      ci.dispatchEvent(new Event('input',  { bubbles: true }));
      ci.dispatchEvent(new Event('change', { bubbles: true }));
      // Do NOT dispatch blur/focus — page clears on click, may clear on blur too
      console.log('[KYC] ✅ Captcha filled:', answer, '| field now shows:', ci.value);
    }
  } catch (e) {
    console.log('[KYC] ⚠️ Captcha error:', e.message);
  }
} else {
  console.log('[KYC] ⚠️ #captchaVal not found');
}
// NO sleep here — go straight to Upload before anything clears captcha

  // ── Disclaimer checkboxes (ensure still checked) ──────────────────────────
for (const sel of ['#self', '#self1', '#self2']) {
  const cb = document.querySelector(sel);
  if (cb && !cb.checked) {
    cb.click(); cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
await sleep(200);

// ── Click Upload (#uploadOCR) ─────────────────────────────────────────────
console.log('[KYC] 🔘 Clicking #uploadOCR...');
const uploadBtn = document.querySelector('#uploadOCR');
if (uploadBtn) {
  uploadBtn.click();
  console.log('[KYC] ✅ Clicked #uploadOCR');
  await sleep(3000);
} else {
  // Fallback: find visible orange Upload button
  const fallback = Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent.trim().toLowerCase() === 'upload' && b.offsetParent !== null
  );
  if (fallback) {
    fallback.click();
    console.log('[KYC] ✅ Clicked fallback Upload button');
    await sleep(3000);
  } else {
    console.log('[KYC] ⚠️ Upload button not found');
  }
}

// ── Wait and click "Proceed for KYC" button ────────────────────────────────
console.log('[KYC] ⏳ Waiting 5-10 seconds after upload...');
await sleep(7000); // Wait 7 seconds for upload processing

console.log('[KYC] 🔘 Looking for "Proceed for KYC" button...');
const proceedBtn = document.querySelector('#ocrKycBtn') ||
                   Array.from(document.querySelectorAll('button')).find(b =>
                     b.textContent.trim().includes('Proceed for KYC') && b.offsetParent !== null
                   );

if (proceedBtn) {
  await lockMainWorld();
  proceedBtn.click();
  console.log('[KYC] ✅ Clicked "Proceed for KYC" button');
  await sleep(2000);

  // ── Wait and click "Close" button ────────────────────────────────────────
  console.log('[KYC] ⏳ Waiting 5 seconds after proceeding...');
  await sleep(5000);

  console.log('[KYC] 🔘 Looking for "Close" button...');
  const closeBtn = document.querySelector('#closeModule') ||
                   Array.from(document.querySelectorAll('button')).find(b =>
                     b.textContent.trim().toLowerCase() === 'close' && b.offsetParent !== null
                   );

  if (closeBtn) {
    await lockMainWorld();
    await lockMainWorld();
    closeBtn.click();
    console.log('[KYC] ✅ Clicked "Close" button');
    await sleep(1000);
  } else {
    console.log('[KYC] ⚠️ "Close" button not found. Available buttons:',
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
  }
} else {
  console.log('[KYC] ⚠️ "Proceed for KYC" button not found. Available buttons:',
    Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
}

console.log('[KYC] ✅ KYC form filling done');
}
              }, (results) => {
                if (chrome.runtime.lastError) {
                  console.log('[BG] ⚠️ Script inject error:', chrome.runtime.lastError.message);
                  sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                  console.log('[BG] ✅ KYC script injected');
                  sendResponse({ success: true });
                }
              });
            }, 2000);
          });
        });
      });
    };

    poll();
    return true; // Keep message channel open for async sendResponse
  }

  // ── BUILD_OVD_PDF: Create PDF from base64 images (no CSP restrictions) ───────
  if (msg.action === 'BUILD_OVD_PDF') {
    (async () => {
      try {
        const { ovdFrontImage, ovdBackImage } = msg;

        // ── Pure JS PDF builder (no external lib needed) ────────────────────────
        const strip  = b64 => (b64?.includes(',') ? b64.split(',')[1] : b64) || '';
        const isJpeg = b64 => !b64.startsWith('iVBORw'); // PNG starts with iVBORw

        const frontB64 = strip(ovdFrontImage);
        const backB64  = strip(ovdBackImage);

        // Build a minimal valid PDF with two JPEG or PNG images
        // We'll embed images as JPEG (convert PNG→JPEG via OffscreenCanvas if needed)
        const toJpegB64 = async (b64, isJpg) => {
          if (isJpg) return b64;
          // Convert PNG to JPEG via OffscreenCanvas
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob  = new Blob([bytes], { type: 'image/png' });
          const bmp   = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bmp.width, bmp.height);
          canvas.getContext('2d').drawImage(bmp, 0, 0);
          const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
          const ab = await jpegBlob.arrayBuffer();
          return uint8ToBase64(new Uint8Array(ab));  // ✅ chunked
        };

        const frontJpeg = await toJpegB64(frontB64, isJpeg(frontB64));
        const backJpeg  = await toJpegB64(backB64,  isJpeg(backB64));

        // Get image dimensions via OffscreenCanvas
        const getDims = async (b64) => {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob  = new Blob([bytes], { type: 'image/jpeg' });
          const bmp   = await createImageBitmap(blob);
          return { w: bmp.width, h: bmp.height };
        };

        const frontDims = await getDims(frontJpeg);
        const backDims  = await getDims(backJpeg);

        // ── Build raw PDF bytes ─────────────────────────────────────────────────
        const pdfBytes = buildRawPdf([
          { b64: frontJpeg, w: frontDims.w, h: frontDims.h },
          { b64: backJpeg,  w: backDims.w,  h: backDims.h  },
        ]);

        const pdfB64 = uint8ToBase64(pdfBytes);  // ✅ chunked — was btoa(String.fromCharCode(...pdfBytes))
        sendResponse({ success: true, pdfB64 });

      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});

// ── Chunked base64 helper (prevents stack overflow on large arrays) ─────────────
const uint8ToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

// ── Minimal PDF builder — no external dependencies ────────────────────────────
function buildRawPdf(images) {
  // images: [{b64: string, w: number, h: number}]
  // Returns Uint8Array of a valid PDF with one image per page (A4 fitted)

  const A4_W = 595, A4_H = 842; // A4 in points at 72dpi

  const enc  = str => new TextEncoder().encode(str);
  const cat  = (...parts) => {
    const totalLen = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  };

  const chunks   = [];
  const offsets  = [];
  let   pos      = 0;

  const write = (str) => {
    const b = enc(str);
    chunks.push(b);
    pos += b.length;
  };
  const writeRaw = (bytes) => {
    chunks.push(bytes);
    pos += bytes.length;
  };
  const mark = () => offsets.push(pos);

  // Header
  write('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // One XObject + page per image
  const imgObjNums  = [];
  const pageObjNums = [];
  const pageTreeNum = 1;
  let   objNum      = 2; // 1 = page tree

  for (let i = 0; i < images.length; i++) {
    const { b64, w, h } = images[i];
    const imgBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    // Scale image to fit A4 keeping aspect ratio
    const scale = Math.min(A4_W / w, A4_H / h);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    const dx = Math.round((A4_W - dw) / 2);
    const dy = Math.round((A4_H - dh) / 2);

    // Image XObject
    const imgNum = objNum++;
    imgObjNums.push(imgNum);
    mark();
    write(`${imgNum} 0 obj\n`);
    write(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} `);
    write(`/ColorSpace /DeviceRGB /BitsPerComponent 8 `);
    write(`/Filter /DCTDecode /Length ${imgBytes.length} >>\n`);
    write('stream\n');
    writeRaw(imgBytes);
    write('\nendstream\nendobj\n');

    // Content stream
    const csNum = objNum++;
    const cs    = `q ${dw} 0 0 ${dh} ${dx} ${dy} cm /Im${i} Do Q`;
    mark();
    write(`${csNum} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);

    // Page object
    const pageNum = objNum++;
    pageObjNums.push(pageNum);
    mark();
    write(`${pageNum} 0 obj\n`);
    write(`<< /Type /Page /Parent ${pageTreeNum} 0 R `);
    write(`/MediaBox [0 0 ${A4_W} ${A4_H}] `);
    write(`/Contents ${csNum} 0 R `);
    write(`/Resources << /XObject << /Im${i} ${imgNum} 0 R >> >> >>\n`);
    write('endobj\n');
  }

  // Page tree (obj 1)
  const pageTreeOffset = pos;
  offsets.unshift(pageTreeOffset); // insert at index 0 for obj 1
  write(`1 0 obj\n<< /Type /Pages /Kids [`);
  write(pageObjNums.map(n => `${n} 0 R`).join(' '));
  write(`] /Count ${images.length} >>\nendobj\n`);

  // Catalog
  const catNum = objNum++;
  mark();
  write(`${catNum} 0 obj\n<< /Type /Catalog /Pages ${pageTreeNum} 0 R >>\nendobj\n`);

  // xref
  const xrefOffset = pos;
  const totalObjs  = offsets.length + 1; // +1 for obj 0
  write(`xref\n0 ${totalObjs}\n`);
  write('0000000000 65535 f \n');
  for (const off of offsets) {
    write(String(off).padStart(10, '0') + ' 00000 n \n');
  }
  write(`trailer\n<< /Size ${totalObjs} /Root ${catNum} 0 R >>\n`);
  write(`startxref\n${xrefOffset}\n%%EOF\n`);

  // Concatenate all chunks
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

chrome.runtime.onInstalled.addListener(() => {});

// ICICI Lombard — popup may also message content directly; keep background relay for compatibility
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse({ status: 'ICICI extension is active' });
    return;
  }
  if (request.action === 'startAutomation') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'START_FLOW', payload: request.payload },
          (response) => {
            sendResponse(response || { success: true });
          }
        );
      }
    });
    return true;
  }
});

chrome.alarms.create('statusCheck', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'statusCheck') {
    console.log('[Unified] Status check: Running');
  }
});