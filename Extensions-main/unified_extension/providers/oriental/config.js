document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const otpEmailInput = document.getElementById('otp-email');
  const otpLabelInput = document.getElementById('otp-label');
  const otpApiInput = document.getElementById('otp-api');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get(['openaiConfig', 'otpConfig'], (r) => {
    if (r.openaiConfig) {
      apiKeyInput.value = r.openaiConfig.apiKey || '';
      modelSelect.value = r.openaiConfig.model || 'gpt-4o';
    }
    if (r.otpConfig) {
      otpEmailInput.value = r.otpConfig.email || 'otpcoverscrafter@gmail.com';
      otpLabelInput.value = r.otpConfig.label || 'ORIENTAL_INSURANCE';
      otpApiInput.value = r.otpConfig.apiBase || 'https://otpservice.coverscrafter.com/api/v1/otp';
    }
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      openaiConfig: {
        apiKey: apiKeyInput.value.trim(),
        model: modelSelect.value
      },
      otpConfig: {
        email: otpEmailInput.value.trim(),
        label: otpLabelInput.value.trim(),
        apiBase: otpApiInput.value.trim()
      }
    }, () => {
      statusEl.textContent = '✅ Settings saved!';
      statusEl.className = 'status success';
      setTimeout(() => { statusEl.className = 'status hidden'; }, 3000);
    });
  });
});
