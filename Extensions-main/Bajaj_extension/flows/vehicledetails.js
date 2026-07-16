// Bajaj General Insurance - Vehicle Details Flow
// Handles vehicle details form automation on motorload.do page

// Inline <script> can be blocked by CSP; MAIN-world inject is done via background + scripting API.
function bajajInjectPageDialogLock() {
  try {
    const root = document.head || document.documentElement;
    if (!root) return;

    const script = document.createElement('script');
    script.setAttribute('data-bajaj-page-dialog-lock', '');
    script.textContent =
      '(function(){' +
      'var n=function(){};' +
      'var t=function(){return true;};' +
      'try{if(window.__bajajDlgIv)clearInterval(window.__bajajDlgIv);}catch(e){}' +
      'window.alert=n;window.confirm=t;window.prompt=n;' +
      'try{Window.prototype.alert=n;Window.prototype.confirm=t;Window.prototype.prompt=n;}catch(e){}' +
      'window.__bajajDlgIv=setInterval(function(){try{window.alert=n;window.confirm=t;window.prompt=n;}catch(e){}},100);' +
      '})();';

    root.appendChild(script);
    script.remove();
  } catch (e) {
    console.warn('[Bajaj] page dialog lock inject failed:', e);
  }
}

function bajajInjectMainWorldDialogLock() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'INJECT_MAIN_WORLD_DIALOG_LOCK' }, (r) => {
      if (chrome.runtime.lastError) {
        console.warn('[Bajaj] MAIN-world dialog lock:', chrome.runtime.lastError.message);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(r || { ok: false });
      }
    });
  });
}

(async function bajajInitDialogLocks() {
  await bajajInjectMainWorldDialogLock();
  bajajInjectPageDialogLock();
})();

