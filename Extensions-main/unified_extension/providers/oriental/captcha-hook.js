
(function () {
  'use strict';

  if (window.__captchaHookInstalled) return;
  window.__captchaHookInstalled = true;
  window.__captcha_chars = [];
  window.__captcha_filled = false;

  const origFillText = CanvasRenderingContext2D.prototype.fillText;

  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    const isCaptchaCanvas = this.canvas && this.canvas.classList &&
      this.canvas.classList.contains('captcha-canvas');

    if (isCaptchaCanvas && !window.__captcha_filled) {
      window.__captcha_chars.push({ text, x });
    }

    const result = origFillText.call(this, text, x, y, ...rest);

    if (isCaptchaCanvas && !window.__captcha_filled) {
      clearTimeout(window.__captcha_timer);
      window.__captcha_timer = setTimeout(() => {
        if (!window.__captcha_chars.length || window.__captcha_filled) return;

        const captcha = window.__captcha_chars
          .sort((a, b) => a.x - b.x)
          .map(c => c.text)
          .join('');

        if (captcha.length < 4) {
          window.__captcha_chars = [];
          return;
        }

        console.log('[Oriental CAPTCHA] Decoded:', captcha);

        const input = document.querySelector('#captcha');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set;
          if (setter) setter.call(input, captcha);
          else input.value = captcha;

          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          window.__captcha_filled = true;
          console.log('[Oriental CAPTCHA] Auto-filled');
        }
        window.__captcha_chars = [];
      }, 500);
    }

    return result;
  };

  console.log('[Oriental CAPTCHA] Hook installed (MAIN world)');
  const observer = new MutationObserver(() => {
    if (document.documentElement.getAttribute('data-captcha-reset') === '1') {
      document.documentElement.removeAttribute('data-captcha-reset');
      window.__captcha_chars = [];
      window.__captcha_filled = false;
      console.log('[Oriental CAPTCHA] Reset for new captcha');
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-captcha-reset'] });
})();
