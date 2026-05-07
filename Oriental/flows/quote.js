/**
 * Oriental Insurance Extension - Quote Flow (Navigate + Get Quote)
 * Implements navigateToTwoWheelerPolicy flow from orientalService.js
 */
const OrientalQuote = {
  TWO_WHEELER_URL: 'https://orientalinsurance.org.in/policy/motor/TWO_WHEELER',

  async navigateToTwoWheelerPolicy(logger = console.log) {
    logger('Navigating to Two Wheeler Policy...');
    await wait(1000);

    const urlBefore = window.location.href;
    const alreadyOnTarget = urlBefore.includes('TWO_WHEELER') || urlBefore.includes('two-wheeler');

    if (alreadyOnTarget) {
      const radio = qs(ORIENTAL_SELECTORS.brandNewVehicleRadio);
      if (radio) {
        logger('Already on Two Wheeler Policy page');
        return true;
      }
    }

    let twoWheelerLink = null;
    let linkVisible = false;

    const productsTab = findElementByText('a', 'Products') || qs(ORIENTAL_SELECTORS.productsTab);
    if (productsTab) {
      logger('Hovering over Products tab...');
      productsTab.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await wait(500);
    }

    twoWheelerLink = document.querySelector('a[href*="two-wheeler"]') || document.querySelector('a[href*="TWO_WHEELER"]');
    linkVisible = !!twoWheelerLink;

    if (!linkVisible) {
      twoWheelerLink = findElementByText('a', 'Two Wheeler');
      linkVisible = !!twoWheelerLink;
    }

    if (!linkVisible) {
      const links = document.querySelectorAll('a');
      for (const a of links) {
        if (/two\s*wheeler/i.test(a.textContent || '')) {
          twoWheelerLink = a;
          linkVisible = true;
          break;
        }
      }
    }

    if (linkVisible && twoWheelerLink) {
      logger('Two Wheeler Policy link found');
      const href = twoWheelerLink.getAttribute('href') || '';
      twoWheelerLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(300);
      twoWheelerLink.click();
      await wait(4000);

      const urlAfter = window.location.href;
      if (urlAfter !== urlBefore || urlAfter.includes('TWO_WHEELER') || urlAfter.includes('two-wheeler')) {
        logger('Navigated via click');
        await wait(2000);
        const radio = qs(ORIENTAL_SELECTORS.brandNewVehicleRadio);
        if (radio) return true;
      }

      if (href) {
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = window.location.origin + href;
        } else if (!href.startsWith('http')) {
          fullUrl = window.location.origin + '/' + href;
        }
        if (fullUrl.startsWith('http')) {
          logger('Direct navigation fallback');
          setTimeout(() => { window.location.href = fullUrl; }, 100);
          return { redirected: true };
        }
      }
    }

    logger('Two Wheeler link not found, navigating directly');
    setTimeout(() => { window.location.href = this.TWO_WHEELER_URL; }, 100);
    return { redirected: true };
  },

  async selectBrandNewAndGetQuote(logger = console.log) {
    const radio = qs(ORIENTAL_SELECTORS.brandNewVehicleRadio);
    if (radio) {
      radio.click();
      await wait(500);
    }
    const getQuoteBtn = findElementByText('button', 'Get Quote') || findElementByText('a', 'Get Quote') || qs(ORIENTAL_SELECTORS.getQuoteButton);
    if (getQuoteBtn) {
      getQuoteBtn.click();
      await wait(4000);
      return true;
    }
    return false;
  },

  async run(logger = console.log) {
    const navResult = await this.navigateToTwoWheelerPolicy(logger);
    if (navResult === false) {
      return { success: false, error: 'Navigation failed' };
    }
    if (navResult && navResult.redirected) {
      return { success: true, message: 'Navigating to Two Wheeler page - click Get Quote again after load' };
    }
    const ok = await this.selectBrandNewAndGetQuote(logger);
    return { success: ok };
  },
};
