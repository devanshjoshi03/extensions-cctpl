document.addEventListener('DOMContentLoaded', () => {
  const PROVIDERS = {
    bajaj: 'providers/bajaj/popup.html',
    icici: 'providers/icici/popup.html',
    sompo: 'providers/sompo/popup.html',
    oriental: 'providers/oriental/popup.html',
    godigit: 'providers/godigit/popup.html',
  };

  document.querySelectorAll('.provider-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.provider;
      const path = PROVIDERS[id];
      if (path) window.location.href = path;
    });
  });

  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get(['lastProvider'], (r) => {
    if (!r.lastProvider) return;
    const card = document.querySelector(`[data-provider="${r.lastProvider}"]`);
    if (card) card.classList.add('last-used');
  });
});
