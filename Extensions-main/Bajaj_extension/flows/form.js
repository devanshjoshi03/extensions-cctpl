/**
 * Bajaj General Insurance Form Flow
 * Handles form automation on https://portal.bajajgeneral.com/BagicNxt/partner/login.do
 */

const BajajForm = {
  async run(payload, logger = console.log) {
    const href = window.location.href;
    const onPartnerLogin =
      href.includes('portal.bajajgeneral.com/BagicNxt/partner/login.do') ||
      /\/BagicNxt\/partner\/login\.do/i.test(href);
    console.log('[Bajaj Form] 🔍 Checking URL:', href);
    console.log('[Bajaj Form] 🔍 URL includes partner login.do?', onPartnerLogin);

    console.log('[Bajaj Form] 🚀 Starting Bajaj form flow...');
    logger('🚀 Starting Bajaj form flow...');
    
    // Block ALL dialogs globally - no alerts anywhere
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};
    
    try {
      console.log('[Bajaj Form] 📍 Current URL:', href);
      // Check current URL (query strings etc. still match via includes / regex)
      if (!onPartnerLogin) {
        console.log('[Bajaj Form] ❌ Not on login page');
        return { success: false, error: 'Not on login page' };
      }

      // Step 1: Select TWO WHEELER POLICY radio button
      console.log('[Bajaj Form] 🔍 Step 1: Selecting TWO WHEELER POLICY radio button...');
      const twoWheelerSelected = await this.selectTwoWheelerPolicy(logger);
      console.log('[Bajaj Form] ✅ Step 1 Result:', twoWheelerSelected);
      if (!twoWheelerSelected) {
        console.log('[Bajaj Form] ❌ Failed to select TWO WHEELER POLICY radio button');
        throw new Error('Failed to select TWO WHEELER POLICY radio button');
      }

      // Step 2: Select dropdown option
      console.log('[Bajaj Form] 🔍 Step 2: Selecting dropdown option...');
      const dropdownSelected = await this.selectDropdownOption(logger);
      console.log('[Bajaj Form] ✅ Step 2 Result:', dropdownSelected);
      if (!dropdownSelected) {
        console.log('[Bajaj Form] ❌ Failed to select dropdown option');
        throw new Error('Failed to select dropdown option');
      }

      // Step 3: Select NB radio button
      console.log('[Bajaj Form] 🔍 Step 3: Selecting NB radio button...');
      const nbSelected = await this.selectNbRadio(logger);
      console.log('[Bajaj Form] ✅ Step 3 Result:', nbSelected);
      if (!nbSelected) {
        console.log('[Bajaj Form] ❌ Failed to select NB radio button');
        throw new Error('Failed to select NB radio button');
      }

      // Step 4: Click Proceed button
      console.log('[Bajaj Form] 🔍 Step 4: Clicking Proceed button...');
      const proceeded = await this.clickProceedButton(logger);
      console.log('[Bajaj Form] ✅ Step 4 Result:', proceeded);
      if (!proceeded) {
        console.log('[Bajaj Form] ❌ Failed to click Proceed button');
        throw new Error('Failed to click Proceed button');
      }

      console.log('[Bajaj Form] ✅ Form flow completed successfully');
      logger('✅ Form flow completed successfully');

      // Full navigation to motorload.do destroys this content script. Only the
      // service worker survives — queue START_VEHICLE_DETAILS in background.js;
      // it relays with chrome.tabs.sendMessage after motorload.do reaches status complete.
      console.log('[Bajaj Form] 📨 Queuing START_VEHICLE_DETAILS in background (survives navigation)...');
      logger('⏳ Queued vehicle details — will run on motorload.do after page loads...');
      chrome.runtime.sendMessage({ action: 'START_VEHICLE_DETAILS', payload }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[Bajaj Form] START_VEHICLE_DETAILS:', chrome.runtime.lastError.message);
          return;
        }
        console.log('[Bajaj Form] Background acknowledged:', resp);
      });

      console.log('[Bajaj Form] 🎉 Form flow completed; vehicle details will start on motorload.do');
      return { success: true };

    } catch (err) {
      console.error('[Bajaj Form] ❌ Form flow failed:', err.message, err);
      logger('❌ Form flow failed:', err.message);
      return { success: false, error: err.message };
    }
  },

  async selectTwoWheelerPolicy(logger) {
    logger('🔍 Looking for TWO WHEELER POLICY radio button...');
    
    // Wait for the radio button to be available
    await this.waitForElement('#motor-two-wheeler', 10000);
    
    const radioButton = document.querySelector('#motor-two-wheeler');
    if (!radioButton) {
      logger('❌ TWO WHEELER POLICY radio button not found');
      return false;
    }

    try {
      // Check if already selected
      if (radioButton.checked) {
        logger('✅ TWO WHEELER POLICY already selected');
        return true;
      }

      // Click the radio button
      radioButton.click();
      
      // Trigger change event
      radioButton.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Wait a bit for the page to respond
      await this.sleep(500);
      
      logger('✅ TWO WHEELER POLICY radio button selected');
      return true;
    } catch (err) {
      logger('❌ Failed to select TWO WHEELER POLICY radio button:', err.message);
      return false;
    }
  },

  async selectDropdownOption(logger) {
    logger('🔍 Looking for product dropdown...');
    
    // Wait for the dropdown to be available
    await this.waitForElement('#productCodeMot2', 10000);
    
    const dropdown = document.querySelector('#productCodeMot2');
    if (!dropdown) {
      logger('❌ Product dropdown not found');
      return false;
    }

    try {
      // Check if dropdown is visible and enabled
      if (dropdown.style.display === 'none' || dropdown.disabled) {
        logger('⚠️ Dropdown is not visible or enabled, waiting...');
        await this.sleep(1000);
      }

      // Focus and click the dropdown
      dropdown.focus();
      dropdown.click();
      
      // Wait for dropdown options to load
      await this.sleep(500);
      
      // Find and select the specific option: "BRNAD NEW - TWO WHEELER POLICY BUNDLED - 1OD+5TP YEARS [1826]"
      const options = dropdown.querySelectorAll('option');
      let targetOption = null;
      
      for (const option of options) {
        const text = option.textContent.trim();
        if (text.includes('BRNAD NEW - TWO WHEELER POLICY BUNDLED - 1OD+5TP YEARS [1826]') || 
            option.value === '1826') {
          targetOption = option;
          break;
        }
      }

      if (!targetOption) {
        logger('❌ Target dropdown option not found');
        return false;
      }

      // Select the option
      dropdown.value = targetOption.value;
      
      // Trigger change event
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      dropdown.dispatchEvent(new Event('onchange', { bubbles: true }));
      
      logger('✅ Selected dropdown option: BRNAD NEW - TWO WHEELER POLICY BUNDLED - 1OD+5TP YEARS [1826]');
      return true;
    } catch (err) {
      logger('❌ Failed to select dropdown option:', err.message);
      return false;
    }
  },

  async selectNbRadio(logger) {
    logger('🔍 Looking for NB radio button...');
    
    // Wait for the NB radio button to be available
    await this.waitForElement('#radio-NB-motor', 10000);
    
    const nbRadioButton = document.querySelector('#radio-NB-motor');
    if (!nbRadioButton) {
      logger('❌ NB radio button not found');
      return false;
    }

    try {
      // Check if already selected
      if (nbRadioButton.checked) {
        logger('✅ NB radio button already selected');
        return true;
      }

      // Click the NB radio button
      nbRadioButton.click();
      
      // Trigger change event
      nbRadioButton.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Wait a bit for the page to respond
      await this.sleep(500);
      
      logger('✅ NB radio button selected');
      return true;
    } catch (err) {
      logger('❌ Failed to select NB radio button:', err.message);
      return false;
    }
  },

  async clickProceedButton(logger) {
    logger('🔍 Looking for Proceed button...');
    
    // Wait for the Proceed button to be available
    await this.waitForElement('button[onclick="Motor_Proceed();"]', 10000);

    let proceedButton = document.querySelector('button[onclick="Motor_Proceed();"]');
    if (!proceedButton) {
      const altSelectors = [
        'button.btn.btn-primary',
        'button[type="button"]',
        '.btn.btn-primary'
      ];
      for (const selector of altSelectors) {
        const btn = document.querySelector(selector);
        if (btn && btn.textContent.trim().toLowerCase().includes('proceed')) {
          proceedButton = btn;
          break;
        }
      }
    }

    if (!proceedButton) {
      logger('❌ Proceed button not found');
      return false;
    }

    try {
      // Check if button is enabled
      if (proceedButton.disabled) {
        logger('⚠️ Proceed button is disabled, waiting...');
        await this.sleep(2000);
      }

      // Click the proceed button
      proceedButton.focus();
      proceedButton.click();
      
      // Also try triggering the onclick function directly
      if (typeof proceedButton.onclick === 'function') {
        proceedButton.onclick();
      }
      
      // Wait a bit for navigation
      await this.sleep(1000);
      
      logger('✅ Proceed button clicked');
      return true;
    } catch (err) {
      logger('❌ Failed to click Proceed button:', err.message);
      return false;
    }
  },

  async waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });
      
      obs.observe(document.body, { childList: true, subtree: true });
      
      setTimeout(() => {
        obs.disconnect();
        reject(new Error('Timeout waiting for element: ' + selector));
      }, timeout);
    });
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Expose on window so sibling content scripts (e.g. content.js) always resolve the binding.
window.BajajForm = BajajForm;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BajajForm;
}
