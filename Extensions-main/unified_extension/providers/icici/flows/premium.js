/**
 * ICICI Lombard Insurance Premium Page Flow
 * Handles premium page interactions on https://nysa.icicilombard.com/NysaMotor/premium
 */

const ICICIPremium = {
  async run(payload, logger = console.log) {
    const pauseAt = async (label) => window.AutomationPauseController?.checkpoint(label);
    const pauseAwareWait = async (ms) => {
      const waitFn = window.flowUtils?.controlledWait || window.flowUtils?.wait;
      if (waitFn) return waitFn(ms);
      return new Promise((resolve) => setTimeout(resolve, ms));
    };
    logger('🚀 Starting ICICI Lombard premium flow...');
    logger('Current URL:', window.location.href);

    try {
      // Check if on premium page
      if (!window.location.href.includes('/NysaMotor/premium')) {
        logger('⚠️ Not on premium page');
        return { success: false, error: 'Not on premium page' };
      }

      logger('✅ On premium page');

      // Wait for premium page to fully load
      await pauseAt('Premium -> Load');
      await this.waitForPremiumPageLoad(logger);

      // Fill IDV field from payload
      await pauseAt('Premium -> IDV');
      let filled = await this.fillIDVField(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill IDV field');
      }

      // Click Update button
      await pauseAt('Premium -> Update IDV');
      let clicked = await this.clickUpdateButton(logger);
      
      if (!clicked) {
        logger('❌ Failed to click Update button');
        return { success: false, error: 'Update button not found' };
      }

      // Wait for page to update
      await pauseAwareWait(1500);

      // Click on Basic Plan card
      await pauseAt('Premium -> Basic Plan');
      clicked = await this.clickBasicPlanCard(logger);
      
      if (!clicked) {
        logger('❌ Failed to click Basic Plan card');
        return { success: false, error: 'Basic Plan card not found' };
      }

      // Wait for card to expand/load
      await pauseAwareWait(1000);

      // Click Add/Remove Cover link
      await pauseAt('Premium -> Add Remove Cover');
      clicked = await this.clickAddRemoveCoverLink(logger);
      
      if (!clicked) {
        logger('❌ Failed to click Add/Remove Cover link');
        return { success: false, error: 'Add/Remove Cover link not found' };
      }

      // Wait 2 seconds for modal/section to appear
      await pauseAwareWait(2000);

      const shouldCheckPACover =
        payload?.agentDetails?.withoutcpa === false ||
        (payload?.agentDetails?.withoutcpa == null && payload?.customerDetails?.withoutcpa === false);

      // Check PA cover checkbox only when the payload explicitly enables it
      if (shouldCheckPACover) {
        await pauseAt('Premium -> PA Cover');
        clicked = await this.checkPACoverCheckbox(logger);
        
        if (!clicked) {
          logger('⚠️ Failed to check PA cover checkbox');
        }
      } else {
        logger('ℹ️ Skipping PA cover checkbox because agentDetails.withoutcpa is not false');
      }

      // Check if nilDepreciation is enabled
      const covers = payload?.vehicleDetails?.covers || payload?.covers || {};
      const nilDepreciation = covers?.nilDepreciation === '1' || covers?.nilDepreciation === true;
      
      if (nilDepreciation) {
        logger('✅ Nil Depreciation is enabled');

        // Check Zero Depreciation Cover checkbox
        await pauseAt('Premium -> Zero Depreciation');
        clicked = await this.checkZeroDepreciationCheckbox(logger);
        
        if (!clicked) {
          logger('⚠️ Failed to check Zero Depreciation checkbox');
        } else {
          // Wait for options to appear
          await pauseAwareWait(800);

          // Select Silver plan for Zero Depreciation
          await pauseAt('Premium -> Zero Depreciation Plan');
          clicked = await this.selectZeroDepreciationPlan(logger);
          
          if (!clicked) {
            logger('⚠️ Failed to select Silver plan for Zero Depreciation');
          }
        }
      }

      // Check if returnToInvoice is enabled
      const returnToInvoice = covers?.returnToInvoice === '1' || covers?.returnToInvoice === true;
      
      if (returnToInvoice) {
        logger('✅ Return to Invoice is enabled');

        // Check Return to Invoice Cover checkbox
        await pauseAt('Premium -> Return to Invoice');
        clicked = await this.checkReturnToInvoiceCheckbox(logger);
        
        if (!clicked) {
          logger('⚠️ Failed to check Return to Invoice checkbox');
        }
      }

      // Click Recalculate button
      await pauseAt('Premium -> Recalculate');
      clicked = await this.clickRecalculateButton(logger);
      
      if (!clicked) {
        logger('⚠️ Failed to click Recalculate button');
      }

      // Wait 3-5 seconds for recalculation
      await pauseAwareWait(4000);

      // Click Submit button
      await pauseAt('Premium -> Submit');
      clicked = await this.clickSubmitButton(logger);
      
      if (!clicked) {
        logger('❌ Failed to click Submit button');
        return { success: false, error: 'Submit button not found' };
      }

      // Wait 5 seconds then click "Buy Now" button
      await pauseAwareWait(5000);
      await pauseAt('Premium -> Buy Now');
      clicked = await this.clickBuyNowButton(logger);
      
      if (!clicked) {
        logger('⚠️ Failed to click Buy Now button');
      }

      logger('✅ Premium flow completed successfully');
      return { success: true };

    } catch (err) {
      logger('❌ Premium flow error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async waitForPremiumPageLoad(logger) {
    logger('⏳ Waiting for premium page to fully load...');
    
    const timeout = 10000;
    const start = Date.now();

    return new Promise((resolve) => {
      const check = () => {
        const idvInput = document.querySelector('input[class*="value-input"]');
        const planCards = document.querySelectorAll('.plan-card, [class*="plan-card"]');
        
        if ((idvInput || planCards.length > 0)) {
          logger(`✅ Premium page loaded`);
          return resolve(true);
        }

        if (Date.now() - start > timeout) {
          logger('⚠️ Premium page load timeout, but continuing...');
          return resolve(false);
        }

        setTimeout(check, 300);
      };

      check();
    });
  },

  async fillIDVField(payload, logger) {
    logger('🔍 Looking for IDV field...');

    const idv =
      payload?.vehicleDetails?.IDV ||
      payload?.vehicleDetails?.idv ||
      payload?.IDV ||
      payload?.idv ||
      '';
    
    if (!idv) {
      logger('⚠️ No IDV provided in payload');
      return false;
    }

    logger(`📝 IDV to enter: ${idv}`);

    // Find the IDV input field
    let idvInput = document.querySelector('input[class*="value-input"]');
    
    if (!idvInput) {
      logger('❌ IDV input field not found');
      return false;
    }

    logger('✅ Found IDV input field');
    highlightElement(idvInput, '#ff9800', 1500);

    // Click and clear the field
    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    clickFn(idvInput);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear existing value
    idvInput.value = '';
    idvInput.dispatchEvent(new Event('input', { bubbles: true }));
    idvInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Fill the field slowly
    for (let char of idv.toString()) {
      idvInput.value += char;
      idvInput.dispatchEvent(new Event('input', { bubbles: true }));
      idvInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
    }
    
    logger(`📝 IDV field filled with: ${idv}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async clickUpdateButton(logger) {
    logger('🔍 Looking for Update button...');

    // Find the update button
    let button = document.querySelector('button.update-btn');
    
    if (button && button.offsetParent !== null) {
      logger('✅ Found Update button');
      highlightElement(button, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(button);
      
      logger('✅ Clicked Update button');
      await new Promise(r => setTimeout(r, 800));
      return true;
    }

    logger('❌ Update button not found');
    return false;
  },

  async clickBasicPlanCard(logger) {
    logger('🔍 Looking for Basic Plan card...');

    // Find the plan card
    let planCard = document.querySelector('.plan-card.card-selected, .plan-card[class*="selected"]');
    
    if (!planCard) {
      planCard = document.querySelector('.plan-card');
    }
    
    if (planCard && planCard.offsetParent !== null) {
      logger('✅ Found Basic Plan card');
      highlightElement(planCard, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(planCard);
      
      logger('✅ Clicked on Basic Plan card');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    logger('❌ Basic Plan card not found');
    return false;
  },

  async clickAddRemoveCoverLink(logger) {
    logger('🔍 Looking for "Add/Remove Cover" link...');

    // Find all links with SVG
    const links = document.querySelectorAll('span.edit-link, .edit-link, a[class*="edit"]');
    
    logger(`🔍 Found ${links.length} edit links`);

    for (const link of links) {
      const text = link.textContent.trim();
      
      if (text.includes('Add/Remove Cover') || text.includes('Additional Covers')) {
        if (link.offsetParent !== null) {
          logger('✅ Found Add/Remove Cover link');
          highlightElement(link, '#ff9800', 1500);
          
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(link);
          
          logger('✅ Clicked Add/Remove Cover link');
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    logger('❌ Add/Remove Cover link not found');
    return false;
  },

  async checkPACoverCheckbox(logger) {
    logger('🔍 Looking for PA cover checkbox...');

    // Find all checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    logger(`🔍 Found ${checkboxes.length} checkboxes`);

    for (const checkbox of checkboxes) {
      const label = checkbox.closest('.addon-left, .addon-wrapper, label, div[class*="addon"]');
      
      if (label) {
        const text = label.textContent.trim();
        
        if (text.includes('Already Holds the PA cover')) {
          logger('✅ Found PA cover checkbox');
          highlightElement(label, '#ff9800', 1500);
          
          // Check if not already checked
          if (!checkbox.checked) {
            const utils = window.flowUtils || {};
            const clickFn = utils.clickElement || clickElement;
            clickFn(checkbox);
            
            logger('✅ Checked PA cover checkbox');
            await new Promise(r => setTimeout(r, 600));
            return true;
          } else {
            logger('✅ PA cover checkbox already checked');
            return true;
          }
        }
      }
    }

    logger('❌ PA cover checkbox not found');
    return false;
  },

  async checkZeroDepreciationCheckbox(logger) {
    logger('🔍 Looking for Zero Depreciation checkbox...');

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    logger(`🔍 Searching ${checkboxes.length} checkboxes`);

    for (const checkbox of checkboxes) {
      const label = checkbox.closest('.addon-left, .addon-wrapper, label, div[class*="addon"]');
      
      if (label) {
        const text = label.textContent.trim();
        
        if (text.includes('Zero Depreciation') || text.includes('Nil Depreciation')) {
          logger('✅ Found Zero Depreciation checkbox');
          highlightElement(label, '#ff9800', 1500);
          
          if (!checkbox.checked) {
            const utils = window.flowUtils || {};
            const clickFn = utils.clickElement || clickElement;
            clickFn(checkbox);
            
            logger('✅ Checked Zero Depreciation checkbox');
            await new Promise(r => setTimeout(r, 600));
            return true;
          } else {
            logger('✅ Zero Depreciation checkbox already checked');
            return true;
          }
        }
      }
    }

    logger('❌ Zero Depreciation checkbox not found');
    return false;
  },

  async selectZeroDepreciationPlan(logger) {
    logger('🔍 Looking for Zero Depreciation plan dropdown...');

    // Find the select dropdown for zero depreciation
    const selects = document.querySelectorAll('select.form-control');
    
    logger(`🔍 Found ${selects.length} select elements`);

    for (const select of selects) {
      const label = select.closest('.addon-right, .input-group, div[class*="input"]');
      
      if (label) {
        const labelText = label.textContent.trim();
        
        if (labelText.includes('Select Plan') || labelText.includes('Plan')) {
          logger('✅ Found Zero Depreciation plan dropdown');
          highlightElement(select, '#ff9800', 1500);
          
          // Click to open
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(select);
          
          await new Promise(r => setTimeout(r, 500));

          // Find Silver option
          const options = select.querySelectorAll('option');
          
          for (const option of options) {
            if (option.textContent.includes('Silver')) {
              option.selected = true;
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              
              logger('✅ Selected Silver plan');
              await new Promise(r => setTimeout(r, 600));
              return true;
            }
          }

          logger('⚠️ Silver option not found in dropdown');
          return false;
        }
      }
    }

    logger('❌ Zero Depreciation plan dropdown not found');
    return false;
  },

  async checkReturnToInvoiceCheckbox(logger) {
    logger('🔍 Looking for Return to Invoice checkbox...');

    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    logger(`🔍 Searching ${checkboxes.length} checkboxes`);

    for (const checkbox of checkboxes) {
      const label = checkbox.closest('.addon-left, .addon-wrapper, label, div[class*="addon"]');
      
      if (label) {
        const text = label.textContent.trim();
        
        if (text.includes('Return to Invoice')) {
          logger('✅ Found Return to Invoice checkbox');
          highlightElement(label, '#ff9800', 1500);
          
          if (!checkbox.checked) {
            const utils = window.flowUtils || {};
            const clickFn = utils.clickElement || clickElement;
            clickFn(checkbox);
            
            logger('✅ Checked Return to Invoice checkbox');
            await new Promise(r => setTimeout(r, 600));
            return true;
          } else {
            logger('✅ Return to Invoice checkbox already checked');
            return true;
          }
        }
      }
    }

    logger('❌ Return to Invoice checkbox not found');
    return false;
  },

  async clickRecalculateButton(logger) {
    logger('🔍 Looking for Recalculate button...');

    const buttons = document.querySelectorAll('button.footer-btn, button[class*="recalculate"]');
    
    logger(`🔍 Found ${buttons.length} footer buttons`);

    for (const btn of buttons) {
      if (btn.textContent.includes('Recalculate') && btn.offsetParent !== null) {
        logger('✅ Found Recalculate button');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked Recalculate button');
        await new Promise(r => setTimeout(r, 800));
        return true;
      }
    }

    logger('❌ Recalculate button not found');
    return false;
  },

  async clickSubmitButton(logger) {
    logger('🔍 Looking for Submit button...');

    const buttons = document.querySelectorAll('button.footer-btn, button[class*="submit"]');
    
    logger(`🔍 Found ${buttons.length} footer buttons`);

    for (const btn of buttons) {
      if (btn.textContent.includes('Submit') && btn.offsetParent !== null) {
        logger('✅ Found Submit button');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked Submit button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Submit button not found');
    return false;
  },

  async clickBuyNowButton(logger) {
    logger('🔍 Looking for Buy Now button...');

    const buttons = document.querySelectorAll('button.buy-now-btn, button[class*="buy"]');
    
    logger(`🔍 Found ${buttons.length} buy buttons`);

    for (const btn of buttons) {
      if (btn.textContent.includes('Buy Now') && btn.offsetParent !== null) {
        logger('✅ Found Buy Now button');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked Buy Now button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Buy Now button not found');
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

// Make ICICIPremium available globally
window.ICICIPremium = ICICIPremium;
