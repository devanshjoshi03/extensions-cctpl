document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model');
  const saveBtn = document.getElementById('save-shared');
  const statusEl = document.getElementById('shared-status');

  chrome.storage.local.get(['openaiConfig'], (r) => {
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
    }, () => {
      statusEl.textContent = 'Shared settings saved.';
      statusEl.className = 'status success';
      setTimeout(() => {
        statusEl.className = 'status hidden';
      }, 3000);
    });
  });
});
