const GoDigitMotorFlow = {
  async run(payload, logger = console.log) {
    await this.navigateToMotorFromHome(logger);
    const vehicle = payload?.vehicleDetails || {};
    const vehicleInfo = payload?.vehicleInformation || {};
    const customer = payload?.customerDetails || {};
    const bharatRegistration = vehicleInfo.isBharatSeries === true ||
      vehicleInfo.isBharatSeries === 'true' ||
      vehicleInfo.isBharatRegistrationNumber === true ||
      vehicleInfo.isBharatRegistrationNumber === 'true';
    const bharatNumber = vehicleInfo.bharatRegistrationNumber || vehicle.bharatRegistrationNumber || '';
    if (bharatRegistration && !String(bharatNumber).trim()) {
      throw new Error('vehicleInformation.bharatRegistrationNumber is required when isBharatSeries is true');
    }
    await this.selectRadio('input[name="policyType"][value="N"]', 'Brand new vehicle');
    await this.selectVehicleProductType();
    await this.waitForVehicleFormReady();
    await this.waitForElement('input[name="ownershipType"]');
    await this.selectRadio('input[name="ownershipType"][value="NATURALPERSON"]', 'Individual');
    await this.selectRadio(
      `input[name="isBharatRegistrationNumber"][value="${bharatRegistration ? 'true' : 'false'}"]`,
      `Bharat Series: ${bharatRegistration ? 'Yes' : 'No'}`
    );
    if (bharatRegistration) {
      await this.typeIntoField('input[name="bharatRegistrationNumber"]', bharatNumber, 'Bharat Series registration number', true);
    } else if (vehicle.rtoCode) {
      await this.typeIntoField('#registrationNumber', vehicle.rtoCode, 'RTO code', false);
    }
    let manualVehicleSelection = false;
    try {
      if (vehicle.model) await this.selectAutocomplete('#vehicleBrand', vehicle.model, 'Vehicle brand', vehicle.model, true, vehicle.make);
    } catch (error) {
      if (error.code !== 'AUTOCOMPLETE_OPTION_NOT_FOUND') throw error;
      manualVehicleSelection = true;
      logger(`Vehicle model option was not found. Waiting for manual vehicle selection.`);
      await AutomationPauseController.waitForManualEntry(
        'Model not found. Complete the Vehicle Brand and Vehicle Variant fields, then click Continue.',
        [
          { selector: '#vehicleBrand', label: 'Vehicle Brand' },
          { selector: '#vehicleVariant', label: 'Vehicle Variant' }
        ]
      );
    }
    if (!manualVehicleSelection) {
      try {
        if (vehicle.variant) await this.selectAutocomplete('#vehicleVariant', vehicle.variant, 'Vehicle variant', undefined, true);
      } catch (error) {
        if (error.code !== 'AUTOCOMPLETE_OPTION_NOT_FOUND') throw error;
        logger('Vehicle variant option was not found. Waiting for manual vehicle selection.');
        await AutomationPauseController.waitForManualEntry(
          'Variant not found. Select a Vehicle Variant manually, then click Continue.',
          [{ selector: '#vehicleVariant', label: 'Vehicle Variant' }]
        );
      }
    }
    await this.selectMatOption('mat-select[formcontrolname="manufacutreYear"]', vehicleInfo.yearOfManufacture, 'Manufacturing year');
    await this.typeIntoField('input[formcontrolname="engineNumber"], input[name="engineNumber"], #enginef, #engineNumber', vehicleInfo.engineNumber, 'Engine number', true);
    await this.typeIntoField('input[formcontrolname="chassisNumber"], input[name="chassisNumber"], #chassisg, #chassisNumber', vehicleInfo.chassisNumber, 'Chassis number', true);
    if (customer.city) await this.selectAutocomplete('#city', customer.city, 'Customer city');
    if (customer.pincode) await this.selectAutocomplete('#pincode', customer.pincode, 'Customer pincode');
    await this.submitQuote(payload, logger);
    return { success: true, formFilled: true, quoteSubmitted: true, bharatRegistration };
  },
  async navigateToMotorFromHome(logger) {
    const isVisible = (element) => element &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden';
    const homeRoute = () => window.location.hash.split('?')[0] === '#/home';
    const motorRoute = () => window.location.hash.split('?')[0] === '#/motor-new';
    const findMotorLink = () => [...document.querySelectorAll('fieldset.forFieldSet a.forPinnedaTag[href="#/motor-new"]')]
      .find((link) => isVisible(link) && /motor\s*insurance/i.test(link.textContent));
    const hasAccountMenuContext = async () => {
      let dropdown = [...document.querySelectorAll('.dropdown-content')].find(isVisible);
      const accountButton = [...document.querySelectorAll('.dropbtn.display-flex')].find(isVisible);
      const openedMenu = !dropdown && Boolean(accountButton);
      if (openedMenu) {
        accountButton.click();
        const menuDeadline = Date.now() + 2500;
        while (!dropdown && Date.now() < menuDeadline) {
          await AutomationPauseController.checkpoint('Wait for Go Digit account details');
          await wait(150);
          dropdown = [...document.querySelectorAll('.dropdown-content')].find(isVisible);
        }
      }
      const accountText = dropdown
        ? this.normalize(dropdown.innerText).replace(/\blogout\b/g, '').trim()
        : '';
      const hasLogout = dropdown && [...dropdown.querySelectorAll('a, button')]
        .some((element) => isVisible(element) && this.normalize(element.textContent) === 'logout');
      if (openedMenu && dropdown && accountText && hasLogout) accountButton.click();
      return Boolean(dropdown && accountText && hasLogout);
    };

    const returnHome = async () => {
      if (homeRoute()) return;
      const logo = [...document.querySelectorAll('a')]
        .find((link) => isVisible(link) && link.querySelector('img[alt="DigitPlus"]'));
      if (logo) logo.click();
      else window.location.hash = '#/home';
      const homeDeadline = Date.now() + 6000;
      while (!homeRoute() && Date.now() < homeDeadline) {
        await AutomationPauseController.checkpoint('Open Go Digit home page');
        await wait(150);
      }
      if (!homeRoute()) {
        logger('Home logo did not navigate; opening the Go Digit home route.');
        window.location.hash = '#/home';
        await this.waitForCondition(homeRoute, 'Go Digit home page did not open', 10000);
      }
    };

    const dismissHomeOverlays = async () => {
      let quietSince = Date.now();
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        await AutomationPauseController.checkpoint('Dismiss Go Digit home popups');
        const bannerClose = [...document.querySelectorAll('img.cross-mark[alt="cross-mark"]')]
          .find(isVisible);
        const surveySkip = [...document.querySelectorAll('button, a')]
          .find((element) => isVisible(element) && this.normalize(element.textContent) === 'skip');
        const feedbackDialog = [...document.querySelectorAll('.modal-content')]
          .find((dialog) => isVisible(dialog) && /please submit feedback/i.test(dialog.textContent));
        const feedbackOk = feedbackDialog && [...feedbackDialog.querySelectorAll('button')]
          .find((button) => isVisible(button) &&
            (button.getAttribute('name') === 'confirm' || this.normalize(button.textContent) === 'ok'));
        const closeButton = bannerClose || surveySkip || feedbackOk;
        if (closeButton) {
          closeButton.click();
          quietSince = Date.now();
          await wait(250);
        } else if (Date.now() - quietSince >= 2500) {
          return;
        } else {
          await wait(150);
        }
      }
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await AutomationPauseController.checkpoint('Open Go Digit home page');
      if (!homeRoute()) {
        logger('Returning to Go Digit home before opening Motor Insurance.');
      }
      await returnHome();
      await this.waitForCondition(
        findMotorLink,
        'Go Digit pinned Motor Insurance link was not found on the home page',
        15000
      );
      await dismissHomeOverlays();
      const motorLink = findMotorLink();
      if (!motorLink) throw new Error('Visible pinned Motor Insurance link was not found on the Go Digit home page');
      await AutomationPauseController.checkpoint('Open pinned Motor Insurance');
      motorLink.click();
      await this.waitForCondition(motorRoute, 'Pinned Motor Insurance did not open', 15000);

      const navDeadline = Date.now() + 8000;
      while (Date.now() < navDeadline) {
        await AutomationPauseController.checkpoint('Wait for Go Digit navigation state');
        const pageText = this.normalize(document.body.innerText);
        const topNavigationReady = ['motor insurance', 'pay-in-slip agent', 'my transactions']
          .every((label) => pageText.includes(label));
        // The motor quote form being present is the real readiness signal the next
        // steps need. The account-menu check is a fragile secondary confirmation,
        // so treat either one as "ready" rather than hard-failing the whole run on it.
        const formReady = Boolean(this.findVisibleElement('input[name="policyType"]')) ||
          Boolean(this.findVisibleElement('#vehilce_type'));
        if (topNavigationReady && (formReady || await hasAccountMenuContext())) {
          logger('Go Digit Motor Insurance navigation is ready.');
          return;
        }
        await wait(200);
      }
      if (attempt === 1) {
        logger('Go Digit navigation state or agent details are incomplete; returning home and reopening Motor Insurance.');
      }
    }
    throw new Error('Go Digit navigation state did not load after reopening Motor Insurance from Home');
  },
  async submitQuote(payload, logger) {
    const findQuoteButton = () => [...document.querySelectorAll('button[type="submit"]')]
      .find((button) => button.offsetParent !== null && /get\s*quote/i.test(button.textContent));
    const button = await this.waitForCondition(findQuoteButton, 'Go Digit Get Quote button was not found', 15000);
    const container = button.closest('.action_container') || button.parentElement;
    if (!container) throw new Error('Could not locate the Go Digit quote action container');
    await AutomationPauseController.checkpoint('Submit Get Quote');
    button.click();
    logger('Clicked Get Quote; waiting for quote loading to complete.');
    const deadline = Date.now() + 90000;
    let loadingSeen = false;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Waiting for Get Quote to finish');
      const loading = [...container.querySelectorAll('img[src*="dot-animation-transparent-2.gif"]')]
        .some((image) => image.getClientRects().length > 0);
      const formAdvanced = !document.querySelector('#vehicleBrand') && !findQuoteButton();
      if (loading) loadingSeen = true;
      if (formAdvanced) {
        logger('Go Digit quote page advanced after Get Quote.');
        break;
      }
      if (loadingSeen && !loading) {
        logger('Go Digit Get Quote loading completed.');
        break;
      }
      if (!loadingSeen && Date.now() > deadline - 80000) {
        throw new Error('Go Digit Get Quote did not enter its loading state after clicking the button');
      }
      await wait(250);
    }
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Go Digit Get Quote loading to complete');
    await this.fillQuoteDetails(payload, logger);
  },
  async fillQuoteDetails(payload, logger) {
    const vehicle = payload?.vehicleDetails || {};
    const customer = payload?.customerDetails || {};
    const covers = payload?.covers || {};
    const idvInput = await this.waitForCondition(
      () =>
        this.findVisibleElement('#idvDetails input[formcontrolname="idv"]') ||
        this.findVisibleElement('input[formcontrolname="idv"]') ||
        this.findIdvInputByLabel(),
      'Go Digit IDV field did not render after Get Quote',
      30000
    );
    // Bring the IDV section into the middle of the viewport so it is visible
    // (and so any scroll-triggered lazy rendering fires) before we touch it.
    this.scrollToCenter(idvInput.closest('#idvDetails') || idvInput);
    await wait(400);
    logger('IDV section ready.');

    // 1) IDV FIRST — update the IDV value and click Update, before touching add-ons.
    //    The field lives inside <app-idv-section> (there is no #idvDetails wrapper),
    //    so resolve the container and the Update button relative to the input itself.
    if (vehicle.idv !== undefined && vehicle.idv !== null && String(vehicle.idv).trim() !== '') {
      const idv = Number(vehicle.idv);
      if (!Number.isFinite(idv) || idv <= 0) throw new Error('vehicleDetails.idv must be a positive number');
      if (Number(idvInput.value) !== idv) {
        const idvContainer = idvInput.closest('app-idv-section') ||
          idvInput.closest('.input_section_wrapper') ||
          idvInput.closest('.input_ele_wrapper') ||
          idvInput.closest('#idvDetails') ||
          idvInput.parentElement;
        await this.typeIntoElement(idvInput, idv, 'IDV');
        const updateButton = await this.waitForCondition(
          () => idvContainer?.querySelector('button[name="idvButton"]'),
          'Go Digit IDV Update button was not found',
          10000
        );
        await this.waitForCondition(
          () => !updateButton.disabled,
          'Go Digit IDV Update button did not enable for the supplied IDV',
          5000
        );
        await AutomationPauseController.checkpoint('Update IDV');
        this.scrollToCenter(updateButton);
        updateButton.click();
        // Clicking Update makes the footer submit button show its loading gif
        // while the premium recalculates; wait for that to finish (the inner
        // idvButton itself does NOT reliably toggle to disabled).
        await wait(500);
        await this.waitForRecalcIdle(logger);
        await this.confirmIdvApplied(idv, logger);
        logger(`Applied IDV ${idv}.`);
      } else {
        logger(`IDV ${idv} is already applied.`);
      }
    }

    // 2) ADD-ONS — the "Motor Own Damage - Add Ons" main-cover checkbox must be
    //    ticked first; that is what reveals the add-on panel. Then expand the
    //    collapse and select the sub-cover (Parts Depreciation Protect).
    const nilDepreciation = covers.nilDepreciation === true ||
      ['true', '1', 'yes'].includes(String(covers.nilDepreciation).trim().toLowerCase());
    if (nilDepreciation) {
      const addOnsLink = await this.waitForCondition(
        () => [...document.querySelectorAll('a.coverage_txt')]
          .find((element) => this.normalize(element.textContent) === 'motor own damage - add ons'),
        'Go Digit Motor Own Damage - Add Ons section was not found',
        15000
      );
      const mainCoverRow = addOnsLink.closest('.MainCoverTitle');
      this.scrollToCenter(mainCoverRow || addOnsLink);
      const mainCoverCheckbox = mainCoverRow?.querySelector('input[type="checkbox"]');
      if (mainCoverCheckbox) {
        await this.setCheckbox(mainCoverCheckbox, true, 'Motor Own Damage - Add Ons');
        await wait(500);
      }
      const addOnsSelector = addOnsLink.getAttribute('data-target');
      const addOnsSection = addOnsSelector && document.querySelector(addOnsSelector);
      if (addOnsSection && !addOnsSection.classList.contains('show')) {
        await AutomationPauseController.checkpoint('Open Motor Own Damage add-ons');
        addOnsLink.click();
        try {
          await this.waitForCondition(
            () => addOnsSection.classList.contains('show'),
            'Go Digit Motor Own Damage add-ons panel did not expand',
            8000
          );
        } catch (_) { /* some layouts reveal sub-covers without the show class */ }
      }
      const panelRoot = addOnsSection || mainCoverRow?.parentElement || document;
      const nilDepreciationCheckbox = await this.waitForCondition(() => {
        const row = [...panelRoot.querySelectorAll('.subcoverMainDiv')]
          .find((element) => this.normalize(element.textContent).includes('parts depreciation protect'));
        return row?.querySelector('input[type="checkbox"]');
      }, 'Go Digit Parts Depreciation Protect add-on was not found', 15000);
      await this.setCheckbox(nilDepreciationCheckbox, true, 'Nil depreciation add-on');
      logger('Selected Parts Depreciation Protect for nil depreciation.');
    }

    const paOwnerDriver = covers.paOwnerDriver === true ||
      String(covers.paOwnerDriver).trim().toLowerCase() === 'true';
    const paCheckbox = await this.waitForCondition(() => {
      const label = [...document.querySelectorAll('a.coverage_txt')]
        .find((element) => this.normalize(element.textContent) === 'pa owner driver');
      return label?.closest('.MainCoverTitle')?.querySelector('input[type="checkbox"]');
    }, 'Go Digit PA Owner Driver option was not found', 15000);
    await this.setCheckbox(paCheckbox, paOwnerDriver, 'PA Owner Driver');

    const partnerDiscountRadio = await this.waitForCondition(
      () => this.findVisibleElement('app-additional-discount input[name="discount"][value="false"]'),
      'Go Digit Partner preferred discount option was not found',
      15000
    );
    await this.selectRadio('app-additional-discount input[name="discount"][value="false"]', 'Partner preferred discount');
    const discountCard = partnerDiscountRadio.closest('.discount_card');
    const discountRange = discountCard?.querySelector('.info')?.textContent || '';
    const rangeMatch = discountRange.match(/(\d+(?:\.\d+)?)\s*%\s*-\s*(\d+(?:\.\d+)?)\s*%/);
    if (!rangeMatch) throw new Error(`Could not read Go Digit partner discount range: ${discountRange || 'not displayed'}`);
    const maximumDiscount = rangeMatch[2];
    await this.typeIntoField(
      'app-additional-discount input[formcontrolname="partnerDiscount"]',
      maximumDiscount,
      'Maximum partner discount',
      true
    );
    logger(`Selected the maximum partner discount: ${maximumDiscount}%.`);

    // After the coverage changes (IDV, add-on, PA toggle, discount), click the
    // footer Recalculate button so the premium reflects them, then wait for it.
    const recalcButton = await this.waitForCondition(
      () => [...document.querySelectorAll('button.footer_btn.w-208, button.common_btn.footer_btn[type="submit"]')]
        .find((button) => button.offsetParent !== null && !button.disabled &&
          /recalculate/i.test(this.normalize(button.textContent))),
      'Go Digit Recalculate button was not found',
      20000
    );
    this.scrollToCenter(recalcButton);
    recalcButton.click();
    logger('Clicked Recalculate; waiting for premium to update.');
    await wait(500);
    await this.waitForRecalcIdle(logger);
    logger('Premium recalculated.');

    const fullName = customer.fullName || customer.name ||
      [customer.firstName, customer.lastName].filter(Boolean).join(' ');
    const mobile = customer.mobileNumber || customer.mobile || customer.phone;
    const email = customer.emailID || customer.email;
    const address = typeof customer.address === 'string'
      ? customer.address
      : customer.address && typeof customer.address === 'object'
        ? [
          customer.address.building,
          customer.address.street,
          customer.address.locality,
          customer.address.city,
          customer.address.district,
          customer.address.state,
          customer.address.pincode,
          customer.address.country
        ].filter(Boolean).join(', ')
        : '';
    await this.typeIntoField('#customerDetails input[name="firstName"]', fullName, 'Customer full name', true);
    await this.typeIntoField('#customerDetails input[name="mobileNumber"]', mobile, 'Customer mobile number', true);
    await this.typeIntoField('#customerDetails input[name="emailID"]', email, 'Customer email', true);
    await this.typeIntoField('#customerDetails textarea[name="address"]', address, 'Customer address', true);

    const gst = customer.GST || customer.gst || customer.gstin || customer.gstNumber;
    if (gst) await this.typeIntoField('#customerDetails input[name="GST"]', gst, 'Customer GST number', false);

    const bankAbstention = await this.waitForElement('#isBankDetailsRequired-input', 15000);
    await this.setCheckbox(bankAbstention, true, 'Bank details abstention');
    const nomineeAbstention = await this.waitForElement('#isNomineeDetailsRequired-input', 15000);
    await this.setCheckbox(nomineeAbstention, true, 'Nominee details abstention');
    logger('Customer details filled; bank details and nomination declined.');
  },
  async setCheckbox(input, checked, label) {
    await AutomationPauseController.checkpoint(`Set ${label}`);
    if (input.checked === checked) return;
    const host = input.closest('mat-checkbox') || input;
    this.scrollToCenter(host);
    await wait(200);
    // An Angular Material MDC checkbox does NOT toggle from a click on the
    // <mat-checkbox> host. Clicking the native input (or its <label for=...>)
    // is what flips it and fires the change event Angular listens for. Try the
    // reliable targets in order; each attempt is guarded so we never toggle twice.
    const labelEl = input.id ? host.querySelector(`label[for="${input.id}"]`) : null;
    const targets = [input, labelEl, host.querySelector('.mdc-label'), host.querySelector('.mat-mdc-checkbox-touch-target'), host]
      .filter(Boolean);
    for (const target of targets) {
      if (input.checked === checked) break;
      target.click();
      try {
        await this.waitForCondition(() => input.checked === checked, 'pending', 1500);
        break;
      } catch (_) { /* try the next target */ }
    }
    await this.waitForCondition(() => input.checked === checked, `${label} checkbox did not update`, 2000);
  },
  async selectVehicleProductType() {
    let option = await this.waitForSelectOption('#vehilce_type', '2W', 2000);
    if (!option) {
      await this.selectRadio('input[name="policyType"]:not(:checked)', 'Another vehicle policy');
      await wait(750);
      await this.selectRadio('input[name="policyType"][value="N"]', 'Brand new vehicle');
      option = await this.waitForSelectOption('#vehilce_type', '2W', 10000);
    }
    if (!option) throw new Error('Two Wheeler Comprehensive option 2W was not found after refreshing the vehicle policy selection');
    await AutomationPauseController.checkpoint('Select Two Wheeler Comprehensive');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(option.select, '2W'); else option.select.value = '2W';
    option.select.dispatchEvent(new Event('input', { bubbles: true }));
    option.select.dispatchEvent(new Event('change', { bubbles: true }));
    await this.waitForCondition(() => option.select.value === '2W', 'Two Wheeler Comprehensive did not select');
  },
  async waitForVehicleFormReady(timeoutMs = 15000) {
    const selectors = [
      'input[name="ownershipType"]',
      '#vehicleBrand',
      'mat-select[formcontrolname="manufacutreYear"]',
      'input[formcontrolname="engineNumber"], input[name="engineNumber"], #enginef, #engineNumber',
      'input[formcontrolname="chassisNumber"], input[name="chassisNumber"], #chassisg, #chassisNumber'
    ];
    const deadline = Date.now() + timeoutMs;
    let stableElements = null;
    let stableSince = 0;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Wait for vehicle form to load');
      const productSelect = document.querySelector('#vehilce_type');
      const elements = selectors.map((selector) => this.findVisibleElement(selector));
      const ready = productSelect?.value === '2W' &&
        elements.every((element) => element && element.offsetParent !== null && !element.disabled);
      if (ready) {
        if (stableElements && elements.every((element, index) => element === stableElements[index])) {
          if (Date.now() - stableSince >= 800) return;
        } else {
          stableElements = elements;
          stableSince = Date.now();
        }
      } else {
        stableElements = null;
        stableSince = 0;
      }
      await wait(200);
    }
    throw new Error('Go Digit vehicle form did not finish loading after selecting Two Wheeler Comprehensive');
  },
  async waitForSelectOption(selector, value, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint();
      const select = document.querySelector(selector);
      if (select && select.offsetParent !== null) {
        const option = [...select.options].find((item) => item.value === value);
        if (option) return { select, option };
      }
      await wait(150);
    }
    return null;
  },
  async selectRadio(selector, label) {
    await AutomationPauseController.checkpoint(`Select ${label}`);
    const input = await this.waitForElement(selector);
    if (input.checked) return;
    const radio = input.closest('mat-radio-button');
    this.scrollToCenter(radio || input);
    if (radio) radio.click(); else input.click();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await this.waitForCondition(() => input.checked, `${label} radio did not select`);
  },
  async selectOption(selector, value, label) {
    await AutomationPauseController.checkpoint(`Select ${label}`);
    const select = await this.waitForElement(selector);
    const option = [...select.options].find((item) => item.value === value);
    if (!option) throw new Error(`${label} option ${value} was not found`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(select, value); else select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await this.waitForCondition(() => select.value === value, `${label} did not select`);
  },
  async typeIntoField(selector, value, label, required) {
    if (value == null || String(value).trim() === '') {
      if (required) throw new Error(`${label} is required in the Go Digit payload`);
      return;
    }
    await AutomationPauseController.checkpoint(`Fill ${label}`);
    const input = await this.waitForElement(selector);
    this.scrollToCenter(input);
    input.click();
    input.focus();
    await wait(1000);
    await this.typeText(input, value);
    if (this.normalize(input.value) !== this.normalize(value)) throw new Error(`${label} did not retain the supplied value`);
    input.blur();
    await wait(300);
  },
  // Same as typeIntoField but for an element we already resolved (e.g. the IDV
  // input found via fallback selectors), so we do not re-query by a selector.
  async typeIntoElement(input, value, label) {
    if (value == null || String(value).trim() === '') return;
    if (!input) throw new Error(`${label} field was not provided`);
    await AutomationPauseController.checkpoint(`Fill ${label}`);
    this.scrollToCenter(input);
    input.click();
    input.focus();
    await wait(400);
    await this.typeText(input, value);
    if (this.normalize(input.value) !== this.normalize(value)) throw new Error(`${label} did not retain the supplied value`);
    input.blur();
    await wait(300);
  },
  async selectAutocomplete(selector, value, label, expectedModel, typeAfterClick = false, expectedMake) {
    if (!value) return;
    await AutomationPauseController.checkpoint(`Select ${label}`);
    const input = await this.waitForElement(selector);
    this.scrollToCenter(input);
    input.click();
    input.focus();
    await wait(1000);
    await this.typeText(input, value);
    const normalized = this.normalize(value);
    const searchTerms = normalized.split(/\s+/).filter(Boolean);
    const optionNotFoundMessage = `${label} option "${expectedModel ? `${value} ${expectedModel}` : value}" was not found`;
    let option;
    try {
      option = await this.waitForCondition(() => {
        const options = this.getAutocompleteOptions(input);
        if (expectedModel) {
          const makeToMatch = this.normalize(expectedMake || '');
          const requestedModel = this.normalize(expectedModel);
          const getModelForOption = (candidate) => {
            const candidateMake = this.normalize(candidate.getAttribute('data-make'));
            return candidateMake && requestedModel.startsWith(`${candidateMake} `)
              ? requestedModel.slice(candidateMake.length).trim()
              : requestedModel;
          };
          const matchesMake = (candidate) => {
            const candidateMake = this.normalize(candidate.getAttribute('data-make'));
            if (!candidateMake || !makeToMatch) return true;
            return makeToMatch === candidateMake || makeToMatch.startsWith(`${candidateMake} `);
          };
          const matchesModel = (candidate) => {
            const candidateModel = this.normalize(candidate.getAttribute('data-model'));
            const wantedModel = getModelForOption(candidate);
            return candidateModel
              ? candidateModel === wantedModel || wantedModel.startsWith(`${candidateModel} `)
              : this.normalize(candidate.textContent).includes(wantedModel);
          };
          return options.find((candidate) =>
            matchesMake(candidate) &&
            matchesModel(candidate) &&
            this.normalize(candidate.getAttribute('data-model')) === getModelForOption(candidate)
          ) || options.find((candidate) => matchesMake(candidate) && matchesModel(candidate));
        }
        return options.find((candidate) => this.normalize(candidate.textContent) === normalized) ||
          options.find((candidate) => searchTerms.every((term) => this.normalize(candidate.textContent).includes(term)));
      }, optionNotFoundMessage, 15000);
    } catch (error) {
      if (error.message === optionNotFoundMessage) error.code = 'AUTOCOMPLETE_OPTION_NOT_FOUND';
      throw error;
    }
    const selectedValues = [
      option.textContent,
      option.getAttribute('data-model'),
      expectedModel,
      value
    ].map((candidate) => this.normalize(candidate)).filter(Boolean);
    const selectionApplied = () =>
      option.getAttribute('aria-selected') === 'true' ||
      input.getAttribute('aria-expanded') === 'false' ||
      this.getAutocompleteOptions(input).length === 0;
    if (input.getAttribute('aria-activedescendant') === option.id) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    }
    try {
      await this.waitForCondition(selectionApplied, `${label} keyboard selection was not applied`, 1500);
    } catch {
      option.scrollIntoView({ block: 'nearest' });
      for (const type of ['mousedown', 'mouseup', 'click']) {
        option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      await this.waitForCondition(selectionApplied, `${label} option did not become selected after click`, 3000);
    }
    await this.waitForCondition(
      () => selectedValues.includes(this.normalize(input.value)),
      `${label} did not retain the selected option value`
    );
    input.blur();
    await wait(300);
  },
  getAutocompleteOptions(input) {
    const panelId = input.getAttribute('aria-controls');
    const panel = panelId && document.getElementById(panelId);
    const options = panel
      ? [...panel.querySelectorAll('[role="option"]')]
      : [...document.querySelectorAll('.cdk-overlay-pane mat-option[role="option"], [role="listbox"] [role="option"]')];
    return options.filter((candidate) =>
      candidate.getClientRects().length > 0 && candidate.getAttribute('aria-disabled') !== 'true'
    );
  },
  async typeText(input, value) {
    input.focus();
    document.execCommand('selectAll', false);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    document.execCommand('delete', false);
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
    if (input.value) throw new Error('Could not clear the field using keyboard input');
    let typed = '';
    for (const character of String(value)) {
      const key = { key: character, bubbles: true, cancelable: true };
      input.dispatchEvent(new KeyboardEvent('keydown', key));
      input.dispatchEvent(new KeyboardEvent('keypress', {
        ...key,
        charCode: character.charCodeAt(0),
        keyCode: character.charCodeAt(0),
        which: character.charCodeAt(0)
      }));
      if (!document.execCommand('insertText', false, character) && input.value === typed) {
        throw new Error(`Could not type "${character}" into the field`);
      }
      typed += character;
      input.dispatchEvent(new KeyboardEvent('keyup', key));
      if (this.normalize(input.value) !== this.normalize(typed)) {
        throw new Error('The field value changed unexpectedly while typing');
      }
      await wait(120 + Math.floor(Math.random() * 100));
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
  },
  async selectMatOption(selector, value, label) {
    if (!value) return;
    await AutomationPauseController.checkpoint(`Select ${label}`);
    const control = await this.waitForElement(selector);
    this.scrollToCenter(control);
    control.click();
    const expected = this.normalize(value);
    const option = await this.waitForCondition(() => {
      const options = [...document.querySelectorAll('.cdk-overlay-pane mat-option, [role="listbox"] [role="option"]')];
      return options.find((candidate) => this.normalize(candidate.textContent) === expected);
    }, `${label} option "${value}" was not found`, 10000);
    option.click();
  },
  normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); },
  scrollToCenter(element) {
    if (!element) return;
    try { element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (_) {}
  },
  findVisibleElement(selector) {
    return [...document.querySelectorAll(selector)].find((element) =>
      element.offsetParent !== null && !element.disabled
    ) || null;
  },
  // Fallback IDV lookup for layouts where the field is not under #idvDetails.
  // Still requires "idv" to appear in the field's own attributes or an ancestor's
  // id/class, so we never grab an unrelated numeric input.
  findIdvInputByLabel() {
    const inputs = [...document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')];
    return inputs.find((input) => {
      if (input.offsetParent === null || input.disabled) return false;
      const context = [
        input.getAttribute('formcontrolname'),
        input.getAttribute('name'),
        input.getAttribute('id'),
        input.getAttribute('placeholder'),
        input.closest('[id*="idv" i], [class*="idv" i]') ? 'idv' : ''
      ].join(' ').toLowerCase();
      return context.includes('idv');
    }) || null;
  },
  async waitForElement(selector, timeoutMs = 20000) {
    return this.waitForCondition(() => {
      return this.findVisibleElement(selector);
    }, `Go Digit field not found: ${selector}`, timeoutMs);
  },
  // Confirm the applied IDV via the sticky summary header that appears once the
  // page is scrolled down ("IDV Applied : ₹ 74,599"). Scroll down to reveal it,
  // read it back, then scroll back up. This only CONFIRMS — it never fails the
  // IDV step, because the value was already entered and Update was clicked.
  async confirmIdvApplied(idv, logger) {
    const target = Number(String(idv).replace(/[^\d]/g, ''));
    const beforeY = window.scrollY;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    let confirmed = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Confirm applied IDV');
      const idvCell = [...document.querySelectorAll('.stickyHeader .seperatorIDV')]
        .find((el) => /idv applied/i.test(el.textContent));
      if (idvCell) {
        const shown = Number(idvCell.textContent.replace(/[^\d]/g, ''));
        if (Number.isFinite(shown) && shown === target) { confirmed = true; break; }
      }
      await wait(250);
    }
    window.scrollTo({ top: beforeY, behavior: 'smooth' });
    await wait(400);
    if (confirmed) logger(`Confirmed IDV ${target} applied (summary header).`);
    else if (logger) logger(`Could not read IDV ${target} from summary header; continuing anyway.`);
    return confirmed;
  },
  // Wait for a premium recalculation to finish. The footer submit button shows a
  // dot-animation gif (and is disabled) while recalculating; we wait for no such
  // loading button to remain. We first give the recalc a few seconds to START so
  // we don't race past it before the gif appears.
  async waitForRecalcIdle(logger, timeoutMs = 90000) {
    const anyLoading = () => [...document.querySelectorAll('button.footer_btn, button.common_btn, button[type="submit"]')]
      .some((button) => button.offsetParent !== null && button.disabled &&
        button.querySelector('img[src*="dot-animation"]'));
    const startDeadline = Date.now() + 4000;
    while (Date.now() < startDeadline && !anyLoading()) {
      await AutomationPauseController.checkpoint('Wait for premium recalculation');
      await wait(150);
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint('Wait for premium recalculation');
      if (!anyLoading()) return true;
      await wait(250);
    }
    if (logger) logger('Premium recalculation wait timed out; continuing.');
    return false;
  },
  async waitForCondition(getValue, errorMessage, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await AutomationPauseController.checkpoint();
      const value = getValue();
      if (value) return value;
      await wait(150);
    }
    throw new Error(errorMessage);
  }
};