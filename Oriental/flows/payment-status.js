/**
 * Oriental Insurance Extension - Payment Status Flow
 */
const OrientalPaymentStatus = {
  async run(proposalNumber, logger = console.log) {
    if (!window.location.href.includes('orientalinsurance.org.in')) {
      window.location.href = ORIENTAL_CONFIG.URLS.HOME + 'my-policy';
      return { success: false, redirect: true };
    }
    const searchInput = document.querySelector('input[placeholder*="proposal"]') || document.querySelector('input[name*="proposal"]');
    if (searchInput && proposalNumber) {
      fillInput(searchInput, proposalNumber);
      await wait(500);
      const searchBtn = findElementByText('button', 'Search') || document.querySelector('button[type="submit"]');
      if (searchBtn) {
        clickElement(searchBtn);
        await wait(3000);
      }
    }
    return { success: true };
  },
};
