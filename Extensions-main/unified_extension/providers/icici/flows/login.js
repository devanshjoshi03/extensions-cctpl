/**
 * ICICI Lombard Insurance Login Flow
 * Handles login to https://nysa.icicilombard.com/#/login
 */

const ICICILogin = {
  async run(payload, logger = console.log) {
    const pauseAt = async (label) => window.AutomationPauseController?.checkpoint(label);
    const agent = payload?.agentDetails || {};
    const username = agent.username || '';
    const password = agent.password || '';

    if (!username || !password) {
      logger('❌ Missing username or password');
      return { success: false, error: 'Missing username or password' };
    }

    // Block ALL dialogs globally
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};

    logger('🚀 Starting ICICI Lombard login flow...');
    logger('Current URL:', window.location.href);

    try {
      // Check if already on dashboard - skip login
      if (window.location.href.includes('/#/dashboard')) {
        logger('✅ Already on dashboard - skipping login');
        return { success: true, skipped: true, onDashboard: true };
      }

      // Check if already logged in
      if (this.isLoggedIn()) {
        logger('✅ Already logged in');
        return { success: true, skipped: true };
      }

      // Navigate to login page if not there
      if (!window.location.href.includes('/#/login')) {
        logger('🔄 Navigating to login page...');
        window.location.href = 'https://nysa.icicilombard.com/#/login';
        await this.waitForLogin(logger);
      }

      logger('✅ On login page');

      // Fill username
      await pauseAt('Login -> Username');
      const usernameFilled = await this.fillUsername(username, logger);
      if (!usernameFilled) {
        throw new Error('Failed to fill username');
      }

      // Fill password
      await pauseAt('Login -> Password');
      const passwordFilled = await this.fillPassword(password, logger);
      if (!passwordFilled) {
        throw new Error('Failed to fill password');
      }

      // Solve CAPTCHA if present
      await pauseAt('Login -> CAPTCHA');
      const captchaFilled = await this.solveCaptcha(logger);
      if (!captchaFilled) {
        throw new Error('Failed to auto-fill CAPTCHA');
      }

      // Submit login
      await pauseAt('Login -> Submit');
      const submitted = await this.submitLogin(logger);
      if (!submitted) {
        throw new Error('Failed to submit login form');
      }

      logger('✅ Login submitted successfully');

      // Wait for dashboard to load
      await pauseAt('Login -> Wait for dashboard');
      const dashboardLoaded = await this.waitForDashboard(logger);
      if (!dashboardLoaded) {
        throw new Error('Dashboard did not load after login');
      }

      return { success: true };

    } catch (err) {
      logger('❌ Login failed:', err.message);
      return { success: false, error: err.message };
    }
  },

  isLoggedIn() {
    // Check if already logged in by looking for dashboard indicators
    const dashboardElements = document.querySelector('[class*="dashboard"], [class*="sidebar"], .profile-menu');
    
    return !!dashboardElements;
  },

  waitForLogin(logger) {
    logger('⏳ Waiting for login page to load...');
    return new Promise((resolve) => {
      const check = () => {
        if (window.location.href.includes('/#/login')) {
          setTimeout(resolve, 500);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  },

  async fillUsername(username, logger) {
    logger('🔍 Looking for username field...');

    const selectors = [
      'input[type="text"][name="username"][formcontrolname="username"][placeholder="Username"]',
      'input[formcontrolname="username"]',
      'input[name="username"]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="User" i]',
      'input[type="text"]:first-of-type'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && input.offsetParent !== null) {
        logger(`✅ Found username field: ${selector}`);
        const utils = window.flowUtils || {};
        (utils.fillInput || fillInput)(input, username);
        logger(`📝 Username filled: ${username}`);
        return true;
      }
    }

    logger('❌ Username field not found');
    return false;
  },

  async fillPassword(password, logger) {
    logger('🔍 Looking for password field...');

    const selectors = [
      'input[type="password"][name="password"][formcontrolname="password"][placeholder="Password"]',
      'input[formcontrolname="password"]',
      'input[name="password"]',
      'input[type="password"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && input.offsetParent !== null) {
        logger(`✅ Found password field: ${selector}`);
        const utils = window.flowUtils || {};
        (utils.fillInput || fillInput)(input, password);
        logger(`📝 Password filled`);
        return true;
      }
    }

    logger('❌ Password field not found');
    return false;
  },

  async solveCaptcha(logger) {
    logger('🔍 Looking for CAPTCHA...');

    const captchaInput = document.querySelector(
      'input[type="text"][name="captcha"][formcontrolname="captcha"][placeholder="Enter Captcha"], ' +
      'input[formcontrolname="captcha"], input[name="captcha"], input[placeholder*="Captcha" i]'
    );
    
    if (!captchaInput) {
      logger('⚠️ CAPTCHA input not found');
      return false;
    }

    logger('⏳ CAPTCHA found, solving from canvas...');

    try {
      const canvas = document.querySelector('.captcha-canvas-wrapper canvas, canvas[width="140"][height="60"], canvas');
      if (!canvas) {
        logger('⚠️ CAPTCHA canvas not found');
        return false;
      }

      logger('✅ CAPTCHA canvas found');
      const utils = window.flowUtils || {};
      const highlightFn = utils.highlightElement || (typeof highlightElement === 'function' ? highlightElement : null);
      if (highlightFn) {
        highlightFn(captchaInput, '#ff9800', 3000);
      }
      captchaInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      captchaInput.focus();

      const captchaText =
        this.solveCaptchaFromCanvasTextCapture(canvas, logger) ||
        this.solveCaptchaFromPageState(canvas, captchaInput, logger);
      if (!captchaText) {
        logger('⚠️ CAPTCHA text was not captured');
        return false;
      }

      const normalizedCaptcha = this.normalizeCaptchaAnswer(captchaText, captchaInput);
      if (!normalizedCaptcha) {
        logger(`⚠️ CAPTCHA solver returned invalid answer: ${captchaText}`);
        return false;
      }

      (utils.fillInput || fillInput)(captchaInput, normalizedCaptcha);
      logger(`✅ CAPTCHA auto-filled: ${normalizedCaptcha}`);
      return true;
    } catch (err) {
      logger(`⚠️ CAPTCHA handling error: ${err.message}`);
    }

    return false;
  },

  solveCaptchaFromCanvasTextCapture(canvas, logger) {
    const directText = canvas?.dataset?.iciciCanvasText || '';
    if (/^\s*\d{1,2}\s*[+\-*/xX÷]\s*\d{1,2}\s*$/.test(directText)) {
      logger(`🔎 CAPTCHA captured from canvas draw: ${directText}`);
      return this.solveEquationText(directText, logger);
    }

    const captures = (window.__iciciCanvasTextCaptures || [])
      .filter((entry) =>
        entry &&
        Date.now() - Number(entry.ts || 0) < 120000 &&
        Number(entry.width) === Number(canvas?.width) &&
        Number(entry.height) === Number(canvas?.height)
      )
      .reverse();

    const match = captures.find((entry) =>
      /^\s*\d{1,2}\s*[+\-*/xX÷]\s*\d{1,2}\s*$/.test(String(entry.text || ''))
    );

    if (match) {
      logger(`🔎 CAPTCHA captured from canvas history: ${match.text}`);
      return this.solveEquationText(match.text, logger);
    }

    return '';
  },

  solveCaptchaFromPageState(canvas, captchaInput, logger) {
    const roots = [
      canvas,
      captchaInput,
      canvas.closest('form'),
      canvas.closest('[class*="login" i]'),
      canvas.closest('app-login, [ng-version], [_nghost-ng-c2353697897]'),
      document.body,
    ].filter(Boolean);

    const candidates = [];
    const seen = new WeakSet();
    const keyHints = /captcha|capcha|captch|equation|answer|math|code|result|sum|first|second|operand|operator/i;

    const visit = (value, path, depth) => {
      if (value == null || depth > 5) return;

      const type = typeof value;
      if (type === 'string' || type === 'number') {
        const text = String(value).trim();
        if (!text || text.length > 20) return;
        const hinted = keyHints.test(path);
        if (hinted || /^[0-9+\-*/xX÷\s=]+$/.test(text)) {
          candidates.push({ path, text });
        }
        return;
      }

      if (type !== 'object' && type !== 'function') return;
      if (seen.has(value)) return;
      seen.add(value);

      if (value instanceof Node || value === window || value === document) {
        const ngContext = value.__ngContext__;
        if (ngContext) visit(ngContext, `${path}.__ngContext__`, depth + 1);
        return;
      }

      if (Array.isArray(value)) {
        value.slice(0, 80).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
        return;
      }

      let keys = [];
      try {
        keys = Object.keys(value).slice(0, 80);
      } catch (_) {
        return;
      }

      for (const key of keys) {
        const nextPath = path ? `${path}.${key}` : key;
        if (
          /password|username|token|storage|router|http|zone|injector|renderer|native|parent|children|style|class/i.test(nextPath)
        ) {
          continue;
        }
        try {
          visit(value[key], nextPath, depth + 1);
        } catch (_) {}
      }
    };

    for (const root of roots) {
      visit(root, 'root', 0);
    }

    const answerCandidate = candidates.find((candidate) =>
      /captcha|answer|result|code/i.test(candidate.path) && /^\d{1,2}$/.test(candidate.text)
    );
    if (answerCandidate) {
      logger(`🔎 CAPTCHA answer found in page state: ${answerCandidate.text}`);
      return answerCandidate.text;
    }

    const equationCandidate = candidates.find((candidate) =>
      /captcha|equation|math|sum|operand|operator/i.test(candidate.path) &&
      /^\s*\d{1,2}\s*[+\-*/xX÷]\s*\d{1,2}\s*$/.test(candidate.text)
    );
    if (equationCandidate) {
      logger(`🔎 CAPTCHA equation found in page state: ${equationCandidate.text}`);
      return this.solveEquationText(equationCandidate.text, logger);
    }

    const top = candidates
      .filter((candidate) => /captcha|equation|answer|result|code/i.test(candidate.path))
      .slice(0, 5)
      .map((candidate) => `${candidate.path}=${candidate.text}`)
      .join(' | ');
    if (top) logger(`🔎 CAPTCHA state candidates: ${top}`);

    return '';
  },

  solveEquationText(equation, logger) {
    const normalized = equation
      .replace(/[xX]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[^0-9+\-*/]/g, '');
    const match = normalized.match(/^(\d{1,3})([+\-*/])(\d{1,3})$/);
    if (!match) {
      logger(`⚠️ Could not parse CAPTCHA equation: ${equation}`);
      return '';
    }

    const left = Number(match[1]);
    const right = Number(match[3]);
    let result;
    switch (match[2]) {
      case '+':
        result = left + right;
        break;
      case '-':
        result = left - right;
        break;
      case '*':
        result = left * right;
        break;
      case '/':
        result = right ? Math.floor(left / right) : NaN;
        break;
      default:
        result = NaN;
    }

    if (!Number.isFinite(result)) return '';
    return String(Math.abs(result));
  },

  normalizeCaptchaAnswer(answer, input) {
    const digits = String(answer || '').replace(/\D+/g, '');
    if (!digits) return '';

    const maxLength = Number(input?.getAttribute('maxlength')) || 0;
    const pattern = input?.getAttribute('pattern') || '';
    const requiresTwoDigits = maxLength === 2 || pattern.includes('\\d{2}');
    const clipped = maxLength > 0 ? digits.slice(0, maxLength) : digits;

    if (requiresTwoDigits && clipped.length === 1) {
      return clipped.padStart(2, '0');
    }

    return clipped;
  },

  async submitLogin(logger) {
    logger('🔍 Looking for login button...');

    const selectors = [
      'button[type="submit"]',
      '.cstmbtn',
      'button[class*="submit"]',
      'button[class*="login"]'
    ];

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      for (const btn of buttons) {
        if (btn.offsetParent !== null && btn.textContent.includes('LOGIN')) {
          logger(`✅ Found login button`);
          const utils = window.flowUtils || {};
          (utils.clickElement || clickElement)(btn);
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    // Fallback: find any visible button
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.offsetParent !== null && btn.textContent.toUpperCase().includes('LOGIN')) {
        logger(`✅ Found login button (fallback)`);
        const utils = window.flowUtils || {};
        (utils.clickElement || clickElement)(btn);
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Login button not found');
    return false;
  },

  waitForDashboard(logger) {
    logger('⏳ Waiting for dashboard to load...');
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 30;

      const check = () => {
        if (window.location.href.includes('/#/dashboard')) {
          logger('✅ Dashboard loaded');
          return resolve(true);
        }

        const visibleText = (document.body?.innerText || '').toLowerCase();
        if (
          visibleText.includes('invalid captcha') ||
          visibleText.includes('captcha') && visibleText.includes('invalid') ||
          visibleText.includes('incorrect captcha') ||
          visibleText.includes('please enter valid captcha')
        ) {
          logger('⚠️ Login captcha rejected by page');
          return resolve(false);
        }

        attempts++;
        if (attempts > maxAttempts) {
          logger('⚠️ Dashboard load timeout');
          return resolve(false);
        }

        setTimeout(check, 500);
      };

      check();
    });
  }
};

// Helper function (if not in flowUtils)
function fillInput(el, value) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  el.value = '';
  
  for (let char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  return true;
}

function clickElement(el) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') {
    el.focus({ preventScroll: true });
  }
  el.click();
  return true;
}

// Make ICICILogin available globally
window.ICICILogin = ICICILogin;
