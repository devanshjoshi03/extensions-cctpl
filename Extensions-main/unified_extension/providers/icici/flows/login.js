/**
 * ICICI Lombard Insurance Login Flow
 * Handles login to https://nysa.icicilombard.com/#/login
 */

const ICICILogin = {
  async run(payload, logger = console.log) {
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

    if (window.flowUtils?.waitForSpinnerToFinish) {
      await window.flowUtils.waitForSpinnerToFinish(120000, () =>
        logger('⏳ Loading spinner visible — waiting before login...')
      );
    }

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
      const usernameFilled = await this.fillUsername(username, logger);
      if (!usernameFilled) {
        throw new Error('Failed to fill username');
      }

      // Fill password
      const passwordFilled = await this.fillPassword(password, logger);
      if (!passwordFilled) {
        throw new Error('Failed to fill password');
      }

      // Solve CAPTCHA if present
      const captchaFilled = await this.solveCaptcha(logger);
      if (!captchaFilled) {
        logger('⚠️ CAPTCHA solving skipped or not found');
      }

      // Submit login
      const submitted = await this.submitLogin(logger);
      if (!submitted) {
        throw new Error('Failed to submit login form');
      }

      logger('✅ Login submitted successfully');

      // Wait for dashboard to load
      await this.waitForDashboard(logger);

      return { success: true };

    } catch (err) {
      logger('❌ Login failed:', err.message);
      return { success: false, error: err.message };
    }
  },

  isLoggedIn() {
    // Check if already logged in by looking for dashboard indicators
    const dashboardElements = document.querySelector('[class*="dashboard"], [class*="sidebar"], .profile-menu');
    const logoutBtn = document.querySelector('button[*="logout"], a[*="logout"]');
    
    return !!(dashboardElements || logoutBtn);
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
      'input[formcontrolname="username"]',
      'input[name="username"]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="User" i]',
      'input[type="text"]:first-of-type'
    ];

    for (const selector of selectors) {
      if (window.flowUtils?.isSpinnerVisible?.()) {
        await window.flowUtils.waitForSpinnerToFinish();
      }
      const input = document.querySelector(selector);
      if (input && input.offsetParent !== null) {
        logger(`✅ Found username field: ${selector}`);
        const utils = window.flowUtils || {};
        await (utils.fillInput || fillInput)(input, username);
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
      'input[formcontrolname="password"]',
      'input[name="password"]',
      'input[type="password"]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input && input.offsetParent !== null) {
        logger(`✅ Found password field: ${selector}`);
        const utils = window.flowUtils || {};
        await (utils.fillInput || fillInput)(input, password);
        logger(`📝 Password filled`);
        return true;
      }
    }

    logger('❌ Password field not found');
    return false;
  },

  async solveCaptcha(logger) {
    logger('🔍 Looking for CAPTCHA...');

    const captchaInput = document.querySelector('input[formcontrolname="captcha"], input[name="captcha"], input[placeholder*="Captcha" i]');
    
    if (!captchaInput) {
      logger('⚠️ CAPTCHA input not found');
      return false;
    }

    logger('⏳ CAPTCHA found, attempting to solve...');

    try {
      // Try to get CAPTCHA image
      const canvas = document.querySelector('canvas');
      if (canvas) {
        logger('📸 Canvas found, converting to image...');
        const imageData = canvas.toDataURL('image/png');
        
        // Get API key from storage
        const config = await new Promise(resolve => {
          chrome.storage.local.get('openaiConfig', r => resolve(r.openaiConfig));
        });

        if (config && config.apiKey) {
          logger('🔑 Using OpenAI to solve CAPTCHA...');
          const captchaText = await this.solveWithOpenAI(config.apiKey, config.model || 'gpt-4o-mini', imageData, logger);
          
          if (captchaText) {
            logger(`✅ CAPTCHA solved: ${captchaText}`);
            const utils = window.flowUtils || {};
            await (utils.fillInput || fillInput)(captchaInput, captchaText);
            return true;
          }
        } else {
          logger('⚠️ OpenAI API key not configured');
        }
      }
    } catch (err) {
      logger(`⚠️ CAPTCHA solving error: ${err.message}`);
    }

    logger('⚠️ Manual CAPTCHA solving required');
    return false;
  },

  async solveWithOpenAI(apiKey, model, imageData, logger) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a CAPTCHA solver. Read the mathematical equation or text shown in the image and return ONLY the answer or text. No explanation.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Solve this CAPTCHA and return only the answer'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageData }
                }
              ]
            }
          ],
          temperature: 0,
          max_tokens: 10
        })
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI error: ${resp.status}`);
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content?.trim() || '';
      
      return answer;
    } catch (err) {
      logger(`OpenAI error: ${err.message}`);
      return null;
    }
  },

  async submitLogin(logger) {
    logger('🔍 Looking for login button...');

    const selectors = [
      'button[type="submit"]',
      'button:contains("LOGIN")',
      'button:contains("login")',
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
          await (utils.clickElement || clickElement)(btn);
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
        await (utils.clickElement || clickElement)(btn);
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
        if (window.flowUtils?.isSpinnerVisible?.()) {
          setTimeout(check, 150);
          return;
        }
        if (window.location.href.includes('/#/dashboard')) {
          logger('✅ Dashboard loaded');
          return resolve(true);
        }

        attempts++;
        if (attempts > maxAttempts) {
          logger('⚠️ Dashboard load timeout, but continuing...');
          return resolve(false);
        }

        setTimeout(check, 500);
      };

      check();
    });
  }
};

// Fallback helpers (delegate to flowUtils when loaded)
async function fillInput(el, value) {
  if (window.flowUtils?.fillInput) return window.flowUtils.fillInput(el, value);
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

async function clickElement(el) {
  if (window.flowUtils?.clickElement) return window.flowUtils.clickElement(el);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  el.click();
  return true;
}

// Make ICICILogin available globally
window.ICICILogin = ICICILogin;
