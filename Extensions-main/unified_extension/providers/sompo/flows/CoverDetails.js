/**
 * Universal Sompo Extension - Cover Details Flow
 * OPTIMIZED: Reduced all wait() calls while preserving functionality.
 */
const SompoCoverDetails = {
  async run(formData, logger = console.log) {
    try {
      logger('📋 Starting Cover Details flow...');
      await wait(800);
      await AutomationPauseController.checkpoint('Cover Details');

      logger('ℹ️ Cover Details are auto-populated from Quote Details — proceeding...');
      await wait(300);

      scrollToBottom();
      await wait(300);

      await this.clickCalculatePremiumButton(logger);
      await wait(800);

      await this.handlePremiumCalculatedPopup(logger);
      await wait(300);

      await this.clickProceedButton(logger);
      await wait(500);

      logger('✅ Cover Details flow complete!');
      return { success: true };
    } catch (e) {
      if (e.message === 'AUTOMATION_STOPPED') throw e;
      logger('❌ Cover Details error: ' + e.message);
      return { success: false, error: e.message };
    }
  },

  async clickProceedButton(logger = console.log) {
    logger('🔍 Looking for Proceed button...');
    for (let i = 0; i < 25; i++) {
      const btn =
        findElementByText('button', 'Proceed') ||
        findElementByText('button', 'Next') ||
        findElementByText('button', 'Continue');
      if (btn && !btn.disabled) {
        clickElement(btn);
        logger('✅ Proceed/Next/Continue clicked');
        return;
      }
      await wait(200);
    }
    logger('⚠️ No Proceed/Next/Continue button found');
  },

  async clickCalculatePremiumButton(logger = console.log) {
    logger('🔍 Looking for Calculate Premium button...');
    for (let i = 0; i < 50; i++) {
      const btn =
        findElementByText('button', 'Calculate Premium') ||
        findElementByText('button', 'Calculate') ||
        document.querySelector('button[class*="calculate" i]') ||
        document.querySelector('button[class*="premium" i]');
      if (btn && !btn.disabled) {
        clickElement(btn);
        logger('✅ Calculate Premium clicked');
        return;
      }
      await wait(200);
    }
    logger('⚠️ Calculate Premium button not found');
  },

  async handlePremiumCalculatedPopup(logger = console.log) {
    logger('🔍 Checking for Premium Calculated popup...');
    for (let i = 0; i < 25; i++) {
      const popup =
        document.querySelector('.MuiDialog-root') ||
        document.querySelector('.modal') ||
        document.querySelector('[role="dialog"]') ||
        document.querySelector('.p-dialog') ||
        document.querySelector('.popup') ||
        document.querySelector('.overlay');

      if (popup && popup.offsetParent !== null) {
        logger('📋 Premium popup detected');
        const okBtn =
          findElementByText('button', 'OK') ||
          findElementByText('button', 'Ok') ||
          findElementByText('button', 'Confirm') ||
          findElementByText('button', 'Close') ||
          findElementByText('button', 'Done') ||
          popup.querySelector('button[class*="confirm" i]') ||
          popup.querySelector('button[class*="ok" i]') ||
          popup.querySelector('button[class*="primary" i]');

        if (okBtn && !okBtn.disabled) {
          clickElement(okBtn);
          logger('✅ Popup OK/Close button clicked');
          await wait(200);
          return;
        }
      }
      await wait(200);
    }
    logger('ℹ️ No premium popup detected or already closed');
  },
};