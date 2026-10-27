/**
 * ICICI Lombard Insurance Dashboard Flow
 * Handles dashboard interactions on https://nysa.icicilombard.com/#/dashboard
 * Clicks on the "Cover all accidental damage" category
 */

const ICICIDashboard = {
  async run(payload, logger = console.log) {
    const pauseAt = async (label) => window.AutomationPauseController?.checkpoint(label);
    logger('🚀 Starting ICICI Lombard dashboard flow...');
    logger('Current URL:', window.location.href);

    try {
      // Check if on dashboard
      if (!window.location.href.includes('/#/dashboard')) {
        logger('⚠️ Not on dashboard page');
        return { success: false, error: 'Not on dashboard page' };
      }

      logger('✅ On dashboard page');

      // Wait for dashboard to fully load
      await pauseAt('Dashboard -> Load');
      await this.waitForDashboardLoad(logger);

      // Find and click the "Cover all accidental damage" category
      await pauseAt('Dashboard -> Cover all accidental damage');
      const clicked = await this.clickCoverCategory(logger);
      
      if (!clicked) {
        logger('❌ Failed to click cover category');
        return { success: false, error: 'Cover category not found' };
      }

      logger('✅ Dashboard flow completed successfully');
      return { success: true };

    } catch (err) {
      logger('❌ Dashboard flow error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async waitForDashboardLoad(logger) {
    logger('⏳ Waiting for dashboard to fully load...');
    
    const timeout = 10000;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        // Look for category elements
        const categories = document.querySelectorAll('[class*="category"], .category-details, [class*="cover"]');
        
        if (categories.length > 0) {
          logger(`✅ Dashboard loaded, found ${categories.length} category elements`);
          return resolve(true);
        }

        if (Date.now() - start > timeout) {
          logger('⚠️ Dashboard load timeout, but continuing...');
          return resolve(false);
        }

        setTimeout(check, 300);
      };

      check();
    });
  },

  async clickCoverCategory(logger) {
    logger('🔍 Looking for arrow in "Cover all accidental damage" category...');

    // Strategy 1: Find by text content then locate arrow
    const allElements = document.querySelectorAll('*');
    
    for (const el of allElements) {
      const text = el.textContent || '';
      
      // Check if this element contains the target text
      if (text.includes('Cover all accidental damage') || text.includes('accidental damage')) {
        // Look for arrow within this element
        let arrowElement = el.querySelector('span.arrow, [class*="arrow"]');
        
        if (arrowElement) {
          logger('✅ Found arrow element within category');
          highlightElement(arrowElement, '#ff9800', 1500);
          
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(arrowElement);
          
          logger('✅ Clicked on arrow');
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    // Strategy 2: Find category div and then locate arrow
    const categoryDivs = document.querySelectorAll('div[class*="category-details"]');
    
    logger(`🔍 Found ${categoryDivs.length} category-details elements`);

    for (const div of categoryDivs) {
      const text = div.textContent || '';
      
      if (text.includes('Cover all accidental damage') || text.includes('accidental damage')) {
        const arrowElement = div.querySelector('span.arrow, span[class*="arrow"], i.fa-arrow');
        
        if (arrowElement) {
          logger('✅ Found arrow in category div');
          highlightElement(arrowElement, '#ff9800', 1500);
          
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(arrowElement);
          
          logger('✅ Clicked on arrow');
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    // Strategy 3: Find all arrows and match with category text
    const arrows = document.querySelectorAll('span.arrow, span[class*="arrow"], i.fa-arrow, .arrow');
    
    logger(`🔍 Found ${arrows.length} arrow elements`);

    for (const arrow of arrows) {
      const parent = arrow.closest('div[class*="category"], div[class*="item"]');
      
      if (parent) {
        const text = parent.textContent || '';
        
        if (text.includes('Cover all accidental damage') || text.includes('accidental damage')) {
          logger('✅ Found arrow with matching parent category');
          highlightElement(arrow, '#ff9800', 1500);
          
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(arrow);
          
          logger('✅ Clicked on arrow');
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    logger('❌ Arrow not found');
    return false;
  }
};

// Helper function (if not in flowUtils)
function highlightElement(el, color = '#4CAF50', duration = 2000) {
  if (!el) return;
  const orig = { outline: el.style.outline, boxShadow: el.style.boxShadow };
  el.style.outline = `3px solid ${color}`;
  el.style.boxShadow = `0 0 12px ${color}80`;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    el.style.outline = orig.outline;
    el.style.boxShadow = orig.boxShadow;
  }, duration);
}

function clickElement(el) {
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') {
    el.focus({ preventScroll: true });
  }
  el.click();
  return true;
}

// Make ICICIDashboard available globally
window.ICICIDashboard = ICICIDashboard;
