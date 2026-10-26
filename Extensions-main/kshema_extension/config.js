document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const defaultUsernameInput = document.getElementById('default-username');
  const defaultPasswordInput = document.getElementById('default-password');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  chrome.storage.local.get(['openaiConfig', 'kshemaConfig'], (result) => {
    if (result.openaiConfig) {
      apiKeyInput.value = result.openaiConfig.apiKey || '';
      modelSelect.value = result.openaiConfig.model || 'gpt-4o';
    }

    if (result.kshemaConfig) {
      defaultUsernameInput.value = result.kshemaConfig.username || '';
      defaultPasswordInput.value = result.kshemaConfig.password || '';
    }
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      openaiConfig: {
        apiKey: apiKeyInput.value.trim(),
        model: modelSelect.value
      },
      kshemaConfig: {
        username: defaultUsernameInput.value.trim(),
        password: defaultPasswordInput.value.trim()
      }
    }, () => {
      statusEl.textContent = 'Settings saved!';
      statusEl.className = 'status success';
      setTimeout(() => { statusEl.className = 'status hidden'; }, 3000);
    });
  });
});
