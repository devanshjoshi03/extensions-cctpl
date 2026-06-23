document.addEventListener('DOMContentLoaded', () => {
  const provider = document.body.dataset.provider;
  if (provider) {
    chrome.storage.local.set({ lastProvider: provider });
  }
});
