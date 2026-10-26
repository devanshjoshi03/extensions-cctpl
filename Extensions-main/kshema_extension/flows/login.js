(function () {
  'use strict';

  const LOGIN_EMAIL_SELECTOR = '#login_email';
  const LOGIN_PASSWORD_SELECTOR = '#login_password';
  const SIGN_IN_SELECTOR = 'button[data-iid="sign-in"], .signin-btn.login-btn';
  const ACTION_DELAY = 500;

  let stopRequested = false;

  function getController() {
    return window.KshemaAutomationController || null;
  }

  async function checkpoint(stepLabel) {
    const controller = getController();
    if (controller?.checkpoint) {
      await controller.checkpoint(stepLabel);
    }
    if (stopRequested) {
      throw new Error('Login flow stopped');
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function pace() {
    await checkpoint();
    await sleep(ACTION_DELAY);
    await checkpoint();
  }

  async function waitForElement(selector, log, timeout = 15000) {
    const startedAt = Date.now();
    await checkpoint(`Waiting for ${selector}`);
    log(`Waiting for ${selector}`);

    while (Date.now() - startedAt < timeout) {
      await checkpoint(`Waiting for ${selector}`);

      const element = document.querySelector(selector);
      if (element) {
        log(`Found ${selector}`);
        return element;
      }

      await sleep(250);
    }

    throw new Error(`Timed out waiting for ${selector}`);
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function readCredentials(payload) {
    const agentDetails = payload?.agentDetails || payload?.agentdetails;
    const username = agentDetails?.username;
    const password = agentDetails?.password;

    if (!username) {
      throw new Error('Missing agentDetails.username in pasted JSON');
    }

    if (!password) {
      throw new Error('Missing agentDetails.password in pasted JSON');
    }

    return { username, password };
  }

  window.KshemaLogin = {
    stop() {
      stopRequested = true;
    },

    reset() {
      stopRequested = false;
    },

    async run(payload, log) {
      stopRequested = false;
      log('Login flow started');

      const { username, password } = readCredentials(payload);
      log('Credentials read from payload');

      const emailInput = await waitForElement(LOGIN_EMAIL_SELECTOR, log);
      await checkpoint('Entering username');
      setNativeValue(emailInput, username);
      log('Username entered');
      await pace();

      const passwordInput = await waitForElement(LOGIN_PASSWORD_SELECTOR, log);
      await checkpoint('Entering password');
      setNativeValue(passwordInput, password);
      log('Password entered');
      await pace();

      const signInButton = await waitForElement(SIGN_IN_SELECTOR, log);
      await checkpoint('Clicking sign in');
      signInButton.click();
      log('Sign in button clicked');
      await pace();

      return { success: true, message: 'Kshema login submitted' };
    }
  };
})();
