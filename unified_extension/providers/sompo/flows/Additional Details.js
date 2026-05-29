  const SompoAdditionalDetails = {
    async run(formData, logger = console.log) {
      try {
        logger('📋 Starting Additional Details flow...');
        await wait(800);
        await AutomationPauseController.checkpoint('Additional Details — Document Upload');

        const isPanAvailable = formData?.customerDetails?.isPanAvailable;
        logger(`🔍 isPanAvailable: ${isPanAvailable}`);

        if (isPanAvailable === false) {
          await this.uploadForm60Document(formData, logger);
        } else {
          logger('✅ PAN available — skipping document upload');
        }

        logger('🔍 Clicking PROCEED TO PAYMENT...');
        await this.clickProceedToPayment(logger);
        await wait(500);

        logger('✅ Additional Details flow complete!');
        return { success: true };
      } catch (e) {
        if (e.message === 'AUTOMATION_STOPPED') throw e;
        logger('❌ Additional Details error: ' + e.message);
        return { success: false, error: e.message };
      }
    },

    async uploadForm60Document(formData, logger = console.log) {
      const form60Base64 = formData?.customerDetails?.form60Pdf || formData?.form60Pdf || '';

      if (!form60Base64) {
        logger('⚠️ Form 60 PDF not found in formData');
        return;
      }

      scrollToBottom();
      await wait(150);

      logger('🔍 Selecting Document Type: Form 60');
      try {
        await this.selectDocumentNameMUI('Form 60', logger);
        logger('✅ Document Type selected: Form 60');
      } catch (e) { logger('⚠️ Document Type MUI failed: ' + e.message); }
      await wait(250);

      if (form60Base64) {
        logger('📤 Uploading Form 60 document (Base64)...');
        await this.uploadBase64File(form60Base64, 'form60.pdf', 'application/pdf', logger);
        await wait(300);
      }

      logger('ℹ️ Skipping ADD button click as requested');
      await wait(100);

      logger('🔍 Clicking UPLOAD...');
      await this.clickBtnByText('UPLOAD', logger);
      await wait(400);

      logger('✅ Form 60 document uploaded successfully');
    },

    async selectDocumentNameMUI(docTypeValue, logger = console.log) {
      logger('🔍 === DOCUMENT NAME MUI ===');

      const allMUI = [...document.querySelectorAll('.MuiAutocomplete-root')].filter(m => m.offsetParent !== null);
      logger(`📊 Visible MUI Autocomplete count: ${allMUI.length}`);

      let autocompleteEl = null;

      // Strategy 1: label association
      for (const label of document.querySelectorAll('label')) {
        const labelText = label.textContent?.toLowerCase() || '';
        if (labelText.includes('document') || labelText.includes('doc type') || labelText.includes('doc name')) {
          let parent = label.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const mui = parent.querySelector('.MuiAutocomplete-root');
            if (mui && mui.offsetParent !== null) { autocompleteEl = mui; logger('✅ Document Name MUI found by label association'); break; }
            parent = parent.parentElement;
          }
          if (autocompleteEl) break;
        }
      }

      // Strategy 2: container text proximity
      if (!autocompleteEl) {
        for (const mui of allMUI) {
          const labelText = [mui.parentElement, mui.parentElement?.parentElement, mui.parentElement?.parentElement?.parentElement]
            .map(el => el?.textContent || '').join(' ').toLowerCase();
          if (labelText.includes('document') || labelText.includes('doc type') || labelText.includes('doc name')) {
            autocompleteEl = mui; logger('✅ Document Name MUI found by container text'); break;
          }
        }
      }

      // Strategy 3: section header scan
      if (!autocompleteEl) {
        logger('🔍 Trying Documents section scan...');
        for (const el of document.querySelectorAll('*')) {
          const t = el.textContent?.toLowerCase() || '';
          if (t.includes('document details') || t.includes('document upload') || t.includes('additional documents')) {
            const muis = [...el.querySelectorAll('.MuiAutocomplete-root')].filter(m => m.offsetParent !== null);
            if (muis.length > 0) { autocompleteEl = muis[0]; logger('✅ Document Name MUI via Document section header'); break; }
          }
        }
      }

      // Strategy 4: first visible fallback
      if (!autocompleteEl && allMUI.length > 0) {
        autocompleteEl = allMUI[0];
        logger('✅ Document Name MUI (first visible fallback)');
      }

      if (!autocompleteEl) throw new Error('Document Name MUI not found');

      await this.fillDocumentNameMUI(autocompleteEl, docTypeValue, logger);
      logger('✅ === DOCUMENT NAME MUI COMPLETE ===');
    },

    async fillDocumentNameMUI(element, value, logger = console.log) {
      const input = element.querySelector('input');
      if (!input) throw new Error('Document Name input not found');

      logger(`📝 Setting Document Name to "${value}"`);

      element.scrollIntoView({ block: 'center', inline: 'nearest' });
      await wait(150);

      element.click();
      await wait(100);

      const popupIndicator = element.querySelector('.MuiAutocomplete-popupIndicator, button[aria-label*="Open"], button[aria-label*="popup"]');
      if (popupIndicator) {
        logger('🔽 Clicking popup indicator to open dropdown');
        popupIndicator.click();
        await wait(200);
      } else {
        input.click();
        input.focus();
        await wait(100);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await wait(200);
      }

      let selected = false;

      for (let attempt = 0; attempt < 30 && !selected; attempt++) {
        const listboxSelectors = [
          '.MuiAutocomplete-listbox',
          '.MuiPaper-root .MuiAutocomplete-listbox',
          '.MuiPopover-root .MuiAutocomplete-listbox',
          '.MuiAutocomplete-popup + .MuiPaper-root',
          '[role="listbox"]',
          'ul.MuiList-root.MuiAutocomplete-listbox',
        ];

        for (const listboxSel of listboxSelectors) {
          const listbox = document.querySelector(listboxSel);
          if (!listbox || !listbox.offsetParent) continue;

          const options = listbox.querySelectorAll('[role="option"], li.MuiAutocomplete-option, li.MuiMenuItem');
          logger(`📊 Found ${options.length} options in ${listboxSel}`);
          if (options.length === 0) continue;

          const valueLower = value.toLowerCase();
          let targetOption = null;

          options.forEach((opt, idx) => {
            const text = opt.textContent?.trim() || '';
            logger(`   [${idx}] "${text}"`);
            if (!targetOption && text.toLowerCase().includes(valueLower)) {
              targetOption = opt;
              logger(`   ★ Match found: "${text}"`);
            }
          });

          if (!targetOption) {
            targetOption = options[0];
            logger(`   ★ Using first option: "${targetOption.textContent?.trim()}"`);
          }

          targetOption.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          await wait(80);

          targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          await wait(30);
          targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          await wait(30);
          targetOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          await wait(200);

          const selectedValue = input.value || input.getAttribute('value');
          const chipValue = element.querySelector('.MuiChip-label')?.textContent;
          const finalValue = selectedValue || chipValue;

          if (finalValue && finalValue.toLowerCase().includes('form')) {
            logger(`✅ Document Name successfully set to: "${finalValue}"`);
            selected = true;
            return;
          }

          logger(`⚠️ Selection not confirmed, value: "${finalValue}" — retrying...`);
        }

        await wait(150);
      }

      // Fallback: type + Enter
      if (!selected) {
        logger('⚠️ Dropdown selection failed, trying type + Enter fallback');
        input.click();
        await wait(100);

        const shortValue = value.substring(0, 3);
        for (const char of shortValue) {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          await wait(30);
        }
        await wait(200);

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(200);

        const finalValue = input.value;
        if (finalValue) {
          logger(`✅ Document Name set via fallback to: "${finalValue}"`);
        } else {
          logger(`⚠️ Could not verify Document Name selection`);
        }
      }
    },

    async clickAddButtonInActionColumn(logger = console.log) {
      for (let i = 0; i < 15; i++) {
        const addBtn =
          findElementByText('button', 'ADD') ||
          document.querySelector('button.p-button.p-component.p-button-icon-only') ||
          document.querySelector('button[icon="pi pi-plus"]') ||
          document.querySelector('button[class*="add" i]') ||
          document.querySelector('td:last-child button, td.action button') ||
          document.querySelector('table button, .p-datatable button');

        if (addBtn && !addBtn.disabled && addBtn.offsetParent !== null) {
          const btnText = addBtn.textContent?.trim().toUpperCase() || '';
          const btnIcon = addBtn.querySelector('i')?.className || '';
          const hasAddIcon = btnIcon.includes('plus') || btnIcon.includes('add') || addBtn.className.includes('plus');

          if (btnText.includes('ADD') || hasAddIcon || btnText === '' || btnText === '+') {
            clickElement(addBtn);
            logger('✅ Clicked ADD button in Action column');
            return;
          }
        }
        await wait(200);
      }
      logger('⚠️ ADD button not found in Action column');
    },

    async uploadBase64File(base64String, fileName = 'form60.pdf', mimeType = 'application/pdf', logger = console.log) {
      let cleanBase64 = base64String;
      if (base64String.includes('data:') && base64String.includes('base64,')) {
        cleanBase64 = base64String.split('base64,')[1];
        logger('📄 Detected data URL format, extracted base64 content');
      }

      if (!cleanBase64 || cleanBase64.length < 100) {
        logger('⚠️ Base64 content too short or empty');
        return;
      }

      logger(`📄 Base64 content length: ${cleanBase64.length}`);

      const allFileInputs = document.querySelectorAll('input[type="file"]');
      logger(`📊 Found ${allFileInputs.length} file inputs`);

      for (const h of allFileInputs) {
        h.style.display = 'block';
        h.style.visibility = 'visible';
        h.style.opacity = '1';
        h.style.position = 'fixed';
        h.style.zIndex = '9999';
        h.removeAttribute('hidden');
      }

      let fileInput = null;
      for (const input of allFileInputs) {
        const surroundingText = [input.parentElement, input.parentElement?.parentElement]
          .map(el => el?.textContent || '').join(' ').toLowerCase();
        if (surroundingText.includes('document') || surroundingText.includes('choose file') ||
            surroundingText.includes('browse') || surroundingText.includes('upload')) {
          fileInput = input;
          logger('✅ Found file input by context');
          break;
        }
      }

      if (!fileInput) {
        fileInput = document.querySelector('input[type="file"]:not([disabled])');
        if (fileInput) logger('✅ Using first available file input');
      }

      if (!fileInput) { logger('⚠️ File input not found'); return; }

      try {
        const blob = await this.base64ToBlob(cleanBase64, mimeType);
        const file = new File([blob], fileName, { type: mimeType });

        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;

        fileInput.dispatchEvent(new Event('focus', { bubbles: true }));
        await wait(50);
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(50);
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(50);

        logger('✅ Form 60 file uploaded: ' + fileName + ' (' + file.size + ' bytes)');
      } catch (e) {
        logger('❌ File upload error: ' + e.message);
        logger('Stack: ' + e.stack);
      }
    },

    async base64ToBlob(base64String, mimeType = 'application/pdf') {
      const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      return new Blob([bytes], { type: mimeType });
    },

    async clickBtnByText(text, logger = console.log) {
      for (let i = 0; i < 20; i++) {
        const btn = findElementByText('button', text);
        if (btn && !btn.disabled) { clickElement(btn); logger('✅ Clicked: ' + text); return; }
        await wait(150);
      }
      logger('⚠️ Button not found: ' + text);
    },

    async clickProceedToPayment(logger = console.log) {
      for (let i = 0; i < 20; i++) {
        const btn =
          findElementByText('button', 'PROCEED TO PAYMENT') ||
          findElementByText('button', 'Proceed to Payment') ||
          findElementByText('button', 'Proceed') ||
          findElementByText('button', 'Next');
        if (btn && !btn.disabled) { clickElement(btn); logger('✅ Proceed to Payment clicked'); return; }
        await wait(150);
      }
      logger('⚠️ Proceed to Payment button not found');
    },
  };