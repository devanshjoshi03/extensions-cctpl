const DEFAULT_GODIGIT_OTP_API_KEY = 'KOSmuBI8gSoZ1mNXl0ecJ5rBlOiak9aXxHO1GwNAjys=';

document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('phone-number');
  const userCodeInput = document.getElementById('user-code');
  const passwordInput = document.getElementById('agent-password');
  const otpApiKeyInput = document.getElementById('otp-api-key');
  const otpEmailInput = document.getElementById('otp-email');
  const otpLabelInput = document.getElementById('otp-label');
  const otpApiInput = document.getElementById('otp-api');
  const saveButton = document.getElementById('save-settings');
  const status = document.getElementById('settings-status');

  chrome.storage.local.get(['godigitAgentConfig', 'godigitOtpConfig'], (result) => {
    const agent = result.godigitAgentConfig || {};
    const otp = result.godigitOtpConfig || {};
    otpApiKeyInput.value = otp.apiKey || DEFAULT_GODIGIT_OTP_API_KEY;
    phoneInput.value = agent.username || '';
    userCodeInput.value = agent.usercode || '';
    passwordInput.value = agent.password || ':OTP';
    otpEmailInput.value = otp.email || 'otpcoverscrafter@gmail.com';
    otpLabelInput.value = otp.label || 'GO_DIGIT';
    otpApiInput.value = otp.apiBase || 'https://otpservice.coverscrafter.com/api/v1/otp';
  });

  saveButton.addEventListener('click', () => {
    const username = phoneInput.value.trim();
    const usercode = userCodeInput.value.trim();
    const password = passwordInput.value;
    const apiKey = otpApiKeyInput.value.trim();
    const email = otpEmailInput.value.trim();
    const label = otpLabelInput.value.trim();
    const apiBase = otpApiInput.value.trim();
    if (username && !/^\d{10}$/.test(username)) {
      status.textContent = 'Enter a 10-digit mobile number.';
      return;
    }
    chrome.storage.local.set({
      godigitAgentConfig: { username, usercode, password },
      godigitOtpConfig: { apiKey, email, label, apiBase }
    }, () => {
      status.textContent = 'Go Digit settings saved.';
    });
  });
});