document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const defaultUsernameInput = document.getElementById('default-username');
  const defaultPasswordInput = document.getElementById('default-password');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get(['openaiConfig', 'iciciConfig'], (r) => {
    if (r.openaiConfig) {
      apiKeyInput.value = r.openaiConfig.apiKey || '';
      modelSelect.value = r.openaiConfig.model || 'gpt-4o';
    }
    if (r.iciciConfig) {
      defaultUsernameInput.value = r.iciciConfig.username || '';
      defaultPasswordInput.value = r.iciciConfig.password || '';
    }
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      openaiConfig: {
        apiKey: apiKeyInput.value.trim(),
        model: modelSelect.value
      },
      iciciConfig: {
        username: defaultUsernameInput.value.trim(),
        password: defaultPasswordInput.value.trim()
      }
    }, () => {
      statusEl.textContent = '✅ Settings saved!';
      statusEl.className = 'status success';
      setTimeout(() => { statusEl.className = 'status hidden'; }, 3000);
    });
  });
});
