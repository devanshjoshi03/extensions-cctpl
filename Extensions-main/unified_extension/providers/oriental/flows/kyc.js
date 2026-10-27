/**
 * Oriental Insurance Extension - KYC & Payment Flow
 */
const OrientalKYC = {
  async enterProposalAndVerify(proposalNumber, logger = console.log) {
    const input = await waitForElement("input[name='policyNo']", { timeoutMs: 7500, root: document });
    if (!input) return { success: false, error: 'Proposal number input not found' };
    fillInput(input, proposalNumber);
    await wait(100);
    const verifyBtn = findElementByText('button', 'Verify') || qs(ORIENTAL_SELECTORS.verifyButton);
    if (verifyBtn) {
      clickElement(verifyBtn);
      await wait(375);
      const branchCodeInput = await waitForElement("input[name='branchOffice']", { timeoutMs: 7500, root: document });
      if (branchCodeInput.value) {
       console.log(branchCodeInput.value, 'branchCodeInput.value');
        await wait(125);
    // click on continue button
   const saveProposalAndContinueBtn = await waitForElement('button[class="policy-btn"]', { timeoutMs: 7500, root: document });
   if (saveProposalAndContinueBtn) {
    clickElement(saveProposalAndContinueBtn);
    await wait(125);
   }
    await wait(125);
  
//wait for element 
const okayButton = await waitForElement('.pointer.footer-green', { timeoutMs: 7500, root: document });
if(okayButton) clickElement(okayButton);
await wait(125);
    }
    }
    return { success: true };
  },

  async selectKYCMode(kycData, logger = console.log) {
    const mode = kycData?.kycMode || 'Online KYC';
    const modeRadio = document.querySelector(`input[type="radio"][value*="${mode.includes('Online') ? 'Online' : 'Offline'}"]`);
    if (modeRadio) { modeRadio.click(); await wait(75); }
    return { success: true };
  },

  getActiveSlideRoot() {
    return document.querySelector('.slick-slide.slick-active[aria-hidden="false"]')
      || document.querySelector('.slick-slide.slick-active')
      || document;
  },

  isVisibleElement(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  },

  findVisibleElement(selectors, root = this.getActiveSlideRoot(), options = {}) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const { allowDisabled = true } = options;
    for (const selector of selectorList) {
      if (!selector) continue;
      const matches = root.querySelectorAll(selector);
      for (const match of matches) {
        if (!this.isVisibleElement(match)) continue;
        if (!allowDisabled && match.disabled) continue;
        return match;
      }
    }
    return null;
  },

  async waitForVisibleElement(selectors, timeoutMs = 5000, options = {}) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const root = this.getActiveSlideRoot();
        const found = this.findVisibleElement(selectors, root, options);
        if (found) {
          resolve(found);
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

  findVisibleTextElement(selectors, text, root = document) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const needle = String(text || '').trim().toLowerCase();
    for (const selector of selectorList) {
      if (!selector) continue;
      const elements = root.querySelectorAll(selector);
      for (const element of elements) {
        if (!this.isVisibleElement(element)) continue;
        const content = element.textContent.trim().toLowerCase();
        if (!needle || content.includes(needle)) {
          return element;
        }
      }
    }
    return null;
  },

  async waitForVisibleText(selectors, text, timeoutMs = 5000, root = document) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const found = this.findVisibleTextElement(selectors, text, root);
        if (found) {
          resolve(found);
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

  findSectionByHeading(headingText, root = this.getActiveSlideRoot()) {
    const needle = (headingText || '').toLowerCase().trim();
    const blocks = root.querySelectorAll('.basic-col1, .col-md-12, .col-md-6, .basic-details-form, .policy-header-box');
    for (const block of blocks) {
      const headings = block.querySelectorAll('h4, h5, label, .policy-title');
      for (const heading of headings) {
        if (heading.textContent.trim().toLowerCase().includes(needle)) {
          return block;
        }
      }
    }
    return null;
  },

  async selectChoiceInSection(sectionHeading, optionText, root = this.getActiveSlideRoot()) {
    const section = this.findSectionByHeading(sectionHeading, root);
    if (!section) {
      return false;
    }

    const optionNeedle = String(optionText || '').trim().toLowerCase();
    const options = section.querySelectorAll('.choose-offline-items');
    for (const option of options) {
      const optionLabel = (option.querySelector('.item-tpa') || option).textContent.trim().toLowerCase();
      if (!optionLabel || (!optionLabel.includes(optionNeedle) && !optionNeedle.includes(optionLabel))) {
        continue;
      }

      option.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(100);
      clickElement(option);
      const inner = option.querySelector('.item-tpa');
      if (inner) inner.click();
      await wait(100);
      return option.classList.contains('active') || option.querySelector('.radio-plan-after')?.classList.contains('active');
    }

    return false;
  },

  hasPanCard(customer) {
    if (customer?.pan || customer?.panNumber || customer?.panImage || customer?.panImageFileId) {
      return true;
    }

    const explicit = customer?.isPanAvailable ?? customer?.hasPanCard ?? customer?.panAvailable;
    if (typeof explicit === 'boolean') return explicit;
    if (typeof explicit === 'string') {
      const normalized = explicit.trim().toLowerCase();
      if (['yes', 'true', '1'].includes(normalized)) return true;
      if (['no', 'false', '0'].includes(normalized)) return false;
    }
    return false;
  },

  resolveCustomerType(customer) {
    const rawType = String(customer?.customerType || customer?.ownershipUnder || 'Individual / HUF').trim().toLowerCase();
    if (
      rawType.includes('corporate') ||
      rawType.includes('trust') ||
      rawType.includes('ngo') ||
      rawType.includes('societ') ||
      rawType.includes('government') ||
      rawType.includes('institution') ||
      rawType.includes('association')
    ) {
      return 'Corporate';
    }
    return 'Individual / HUF';
  },

  isAadhaarDocumentType(documentType) {
    const normalized = String(documentType || '').trim().toLowerCase();
    return normalized.includes('aadhaar') || normalized.includes('aadhar');
  },

  resolveAddressDocumentNumber(customer) {
    const rawValue = customer?.documentNumber || customer?.aadhaarNumber || customer?.aadharNumber || '';
    const rawText = String(rawValue).trim();
    if (!rawText) return '';

    if (this.isAadhaarDocumentType(customer?.documentType)) {
      const digitsOnly = rawText.replace(/\D/g, '');
      if (digitsOnly.length <= 4) return digitsOnly || rawText;
      return digitsOnly.slice(-4);
    }

    return rawText;
  },

  formatDateValue(value, fallbackToToday = true) {
    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    if (!value) {
      return fallbackToToday ? formatDate(new Date()) : '';
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return formatDate(value);
    }

    const raw = String(value).trim();
    if (!raw) {
      return fallbackToToday ? formatDate(new Date()) : '';
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw.replace(/\//g, '-');
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-');
      return `${day}-${month}-${year}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDate(parsed);
    }

    return fallbackToToday ? formatDate(new Date()) : raw;
  },

  extractDigits(value, maxLength = 0) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!maxLength || digits.length <= maxLength) return digits;
    return digits.slice(-maxLength);
  },

  resolveFatherTitleCandidates(customer, form60) {
    const explicit = form60?.fatherTitle || customer?.fatherTitle;
    if (explicit) return [String(explicit).trim()];
    return ['Mr', 'Mr.'];
  },

  getPremiumAmountFromPage() {
    const premiumEl = document.querySelector('.payment-section .inr-symbol, .payment .inr-symbol');
    if (!premiumEl) return '';
    return String(premiumEl.textContent || '').replace(/[^\d.]/g, '');
  },

  async resolveForm60Payload(customer) {
    const form60 = customer?.form60 || {};
    const addr = customer?.address || {};
    const otpCfg = await new Promise((resolve) => {
      chrome.storage.local.get(['otpConfig'], (r) => resolve(r.otpConfig || {}));
    });

    return {
      fatherTitleCandidates: this.resolveFatherTitleCandidates(customer, form60),
      firstName: form60.firstName || customer?.firstName || '',
      middleName: form60.middleName || customer?.middleName || '',
      surName: form60.surName || form60.surname || customer?.lastName || customer?.surName || '',
      email: otpCfg.email || ORIENTAL_DEFAULT_VALUES.email,
      dob: this.formatDateValue(form60.dateOfBirth || customer?.dateOfBirth),
      fatherFirstName: form60.fatherFirstName || customer?.fatherFirstName || '',
      fatherMiddleName: form60.fatherMiddleName || customer?.fatherMiddleName || '',
      fatherSurName: form60.fatherSurName || form60.fatherSurname || customer?.fatherSurName || customer?.fatherLastName || '',
      roomNo: form60.roomNo || form60.flatRoomNo || addr.building || customer?.building || '',
      floorNo: form60.floorNo || customer?.floorNo || '',
      nameOfPremises: form60.nameOfPremises || addr.building || customer?.building || '',
      blockName: form60.blockName || form60.areaLocality || addr.locality || customer?.locality || '',
      streetNo: form60.streetNo || form60.roadStreetLane || addr.street || customer?.street || '',
      state: form60.state || addr.state || customer?.state || '',
      telephoneNumber: this.extractDigits(form60.telephoneNumber || customer?.telephoneNumber || customer?.phoneNumber),
      mobileNumber: this.extractDigits(form60.mobileNumber || customer?.mobile || customer?.mobileNumber || customer?.contactNumber, 10),
      totalAssets: String(form60.totalAssets || form60.amountOfTransaction || customer?.amountOfTransaction || this.getPremiumAmountFromPage() || ''),
      transactionDate: this.formatDateValue(form60.transactionDate || form60.dateOfTransaction || customer?.transactionDate || new Date()),
      noOfPersonsInvolved: String(form60.noOfPersonsInvolved || customer?.noOfPersonsInvolved || 1),
      modeOfTransaction: form60.modeOfTransaction || customer?.modeOfTransaction || 'Insurance Premium',
      panApplicationNumber: form60.panApplicationNumber || customer?.panApplicationNumber || '',
      agriIncome: String(form60.agriIncome || customer?.agriIncome || 0),
      otherIncome: String(form60.otherIncome || customer?.otherIncome || 0),
      aadharNumber: this.extractDigits(
        form60.aadharNumber || form60.aadhaarNumber || customer?.aadharNumber || customer?.aadhaarNumber || customer?.documentNumber,
        12
      ),
    };
  },

  getVisibleForm60Dialog() {
    const dialogs = Array.from(document.querySelectorAll('.p-dialog'));
    return dialogs.find((dialog) => {
      if (!this.isVisibleElement(dialog)) return false;
      const title = dialog.querySelector('.p-dialog-title');
      if (!title || !title.textContent.trim().toLowerCase().includes('form 60')) return false;
      return Boolean(
        dialog.querySelector('input[name="firstName"]') ||
        dialog.querySelector('input[name="aadharNumber"]') ||
        dialog.querySelector('#fatherTitle')
      );
    }) || null;
  },

  async waitForForm60Dialog(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleForm60Dialog();
        if (dialog) {
          resolve(dialog);
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

  async waitForForm60DialogToClose(timeoutMs = 7500) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleForm60Dialog()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  getVisibleForm60PreviewDialog() {
    const dialogs = Array.from(document.querySelectorAll('.p-dialog'));
    return dialogs.find((dialog) => {
      if (!this.isVisibleElement(dialog)) return false;
      const title = dialog.querySelector('.p-dialog-title');
      if (!title || !title.textContent.trim().toLowerCase().includes('form 60')) return false;
      return Boolean(
        dialog.querySelector('.pdf-viewer-container') ||
        dialog.querySelector('.react-pdf__Document') ||
        dialog.querySelector('canvas.react-pdf__Page__canvas') ||
        Array.from(dialog.querySelectorAll('button')).some((button) => button.textContent.trim().toLowerCase() === 'download')
      );
    }) || null;
  },

  async waitForForm60PreviewDialog(timeoutMs = 6000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleForm60PreviewDialog();
        if (dialog) {
          resolve(dialog);
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

  async waitForForm60PreviewDialogToClose(timeoutMs = 7500) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleForm60PreviewDialog()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  getVisibleProposalSyncDialog() {
    const dialogs = Array.from(document.querySelectorAll('.successfully-popup.p-dialog:not(.makerchecker-popup), .p-dialog:not(.makerchecker-popup)'));
    return dialogs.find((dialog) => {
      if (!this.isVisibleElement(dialog)) return false;
      const contentText = String(dialog.textContent || '').trim().toLowerCase();
      if (!contentText) return false;
      if (!contentText.includes('proposal syncing completed') && !contentText.includes('proposal number out')) {
        return false;
      }
      return Boolean(
        dialog.querySelector('.pointer.footer-green') ||
        Array.from(dialog.querySelectorAll('button, [role="button"], .pointer')).some((element) => {
          return String(element.textContent || '').trim().toLowerCase() === 'okay';
        })
      );
    }) || null;
  },

  async waitForProposalSyncDialog(timeoutMs = 3000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleProposalSyncDialog();
        if (dialog) {
          resolve(dialog);
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

  async waitForProposalSyncDialogToClose(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleProposalSyncDialog()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  async dismissProposalSyncDialogIfPresent(logger = console.log, timeoutMs = 3000) {
    const dialog = await this.waitForProposalSyncDialog(timeoutMs);
    if (!dialog) {
      return false;
    }

    logger('ℹ️ Proposal sync success dialog detected');
    const okayButton = dialog.querySelector('.pointer.footer-green') || Array.from(dialog.querySelectorAll('button, [role="button"], .pointer')).find((element) => {
      return String(element.textContent || '').trim().toLowerCase() === 'okay';
    });
    if (!okayButton) {
      logger('⚠️ Proposal sync dialog is visible but Okay button was not found');
      return false;
    }

    clickElement(okayButton);
    const closed = await this.waitForProposalSyncDialogToClose(10000);
    if (!closed) {
      logger('⚠️ Proposal sync dialog did not close after clicking Okay');
      return false;
    }

    await wait(125);
    return true;
  },

  getVisiblePaymentActionBar() {
    const actionBars = Array.from(document.querySelectorAll('.payment, .payment-section, .right-section'));
    return actionBars.find((bar) => {
      if (!this.isVisibleElement(bar)) return false;
      const confirmButton = bar.querySelector('button.Confirm-Continue-btn, button[aria-label="payment-btn"]');
      return confirmButton && this.isVisibleElement(confirmButton);
    }) || null;
  },

  async clickConfirmAndBuyIfSyncProposalVisible(logger = console.log, timeoutMs = 3000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (this.getVisibleApprovalOtpDialog() || this.getVisibleDeclarationOtpDialog()) {
        logger('ℹ️ OTP dialog already visible; skipping Confirm & Buy retry');
        return false;
      }

      const actionBar = this.getVisiblePaymentActionBar();
      if (!actionBar) {
        await wait(100);
        continue;
      }

      const syncButton = actionBar.querySelector('button.Quote-btn, button[aria-label="Quote-btn"]');
      const confirmButton = actionBar.querySelector('button.Confirm-Continue-btn, button[aria-label="payment-btn"]');

      const syncVisible = syncButton && this.isVisibleElement(syncButton);
      const confirmVisible = confirmButton && this.isVisibleElement(confirmButton) && !confirmButton.disabled;

      if (syncVisible && confirmVisible) {
        logger('ℹ️ Sync Proposal bar is still visible; retrying Confirm & Buy Now');
        clickElement(confirmButton);
        await wait(250);
        await waitForSkeletonsToDisappear(7500);
        return true;
      }

      if (confirmVisible && !syncVisible) {
        return false;
      }

      await wait(100);
    }

    return false;
  },

  getVisibleApprovalOtpDialog() {
    const dialogs = Array.from(document.querySelectorAll('#otp-dialog, .p-dialog'));
    return dialogs.find((dialog) => {
      if (!this.isVisibleElement(dialog)) return false;
      if (dialog.id === 'otp-dialog') return true;
      const title = dialog.querySelector('.p-dialog-title, h4');
      if (!title) return false;
      return title.textContent.trim().toLowerCase().includes('confirm your approval');
    }) || null;
  },

  getVisibleDeclarationOtpDialog() {
    const dialogs = Array.from(document.querySelectorAll('.p-dialog'));
    return dialogs.find((dialog) => {
      if (!this.isVisibleElement(dialog)) return false;
      const title = dialog.querySelector('.p-dialog-title, h4');
      if (!title) return false;
      return title.textContent.trim().toLowerCase().includes('confirm your declaration');
    }) || null;
  },

  async waitForDeclarationOtpDialog(timeoutMs = 6000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleDeclarationOtpDialog();
        if (dialog) { resolve(dialog); return; }
        if (Date.now() - start > timeoutMs) { resolve(null); return; }
        setTimeout(check, 200);
      };
      check();
    });
  },

  async waitForDeclarationOtpDialogToClose(timeoutMs = 12000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleDeclarationOtpDialog()) { resolve(true); return; }
        if (Date.now() - start > timeoutMs) { resolve(false); return; }
        setTimeout(check, 250);
      };
      check();
    });
  },

  async waitForApprovalOtpDialog(timeoutMs = 6000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleApprovalOtpDialog();
        if (dialog) {
          resolve(dialog);
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

  async waitForApprovalOtpDialogToClose(timeoutMs = 7500) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleApprovalOtpDialog()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  async setOtpSinceNow() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await new Promise((resolve) => {
      chrome.storage.local.set({ otpSinceTimestamp: Date.now() }, resolve);
    });
  },

  async handleOtpDialogApproval(contextLabel = 'Approval', logger = console.log, labelOverride = null) {
    const isDeclaration = contextLabel.toLowerCase().includes('declaration');
    const waitForDialog = isDeclaration
      ? () => this.waitForDeclarationOtpDialog(10000)
      : () => this.waitForApprovalOtpDialog(10000);
    const waitForClose = isDeclaration
      ? () => this.waitForDeclarationOtpDialogToClose(12000)
      : () => this.waitForApprovalOtpDialogToClose(12000);

    const otpDialog = await waitForDialog();
    if (!otpDialog) {
      logger(`ℹ️ ${contextLabel} OTP dialog not shown`);
      return true;
    }

    logger(`🔐 ${contextLabel} OTP dialog detected, fetching OTP...`);
    const resolvedLabel = labelOverride
      || (isDeclaration ? ORIENTAL_OTP_CONFIG.DECLARATION_SERVICE_LABEL : ORIENTAL_OTP_CONFIG.SERVICE_LABEL);
    const otpResult = await this.fillOTPSection({}, logger, resolvedLabel, contextLabel);
    if (!otpResult?.success) {
      logger(`⚠️ ${contextLabel} OTP fetch/fill failed`);
      return false;
    }

    const closed = await waitForClose();
    if (!closed) {
      // Verification may still be in flight, or the operator may be typing.
      // Either way the dialog stays; wait for it instead of failing.
      logger(`${contextLabel} OTP dialog still open - waiting for it to be completed`);
      await waitForManualOtpCompletion(contextLabel);
    }

    logger(`✅ ${contextLabel} OTP verified`);
    return true;
  },

  async handleForm60OtpApproval(logger = console.log) {
    return this.handleOtpDialogApproval('Form 60', logger, 'ORIENTAL_INSURANCE');
  },

  fillDialogInput(dialog, selector, value) {
    if (value == null || value === '') return false;
    const input = dialog.querySelector(selector);
    if (!input || input.disabled) return false;
    fillInput(input, value);
    return true;
  },

  getDialogInputValue(dialog, selector) {
    const input = dialog.querySelector(selector);
    if (!input) return '';
    return String(input.value || '').trim();
  },

  isDialogDropdownSelected(dialog, selector) {
    const dropdown = dialog.querySelector(selector);
    const label = dropdown?.querySelector('.p-dropdown-label');
    if (!label) return false;
    const text = label.textContent.trim().toLowerCase();
    if (!text) return false;
    if (text.includes('select state') || text.includes('no results found')) return false;
    return true;
  },

  fillAdditionalForm60Fields(dialog, form60Payload) {
    const extraFieldEntries = [
      ['input[name="totalAssets"]', form60Payload.totalAssets],
      ['input[name="transactionDate"]', form60Payload.transactionDate],
      ['input[name="roomNo"]', form60Payload.roomNo],
      ['input[name="streetNo"]', form60Payload.streetNo],
      ['input[name="nameOfPremises"]', form60Payload.nameOfPremises],
      ['input[name="blockName"]', form60Payload.blockName],
      ['input[name="telephoneNumber"]', form60Payload.telephoneNumber],
    ];

    for (const [selector, value] of extraFieldEntries) {
      this.fillDialogInput(dialog, selector, value);
    }
  },

  hasForm60GeneratedState(root) {
    return Array.from(root.querySelectorAll('.fileGreen')).some((el) =>
      el.textContent.trim().toLowerCase().includes('successfully generated')
    );
  },

  async waitForForm60GeneratedState(root, timeoutMs = 7500) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (this.hasForm60GeneratedState(root)) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  getSuccessfulUploadCount(root) {
    return Array.from(root.querySelectorAll('.fileGreen')).filter((el) =>
      el.textContent.trim().toLowerCase().includes('successfully uploaded')
    ).length;
  },

  async waitForSuccessfulUploadCount(root, expectedCount, timeoutMs = 7500) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (this.getSuccessfulUploadCount(root) >= expectedCount) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  },

  async handleForm60PreviewDownload(logger = console.log) {
    const previewDialog = await this.waitForForm60PreviewDialog(10000);
    if (!previewDialog) {
      logger('ℹ️ Form 60 preview dialog not shown');
      return true;
    }

    const content = previewDialog.querySelector('.p-dialog-content');
    if (content) {
      content.scrollTop = content.scrollHeight;
      content.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    const downloadButton = Array.from(previewDialog.querySelectorAll('button')).find((button) =>
      button.textContent.trim().toLowerCase() === 'download'
    );
    if (downloadButton) {
      downloadButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(100);
      clickElement(downloadButton);
      await wait(240);
    } else {
      logger('⚠️ Form 60 preview download button not found');
    }

    const closeButton = previewDialog.querySelector('.p-dialog-header-close');
    if (closeButton) {
      clickElement(closeButton);
    }

    const closed = await this.waitForForm60PreviewDialogToClose(12000);
    if (!closed) {
      logger('⚠️ Form 60 preview dialog did not close');
      return false;
    }

    logger('✅ Form 60 preview handled');
    return true;
  },

  getVisibleDropdownPanel() {
    const panels = Array.from(document.querySelectorAll('.p-dropdown-panel'));
    return panels.find((panel) => this.isVisibleElement(panel)) || null;
  },

  async waitForVisibleDropdownPanel(timeoutMs = 3000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const panel = this.getVisibleDropdownPanel();
        if (panel) {
          resolve(panel);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, 150);
      };
      check();
    });
  },

  async waitForDropdownPanelToClose(timeoutMs = 3000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        if (!this.getVisibleDropdownPanel()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  },

  async selectDialogDropdownCandidates(dialog, selector, values) {
    const dropdown = dialog.querySelector(selector);
    if (!dropdown) return false;

    // Wait for any previously open dropdown panel to close first
    await this.waitForDropdownPanelToClose(2000);

    const candidates = Array.isArray(values) ? values : [values];
    for (const candidate of candidates) {
      if (!candidate) continue;

      // DO NOT use clickElement here — scrollIntoView triggers scroll events
      // which cause PrimeNG to immediately close the dropdown panel
      dropdown.click();
      await wait(250);

      let panel = this.getVisibleDropdownPanel();
      // Retry if panel didn't open
      for (let i = 0; i < 10 && !panel; i++) {
        await wait(100);
        panel = this.getVisibleDropdownPanel();
      }
      if (!panel) continue;

      const filter = panel.querySelector('.p-dropdown-filter');
      if (filter) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(filter, candidate);
        else filter.value = candidate;
        filter.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(250);
      }

      // Re-query panel and options after filter
      panel = this.getVisibleDropdownPanel();
      if (!panel) continue;

      const options = Array.from(panel.querySelectorAll('.p-dropdown-item'));
      let match = options.find((option) => option.innerText.trim().toLowerCase() === String(candidate).trim().toLowerCase());
      if (!match) {
        match = options.find((option) => option.innerText.trim().toLowerCase().includes(String(candidate).trim().toLowerCase()));
      }

      if (match) {
        match.click();
        await wait(150);
        await this.waitForDropdownPanelToClose(2000);
        return true;
      } else {
        // Close the panel if no match found
        dropdown.click();
        await this.waitForDropdownPanelToClose(2000);
      }
    }

    return false;
  },

  async selectDropdownCandidates(selector, values, root = document) {
    const candidates = Array.isArray(values) ? values : [values];
    for (const value of candidates) {
      if (!value) continue;
      await selectPrimeDropdown(selector, value, false);
      await wait(150);
      const dropdown = root.querySelector(selector) || document.querySelector(selector);
      const label = dropdown?.querySelector('.p-dropdown-label');
      if (label && label.textContent.trim() && !label.textContent.toLowerCase().includes('no results')) {
        return true;
      }
    }
    return false;
  },

  async handleForm60Generation(customer, root = this.getActiveSlideRoot(), logger = console.log, options = {}) {
    const existingDialog = this.getVisibleForm60Dialog();
    let dialog = existingDialog;

    if (!dialog) {
      const generateButton = Array.from(root.querySelectorAll('button')).find((button) =>
        button.textContent.trim().toLowerCase().includes('generate form 60')
      );

      if (!generateButton) {
        logger('⚠️ Generate Form 60 button not found on KYC page');
        return false;
      }

      clickElement(generateButton);
      await wait(100);
      dialog = await this.waitForForm60Dialog(8000);
    }

    if (!dialog) {
      logger('⚠️ Form 60 dialog did not open');
      return false;
    }

    const form60Payload = await this.resolveForm60Payload(customer);

    const requiredFieldEntries = [
      ['input[name="firstName"]', form60Payload.firstName],
      ['input[name="surName"]', form60Payload.surName],
      ['input[name="email"]', form60Payload.email],
      ['input[name="dob"]', form60Payload.dob],
      ['input[name="fatherFirstName"]', form60Payload.fatherFirstName],
      ['input[name="mobileNumber"]', form60Payload.mobileNumber],
      ['input[name="aadharNumber"]', form60Payload.aadharNumber],
    ];

    // 1. Fill Title (salutation) dropdown FIRST — it's required
    await this.selectDialogDropdownCandidates(dialog, '#title', ['Mr.', 'Mr', 'Ms.', 'Mrs.', 'Miss']);

    // 2. Fill Father Title dropdown
    await this.selectDialogDropdownCandidates(dialog, '#fatherTitle', form60Payload.fatherTitleCandidates);

    // 3. Fill all text fields
    for (const [selector, value] of requiredFieldEntries) {
      this.fillDialogInput(dialog, selector, value);
    }

    // 4. Fill additional fields (location, transaction, etc.) upfront
    this.fillAdditionalForm60Fields(dialog, form60Payload);

    // 5. Fill State dropdown if available
    if (form60Payload.state) {
      await this.selectDialogDropdownCandidates(dialog, '#stateType', [form60Payload.state]);
    }

    const submitButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
      button.textContent.trim().toLowerCase().includes('generate form 60')
    );
    if (!submitButton) {
      logger('⚠️ Form 60 submit button not found inside dialog');
      return false;
    }

    await this.setOtpSinceNow();
    clickElement(submitButton);
    await wait(200);

    let approvalDialogVisible = await this.waitForApprovalOtpDialog(4000);
    let closed = approvalDialogVisible ? true : await this.waitForForm60DialogToClose(5000);
    if (!closed) {
      const activeDialog = this.getVisibleForm60Dialog() || dialog;

      // Re-check and fill any dropdowns that are still empty
      if (!this.isDialogDropdownSelected(activeDialog, '#title')) {
        await this.selectDialogDropdownCandidates(activeDialog, '#title', ['Mr.', 'Mr', 'Ms.', 'Mrs.', 'Miss']);
      }

      if (!this.isDialogDropdownSelected(activeDialog, '#fatherTitle')) {
        await this.selectDialogDropdownCandidates(activeDialog, '#fatherTitle', form60Payload.fatherTitleCandidates);
      }

      if (!this.getDialogInputValue(activeDialog, 'input[name="dob"]')) {
        this.fillDialogInput(activeDialog, 'input[name="dob"]', form60Payload.dob);
      }

      const totalAssetsValue = this.getDialogInputValue(activeDialog, 'input[name="totalAssets"]');
      if (!totalAssetsValue || totalAssetsValue === '₹0' || totalAssetsValue === '0') {
        this.fillAdditionalForm60Fields(activeDialog, form60Payload);
      }

      if (!this.isDialogDropdownSelected(activeDialog, '#stateType') && form60Payload.state) {
        await this.selectDialogDropdownCandidates(activeDialog, '#stateType', [form60Payload.state]);
      }

      approvalDialogVisible = await this.waitForApprovalOtpDialog(2400);
      if (!approvalDialogVisible) {
        await this.setOtpSinceNow();
        clickElement(submitButton);
        await wait(200);
      }
      closed = approvalDialogVisible ? true : await this.waitForForm60DialogToClose(12000);
    }

    if (!closed) {
      logger('⚠️ Form 60 dialog did not close after submit');
      return false;
    }

    const otpApproved = await this.handleForm60OtpApproval(logger);
    if (!otpApproved) {
      return false;
    }

    const previewHandled = await this.handleForm60PreviewDownload(logger);
    if (!previewHandled) {
      return false;
    }

    const generated = await this.waitForForm60GeneratedState(root, 12000);
    if (!generated) {
      if (options.fromInitiateDialog) {
        // The "successfully generated" chip belongs to the inline KYC form; the
        // Initiate KYC dialog does not render one. The OTP verification and the
        // preview dialog above already confirmed the form was accepted.
        logger('✅ Form 60 generated via the Initiate KYC dialog (no inline success chip to check)');
        return true;
      }
      logger('⚠️ Form 60 success state not visible on KYC page');
      return false;
    }

    logger('✅ Form 60 generated through dialog');
    return true;
  },

  async ensureJourneyStepVisible() {
    const root = this.getActiveSlideRoot();
    const currentMarker = this.findVisibleElement(
      ['#fileInput2', '#addressDocument', ORIENTAL_SELECTORS.mobileNumberInput, ORIENTAL_SELECTORS.emailInput],
      root
    );
    if (currentMarker) return true;
    await this.clickContinue(document);
    await wait(100);
    return true;
  },

  // Drops salutations and punctuation so a cosmetic "Mr" prefix is not read as a
  // real difference between the portal's KYC name and the one in the request.
  nameParts(value) {
    const titles = ['MR', 'MRS', 'MS', 'MISS', 'SHRI', 'SHRIMATI', 'SMT', 'DR', 'M/S', 'MST'];
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .split(' ')
      .map((part) => part.replace(/[^A-Z]/g, ''))
      .filter((part) => part && !titles.includes(part));
  },

  /**
   * Makes the portal's full name match the request. The field is disabled and
   * filled from the KYC record stored at Form 60 / OVD, which regularly drops a
   * middle name. The request is the source of truth, so a difference unlocks the
   * field and overwrites it instead of failing the run.
   */
  async applyFullName(root, fullName, logger = console.log) {
    if (!fullName) return;
    const nameInput = this.findVisibleElement(ORIENTAL_SELECTORS.fullNameInput, root);
    if (!nameInput) {
      logger('Full name input not found on personal details - name left as the portal had it');
      return;
    }
    const portalName = String(nameInput.value || '').trim();
    if (this.nameParts(portalName).join(' ') === this.nameParts(fullName).join(' ')) {
      logger('Portal full name matches request: "' + portalName + '"');
      return;
    }
    logger('Full name mismatch - replacing portal name "' + (portalName || '(empty)') + '" with "' + fullName + '"');
    const applied = await fillLockedInput(nameInput, fullName);
    if (!applied) {
      throw new Error('KYC full name did not retain "' + fullName + '" after unlocking (portal kept "' + (String(nameInput.value || '') || '(empty)') + '")');
    }
    logger('Full name set from request: "' + fullName + '"');
  },

  /**
   * Ticks "Same as Permanent" so the portal copies the permanent address into the
   * Current Address block. Without it the slide fails Continue with "Please enter
   * Current Address" / "Please enter current State".
   */
  async applySameAsPermanent(root, address, logger = console.log) {
    const checkbox = this.findVisibleElement(ORIENTAL_SELECTORS.samePermanentAddressCheckbox, root);
    if (!checkbox) {
      logger('"Same as Permanent" checkbox not found - current address left to the portal');
      return;
    }
    if (!(await setCheckboxChecked(checkbox, true))) {
      throw new Error('Could not select "Same as Permanent" address');
    }
    logger('Selected "Same as Permanent" for the current address');
    await wait(250);

    const currentAddress = this.findVisibleElement(ORIENTAL_SELECTORS.currentAddressInput, root);
    if (!currentAddress) return;
    if (String(currentAddress.value || '').trim()) return;

    // The copy runs in a React effect; one re-toggle settles it when it does not land.
    logger('Current address still empty after "Same as Permanent" - re-toggling');
    await setCheckboxChecked(checkbox, false);
    await wait(200);
    await setCheckboxChecked(checkbox, true);
    await wait(400);
    if (String(currentAddress.value || '').trim()) return;

    logger('Portal never copied the address - filling the current address from the request');
    if (address && !(await fillLockedInput(currentAddress, address))) {
      throw new Error('Current address could not be populated');
    }
  },

  async fillPersonalDetails(kycData, logger = console.log) {
    const p = kycData?.customerDetails || kycData;
    const addr = p.address || {};
    const personalMarker = await this.waitForVisibleElement(
      [ORIENTAL_SELECTORS.mobileNumberInput, ORIENTAL_SELECTORS.emailInput, "input[name='dob']"],
      12000,
      { allowDisabled: false }
    );

    if (!personalMarker) {
      throw new Error('Personal details step not visible');
    }

    const root = this.getActiveSlideRoot();
    const mobileValue = p.mobile || p.mobileNumber || p.phoneNumber || p.contactNumber;

    const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || p.fullName;
    const address = [
      addr.building || p.building,
      addr.street || p.street,
      addr.locality || p.locality,
      addr.district || p.district,
      addr.city || p.city,
      addr.state || p.state,
      addr.country || p.country,
      addr.pincode || p.pincode
    ].filter(Boolean).join(', ');

    await this.applyFullName(root, fullName, logger);

    const mobileInput = this.findVisibleElement(ORIENTAL_SELECTORS.mobileNumberInput, root, { allowDisabled: false });
    if (mobileInput && mobileValue) fillInput(mobileInput, mobileValue);

    // Always use the OTP email from config so OTP is received on our email, not the client's
    const otpCfg = await new Promise((resolve) => {
      chrome.storage.local.get(['otpConfig'], (r) => resolve(r.otpConfig || {}));
    });
    const otpEmail = otpCfg.email || ORIENTAL_DEFAULT_VALUES.email;

    const emailInput = this.findVisibleElement(ORIENTAL_SELECTORS.emailInput, root, { allowDisabled: false });
    if (emailInput) fillInput(emailInput, otpEmail);

    // Clear "Same as Permanent" first: an already-ticked box holds a stale copy of
    // the address, and the portal only re-copies on the next tick.
    const sameAsPermanent = this.findVisibleElement(ORIENTAL_SELECTORS.samePermanentAddressCheckbox, root);
    if (sameAsPermanent && sameAsPermanent.checked) {
      await setCheckboxChecked(sameAsPermanent, false);
      await wait(150);
    }

    const permanentAddressInput = this.findVisibleElement(ORIENTAL_SELECTORS.permanentAddressInput, root);
    if (permanentAddressInput && address) {
      if (permanentAddressInput.disabled || permanentAddressInput.readOnly) {
        if (!(await fillLockedInput(permanentAddressInput, address))) {
          throw new Error('Permanent address did not retain the supplied customer address');
        }
      } else {
        fillInput(permanentAddressInput, address);
      }
    }

    const state = addr.state || p.state;
    const city = addr.city || p.city;
    const pincode = addr.pincode || p.pincode;

    if (state && city && pincode && root.querySelector('.p-dropdown')) {
      await fillPrimeDropdownByLabel("State", state);
      await wait(50);
      await fillPrimeDropdownByLabel("City", city);
      await wait(50);
      await fillPrimeDropdownByLabel("Pincode", pincode);
      await wait(50);
    }

    // Tick it only now, so the portal copies the corrected permanent address.
    await this.applySameAsPermanent(root, address, logger);

    // Date of Birth
    const dobInput = this.findVisibleElement("input[name='dob']", root);
    if (dobInput && !dobInput.value && p.dateOfBirth) {
      await fillMuiDate("input[name='dob']", p.dateOfBirth);
      await wait(50);
    }

    await wait(50);
    // Click Continue
    await this.clickContinue(root);
    return { success: true };
  },

  async fillNomineeDetails(kycData, logger = console.log) {
    const c = kycData?.customerDetails || kycData;
    const root = this.getActiveSlideRoot();
    const nomineeVisible = this.findVisibleElement(['#nomineeName', '#identifierType', '#nomineeAddress'], root);
    if (!nomineeVisible) {
      console.log('⏭️ Nominee step not visible, skipping');
      return { success: true, skipped: true };
    }

    const nomineeDetails = c.nominee;
    if(nomineeDetails) {
      const nomineeName = nomineeDetails.nomineeName || nomineeDetails.name;
      const nomineeRelationship = nomineeDetails.nomineeRelationship || nomineeDetails.relationship;
      const nomineeDateOfBirth = nomineeDetails.nomineeDateOfBirth || nomineeDetails.dateOfBirth;

      // fill nominee name
      if(nomineeName) {
        const nomineeNameInput = this.findVisibleElement('input[id="nomineeName"]', root, { allowDisabled: false });
        if (nomineeNameInput) fillInput(nomineeNameInput, nomineeName);
      }
      if(nomineeRelationship) {
        await selectPrimeDropdown("#identifierType", nomineeRelationship,false);
      }
      if(nomineeDateOfBirth) {
        await fillMuiDate("input[placeholder='DD-MM-YYYY']", nomineeDateOfBirth);
      }
      if(nomineeDetails.address) {
        const nomineeAddressInput = this.findVisibleElement('input[id="nomineeAddress"]', root, { allowDisabled: false });
        if (nomineeAddressInput) fillInput(nomineeAddressInput, nomineeDetails.address);
      }
      await this.clickContinue(root);
      return { success: true };
    } else {
      await this.clickContinue(root);
      console.log("Skipping nominee details");
      return { success: true };
    }
  },

  async fillOTPSection(kycData, logger = console.log, labelOverride = null, contextLabel = 'OTP') {
    logger('Fetching the ' + contextLabel + ' OTP (manual entry is accepted at any point)');

    // fetchOTPWithRetry watches for a manual fill throughout and, if no OTP
    // ever arrives, blocks on manual entry rather than failing - so there is
    // no separate race to run here.
    const otpData = await fetchOTPWithRetry({
      labelOverride,
      contextLabel,
      previousOtpId: this._otpBaselineId || null,
    });
    this._otpBaselineId = null;

    if (!otpData || otpData.manualFill) {
      logger(contextLabel + ' OTP was entered manually - proceeding');
      return { success: true };
    }

    logger('Filling the ' + contextLabel + ' OTP');
    const fillResult = await fillOTP(otpData, 0, labelOverride, contextLabel);
    if (!fillResult?.success) {
      return { success: false, error: fillResult?.error || 'OTP verification failed' };
    }
    return { success: true };
  },

  getVisibleKYCDialog() {
    const dialog = document.querySelector(ORIENTAL_SELECTORS.kycDialog);
    return dialog && this.isVisibleElement(dialog) ? dialog : null;
  },

  async waitForKYCDialog(timeoutMs = 8000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const dialog = this.getVisibleKYCDialog();
        if (dialog) { resolve(dialog); return; }
        if (Date.now() - start > timeoutMs) { resolve(null); return; }
        setTimeout(check, 200);
      };
      check();
    });
  },

  findKYCDialogOption(dialog, text) {
    if (!dialog) return null;
    const needle = String(text || '').trim().toLowerCase();
    const options = dialog.querySelectorAll('.kyc-option, .user-type-option');
    for (const option of options) {
      if (option.textContent.trim().toLowerCase().includes(needle)) return option;
    }
    return null;
  },

  // A cheap fingerprint of which step the dialog is showing, used to tell
  // "Continue advanced the dialog" from "Continue did nothing".
  getKYCDialogSignature() {
    const dialog = this.getVisibleKYCDialog();
    if (!dialog) return 'closed';
    const heading = dialog.querySelector('h2')?.textContent?.trim() || '';
    const step = dialog.querySelector('.kyc-method') ? 'method' : 'initiate';
    return step + ':' + heading;
  },

  // Inline validation text the dialog shows when Continue is refused.
  readKYCDialogValidation() {
    const dialog = this.getVisibleKYCDialog();
    if (!dialog) return '';
    const messages = Array.from(
      dialog.querySelectorAll('.p-error, .error-msg, .errorMsg, .error-message, .invalid-feedback')
    )
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return Array.from(new Set(messages)).join(' | ');
  },

  async clickKYCDialogProceed(label, logger = console.log) {
    const dialog = this.getVisibleKYCDialog();
    if (!dialog) { logger('⚠️ ' + label + ': Initiate KYC dialog not visible'); return false; }
    const btn = dialog.querySelector('button.proceed-btn')
      || Array.from(dialog.querySelectorAll('button')).find((b) => /continue/i.test(b.textContent));
    if (!btn) { logger('⚠️ ' + label + ': Continue button not found'); return false; }

    const before = this.getKYCDialogSignature();
    clickElement(btn);

    // Give the dialog a moment to advance or close before reporting success.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (this.getKYCDialogSignature() !== before) break;
      await wait(250);
    }
    logger(label + ': clicked Continue');
    return true;
  },

  /**
   * Drives the Initiate KYC dialog to closure.
   *
   * The portal decides how many steps it shows: Continue on the Initiate step
   * sometimes drops straight to the KYC form and sometimes stops on "Choose KYC
   * Method", and after Form 60 that second step can take a few seconds to render.
   * Probing for it once right after the click left the Form 60 path waiting on a
   * dialog that was sitting on an unanswered method step, so each state is polled
   * for instead and re-driven until the dialog closes.
   */
  async advanceKYCDialogToClose(label, logger = console.log) {
    const deadline = Date.now() + 45000;
    let proceedAttempts = 0;
    let methodAttempts = 0;

    while (Date.now() < deadline) {
      const dialog = this.getVisibleKYCDialog();
      if (!dialog) {
        logger('✅ Initiate KYC dialog closed — KYC form should now be editable');
        return true;
      }

      const method = dialog.querySelector('.kyc-method');
      if (method && this.isVisibleElement(method)) {
        if (methodAttempts >= 2) {
          const validation = this.readKYCDialogValidation();
          throw new Error(
            label + ': the dialog kept returning to "Choose KYC Method"' + (validation ? ' - ' + validation : '')
          );
        }
        methodAttempts++;
        // The method step replaces the Initiate step, so its own Continue clicks
        // do not count against the Initiate step's retry budget.
        proceedAttempts = 0;
        await this.selectOvdKycMethod(logger);
        continue;
      }

      if (dialog.querySelector('button.proceed-btn')) {
        if (proceedAttempts >= 3) {
          const validation = this.readKYCDialogValidation();
          throw new Error(
            label + ': the dialog stayed on its current step after ' + proceedAttempts +
            ' Continue clicks' + (validation ? ' - ' + validation : '')
          );
        }
        proceedAttempts++;
        await this.clickKYCDialogProceed(label + ' (Continue ' + proceedAttempts + ')', logger);
        continue;
      }

      await wait(250);
    }

    const validation = this.readKYCDialogValidation();
    throw new Error('Initiate KYC dialog did not close' + (validation ? ' - ' + validation : ''));
  },

  // The "Choose KYC Method" step (PAN path only). Always OVD — DigiLocker needs an
  // interactive consent journey that cannot be driven here.
  async selectOvdKycMethod(logger = console.log) {
    const deadline = Date.now() + 15000;
    let methodVisible = false;
    while (Date.now() < deadline) {
      const dialog = this.getVisibleKYCDialog();
      if (!dialog) break; // dialog closed → portal dropped straight to the KYC form
      const method = dialog.querySelector('.kyc-method');
      if (method && this.isVisibleElement(method)) { methodVisible = true; break; }
      await wait(250);
    }
    if (!methodVisible) { logger('ℹ️ Choose KYC Method step not shown — continuing'); return true; }

    const dialog = this.getVisibleKYCDialog();
    const ovd = this.findKYCDialogOption(dialog, 'officially valid document');
    if (!ovd) { logger('⚠️ Choose KYC Method: OVD option not found'); return false; }
    clickElement(ovd);
    const radio = ovd.querySelector('input[type="radio"]');
    if (radio) radio.click();
    await wait(300);
    if (!ovd.classList.contains('active')) {
      logger('⚠️ Choose KYC Method: OVD option did not become active');
    }
    logger('Choose KYC Method: selected Officially Valid Document (OVD)');
    await this.clickKYCDialogProceed('Choose KYC Method', logger);
    return true;
  },

  // Answers the Initiate KYC dialog. Returns the path taken ('pan' | 'form60' |
  // 'skipped') so fillKYCDetails knows whether Form 60 was already generated and
  // whether the dialog pre-filled the PAN on the inline form behind it.
  async handleInitiateKYCDialog(customer, logger = console.log) {
    const dialog = await this.waitForKYCDialog(8000);
    if (!dialog) {
      // Older portal builds keep the PAN question inline on the KYC slide.
      logger('ℹ️ Initiate KYC dialog not present — assuming inline KYC form');
      return 'skipped';
    }
    logger('📋 Initiate KYC dialog opened');

    const customerType = this.resolveCustomerType(customer);
    const wantCorporate = customerType === 'Corporate';
    const typeOption = this.findKYCDialogOption(dialog, wantCorporate ? 'corporate' : 'individual');
    if (typeOption) {
      clickElement(typeOption);
      const radio = typeOption.querySelector('input[type="radio"]');
      if (radio) radio.click();
      await wait(150);
      logger('Initiate KYC: selected user type ' + (wantCorporate ? 'Corporate' : 'Individual'));
    } else {
      logger('⚠️ Initiate KYC: user type option not found');
    }

    const pan = String(customer?.pan || customer?.panNumber || '').trim().toUpperCase();
    if (this.hasPanCard(customer) && pan) {
      const panInput = dialog.querySelector('#panNumber');
      if (!panInput) { logger('⚠️ Initiate KYC: PAN input not found'); return 'skipped'; }
      fillInput(panInput, pan);
      await wait(150);
      logger('Initiate KYC: entered PAN ' + pan);
      await this.clickKYCDialogProceed('Initiate KYC', logger);
      await this.advanceKYCDialogToClose('Initiate KYC', logger);
      return 'pan';
    }

    // No PAN — generate Form 60 straight from the dialog.
    logger('Initiate KYC: no PAN supplied — generating Form 60');
    const form60Btn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      /generate form 60/i.test(b.textContent)
    );
    if (!form60Btn) { logger('⚠️ Initiate KYC: Generate Form 60 button not found'); return 'skipped'; }
    clickElement(form60Btn);
    const editableDialog = await this.waitForForm60Dialog(8000);
    if (!editableDialog) throw new Error('Form 60 dialog did not open from the Initiate KYC dialog');
    const ok = await this.handleForm60Generation(customer, this.getActiveSlideRoot(), logger, { fromInitiateDialog: true });
    if (!ok) throw new Error('Form 60 generation failed from the Initiate KYC dialog');

    // Form 60 leaves the dialog on either the Initiate step (needs Continue) or the
    // method step, and the portal can take a few seconds to decide which.
    // advanceKYCDialogToClose polls for whichever appears instead of probing once.
    await this.advanceKYCDialogToClose('Initiate KYC (post Form 60)', logger);
    return 'form60';
  },

  async fillKYCDetails(kycData, logger = console.log) {
    const c = kycData?.customerDetails || kycData;
    const minimumUploadBytes = 50 * 1024;

    // New portal: an "Initiate KYC" dialog gates the inline KYC form. It collects
    // user type + PAN (or Form 60) and, on the PAN path, the OVD method. The inline
    // form only renders once the dialog closes.
    const kycPath = await this.handleInitiateKYCDialog(c, logger);

    const kycMarker = await this.waitForVisibleElement(['#fileInput2', '#addressDocument', '#pancardNumber'], 12000);
    if (!kycMarker) {
      throw new Error('KYC details step not visible');
    }

    const root = this.getActiveSlideRoot();
    const customerType = this.resolveCustomerType(c);
    const hasPan = this.hasPanCard(c);

    console.log(customerType, 'customerType');
    await this.selectChoiceInSection('User Type', customerType, root);
    await wait(75);

      // Do you have pan yes or no radio button
      if(hasPan){
        await this.selectChoiceInSection('Do you have PAN Card', 'Yes', root);
        await wait(100);
        // PAN number. When the Initiate KYC dialog collected it, the portal renders
        // this field pre-filled and disabled; a different value there means the
        // proposal carries a different PAN than the request, which must not be
        // papered over — so compare strictly and stop on a mismatch.
        const requestedPan = String(c.pan || c.panNumber || '').trim().toUpperCase();
        const panNumberInput = root.querySelector('input[id="pancardNumber"]');
        if (panNumberInput) {
          if (panNumberInput.disabled) {
            const portalPan = String(panNumberInput.value || '').trim().toUpperCase();
            if (requestedPan && portalPan && portalPan !== requestedPan) {
              throw new Error('PAN mismatch on KYC form: portal holds "' + portalPan + '" but the request sent "' + requestedPan + '"');
            }
            logger('PAN pre-filled and locked by the portal: ' + (portalPan || '(empty)'));
          } else if (requestedPan) {
            fillInput(panNumberInput, requestedPan);
          }
        }
        // upload pan card image
        await uploadFile(
          ['input[id="fileInput2"]', 'input[name="inspectionReport"]'],
          {
            dataUrl: c.panImage,
            fileId: c.panImageFileId,
            fileName: 'pan-card',
            mimeType: 'image/jpeg',
            minimumBytes: minimumUploadBytes,
          }
        );
      } else if (kycPath === 'form60') {
        // Form 60 was already generated inside the Initiate KYC dialog; the inline
        // PAN question is answered "No" and locked by the portal.
        logger('No PAN — Form 60 already generated in the Initiate KYC dialog');
      } else {
        await this.selectChoiceInSection('Do you have PAN Card', 'No', root);
        await wait(100);
        const form60Generated = await this.handleForm60Generation(c, root, logger);
        if (!form60Generated) {
          // Legacy fallback for older Oriental variants that still expose a file input.
          const form60Input = document.querySelector('input[id="form60FileName"]');
          if (form60Input && c.form60PdfFileId) {
            await uploadFile('input[id="form60FileName"]', c.form60PdfFileId, "form60.pdf", "application/pdf");
          } else if (form60Input && c.form60) {
            const form60File = generateForm60Pdf(c.form60);
            uploadFileObject('input[id="form60FileName"]', form60File);
          } else {
            logger('❌ Form 60 generation failed (OTP not verified) — stopping KYC flow');
            return { success: false, error: 'Form 60 OTP verification failed' };
          }
        }
      }

            // select address document dropdown
      await selectPrimeDropdown("#addressDocument", c.documentType,false);

      // fill aadhaar number
      const aadhaarNumberInput = this.findVisibleElement('input[id="addressDocumentNumber"]', root, { allowDisabled: false });
      const addressDocumentNumber = this.resolveAddressDocumentNumber(c);
      if (aadhaarNumberInput && addressDocumentNumber) fillInput(aadhaarNumberInput, addressDocumentNumber);
      // upload address proof images
      await uploadFile(
        ['input[id="addressDocumentFrontFile"]', 'input[id="addressDocumentFile"]', 'input[name="addressDocumentName"]'],
        {
          dataUrl: c.ovdFrontImage,
          fileId: c.ovdFrontImageFileId,
          fileName: 'address-proof-front',
          mimeType: 'image/jpeg',
          minimumBytes: minimumUploadBytes,
        }
      );
      if (c.ovdBackImage || c.ovdBackImageFileId) {
        await uploadFile(
          ['input[id="addressDocumentBackFile"]'],
          {
            dataUrl: c.ovdBackImage,
            fileId: c.ovdBackImageFileId,
            fileName: 'address-proof-back',
            mimeType: 'image/jpeg',
            minimumBytes: minimumUploadBytes,
          }
        );
      }

      const expectedUploadCount = (c.ovdBackImage || c.ovdBackImageFileId) ? 2 : 1;
      const uploadsReady = await this.waitForSuccessfulUploadCount(root, expectedUploadCount, 15000);
      if (!uploadsReady) {
        throw new Error('Address proof upload confirmations not visible');
      }

      // Click Continue
      await wait(125);
      await this.clickContinue(root);
      return { success: true };
  },
  async completePostKYCSteps(kycData, logger = console.log) {
      const c = kycData?.customerDetails || kycData;

      const personalDetailsTitle = await this.waitForVisibleText(['.policy-title', 'h4'], 'your personal details', 4000, document);
      if (personalDetailsTitle) {
        await this.clickContinue(document);
        await wait(125);
      }

      const nomineeTitle = await this.waitForVisibleText(['.policy-title', 'h4'], 'nominee details', 10000, document);
      if (nomineeTitle || this.findVisibleElement(['#nomineeName', '#identifierType'], this.getActiveSlideRoot())) {
        await this.fillNomineeDetails(kycData, logger);
      }

      const previewTitle = await this.waitForVisibleText(['.policy-title', 'h4'], 'proposal preview', 10000, document);
      if (previewTitle) {
        await this.clickContinue(document);
        await wait(125);
      }

      const declarationTitle = await this.waitForVisibleText(['.policy-title', 'h4'], 'declaration', 12000, document);
      if (!declarationTitle) {
        return { success: false, error: 'Declaration page not visible' };
      }

      const whatsappCheckbox = await waitForElement('#whatsapp', { timeoutMs: 5000, root: document });
      if (!whatsappCheckbox) {
        return { success: false, error: 'Declaration checkbox not found' };
      }

      whatsappCheckbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const checkbox = document.querySelector('#whatsapp');
      if (checkbox && !checkbox.checked) {
        checkbox.click();
      }

      await wait(125);
      await this.dismissProposalSyncDialogIfPresent(logger, 2500);
      await this.setOtpSinceNow();
      // Note the newest OTP already in the mailbox so the one the portal is
      // about to send can be told apart from it.
      this._otpBaselineId = await captureLatestOtpId(ORIENTAL_OTP_CONFIG.DECLARATION_SERVICE_LABEL);
      await this.clickContinue(document);

      const alreadyFoundDialog = Array.from(document.querySelectorAll('.p-dialog')).find((dialog) =>
        this.isVisibleElement(dialog)
        && String(dialog.textContent || '').toUpperCase().includes('UNIQUE REF NO OR POLICY NO ALREADY FOUND'));
      if (alreadyFoundDialog) {
        const okayBtn = alreadyFoundDialog.querySelector('.pointer.footer-red, .pointer')
          || Array.from(alreadyFoundDialog.querySelectorAll('button')).find((btn) =>
            String(btn.textContent || '').trim().toLowerCase() === 'okay');
        if (okayBtn) clickElement(okayBtn);
        return { success: false, error: 'Policy already exists (UNIQUE REF NO OR POLICY NO ALREADY FOUND)' };
      }

      // A modified IDV slab sends the proposal to a checker; no OTP follows.
      const makerCheckerEarly = await waitForMakerCheckerDialog(3000);
      if (makerCheckerEarly) {
        logger('Maker-checker approval dialog detected after Confirm & Buy Now');
        await handleMakerCheckerDialog(makerCheckerEarly, logger);
        return { success: true, approvalPending: true };
      }

      let approvalDialogVisible = await this.waitForDeclarationOtpDialog(3000);
      if (!approvalDialogVisible) {
        const dismissedAfterConfirm = await this.dismissProposalSyncDialogIfPresent(logger, 4000);
        if (dismissedAfterConfirm) {
          approvalDialogVisible = await this.waitForDeclarationOtpDialog(3000);
        }
        if (!approvalDialogVisible) {
          await this.clickConfirmAndBuyIfSyncProposalVisible(logger, 5000);
          // after retry, give extra time for the OTP dialog to appear
          approvalDialogVisible = await this.waitForDeclarationOtpDialog(6000);
        }
      }

      const declarationOtpApproved = await this.handleOtpDialogApproval('Declaration', logger);
      if (!declarationOtpApproved) {
        return { success: false, error: 'Declaration OTP verification failed' };
      }

      // The checker popup can also arrive after OTP verification.
      const makerCheckerAfterOtp = await waitForMakerCheckerDialog(3000);
      if (makerCheckerAfterOtp) {
        logger('Maker-checker approval dialog detected after Declaration OTP');
        await handleMakerCheckerDialog(makerCheckerAfterOtp, logger);
        return { success: true, approvalPending: true };
      }

      return { success: true };
  },
  async selectPaymentMethod(method, logger = console.log) {
    const selectedMethod = method || 'Send Payment Link';
    const paymentTitle = await this.waitForVisibleText(['.policy-title', 'h4'], 'choose payment method', 15000, document);
    if (!paymentTitle) {
      const makerChecker = await waitForMakerCheckerDialog(3000);
      if (makerChecker) {
        logger('Maker-checker approval dialog detected instead of the payment page');
        await handleMakerCheckerDialog(makerChecker, logger);
        return { success: true, approvalPending: true };
      }
      return { success: false, error: 'Payment method page not visible' };
    }

    const radios = Array.from(document.querySelectorAll('input[name*="previousPolicyType"]'));
    const targetRadio = radios.find((radio) =>
      String(radio.value || '').trim().toLowerCase() === String(selectedMethod).trim().toLowerCase()
    );

    if (!targetRadio) {
      return { success: false, error: 'Payment method not found' };
    }

    const radioLabel = targetRadio.closest('label');
    if (radioLabel) clickElement(radioLabel);
    else clickElement(targetRadio);
    await wait(125);

    const payNowButton = await waitForButtonEnabled('button.policy-btn', 7500, document);
    if (!payNowButton || payNowButton.disabled) {
      return { success: false, error: 'Pay Now button not enabled' };
    }

    clickElement(payNowButton);
    await wait(250);

    const emailRadio = await this.waitForVisibleElement(['input[name="flexRadioDefault"][value="EMAIL"]'], 5000, { allowDisabled: false });
    if (emailRadio) {
      clickElement(emailRadio);
      await wait(100);
      await this.clickContinue(document);
    }

    return { success: true };
  },
  async clickContinue(root = document) {
    // Check if automation is paused before proceeding
    await AutomationPauseController.checkpoint();

    await waitForSkeletonsToDisappear(7500);
    scrollToBottom();
    await wait(125);

    let btn = null;
    const activeFooter = document.querySelector('.slick-slide.slick-active .policy-form-footer');
    if (activeFooter) {
      btn = activeFooter.querySelector('button.policy-btn, button.Confirm-Continue-btn');
    }
    if (!btn) {
      btn = document.querySelector('.policy-form-footer button.policy-btn, .payment-section .Confirm-Continue-btn, .payment-section button[type="submit"], .payment .Confirm-Continue-btn, .payment button[aria-label="payment-btn"]');
    }
    if (!btn) {
      const candidates = [
        findElementByText('button', 'Continue', root),
        findElementByText('button', 'Next', root),
        findElementByText('button', 'Submit', root),
        findElementByText('button', 'Confirm & Buy Now', root),
        findElementByText('button', 'Continue', document),
        findElementByText('button', 'Next', document),
        findElementByText('button', 'Submit', document),
        findElementByText('button', 'Confirm & Buy Now', document),
      ];
      for (const candidate of candidates) {
        if (candidate && !candidate.closest('.p-dialog') && !candidate.disabled) {
          btn = candidate;
          break;
        }
      }
    }
    if (!btn) {
      btn = qs(ORIENTAL_SELECTORS.continueButton, root) || qs(ORIENTAL_SELECTORS.continueButton, document);
    }
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(125);
      clickElement(btn);
      console.log("Clicked continue button", btn.innerText);
      await wait(125);
      await waitForSkeletonsToDisappear(10000);
      await wait(250);
      return true;
    }
    return false;
  },
  async run(kycData, logger = console.log) {
    AutomationPauseController.setPhase('kyc');
    try {
      const root = document;

      if (!AutomationPauseController.isStepCompleted('kyc.proposal')) {
        if (kycData?.proposalNumber) {
          await AutomationPauseController.checkpoint('KYC → Proposal Verification');
          await this.enterProposalAndVerify(kycData.proposalNumber, logger);
          await wait(250);
        }
        AutomationPauseController.markStepComplete('kyc.proposal');
      } else {
        logger('⏭️ KYC proposal already completed, skipping');
      }

      await this.ensureJourneyStepVisible();

      if (!AutomationPauseController.isStepCompleted('kyc.documents')) {
        await AutomationPauseController.checkpoint('KYC → Document Upload & Verification');
        await this.fillKYCDetails(kycData, logger);
        await wait(75);
        AutomationPauseController.markStepComplete('kyc.documents');
      } else {
        logger('⏭️ KYC documents already completed, skipping');
      }

      if (!AutomationPauseController.isStepCompleted('kyc.personal')) {
        await AutomationPauseController.checkpoint('KYC → Personal Details');
        await this.fillPersonalDetails(kycData, logger);
        await wait(25);
        AutomationPauseController.markStepComplete('kyc.personal');
      } else {
        logger('⏭️ KYC personal details already completed, skipping');
      }

      if (!AutomationPauseController.isStepCompleted('kyc.finalize')) {
        await AutomationPauseController.checkpoint('KYC → Nominee, Declaration & OTP');
        const finalizeResult = await this.completePostKYCSteps(kycData, logger);
        if (!finalizeResult?.success) {
          throw new Error(finalizeResult?.error || 'KYC finalization failed');
        }
        if (finalizeResult.approvalPending) {
          logger('Proposal is pending checker approval; stopping before payment');
          AutomationPauseController.markStepComplete('kyc.finalize');
          AutomationPauseController.endRun();
          return { success: true, approvalPending: true };
        }
        await wait(75);
        AutomationPauseController.markStepComplete('kyc.finalize');
      } else {
        logger('⏭️ KYC finalization already completed, skipping');
      }

      if (!AutomationPauseController.isStepCompleted('kyc.payment')) {
        await AutomationPauseController.checkpoint('KYC → Payment Method');
        const paymentResult = await this.selectPaymentMethod(kycData?.paymentMethod || 'Send Payment Link', logger);
        if (!paymentResult?.success) {
          throw new Error(paymentResult?.error || 'Payment method selection failed');
        }
        AutomationPauseController.markStepComplete('kyc.payment');
        if (paymentResult.approvalPending) {
          AutomationPauseController.endRun();
          return { success: true, approvalPending: true };
        }
      } else {
        logger('⏭️ KYC payment already completed, skipping');
      }

      AutomationPauseController.endRun();
      return { success: true };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') {
        console.log('%c[Automation] ⛔ KYC automation stopped by admin', 'color: #ff0000; font-weight: bold;');
        return { success: false, error: 'Stopped by admin', stopped: true };
      }
      AutomationPauseController.fail(e.message);
      return { success: false, error: e.message };
    }
  },
};

globalThis.OrientalKYC = OrientalKYC;
