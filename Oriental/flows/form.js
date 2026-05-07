/**
 * Oriental Insurance Extension - Form Fill Flow (Sections A, B, C)
 */
const OrientalForm = {
  async fillSectionA(formData, scope, logger = console.log) {
    const v = formData.vehicleDetails || {};
    // vehicle information
    const vi = formData.vehicleInformation || {};
    const root = scope || document;

    await AutomationPauseController.checkpoint('Section A → RTO Location');

    // const dropdown = root.querySelector('.p-dropdown-trigger');
    // if (dropdown) {
    //   clickElement(dropdown);
    //   await wait(500);
    // }
    // RTO first
    const rtoInput = root.querySelector('#cityOfRegistration input') || root.querySelector('input[name="cityOfRegistration"]') || qs(ORIENTAL_SELECTORS.rtoInput, root);
    if (rtoInput && v.rtoLocation) {
      await selectPrimeDropdown("#cityOfRegistration", v.rto?.searchText || v.rtoLocation);
      await wait(500);
      await waitForButtonEnabled('Continue', 15000, root);
      await wait(500);
    } else {
      throw new Error("RTO not found");
    }

     // Click Continue first to reveal the form section
     await this.clickContinue(root);
     await wait(100);

    await AutomationPauseController.checkpoint('Section A → Fuel Type');
    // Then fuel type - click dropdown before selecting
    // Support multiple fuel types: petrol, diesel, electric, battery, cng, lpg, etc.
    const fuelTypeValue = v.fuelType?.searchText || v.fuelTypeLocation || v.fuelType || 'Petrol';
    await selectPrimeDropdown("#fuelTypeNew", fuelTypeValue, false); // loose match instead of exact
    await wait(1000);
     // Click Continue first to reveal the form section
   this.clickContinue(root);
    await wait(1000);

    await AutomationPauseController.checkpoint('Section A → Brand / Model / Variant');
    const fillBrandModelVariant = async () => {
      const brandSearch = v.vehicleBrandModelVariant?.searchText || (v.make && v.model ? `${v.make} ${v.model} ${v.variant || ''}`.trim() : '');
      console.log('brandSearch', brandSearch);
      await selectPrimeAutocomplete(ORIENTAL_SELECTORS.vehicalBrandModelVariantInput, brandSearch);
      
      // Wait for Continue to be enabled, then click to reveal engine/chassis slide
      await waitForButtonEnabled('Continue', 35000, root);
      await this.clickContinue(root);
      await wait(1000);
    }
    await fillBrandModelVariant();

    await AutomationPauseController.checkpoint('Section A → Engine & Chassis Numbers');
    // Wait for slide to load and engine input to appear
    const engineInput = await waitForElement('#engineNumber', { timeoutMs: 15000, root });
    if (engineInput && vi.engineNumber) {
      console.log('Filling engine number', vi.engineNumber);
      fillInput(engineInput, vi.engineNumber);
    } else {
      console.log("Skipping engine number", engineInput ? '(no data)' : '(input not found)');
    }

    const chassisInput = await waitForElement('#chassisNumber', { timeoutMs: 15000, root });
    if (chassisInput && vi.chassisNumber) {
      console.log('Filling chassis number', vi.chassisNumber);
      await wait(300);
      fillInput(chassisInput, vi.chassisNumber);
    } else {
      console.log("Skipping chassis number", chassisInput ? '(no data)' : '(input not found)');
    }
 
    



    await wait(300);
    // Click Continue first to reveal the form section
    await this.clickContinue(root); 

    await wait(1000);
    await AutomationPauseController.checkpoint('Section A → Seating & Cubic Capacity');
    // fill seating capacity
    if(v.seatingCapacity){
      const seatingCapacityInput = await waitForElement("#seatingCapacity");
      if (seatingCapacityInput) fillInput(seatingCapacityInput, v.seatingCapacity);
    }else{
      console.log("Skipping seating capacity");
    }
    // fill cc
    if(v.cubicCapacity){
      const ccInput = await waitForElement("#cubicCapacity", 15000, root);
      if (ccInput) fillInput(ccInput, v.cubicCapacity);
    }else{
      console.log("Skipping cubic capacity");
    }
    // Click Continue first to reveal the form section
    await this.clickContinue(root);

    await wait(300);
    await AutomationPauseController.checkpoint('Section A → Valid PUC');
    // select puc yes or no
    const pucInput = await waitForElement('input[name="validPuc"][value="true"]', 15000, root);
    if (pucInput) clickElement(pucInput);

    // click on continue button
    await this.clickContinue(root);
  },

  async fillSectionB(formData, scope, logger = console.log) {
    const a = formData.additionalDetails || {};
    const root = scope || document;
    const v = formData.vehicleDetails || {};
    const vi = formData.vehicleInformation || {};
    const h = formData.hypothecation || {};

    await AutomationPauseController.checkpoint('Section B → Registration Date & Year');
    // fill date of purchase
    if(v.registrationDate){
      const registrationDateInput = await waitForElement('input[placeholder="DD-MM-YYYY"]', { timeoutMs: 15000, root: root });
      // if (registrationDateInput)
         await fillMuiDate('input[placeholder="DD-MM-YYYY"]', v.registrationDate);
    }else{
      console.log("Skipping date of purchase");
    }
    // select year of manufacture
    if(vi.yearOfManufacture){
      const yearOfManufactureInput = await waitForElement('input[name="yearOfManufacture"]', { timeoutMs: 15000, root: root });
      // if (yearOfManufactureInput) 
        await selectYearOfManufacture(vi.yearOfManufacture, vi.registrationDate);
    }else{
      console.log("Skipping year of manufacture");
    }
    
    // Click Continue first to reveal the form section
    await this.clickContinue(root);

    await AutomationPauseController.checkpoint('Section B → NCB Claim');
    const previousPolicyNcbClaimFlagInput = await waitForElement('input[name="previousPolicyNcbClaimFlag"][value="false"]', { timeoutMs: 15000, root: root });
    if (previousPolicyNcbClaimFlagInput) clickElement(previousPolicyNcbClaimFlagInput);
    await wait(500);
    // Click Continue first to reveal the form section
    await this.clickContinue(root);
    await AutomationPauseController.checkpoint('Section B → Hypothecation');
    if(h.isHypothecated){
    await selectHypothecationByText(h.financierType);
    // fill financier name
    if(h.financierName){
      const financierNameInput = await waitForElement('input[name="nameOfCompany"]', { timeoutMs: 15000, root: root });
      if (financierNameInput) fillInput(financierNameInput, h?.financierName);
    }else{
      console.log("Skipping financier name");
    }
    if(h.financierAddress){
      const financierAddressInput = await waitForElement('input[name="addressOfCompany"]', { timeoutMs: 15000, root: root });
      if (financierAddressInput) fillInput(financierAddressInput, h.financierAddress);
    }else{
      console.log("Skipping financier address");
    }
    }else{
      console.log("Skipping hypothecation");
    }
    await wait(500);
    await this.clickContinue(root);
    return true;
  },

  async fillSectionC(formData, scope, logger = console.log) {
    const p = formData.planDetails || {};
    const v = formData.vehicleDetails || {};
    const c = formData.covers || {};
    const root = scope || document;

    // Use defaults: nilDepreciation is true by default unless explicitly set to false
    const shouldAddNilDep = c.nilDepreciation !== undefined ? c.nilDepreciation : ORIENTAL_DEFAULT_VALUES.nilDepreciation;

    await AutomationPauseController.checkpoint('Section C → Plan Selection');
    // bundle by default 
    const plans = document.querySelectorAll('.choose-plan');

const targetPlan = [...plans].find(plan =>
  plan.querySelector('h4')?.textContent.includes(ORIENTAL_DEFAULT_VALUES.plan)
);

if(targetPlan) targetPlan.click(); // if you want to click it

    await wait(500);
  // click on continue button
      await this.clickContinue(root);
    await AutomationPauseController.checkpoint('Section C → IDV Slider');
    // fill idv
    if(v.idv){
      const value = v.idv;

const slider = document.querySelector('input[name="idv-range-slider"]');

// use native setter so React accepts the value
const nativeSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
).set;

slider.focus();

// start drag
slider.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

// set value correctly
nativeSetter.call(slider, value);

// move slider
slider.dispatchEvent(new Event("input", { bubbles: true }));

// finish drag
slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

// trigger framework update + API
slider.dispatchEvent(new Event("change", { bubbles: true }));

slider.blur();

    // Wait for premium recalculation after IDV slider change
    await wait(1500);
    await waitForSkeletonsToDisappear(30000);
    console.log('Skeletons cleared after IDV slider change');
    await wait(1000);
    }else{
      console.log("Skipping idv");
    }

    // Scroll to bottom so Continue button is visible
    scrollToBottom();
    await wait(1000);

    // click on continue button after IDV
    const idvContinueClicked = await this.clickContinue(root);
    console.log('IDV Continue clicked:', idvContinueClicked);

    // If clickContinue failed, try direct button search as fallback
    if (!idvContinueClicked) {
      console.log('⚠️ IDV Continue failed, trying direct button search...');
      await wait(1000);
      const directBtn = await waitForContinueButton(15000);
      if (directBtn) {
        directBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(500);
        clickElement(directBtn);
        console.log('✅ Clicked Continue (direct fallback) after IDV');
        await waitForSkeletonsToDisappear(15000);
        await wait(1000);
      } else {
        console.log('❌ Could not find Continue button after IDV at all');
      }
    }

    await wait(1000);
    await AutomationPauseController.checkpoint('Section C → Add-ons & NDP');
    
    // Process addons sequentially to avoid race conditions
    // Order: Nil Depreciation first, then Return to Invoice
    const shouldAddRti = c.returnToInvoice === true;
    
    // Track which addons have been processed
    let nilDepProcessed = false;
    let rtiProcessed = false;
    
    // Select Nil Depreciation addon first (if enabled)
    if (shouldAddNilDep) {
      console.log('📍 Processing Nil Depreciation addon...');
      const addonOpened = await selectAddon("Nil Depreciation");
      nilDepProcessed = addonOpened;

      // Search on DOCUMENT, not root — the PrimeNG dialog is a body-level overlay
      let ndpInput = null;
      if (addonOpened) {
        // Try multiple selectors for the NDP input inside the dialog
        const ndpSelectors = [
          '.p-dialog input[aria-valuemax="40.0"]',
          '.p-dialog .p-inputnumber-input',
          '.p-dialog input[role="spinbutton"]',
          '.p-dialog input[inputmode="numeric"]',
          '.p-dialog input.p-inputtext'
        ];
        const inputStart = Date.now();
        while (Date.now() - inputStart < 10000) {
          for (const sel of ndpSelectors) {
            ndpInput = document.querySelector(sel);
            if (ndpInput) break;
          }
          if (ndpInput) break;
          await wait(300);
        }
      }

if(ndpInput){
  console.log('✅ NDP input found:', ndpInput.tagName, ndpInput.className);

  const ndpValue = ORIENTAL_DEFAULT_VALUES.ndpDiscount;
  const valueStr = String(ndpValue);

  // PrimeNG InputNumber ignores native setter — must simulate real typing

  // Step 1: Focus and click the input
  ndpInput.focus();
  ndpInput.click();
  await wait(300);

  // Step 2: Select all existing text with Ctrl+A
  ndpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, bubbles: true }));
  ndpInput.select();
  await wait(100);

  // Step 3: Delete selected text with Backspace
  ndpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true }));
  ndpInput.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
  ndpInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', bubbles: true }));
  await wait(200);

  // Step 4: Type each digit one by one
  for (const char of valueStr) {
    ndpInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: 'Digit' + char, keyCode: char.charCodeAt(0), bubbles: true }));
    ndpInput.dispatchEvent(new KeyboardEvent('keypress', { key: char, code: 'Digit' + char, keyCode: char.charCodeAt(0), bubbles: true }));
    ndpInput.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
    ndpInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: 'Digit' + char, keyCode: char.charCodeAt(0), bubbles: true }));
    await wait(150);
  }

  await wait(300);

  // Step 5: Blur to commit (PrimeNG InputNumber formats on blur)
  ndpInput.dispatchEvent(new Event('change', { bubbles: true }));
  ndpInput.blur();
  ndpInput.dispatchEvent(new Event('blur', { bubbles: true }));
  await wait(500);

  console.log('NDP Discount typed:', valueStr, '| Input value now:', ndpInput.value);

  // Step 6: Click Submit button inside the NDP dialog
  await wait(300);
  const dialogSubmit = document.querySelector('.p-dialog button.addNew-btn');
  if (dialogSubmit) {
    dialogSubmit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(300);
    dialogSubmit.click();
    console.log('✅ Clicked Submit inside NDP dialog');
  } else {
    console.log('⚠️ Submit button (addNew-btn) not found in dialog');
    // Try any button in dialog as fallback
    const anyBtn = document.querySelector('.p-dialog-content button');
    if (anyBtn) {
      anyBtn.click();
      console.log('✅ Clicked fallback button in dialog');
    }
  }

  // Wait for the NDP dialog to close
  await waitForDialogToClose(10000);
  console.log('NDP dialog closed');

  // Wait for UI and API to settle
  await wait(500);

  // Wait for skeleton loaders to disappear
  await waitForSkeletonsToDisappear(15000);
  console.log('Skeletons cleared after NDP Submit');

  await wait(300);

  // DON'T click Continue yet - we need to process Return to Invoice first!
  // Just scroll to bottom to ensure addons are visible
  scrollToBottom();
  await wait(300);
} else {
  console.log('⚠️ NDP input not found, skipping discount');
  // Close any open dialog but DON'T click Continue yet
  const closeBtn = document.querySelector('.p-dialog .p-dialog-header-close');
  if (closeBtn) clickElement(closeBtn);
  await wait(300);
  scrollToBottom();
  await wait(200);
}

    // Process Return to Invoice addon AFTER Nil Depreciation (sequential, no race condition)
    if (shouldAddRti) {
      console.log('📍 Processing Return to Invoice addon...');
      // Wait a bit for UI to stabilize after previous addon
      await wait(300);
      
      const rtiAddonOpened = await selectAddon("Return to Invoice");
      rtiProcessed = rtiAddonOpened;
      
      if (rtiAddonOpened) {
        console.log('✅ Return to Invoice dialog opened');
        // Wait for dialog, then submit (RTI doesn't need input value, just selection)
        await wait(200);
        
        // Click Submit/Continue in the RTI dialog
        const dialogSubmit = document.querySelector('.p-dialog button.addNew-btn');
        if (dialogSubmit) {
          dialogSubmit.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await wait(100);
          dialogSubmit.click();
          console.log('✅ Clicked Submit inside RTI dialog');
        } else {
          // Try any button in dialog as fallback
          const anyBtn = document.querySelector('.p-dialog-content button');
          if (anyBtn) {
            anyBtn.click();
            console.log('✅ Clicked fallback button in RTI dialog');
          }
        }

        // Wait for the RTI dialog to close
        // await waitForDialogToClose(5000);
        console.log('RTI dialog closed');

        // Minimal wait for UI to settle (RTI doesn't recalculate premium like NDP)
        await wait(200);
        // Skip skeleton wait for RTI - it's just a selection, no API recalculation
        console.log('RTI processed, moving to Continue');
      } else {
        console.log('⚠️ Return to Invoice addon not opened or already added');
      }
    } else {
      console.log('ℹ️ Return to Invoice not requested, skipping');
    }
    scrollToBottom();
    await wait(200);
    
    const continueAfterAddons = await waitForContinueButton(5000);
    if (continueAfterAddons) {
      continueAfterAddons.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(200);
      clickElement(continueAfterAddons);
      console.log('✅ Clicked Continue after all addons');
      await waitForSkeletonsToDisappear(10000);
      await wait(300);
    } else {
      console.log('⚠️ Continue button not found, falling back');
      await this.clickContinue(root);
    }

    }else{
      console.log("Skipping nil depreciation");
      // DON'T click Continue yet - check for Return to Invoice first
      
      // Still check for Return to Invoice even if Nil Dep is false
      if (shouldAddRti) {
        console.log('📍 Processing Return to Invoice addon (Nil Dep was skipped)...');
        await wait(300);
        
        const rtiAddonOpened = await selectAddon("Return to Invoice");
        rtiProcessed = rtiAddonOpened;
        
        if (rtiAddonOpened) {
          await wait(200);
          const dialogSubmit = document.querySelector('.p-dialog button.addNew-btn');
          if (dialogSubmit) {
            dialogSubmit.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(100);
            dialogSubmit.click();
            console.log('✅ Clicked Submit inside RTI dialog');
          } else {
            const anyBtn = document.querySelector('.p-dialog-content button');
            if (anyBtn) {
              anyBtn.click();
              console.log('✅ Clicked fallback button in RTI dialog');
            }
          }

          await waitForDialogToClose(5000);
          console.log('RTI dialog closed');
          await wait(200);
          // Skip skeleton wait for RTI - it's just a selection, no API recalculation
          console.log('RTI processed, moving to Continue');
        }
      }
      
      // NOW click Continue after processing RTI (or skipping both)
      // await wait(300);
      scrollToBottom();
      // await wait(200);
      
      const continueAfterAddons = await waitForContinueButton(5000);
      if (continueAfterAddons) {
        continueAfterAddons.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(200);
        clickElement(continueAfterAddons);
        console.log('✅ Clicked Continue after all addons');
        await waitForSkeletonsToDisappear(10000);
        await wait(300);
      } else {
        console.log('⚠️ Continue button not found, falling back');
        await this.clickContinue(root);
      }
    }
    await wait(500);
    await AutomationPauseController.checkpoint('Section C → CPA Cover');
    // do you wish cpa covers select yes or no
    const cpaCoversInput = await waitForElement('input[name="cpaCoverFlag"][value="false"]', { timeoutMs: 15000, root: root });
    if (cpaCoversInput) clickElement(cpaCoversInput);
    // click on continue button
    await this.clickContinue(root);
    await wait(500);
    // confirm if cpa not required 
    // ownership type
    const ownershipTypeInput = await waitForElement('input[name="ownershipUnder"][value="Individual"]', { timeoutMs: 15000, root: root });
    if (ownershipTypeInput) clickElement(ownershipTypeInput);
    await wait(100);
    // already have standalone policy select yes or no
    const standalonePolicyInput = await waitForElement('input[name="haveCpaCover"][value="true"]', { timeoutMs: 15000, root: root });
    if (standalonePolicyInput) clickElement(standalonePolicyInput);
    await wait(100);
    // do you have valid driving license select yes or no
    const validDrivingLicenseInput = await waitForElement('input[name="validDrivingLicenseFlag"][value="false"]', { timeoutMs: 15000, root: root });
    if (validDrivingLicenseInput) clickElement(validDrivingLicenseInput);
    await wait(100);
    // do you want cpa cover only for 1 year select yes or no
    const oneYearCpaCoverInput = await waitForElement('input[name="cpaForOneYear"][value="false"]', { timeoutMs: 15000, root: root });
    if (oneYearCpaCoverInput) clickElement(oneYearCpaCoverInput);
    await wait(100);
    // click on continue button
    await this.clickContinue(root);
   
    await AutomationPauseController.checkpoint('Section C → Underwriting Discount');
    // write underwriten Discount
    const underwritenDiscountInput = await waitForElement('input[placeholder="Underwriting Discount"]', { timeoutMs: 15000, root: root });
    if(underwritenDiscountInput){
      const discountSubmitted = await this.submitUnderwritingDiscount(root, logger);
      if (!discountSubmitted) {
        throw new Error('Underwriting discount submission failed');
      }
    }else{
      console.log("Skipping underwriting discount");
    }
    await AutomationPauseController.checkpoint('Section C → Branch Code');
    // enter branch code and select first item
    const branchCodeInput = await waitForElement('input[name="branchOffice"]', { timeoutMs: 15000, root: root });
    if (branchCodeInput){
      fillInput(branchCodeInput, ORIENTAL_DEFAULT_VALUES.branchCode);
      branchCodeInput.blur();
      await wait(1000);
      await this.selectAutoCompleteItem(ORIENTAL_DEFAULT_VALUES.branchCode);
    }
    await wait(1000);
    // click on continue button
    await this.clickContinue(root);
    await wait(1000);
    await AutomationPauseController.checkpoint('Section C → Proposal Number');
    // Extract proposal number
    const text = document.querySelector('.sub-text')?.textContent || '';
