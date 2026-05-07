/**
 * Oriental Insurance Extension - Login Flow
 * CAPTCHA: User solves manually; extension waits for CAPTCHA to disappear, then auto-continues
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

      await wait(1500);

      const loginBtn = findElementByText('button', 'Login') || findElementByText('a', 'Login') || qs(ORIENTAL_SELECTORS.loginButton);
      if (loginBtn) {
        clickElement(loginBtn);
        await wait(2000);
      }

      const modal = qs(ORIENTAL_SELECTORS.loginModal);
      if (!modal) {
        return { success: false, error: 'Login modal not found', captchaRequired: false };
      }

      const userInput = modal.querySelector(ORIENTAL_SELECTORS.usernameInput.split(',')[0]) || modal.querySelector('input[name="username"]') || modal.querySelector('input[type="text"]');
      const passInput = modal.querySelector(ORIENTAL_SELECTORS.passwordInput.split(',')[0]) || modal.querySelector('input[type="password"]');

      if (userInput) fillInput(userInput, username);
      if (passInput) fillInput(passInput, password);
      await wait(300);

      const submitBtn = modal.querySelector(ORIENTAL_SELECTORS.loginSubmitButton.split(',')[0]) || findElementByText('button', 'Login', modal) || findElementByText('button', 'Continue', modal);

      if (isCaptchaVisible()) {
        logger('CAPTCHA detected. Please solve it manually. Waiting for you to complete...');
        const resolved = await waitForCaptchaResolved(120000, 1500, logger);
        if (!resolved) {
          return { success: false, captchaRequired: true, message: 'CAPTCHA not resolved in time' };
        }
        await wait(1000);
        if (submitBtn) {
          clickElement(submitBtn);
          await wait(3000);
        }
      } else if (submitBtn) {
        clickElement(submitBtn);
        await wait(3000);
      }

      if (isCaptchaVisible()) {
        logger('CAPTCHA appeared after submit. Please solve it. Waiting...');
        const resolved = await waitForCaptchaResolved(120000, 1500, logger);
        if (!resolved) {
          return { success: false, captchaRequired: true, message: 'CAPTCHA not resolved in time' };
        }
        await wait(1500);
        if (submitBtn) {
          clickElement(submitBtn);
          await wait(3000);
        }
      }

      await wait(2000);
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
