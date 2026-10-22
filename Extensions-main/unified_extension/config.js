const DEFAULT_OTP_SERVICE_API_KEY = 'KOSmuBI8gSoZ1mNXl0ecJ5rBlOiak9aXxHO1GwNAjys=';

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const otpServiceApiKeyInput = document.getElementById('otp-service-api-key');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('save-shared');
  const statusEl = document.getElementById('shared-status');

  chrome.storage.local.get(['openaiConfig', 'otpServiceApiKey'], (r) => {
    otpServiceApiKeyInput.value = r.otpServiceApiKey || DEFAULT_OTP_SERVICE_API_KEY;
    if (r.openaiConfig) {
      apiKeyInput.value = r.openaiConfig.apiKey || '';
      modelSelect.value = r.openaiConfig.model || 'gpt-4o';
    }
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      openaiConfig: {
        apiKey: apiKeyInput.value.trim(),
        model: modelSelect.value,
      },
      otpServiceApiKey: otpServiceApiKeyInput.value.trim(),
    }, () => {
      statusEl.textContent = 'Shared settings saved.';
      statusEl.className = 'status success';
      setTimeout(() => {
        statusEl.className = 'status hidden';
      }, 3000);
    });
  });
});
