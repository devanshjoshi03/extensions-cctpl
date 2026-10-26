(function () {
  'use strict';

  if (window.__kshemaQuoteResponseHookInstalled) {
    return;
  }

  window.__kshemaQuoteResponseHookInstalled = true;

  function isQuoteUrl(url) {
    try {
      const parsed = new URL(String(url), window.location.href);
      return parsed.origin === 'https://motorinsurance.kshema.co' &&
        parsed.pathname === '/api/v1/quote';
    } catch (error) {
      return false;
    }
  }

  function isProposalUrl(url) {
    try {
      const parsed = new URL(String(url), window.location.href);
      return parsed.origin === 'https://motorinsurance.kshema.co' &&
        parsed.pathname === '/api/v1/proposal';
    } catch (error) {
      return false;
    }
  }

  function collectErrors(payload) {
    const errors = [];
    const seen = new Set();

    function addError(error) {
      if (!error || typeof error !== 'object') {
        return;
      }

      const msg = typeof error.msg === 'string' ? error.msg.trim() : '';
      if (msg) {
        const key = `${error.name || ''}\n${msg}`;
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        errors.push({
          name: error.name || '',
          msg
        });
      }
    }

    function visit(value) {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }

      if (Array.isArray(value.errors)) {
        value.errors.forEach(addError);
      }

      Object.keys(value).forEach(key => {
        if (key !== 'errors') {
          visit(value[key]);
        }
      });
    }

    visit(payload);

    return errors;
  }

  function publishResponse(type, url, payload) {
    window.postMessage({
      source: 'KSHEMA_QUOTE_RESPONSE_HOOK',
      type,
      url,
      capturedAt: Date.now(),
      errors: collectErrors(payload)
    }, '*');
  }

  function handleResponse(url, responseText) {
    const type = isQuoteUrl(url)
      ? 'QUOTE_RESPONSE'
      : isProposalUrl(url)
        ? 'PROPOSAL_RESPONSE'
        : '';

    if (!type || !responseText) {
      return;
    }

    try {
      publishResponse(type, url, JSON.parse(responseText));
    } catch (error) {
      // Ignore non-JSON or partial responses.
    }
  }

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const requestUrl = args[0]?.url || args[0];

      if (isQuoteUrl(requestUrl) || isProposalUrl(requestUrl)) {
        response.clone().text()
          .then(text => handleResponse(requestUrl, text))
          .catch(() => {});
      }

      return response;
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this.__kshemaQuoteUrl = url;
      return originalOpen.call(this, method, url, ...args);
    };

    window.XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try {
          handleResponse(this.__kshemaQuoteUrl, this.responseText);
        } catch (error) {
          // Ignore inaccessible response bodies.
        }
      });

      return originalSend.apply(this, args);
    };
  }
})();
