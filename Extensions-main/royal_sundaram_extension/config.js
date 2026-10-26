document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const otpEmailInput = document.getElementById('otp-email');
  const otpLabelInput = document.getElementById('otp-label');
  const otpApiInput = document.getElementById('otp-api');
  const defaultUsernameInput = document.getElementById('default-username');
  const defaultPasswordInput = document.getElementById('default-password');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get(['openaiConfig', 'otpConfig', 'agentConfig'], (r) => {
    const openaiConfig = r.openaiConfig || {};
    const otpConfig = r.otpConfig || {};
    const agentConfig = r.agentConfig || {};

    apiKeyInput.value = openaiConfig.apiKey || '';
    modelSelect.value = openaiConfig.model || 'gpt-4o';
    otpEmailInput.value = otpConfig.email || 'otpcoverscrafter@gmail.com';
    otpLabelInput.value = otpConfig.label || 'Royal_sundaram';
    otpApiInput.value = otpConfig.apiBase || 'https://otpservice.coverscrafter.com/api/v1/otp';
    defaultUsernameInput.value = agentConfig.username || '';
    defaultPasswordInput.value = agentConfig.password || '';
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
      },
      agentConfig: {
        username: defaultUsernameInput.value.trim(),
        password: defaultPasswordInput.value.trim()
      }
    }, () => {
      statusEl.textContent = 'Settings saved';
      statusEl.className = 'status success';
      setTimeout(() => {
        statusEl.className = 'status hidden';
      }, 3000);
    });
  });
});
