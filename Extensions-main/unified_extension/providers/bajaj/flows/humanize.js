/**
 * humanize.js — human-behaviour simulation for form automation.
 *
 * The portal's bot tracker reads the live event stream and records:
 *   cursorMovementPatterns ("Linear" when the mouse never moves / moves straight)
 *   fieldFocusDuration     (how long a field stays focused)
 *   typingSpeed            (derived from inter-keystroke timing)
 *   keypressBehaviour      ("typed" vs "copied")
 *
 * Setting el.value directly + one 'input' event gives it none of that signal,
 * so it flags us. This module reproduces the signals a real person emits:
 *   - a curved, variable-speed mouse path (not "Linear") before touching a field
 *   - real keydown/keypress/input/keyup per character with human cadence
 *   - a genuine Ctrl+V paste (keydown Ctrl -> keydown V -> `paste` ClipboardEvent
 *     with clipboardData -> input[insertFromPaste] -> keyups), which is what a
 *     person does for a VIN / engine / chassis number => keypressBehaviour "copied"
 *
 * LIMITATION: synthetic events report event.isTrusted === false. This beats
 * heuristic trackers (the ones that read the values above). A detector that
 * hard-gates on isTrusted needs trusted events from the chrome.debugger Input
 * domain, driven from background.js — see README "Humanized input".
 */

const Humanize = (() => {
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // A virtual cursor so movements are continuous instead of teleports.
  let cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function dispatchMouse(type, x, y, target) {
    const cx = clamp(x, 0, window.innerWidth - 1);
    const cy = clamp(y, 0, window.innerHeight - 1);
    const el = target || document.elementFromPoint(cx, cy) || document.body;
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: cx,
        clientY: cy,
        screenX: cx,
        screenY: cy,
      })
    );
  }

  // Quadratic-bezier path from the current cursor to (x, y): the control point is
  // pushed off the straight line so the path curves, and ease-in-out makes speed
  // non-constant (accelerate, then decelerate) — i.e. not "Linear".
  async function moveTo(x, y, opts = {}) {
    const steps = opts.steps || randInt(18, 34);
    const start = { ...cursor };
    const ctrlX = (start.x + x) / 2 + rand(-130, 130);
    const ctrlY = (start.y + y) / 2 + rand(-130, 130);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const te = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
      const bx = (1 - te) ** 2 * start.x + 2 * (1 - te) * te * ctrlX + te ** 2 * x;
      const by = (1 - te) ** 2 * start.y + 2 * (1 - te) * te * ctrlY + te ** 2 * y;
      const jx = bx + rand(-1.6, 1.6); // sub-pixel jitter
      const jy = by + rand(-1.6, 1.6);
      cursor = { x: jx, y: jy };
      dispatchMouse('mousemove', jx, jy);
      await sleep(rand(6, 18));
    }
    cursor = { x, y };
  }

  function pointInside(el) {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width * rand(0.3, 0.7),
      y: r.top + r.height * rand(0.3, 0.7),
    };
  }

  async function moveToElement(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}
    await sleep(rand(60, 160));
    const { x, y } = pointInside(el);
    await moveTo(x, y);
    dispatchMouse('mouseover', x, y, el);
    dispatchMouse('mousemove', x, y, el);
  }

  async function humanClick(el) {
    if (!el) return;
    await moveToElement(el);
    const { x, y } = cursor;
    dispatchMouse('mousedown', x, y, el);
    await sleep(rand(40, 110));
    dispatchMouse('mouseup', x, y, el);
    if (typeof el.click === 'function') el.click();
    else dispatchMouse('click', x, y, el);
  }

  // Native setter so Angular / PrimeNG reactive forms notice the change.
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function codeFor(ch) {
    if (/[0-9]/.test(ch)) return 'Digit' + ch;
    if (/[a-zA-Z]/.test(ch)) return 'Key' + ch.toUpperCase();
    if (ch === ' ') return 'Space';
    if (ch === '-') return 'Minus';
    return 'Unidentified';
  }

  function emitKey(el, ch) {
    const base = { bubbles: true, cancelable: true, key: ch, code: codeFor(ch) };
    el.dispatchEvent(new KeyboardEvent('keydown', base));
    el.dispatchEvent(new KeyboardEvent('keypress', base));
    setNativeValue(el, el.value + ch);
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: ch,
        inputType: 'insertText',
      })
    );
    el.dispatchEvent(new KeyboardEvent('keyup', base));
  }

  /**
   * Type into a field like a person: move → click → focus → per-character
   * keystrokes with variable cadence and the occasional "think" pause.
   * Focus duration ends up proportional to the text length (realistic), not 51s.
   */
  async function type(el, text, opts = {}) {
    if (!el) return;
    await humanClick(el);
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    setNativeValue(el, '');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'deleteContentBackward' }));

    const str = String(text ?? '');
    const minKey = opts.minKey ?? 70;
    const maxKey = opts.maxKey ?? 190;
    for (let i = 0; i < str.length; i++) {
      emitKey(el, str[i]);
      let delay = rand(minKey, maxKey);
      if (Math.random() < 0.08) delay += rand(180, 500); // hesitation
      await sleep(delay);
    }
    await sleep(rand(120, 350));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Paste into a field with Ctrl+V, the natural thing for a VIN / engine /
   * chassis number. Produces keypressBehaviour "copied" with a real `paste`
   * event + clipboardData, a short settle before the paste, and a focus
   * duration a person would actually take (~1s), not an instant value swap.
   */
  async function paste(el, text) {
    if (!el) return;
    await humanClick(el);
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    await sleep(rand(250, 650)); // person glances at the field before pasting

    const str = String(text ?? '');
    el.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Control', code: 'ControlLeft', ctrlKey: true })
    );
    await sleep(rand(30, 90));
    el.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v', code: 'KeyV', ctrlKey: true })
    );

    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', str);
      el.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
      );
    } catch (_) {
      // Some engines lock clipboardData on constructed events; value set below still lands.
    }

    setNativeValue(el, str);
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        data: str,
        inputType: 'insertFromPaste',
      })
    );

    await sleep(rand(30, 90));
    el.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'v', code: 'KeyV', ctrlKey: true })
    );
    el.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Control', code: 'ControlLeft' })
    );
    await sleep(rand(150, 400));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Ambient drift: idle mouse wander so cursorMovementPatterns is never a flat line.
  let _driftTimer = null;
  function startAmbientMovement() {
    if (_driftTimer) return;
    const tick = async () => {
      try {
        await moveTo(rand(40, window.innerWidth - 40), rand(40, window.innerHeight - 40), {
          steps: randInt(14, 26),
        });
      } catch (_) {}
      _driftTimer = setTimeout(tick, rand(900, 2600));
    };
    _driftTimer = setTimeout(tick, rand(400, 1200));
  }
  function stopAmbientMovement() {
    if (_driftTimer) {
      clearTimeout(_driftTimer);
      _driftTimer = null;
    }
  }

  return {
    rand,
    randInt,
    sleep,
    moveTo,
    moveToElement,
    humanClick,
    type,
    paste,
    setNativeValue,
    startAmbientMovement,
    stopAmbientMovement,
  };
})();

window.Humanize = Humanize;
// Convenience: a global random-delay helper for flows (e.g. await this.sleep(rand(500, 900))).
if (typeof window.rand === 'undefined') {
  window.rand = (min, max) => Math.random() * (max - min) + min;
}
