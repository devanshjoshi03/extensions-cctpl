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
    //   await wait(15);
    // }
    // RTO first
    const rtoInput = root.querySelector('#cityOfRegistration input') || root.querySelector('input[name="cityOfRegistration"]') || qs(ORIENTAL_SELECTORS.rtoInput, root);
    if (rtoInput && v.rtoLocation) {
      await selectPrimeDropdown("#cityOfRegistration", v.rto?.searchText || v.rtoLocation);
      await wait(125);
      await waitForButtonEnabled('Continue', 7500, root);
      await wait(125);
    } else {
      throw new Error("RTO not found");
    }

     // Click Continue first to reveal the form section
     await this.clickContinue(root);
     await wait(50);

    await AutomationPauseController.checkpoint('Section A → Fuel Type');
    // Then fuel type - click dropdown before selecting
    // Support multiple fuel types: petrol, diesel, electric, battery, cng, lpg, etc.
    const fuelTypeValue = v.fuelType?.searchText || v.fuelTypeLocation || v.fuelType || 'Petrol';
    await selectPrimeDropdown("#fuelTypeNew", fuelTypeValue, false); // loose match instead of exact
    await wait(250);
    // Click Continue first to reveal the form section
    await this.clickContinue(root);
    await wait(250);

    await AutomationPauseController.checkpoint('Section A → Brand / Model / Variant');
    const fillBrandModelVariant = async () => {
      const brandSearch = v.vehicleBrandModelVariant?.searchText || (v.make && v.model ? `${v.make} ${v.model} ${v.variant || ''}`.trim() : '');
      console.log('brandSearch', brandSearch);
      if (!brandSearch) {
        throw new Error('Vehicle brand / model / variant is missing from the request payload');
      }
      const selectedModel = await selectPrimeAutocomplete(ORIENTAL_SELECTORS.vehicalBrandModelVariantInput, brandSearch);
      if (!selectedModel) {
        throw new Error('Vehicle brand / model / variant "' + brandSearch + '" was not selected');
      }

      // Wait for Continue to be enabled, then click to reveal engine/chassis slide
      await waitForButtonEnabled('Continue', 17500, root);
      await this.clickContinue(root);
      await wait(250);
    }
    await fillBrandModelVariant();

    await AutomationPauseController.checkpoint('Section A → Engine & Chassis Numbers');
    // Wait for slide to load and engine input to appear
    const engineInput = await waitForElement('#engineNumber', { timeoutMs: 7500, root });
    if (engineInput && vi.engineNumber) {
      console.log('Filling engine number', vi.engineNumber);
      fillInput(engineInput, vi.engineNumber);
    } else {
      console.log("Skipping engine number", engineInput ? '(no data)' : '(input not found)');
    }

    const chassisInput = await waitForElement('#chassisNumber', { timeoutMs: 7500, root });
    if (chassisInput && vi.chassisNumber) {
      console.log('Filling chassis number', vi.chassisNumber);
      await wait(100);
      fillInput(chassisInput, vi.chassisNumber);
    } else {
      console.log("Skipping chassis number", chassisInput ? '(no data)' : '(input not found)');
    }
 
    



    await wait(100);
    // Click Continue first to reveal the form section
    await this.clickContinue(root); 

    await wait(250);
    await AutomationPauseController.checkpoint('Section A → Seating & Cubic Capacity');
    // fill seating capacity
    if(v.seatingCapacity){
      const seatingCapacityInput = await waitForElement("#seatingCapacity", { timeoutMs: 3000, root });
      if (seatingCapacityInput && seatingCapacityInput.disabled) {
        console.log('Seating capacity input is disabled (pre-filled) - skipping');
      } else if (seatingCapacityInput) {
        fillInput(seatingCapacityInput, v.seatingCapacity);
      }
    }else{
      console.log("Skipping seating capacity");
    }
    // fill cc / motor capacity kw
    const ccValue = v.cubicCapacity || v.motorCapacityKw || v.motorCapacity;
    if(ccValue){
      const ccInput = await waitForElement(
        "#cubicCapacity, #motorCapacityKw, #motorCapacity, input[name='cubicCapacity'], input[name='motorCapacityKw'], input[name='motorCapacity']",
        { timeoutMs: 3000, root }
      );
      if (ccInput && ccInput.disabled) {
        console.log('Cubic capacity input is disabled (pre-filled) - skipping');
      } else if (ccInput) {
        fillInput(ccInput, ccValue);
      }
    }else{
      console.log("Skipping cubic/motor capacity");
    }
    // Click Continue first to reveal the form section
    await this.clickContinue(root);

    await wait(100);

    // Wait until the portal settles on whichever screen comes next.
    const pucSelector = 'input[name="validPuc"][value="true"]';
    const purchaseSelector = 'input[name="yearOfManufacture"]';
    const screenDeadline = Date.now() + 10000;
    let pucRadio = null;
    let purchaseScreen = false;
    while (Date.now() < screenDeadline) {
      const slide = getSlickActiveSlide() || document;
      pucRadio = slide.querySelector(pucSelector);
      const title = String(slide.querySelector('.policy-title')?.textContent || '').toLowerCase();
      purchaseScreen = Boolean(slide.querySelector(purchaseSelector)) || title.includes('date of purchase');
      if (pucRadio || purchaseScreen) break;
      await wait(250);
    }

    if (pucRadio) {
      await AutomationPauseController.checkpoint('Section A → Valid PUC');
      await this.clickRadioLabel(pucSelector, 'Valid PUC "Yes"');
      await this.clickContinue(root);
      await wait(125);
      return;
    }

    if (!purchaseScreen) {
      const slide = getSlickActiveSlide() || document;
      const activeTitle = String(slide.querySelector('.policy-title')?.textContent || '').trim();
      throw new Error('Expected PUC or Date of Purchase after vehicle details, found "'
        + (activeTitle || 'unknown screen') + '"');
    }

    // Brand New skips PUC. Section B drives from Date of Purchase, so do not
    // click Continue here.
    logger('PUC is not requested on this vehicle path; continuing from Date of Purchase');
  },

  async fillSectionB(formData, scope, logger = console.log) {
    const root = scope || document;
    const v = formData.vehicleDetails || {};
    const vi = formData.vehicleInformation || {};
    const h = formData.hypothecation || {};

    await AutomationPauseController.checkpoint('Section B \u2192 Registration Date & Year');
    // Date of purchase / invoice
    const dateOfPurchase = v.registrationDate || v.deliveryDate;
    if (dateOfPurchase) {
      const registrationDateInput = await waitForElement('input[placeholder="DD-MM-YYYY"]', { timeoutMs: 10000, root });
      if (!registrationDateInput) throw new Error('Registration date input not found');
      await fillMuiDate('input[placeholder="DD-MM-YYYY"]', dateOfPurchase);
    } else {
      logger('Skipping date of purchase');
    }

    // Year of manufacture
    if (vi.yearOfManufacture) {
      await waitForElement('input[name="yearOfManufacture"]', { timeoutMs: 10000, root });
      await selectYearOfManufacture(vi.yearOfManufacture, dateOfPurchase);
    } else {
      throw new Error('Year of manufacture is required');
    }

    const yearContinueOk = await this.clickContinue(root);
    if (!yearContinueOk) {
      logger('\u26a0\ufe0f Continue after year-of-manufacture did not advance \u2014 retrying once');
      await wait(500);
      await this.clickContinue(root);
    }

    await AutomationPauseController.checkpoint('Section B \u2192 NCB Claim');
    await this.clickRadioLabel(
      'input[name="previousPolicyNcbClaimFlag"][value="false"]',
      'NCB claim flag "No, I did not"'
    );
    await wait(125);

    // Previous Policy NCB percentage lives on the same slide as the claim
    // flag. Skipping it is why Continue never advanced past NCB.
    await AutomationPauseController.checkpoint('Section B \u2192 Previous Policy NCB');
    const ncbPercent = v.ncbPercentage ?? 0;
    const validNcbValues = [0, 20, 25, 35, 45, 50];
    if (!validNcbValues.includes(ncbPercent)) {
      throw new Error('NCB percentage "' + ncbPercent + '" is invalid. Allowed values: ' + validNcbValues.join(', '));
    }
    await this.clickRadioLabel(
      'input[name="previousPolicyNcb"][value="' + ncbPercent + '"]',
      'Previous Policy NCB ' + ncbPercent + '%'
    );
    await wait(125);

    const ncbContinueOk = await this.clickContinue(root);
    if (!ncbContinueOk) {
      logger('\u26a0\ufe0f Continue after NCB did not advance \u2014 retrying once');
      await wait(500);
      await this.clickContinue(root);
    }

    await AutomationPauseController.checkpoint('Section B \u2192 Hypothecation');
    // The slide needs a Finance Type either way: "None" for an unfinanced
    // vehicle, otherwise the type the request asked for.
    let financeType = 'None';
    if (h.isHypothecated && h.financierType) financeType = String(h.financierType);
    else if (h.isHypothecated) financeType = 'Hypothecation';

    logger('Selecting Finance Type: ' + financeType);
    const financeSelected = selectFinanceType(financeType);
    if (!financeSelected) throw new Error('Finance type "' + financeType + '" radio button not found');
    await wait(250);

    if (h.isHypothecated) {
      if (h.financierName) {
        const financierNameInput = await waitForElement('input[name="nameOfCompany"]', { timeoutMs: 7500, root });
        if (!financierNameInput) throw new Error('Financier name input not found');
        fillInput(financierNameInput, h.financierName);
      }
      if (h.financierAddress) {
        const financierAddressInput = await waitForElement('input[name="addressOfCompany"]', { timeoutMs: 7500, root });
        if (!financierAddressInput) throw new Error('Financier address input not found');
        fillInput(financierAddressInput, h.financierAddress);
      }
    }

    await wait(125);
    const hypoContinueOk = await this.clickContinue(root);
    if (!hypoContinueOk) {
      logger('\u26a0\ufe0f Continue after hypothecation did not advance \u2014 retrying once');
      await wait(500);
      await this.clickContinue(root);
    }
    return true;
  },

  async fillSectionC(formData, scope, logger = console.log) {
    const p = formData.planDetails || {};
    const v = formData.vehicleDetails || {};
    const c = formData.covers || {};
    const ag = formData.agentDetails || {};
    const root = scope || document;

    // ── Plan ────────────────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Plan Selection');
    const planValue = normalizeOrientalPlan(p.plan) || ORIENTAL_DEFAULT_VALUES.plan;
    const planLabel = (ORIENTAL_PLANS.find((plan) => plan.value === planValue) || {}).label || planValue;
    logger('Selecting plan: ' + planValue + ' (' + planLabel + ')');

    await waitForSkeletonsToDisappear(20000);
    let planCards = [];
    const planDeadline = Date.now() + 20000;
    while (Date.now() < planDeadline) {
      planCards = [...document.querySelectorAll(ORIENTAL_SELECTORS.planCards)].filter(isElementVisible);
      if (planCards.length > 0) break;
      await wait(250);
    }
    if (planCards.length === 0) throw new Error('Plan cards not visible after waiting');

    const cardText = (card) => String(card.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
    // Match the full label first: matching on the short value alone would let
    // "OD" hit any card whose text happens to contain those letters.
    const targetPlan = planCards.find((card) => cardText(card).includes(planLabel.toLowerCase()))
      || planCards.find((card) => cardText(card).includes(planValue.toLowerCase()));
    if (!targetPlan) throw new Error('Plan "' + planValue + '" not found among ' + planCards.length + ' cards');
    const planSelected = await clickUntil(targetPlan, async () =>
      targetPlan.classList.contains('active')
      || targetPlan.classList.contains('selected')
      || Boolean(targetPlan.querySelector('input:checked')), {
      attempts: 3,
      settleMs: 1200,
      label: 'plan card (' + planValue + ')',
    });
    if (!planSelected) {
      // The selected-state markup differs between portal builds, so a failed
      // check must not abort here: Continue staying disabled is the reliable
      // signal and clickContinue already verifies that.
      logger('Plan card did not report a selected state; relying on Continue');
    }
    logger('Selected plan: ' + planValue);

    await wait(250);
    await this.clickContinue(root);

    // ── IDV ─────────────────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 IDV');
    if (v.idv && Number(v.idv) > 0) {
      const requestedIdv = Number(v.idv);
      logger('Requested IDV: ' + requestedIdv);

      // Drive the numeric input, not the range slider: the slider snaps to its
      // own steps, and an IDV that lands on a different slab sends the whole
      // proposal to maker-checker instead of to payment.
      const idvInput = await waitForElement(ORIENTAL_SELECTORS.idvInput, { timeoutMs: 10000 });
      if (!idvInput) throw new Error('IDV input not visible after waiting');

      const slider = document.querySelector(ORIENTAL_SELECTORS.idvSlider);
      if (slider) {
        const minIdv = Number(slider.getAttribute('min'));
        const maxIdv = Number(slider.getAttribute('max'));
        if (Number.isFinite(minIdv) && Number.isFinite(maxIdv) && minIdv > 0) {
          logger('Portal IDV range: ' + minIdv + ' \u2013 ' + maxIdv);
          if (requestedIdv < minIdv || requestedIdv > maxIdv) {
            throw new Error('IDV_MISMATCH: Requested IDV ' + requestedIdv
              + ' is outside the portal range ' + minIdv + ' \u2013 ' + maxIdv);
          }
        }
      }

      const idvSet = await setPrimeInputNumberValue(idvInput, requestedIdv);
      if (!idvSet) {
        throw new Error('IDV_MISMATCH: could not replace the pre-filled IDV; the field reads "'
          + idvInput.value + '" instead of ' + requestedIdv);
      }
      await waitForSkeletonsToDisappear(30000);
      await wait(2000);

      // Never let the portal quietly substitute its own IDV.
      const retainedText = String(idvInput.value || '');
      const retainedIdv = Number(retainedText.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(retainedIdv) || Math.abs(retainedIdv - requestedIdv) > 0.01) {
        throw new Error('IDV_MISMATCH: Requested IDV ' + requestedIdv + ', but the portal retained '
          + (Number.isFinite(retainedIdv) ? retainedIdv : (retainedText || 'empty')));
      }
      logger('\u2705 Portal IDV matches requested value: ' + retainedIdv);
    } else {
      logger('Skipping IDV (not requested)');
    }

    scrollToBottom();
    await wait(250);
    await this.clickContinue(root);

    // ── Add-ons ─────────────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Add-ons');
    const shouldAddNilDep = c.nilDepreciation !== undefined
      ? c.nilDepreciation
      : ORIENTAL_DEFAULT_VALUES.nilDepreciation;

    if (shouldAddNilDep) {
      logger('Processing Nil Depreciation addon...');
      const added = await this.applyAddon('Nil Depreciation', logger);
      if (!added) throw new Error('Nil Depreciation addon not found');
    }
    if (c.returnToInvoice === true) {
      logger('Processing Return to Invoice addon...');
      const added = await this.applyAddon('Return to Invoice', logger);
      if (!added) throw new Error('Return to Invoice addon not found');
    }

    // Covers the frontend can request alongside NDP / RTI.
    const addonMap = {
      engineProtector: 'Engine Protect',
      keyProtect: 'Key Protect',
      consumables: 'Consumables',
      rsa: 'Roadside Assistance',
      ncbProtect: 'NCB Protect',
    };
    for (const [coverKey, addonName] of Object.entries(addonMap)) {
      if (c[coverKey] !== true) continue;
      logger('Processing ' + addonName + ' addon...');
      const added = await this.applyAddon(addonName, logger);
      if (!added) throw new Error(addonName + ' addon not found');
    }

    scrollToBottom();
    await wait(125);
    await this.clickContinue(root);

    // ── CPA ─────────────────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 CPA Cover');
    await this.clickRadioLabel('input[name="cpaCoverFlag"][value="false"]', 'CPA cover "No"');
    await wait(500);
    await this.clickContinue(root);

    await AutomationPauseController.checkpoint('Section C \u2192 CPA Confirmation');
    await this.clickRadioLabel('input[name="ownershipUnder"][value="Individual"]', 'Ownership "Under Individual"');
    await wait(500);
    await this.clickRadioLabel('input[name="haveCpaCover"][value="true"]', 'Standalone CPA "Yes"');
    await wait(500);
    await this.clickRadioLabel('input[name="validDrivingLicenseFlag"][value="false"]', 'Valid driving license "No"');
    await wait(500);
    await this.clickRadioLabel('input[name="cpaForOneYear"][value="false"]', 'CPA for one year "No"');
    await wait(500);
    await this.clickContinue(root);

    // ── Choose Deductibles (optional slide) ─────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Deductibles');
    let deductiblesShown = false;
    const deductiblesDeadline = Date.now() + 10000;
    while (Date.now() < deductiblesDeadline) {
      if (document.querySelector(ORIENTAL_SELECTORS.underwritingDiscountInput)) break;
      const activeRoot = this.getActiveSlideRoot();
      const title = activeRoot.querySelector('.policy-title, h4');
      if (title && String(title.textContent || '').toLowerCase().includes('choose deductibles')) {
        deductiblesShown = true;
        break;
      }
      await wait(250);
    }
    if (deductiblesShown) {
      logger('Choose Deductibles displayed; continuing without adding Anti Theft Discount');
      const continued = await this.clickContinue(root);
      if (!continued) throw new Error('Continue on Choose Deductibles did not advance');
    } else {
      logger('Choose Deductibles was not shown for this quote');
    }

    // ── Underwriting discount ───────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Underwriting Discount');
    const uwDiscount = p.underwritingDiscount ?? ORIENTAL_DEFAULT_VALUES.underwritingDiscount;
    const uwDiscountStr = String(uwDiscount ?? '').trim();
    if (uwDiscountStr !== '' && uwDiscountStr !== '0') {
      const underwritenDiscountInput = await waitForElement(
        ORIENTAL_SELECTORS.underwritingDiscountInput,
        { timeoutMs: 10000, root: document }
      );
      if (!underwritenDiscountInput) throw new Error('Underwriting discount input not found');
      const discountSubmitted = await this.submitUnderwritingDiscount(root, logger, uwDiscountStr);
      if (!discountSubmitted) throw new Error('Underwriting discount submission failed');
    } else {
      logger('Skipping underwriting discount (value is 0 or empty)');
    }
    await wait(250);

    // ── Branch office ───────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Branch Code');
    // The branch belongs to the logged-in agent and arrives with the request;
    // a constant here books every policy against one branch.
    const branchCode = String(ag.branchCode || '').trim();
    if (!branchCode) throw new Error('agentDetails.branchCode is missing from the request payload');
    logger('Applying branch code: ' + branchCode);

    const branchCodeInput = await waitForElement(ORIENTAL_SELECTORS.branchCodeInput, { timeoutMs: 10000, root: document });
    if (!branchCodeInput) throw new Error('Branch office input not found');
    fillInput(branchCodeInput, branchCode);
    branchCodeInput.dispatchEvent(new Event('keyup', { bubbles: true }));
    await wait(600);
    const branchPicked = await this.selectAutoCompleteItem(branchCode);
    if (!branchPicked) {
      const firstItem = document.querySelector('.p-autocomplete-item');
      if (!firstItem) throw new Error('Branch office "' + branchCode + '" not offered by the portal');
      clickElement(firstItem);
    }
    branchCodeInput.blur();
    await wait(250);
    await this.clickContinue(root);
    await wait(250);

    // ── Proposal number ─────────────────────────────────────────────────
    await AutomationPauseController.checkpoint('Section C \u2192 Proposal Number');
    const proposalText = document.querySelector(ORIENTAL_SELECTORS.proposalNumberText)?.textContent || '';
    const proposalMatch = proposalText.match(/Proposal Number[:\-\s]+(.+)/i);
    const proposalNumber = proposalMatch ? proposalMatch[1].replace(/^[\s:\-]+/, '').trim() : undefined;
    logger('Proposal Number: ' + (proposalNumber || 'not found'));

    // A modified IDV slab routes the proposal to a checker. That popup is a
    // .p-dialog as well, but it carries .makerchecker-popup and a red
    // "Send For Approval" button instead of the green Okay, so looking for
    // .pointer.footer-green on it just hangs.
    const makerChecker = await waitForMakerCheckerDialog(2500);
    if (makerChecker) {
      logger('Maker-checker approval dialog detected \u2014 sending proposal for checker approval');
      await handleMakerCheckerDialog(makerChecker, logger);
      return { proposalNumber, approvalPending: true };
    }

    const okayButton = await waitForElement(ORIENTAL_SELECTORS.okayButton, { timeoutMs: 7500, root: document });
    if (!okayButton) throw new Error('OK button on the proposal screen not found');
    clickElement(okayButton);
    await wait(250);

    return { proposalNumber, approvalPending: false };
  },

  /**
   * Clicks a radio through its wrapping label and verifies Angular registered
   * it. The raw inputs are hidden behind PrimeNG radio boxes, so clicking the
   * input alone often leaves the model unchanged and Continue disabled.
   */
  async clickRadioLabel(radioSelector, description, options = {}) {
    const { required = true, timeoutMs = 7500 } = options;

    // Prefer the active slide: slick keeps off-screen slides in the DOM, so a
    // document-wide query can return a radio the user cannot see.
    let radio = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const slide = getSlickActiveSlide();
      radio = (slide && slide.querySelector(radioSelector)) || null;
      if (radio) break;
      await wait(200);
    }
    if (!radio) radio = document.querySelector(radioSelector);

    if (!radio) {
      if (required) throw new Error(description + ' option not found');
      console.log('Skipping ' + description + ' (not present)');
      return false;
    }

    // The input sits behind a PrimeNG radio box, so click the wrapping label
    // and confirm Angular registered it. The portal drops clicks, hence the
    // retries rather than a single re-click.
    const target = radio.closest('label') || radio;
    await clickUntil(target, async () => radio.checked, {
      attempts: 4,
      settleMs: 800,
      label: description,
    });

    if (!radio.checked) {
      // Fall back to the input itself in case the label is not the hit area.
      await clickUntil(radio, async () => radio.checked, {
        attempts: 2,
        settleMs: 800,
        label: description + ' (input)',
      });
    }

    if (!radio.checked && required) {
      throw new Error(description + ' could not be selected after repeated clicks');
    }
    if (radio.checked) console.log('Selected ' + description);
    return radio.checked;
  },

  /**
   * Opens an addon card, fills its dialog when it has one, submits, and waits
   * for the dialog to close - aborting on a portal error toast rather than
   * leaving a half-applied addon behind.
   */
  async applyAddon(addonName, logger = console.log) {
    const opened = await selectAddon(addonName);
    if (!opened) return false;

    const { card, dialog, alreadyApplied } = opened;
    if (alreadyApplied) {
      logger(addonName + ' already applied');
      return true;
    }
    if (!dialog) return false;

    if (addonName.toLowerCase().includes('nil depreciation')) {
      // Scope to this dialog: other dialogs can be mounted on the page.
      const ndpDeadline = Date.now() + 10000;
      let ndpInput = null;
      while (Date.now() < ndpDeadline) {
        ndpInput = dialog.querySelector(
          '.p-inputnumber-input, input[role="spinbutton"], input[inputmode="numeric"], input.p-inputtext'
        );
        if (ndpInput) break;
        await wait(150);
      }
      if (!ndpInput) throw new Error('NDP discount input not found in the ' + addonName + ' dialog');

      const ndpSet = await setPrimeInputNumberValue(ndpInput, ORIENTAL_DEFAULT_VALUES.ndpDiscount);
      if (!ndpSet) {
        throw new Error('NDP discount could not be set; the field reads "' + ndpInput.value + '"');
      }
      logger('NDP discount set to ' + ORIENTAL_DEFAULT_VALUES.ndpDiscount);
    }

    const submitBtn = dialog.querySelector('button.addNew-btn')
      || dialog.querySelector('.p-dialog-content button');
    if (!submitBtn) throw new Error('Submit button not found in the ' + addonName + ' dialog');
    // Watch THIS dialog, not whichever .p-dialog happens to be first in the
    // document - that made a dialog that had closed look like one that had not.
    let toastError = null;
    const dialogGone = async () => {
      const toast = this.findToastError();
      if (toast) {
        toastError = String(toast.textContent || '').trim();
        return true;
      }
      return !dialog.isConnected || !isElementVisible(dialog);
    };

    await clickUntil(submitBtn, dialogGone, {
      attempts: 4,
      settleMs: 2500,
      label: 'Submit (' + addonName + ')',
    });
    logger('Submitted the ' + addonName + ' dialog');

    if (toastError) throw new Error('PORTAL_ERROR: ' + toastError);
    const closed = !dialog.isConnected || !isElementVisible(dialog);

    await waitForSkeletonsToDisappear(10000);
    await wait(250);

    // What actually matters is whether the cover went onto the quote; the
    // dialog staying up is only a symptom. Report the state of the card.
    const refreshedCard = findAddonCard(addonName) || card;
    const applied = isAddonApplied(refreshedCard);

    if (!closed) {
      const closeBtn = dialog.querySelector('.p-dialog-header-close');
      if (closeBtn && !applied) clickElement(closeBtn);
      if (!applied) {
        const fieldValue = dialog.querySelector('.p-inputnumber-input')?.value;
        throw new Error('PORTAL_ERROR: the ' + addonName + ' dialog stayed open after Submit and the cover was not added'
          + (fieldValue === undefined ? '' : ' (field read "' + fieldValue + '")'));
      }
      logger(addonName + ' applied, though its dialog lingered');
      return true;
    }

    // A cover that silently failed to attach would quote the wrong premium.
    if (!applied) {
      throw new Error(addonName + ' was submitted but the portal did not add it to the quote');
    }
    logger(addonName + ' applied');
    return true;
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

  async waitForToastError(messageText, timeoutMs = 3000) {
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

  async waitForSectionTitle(titleText, timeoutMs = 5000) {
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

  async applyUnderwritingDiscountValue(input, logger = console.log, value = undefined) {
    if (!input) return false;

    const desiredValue = String(value ?? ORIENTAL_DEFAULT_VALUES.underwritingDiscount).trim();
    logger('Setting underwriting discount: ' + desiredValue);

    // Same PrimeNG InputNumber as IDV: replace the contents rather than
    // typing over whatever the portal pre-filled.
    const applied = await setPrimeInputNumberValue(input, desiredValue);

    // Angular needs a moment to process the committed value.
    await wait(800);

    const finalValue = String(input.value || input.getAttribute('aria-valuenow') || '')
      .replace(/[^\d.]/g, '')
      .trim();
    logger('Underwriting discount after typing: "' + finalValue + '"');
    return applied && finalValue === desiredValue.replace(/[^\d.]/g, '');
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
    await wait(100);
    clickElement(submitButton);
    logger('✅ Clicked underwriting discount submit button');
    await wait(125);
    await waitForSkeletonsToDisappear(7500);
    await wait(250);
    return true;
  },

  async retryUnderwritingDiscountAfterConflict(root = document, logger = console.log, value = undefined) {
    logger('⚠️ Recovering from underwriting/NDP discount conflict');

    for (let backCount = 0; backCount < 3; backCount++) {
      const activeRoot = this.getActiveSlideRoot();
      const backIcon = activeRoot.querySelector('.policy-title .icon-back, .policy-header-box .icon-back');
      if (!backIcon) {
        logger(`⚠️ Discount recovery failed: back icon not found on step ${backCount + 1}`);
        return false;
      }

      clickElement(backIcon);
      await wait(175);
      await waitForSkeletonsToDisappear(6000);
      await wait(125);
    }

    const addOnsPage = await this.waitForSectionTitle('choose add-ons', 10000);
    if (!addOnsPage) {
      logger('⚠️ Discount recovery failed: Choose Add-Ons page not visible');
      return false;
    }

    const addOnsContinue = addOnsPage.querySelector('.policy-form-footer button.policy-btn');
    if (addOnsContinue && !addOnsContinue.disabled) {
      clickElement(addOnsContinue);
      await wait(125);
      await waitForSkeletonsToDisappear(6000);
      await wait(250);
    } else {
      const continued = await this.clickContinue(root);
      if (!continued) {
        logger('⚠️ Discount recovery failed: could not continue from Choose Add-Ons page');
        return false;
      }
    }

    const cpaCoversInput = await waitForElement('input[name="cpaCoverFlag"][value="false"]', { timeoutMs: 5000, root: document });
    if (cpaCoversInput) {
      clickElement(cpaCoversInput);
      await wait(100);
      await this.clickContinue(root);
      await wait(125);
    }

    const cpaPage = await this.waitForSectionTitle('confirm if cpa cover is not required', 10000);
    if (!cpaPage) {
      logger('⚠️ Discount recovery failed: CPA confirmation page not visible');
      return false;
    }

    const ownershipTypeInput = await waitForElement('input[name="ownershipUnder"][value="Individual"]', { timeoutMs: 5000, root: cpaPage });
    if (ownershipTypeInput) clickElement(ownershipTypeInput);
    await wait(50);

    const standalonePolicyInput = await waitForElement('input[name="haveCpaCover"][value="true"]', { timeoutMs: 5000, root: cpaPage });
    if (standalonePolicyInput) clickElement(standalonePolicyInput);
    await wait(50);

    const validDrivingLicenseInput = await waitForElement('input[name="validDrivingLicenseFlag"][value="false"]', { timeoutMs: 5000, root: cpaPage });
    if (validDrivingLicenseInput) clickElement(validDrivingLicenseInput);
    await wait(50);

    const oneYearCpaCoverInput = await waitForElement('input[name="cpaForOneYear"][value="false"]', { timeoutMs: 5000, root: cpaPage });
    if (oneYearCpaCoverInput) clickElement(oneYearCpaCoverInput);
    await wait(50);

    const cpaSubmitButton = cpaPage.querySelector('.policy-form-footer button.policy-btn');
    if (cpaSubmitButton && !cpaSubmitButton.disabled) {
      clickElement(cpaSubmitButton);
      await wait(125);
      await waitForSkeletonsToDisappear(6000);
      await wait(250);
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

    const discountInput = await waitForElement('input[placeholder="Underwriting Discount"]', { timeoutMs: 7500, root: discountPage });
    if (!discountInput) {
      logger('⚠️ Discount recovery failed: Underwriting Discount input not found');
      return false;
    }

    const applied = await this.applyUnderwritingDiscountValue(discountInput, logger, value);
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

  async submitUnderwritingDiscount(root = document, logger = console.log, value = undefined) {
    const activeRoot = this.getActiveSlideRoot();
    const underwritenDiscountInput = await waitForElement('input[placeholder="Underwriting Discount"]', { timeoutMs: 7500, root: activeRoot });
    if (!underwritenDiscountInput) {
      logger('Skipping underwriting discount');
      return true;
    }

    const applied = await this.applyUnderwritingDiscountValue(underwritenDiscountInput, logger, value);
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

    return this.retryUnderwritingDiscountAfterConflict(root, logger, value);
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
  async clickContinue(root = document, options = {}) {
    await AutomationPauseController.checkpoint();
    await waitForSkeletonsToDisappear(7500);

    const beforeSignature = getSlickActiveSignature();
    const beforeIndex = getSlickActiveIndex();
    const hasSlickSlider = beforeSignature !== 'none' || beforeIndex !== -1;
    const transitionTimeoutMs = options.transitionTimeoutMs ?? 2500;
    const maxRetries = options.maxRetries ?? 5;

    // The portal answers a bad step with an error popup. Reading it here is
    // what stops the run at the real failure instead of ten steps later.
    const assertNoPortalError = () => {
      const outcome = getVisibleOutcomeDialog();
      if (outcome && outcome.kind === 'error') {
        if (outcome.message.includes('Enter the details manually')) {
          throw new Error('MANUAL_VEHICLE_PROMPT: Oriental requested manual vehicle details again');
        }
        throw new Error('PORTAL_ERROR: ' + outcome.message);
      }
      return outcome;
    };

    const waitForAdvance = async () => {
      const deadline = Date.now() + transitionTimeoutMs;
      do {
        await wait(100);
        const outcome = assertNoPortalError();
        if (outcome && outcome.kind === 'success') return { advanced: true, outcome: 'success' };

        const afterSignature = getSlickActiveSignature();
        const afterIndex = getSlickActiveIndex();
        if (!hasSlickSlider || afterSignature !== beforeSignature || afterIndex !== beforeIndex) {
          // The portal can flip slides briefly before an async lookup reopens
          // a dialog, so re-check once the transition has settled.
          await wait(500);
          assertNoPortalError();
          return { advanced: true, outcome: null, afterIndex };
        }
      } while (Date.now() < deadline);
      return { advanced: false, outcome: null };
    };

    const findButton = () => {
      // Prefer the button in the active slide so sticky footers from other
      // slides and dialog Submit buttons are never hit by mistake.
      const activeSlide = getSlickActiveSlide();
      if (activeSlide) {
        const slideBtn = activeSlide.querySelector(
          '.policy-form-footer button.policy-btn, button.policy-btn, button.Confirm-Continue-btn'
        );
        if (slideBtn) return slideBtn;
      }
      const footerBtn = document.querySelector(
        '.policy-form-footer button.policy-btn, .payment-section .Confirm-Continue-btn, .payment-section button[type="submit"]'
      );
      if (footerBtn) return footerBtn;

      for (const text of ['Continue', 'Next']) {
        for (const scope of [root, document]) {
          const candidate = findElementByText('button', text, scope);
          if (candidate && !candidate.closest('.p-dialog') && !candidate.disabled) return candidate;
        }
      }
      return qs(ORIENTAL_SELECTORS.continueButton, root) || qs(ORIENTAL_SELECTORS.continueButton, document);
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      assertNoPortalError();
      scrollToBottom();
      await wait(125);

      const btn = findButton();
      if (!btn) {
        console.log('[clickContinue] No button found (attempt ' + attempt + '/' + maxRetries + ')');
        await wait(500);
        continue;
      }
      if (btn.disabled) {
        console.log('[clickContinue] Button disabled (attempt ' + attempt + '/' + maxRetries + ')');
        await wait(500);
        continue;
      }

      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(125);
      clickElement(btn);

      const { advanced } = await waitForAdvance();
      if (advanced) {
        console.log('\u2705 Continue advanced on attempt ' + attempt + ': ' + String(btn.innerText || '').trim());
        await wait(300);
        await waitForSkeletonsToDisappear(10000);
        await wait(250);
        return true;
      }
      console.log('[clickContinue] Click did not advance the slide (attempt ' + attempt + '/' + maxRetries + '), re-clicking');
      await wait(500);
    }

    if (!hasSlickSlider) {
      console.log('[clickContinue] No slick slider on this page; treating the click as successful');
      return true;
    }
    if (getSlickActiveSignature() !== beforeSignature) {
      console.log('[clickContinue] Slide advanced on the final check');
      return true;
    }
    console.log('\u26a0\ufe0f clickContinue: slide did not advance after ' + maxRetries + ' attempts');
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
      let approvalPending = false;
      if (!AutomationPauseController.isStepCompleted('form.sectionC')) {
        const sectionCResult = await this.fillSectionC(fd, null, logger);
        proposalNumber = sectionCResult?.proposalNumber ?? null;
        approvalPending = Boolean(sectionCResult?.approvalPending);
        AutomationPauseController.markStepComplete('form.sectionC');
      } else {
        logger('⏭️ Section C already completed, skipping');
      }

      return { success: true, proposalNumber, approvalPending };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') {
        console.log('%c[Automation] ⛔ Form automation stopped by admin', 'color: #ff0000; font-weight: bold;');
        return { success: false, error: 'Stopped by admin', stopped: true };
      }
      // Surface it on the panel: otherwise the badge stays on "Running" at
      // the step that threw, which is indistinguishable from a hang.
      AutomationPauseController.fail(e.message);
      return { success: false, error: e.message };
    }
  },
};

globalThis.OrientalForm = OrientalForm;
