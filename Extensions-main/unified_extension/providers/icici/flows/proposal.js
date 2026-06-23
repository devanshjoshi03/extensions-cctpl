/**
 * ICICI Lombard Insurance Proposal Page Flow
 * Handles proposal page interactions on https://nysa.icicilombard.com/NysaMotor/proposal
 */

const ICICIProposal = {
  async run(payload, logger = console.log) {
    logger('🚀 Starting ICICI Lombard proposal flow...');
    logger(`📍 Current URL: ${window.location.href}`);

    if (window.flowUtils?.waitForSpinnerToFinish) {
      await window.flowUtils.waitForSpinnerToFinish(120000, () =>
        logger('⏳ Loading spinner visible — waiting...')
      );
    }

    try {
      // Check if on proposal page
      if (!window.location.href.includes('/NysaMotor/proposal')) {
        logger('⚠️ Not on proposal page');
        return { success: false, error: 'Not on proposal page' };
      }

      logger('✅ On proposal page');

      // Wait for proposal page to fully load
      await this.waitForProposalPageLoad(logger);

      // Fill engine number
      let filled = await this.fillEngineNumber(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill engine number');
      }

      // Fill chassis number
      filled = await this.fillChassisNumber(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill chassis number');
      }

      // Vehicle color fill intentionally skipped
      logger('ℹ️ Skipping vehicle color autofill (disabled)');

      // Check Complete KYC radio button
      let checked = await this.checkCompleteKYCRadio(logger);
      
      if (!checked) {
        logger('⚠️ Failed to check Complete KYC radio button');
      }

      // Wait 2 seconds
      await new Promise(r => setTimeout(r, 2000));

      // Enter PAN number
      filled = await this.fillPANNumber(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill PAN number');
      }

      // Enter DOB
      filled = await this.fillDOB(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill DOB');
      }

      // Click PAN SUBMIT button
      let clicked = await this.clickPANSubmitButton(logger);
      
      if (!clicked) {
        logger('❌ Failed to click PAN SUBMIT button');
        return { success: false, error: 'PAN SUBMIT button not found' };
      }

      // Wait 2 seconds
      await new Promise(r => setTimeout(r, 2000));

      // Attach OVD front image
      const frontAttached = await this.attachOVDFrontImage(payload, logger);
      
      if (!frontAttached) {
        logger('⚠️ Failed to attach OVD front image');
      }

      // Attach OVD back image
      const backAttached = await this.attachOVDBackImage(payload, logger);
      
      if (!backAttached) {
        logger('⚠️ Failed to attach OVD back image');
      }

      // Click upload SUBMIT button
      clicked = await this.clickUploadSubmitButton(logger);
      
      if (!clicked) {
        logger('⚠️ Failed to click upload SUBMIT button');
      }

      // Wait for proceed button to appear and click it
      clicked = await this.waitAndClickProceedButton(logger);
      
      if (!clicked) {
        logger('⚠️ Failed to click proceed button');
      }

      // Select title/gender from mat-select
      let selected = await this.selectGenderTitle(payload, logger);
      
      if (!selected) {
        logger('⚠️ Failed to select gender title');
      }

      // Handle hypothecation if applicable
      const hypothecationHandled = await this.handleHypothecation(payload, logger);
      
      if (!hypothecationHandled) {
        logger('⚠️ Failed to handle hypothecation');
      }

      // Fill mobile number
      filled = await this.fillMobileNumber(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill mobile number');
      }

      // Fill email
      filled = await this.fillEmail(payload, logger);
      
      if (!filled) {
        logger('⚠️ Failed to fill email');
      }

      // Fill address line (building + street) and pincode
      filled = await this.fillAddressLine(payload, logger);
      if (!filled) {
        logger('⚠️ Failed to fill address line');
      }

      filled = await this.fillPincode(payload, logger);
      if (!filled) {
        logger('⚠️ Failed to fill pincode');
      }

      logger('✅ Proposal flow completed successfully');
      return { success: true };

    } catch (err) {
      logger('❌ Proposal flow error:', err.message);
      return { success: false, error: err.message };
    }
  },

  async waitForProposalPageLoad(logger) {
    logger('⏳ Waiting for proposal page to fully load...');
    const utils = window.flowUtils || {};
    if (utils.waitForPageReady) {
      const ok = await utils.waitForPageReady(
        () => {
          const engineInput = document.querySelector('input[formcontrolname="engineNo"]');
          const chassisInput = document.querySelector('input[formcontrolname="chassisNo"]');
          return !!(engineInput || chassisInput);
        },
        {
          timeoutMs: 120000,
          onSpinnerWait: () => logger('⏳ Spinner on screen — waiting...'),
        }
      );
      if (ok) logger('✅ Proposal page loaded');
      else logger('⚠️ Proposal page load timeout, but continuing...');
      return ok;
    }
    return true;
  },

  async fillEngineNumber(payload, logger) {
    logger('🔍 Looking for engine number field...');

    const engineNumber = payload?.vehicleInformation?.engineNumber || payload?.engineNumber || '';
    
    if (!engineNumber) {
      logger('⚠️ No engine number provided in payload');
      return false;
    }

    logger(`📝 Engine number to enter: ${engineNumber}`);

    const input = document.querySelector('input[formcontrolname="engineNo"]');
    
    if (!input) {
      logger('❌ Engine number field not found');
      return false;
    }

    logger('✅ Found engine number field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of engineNumber.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Engine number filled: ${engineNumber}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async fillChassisNumber(payload, logger) {
    logger('🔍 Looking for chassis number field...');

    const chassisNumber = payload?.vehicleInformation?.chassisNumber || payload?.chassisNumber || '';
    
    if (!chassisNumber) {
      logger('⚠️ No chassis number provided in payload');
      return false;
    }

    logger(`📝 Chassis number to enter: ${chassisNumber}`);

    const input = document.querySelector('input[formcontrolname="chassisNo"]');
    
    if (!input) {
      logger('❌ Chassis number field not found');
      return false;
    }

    logger('✅ Found chassis number field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of chassisNumber.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Chassis number filled: ${chassisNumber}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async fillVehicleColor(payload, logger) {
    logger('🔍 Looking for vehicle color field...');

    // Try to get color from payload, default to "black"
    const vehicleColor = payload?.vehicleInformation?.vehicleColor || 
                        payload?.vehicleColor || 
                        'black';
    
    logger(`📝 Vehicle color to enter: ${vehicleColor}`);

    const input = document.querySelector('input[formcontrolname="vehicleColor"]');
    
    if (!input) {
      logger('❌ Vehicle color field not found');
      return false;
    }

    logger('✅ Found vehicle color field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of vehicleColor.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Vehicle color filled: ${vehicleColor}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async checkCompleteKYCRadio(logger) {
    logger('🔍 Looking for Complete KYC radio button...');

    const radios = document.querySelectorAll('input[type="radio"][formcontrolname="kycOption"]');
    
    logger(`🔍 Found ${radios.length} KYC radio buttons`);

    for (const radio of radios) {
      const label = radio.closest('label, div[class*="radio"]');
      
      if (label && label.textContent.includes('Complete KYC')) {
        logger('✅ Found Complete KYC radio button');
        highlightElement(label, '#ff9800', 1500);
        
        if (!radio.checked) {
          const utils = window.flowUtils || {};
          const clickFn = utils.clickElement || clickElement;
          await clickFn(radio);
          
          logger('✅ Checked Complete KYC radio button');
          await new Promise(r => setTimeout(r, 600));
          return true;
        } else {
          logger('✅ Complete KYC radio button already checked');
          return true;
        }
      }
    }

    logger('❌ Complete KYC radio button not found');
    return false;
  },

  async fillPANNumber(payload, logger) {
    logger('🔍 Looking for PAN number field...');

    const panNumber = payload?.customerDetails?.pan || 'BHASD8457D';
    
    logger(`📝 PAN number to enter: ${panNumber}`);

    const input = document.querySelector('#pan_no');
    
    if (!input) {
      logger('❌ PAN number field not found');
      return false;
    }

    logger('✅ Found PAN number field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of panNumber.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 PAN number filled: ${panNumber}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async fillDOB(payload, logger) {
    logger('🔍 Looking for DOB field...');

    const dob = payload?.customerDetails?.dateOfBirth || '';
    
    if (!dob) {
      logger('⚠️ No DOB provided in payload');
      return false;
    }

    logger(`📝 DOB to enter: ${dob}`);

    const input = document.querySelector('#pan_dob');
    
    if (!input) {
      logger('❌ DOB field not found');
      return false;
    }

    logger('✅ Found DOB field');
    highlightElement(input, '#ff9800', 1500);

    // Set value directly using the pattern from the example
    input.value = dob;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    logger(`📝 DOB filled: ${dob}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async clickPANSubmitButton(logger) {
    logger('🔍 Looking for PAN SUBMIT button...');

    const timeout = 15000;
    const start = Date.now();
    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;

    while (Date.now() - start < timeout) {
      if (window.flowUtils?.isSpinnerVisible?.()) {
        await window.flowUtils.waitForSpinnerToFinish();
      }

      let button = document.querySelector('#pan_no_sub_btn');

      if (!button || button.offsetParent === null) {
        button = [...document.querySelectorAll('button')].find((btn) => {
          const text = btn.textContent.trim().toUpperCase();
          return text === 'SUBMIT' && btn.offsetParent !== null;
        });
      }

      if (button && button.offsetParent !== null) {
        logger('✅ Found PAN SUBMIT button');
        highlightElement(button, '#ff9800', 1500);
        await clickFn(button);
        logger('✅ Clicked PAN SUBMIT button');
        await new Promise((r) => setTimeout(r, 1000));
        return true;
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    logger('❌ PAN SUBMIT button not found');
    return false;
  },

  async attachOVDFrontImage(payload, logger) {
    logger('🔍 Looking for OVD front image upload input...');

    const ovdFrontBase64 = payload?.customerDetails?.ovdFrontImage || '';
    
    if (!ovdFrontBase64) {
      logger('⚠️ No OVD front image provided in payload');
      return false;
    }

    logger('✅ OVD front image found in payload');

    const input = document.querySelector('#customFile3');
    
    if (!input) {
      logger('❌ OVD front image upload input not found');
      return false;
    }

    logger('✅ Found OVD front image upload input');
    
    try {
      const file = await this.base64ToFile(ovdFrontBase64, 'ovd_front.jpg', 'image/jpeg');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      logger('✅ Attached OVD front image');
      await new Promise(r => setTimeout(r, 800));
      return true;
    } catch (err) {
      logger('❌ Failed to attach OVD front image:', err.message);
      return false;
    }
  },

  async attachOVDBackImage(payload, logger) {
    logger('🔍 Looking for OVD back image upload input...');

    const ovdBackBase64 = payload?.customerDetails?.ovdBackImage || '';
    
    if (!ovdBackBase64) {
      logger('⚠️ No OVD back image provided in payload');
      return false;
    }

    logger('✅ OVD back image found in payload');

    const input = document.querySelector('#customFile4');
    
    if (!input) {
      logger('❌ OVD back image upload input not found');
      return false;
    }

    logger('✅ Found OVD back image upload input');
    
    try {
      const file = await this.base64ToFile(ovdBackBase64, 'ovd_back.jpg', 'image/jpeg');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      logger('✅ Attached OVD back image');
      await new Promise(r => setTimeout(r, 800));
      return true;
    } catch (err) {
      logger('❌ Failed to attach OVD back image:', err.message);
      return false;
    }
  },

  async base64ToFile(base64String, fileName = 'upload.jpg', mimeType = 'image/jpeg') {
    return new Promise((resolve, reject) => {
      try {
        // Handle base64 with or without data: prefix
        let base64Data = base64String;
        if (base64Data.includes(',')) {
          base64Data = base64Data.split(',')[1];
        }

        // Convert base64 to Uint8Array
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create Blob and File
        const blob = new Blob([bytes], { type: mimeType });
        const file = new File([blob], fileName, { type: mimeType });
        
        resolve(file);
      } catch (err) {
        reject(new Error('Failed to convert base64 to file: ' + err.message));
      }
    });
  },

  async clickUploadSubmitButton(logger) {
    logger('🔍 Looking for upload SUBMIT button...');

    const timeout = 10000;
    const start = Date.now();
    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;

    return new Promise((resolve) => {
      const check = async () => {
        // Try to find by ID first
        let button = document.querySelector('#upload_sub_btn');
        
        if (button) {
          logger('✅ Found upload SUBMIT button');
          
          // Scroll into view and ensure it's visible
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 300));
          
          highlightElement(button, '#ff9800', 1500);
          
          await clickFn(button);
          logger('✅ Clicked upload SUBMIT button');
          return resolve(true);
        }

        if (Date.now() - start > timeout) {
          logger('⚠️ Upload SUBMIT button timeout after 10 seconds, but continuing...');
          return resolve(false);
        }

        setTimeout(check, 500);
      };

      check();
    });
  },

  async selectGenderTitle(payload, logger) {
    logger('🔍 Looking for title mat-select...');

    const titleRaw = payload?.customerDetails?.title || payload?.title || '';
    const title = titleRaw.toString().trim();

    if (!title) {
      logger('⚠️ No title provided in payload');
      return false;
    }

    // Normalize title for matching (case-insensitive, remove dots)
    const titleKey = title.toLowerCase().replace(/\./g, '').trim();
    // Map common variants: 'miss' -> 'ms'
    const titleMatchKey = titleKey === 'miss' ? 'ms' : titleKey;

    logger(`📝 Title to select: ${title} (matching target: ${titleMatchKey})`);

    // Wait for mat-select to appear with retries
    const timeout = 10000;
    const start = Date.now();
    let select = null;

    while (Date.now() - start < timeout) {
      select = document.querySelector('mat-select[formcontrolname="title"]');
      
      if (select) {
        logger('✅ Found title mat-select');
        break;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!select) {
      logger('❌ Title mat-select not found after timeout');
      return false;
    }

    logger('✅ Found title mat-select');
    highlightElement(select, '#ff9800', 1500);

    // Open dropdown using trigger
    const trigger = select.querySelector('.mat-mdc-select-trigger');
    trigger.click();

    await new Promise(r => setTimeout(r, 800));

    // Search entire body for matching option text
    const allElements = [...document.body.querySelectorAll('*')];
    const match = allElements.find((el) => {
      if (el.children.length !== 0) return false;
      const txt = el.textContent.trim().toLowerCase().replace(/\./g, '').trim();
      return txt === titleMatchKey;
    });

    if (match) {
      const option = match.closest('mat-option') || match.closest('[role="option"]') || match;
      logger(`✅ Found matching option: ${match.textContent.trim()}`);
      highlightElement(option, '#ff9800', 1500);
      option.click();
      logger('✅ Selected title');
      await new Promise(r => setTimeout(r, 500));
      return true;
    }

    logger(`❌ No matching option found for title: ${title}`);
    return false;
  },

  async waitAndClickProceedButton(logger) {
    logger('⏳ Waiting for proceed button to appear...');
    
    const timeout = 20000;
    const start = Date.now();
    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;

    return new Promise((resolve) => {
      const check = async () => {
        const proceedBtn = document.querySelector('#arya_proceed_btn');
        
        if (proceedBtn && proceedBtn.offsetParent !== null) {
          logger('✅ Found proceed button');
          highlightElement(proceedBtn, '#ff9800', 1500);
          
          await clickFn(proceedBtn);
          logger('✅ Clicked proceed button');
          return resolve(true);
        }

        if (Date.now() - start > timeout) {
          logger('⚠️ Proceed button timeout after 20 seconds');
          return resolve(false);
        }

        setTimeout(check, 500);
      };

      check();
    });
  },

  async fillMobileNumber(payload, logger) {
    logger('🔍 Looking for mobile number field...');

    const mobile = payload?.customerDetails?.mobile || '';
    
    if (!mobile) {
      logger('⚠️ No mobile number provided in payload');
      return false;
    }

    logger(`📝 Mobile to enter: ${mobile}`);

    // Wait for mobile input to appear with retries
    const timeout = 10000;
    const start = Date.now();
    let input = null;

    while (Date.now() - start < timeout) {
      input = document.querySelector('input[formcontrolname="mobile"]');
      
      if (input) {
        logger('✅ Found mobile number field');
        break;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!input) {
      logger('❌ Mobile number field not found after timeout');
      return false;
    }

    logger('✅ Found mobile number field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of mobile.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Mobile number filled: ${mobile}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async fillEmail(payload, logger) {
    logger('🔍 Looking for email field...');

    const email = 'otpcoverscrafter@gmail.com';

    logger(`📝 Email to enter: ${email}`);

    // Wait for email input to appear with retries
    const timeout = 10000;
    const start = Date.now();
    let input = null;

    while (Date.now() - start < timeout) {
      input = document.querySelector('input[formcontrolname="email"]');
      
      if (input) {
        logger('✅ Found email field');
        break;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!input) {
      logger('❌ Email field not found after timeout');
      return false;
    }

    logger('✅ Found email field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of email.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Email filled: ${email}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
  },

  async fillFormControlField(formControlName, value, label, logger) {
    if (!value) {
      logger(`⚠️ No value for ${label}`);
      return false;
    }

    logger(`🔍 Looking for ${label} field...`);
    logger(`📝 ${label} to enter: ${value}`);

    const timeout = 10000;
    const start = Date.now();
    let input = null;

    while (Date.now() - start < timeout) {
      if (window.flowUtils?.isSpinnerVisible?.()) {
        await window.flowUtils.waitForSpinnerToFinish();
      }
      input = document.querySelector(`input[formcontrolname="${formControlName}"]`);
      if (input) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!input) {
      logger(`❌ ${label} field not found after timeout`);
      return false;
    }

    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    await new Promise((r) => setTimeout(r, 300));

    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    for (const char of String(value)) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    logger(`📝 ${label} filled: ${value}`);
    await new Promise((r) => setTimeout(r, 500));

    return true;
  },

  async fillAddressLine(payload, logger) {
    const addr = payload?.customerDetails?.address || {};
    const building = (addr.building || '').trim();
    const street = (addr.street || '').trim();
    const addressLine = [building, street].filter(Boolean).join(', ').trim();

    if (!addressLine) {
      logger('⚠️ No address.building/street in payload');
      return false;
    }

    return this.fillFormControlField('addressLine', addressLine, 'Address Line', logger);
  },

  async fillPincode(payload, logger) {
    const pincode =
      (payload?.customerDetails?.pincode || payload?.customerDetails?.address?.pincode || '')
        .toString()
        .trim();

    if (!pincode) {
      logger('⚠️ No pincode in customerDetails');
      return false;
    }

    return this.fillFormControlField('pincode', pincode, 'Pincode', logger);
  },

  async handleHypothecation(payload, logger) {
    const isHypothecated = payload?.hypothecation?.isHypothecated || false;
    
    if (!isHypothecated) {
      logger('⏭️ Skipping hypothecation (isHypothecated: false)');
      return true;
    }

    logger('✅ Hypothecation required, processing...');

    const financierName = (payload?.hypothecation?.financierName || '')
      .replace(/\./g, '')
      .trim();

    if (!financierName) {
      logger('⚠️ No financier name provided in payload');
      return false;
    }

    logger(`📝 Financier name to enter: ${financierName}`);

    // Wait for hypothecation checkbox to appear
    const timeout = 10000;
    const start = Date.now();
    let checkbox = null;

    while (Date.now() - start < timeout) {
      // Find checkbox by label text
      const labels = [...document.querySelectorAll('label')];
      const targetLabel = labels.find(l => l.textContent.includes('Loan / Lease / Hypothecation Details'));
      
      if (targetLabel) {
        checkbox = targetLabel.querySelector('input[type="checkbox"]');
        if (checkbox) {
          logger('✅ Found hypothecation checkbox');
          break;
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!checkbox) {
      logger('❌ Hypothecation checkbox not found after timeout');
      return false;
    }

    // Check the checkbox if not already checked
    if (!checkbox.checked) {
      highlightElement(checkbox, '#ff9800', 1500);
      checkbox.click();
      logger('✅ Checked hypothecation checkbox');
      await new Promise(r => setTimeout(r, 500));
    } else {
      logger('✅ Hypothecation checkbox already checked');
    }

    // Select the Loan/Hypothecation radio button (not Lease)
    const allRadioButtons = document.querySelectorAll('input[type="radio"]');
    
    let targetRadio = null;
    for (const radio of allRadioButtons) {
      const label = document.querySelector(`label[for="${radio.id}"]`);
      if (label && label.textContent.includes('Loan') && label.textContent.includes('Hypothecation') && !label.textContent.includes('Lease')) {
        targetRadio = radio;
        break;
      }
    }

    if (!targetRadio) {
      logger('❌ Loan/Hypothecation radio button not found');
      return false;
    }

    if (!targetRadio.checked) {
      highlightElement(targetRadio, '#ff9800', 1500);
      targetRadio.click();
      logger('✅ Selected Loan/Hypothecation radio button');
      await new Promise(r => setTimeout(r, 500));
    } else {
      logger('✅ Loan/Hypothecation radio button already selected');
    }

    // Fill financier name
    const financierInput = document.querySelector('input[formcontrolname="financierName"]');
    
    if (!financierInput) {
      logger('❌ Financier name input not found');
      return false;
    }

    logger('✅ Found financier name input');
    highlightElement(financierInput, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(financierInput);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    financierInput.value = '';
    financierInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of financierName.toString()) {
      financierInput.value += char;
      financierInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    financierInput.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Financier name filled: ${financierName}`);
    await new Promise(r => setTimeout(r, 500));

    // Fill financier branch
    const branchFilled = await this.fillFinancierBranch(payload, logger);
    
    if (!branchFilled) {
      logger('⚠️ Failed to fill financier branch');
    }
    
    return true;
  },

  async fillFinancierBranch(payload, logger) {
    logger('🔍 Looking for financier branch field...');

    const financierBranch = payload?.hypothecation?.financierBranch || 
                           payload?.hypothecation?.financierAddress || '';
    
    if (!financierBranch) {
      logger('⚠️ No financier branch provided in payload');
      return false;
    }

    logger(`📝 Financier branch to enter: ${financierBranch}`);

    // Wait for branch input to appear with retries
    const timeout = 10000;
    const start = Date.now();
    let input = null;

    while (Date.now() - start < timeout) {
      input = document.querySelector('input[formcontrolname="financierBranch"]');
      
      if (input) {
        logger('✅ Found financier branch field');
        break;
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    if (!input) {
      logger('❌ Financier branch field not found after timeout');
      return false;
    }

    logger('✅ Found financier branch field');
    highlightElement(input, '#ff9800', 1500);

    const utils = window.flowUtils || {};
    const clickFn = utils.clickElement || clickElement;
    await clickFn(input);
    
    await new Promise(r => setTimeout(r, 300));

    // Clear and fill
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Slow type
    for (let char of financierBranch.toString()) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
    logger(`📝 Financier branch filled: ${financierBranch}`);
    await new Promise(r => setTimeout(r, 500));
    
    return true;
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

async function clickElement(el) {
  if (window.flowUtils?.clickElement) return window.flowUtils.clickElement(el);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
  el.click();
  return true;
}

// Make ICICIProposal available globally
window.ICICIProposal = ICICIProposal;