const proposalNumber = text.split('Proposal Number:-')[1]?.trim();

console.log(proposalNumber);
//wait for element 
const okayButton = await waitForElement('.pointer.footer-green', { timeoutMs: 15000, root: root });
if(okayButton) clickElement(okayButton);
await wait(1000);
return proposalNumber;

  },

  getActiveSlideRoot() {
    return document.querySelector('.slick-slide.slick-active[aria-hidden="false"]')
      || document.querySelector('.slick-slide.slick-active')
      || document;
  },

  findToastError(messageText = '') {
    const needle = String(messageText || '').trim().toLowerCase();
    const toasts = document.querySelectorAll('.Toastify__toast--error .Toastify__toast-body, .Toastify__toast--error');
    for (const toast of toasts) {
      const text = toast.textContent.trim().toLowerCase();
      if (!needle || text.includes(needle)) {
        return toast;
      }
    }
    return null;
  },

  async waitForToastError(messageText, timeoutMs = 4000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const toast = this.findToastError(messageText);
        if (toast) {
          resolve(toast);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  },

  async waitForSectionTitle(titleText, timeoutMs = 10000) {
    const needle = String(titleText || '').trim().toLowerCase();
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const activeRoot = this.getActiveSlideRoot();
        const title = activeRoot.querySelector('.policy-title, h4');
        const titleTextContent = title?.textContent?.trim().toLowerCase() || '';
        if (titleTextContent.includes(needle)) {
          resolve(activeRoot);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  },

  setUnderwritingDiscountValue(input, value) {
    if (!input) return;

    const prototype = input instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;

    input.defaultValue = value;
    input.setAttribute('value', value);
    input.setAttribute('aria-valuenow', value);

    const wrapper = input.closest('.p-inputnumber');
    if (wrapper && value) {
      wrapper.classList.add('p-inputwrapper-filled');
    }
  },

  async applyUnderwritingDiscountValue(input, logger = console.log) {
    if (!input) return false;

    const desiredValue = String(ORIENTAL_DEFAULT_VALUES.underwritingDiscount).trim();
    logger(`ℹ️ Focusing underwriting discount and setting ${desiredValue}`);

    input.focus();
    input.click();
    await wait(100);

    this.setUnderwritingDiscountValue(input, desiredValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(120);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await wait(350);

    const finalValue = String(input.value || '').trim();
    const attrValue = String(input.getAttribute('value') || '').trim();
    const ariaValue = String(input.getAttribute('aria-valuenow') || '').trim();
    logger(`ℹ️ Underwriting discount after inject: value="${finalValue}" attr="${attrValue}" aria="${ariaValue}"`);
    return finalValue === desiredValue && attrValue === desiredValue && ariaValue === desiredValue;
  },

  async clickUnderwritingDiscountSubmit(input, logger = console.log) {
    await AutomationPauseController.checkpoint();

    const row = input?.closest('.policy-form-row') || this.getActiveSlideRoot();
    let submitButton = await waitForButtonEnabled('button[aria-label="uwDiscound-submit-btn"], .policy-form-footer button.policy-btn', 5000, row);

    if (!submitButton || submitButton.disabled) {
      submitButton = row.querySelector('button[aria-label="uwDiscound-submit-btn"], .policy-form-footer button.policy-btn');
    }

    if (!submitButton || submitButton.disabled) {
      logger('⚠️ Underwriting submit button not found in discount row; falling back to generic continue');
      return this.clickContinue(this.getActiveSlideRoot());
    }

    submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(300);
    clickElement(submitButton);
    logger('✅ Clicked underwriting discount submit button');
    await wait(500);
    await waitForSkeletonsToDisappear(15000);
    await wait(1000);
    return true;
  },

  async retryUnderwritingDiscountAfterConflict(root = document, logger = console.log) {
    logger('⚠️ Recovering from underwriting/NDP discount conflict');

    for (let backCount = 0; backCount < 3; backCount++) {
      const activeRoot = this.getActiveSlideRoot();
      const backIcon = activeRoot.querySelector('.policy-title .icon-back, .policy-header-box .icon-back');
      if (!backIcon) {
        logger(`⚠️ Discount recovery failed: back icon not found on step ${backCount + 1}`);
        return false;
      }

      clickElement(backIcon);
      await wait(700);
      await waitForSkeletonsToDisappear(10000);
      await wait(500);
    }

    const addOnsPage = await this.waitForSectionTitle('choose add-ons', 10000);
    if (!addOnsPage) {
      logger('⚠️ Discount recovery failed: Choose Add-Ons page not visible');
      return false;
    }

    const addOnsContinue = addOnsPage.querySelector('.policy-form-footer button.policy-btn');
    if (addOnsContinue && !addOnsContinue.disabled) {
      clickElement(addOnsContinue);
      await wait(500);
      await waitForSkeletonsToDisappear(10000);
      await wait(1000);
    } else {
      const continued = await this.clickContinue(root);
      if (!continued) {
        logger('⚠️ Discount recovery failed: could not continue from Choose Add-Ons page');
        return false;
      }
    }

    const cpaCoversInput = await waitForElement('input[name="cpaCoverFlag"][value="false"]', { timeoutMs: 10000, root: document });
    if (cpaCoversInput) {
      clickElement(cpaCoversInput);
      await wait(200);
      await this.clickContinue(root);
      await wait(500);
    }

    const cpaPage = await this.waitForSectionTitle('confirm if cpa cover is not required', 10000);
    if (!cpaPage) {
      logger('⚠️ Discount recovery failed: CPA confirmation page not visible');
      return false;
    }

    const ownershipTypeInput = await waitForElement('input[name="ownershipUnder"][value="Individual"]', { timeoutMs: 10000, root: cpaPage });
    if (ownershipTypeInput) clickElement(ownershipTypeInput);
    await wait(100);

    const standalonePolicyInput = await waitForElement('input[name="haveCpaCover"][value="true"]', { timeoutMs: 10000, root: cpaPage });
    if (standalonePolicyInput) clickElement(standalonePolicyInput);
    await wait(100);

    const validDrivingLicenseInput = await waitForElement('input[name="validDrivingLicenseFlag"][value="false"]', { timeoutMs: 10000, root: cpaPage });
    if (validDrivingLicenseInput) clickElement(validDrivingLicenseInput);
    await wait(100);

    const oneYearCpaCoverInput = await waitForElement('input[name="cpaForOneYear"][value="false"]', { timeoutMs: 10000, root: cpaPage });
    if (oneYearCpaCoverInput) clickElement(oneYearCpaCoverInput);
    await wait(100);

    const cpaSubmitButton = cpaPage.querySelector('.policy-form-footer button.policy-btn');
    if (cpaSubmitButton && !cpaSubmitButton.disabled) {
      clickElement(cpaSubmitButton);
      await wait(500);
      await waitForSkeletonsToDisappear(10000);
      await wait(1000);
    } else {
      const continued = await this.clickContinue(root);
      if (!continued) {
        logger('⚠️ Discount recovery failed: could not continue from CPA confirmation page');
        return false;
      }
    }

    const discountPage = await this.waitForSectionTitle('discounts', 10000);
    if (!discountPage) {
      logger('⚠️ Discount recovery failed: Discounts page did not return');
      return false;
    }

    const discountInput = await waitForElement('input[placeholder="Underwriting Discount"]', { timeoutMs: 15000, root: discountPage });
    if (!discountInput) {
      logger('⚠️ Discount recovery failed: Underwriting Discount input not found');
      return false;
    }

    const applied = await this.applyUnderwritingDiscountValue(discountInput, logger);
    if (!applied) {
      logger('⚠️ Discount recovery failed: could not sync underwriting discount value');
      return false;
    }
    const submitted = await this.clickUnderwritingDiscountSubmit(discountInput, logger);
    if (!submitted) {
      logger('⚠️ Discount recovery failed: underwriting submit did not proceed');
      return false;
    }

    const repeatToast = await this.waitForToastError('nil depreciation discount cannot be more than underwriting discount', 3500);
    if (repeatToast) {
      logger('⚠️ Discount conflict persisted after retry');
      return false;
    }

    logger('✅ Discount conflict recovered');
    return true;
  },

  async submitUnderwritingDiscount(root = document, logger = console.log) {
    const activeRoot = this.getActiveSlideRoot();
    const underwritenDiscountInput = await waitForElement('input[placeholder="Underwriting Discount"]', { timeoutMs: 15000, root: activeRoot });
    if (!underwritenDiscountInput) {
      logger('Skipping underwriting discount');
      return true;
    }

    const applied = await this.applyUnderwritingDiscountValue(underwritenDiscountInput, logger);
    if (!applied) {
      logger('⚠️ Underwriting discount value could not be synced');
      return false;
    }
    const submitted = await this.clickUnderwritingDiscountSubmit(underwritenDiscountInput, logger);
    if (!submitted) {
      logger('⚠️ Underwriting discount submit did not proceed');
      return false;
    }

    const conflictToast = await this.waitForToastError('nil depreciation discount cannot be more than underwriting discount', 3500);
    if (!conflictToast) {
      return true;
    }

    return this.retryUnderwritingDiscountAfterConflict(root, logger);
  },

  async  selectAutoCompleteItem(text, timeout = 5000) {
    const start = Date.now();
  
    while (Date.now() - start < timeout) {
      const item = [...document.querySelectorAll('.p-autocomplete-item')]
        .find(el => el.textContent.includes(text));
  
      if (item) {
        item.click();
        console.log("Selected:", item.textContent.trim());
        return true;
      }
  
      await new Promise(r => setTimeout(r, 200));
    }
  
    console.log("Item not found:", text);
    return false;
  },
  async clickContinue(root = document) {
    // Check if automation is paused before proceeding
    await AutomationPauseController.checkpoint();

    // Wait for any active skeletons/loading to clear BEFORE looking for the button
    await waitForSkeletonsToDisappear(15000);

    // Scroll down to make the button visible
    scrollToBottom();
    await wait(500);

    // Prefer the .policy-btn in the active slide (avoids hitting dialog Submit buttons)
    let btn = null;
    const activeFooter = document.querySelector('.slick-slide.slick-active .policy-form-footer');
    if (activeFooter) {
      btn = activeFooter.querySelector('button.policy-btn, button.Confirm-Continue-btn');
      console.log('[clickContinue] active slide footer btn:', !!btn);
    }
    // Fallback chain: any .policy-btn, then text-based search (skip dialogs)
    if (!btn) {
      btn = document.querySelector('.policy-form-footer button.policy-btn, .payment-section .Confirm-Continue-btn, .payment-section button[type="submit"]');
      console.log('[clickContinue] policy-form-footer btn:', !!btn);
    }
    if (!btn) {
      const candidates = [
        findElementByText('button', 'Continue', root),
        findElementByText('button', 'Next', root),
        findElementByText('button', 'Continue', document),
        findElementByText('button', 'Next', document)
      ];
      for (const c of candidates) {
        if (c && !c.closest('.p-dialog') && !c.disabled) { btn = c; break; }
      }
      console.log('[clickContinue] text-based btn:', !!btn);
    }
    if (!btn) btn = qs(ORIENTAL_SELECTORS.continueButton, root) || qs(ORIENTAL_SELECTORS.continueButton, document);
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(500);
      clickElement(btn);
      console.log('✅ Clicked continue button:', btn.innerText);
      // Wait for skeletons to clear after clicking (page transition)
      await wait(500);
      await waitForSkeletonsToDisappear(20000);
      await wait(1000);
      return true;
    }
    console.log('⚠️ clickContinue: No button found');
    return false;
  },

  async run(formData, logger = console.log) {
    const fd = formData && (formData.vehicleDetails || formData.planDetails) ? formData : normalizeToOrientalForm(formData || {});
    AutomationPauseController.setPhase('form');

    try {
      if (!AutomationPauseController.isStepCompleted('form.sectionA')) {
        await this.fillSectionA(fd, null, logger);
        AutomationPauseController.markStepComplete('form.sectionA');
      } else {
        logger('⏭️ Section A already completed, skipping');
      }

      if (!AutomationPauseController.isStepCompleted('form.sectionB')) {
        await this.fillSectionB(fd, null, logger);
        AutomationPauseController.markStepComplete('form.sectionB');
      } else {
        logger('⏭️ Section B already completed, skipping');
      }

      let proposalNumber = null;
      if (!AutomationPauseController.isStepCompleted('form.sectionC')) {
        proposalNumber = await this.fillSectionC(fd, null, logger);
        AutomationPauseController.markStepComplete('form.sectionC');
      } else {
        logger('⏭️ Section C already completed, skipping');
      }

      return { success: true, proposalNumber };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') {
        console.log('%c[Automation] ⛔ Form automation stopped by admin', 'color: #ff0000; font-weight: bold;');
        return { success: false, error: 'Stopped by admin', stopped: true };
      }
      return { success: false, error: e.message };
    }
  },
};

globalThis.OrientalForm = OrientalForm;
