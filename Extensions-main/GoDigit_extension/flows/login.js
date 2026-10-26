const GoDigitLogin = {
  async run(payload, phase, logger = console.log) {
    const agent = payload?.agentDetails || payload?.agentdetails || {};
    const phone = String(agent.username || '').trim();
    const usercode = String(agent.usercode || '').trim();
    if (!/^\d{10}$/.test(phone)) throw new Error('agentDetails.username must be a 10-digit mobile number');
    if (!usercode) throw new Error('agentDetails.usercode is required to select the Go Digit user');
    if (phase === 'otp') {
      return this.retrieveAndSubmitOtp(payload, logger);
    }
    if (phase === 'user') {
      return this.selectUserAndRequestOtp(usercode, payload, logger);
    }
    await this.enterPhoneAndContinue(phone, payload, logger);
    return { success: true, submittedPhone: true };
  },
  async enterPhoneAndContinue(phone, payload, logger) {
    const phoneInput = await this.waitForElement('#phone');
    await AutomationPauseController.checkpoint('Enter registered mobile number');
    this.fillInput(phoneInput, phone);
    const sendButton = await this.waitForElement('#send-otp-wide');
    await AutomationPauseController.checkpoint('Submit mobile number');
    await window.GoDigitSetRun({ active: true, phase: 'user', payload });
    logger('Submitting registered mobile number');
    sendButton.click();
  },
  async selectUserAndRequestOtp(usercode, payload, logger) {
    const usernameInput = await this.waitForElement('#username');
    await AutomationPauseController.checkpoint('Select Go Digit user');
    const option = [...document.querySelectorAll('#usernames option')].find((item) => item.value === usercode);
    if (!option) throw new Error(`User code ${usercode} is not available in the Go Digit user list`);
    this.fillInput(usernameInput, usercode);
    const sendButton = await this.waitForElement('#send-otp');
    await AutomationPauseController.checkpoint('Request OTP');
    await window.GoDigitSetRun({ active: true, phase: 'otp', payload });
    logger(`Selected user ${usercode}; requesting OTP`);
    sendButton.click();
    return this.retrieveAndSubmitOtp(payload, logger);
  },
  async retrieveAndSubmitOtp(payload, logger) {
    const otpInput = await this.waitForElement('#code, input[name="otp"]:not([type="hidden"])', 30000);
    const runState = await this.getRunState();
    const invalidMessage = this.getInvalidOtpMessage();
    const rejectedOtpIds = [...new Set(runState.rejectedOtpIds || [])];
    if (invalidMessage && runState.lastOtpId) {
      rejectedOtpIds.push(runState.lastOtpId);
      logger(`Go Digit rejected the OTP: ${invalidMessage}`);
      if ((runState.otpSubmitAttempts || 0) >= 7) throw new Error('Go Digit rejected 7 OTPs; stopping without marking them used');
      await this.clickResendOtp(logger);
      await this.waitWithPause(20000);
    }

    await AutomationPauseController.checkpoint('Retrieve next OTP');
    const { otp, id } = await this.fetchOtpWithRetry(logger, rejectedOtpIds);
    await AutomationPauseController.checkpoint('Enter OTP');
    this.fillInput(otpInput, otp);
    const hiddenOtp = document.querySelector('#otp_hidden');
    if (hiddenOtp) this.fillInput(hiddenOtp, otp);
    const submitButton = await this.waitForLoginButton();
    await AutomationPauseController.checkpoint('Submit OTP');
    await window.GoDigitSetRun({
      ...runState,
      active: true,
      phase: 'otp',
      payload,
      lastOtpId: id,
      rejectedOtpIds,
      otpSubmitAttempts: (runState.otpSubmitAttempts || 0) + 1
    });
    logger(`Submitting OTP attempt ${(runState.otpSubmitAttempts || 0) + 1}/7`);
    submitButton.click();
    const outcome = await this.waitForLoginOutcome();
    if (outcome === 'invalid') return this.retrieveAndSubmitOtp(payload, logger);
    if (outcome !== 'success') throw new Error('Login result was not confirmed; OTP was not marked used');

    const otpMarkedUsed = await this.markOtpAsUsed(id, logger);
    await window.GoDigitSetRun({ active: false, phase: 'complete', payload });
    AutomationPauseController.complete(otpMarkedUsed ? 'Login successful; OTP marked used' : 'Login successful; OTP not marked used');
    return { success: true, otpSubmitted: true, otpMarkedUsed };
  },
  async getRunState() {
    return new Promise((resolve) => chrome.storage.local.get(['godigitRun'], (result) => resolve(result.godigitRun || {})));
  },
  getInvalidOtpMessage() {
    const alert = document.querySelector('.alert-error .kc-feedback-text, .alert-error .pf-c-alert__title, [role="alert"]');
    const message = alert?.textContent?.trim() || '';
    return /invalid code|invalid otp|incorrect otp/i.test(message) ? message : '';
  },
  async clickResendOtp(logger) {
    const resend = [...document.querySelectorAll('a, button, input[type="button"]')].find((element) => {
      const label = String(element.value || element.textContent || '').trim();
      return element.offsetParent !== null && /resend\s*otp/i.test(label);
    });
    if (resend) {
      logger('Requesting a fresh OTP from Go Digit');
      resend.click();
    } else {
      logger('Resend OTP control not found; waiting for the next OTP service result');
    }
  },
  async waitForLoginOutcome(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Verify OTP result');
      if (this.getInvalidOtpMessage()) return 'invalid';
      if (window.location.hostname === 'plus.godigit.com' || !document.querySelector('#otp-form')) return 'success';
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return 'pending';
  },
  async markOtpAsUsed(id, logger) {
    if (!id) {
      logger('OTP service returned no ID; OTP cannot be marked used');
      return false;
    }
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['godigitOtpConfig'], (result) => resolve(result.godigitOtpConfig || {}));
    });
    const base = String(config.apiBase || 'https://otpservice.coverscrafter.com/api/v1/otp').trim().replace(/\/+$/, '');
    const url = `${base}/${encodeURIComponent(id)}/use`;
    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'MARK_GODIGIT_OTP_USED', url }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(response);
      });
    });
    if (!result?.success) throw new Error(result?.error || 'Could not mark OTP as used');
    logger('Login confirmed; OTP marked used');
    return true;
  },
  async waitForLoginButton(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Find Login button');
      const button = [...document.querySelectorAll('button, input[type="submit"], input[type="button"]')].find((element) => {
        const label = String(element.value || element.textContent || '').trim().toLowerCase();
        return element.offsetParent !== null && !element.disabled && (element.id === 'otp-submit' || label === 'login');
      });
      if (button) return button;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Go Digit Login button not found');
  },
  async fetchOtpWithRetry(logger, rejectedOtpIds = []) {
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['godigitOtpConfig'], (result) => resolve(result.godigitOtpConfig || {}));
    });
    const apiBase = String(config.apiBase || '').trim().replace(/\/+$/, '');
    if (!apiBase || !config.email || !config.label) {
      throw new Error('Go Digit OTP service settings are incomplete');
    }
    const url = `${apiBase}/latest?label=${encodeURIComponent(config.label)}&mailbox_email=${encodeURIComponent(config.email)}`;
    logger(`OTP lookup: label=${config.label}, email=${config.email}`);
    for (let attempt = 1; attempt <= 7; attempt += 1) {
      await AutomationPauseController.checkpoint(`Fetch OTP (${attempt}/7)`);
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'FETCH_GODIGIT_OTP', url }, (result) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!result?.success || !result.data) {
              const detail = result?.data?.message || result?.error || 'No OTP received';
              if (result?.status === 401) {
                return reject(new Error('HTTP 401: OTP service API key is missing or invalid. Check Go Digit settings.'));
              }
              return reject(new Error(result?.status ? `HTTP ${result.status}: ${detail}` : detail));
            }
            resolve(result.data);
          });
        });
        if (response?.success === false) throw new Error(response.message || 'OTP service reported no OTP');
        let data = response?.data ?? response;
        while (data?.data && typeof data.data === 'object') data = data.data;
        const otp = String(data?.otp ?? data?.code ?? response?.otp ?? '').trim();
        if (!/^\d{6}$/.test(otp)) throw new Error(response?.message || 'Response did not contain a 6-digit OTP');
        const id = String(data?.id || data?._id || response?.id || response?._id || '');
        if (id && rejectedOtpIds.includes(id)) throw new Error('OTP service returned an OTP that Go Digit already rejected');
        logger(`OTP retrieved on attempt ${attempt}/7`);
        return { otp, id };
      } catch (error) {
        logger(`OTP attempt ${attempt}/7 failed: ${error.message}`);
        if (attempt === 7) break;
      }
      logger('Waiting 20 seconds before the next OTP attempt');
      await this.waitWithPause(20000);
    }
    throw new Error('OTP retrieval failed after 7 attempts');
  },
  async waitWithPause(durationMs) {
    await AutomationPauseController.checkpoint(`Waiting ${Math.ceil(durationMs / 1000)} seconds before OTP retry`);
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint();
      await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())));
    }
  },
  async waitForElement(selector, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint();
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) return element;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Go Digit login field not found: ${selector}`);
  },
  fillInput(element, value) {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(element, value); else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }
};