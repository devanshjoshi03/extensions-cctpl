(function () {
  'use strict';

  // Block ALL dialogs globally
  if (typeof window !== 'undefined') {
    window.alert = () => {};
    window.confirm = () => true;
    window.prompt = () => {};
  }

  console.log('[ICICI Content] Modules loaded:', {
    ICICILogin: typeof window.ICICILogin,
    ICICIDashboard: typeof window.ICICIDashboard,
    ICICIQuote: typeof window.ICICIQuote,
    ICICIPremium: typeof window.ICICIPremium,
    ICICIProposal: typeof window.ICICIProposal,
  });

  function log(...args) {
    console.log('%c[ICICI]', 'color: #2a9fd8; font-weight: bold;', ...args);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function waitForElement(selector, timeout = 10000, parent = document) {
    return new Promise((resolve, reject) => {
      const el = parent.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = parent.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(parent === document ? document.body : parent, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request.type);

    if (request.type === 'START_ICICI_FLOW') {
      (async () => {
        try {
          log('Starting ICICI automation flow...');

          // Check if already on proposal page - skip to proposal flow
          if (window.location.href.includes('/NysaMotor/proposal')) {
            log('✅ Already on proposal page, starting proposal flow...');
            if (window.ICICIProposal && typeof window.ICICIProposal.run === 'function') {
              const proposalResult = await window.ICICIProposal.run(request.payload, log);
              log('Proposal flow completed:', proposalResult);
              sendResponse({ success: true, message: 'ICICI proposal automation completed' });
            } else {
              log('⚠️ ICICIProposal module not available');
              sendResponse({ success: true, message: 'Proposal page reached, module pending' });
            }
            return;
          }

          // Check if already on premium page - skip to premium flow
          if (window.location.href.includes('/NysaMotor/premium')) {
            log('✅ Already on premium page, starting premium flow...');
            if (window.ICICIPremium && typeof window.ICICIPremium.run === 'function') {
              const premiumResult = await window.ICICIPremium.run(request.payload, log);
              if (!premiumResult.success) {
                throw new Error('Premium flow failed');
              }
              log('Premium flow completed, waiting for proposal page...');
              
              // Wait for automatic redirect to proposal page
              await new Promise(r => setTimeout(r, 3000));
              
              // Run proposal flow
              if (window.ICICIProposal && typeof window.ICICIProposal.run === 'function') {
                const proposalResult = await window.ICICIProposal.run(request.payload, log);
                if (!proposalResult.success) {
                  throw new Error('Proposal flow failed');
                }
                log('Proposal flow completed:', proposalResult);
                sendResponse({ success: true, message: 'ICICI premium and proposal automation completed' });
              } else {
                log('⚠️ ICICIProposal module not available');
                sendResponse({ success: true, message: 'Premium completed, proposal module pending' });
              }
            } else {
              log('⚠️ ICICIPremium module not available');
              sendResponse({ success: true, message: 'Premium page reached, module pending' });
            }
            return;
          }

          // Check if already on quote page - start quote flow
          if (window.location.href.includes('/NysaMotor/quote')) {
            log('✅ Already on quote page, starting quote flow...');
            if (window.ICICIQuote && typeof window.ICICIQuote.run === 'function') {
              const quoteResult = await window.ICICIQuote.run(request.payload, log);
              if (!quoteResult.success) {
                throw new Error('Quote flow failed');
              }
              log('Quote flow completed, waiting for premium page...');
              
              // Wait for automatic redirect to premium page
              await new Promise(r => setTimeout(r, 3000));
              
              // Run premium flow
              if (window.ICICIPremium && typeof window.ICICIPremium.run === 'function') {
                const premiumResult = await window.ICICIPremium.run(request.payload, log);
                if (!premiumResult.success) {
                  throw new Error('Premium flow failed');
                }
                log('Premium flow completed, waiting for proposal page...');
                
                // Wait for automatic redirect to proposal page
                await new Promise(r => setTimeout(r, 3000));
                
                // Run proposal flow
                if (window.ICICIProposal && typeof window.ICICIProposal.run === 'function') {
                  const proposalResult = await window.ICICIProposal.run(request.payload, log);
                  log('Proposal flow completed:', proposalResult);
                  sendResponse({ success: true, message: 'ICICI quote, premium and proposal automation completed' });
                } else {
                  log('⚠️ ICICIProposal module not available');
                  sendResponse({ success: true, message: 'Premium completed, proposal module pending' });
                }
              } else {
                log('⚠️ ICICIPremium module not available');
                sendResponse({ success: true, message: 'Quote completed, premium module pending' });
              }
            } else {
              log('⚠️ ICICIQuote module not available');
              sendResponse({ success: true, message: 'Quote page reached, module pending' });
            }
            return;
          }

          // First, try login if not on dashboard
          if (!window.location.href.includes('/#/dashboard')) {
            log('Not on dashboard, starting login flow...');
            if (window.ICICILogin && typeof window.ICICILogin.run === 'function') {
              const loginResult = await window.ICICILogin.run(request.payload, log);
              if (!loginResult.success && !loginResult.skipped) {
                throw new Error('Login failed');
              }
              log('Login completed or skipped');
            } else {
              log('⚠️ ICICILogin module not available');
            }
          } else {
            log('✅ Already on dashboard, skipping login');
          }

          // Then, run dashboard flow
          log('Starting dashboard flow...');
          if (window.ICICIDashboard && typeof window.ICICIDashboard.run === 'function') {
            const dashboardResult = await window.ICICIDashboard.run(request.payload, log);
            if (!dashboardResult.success) {
              throw new Error('Dashboard flow failed');
            }
            log('Dashboard flow completed');
            
            // Wait for redirect to quote page
            await new Promise(r => setTimeout(r, 2000));
            
            // Run quote flow
            if (window.ICICIQuote && typeof window.ICICIQuote.run === 'function') {
              const quoteResult = await window.ICICIQuote.run(request.payload, log);
              if (!quoteResult.success) {
                throw new Error('Quote flow failed');
              }
              log('Quote flow completed, waiting for premium page...');
              
              // Wait for automatic redirect to premium page
              await new Promise(r => setTimeout(r, 3000));
              
              // Run premium flow
              if (window.ICICIPremium && typeof window.ICICIPremium.run === 'function') {
                const premiumResult = await window.ICICIPremium.run(request.payload, log);
                if (!premiumResult.success) {
                  throw new Error('Premium flow failed');
                }
                log('Premium flow completed, waiting for proposal page...');
                
                // Wait for automatic redirect to proposal page
                await new Promise(r => setTimeout(r, 3000));
                
                // Run proposal flow
                if (window.ICICIProposal && typeof window.ICICIProposal.run === 'function') {
                  const proposalResult = await window.ICICIProposal.run(request.payload, log);
                  if (!proposalResult.success) {
                    throw new Error('Proposal flow failed');
                  }
                  log('Proposal flow completed:', proposalResult);
                  sendResponse({ success: true, message: 'ICICI full automation completed' });
                } else {
                  log('⚠️ ICICIProposal module not available');
                  sendResponse({ success: true, message: 'Premium completed, proposal module pending' });
                }
              } else {
                log('⚠️ ICICIPremium module not available');
                sendResponse({ success: true, message: 'Quote completed, premium module pending' });
              }
            } else {
              log('⚠️ ICICIQuote module not available');
              sendResponse({ success: true, message: 'Dashboard completed, quote module pending' });
            }
          } else {
            log('⚠️ ICICIDashboard module not available');
            sendResponse({ success: true, message: 'Login completed, dashboard module pending' });
          }
        } catch (err) {
          log('❌ Automation error:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    if (request.type === 'PAUSE_ICICI_FLOW') {
      log('Pause requested');
      sendResponse({ status: 'paused' });
      return true;
    }

    if (request.type === 'RESUME_ICICI_FLOW') {
      log('Resume requested');
      sendResponse({ status: 'resumed' });
      return true;
    }

    if (request.type === 'STOP_ICICI_FLOW') {
      log('Stop requested');
      sendResponse({ status: 'stopped' });
      return true;
    }
  });

  log('✅ ICICI Content script loaded');
})();
