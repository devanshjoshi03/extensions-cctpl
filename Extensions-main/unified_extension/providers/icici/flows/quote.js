/**
 * ICICI Lombard Insurance Quote Flow
 * Handles quote page interactions on https://nysa.icicilombard.com/NysaMotor/quote
 * Clicks on the sidebar open button
 */

const ICICIQuote = {
  async run(payload, logger = console.log) {
    const pauseAt = async (label) => window.AutomationPauseController?.checkpoint(label);
    const pauseAwareWait = async (ms) => {
      const waitFn = window.flowUtils?.controlledWait || window.flowUtils?.wait;
      if (waitFn) return waitFn(ms);
      return new Promise((resolve) => setTimeout(resolve, ms));
    };
    logger('🚀 Starting ICICI Lombard quote flow...');
    logger('Current URL:', window.location.href);

    try {
      // Check if on quote page
      if (!window.location.href.includes('/NysaMotor/quote')) {
        logger('⚠️ Not on quote page');
        return { success: false, error: 'Not on quote page' };
      }

      logger('✅ On quote page');

      // Wait for quote page to fully load
      await pauseAt('Quote -> Load');
      await this.waitForQuotePageLoad(logger);

      // Find and click the sidebar open button
      await pauseAt('Quote -> Open sidebar');
      let clicked = await this.clickSidebarButton(logger);
      
      if (!clicked) {
        logger('❌ Failed to click sidebar button');
        return { success: false, error: 'Sidebar button not found' };
      }

      // Wait for sidebar to open
      await pauseAwareWait(1500);

      // Find and click the Package link
      await pauseAt('Quote -> Package');
      clicked = await this.clickPackageLink(logger);
      
      if (!clicked) {
        logger('❌ Failed to click Package link');
        return { success: false, error: 'Package link not found' };
      }

      // Find and click the "New Business" radio button
      await pauseAt('Quote -> New Business');
      clicked = await this.selectNewBusinessPolicy(logger);
      
      if (!clicked) {
        logger('❌ Failed to select New Business policy');
        return { success: false, error: 'New Business radio button not found' };
      }

      // Fill city field and select from dropdown
      await pauseAt('Quote -> RTO city');
      let filled = await this.fillCityField(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill city field');
      }

      // Fill Select make & model field (model + variant) and select from dropdown
      await pauseAt('Quote -> Make and model');
      filled = await this.fillMakeModelField(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill make & model field');
      }

      // Click Get Quote button
      await pauseAt('Quote -> Get Quote');
      clicked = await this.clickGetQuoteButton(logger);
      
      if (!clicked) {
        logger('⚠️ Failed to click Get Quote button');
      }

      logger('✅ Quote flow completed successfully');
      return { success: true };

    } catch (err) {
      logger('❌ Quote flow error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async waitForQuotePageLoad(logger) {
    logger('⏳ Waiting for quote page to fully load...');
    
    const timeout = 10000;
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        // Look for sidebar button or quote page elements
        const sidebarBtn = document.querySelector('button[onclick="openSidebar()"], .nysa_openbtn');
        const pageIndicators = document.querySelectorAll('[class*="quote"], [class*="motor"], form');
        
        if (sidebarBtn || pageIndicators.length > 0) {
          logger(`✅ Quote page loaded`);
          return resolve(true);
        }

        if (Date.now() - start > timeout) {
          logger('⚠️ Quote page load timeout, but continuing...');
          return resolve(false);
        }

        setTimeout(check, 300);
      };

      check();
    });
  },

  async clickSidebarButton(logger) {
    logger('🔍 Looking for sidebar open button...');

    // Strategy 1: Find by onclick attribute and class
    let button = document.querySelector('button[onclick="openSidebar()"].nysa_openbtn');
    
    if (button && button.offsetParent !== null) {
      logger('✅ Found sidebar button by selector');
      highlightElement(button, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(button);
      
      logger('✅ Clicked on sidebar open button');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    // Strategy 2: Find by onclick attribute only
    const allButtons = document.querySelectorAll('button[onclick*="openSidebar"]');
    
    logger(`🔍 Found ${allButtons.length} buttons with openSidebar onclick`);

    for (const btn of allButtons) {
      if (btn.offsetParent !== null) {
        logger('✅ Found sidebar button by onclick attribute');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked on sidebar open button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 3: Find by class
    const classBtns = document.querySelectorAll('.nysa_openbtn');
    
    logger(`🔍 Found ${classBtns.length} nysa_openbtn buttons`);

    for (const btn of classBtns) {
      if (btn.offsetParent !== null && btn.tagName === 'BUTTON') {
        logger('✅ Found sidebar button by class');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked on sidebar open button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 4: Find by aria-label or title
    const accessibleBtns = document.querySelectorAll('button[aria-label*="sidebar"], button[aria-label*="menu"], button[title*="sidebar"], button[title*="menu"]');
    
    logger(`🔍 Found ${accessibleBtns.length} accessible sidebar buttons`);

    for (const btn of accessibleBtns) {
      if (btn.offsetParent !== null) {
        logger('✅ Found sidebar button by aria-label/title');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked on sidebar open button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Sidebar button not found');
    return false;
  },

  async clickTwoWheelerMenu(logger) {
    logger('🔍 Looking for Two Wheeler menu...');

    // Strategy 1: Find by text content in menu
    const allLinks = document.querySelectorAll('a');
    
    logger(`🔍 Found ${allLinks.length} anchor elements`);

    for (const link of allLinks) {
      const text = link.textContent || '';
      const hasMenuIcon = link.querySelector('[class*="nysa_menu_icon"]');
      const hasMenuText = link.querySelector('[class*="nysa_menu_text"]');
      
      if (text.includes('Two Wheeler') && (hasMenuIcon || hasMenuText)) {
        logger('✅ Found Two Wheeler menu by text content');
        highlightElement(link, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(link);
        
        logger('✅ Clicked on Two Wheeler menu');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 2: Find by specific div structure
    const menuItems = document.querySelectorAll('a div.nysa_menu_text');
    
    logger(`🔍 Found ${menuItems.length} menu text elements`);

    for (const menuText of menuItems) {
      if (menuText.textContent.includes('Two Wheeler')) {
        const menuLink = menuText.closest('a');
        
        if (menuLink && menuLink.offsetParent !== null) {
          logger('✅ Found Two Wheeler menu by div structure');
          highlightElement(menuLink, '#ff9800', 1500);
          
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          clickFn(menuLink);
          
          logger('✅ Clicked on Two Wheeler menu');
          await new Promise(r => setTimeout(r, 1000));
          return true;
        }
      }
    }

    // Strategy 3: Find by image src
    const menuIcons = document.querySelectorAll('img[src*="Twowheeler"], img[src*="2Wheeler"], img[src*="icon-Two"]');
    
    logger(`🔍 Found ${menuIcons.length} Two Wheeler icon images`);

    for (const icon of menuIcons) {
      const menuLink = icon.closest('a');
      
      if (menuLink && menuLink.offsetParent !== null) {
        logger('✅ Found Two Wheeler menu by icon image');
        highlightElement(menuLink, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(menuLink);
        
        logger('✅ Clicked on Two Wheeler menu');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 4: Find parent anchor of menu structure
    const menuContainers = document.querySelectorAll('a[class*="nysa_menu"], a:has(div.nysa_menu_text)');
    
    logger(`🔍 Found ${menuContainers.length} menu containers`);

    for (const container of menuContainers) {
      const text = container.textContent || '';
      
      if (text.includes('Two Wheeler') && container.offsetParent !== null) {
        logger('✅ Found Two Wheeler menu by container');
        highlightElement(container, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(container);
        
        logger('✅ Clicked on Two Wheeler menu');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Two Wheeler menu not found');
    return false;
  },

  async clickPackageLink(logger) {
    logger('🔍 Looking for Package link...');

    // Strategy 1: Find by ID using getElementById (handles IDs starting with numbers)
    let packageLink = document.getElementById('2WRoll');
    
    if (packageLink && packageLink.offsetParent !== null) {
      logger('✅ Found Package link by ID "2WRoll"');
      highlightElement(packageLink, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(packageLink);
      
      logger('✅ Clicked on Package link');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    // Strategy 2: Find by ID using attribute selector
    packageLink = document.querySelector('a[id="2WRoll"]');
    
    if (packageLink && packageLink.offsetParent !== null) {
      logger('✅ Found Package link by attribute selector');
      highlightElement(packageLink, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(packageLink);
      
      logger('✅ Clicked on Package link');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    // Strategy 3: Find by text content "Package"
    const allLinks = document.querySelectorAll('a');
    
    logger(`🔍 Searching ${allLinks.length} links for Package`);

    for (const link of allLinks) {
      const text = link.textContent.trim();
      
      if (text === 'Package' && link.offsetParent !== null) {
        logger('✅ Found Package link by text content');
        highlightElement(link, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(link);
        
        logger('✅ Clicked on Package link');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 4: Find by class or data attribute
    const packageLinks = document.querySelectorAll('a[class*="package"], a[data-type="package"], a[data-value="package"]');
    
    logger(`🔍 Found ${packageLinks.length} package-related links`);

    for (const link of packageLinks) {
      if (link.offsetParent !== null) {
        logger('✅ Found Package link by class/attribute');
        highlightElement(link, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(link);
        
        logger('✅ Clicked on Package link');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    // Strategy 5: Find within menu links section
    const menuLinks = document.querySelectorAll('.nysa_menu_links a, [class*="menu_links"] a');
    
    logger(`🔍 Found ${menuLinks.length} menu link elements`);

    for (const link of menuLinks) {
      const text = link.textContent.trim();
      
      if (text === 'Package' && link.offsetParent !== null) {
        logger('✅ Found Package link in menu links section');
        highlightElement(link, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(link);
        
        logger('✅ Clicked on Package link');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Package link not found');
    return false;
  },

  async selectNewBusinessPolicy(logger) {
    logger('🔍 Looking for "New Business" radio button...');

    // Strategy 1: Find by input value "New Business"
    let radioInput = document.querySelector('input[type="radio"][value="New Business"]');
    
    if (radioInput && radioInput.offsetParent !== null) {
      logger('✅ Found "New Business" radio button by value');
      
      // Click the radio input itself
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(radioInput);
      
      logger('✅ Selected New Business policy');
      await new Promise(r => setTimeout(r, 800));
      return true;
    }

    // Strategy 2: Click the label containing "New"
    const labels = document.querySelectorAll('label.radio, label[class*="radio"]');
    
    logger(`🔍 Found ${labels.length} radio labels`);

    for (const label of labels) {
      const text = label.textContent.trim();
      const input = label.querySelector('input[type="radio"]');
      
      if (text === 'New' && input && input.value === 'New Business') {
        logger('✅ Found "New Business" radio by label text');
        highlightElement(label, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(label);
        
        logger('✅ Selected New Business policy');
        await new Promise(r => setTimeout(r, 800));
        return true;
      }
    }

    // Strategy 3: Find radio input and click parent label
    const allRadios = document.querySelectorAll('input[type="radio"][value="New Business"]');
    
    logger(`🔍 Found ${allRadios.length} radio inputs with "New Business" value`);

    for (const radio of allRadios) {
      const label = radio.closest('label');
      
      if (label && label.offsetParent !== null) {
        logger('✅ Found "New Business" radio, clicking parent label');
        highlightElement(label, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(label);
        
        logger('✅ Selected New Business policy');
        await new Promise(r => setTimeout(r, 800));
        return true;
      }
    }

    // Strategy 4: Find by policyType name attribute
    const policyInputs = document.querySelectorAll('input[name="policyType"]');
    
    logger(`🔍 Found ${policyInputs.length} policyType inputs`);

    for (const input of policyInputs) {
      if (input.value === 'New Business' && input.offsetParent !== null) {
        logger('✅ Found "New Business" by policyType name');
        highlightElement(input, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(input);
        
        logger('✅ Selected New Business policy');
        await new Promise(r => setTimeout(r, 800));
        return true;
      }
    }

    logger('❌ New Business radio button not found');
    return false;
  },

  async fillCityField(payload, logger) {
    logger('🔍 Looking for City/RTO field...');

    const city =
      payload?.vehicleDetails?.rto ||
      payload?.vehicleDetails?.rtoCity ||
      payload?.vehicleDetails?.rtocity ||
      payload?.city ||
      payload?.customerDetails?.city ||
      '';
    
    if (!city) {
      logger('⚠️ No city provided in payload');
      return false;
    }

    logger(`📝 City to enter: ${city}`);

    // Find the city/rto input field
    let cityInput = document.querySelector('input[formcontrolname="rto"]');
    
    if (!cityInput) {
      logger('❌ City field not found');
      return false;
    }

    logger('✅ Found city input field');
    highlightElement(cityInput, '#ff9800', 1500);

    // Click the input to focus
    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    clickFn(cityInput);
    
    await new Promise(r => setTimeout(r, 500));

    // Clear and fill the field slowly
    cityInput.value = '';
    cityInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    
    for (let char of city) {
      cityInput.value += char;
      cityInput.dispatchEvent(new Event('input', { bubbles: true }));
      cityInput.dispatchEvent(new Event('keyup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
    }
    
    // Dispatch additional events to trigger dropdown
    cityInput.dispatchEvent(new Event('change', { bubbles: true }));
    cityInput.dispatchEvent(new Event('blur', { bubbles: true }));
    
    logger(`📝 City field filled with: ${city}`);

    // Wait for autocomplete dropdown to appear with retries
    let dropdownFound = false;
    let options = [];
    
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 800));
      
      // Try multiple dropdown selectors
      options = document.querySelectorAll(
        '.mat-mdc-option, .mat-option, [role="option"], ' +
        '.ng-option, .select2-option, .autocomplete-option, ' +
        'li[role="option"], div[role="option"]'
      );
      
      logger(`🔍 Attempt ${attempt + 1}: Found ${options.length} dropdown options`);
      
      if (options.length > 0) {
        dropdownFound = true;
        break;
      }
    }

    if (!dropdownFound) {
      logger('⚠️ No dropdown options appeared after multiple attempts');
      return true;
    }

    // Try to find and click matching option in dropdown
    const cityUpper = city.toUpperCase();
    const cityLower = city.toLowerCase();
    
    for (const option of options) {
      const text = option.textContent.trim();
      const textUpper = text.toUpperCase();
      const textLower = text.toLowerCase();
      
      // Check for various match patterns
      const matches = 
        textUpper.includes(cityUpper) || 
        textLower.includes(cityLower) ||
        cityUpper.includes(textUpper) ||
        // Handle cases like "MAHARASHTRA-MUMBAI" when searching for "Mumbai"
        textUpper.split('-').some(part => part.includes(cityUpper)) ||
        textUpper.split(' ').some(part => part.includes(cityUpper));
      
      if (matches && option.offsetParent !== null) {
        logger(`✅ Found matching city option: ${text}`);
        
        // Scroll option into view
        option.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 300));
        
        highlightElement(option, '#4caf50', 1500);
        
        // Click the option
        await new Promise(r => setTimeout(r, 200));
        clickFn(option);
        
        logger('✅ Clicked city option from dropdown');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('⚠️ City option not found in dropdown, but field is filled');
    return true;
  },

  buildMakeModelSearchText(make, model, variant) {
    make = (make || '').trim();
    model = (model || '').trim();
    variant = (variant || '').trim();
    if (make && variant) return `${make}-${variant}`;
    if (model && variant) return `${model}-${variant}`;
    if (variant) return variant;
    return make || model;
  },

  tokenizeForMatch(str) {
    return (str || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  },

  normalizeMakeModelText(str) {
    return this.tokenizeForMatch(str).join(' ');
  },

  scoreMakeModelOption(optionText, model, variant, searchText) {
    const textNormalized = this.normalizeMakeModelText(optionText);
    const searchNormalized = this.normalizeMakeModelText(searchText);
    const variantNormalized = this.normalizeMakeModelText(variant);

    if (!textNormalized) return 0;
    if (variantNormalized && textNormalized === variantNormalized) return 1000;
    if (searchNormalized && textNormalized === searchNormalized) return 900;
    return 0;
  },

  async fillMakeModelField(payload, logger) {
    logger('🔍 Looking for Select make & model field...');

    const make = payload?.vehicleDetails?.make || payload?.make || '';
    const model = payload?.vehicleDetails?.model || payload?.model || '';
    const variant = payload?.vehicleDetails?.variant || payload?.variant || '';
    const searchText = this.buildMakeModelSearchText(make, model, variant);

    if (!searchText) {
      logger('⚠️ No make/model or variant provided in payload');
      return false;
    }

    logger(`📝 Make & model to enter: ${searchText} (make: ${make || 'n/a'}, model: ${model || 'n/a'}, variant: ${variant || 'n/a'})`);

    let makeModelInput = document.querySelector('input[formcontrolname="manufacture"]');

    if (!makeModelInput) {
      logger('❌ Make & model field not found');
      return false;
    }

    logger('✅ Found make & model input field');
    highlightElement(makeModelInput, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    clickFn(makeModelInput);

    await new Promise(r => setTimeout(r, 500));

    makeModelInput.value = '';
    makeModelInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));

    for (let char of searchText) {
      makeModelInput.value += char;
      makeModelInput.dispatchEvent(new Event('input', { bubbles: true }));
      makeModelInput.dispatchEvent(new Event('keyup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
    }

    makeModelInput.dispatchEvent(new Event('change', { bubbles: true }));
    makeModelInput.dispatchEvent(new Event('blur', { bubbles: true }));

    logger(`📝 Make & model field filled with: ${searchText}`);

    let dropdownFound = false;
    let options = [];

    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 800));

      options = document.querySelectorAll(
        '.mat-mdc-option, .mat-option, [role="option"], ' +
        '.ng-option, .select2-option, .autocomplete-option, ' +
        'li[role="option"], div[role="option"]'
      );

      logger(`🔍 Attempt ${attempt + 1}: Found ${options.length} dropdown options`);

      if (options.length > 0) {
        dropdownFound = true;
        break;
      }
    }

    if (!dropdownFound) {
      logger('⚠️ No dropdown options appeared after multiple attempts');
      return true;
    }

    const visibleOptions = Array.from(options).filter(o => o.offsetParent !== null);
    const scored = visibleOptions
      .map(option => ({
        option,
        text: option.textContent.trim(),
        score: this.scoreMakeModelOption(
          option.textContent.trim(),
          model,
          variant,
          searchText
        )
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    logger(`🔍 Matching make & model options: ${scored.slice(0, 5).map(entry => `${entry.score}:${entry.text}`).join(' | ') || 'none'}`);

    if (scored.length > 0) {
      const best = scored[0];
      logger(`✅ Found exact make & model option: ${best.text}`);

      best.option.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 300));

      highlightElement(best.option, '#4caf50', 1500);

      await new Promise(r => setTimeout(r, 200));
      clickFn(best.option);

      logger('✅ Clicked make & model option from dropdown');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    logger(`❌ Exact make & model option not found. Expected exactly: ${variant || searchText}`);
    return false;
  },

  async clickGetQuoteButton(logger) {
    logger('🔍 Looking for Get Quote button...');

    // Strategy 1: Find by class
    let button = document.querySelector('button.btn-recalculate');
    
    if (button && button.offsetParent !== null) {
      logger('✅ Found Get Quote button by class');
      highlightElement(button, '#ff9800', 1500);
      
      const utils = window.flowUtils || {};
      const clickFn = utils.clickElement || clickElement;
      clickFn(button);
      
      logger('✅ Clicked Get Quote button');
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }

    // Strategy 2: Find by text content
    const allButtons = document.querySelectorAll('button');
    
    logger(`🔍 Found ${allButtons.length} buttons`);

    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      
      if (text === 'Get Quote' && btn.offsetParent !== null) {
        logger('✅ Found Get Quote button by text');
        highlightElement(btn, '#ff9800', 1500);
        
        const utils = window.flowUtils || {};
        const clickFn = utils.clickElement || clickElement;
        clickFn(btn);
        
        logger('✅ Clicked Get Quote button');
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    }

    logger('❌ Get Quote button not found');
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

// Make ICICIQuote available globally
window.ICICIQuote = ICICIQuote;
