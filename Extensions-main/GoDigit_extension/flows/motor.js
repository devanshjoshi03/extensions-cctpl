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
      logger('Vehicle model option was not found. Waiting for manual vehicle selection.');
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
        if (topNavigationReady && await hasAccountMenuContext()) {
          logger('Go Digit Motor Insurance navigation and agent details are ready.');
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
      () => this.findVisibleElement('#idvDetails input[formcontrolname="idv"]'),
      'Go Digit IDV field did not render after Get Quote',
      30000
    );

    const nilDepreciation = covers.nilDepreciation === true ||
      ['true', '1', 'yes'].includes(String(covers.nilDepreciation).trim().toLowerCase());
    if (nilDepreciation) {
      const addOnsLink = await this.waitForCondition(
        () => [...document.querySelectorAll('a.coverage_txt')]
          .find((element) => this.normalize(element.textContent) === 'motor own damage - add ons'),
        'Go Digit Motor Own Damage - Add Ons section was not found',
        15000
      );
      const addOnsSelector = addOnsLink.getAttribute('data-target');
      const addOnsSection = addOnsSelector && document.querySelector(addOnsSelector);
      if (!addOnsSection) throw new Error('Go Digit Motor Own Damage add-ons panel was not found');
      if (!addOnsSection.classList.contains('show')) {
        await AutomationPauseController.checkpoint('Open Motor Own Damage add-ons');
        addOnsLink.click();
      }
      const nilDepreciationCheckbox = await this.waitForCondition(() => {
        const row = [...addOnsSection.querySelectorAll('.subcoverMainDiv')]
          .find((element) => this.normalize(element.textContent).includes('parts depreciation protect'));
        return row?.querySelector('input[type="checkbox"]');
      }, 'Go Digit Parts Depreciation Protect add-on was not found', 15000);
      await this.setCheckbox(nilDepreciationCheckbox, true, 'Nil depreciation add-on');
      logger('Selected Parts Depreciation Protect for nil depreciation.');
    }

    if (vehicle.idv !== undefined && vehicle.idv !== null && String(vehicle.idv).trim() !== '') {
      const idv = Number(vehicle.idv);
      if (!Number.isFinite(idv) || idv <= 0) throw new Error('vehicleDetails.idv must be a positive number');
      if (Number(idvInput.value) !== idv) {
        await this.typeIntoField('#idvDetails input[formcontrolname="idv"]', idv, 'IDV', true);
        const updateButton = await this.waitForCondition(
          () => idvInput.closest('#idvDetails')?.querySelector('button[name="idvButton"]'),
          'Go Digit IDV Update button was not found',
          10000
        );
        await this.waitForCondition(
          () => !updateButton.disabled,
          'Go Digit IDV Update button did not enable for the supplied IDV',
          5000
        );
        await AutomationPauseController.checkpoint('Update IDV');
        updateButton.click();
        await wait(500);
        await this.waitForCondition(
          () => updateButton.disabled,
          'Go Digit IDV update did not complete',
          15000
        );
        logger(`Applied IDV ${idv}.`);
      } else {
        logger(`IDV ${idv} is already applied.`);
      }
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
    const checkbox = input.closest('mat-checkbox') || input;
    checkbox.click();
    await this.waitForCondition(() => input.checked === checked, `${label} checkbox did not update`);
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
    input.click();
    input.focus();
    await wait(1000);
    await this.typeText(input, value);
    if (this.normalize(input.value) !== this.normalize(value)) throw new Error(`${label} did not retain the supplied value`);
    input.blur();
    await wait(300);
  },
  async selectAutocomplete(selector, value, label, expectedModel, typeAfterClick = false, expectedMake) {
    if (!value) return;
    await AutomationPauseController.checkpoint(`Select ${label}`);
    const input = await this.waitForElement(selector);
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
    control.click();
    const expected = this.normalize(value);
    const option = await this.waitForCondition(() => {
      const options = [...document.querySelectorAll('.cdk-overlay-pane mat-option, [role="listbox"] [role="option"]')];
      return options.find((candidate) => this.normalize(candidate.textContent) === expected);
    }, `${label} option "${value}" was not found`, 10000);
    option.click();
  },
  normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); },
  findVisibleElement(selector) {
    return [...document.querySelectorAll(selector)].find((element) =>
      element.offsetParent !== null && !element.disabled
    ) || null;
  },
  async waitForElement(selector, timeoutMs = 20000) {
    return this.waitForCondition(() => {
      return this.findVisibleElement(selector);
    }, `Go Digit field not found: ${selector}`, timeoutMs);
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