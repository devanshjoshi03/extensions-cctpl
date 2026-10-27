(function () {
  'use strict';

  function getController() {
    return window.RoyalAutomationController || null;
  }

  function sleep(ms) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      async function tick() {
        try {
          await getController()?.checkpoint();
          if (Date.now() - startedAt >= ms) {
            resolve();
            return;
          }
          setTimeout(tick, Math.min(200, ms - (Date.now() - startedAt)));
        } catch (error) {
          reject(error);
        }
      }

      tick();
    });
  }

  async function checkpoint(step, key = step) {
    await getController()?.checkpoint(step, key);
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function isBlockingSpinnerVisible() {
    return Array.from(document.querySelectorAll(
      'div.spinner-grow[role="status"], .spinner-grow.text-dark, .spinner-grow'
    )).some(isVisible);
  }

  async function waitForPageReady(log = console.log, timeout = 30000) {
    const startedAt = Date.now();
    let didLog = false;

    while (isBlockingSpinnerVisible()) {
      if (!didLog) {
        log('Waiting for Royal Sundaram loader to finish');
        didLog = true;
      }
      if (Date.now() - startedAt > timeout) {
        throw new Error('Royal Sundaram loader did not disappear.');
      }
      await sleep(250);
    }
  }

  async function pauseForVisibility(ms = 800) {
    await sleep(ms);
  }

  async function clickElement(element) {
    element.scrollIntoView({ block: 'center' });
    await pauseForVisibility();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await pauseForVisibility();
  }

  function logStep(log, step, details) {
    if (typeof details === 'undefined') {
      log(`[Select Plan] ${step}`);
      return;
    }
    log(`[Select Plan] ${step}`, details);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function shouldSelectNilDepConfirmation(payload) {
    const value = payload?.covers?.nilDepreciation;
    return value === true || value === 1 || value === '1';
  }

  function findBundledPlanCard() {
    const planCards = Array.from(document.querySelectorAll('.plan_type, .custom-control.custom-radio'));
    return planCards.find((card) => {
      if (!isVisible(card)) return false;
      return normalizeText(card.textContent).includes('bundled plan');
    }) || null;
  }

  function findProceedButton() {
    const byId = document.querySelector('a#plan_select.btn_blue, a#plan_select, #plan_select');
    return isVisible(byId) ? byId : null;
  }

  async function waitForProceedButton(timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(console.log);
      const button = findProceedButton();
      if (button) return button;
      await sleep(250);
    }

    throw new Error('Proceed button not found on select plan page.');
  }

  async function clickBundledPlan(log = console.log, timeout = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const planCard = findBundledPlanCard();
      if (planCard) {
        const radioInput = planCard.querySelector('input[type="radio"]');
        const radioLabel = radioInput ? document.querySelector(`label[for="${radioInput.id}"]`) : null;
        const clickTarget = radioLabel && isVisible(radioLabel) ? radioLabel : planCard;

        log('Clicking bundled plan card');
        await clickElement(clickTarget);

        if (radioInput && !radioInput.checked) {
          radioInput.checked = true;
          radioInput.dispatchEvent(new Event('input', { bubbles: true }));
          radioInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await sleep(1200);
        await waitForPageReady(log);
        return true;
      }
      await sleep(250);
    }

    throw new Error('Bundled plan card not found.');
  }

  async function clickConfirmationButton(confirmYes, log = console.log, timeout = 15000) {
    const startedAt = Date.now();
    const expectedText = confirmYes ? 'yes' : 'no';

    while (Date.now() - startedAt < timeout) {
      await waitForPageReady(log);
      const button = Array.from(document.querySelectorAll('button.btn.btn-primary'))
        .find((candidate) => isVisible(candidate) && normalizeText(candidate.textContent) === expectedText);

      if (button) {
        log(`Clicking ${confirmYes ? 'Yes' : 'No'} confirmation button`);
        await clickElement(button);
        await sleep(1200);
        await waitForPageReady(log);
        return true;
      }

      await sleep(250);
    }

    throw new Error(`${confirmYes ? 'Yes' : 'No'} confirmation button not found after Proceed.`);
  }

  async function run(payload, log = console.log) {
    await checkpoint('Preparing select plan page', 'select-plan:start');
    log('Royal Sundaram select plan flow started', payload);
    logStep(log, 'Flow started');
    await waitForPageReady(log);

    await checkpoint('Selecting bundled plan', 'select-plan:bundled-plan');
    logStep(log, 'Selecting bundled plan');
    await clickBundledPlan(log);
    await checkpoint('Clicking Proceed on select plan', 'select-plan:proceed');
    const proceedButton = await waitForProceedButton();
    logStep(log, 'Proceed button located');
    log('Clicking select plan Proceed button');
    await clickElement(proceedButton);
    logStep(log, 'Proceed button clicked');
    await checkpoint('Confirming proceed popup', 'select-plan:yes-confirmation');
    const confirmYes = shouldSelectNilDepConfirmation(payload);
    logStep(log, `Confirming proceed popup with ${confirmYes ? 'Yes' : 'No'}`);
    await clickConfirmationButton(confirmYes, log);
    logStep(log, 'Waiting for coverages page handoff');
    logStep(log, 'Flow completed successfully');
    return { success: true, message: 'Bundled plan selected and Proceed clicked.' };
  }

  window.RoyalSelectPlan = { run };
})();
