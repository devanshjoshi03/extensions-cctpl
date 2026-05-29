/**
 * Oriental Insurance Extension - Login Flow
 * CAPTCHA: Auto-solved by hooking canvas fillText to read captcha characters
 */
const OrientalLogin = {
  async run(credentials, logger = console.log) {
    const username = credentials?.username || '';
    const password = credentials?.password || '';
    if (!username || !password) {
      logger('Username and password are required');
      return { success: false, error: 'Credentials required' };
    }

    try {
      if (!window.location.href.includes('orientalinsurance.org.in')) {
        window.location.href = ORIENTAL_CONFIG.URLS.HOME;
        return { success: true, redirected: true };
      }

      await wait(375);

      const loginBtn = findElementByText('button', 'Login') || findElementByText('a', 'Login') || qs(ORIENTAL_SELECTORS.loginButton);
      if (loginBtn) {
        clickElement(loginBtn);
        await wait(500);
      }

      const modal = qs(ORIENTAL_SELECTORS.loginModal);
      if (!modal) {
        return { success: false, error: 'Login modal not found' };
      }

      const userInput = modal.querySelector(ORIENTAL_SELECTORS.usernameInput.split(',')[0]) || modal.querySelector('input[name="username"]') || modal.querySelector('input[type="text"]');
      const passInput = modal.querySelector(ORIENTAL_SELECTORS.passwordInput.split(',')[0]) || modal.querySelector('input[type="password"]');

      if (userInput) fillInput(userInput, username);
      if (passInput) fillInput(passInput, password);
      await wait(100);

      // Auto-solve captcha on the login form
      logger('Solving login captcha...');
      const captchaInput = modal.querySelector('#captcha');
      // Only refresh if captcha wasn't already auto-filled by the MAIN world hook
      if (!captchaInput || !captchaInput.value || captchaInput.value.length < 4) {
        document.documentElement.setAttribute('data-captcha-reset', '1');
        const refreshCaptchaBtn = modal.querySelector('button[aria-label="Refresh CAPTCHA image"]');
        if (refreshCaptchaBtn) {
          clickElement(refreshCaptchaBtn);
        }
        if (captchaInput) {
          for (let i = 0; i < 30; i++) {
            await wait(100);
            if (captchaInput.value && captchaInput.value.length >= 4) break;
          }
        }
      }
      if (captchaInput) {
        logger('CAPTCHA value: ' + captchaInput.value);
      }

      const submitBtn = modal.querySelector(ORIENTAL_SELECTORS.loginSubmitButton.split(',')[0]) || findElementByText('button', 'Login', modal) || findElementByText('button', 'Continue', modal);
      if (submitBtn) {
        clickElement(submitBtn);
        await wait(750);
      }

      await wait(500);
      const stillModal = document.querySelector(ORIENTAL_SELECTORS.loginModal);
      if (!stillModal || !stillModal.offsetParent) {
        return { success: true };
      }

      return { success: false, error: 'Login may have failed - modal still visible' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
};
