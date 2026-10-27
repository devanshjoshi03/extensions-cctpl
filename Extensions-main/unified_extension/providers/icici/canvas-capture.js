(function () {
  'use strict';

  if (window.__iciciCanvasTextCaptureInstalled) return;
  window.__iciciCanvasTextCaptureInstalled = true;
  window.__iciciCanvasTextCaptures = window.__iciciCanvasTextCaptures || [];

  function captureText(ctx, text) {
    try {
      const canvas = ctx && ctx.canvas;
      if (!canvas || text == null) return;
      const value = String(text).trim();
      if (!value || value.length > 20) return;

      canvas.dataset.iciciCanvasText = value;
      window.__iciciCanvasTextCaptures.push({
        text: value,
        ts: Date.now(),
        width: canvas.width,
        height: canvas.height,
      });

      if (window.__iciciCanvasTextCaptures.length > 30) {
        window.__iciciCanvasTextCaptures.shift();
      }
    } catch (_) {}
  }

  ['fillText', 'strokeText'].forEach((method) => {
    const original = CanvasRenderingContext2D.prototype[method];
    if (typeof original !== 'function') return;

    CanvasRenderingContext2D.prototype[method] = function patchedCanvasText(text, ...args) {
      captureText(this, text);
      return original.call(this, text, ...args);
    };
  });
})();