const BajajVehicleDetails = {

  // MAIN world (page) + <script> fallback — non-blocking except where code awaits explicitly.
  _blockAlerts() {
    chrome.runtime.sendMessage({ action: 'INJECT_MAIN_WORLD_DIALOG_LOCK' }, () => void chrome.runtime.lastError);
    bajajInjectPageDialogLock();
  },

  // ── Wait for any visible loading overlay / spinner to disappear ──
  async waitForLoadingToFinish(logger, maxWait = 30000, label = '') {
    const selectors = [
      '.loading', '.spinner', '.loader',
      '[class*="loading"]', '[class*="spinner"]', '[class*="loader"]',
      '.overlay', '.modal-backdrop', '#loadingDiv', '#loader'
    ];
    const start = Date.now();
    let wasLoading = false;

    while (Date.now() - start < maxWait) {
      let isLoading = false;
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const s = window.getComputedStyle(el);
          if (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0') {
            isLoading = true;
            break;
          }
        }
        if (isLoading) break;
      }

      if (isLoading) {
        wasLoading = true;
        await this.sleep(300);
        continue;
      }

      if (wasLoading) {
        // Loading just finished — give the DOM a moment to settle
        logger(`✅ Loading finished${label ? ' (' + label + ')' : ''}`);
        await this.sleep(800);
      }
      return true;
    }

    logger(`⚠️ Loading timeout after ${maxWait / 1000}s${label ? ' (' + label + ')' : ''}`);
    return false;
  },

  async run(payload, logger = console.log) {
    logger('🚀 Starting Bajaj vehicle details flow...');
    logger('📍 Current URL:', window.location.href);

    this._blockAlerts();

    try {
      // Start checking for new checkbox
      logger('🔍 Starting to check for "New" checkbox...');
      await this.waitForPageLoad(logger);
      await this.checkNewCheckbox(logger);
      await this.selectMake(payload, logger);
      await this.selectModel(payload, logger);
      await this.selectSubtype(payload, logger);
      await this.selectYearOfMfg(payload, logger);
      await this.fillRegistrationLocation(payload, logger);
      await this.fillPincode(payload, logger);
      await this.fillIDV(payload, logger);
      await this.fillNomineeName(payload, logger);
      await this.fillNomineeRelation(payload, logger);
      await this.clickAddonCovers(payload, logger);

      console.log('[Bajaj Vehicle Details] 🎉 Vehicle details flow completed successfully');
      logger('✅ Vehicle details flow completed successfully');
      return { success: true };

    } catch (error) {
      logger('❌ Vehicle details flow failed: ' + error.message);
      console.error('[Bajaj Vehicle Details] Error:', error);
      return { success: false, error: error.message };
    }
  },

  async waitForPageLoad(logger) {
    logger('⏳ Waiting for vehicle details page to load on motorload.do...');
    console.log('[Bajaj Vehicle Details] 📍 Current URL:', window.location.href);
    
    // Verify we're on the motorload.do page
    if (!window.location.href.includes('motorload.do')) {
      logger('⚠️ Not on motorload.do page yet');
      console.log('[Bajaj Vehicle Details] ⚠️ Expected motorload.do, got:', window.location.href);
    }

    // Portal loading UI: HoldOn.js (requires jQuery on the site). HoldOn.open()
    // injects #holdon-overlay and spinner nodes (e.g. sk-fading-circle). We do not
    // bundle HoldOn — we only wait until that overlay is gone and the form is ready.
    // Wait for HoldOn loading overlay to appear and disappear
    const maxWaitTime = 30000;
    const startTime = Date.now();
    let holdOnWasVisible = false;

    while (Date.now() - startTime < maxWaitTime) {
      // Check for HoldOn loading overlay
      const holdOnOverlay = document.querySelector('#holdon-overlay');
      const holdOnSpinner = document.querySelector('[class*="sk-spinner"], [class*="sk-fading"]');
      
      if (holdOnOverlay || holdOnSpinner) {
        if (!holdOnWasVisible) {
          logger('⏳ HoldOn loading overlay detected, waiting for it to disappear...');
          console.log('[Bajaj Vehicle Details] 🔄 HoldOn overlay appeared at', new Date().toLocaleTimeString());
          holdOnWasVisible = true;
        }
        await this.sleep(300);
        continue;
      }

      // If HoldOn was visible and now it's gone
      if (holdOnWasVisible) {
        logger('✅ HoldOn overlay disappeared');
        console.log('[Bajaj Vehicle Details] ✅ HoldOn overlay disappeared at', new Date().toLocaleTimeString());
        await this.sleep(1000); // Give page extra time to settle
      }

      // Check if the page content is ready
      const newCheckbox = document.querySelector('#new');
      const pageReady = newCheckbox && document.readyState === 'complete';
      
      if (pageReady) {
        await this.waitForLoadingToFinish(logger, 10000, 'motorload.do page');
        logger('✅ Vehicle details page loaded successfully');
        console.log('[Bajaj Vehicle Details] ✅ motorload.do page is ready');
        return true;
      }

      // If overlay is gone but page not fully ready, wait a bit more
      if (holdOnWasVisible && !pageReady) {
        logger('⏳ Waiting for page content to be ready...');
        console.log('[Bajaj Vehicle Details] ⏳ Waiting for #new checkbox and page readyState');
        await this.sleep(500);
        continue;
      }

      await this.sleep(500);
    }

    logger('⚠️ Page load timeout, proceeding anyway...');
    console.log('[Bajaj Vehicle Details] ⚠️ Timeout after', (Date.now() - startTime) / 1000, 'seconds');
    return false;
  },

  async checkNewCheckbox(logger) {
    logger('📋 Checking "New" checkbox...');
    const newCheckbox = document.querySelector('#new');
    if (newCheckbox && !newCheckbox.checked) {
      newCheckbox.click();
      logger('✅ "New" checkbox checked');
    } else if (newCheckbox && newCheckbox.checked) {
      logger('✅ "New" checkbox already checked');
    } else {
      throw new Error('New checkbox not found');
    }
    await this.sleep(500);
  },

  async selectMake(payload, logger) {
    logger('🏭 Selecting vehicle make...');
    const makeSelect = document.querySelector('#vehMakeCode');
    if (!makeSelect) throw new Error('Make dropdown not found');

    const make = payload.vehicleDetails?.make;
    if (!make) { logger('⚠️ No make found in payload'); return; }

    const options = Array.from(makeSelect.options);
    let targetOption = options.find(o => o.text.toLowerCase() === make.toLowerCase());
    if (!targetOption) {
      targetOption = options.find(o =>
        o.text.toLowerCase().includes(make.toLowerCase()) &&
        !make.toLowerCase().includes(o.text.toLowerCase())
      );
    }

    if (targetOption) {
      makeSelect.value = targetOption.value;
      makeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logger(`✅ Selected make: ${targetOption.text}`);
    } else {
      throw new Error(`Make "${make}" not found in dropdown`);
    }
    await this.sleep(1000);
  },

  async selectModel(payload, logger) {
    logger('🚗 Selecting vehicle model...');
    const modelSelect = document.querySelector('#vehModelCode');
    if (!modelSelect) throw new Error('Model dropdown not found');

    const model = payload.vehicleDetails?.model;
    if (!model) { logger('⚠️ No model found in payload'); return; }

    const normalize = str => str.toLowerCase().replace(/\s+/g, '');
    const normalizedModel = normalize(model);
    const options = Array.from(modelSelect.options);

    let targetOption = options.find(o => o.text.toLowerCase() === model.toLowerCase());
    if (!targetOption) targetOption = options.find(o => normalize(o.text) === normalizedModel);
    if (!targetOption) {
      targetOption = options.find(o => {
        const ot = normalize(o.text);
        return ot.includes(normalizedModel) || normalizedModel.includes(ot);
      });
    }

    if (targetOption) {
      modelSelect.value = targetOption.value;
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logger(`✅ Selected model: ${targetOption.text}`);
    } else {
      throw new Error(`Model "${model}" not found in dropdown`);
    }
    await this.sleep(1000);
  },

  async selectSubtype(payload, logger) {
    logger('🔧 Selecting vehicle subtype/variant...');
    const subtypeSelect = document.querySelector('#vehSubTypeCode');
    if (!subtypeSelect) throw new Error('Subtype dropdown not found');

    const variant = payload.vehicleDetails?.variant;
    if (!variant) { logger('⚠️ No variant found in payload'); return; }

    const normalize = (str) => String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const normalizedVariant = normalize(variant);
    const options = Array.from(subtypeSelect.options).filter(o => o.value && o.value !== 'X');
    const targetOption = options.find(o => normalize(o.text) === normalizedVariant);

    if (targetOption) {
      subtypeSelect.value = targetOption.value;
      subtypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logger(`✅ Selected subtype: "${targetOption.text}"`);
    } else {
      logger(`⚠️ Exact subtype match not found for variant: "${variant}". Leaving subtype unselected.`);
    }
    await this.sleep(500);
  },

  async selectYearOfMfg(payload, logger) {
    logger('📅 Selecting year of manufacturing...');
    const yearSelect = document.querySelector('#yearOfMfg');
    if (!yearSelect) throw new Error('Year of manufacturing dropdown not found');

    const year = String(payload.vehicleInformation?.yearOfManufacture || payload.vehicleDetails?.yearOfManufacturing || '2026');
    const options = Array.from(yearSelect.options);
    let targetOption = options.find(o => o.value === year);
    if (!targetOption) targetOption = options.find(o => o.value === '2026');

    if (targetOption) {
      yearSelect.value = targetOption.value;
      yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
      logger(`✅ Selected year: ${targetOption.text}`);
    }
    await this.sleep(500);
  },

  async fillRegistrationLocation(payload, logger) {
    logger('📍 Filling registration location...');
    const locationInput  = document.querySelector('#v_reg_city1');
    const locationSelect = document.querySelector('#registrationLoc');
    if (!locationInput && !locationSelect) throw new Error('Registration location field not found');

    const rto = payload.vehicleDetails?.rtoLocation || payload.vehicleDetails?.rto;
    if (!rto) { logger('⚠️ No RTO location found in payload'); return; }

    const normalize = str => str.toUpperCase().replace(/\s+/g, '');
    const normalizedRto = normalize(rto);
    let matchedValue = null, matchedText = null;

    if (locationSelect) {
      const options = Array.from(locationSelect.options).filter(o => o.value !== 'X');
      let targetOption = options.find(o => normalize(o.value.split('-')[0]) === normalizedRto);
      if (!targetOption) targetOption = options.find(o => normalize(o.value) === normalizedRto);
      if (!targetOption) targetOption = options.find(o =>
        normalize(o.text).includes(normalizedRto) || normalizedRto.includes(normalize(o.text))
      );

      if (targetOption) {
        matchedValue = targetOption.value;
        matchedText  = targetOption.text;
        locationSelect.value = matchedValue;
        locationSelect.dispatchEvent(new Event('change', { bubbles: true }));
        logger(`✅ Matched RTO: ${matchedText} (${matchedValue})`);
      }
    }

    if (locationInput) {
      const displayValue = matchedText || rto.toUpperCase();
      locationInput.value = '';
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(100);
      locationInput.value = displayValue;
      locationInput.dispatchEvent(new Event('input',  { bubbles: true }));
      locationInput.dispatchEvent(new Event('change', { bubbles: true }));
      locationInput.dispatchEvent(new Event('blur',   { bubbles: true }));
      locationInput.style.borderColor     = '';
      locationInput.style.backgroundColor = '';
      logger(`✅ Filled registration location: ${displayValue}`);
    }
    await this.sleep(500);
  },

  async fillPincode(payload, logger) {
    logger('📮 Filling pincode...');
    const pincodeInput = document.querySelector('#pincode');
    if (!pincodeInput) throw new Error('Pincode field not found');

    const pincode = payload.customerDetails?.pincode ||
                    payload.customerDetails?.address?.pincode ||
                    payload.vehicleDetails?.pincode;
    if (!pincode) { logger('⚠️ No pincode found in payload'); return; }

    pincodeInput.value = pincode;
    pincodeInput.dispatchEvent(new Event('input', { bubbles: true }));
    pincodeInput.dispatchEvent(new Event('blur',  { bubbles: true }));
    logger(`✅ Filled pincode: ${pincode}`);
    await this.sleep(500);
  },

  async fillIDV(payload, logger) {
    logger('💰 Filling IDV...');
    const idvInput = document.querySelector('#vehicle_idv');
    if (!idvInput) throw new Error('IDV field not found');

    const idv = payload.vehicleDetails?.idv;
    if (!idv) { logger('⚠️ No IDV found in payload'); return; }

    idvInput.value = idv;
    idvInput.dispatchEvent(new Event('input', { bubbles: true }));
    idvInput.dispatchEvent(new Event('blur',  { bubbles: true }));
    logger(`✅ Filled IDV: ${idv}`);
    await this.sleep(500);
  },

  async fillNomineeName(payload, logger) {
    logger('👤 Filling nominee name...');
    const nomineeInput = document.querySelector('#nomineeName');
    if (!nomineeInput) { logger('⚠️ Nominee name field not found'); return; }

    const nomineeName = payload.nominee?.nomineeName || payload.customerDetails?.nominee?.name;
    if (!nomineeName) { logger('⚠️ No nominee name found in payload'); return; }

    nomineeInput.value = nomineeName;
    nomineeInput.dispatchEvent(new Event('input', { bubbles: true }));
    nomineeInput.dispatchEvent(new Event('blur',  { bubbles: true }));
    logger(`✅ Filled nominee name: ${nomineeName}`);
    await this.sleep(500);
  },

  async fillNomineeRelation(payload, logger) {
    logger('👥 Filling nominee relation...');
    const relationInput = document.querySelector('#nomineeReln');
    if (!relationInput) { logger('⚠️ Nominee relation field not found'); return; }

    const nomineeRelation = payload.nominee?.nomineeRelationship || payload.customerDetails?.nominee?.relation;
    if (!nomineeRelation) { logger('⚠️ No nominee relation found in payload'); return; }

    relationInput.value = nomineeRelation;
    relationInput.dispatchEvent(new Event('input', { bubbles: true }));
    relationInput.dispatchEvent(new Event('blur',  { bubbles: true }));
    logger(`✅ Filled nominee relation: ${nomineeRelation}`);
    await this.sleep(500);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ADDON COVERS — complete rewrite with sequential steps + loading waits
  // ─────────────────────────────────────────────────────────────────────────────
  async clickAddonCovers(payload, logger) {
    // Re-block alerts right before this heavy section
    this._blockAlerts();
    window.alert = () => {}; window.confirm = () => true; window.prompt = () => {};

    // ── Step 1: CPA exemption ──────────────────────────────────────────────────
    logger('🔘 Selecting CPA exemption option...');
    const cpaSelect = document.querySelector('#cpaFlagE');
    if (cpaSelect) {
      const exemptionOption = Array.from(cpaSelect.options).find(o =>
        o.text.includes('Exemption of Compulsory Personal Accident Cover') || o.value === 'ECPA'
      );
      if (exemptionOption) {
        cpaSelect.value = exemptionOption.value;
        cpaSelect.dispatchEvent(new Event('change', { bubbles: true }));
        cpaSelect.dispatchEvent(new Event('blur',   { bubbles: true }));
        logger(`✅ Selected CPA exemption: ${exemptionOption.text}`);
        await this.sleep(600);
      }
    }

    // ── Step 2: Open Addon/Additional Covers panel ────────────────────────────
    logger('🔘 Clicking Addon/Additional Covers button...');
    const addonButton = document.querySelector('#btn-addon_covers');
    if (!addonButton) throw new Error('Addon/Additional Covers button not found');
    addonButton.click();
    logger('⏳ Waiting for addon panel to open...');
    await this.sleep(2000);
    await this.waitForLoadingToFinish(logger, 15000, 'addon panel open');

    // ── Step 3: Uncheck ALL currently-checked Main Package checkboxes ─────────
    //    The page pre-selects "Drive Assure Silver" (id=Chk5, name=ChkBox2).
    //    We must uncheck every pre-selected Main Package before ticking our target.
    logger('🔄 Clearing any pre-selected main package checkboxes...');
    const allPkgCheckboxes = document.querySelectorAll('input[type="checkbox"][name^="ChkBox"]');
    for (const cb of allPkgCheckboxes) {
      if (cb.checked && cb.id !== 'Chk2') {
        logger(`   ↩ Unchecking pre-selected: #${cb.id} (${cb.name})`);
        cb.click();
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(500);
      }
    }

    // Uncheck the master "Main Packages" checkbox too so we can re-check fresh
    const mainPackagesCheckbox = document.querySelector('#mainChkBox');
    if (mainPackagesCheckbox && mainPackagesCheckbox.checked) {
      logger('   ↩ Unchecking master Main Packages checkbox first...');
      mainPackagesCheckbox.click();
      mainPackagesCheckbox.checked = false;
      mainPackagesCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      await this.sleep(600);
    }

    // ── Step 4: Check "Main Packages" master checkbox ────────────────────────
    logger('☑ Checking Main Packages master checkbox...');
    if (mainPackagesCheckbox && !mainPackagesCheckbox.checked) {
      mainPackagesCheckbox.click();
      mainPackagesCheckbox.checked = true;
      mainPackagesCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      logger('✅ Checked Main Packages checkbox');
      await this.sleep(600);
    }

    // ── Step 5: Select Drive Assure Basic (id="Chk5", name="ChkBox2") ─────────
    //    CORRECT: Drive Assure Basic is id="Chk5" name="ChkBox2" 
    //    We match BOTH id AND name to avoid any ambiguity.
    logger('☑ Selecting Drive Assure Basic package...');
    const driveAssureCheckbox = document.querySelector('input[type="checkbox"][name="ChkBox2"][id="Chk5"]');
    if (driveAssureCheckbox) {
      if (!driveAssureCheckbox.checked) {
        driveAssureCheckbox.click();
        await this.sleep(200);
        driveAssureCheckbox.checked = true;
        driveAssureCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        logger('✅ Checked Drive Assure Basic (id=Chk5, name=ChkBox2)');
      } else {
        logger('✅ Drive Assure Basic already checked');
      }
    } else {
      logger('⚠️ Drive Assure Basic (name="ChkBox2", id="Chk5") not found in DOM');
    }
    await this.sleep(600);

    // Confirm any other packages are NOT checked
    const allOtherCheckboxes = document.querySelectorAll('input[type="checkbox"][name^="ChkBox"]:not([name="ChkBox2"])');
    for (const cb of allOtherCheckboxes) {
      if (cb.checked) {
        logger(`⚠️ Found other package checked (${cb.id}, ${cb.name}) — unchecking...`);
        cb.click();
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(300);
      }
    }

    // ── Step 6: Additional Covers — IMTs ─────────────────────────────────────
    logger('☑ Checking Additional Covers - IMTs checkbox...');
    const additionalCoversCheckbox = document.querySelector('#coverChkBox');
    if (additionalCoversCheckbox && !additionalCoversCheckbox.checked) {
      additionalCoversCheckbox.click();
      additionalCoversCheckbox.checked = true;
      additionalCoversCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      logger("✅ Checked Additional Covers - IMT's checkbox");
    }
    await this.sleep(600);

    // ── Step 7: Restrict TPPD ─────────────────────────────────────────────────
    logger('☑ Checking Restrict TPPD checkbox...');
    const restrictTppdCheckbox = document.querySelector('#cc5');
    if (restrictTppdCheckbox && !restrictTppdCheckbox.checked) {
      restrictTppdCheckbox.click();
      restrictTppdCheckbox.checked = true;
      restrictTppdCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      logger('✅ Checked Restrict TPPD To Rs 6000/-');
    }
    await this.sleep(600);

    // ── Step 8: Calculate Premium — wait for loading to fully complete ────────
    logger('🔘 Clicking Calculate Premium button...');
    const calculateButton =
      document.querySelector('button[onclick*="calculatePremium"]') ||
      Array.from(document.querySelectorAll('button')).find(btn =>
        btn.textContent.trim().includes('Calculate Premium')
      );
    if (calculateButton) {
      calculateButton.click();
      logger('⏳ Waiting for premium calculation to complete (loader)...');
      await this.sleep(2000); // let the AJAX fire
      await this.waitForLoadingToFinish(logger, 40000, 'Calculate Premium');
      logger('✅ Premium calculation complete');
    } else {
      logger('⚠️ Calculate Premium button not found');
    }

    await this.fillCustomerContactDetails(payload, logger);
    await this.sleep(1000);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTACT STEP — immediate #v_immd_* / #sd_telphone_no fields skipped
  // ─────────────────────────────────────────────────────────────────────────────
  async fillCustomerContactDetails(payload, logger) {
    this._blockAlerts();

    // ── Proceed to Issuance ───────────────────────────────────────────────────
    logger('🔘 Clicking Proceed to Issuance...');
    const proceedButton =
      document.querySelector('#immSave') ||
      Array.from(document.querySelectorAll('button')).find(btn =>
        btn.textContent.trim().includes('Proceed to Issuance')
      );
    if (proceedButton) {
      proceedButton.click();
      logger('✅ Clicked Proceed to Issuance — waiting...');
      await this.sleep(2000);
      await this.waitForLoadingToFinish(logger, 20000, 'Proceed to Issuance');
    } else {
      logger('⚠️ Proceed to Issuance button not found');
    }

    await this.fillIssuanceForm(payload, logger);
    await this.sleep(1000);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ISSUANCE FORM — fully sequential with loading waits
  // ─────────────────────────────────────────────────────────────────────────────
  async fillIssuanceForm(payload, logger) {
    logger('📋 Filling issuance form...');
    this._blockAlerts();
    window.alert = () => {}; window.confirm = () => true; window.prompt = () => {};

    await this.sleep(2000);
    await this.waitForLoadingToFinish(logger, 15000, 'issuance form load');

    // Engine number
    const engineNumberInput = document.querySelector('#v_engineNo');
    if (engineNumberInput) {
      const engineNumber = payload.vehicleInformation?.engineNumber || '';
      if (engineNumber) {
        engineNumberInput.focus(); await this.sleep(300);
        engineNumberInput.value = engineNumber;
        engineNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        engineNumberInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled engine number: ${engineNumber}`);
        await this.sleep(600);
      }
    }

    // Chassis number
    const chassisNumberInput = document.querySelector('#v_chassisNo');
    if (chassisNumberInput) {
      const chassisNumber = payload.vehicleInformation?.chassisNumber || '';
      if (chassisNumber) {
        chassisNumberInput.focus(); await this.sleep(300);
        chassisNumberInput.value = chassisNumber;
        chassisNumberInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        chassisNumberInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled chassis number: ${chassisNumber}`);
        await this.sleep(600);
      }
    }

    // Hypothecation
    const hypoSelect = document.querySelector('#v_hypoType');
    if (hypoSelect) {
      const isHypothecated = payload.hypothecation?.isHypothecated || false;
      if (isHypothecated) {
        const hypoOption = Array.from(hypoSelect.options).find(o =>
          o.value === '1' || o.text.toLowerCase().includes('hypothecation')
        );
        if (hypoOption) {
          hypoSelect.value = hypoOption.value;
          hypoSelect.dispatchEvent(new Event('change', { bubbles: true }));
          logger('✅ Selected hypothecation');
          await this.sleep(600);
        }
      }
    }

    // Financier name
    const financierNameInput = document.querySelector('#v_hypothecation');
    if (financierNameInput && payload.hypothecation?.isHypothecated) {
      const financierName = payload.hypothecation?.financierName || '';
      if (financierName) {
        financierNameInput.focus(); await this.sleep(300);
        financierNameInput.value = financierName;
        financierNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        financierNameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled financier name: ${financierName}`);
        await this.sleep(600);
      }
    }

    // PAN number
    const panInput = document.querySelector('#v_pan');
    if (panInput) {
      const pan            = payload.customerDetails?.pan            || '';
      const isPanAvailable = payload.customerDetails?.isPanAvailable || false;
      if (isPanAvailable && pan) {
        panInput.focus(); await this.sleep(300);
        panInput.value = pan;
        panInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        panInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled PAN: ${pan}`);
        await this.sleep(600);
      }
    }

    // First name
    const firstNameInput = document.querySelector('#v_fname');
    if (firstNameInput) {
      const firstName = payload.customerDetails?.firstName || '';
      if (firstName) {
        firstNameInput.focus(); await this.sleep(300);
        firstNameInput.value = firstName;
        firstNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        firstNameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled first name: ${firstName}`);
        await this.sleep(600);
      }
    }

    // Last name
    const lastNameInput = document.querySelector('#v_lname');
    if (lastNameInput) {
      const lastName = payload.customerDetails?.lastName || '';
      if (lastName) {
        lastNameInput.focus(); await this.sleep(300);
        lastNameInput.value = lastName;
        lastNameInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        lastNameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled last name: ${lastName}`);
        await this.sleep(600);
      }
    }

    // Mobile
    const mobileInput = document.querySelector('#v_mobile');
    if (mobileInput) {
      const mobile = payload.customerDetails?.mobile || '';
      if (mobile) {
        mobileInput.focus(); await this.sleep(300);
        mobileInput.value = mobile;
        mobileInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        mobileInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled mobile: ${mobile}`);
        await this.sleep(600);
      }
    }

    // Email
    const emailInput = document.querySelector('#v_email');
    if (emailInput) {
      const email = 'otpcoverscrafter@gmail.com';
      emailInput.focus(); await this.sleep(300);
      emailInput.value = email;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(300);
      emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
      logger(`✅ Filled email: ${email}`);
      await this.sleep(600);
    }

    // ── Pincode — triggers AJAX for locality dropdown ─────────────────────────
    const pincodeInput = document.querySelector('#v_ppincode');
    if (pincodeInput) {
      const pincode = payload.customerDetails?.pincode ||
                      payload.customerDetails?.address?.pincode || '';
      if (pincode) {
        pincodeInput.focus(); await this.sleep(300);
        pincodeInput.value = '';
        pincodeInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(150);
        pincodeInput.value = pincode;
        pincodeInput.dispatchEvent(new Event('input',  { bubbles: true }));
        pincodeInput.dispatchEvent(new Event('keyup',  { bubbles: true }));
        pincodeInput.dispatchEvent(new Event('change', { bubbles: true }));
        await this.sleep(300);
        pincodeInput.dispatchEvent(new Event('blur',   { bubbles: true }));
        logger(`✅ Filled pincode: ${pincode} — waiting for locality AJAX...`);
        await this.sleep(1500);
        await this.waitForLoadingToFinish(logger, 10000, 'pincode AJAX');
        await this.sleep(1000);
      }
    }

    // Address line 1
    const addressLine1Input = document.querySelector('#v_paddrline1');
    if (addressLine1Input) {
      const building = payload.customerDetails?.address?.building || '';
      if (building) {
        addressLine1Input.focus(); await this.sleep(300);
        addressLine1Input.value = building;
        addressLine1Input.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        addressLine1Input.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled address line 1: ${building}`);
        await this.sleep(600);
      }
    }

    // Address line 2
    const addressLine2Input = document.querySelector('#v_paddrline2');
    if (addressLine2Input) {
      const street = payload.customerDetails?.address?.street || '';
      if (street) {
        addressLine2Input.focus(); await this.sleep(300);
        addressLine2Input.value = street;
        addressLine2Input.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        addressLine2Input.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled address line 2: ${street}`);
        await this.sleep(600);
      }
    }

    // City
    const cityInput = document.querySelector('#v_pcity');
    if (cityInput) {
      const city = payload.customerDetails?.address?.city || '';
      if (city) {
        cityInput.focus(); await this.sleep(300);
        cityInput.value = city;
        cityInput.dispatchEvent(new Event('input', { bubbles: true }));
        await this.sleep(300);
        cityInput.dispatchEvent(new Event('blur', { bubbles: true }));
        logger(`✅ Filled city: ${city}`);
        await this.sleep(600);
      }
    }

    // Locality dropdown
    await this.fillLocalityDropdown(payload, logger);
    await this.sleep(600);

    // Go Green — select NO
    const goGreenNo = document.querySelector('#GoGreenFlag1[value="N"]');
    if (goGreenNo) {
      goGreenNo.click();
      goGreenNo.checked = true;
      goGreenNo.dispatchEvent(new Event('change', { bubbles: true }));
      logger('✅ Selected NO for Go Green');
    } else {
      logger('⚠️ Go Green NO radio not found');
    }
    await this.sleep(600);

    // ── Save Customer Id → wait for modal Close, click if found ──────────────
    logger('🔘 Clicking Save Customer Id...');
    const saveCustomerBtn =
      document.querySelector('button[onclick*="SAVE_CUST"]') ||
      Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.trim().includes('Save Customer Id')
      );
    if (saveCustomerBtn) {
      saveCustomerBtn.click();
      logger('✅ Clicked Save Customer Id — watching for Close button...');

      logger('⏳ Waiting for Close button (post–Save Customer modal)...');
      const closeWaitMs = 15000;
      const closeStart = Date.now();
      let closeBtn = null;
      while (Date.now() - closeStart < closeWaitMs) {
        closeBtn =
          document.querySelector('button[data-dismiss="modal"][onclick*="clear_ref"]') ||
          document.querySelector('button[onclick*="clear_ref"]') ||
          Array.from(document.querySelectorAll('button[data-dismiss="modal"]')).find(b =>
            b.textContent.trim().includes('Close')
          );
        if (closeBtn && closeBtn.offsetParent !== null) break;
        closeBtn = null;
        await this.sleep(100);
      }
      if (closeBtn) {
        closeBtn.click();
        logger('✅ Clicked Close button');
        await this.waitForLoadingToFinish(logger, 10000, 'close modal');
      } else {
        logger('⚠️ Close button not found after Save Customer');
        await this.waitForLoadingToFinish(logger, 20000, 'Save Customer Id');
      }
      await this.sleep(300);
    } else {
      logger('⚠️ Save Customer Id button not found');
    }

    // ── Validate PAN — re-block alerts, open modal ────────────────────────────
    await bajajInjectMainWorldDialogLock();
    this._blockAlerts();
    window.alert = () => {}; window.confirm = () => true; window.prompt = () => {};

    logger('🔘 Clicking Validate PAN button (open modal)...');
    const validatePanModalBtn = document.querySelector('#btn_validat_aadhar');
    if (validatePanModalBtn) {
      validatePanModalBtn.click();
      logger('✅ Clicked Validate PAN modal trigger');
      await this.waitForLoadingToFinish(logger, 10000, 'PAN modal open');
    } else {
      logger('⚠️ Validate PAN modal button not found');
    }

    // ── Validate PAN — inside modal: await MAIN-world lock before click (native alert)
    await bajajInjectMainWorldDialogLock();
    this._blockAlerts();

    logger('🔘 Clicking Validate PAN inside modal...');
    const validatePanBtn = document.querySelector('#sendmailBtn');
    if (validatePanBtn) {
      const _noop = () => {};
      const _true = () => true;
      try {
        if (typeof Window !== 'undefined' && Window.prototype) {
          Window.prototype.alert = _noop;
          Window.prototype.confirm = _true;
          Window.prototype.prompt = _noop;
        }
      } catch (_) { /* ignore */ }
      window.alert = _noop;
      window.confirm = _true;
      window.prompt = _noop;

      await bajajInjectMainWorldDialogLock();
      this._blockAlerts();
      validatePanBtn.click();
      logger('✅ Clicked Validate PAN inside modal — success alert should be suppressed');
      await this.waitForLoadingToFinish(logger, 20000, 'PAN validation');
      logger('✅ PAN validation complete');
    } else {
      logger('⚠️ Validate PAN inside modal (#sendmailBtn) not found');
    }

    // ── Pay and Issue Policy ─────────────────────────────────────────────────
    this._blockAlerts();
    window.alert = () => {}; window.confirm = () => true; window.prompt = () => {};

    logger('🔘 Clicking Pay and Issue Policy...');
    const payIssueBtn = document.querySelector('#btn_proceed_issue');
    if (payIssueBtn) {
      payIssueBtn.click();
      logger('✅ Clicked Pay and Issue Policy');
      await this.sleep(2000);
      await this.waitForLoadingToFinish(logger, 20000, 'Pay and Issue');
    } else {
      logger('⚠️ Pay and Issue Policy button not found');
    }

    // ── Verify KYC ───────────────────────────────────────────────────────────
    logger('🔘 Looking for Verify KYC button...');
    const verifyKycBtn = Array.from(document.querySelectorAll('button')).find(b =>
      b.textContent.trim().includes('Verify KYC') &&
      (b.getAttribute('onclick') || '').includes('verifyKyc')
    );
    if (verifyKycBtn) {
      verifyKycBtn.click();
      logger('✅ Clicked Verify KYC — waiting for KYC tab...');
      await this.handleKycTab(payload, logger);
    } else {
      logger('⚠️ Verify KYC button not found');
    }

    logger('✅ Issuance form filling completed');
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LOCALITY DROPDOWN
  // ─────────────────────────────────────────────────────────────────────────────
  async fillLocalityDropdown(payload, logger) {
    const locality = payload.customerDetails?.address?.locality ||
                     payload.customerDetails?.address?.area     ||
                     payload.customerDetails?.locality          || '';

    logger(`📍 Filling locality dropdown: "${locality}"`);
    if (!locality) { logger('⚠️ No locality in payload'); return; }

    const areaSelect = document.querySelector('#v_pposelect');
    if (!areaSelect) { logger('⚠️ #v_pposelect not found'); return; }

    logger('⏳ Waiting for locality dropdown to populate...');
    const maxWait = 10000;
    const startTime = Date.now();
    let populated = false;

    while (Date.now() - startTime < maxWait) {
      const validOptions = Array.from(areaSelect.options).filter(o =>
        o.value !== '' && o.value !== '--Select--'
      );
      if (validOptions.length > 0) {
        populated = true;
        logger(`✅ Locality dropdown has ${validOptions.length} options`);
        break;
      }
      await this.sleep(400);
    }

    if (!populated) {
      logger('⚠️ Locality dropdown empty after 10s: ' +
        Array.from(areaSelect.options).map(o => `"${o.value}"`).join(', '));
      return;
    }

    const allOptions = Array.from(areaSelect.options).filter(o => o.value !== '');
    logger(`📋 Locality options: ${allOptions.map(o => o.text).join(', ')}`);

    const normalize = str => str.toUpperCase().replace(/\s+/g, '').trim();
    const nl = normalize(locality);

    const targetOption =
      allOptions.find(o => normalize(o.value) === nl) ||
      allOptions.find(o => normalize(o.text) === nl) ||
      allOptions.find(o => normalize(o.value).includes(nl)) ||
      allOptions.find(o => nl.includes(normalize(o.value)) && normalize(o.value).length > 2) ||
      allOptions.find(o => normalize(o.text).includes(nl));

    if (targetOption) {
      areaSelect.value = targetOption.value;
      areaSelect.dispatchEvent(new Event('change', { bubbles: true }));
      areaSelect.dispatchEvent(new Event('blur',   { bubbles: true }));
      logger(`✅ Selected locality: "${targetOption.text}"`);
    } else {
      logger(`⚠️ Locality "${locality}" not matched. Options: ${allOptions.map(o => `"${o.text}"`).join(', ')}`);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // KYC HANDLING
  // ─────────────────────────────────────────────────────────────────────────────
  async handleKycTab(payload, logger) {
    logger('🆔 Handling KYC tab...');
    const ok = await this.waitForKycTabAndRun(payload, logger);
    if (!ok) logger('⚠️ Could not access KYC tab automatically. Please complete KYC manually.');
  },

  async waitForKycTabAndRun(payload, logger) {
    logger('⏳ Waiting for KYC tab to open...');

    // chrome.runtime is available in content scripts; chrome.tabs is NOT
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return await this.handleKycViaExtension(payload, logger);
    }

    logger('⚠️ chrome.runtime not available — cannot auto-detect KYC tab');
    return false;
  },

  async waitForKycPageLoad(payload, logger) {
    logger('⏳ Waiting for KYC page to fully load and find DOB input...');
    const maxWait = 20000; // 20 seconds max wait
    const startTime = Date.now();
    let dobInput = null;

    while (Date.now() - startTime < maxWait && !dobInput) {
      // Try multiple selectors for DOB input
      dobInput = document.querySelector('#dob1') ||
                 document.querySelector('input[name="dob1"]') ||
                 document.querySelector('input[placeholder*="dd-mm-yyyy"]') ||
                 document.querySelector('.policyWrap #dob1') ||
                 document.querySelector('.policyWrap input[name="dob1"]') ||
                 document.querySelector('.policyWrap input[placeholder*="dd-mm-yyyy"]');
      
      if (dobInput) {
        logger(`✅ KYC page loaded and DOB input found after ${Date.now() - startTime}ms`);
        break;
      }
      
      await this.sleep(300);
    }

    if (!dobInput) {
      logger('⚠️ DOB input not found after waiting. Available inputs:', 
        Array.from(document.querySelectorAll('input')).map(i => ({id: i.id, name: i.name, placeholder: i.placeholder})));
    }
    
    return dobInput !== null;
  },

  async handleKycViaExtension(payload, logger) {
    logger('🔌 Sending KYC task to background service worker...');
    
    const dob = payload.customerDetails?.dob         ||
                payload.customerDetails?.dateOfBirth ||
                payload.proposerDetails?.dob         || '';
    let formattedDob = dob;
    if (dob && dob.includes('-') && dob.split('-')[0].length === 4) {
      const p = dob.split('-');
      formattedDob = `${p[2]}-${p[1]}-${p[0]}`;
    }

    const ovdFrontImage = payload.customerDetails?.ovdFrontImage || payload.ovdFrontImage || '';
    const ovdBackImage  = payload.customerDetails?.ovdBackImage  || payload.ovdBackImage  || '';

    logger(`🆔 KYC data: DOB=${formattedDob} | front=${ovdFrontImage ? 'yes' : 'no'} | back=${ovdBackImage ? 'yes' : 'no'}`);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'BAJAJ_KYC_INJECT',
        data: { dob: formattedDob, ovdFrontImage, ovdBackImage }
      }, (response) => {
        if (chrome.runtime.lastError) {
          logger('⚠️ Background message error: ' + chrome.runtime.lastError.message);
          resolve(false);
        } else if (response?.success) {
          logger('✅ KYC injected via background');
          resolve(true);
        } else {
          logger('⚠️ KYC background response: ' + (response?.error || 'unknown'));
          resolve(false);
        }
      });
    });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────────
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  async waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await this.sleep(100);
    }
    throw new Error(`Element ${selector} not found within ${timeout}ms`);
  }
};

window.BajajVehicleDetails = BajajVehicleDetails;
