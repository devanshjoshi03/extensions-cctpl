/**
 * Universal Sompo Extension - Login Flow
 * Handles: user ID, password, text-based CAPTCHA, LOGIN button, OTP if needed.
 * 
 * FIXES:
 * - Wait for agencyforce.universalsompo.com to fully load (spinner gone + sidebar rendered)
 *   before attempting Motor sidebar navigation
 * - Added robust page-ready polling after login redirect
 */
const SompoLogin = {
  async run(credentials, logger = console.log) {
    const agentDetails = credentials?.agentDetails || {};
    const username = agentDetails?.username || credentials?.username || '';
    const password = agentDetails?.password || credentials?.password || '';

    logger('🚀 Starting Sompo login flow...');
    logger('User ID: ' + username);

    try {
      const currentUrl = window.location.href;

      // ─── SKIP LOGIN IF ALREADY ON MOTOR DASHBOARD ─────────────────────────
      if (currentUrl.includes('/MotorDashboard') || currentUrl.includes('/USGI/Motor') ||
          currentUrl === 'https://agencyforce.universalsompo.com/' ||
          currentUrl === 'https://agencyforce.universalsompo.com') {
        logger('✅ Already on Motor Dashboard - waiting for full page load...');
        await this.waitForPageFullyLoaded(logger);
        const navResult = await this.navigateToMotorSidebar(logger);
        return navResult;
      }

      // ─── NAVIGATE TO LOGIN PAGE ───────────────────────────────────────────
      const loginUrl = 'https://agencyforce.universalsompo.com/pages/login-page';
      if (!currentUrl.includes('/login-page')) {
        logger('🌐 Navigating to login page...');
        window.location.href = loginUrl;
        await wait(3000);
        let waited = 0;
        while (waited < 10000) {
          const userInput = document.querySelector('input[name="UserName"]') || document.querySelector('input#mui-2');
          if (userInput) {
            logger('✅ Login page loaded');
            await wait(1000);
            break;
          }
          await wait(500);
          waited += 500;
        }
      }

      if (this._isLoggedIn()) {
        logger('✅ Already logged in');
        return { success: true };
      }

      // ─── STEP 1: FILL USER ID ─────────────────────────────────────────────
      const userIdInput =
        document.querySelector('input[name="UserName"]') ||
        document.querySelector('input[name="username"]') ||
        document.querySelector('input[id="username"]') ||
        document.querySelector('input[placeholder*="User ID" i]') ||
        document.querySelector('input[placeholder*="user id" i]') ||
        document.querySelector('input[placeholder*="User" i]') ||
        document.querySelector('input[placeholder*="user" i]') ||
        document.querySelector('input#mui-2') ||
        document.querySelector('input[type="text"]');

      if (!userIdInput) throw new Error('User ID field not found');
      fillInput(userIdInput, username);
      logger('✅ User ID filled: ' + username);
      await wait(600);

      // ─── STEP 2: FILL PASSWORD ────────────────────────────────────────────
      const passwordInput =
        document.querySelector('input[name="Password"]') ||
        document.querySelector('input[name="password"]') ||
        document.querySelector('input[id="password"]') ||
        document.querySelector('input[placeholder*="Password" i]') ||
        document.querySelector('input#mui-3') ||
        document.querySelector('input[type="password"]');

      if (!passwordInput) throw new Error('Password field not found');
      fillInput(passwordInput, password);
      logger('✅ Password filled');
      await wait(800);

      // ─── STEP 3: EXTRACT AND FILL CAPTCHA ─────────────────────────────────
      await wait(500);

      const captchaDisplay = document.querySelector('.css-en49wm') ||
                             document.querySelector('div[class*="css-"]:not(:has(input)):not(:has(button))');
      let captchaText = '';

      if (captchaDisplay) {
        captchaText = captchaDisplay.textContent?.trim() || '';
        if (captchaText && /^[a-zA-Z0-9]{6}$/.test(captchaText)) {
          logger('🔍 CAPTCHA found: ' + captchaText);
        } else {
          logger('⚠️ Invalid CAPTCHA format: ' + captchaText);
          captchaText = '';
        }
      }

      const captchaInput = document.querySelector('input#mui-4') ||
                           document.querySelector('input[placeholder*="Enter Captcha" i]') ||
                           document.querySelector('input[name*="captcha" i]');

      if (captchaInput && captchaText) {
        fillInput(captchaInput, captchaText);
        logger('✅ CAPTCHA filled: ' + captchaText);
        await wait(500);
      } else if (!captchaText) {
        logger('⚠️ Could not extract CAPTCHA - may need manual entry');
      }

      // ─── STEP 4: CLICK LOGIN BUTTON ───────────────────────────────────────
      const loginBtn = [...document.querySelectorAll('button')].find(btn =>
        btn.textContent?.trim() === 'LOGIN'
      ) || document.querySelector('button[type="submit"]') ||
         document.querySelector('button.MuiButton-containedPrimary');

      if (loginBtn) {
        logger('🖱️ Clicking LOGIN button...');
        loginBtn.click();
        loginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wait(2000);
      } else {
        logger('⚠️ LOGIN button not found');
      }

      // ─── WAIT FOR LOGIN COMPLETE ──────────────────────────────────────────
      const loginResult = await this.waitForLoginComplete(logger);
      if (!loginResult.success) {
        return loginResult;
      }

      logger('✅ Login successful — waiting for page to fully load...');
      // *** FIX: Wait for the post-login page to be fully rendered ***
      await this.waitForPageFullyLoaded(logger);

      // ─── CLICK MOTOR MENU ────────────────────────────────────────────────
      logger('🖱️ Clicking Motor menu...');
      const motorMenu = [...document.querySelectorAll('li, div')].find(el => {
        const text = el.textContent?.trim() || '';
        return text === 'Motor' && el.querySelector('.material-icons-round, .MuiIcon-root');
      });

      if (motorMenu) {
        motorMenu.click();
        motorMenu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        logger('✅ Motor menu clicked');
        await wait(500);
      } else {
        logger('⚠️ Motor menu not found');
      }

      // ─── CLICK TWO WHEELER SUBMENU ───────────────────────────────────────
      logger('🖱️ Clicking Two Wheeler submenu...');
      const twoWheelerLink = [...document.querySelectorAll('a')].find(a => {
        const href = a.getAttribute('href') || '';
        return href.includes('TwoWheeler') || a.textContent?.trim() === 'Two Wheeler';
      });

      if (twoWheelerLink) {
        twoWheelerLink.click();
        twoWheelerLink.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        logger('✅ Two Wheeler clicked — navigating to quote page...');
        await wait(1000);
      } else {
        logger('⚠️ Two Wheeler link not found');
      }

      return { success: true, message: 'Navigated to Two Wheeler page' };

    } catch (e) {
      logger('❌ Login failed: ' + e.message);
      return { success: false, error: e.message };
    }
  },

  // ─── WAIT FOR PAGE FULLY LOADED ───────────────────────────────────────────
  // Waits until:
  //  1. Any loading spinner / MUI backdrop is gone
  //  2. At least one sidebar nav element is visible
  //  3. The URL is stable (not mid-redirect)
  async waitForPageFullyLoaded(logger = console.log, timeoutMs = 30000) {
    logger('⏳ Waiting for page to fully load (spinner gone + sidebar ready)...');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      // 1. Check for loading spinners / MUI backdrops
      const backdrop = document.querySelector(
        '.MuiBackdrop-root[style*="opacity: 1"], ' +
        '.MuiCircularProgress-root, ' +
        '.p-progress-spinner, ' +
        '[class*="loading"]:not([style*="display: none"]), ' +
        '[class*="spinner"]:not([style*="display: none"])'
      );
      if (backdrop && backdrop.offsetParent !== null) {
        await wait(300);
        continue;
      }

      // 2. Check for sidebar / nav being visible — look for a known nav element
      const sidebarReady =
        document.querySelector('ul[class*="MuiList"], nav, .sidebar, [class*="sidebar"], [class*="nav-menu"]') ||
        [...document.querySelectorAll('li, span, div')].find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return (t === 'motor' || t === 'home' || t === 'dashboard') && el.offsetParent !== null;
        });

      if (sidebarReady) {
        // Extra short pause to let React finish rendering sub-items
        await wait(800);
        logger('✅ Page fully loaded — sidebar is visible');
        return true;
      }

      await wait(400);
    }

    logger('⚠️ Page load timeout — proceeding anyway');
    return false;
  },

  async waitForLoginComplete(logger) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger('⏱️ Login wait timeout (5 minutes)');
        AutomationPauseController.resume();
        resolve({ success: false, error: 'Login timeout' });
      }, 5 * 60 * 1000);

      const checkInterval = setInterval(() => {
        const stillOnLogin =
          document.querySelector('input[name="username"]') ||
          document.querySelector('input[type="password"]');

        if (!stillOnLogin || this._isLoggedIn()) {
          logger('✅ Login detected (login form no longer visible)');
          clearInterval(checkInterval);
          clearTimeout(timeout);
          AutomationPauseController.resume();
          resolve({ success: true });
          return;
        }

        if (Math.random() < 0.1) {
          logger('⏳ Waiting for manual CAPTCHA + Login Now click...');
        }
      }, 500);
    });
  },

  async clickAVO2Switch(logger) {
    for (let i = 0; i < 10; i++) {
      const avoBanner = [...document.querySelectorAll('div, span, section, nav, header')].find(el => {
        const text = el.textContent || '';
        return (text.includes('Welcome to AVO 2.0') || text.includes('Experience future of Simplicity')) &&
               el.offsetParent !== null;
      });

      if (avoBanner) {
        logger('🔍 Found AVO 2.0 banner');
        let toggleSwitch = null;

        const clickHereElements = [...avoBanner.querySelectorAll('span, div, p, label')].filter(el =>
          el.textContent?.includes('Click here to switch')
        );

        for (const el of clickHereElements) {
          const parent = el.parentElement;
          if (parent) {
            toggleSwitch = parent.querySelector('button, [role="switch"], input[type="checkbox"], .toggle, .switch') ||
                          parent.nextElementSibling ||
                          el.nextElementSibling;
            if (toggleSwitch) break;
          }
        }

        if (!toggleSwitch) {
          const allInBanner = avoBanner.querySelectorAll('button, span, div, input');
          for (const el of allInBanner) {
            const style = window.getComputedStyle(el);
            const isRound = el.offsetWidth > 30 && el.offsetWidth < 80 &&
                           Math.abs(el.offsetWidth - el.offsetHeight) < 5;
            const isWhite = style.backgroundColor.includes('255') ||
                           style.backgroundColor.includes('white') ||
                           el.className.includes('toggle') ||
                           el.className.includes('switch');
            if (isRound && (isWhite || el.className.includes('switch') || el.className.includes('toggle'))) {
              toggleSwitch = el;
              break;
            }
          }
        }

        if (!toggleSwitch) {
          toggleSwitch = avoBanner.querySelector('input[type="checkbox"]') ||
                         avoBanner.querySelector('[role="switch"]') ||
                         avoBanner.querySelector('button[class*="toggle"]') ||
                         avoBanner.querySelector('button[class*="switch"]');
        }

        if (toggleSwitch) {
          logger('✅ Found toggle switch, clicking...');
          toggleSwitch.scrollIntoView({ block: 'center', inline: 'nearest' });
          await wait(300);
          toggleSwitch.click();
          toggleSwitch.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          toggleSwitch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          toggleSwitch.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

          const parentLabel = toggleSwitch.closest('label');
          if (parentLabel) {
            parentLabel.click();
            parentLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }

          logger('✅ Clicked AVO 2.0 switch');
          await wait(3000);
          return;
        }

        logger('⚠️ Toggle switch not found in banner, trying banner click...');
        avoBanner.click();
        avoBanner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await wait(2000);
        return;
      }

      await wait(500);
    }

    logger('ℹ️ AVO 2.0 banner not found (may already be on AVO 2.0)');
  },

  _isLoggedIn() {
    const dashboardEl =
      document.querySelector('.user-name, .agent-name, [class*="dashboard"], [class*="navbar-user"]') ||
      document.querySelector('a[href*="logout"], button[class*="logout"]');
    if (dashboardEl) return true;
    const loginForm =
      document.querySelector('input[name="username"]') ||
      document.querySelector('input[type="password"]');
    return !loginForm;
  },

  isCaptchaVisible() {
    const captchaInput = document.querySelector(
      'input[placeholder*="Enter Captcha" i]' ||
      'input[placeholder*="Enter the value" i]' ||
      'input[placeholder*="captcha" i]' ||
      'input[placeholder*="verification" i]' ||
      'input[name*="captcha"]' ||
      'input[id*="captcha"]'
    );
    const captchaDisplay = this.getCaptchaDisplay();
    if (captchaInput || captchaDisplay) return true;

    const captchaImg = document.querySelector(
      'img[src*="captcha"], img[alt*="captcha" i], img[src*="GetCaptchaImage"], ' +
      '.captcha-img, [class*="captcha"] img, img[src*="api/captcha"]'
    );
    if (captchaImg) return true;
    return false;
  },

  getCaptchaDisplay() {
    const captchaContainer = document.querySelector('[class*="captcha"], [id*="captcha"]');
    if (captchaContainer) {
      const textElements = captchaContainer.querySelectorAll('span, div, p, label');
      for (const el of textElements) {
        const text = el.textContent?.trim() || '';
        if (text.length >= 4 && text.length <= 8 && /^[a-zA-Z0-9]+$/.test(text)) {
          return text;
        }
      }
    }
    return null;
  },

  getCaptchaImage() {
    const explicit =
      document.querySelector('img[src*="captcha"], img[alt*="captcha" i]') ||
      document.querySelector('.captcha-img') ||
      document.querySelector('[class*="captcha"] img') ||
      document.querySelector('img[src*="GetCaptchaImage"]') ||
      document.querySelector('img[src^="data:image"]');
    if (explicit) return explicit;

    const form = document.querySelector('.login-popup-box, .popup-form, [class*="login"], form');
    if (form) {
      for (const img of form.querySelectorAll('img')) {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w > 80 && h > 30 && img.src && !img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('.svg')) {
          return img;
        }
      }
    }
    return null;
  },

  getCaptchaInput() {
    return (
      document.querySelector('input[placeholder*="Enter Captcha" i]') ||
      document.querySelector('input[placeholder*="Enter the value" i]') ||
      document.querySelector('input[placeholder*="captcha" i]') ||
      document.querySelector('input[placeholder*="verification" i]') ||
      document.querySelector('input[name*="captcha"], input[id*="captcha"]') ||
      document.querySelector('input[name="captchavalue"], input[id="captchavalue"]') ||
      null
    );
  },

  async handleCaptcha(logger) {
    logger('⏳ Checking for CAPTCHA...');
    let found = false;
    for (let i = 0; i < 30; i++) {
      if (this.isCaptchaVisible()) { found = true; break; }
      await wait(100);
    }
    if (!found) { logger('ℹ️ No CAPTCHA detected'); return { success: true }; }

    logger('🔐 CAPTCHA detected — waiting for manual entry...');
    await wait(600);

    const captchaInput = this.getCaptchaInput();
    if (!captchaInput) {
      logger('⚠️ CAPTCHA input not found — waiting for form completion...');
      return this.waitForManualCaptcha(logger);
    }

    const captchaImg = this.getCaptchaImage();
    if (captchaImg) {
      try {
        logger('📡 Sending CAPTCHA image to AI solver...');
        const imageData = await this.getImageData(captchaImg);
        const result = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'SOLVE_TEXT_CAPTCHA', imageData }, resolve);
        });

        if (result?.success && result.text) {
          const captchaText = result.text.replace(/[^a-zA-Z0-9]/g, '');
          logger('✅ CAPTCHA auto-solved: ' + captchaText);
          fillInput(captchaInput, captchaText);
          await wait(800);
          return { success: true, autoSolved: true };
        }
        logger('⚠️ Auto-solve failed: ' + (result?.error || 'No solution'));
      } catch (e) {
        logger('⚠️ Auto-solve error: ' + e.message);
      }
    }

    return this.waitForManualCaptcha(logger);
  },

  waitForManualCaptcha(logger) {
    logger('⏳ Waiting for manual CAPTCHA entry (max 90s)... Please enter CAPTCHA and click LOGIN.');
    const start   = Date.now();
    const timeout = 90000;
    return new Promise((resolve) => {
      const check = () => {
        const elapsed = Date.now() - start;
        const captchaInput = this.getCaptchaInput();

        if (captchaInput && (captchaInput.value || '').trim().length >= 4) {
          logger('✅ CAPTCHA entered manually: ' + captchaInput.value.trim());
          return resolve({ success: true, autoSolved: false });
        }
        if (!this.isCaptchaVisible()) {
          logger('✅ CAPTCHA disappeared (form submitted)');
          return resolve({ success: true, autoSolved: false });
        }
        if (elapsed % 15000 < 250) {
          logger(`⏱️ Waiting... (${Math.ceil((timeout - elapsed) / 1000)}s remaining)`);
        }
        if (elapsed >= timeout) {
          logger('❌ CAPTCHA timeout');
          return resolve({ success: false, error: 'CAPTCHA timeout' });
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  async getImageData(imgEl) {
    return new Promise((resolve, reject) => {
      if (imgEl.src && imgEl.src.startsWith('data:image')) return resolve(imgEl.src);
      const canvas = document.createElement('canvas');
      canvas.width  = imgEl.naturalWidth  || imgEl.width  || 200;
      canvas.height = imgEl.naturalHeight || imgEl.height || 80;
      const ctx = canvas.getContext('2d');
      const draw = () => {
        try { ctx.drawImage(imgEl, 0, 0); resolve(canvas.toDataURL('image/png')); }
        catch (err) { reject(new Error('Canvas draw failed: ' + err.message)); }
      };
      if (imgEl.complete && imgEl.naturalHeight > 0) draw();
      else { imgEl.onload = draw; imgEl.onerror = () => reject(new Error('Image load failed')); }
    });
  },

  // ── MOTOR → TWO WHEELER SIDEBAR NAVIGATION ───────────────────────────────────

  findExactText(target) {
    const t = target.trim().toLowerCase();
    for (const el of document.querySelectorAll('span, a, p, button, li, div')) {
      if (el.offsetParent === null) continue;
      if (el.textContent.trim().toLowerCase() === t) return el;
    }
    return null;
  },

  async navigateToMotorSidebar(logger = console.log) {
    logger('🔄 Starting Motor → Two Wheeler navigation...');
    logger('📍 URL: ' + window.location.href);

    if (window.location.href.includes('/Motor/TwoWheeler')) {
      logger('✅ Already on Two Wheeler page — skipping navigation');
      return { success: true, skipped: true };
    }

    try {
      // *** FIX: Always wait for page to be fully loaded before navigating sidebar ***
      await this.waitForPageFullyLoaded(logger);

      logger('⏳ Polling for Motor sidebar item...');
      let motorEl = null;
      const motorDeadline = Date.now() + 15000;

      while (!motorEl && Date.now() < motorDeadline) {
        const allMotor = [...document.querySelectorAll('span, a, div, li')].filter(el => {
          const text = el.textContent?.trim() || '';
          return text.toLowerCase() === 'motor' ||
                 (text.toLowerCase().includes('motor') && !text.toLowerCase().includes('renewal'));
        });

        for (const el of allMotor) {
          if (el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.left < window.innerWidth * 0.3) {
              motorEl = el;
              break;
            }
          }
        }

        if (!motorEl) await wait(20);
      }

      if (!motorEl) {
        logger('❌ Motor sidebar item not found');
        return { success: false, error: 'Motor not found' };
      }

      logger('✅ Found Motor');

      const motorListItem = motorEl.closest('li, div[class*="menu-item"], div[class*="nav-item"]') || motorEl;
      let motorTarget = null;
      const arrowSelectors = ['svg', '[class*="arrow"]', '[class*="chevron"]', '[class*="expand"]', 'button', 'i', 'span[class*="icon"]'];

      for (const selector of arrowSelectors) {
        const arrow = motorListItem.querySelector(selector);
        if (arrow && arrow.offsetParent !== null) {
          motorTarget = arrow;
          logger('🔍 Found Motor expand arrow: ' + selector);
          break;
        }
      }

      if (!motorTarget) {
        motorTarget = motorListItem;
        logger('🔍 Clicking Motor list item');
      }

      for (let i = 0; i < 3; i++) {
        motorTarget.click();
        motorTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        motorTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await wait(30);

        const submenu = motorListItem.querySelector('ul, [class*="submenu"], [class*="dropdown"]');
        if (submenu && submenu.offsetParent !== null) {
          logger('✅ Motor dropdown opened!');
          break;
        }
      }

      logger('✅ Clicked Motor — dropdown opening...');
      await wait(50);

      logger('⏳ Looking for Two Wheeler in submenu...');
      let twEl = null;
      const twDeadline = Date.now() + 10000;

      while (!twEl && Date.now() < twDeadline) {
        twEl = this.findExactText('Two Wheeler');

        if (!twEl && motorEl) {
          const motorContainer = motorEl.closest('li, div, ul')?.parentElement;
          if (motorContainer) {
            const submenuItems = motorContainer.querySelectorAll('a, span, div, li');
            for (const item of submenuItems) {
              const txt = item.textContent?.trim().toLowerCase() || '';
              if (txt === 'two wheeler' || txt === 'twowheeler' || txt === '2 wheeler' ||
                  (txt.includes('two') && txt.includes('wheel'))) {
                if (item.offsetParent !== null) {
                  twEl = item;
                  logger('✅ Found Two Wheeler in Motor submenu: "' + txt + '"');
                  break;
                }
              }
            }
          }
        }

        if (!twEl) {
          for (const el of document.querySelectorAll('span, a, li, div, button, p')) {
            if (el.offsetParent === null) continue;
            const txt = el.textContent.trim().toLowerCase();
            if (txt === 'two wheeler' || txt === 'twowheeler' || txt === '2 wheeler' ||
                (txt.includes('two') && txt.includes('wheel'))) {
              twEl = el;
              logger('✅ Found Two Wheeler (global search): "' + txt + '"');
              break;
            }
          }
        }

        if (!twEl) await wait(30);
      }

      if (!twEl) {
        logger('⚠️ Two Wheeler not visible — trying Motor expand again...');
        const motorItem = motorEl.closest('li, div[class*="menu"]');
        if (motorItem) {
          const arrow = motorItem.querySelector('svg, [class*="arrow"], [class*="chevron"], [class*="expand"]');
          if (arrow) {
            arrow.click();
            arrow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            logger('✅ Clicked Motor arrow');
          } else {
            motorTarget.click();
          }
        } else {
          motorTarget.click();
        }

        twEl = this.findExactText('Two Wheeler');
        if (!twEl) {
          for (const el of document.querySelectorAll('span, a, li, div, button, p')) {
            if (el.offsetParent === null) continue;
            const txt = el.textContent.trim().toLowerCase();
            if (txt === 'two wheeler' || txt === 'twowheeler' || txt === '2 wheeler' ||
                (txt.includes('two') && txt.includes('wheel'))) {
              twEl = el;
              logger('✅ Found Two Wheeler on retry: "' + txt + '"');
              break;
            }
          }
        }
      }

      if (!twEl) {
        logger('❌ Two Wheeler option not found');
        return { success: false, error: 'Two Wheeler not found' };
      }

      logger('✅ Found Two Wheeler, clicking...');
      const twTarget = twEl.closest('a, button, li, [role="menuitem"]') || twEl;
      twTarget.click();
      twTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      twTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      logger('✅ Clicked Two Wheeler — navigation complete!');
      return { success: true };

    } catch (e) {
      logger('❌ navigateToMotorSidebar error: ' + e.message);
      return { success: false, error: e.message };
    }
  },
};