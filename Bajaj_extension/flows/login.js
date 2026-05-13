/**
 * Bajaj General Insurance Login Flow
 * Handles login to https://portal.bajajgeneral.com/BagicNxt/plogin.jsp
 */

const BajajLogin = {
  DEFAULT_USERNAME: '100966052441A@general.bajajgeneral.com',

  async run(payload, logger = console.log) {
    const agent = payload?.agentDetails || {};
    const username = agent.username || this.DEFAULT_USERNAME;
    const password = agent.password || '';

    if (!username) {
      logger('❌ Missing username');
      return { success: false, error: 'Missing username' };
    }

    // Block ALL dialogs globally - no alerts anywhere
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};

    logger('🚀 Starting Bajaj login flow...');
    logger('Username:', username);
    logger('Current URL:', window.location.href);

    try {
      // Check if already on vehicle details page - skip login and form flows
      if (window.location.href.includes('portal.bajajgeneral.com/BagicNxt/partner/motorload.do')) {
        logger('✅ Already on vehicle details page - starting vehicle details flow');
        return { success: true, skipped: true, onVehicleDetailsPage: true, startVehicleDetailsFlow: true };
      }

      // Check if already on partner login page - skip login and go to form flow
      if (window.location.href.includes('portal.bajajgeneral.com/BagicNxt/partner/login.do')) {
        logger('✅ Already on partner login page - starting form flow');
        return { success: true, skipped: true, onPartnerPage: true, startFormFlow: true };
      }

      // Check if already logged in
      if (this.isLoggedIn()) {
        logger('✅ Already logged in');
        return { success: true, skipped: true };
      }

      // Fill username field
      const usernameFilled = await this.fillUsername(username, logger);
      if (!usernameFilled) {
        throw new Error('Failed to fill username field');
      }

      // Fill password field if provided
      if (password) {
        const passwordFilled = await this.fillPassword(password, logger);
        if (!passwordFilled) {
          logger('⚠️ Password field not found or failed to fill');
        }
      }

      // Submit login
      const submitted = await this.submitLogin(logger);
      if (!submitted) {
        throw new Error('Failed to submit login form');
      }

      logger('✅ Login submitted successfully');
      return { success: true };

    } catch (err) {
      logger('❌ Login failed:', err.message);
      return { success: false, error: err.message };
    }
  },

  isLoggedIn() {
    // Check if already logged in by looking for elements that indicate logged-in state
    const logoutBtn = document.querySelector('a[href*="logout"], button[onclick*="logout"], .logout, [class*="logout"]');
    const userDisplay = document.querySelector('.user-name, .agent-name, [class*="username"], [class*="profile"]');
    const dashboardIndicators = document.querySelector('.dashboard, .home, [class*="dashboard"], [class*="home"]');
    
    return !!(logoutBtn || (userDisplay && userDisplay.textContent.trim()) || dashboardIndicators);
  },

  async fillUsername(username, logger) {
    logger('🔍 Looking for username field...');
    
    // Try multiple selectors for the username field
    const usernameSelectors = [
      '#j_username',
      'input[name="j_username"]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="Enter Username" i]',
      'input[type="text"]:not([name*="password"])'
    ];

    let usernameField = null;
    for (const selector of usernameSelectors) {
      usernameField = document.querySelector(selector);
      if (usernameField) {
        logger(`✅ Found username field: ${selector}`);
        break;
      }
    }

    if (!usernameField) {
      logger('❌ Username field not found');
      return false;
    }

    // Clear and fill the username field
    try {
      usernameField.focus();
      usernameField.click();
      
      // Clear existing value
      usernameField.value = '';
      
      // Use native setter for better compatibility
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(usernameField, username);
      } else {
        usernameField.value = username;
      }

      // Dispatch events to trigger any listeners
      usernameField.dispatchEvent(new Event('input', { bubbles: true }));
      usernameField.dispatchEvent(new Event('change', { bubbles: true }));
      usernameField.dispatchEvent(new Event('blur', { bubbles: true }));

      logger('✅ Username filled successfully');
      return true;
    } catch (err) {
      logger('❌ Failed to fill username:', err.message);
      return false;
    }
  },

  async fillPassword(password, logger) {
    logger('🔍 Looking for password field...');
    
    const passwordSelectors = [
      '#j_password',
      'input[name="j_password"]',
      'input[type="password"]',
      'input[placeholder*="Password" i]'
    ];

    let passwordField = null;
    for (const selector of passwordSelectors) {
      passwordField = document.querySelector(selector);
      if (passwordField) {
        logger(`✅ Found password field: ${selector}`);
        break;
      }
    }

    if (!passwordField) {
      logger('⚠️ Password field not found');
      return false;
    }

    try {
      passwordField.focus();
      passwordField.click();
      
      passwordField.value = '';
      
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(passwordField, password);
      } else {
        passwordField.value = password;
      }

      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));

      logger('✅ Password filled successfully');
      return true;
    } catch (err) {
      logger('❌ Failed to fill password:', err.message);
      return false;
    }
  },

  async submitLogin(logger) {
    logger('🔍 Looking for login submit button...');
    
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:contains("Login")',
      'button:contains("Sign In")',
      'button:contains("Submit")',
      '.login-btn',
      '.submit-btn',
      '#loginBtn',
      '#submitBtn'
    ];

    let submitButton = null;
    for (const selector of submitSelectors) {
      if (selector.includes(':contains(')) {
        // Handle :contains pseudo-selector
        const text = selector.match(/\("([^"]+)"\)/)?.[1];
        if (text) {
          const buttons = document.querySelectorAll('button, input[type="submit"]');
          for (const btn of buttons) {
            if (btn.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
              submitButton = btn;
              logger(`✅ Found submit button with text: ${text}`);
              break;
            }
          }
        }
      } else {
        submitButton = document.querySelector(selector);
        if (submitButton) {
          logger(`✅ Found submit button: ${selector}`);
          break;
        }
      }
      if (submitButton) break;
    }

    if (!submitButton) {
      logger('❌ Submit button not found');
      return false;
    }

    try {
      submitButton.focus();
      submitButton.click();
      
      // Also try form submit if available
      const form = submitButton.closest('form');
      if (form) {
        form.submit();
      }

      logger('✅ Login form submitted');
      return true;
    } catch (err) {
      logger('❌ Failed to submit login:', err.message);
      return false;
    }
  },

  async waitForLoginComplete(timeoutMs = 15000) {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkLogin = () => {
        if (this.isLoggedIn()) {
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          resolve(false);
          return;
        }
        
        setTimeout(checkLogin, 500);
      };
      
      checkLogin();
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BajajLogin;
} else {
  window.BajajLogin = BajajLogin;
}
