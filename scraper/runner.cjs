/**
 * Playwright Scraper Runner CLI & Programmatic API
 * Stage 1: Playwright Runner with JSON Export & IPC integration
 */

const path = require('path');
const fs = require('fs');

const { ScraperBrowserSession } = require('./browserSession.cjs');
const { getScraperCategory } = require('./scraperBridge.cjs');
const { SCRAPER_IPC_MESSAGES, SCRAPER_STATES } = require('./protocol.cjs');
const { normalizeScraperOptions, createExecutionPlan } = require('./executionPlan.cjs');
const { sanitizeUrlForLog } = require('./accessProbe.cjs');
const { acquireScraperLock } = require('./processLock.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    login: false,
    headed: false, // Default to headless mode for Desktop application
    singleSession: false,
    full: false,
    refreshScreenshots: false,
    refreshSizes: false,
    refreshFiles: false,
    category: null,
    dataDir: null,
    knownPageLimit: 3,
    timeoutMs: 2 * 60 * 60 * 1000, // 2 hours default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--login') options.login = true;
    else if (arg === '--single-session') options.singleSession = true;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--headless') options.headed = false;
    else if (arg === '--full') options.full = true;
    else if (arg === '--refresh-screenshots') options.refreshScreenshots = true;
    else if (arg === '--refresh-sizes') options.refreshSizes = true;
    else if (arg === '--refresh-files') options.refreshFiles = true;
    else if (arg === '--category' && i + 1 < args.length) {
      options.category = args[++i];
    } else if (arg === '--data-dir' && i + 1 < args.length) {
      options.dataDir = args[++i];
    } else if ((arg === '--known-page-limit' || arg === '-k') && i + 1 < args.length) {
      options.knownPageLimit = parseInt(args[++i], 10);
    } else if (arg === '--timeout' && i + 1 < args.length) {
      options.timeoutMs = parseInt(args[++i], 10) * 1000;
    }
  }

  return options;
}

function acquireLock() {
  const lockFile = process.env.SCRAPER_LOCK_FILE || path.resolve(__dirname, '../scraper.lock');
  return acquireScraperLock(lockFile);
}

let isCancelledFlag = false;

function sendIPCMessage(type, payload) {
  if (process.send) {
    try {
      process.send({ type, payload });
    } catch (_) {}
  }
}

function setupConsoleInterceptors() {
  if (!process.send) return;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => {
    origLog(...args);
    sendIPCMessage(SCRAPER_IPC_MESSAGES.LOG, { level: 'info', message: args.join(' '), timestamp: new Date().toISOString() });
  };
  console.warn = (...args) => {
    origWarn(...args);
    sendIPCMessage(SCRAPER_IPC_MESSAGES.LOG, { level: 'warn', message: args.join(' '), timestamp: new Date().toISOString() });
  };
  console.error = (...args) => {
    origError(...args);
    sendIPCMessage(SCRAPER_IPC_MESSAGES.LOG, { level: 'error', message: args.join(' '), timestamp: new Date().toISOString() });
  };
}

async function runScraper(userOptions = {}) {
  const parsedArgs = parseArgs();
  const rawOptions = {
    ...parsedArgs,
    ...userOptions,
  };

  let allCategories = [];
  try {
    const { CategoryManager } = require('../electron/scraper/categoryManager.cjs');
    allCategories = CategoryManager.getInstance().getResolvedCategories();
  } catch (_) {
    try {
      const { DEFAULT_CATEGORIES } = require('../electron/scraper/defaultCategories.cjs');
      allCategories = DEFAULT_CATEGORIES;
    } catch (__) {}
  }

  const enabledCategories = allCategories.filter((c) => c.enabled !== false);
  const plan = createExecutionPlan(rawOptions, { allCategories, enabledCategories });
  const normalized = plan.options;

  const targetCategory = plan.scope.type === 'single' ? plan.scope.targetCategoryId : null;
  const verificationCategory = targetCategory
    ? plan.scope.categories.find((category) => category.id === targetCategory)
    : plan.scope.categories[0];
  const options = {
    headed: false,
    singleSession: false,
    category: targetCategory,
    dataDir: null,
    timeoutMs: 2 * 60 * 60 * 1000,
    ...normalized,
    plan,
  };

  isCancelledFlag = false;
  setupConsoleInterceptors();

  console.log('[SCRAPER] Starting Playwright Scraper Runner (Stage 1)...');
  console.log(`[SCRAPER][PLAN] scope=${plan.scope.type} target=${targetCategory || 'all'} categories=${plan.scope.categoryIds.join(',')} mode=${plan.mode} images=${plan.refresh.images} size=${plan.refresh.size} files=${plan.refresh.files} scanAllPages=${plan.scanAllPages} scanAllCategories=${plan.scanAllCategories} earlyStop=${plan.allowKnownTopicEarlyStop} threshold=${plan.allowKnownTopicEarlyStop ? plan.knownPageLimit : 'disabled'}`);
  console.log(`[SCRAPER][ENV] HOME=${process.env.HOME} XDG_CONFIG_HOME=${process.env.XDG_CONFIG_HOME || '(unset)'} CWD=${process.cwd()} NODE_ENV=${process.env.NODE_ENV || 'production'}`);
  sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: options.login ? SCRAPER_STATES.VERIFYING : SCRAPER_STATES.RUNNING });

  let releaseLock;
  try {
    releaseLock = acquireLock();
  } catch (err) {
    console.error(`[SCRAPER] ${err.message}`);
    sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.FAILED, error: err.message });
    if (!process.send) process.exit(1);
    return;
  }

  let session = null;
  const timer = setTimeout(() => {
    console.error(`[SCRAPER] Execution timed out after ${options.timeoutMs / 1000}s`);
    sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.FAILED, error: 'TIMEOUT' });
    if (releaseLock) releaseLock();
    if (!process.send) process.exit(1);
  }, options.timeoutMs);

  let closeReason = 'completed';
  try {
    const sessionCategory = verificationCategory || getScraperCategory(options.category);
    session = new ScraperBrowserSession({
      userDataDir: options.dataDir,
      mode: options.login ? 'verification' : 'scan',
      categoryId: sessionCategory.id,
      requestId: options.jobId || `scrape_${Date.now()}`,
    });

    if (options.login) {
      console.log('[SCRAPER] Mode: LOGIN / SESSION INITIALIZATION');
      console.log(`[SCRAPER][VERIFY] opening headed context category=${sessionCategory.id} profile=${session.profileDir} context=${session.contextId}`);
      await session.start({ headless: false });
      await session.page.bringToFront();

      const loginUrl = sessionCategory.baseUrl;
      let challengeLoopCount = 0;
      session.onNavigationResult = (navigation) => {
        if (navigation.initiator === 'page' && navigation.cfMitigated === 'challenge') {
          challengeLoopCount += 1;
          console.warn(`[SCRAPER][VERIFY] page navigation returned another Cloudflare challenge navigationId=${navigation.navigationId} loopCount=${challengeLoopCount} category=${sessionCategory.id} context=${session.contextId}`);
          sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, {
            state: SCRAPER_STATES.VERIFYING,
            details: { verificationOutcome: 'CHALLENGE_REMAINS', challengeLoopCount },
          });
        }
      };
      console.log(`[SCRAPER] Opening session verification page: ${loginUrl} pid=${session.browserPid} contextId=${session.contextId}`);

      await session.navigate(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      console.log(`[SCRAPER][VERIFY] headed page ready category=${sessionCategory.id} profile=${session.profileDir} context=${session.contextId}`);
      console.log(`[SCRAPER][VERIFY] waiting for user category=${sessionCategory.id} profile=${session.profileDir} context=${session.contextId}`);
      sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.VERIFYING, details: { categoryId: sessionCategory.id } });

      let verificationOutcome = null;
      let pollInFlight = false;
      let lastStatus = null;
      let lastPageState = null;
      let challengeClearedLogged = false;
      let forumDetectedLogged = false;

      const verificationWait = new Promise((resolve) => {
        const timeout = setTimeout(() => {
          verificationOutcome = lastStatus === 'INTERACTION_REQUIRED' ? 'VERIFICATION_INCOMPLETE' : 'TIMEOUT';
          resolve();
        }, 15 * 60 * 1000);

        const poll = setInterval(async () => {
          if (pollInFlight) return;
          pollInFlight = true;
          try {
            if (isCancelledFlag) {
              verificationOutcome = 'CANCELLED';
            } else if (!session.context || session.context.pages().length === 0) {
              verificationOutcome = 'WINDOW_CLOSED';
            } else if (challengeLoopCount >= 8) {
              console.warn(`[SCRAPER][VERIFY] detected repetitive main-frame Cloudflare challenge loop (count=${challengeLoopCount}). Stopping verification loop safely.`);
              verificationOutcome = 'VERIFICATION_INCOMPLETE';
            } else {
              const result = await session.inspectCurrentCategory(sessionCategory);
              const pageState = `${result.status}:${result.challengeDetected ? 'challenge' : 'clear'}`;
              if (pageState !== lastPageState) {
                lastPageState = pageState;
                const currentUrl = session.activePage ? session.activePage.url() : '';
                console.log(`[SCRAPER][VERIFY] navigation url=${sanitizeUrlForLog(currentUrl)} status=${result.httpStatus ?? 'unknown'} challenge=${!!result.challengeDetected} forumDetected=${['ACCESSIBLE', 'ACCESSIBLE_EMPTY'].includes(result.status)} category=${sessionCategory.id} context=${session.contextId}`);
              }
              if (result.status !== lastStatus) {
                lastStatus = result.status;
                if (result.status === 'INTERACTION_REQUIRED') {
                  console.log(`[SCRAPER][VERIFY] challenge still present category=${sessionCategory.id} context=${session.contextId}`);
                }
              }

              if (!result.challengeDetected && !challengeClearedLogged && !result.challengePresent) {
                challengeClearedLogged = true;
                console.log(`[SCRAPER][VERIFY] challenge cleared category=${sessionCategory.id} context=${session.contextId}`);
              }

              if (['ACCESSIBLE', 'ACCESSIBLE_EMPTY'].includes(result.status)) {
                if (!forumDetectedLogged) {
                  forumDetectedLogged = true;
                  console.log(`[SCRAPER][VERIFY] forum detected category=${sessionCategory.id} status=${result.status} context=${session.contextId}`);
                }
                verificationOutcome = 'VERIFIED';
              } else if (result.status === 'NETWORK_ERROR') {
                verificationOutcome = 'NETWORK_ERROR';
              }
            }
            if (verificationOutcome) {
              clearTimeout(timeout);
              clearInterval(poll);
              resolve();
            }
          } catch (_) {
            if (!session.context || session.context.pages().length === 0) verificationOutcome = 'WINDOW_CLOSED';
            if (verificationOutcome) {
              clearTimeout(timeout);
              clearInterval(poll);
              resolve();
            }
          } finally {
            pollInFlight = false;
          }
        }, 1000);

        session.context.once('close', () => {
          if (!verificationOutcome) verificationOutcome = isCancelledFlag ? 'CANCELLED' : 'WINDOW_CLOSED';
          clearTimeout(timeout);
          clearInterval(poll);
          resolve();
        });
      });

      await verificationWait;

      if (verificationOutcome === 'VERIFIED') {
        // Wait for network idle and cookie flush so session is safely written to disk
        try {
          if (session.activePage) await session.activePage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`[SCRAPER][VERIFY] closing context category=${sessionCategory.id} context=${session.contextId}`);
      closeReason = verificationOutcome === 'VERIFIED' ? 'verified' : verificationOutcome === 'CANCELLED' ? 'cancelled' : 'interaction_required';
      await session.close(closeReason);
      console.log(`[SCRAPER][VERIFY] browser exited cleanly category=${sessionCategory.id} context=${session.contextId}`);

      if (verificationOutcome === 'VERIFIED') {
        console.log(`[SCRAPER][VERIFY] forum reached and headed context closed category=${sessionCategory.id} context=${session.contextId}`);
        sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, { success: true, verificationOutcome });
        sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.COMPLETED, details: { verificationOutcome } });
      } else {
        const state = verificationOutcome === 'CANCELLED' ? SCRAPER_STATES.IDLE : SCRAPER_STATES.INTERACTION_REQUIRED;
        console.warn(`[SCRAPER][VERIFY] ended outcome=${verificationOutcome} category=${sessionCategory.id} context=${session.contextId}`);
        sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, { success: false, verificationOutcome });
        sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state, error: verificationOutcome, details: { verificationOutcome, categoryId: sessionCategory.id } });
        process.exitCode = 0;
      }
      return;
    }

    const headlessMode = !options.headed;
    await session.start({ headless: headlessMode });

    // Single-context health check
    await session.healthCheck({ category: verificationCategory?.id || options.category });

    // Inject console script into same context/page
    await session.injectScraper({
      onProgress: (progress) => {
        sendIPCMessage(SCRAPER_IPC_MESSAGES.PROGRESS, progress);
      },
    });

    // Run scrape flow with progress & cancellation hooks in same context/page
    const flowOptions = {
      ...options,
      isCancelled: () => isCancelledFlag,
      onProgress: (progress) => {
        sendIPCMessage(SCRAPER_IPC_MESSAGES.PROGRESS, progress);
      },
    };

    const catalogs = await session.run(flowOptions);

    let totalItemsEmitted = 0;
    if (Array.isArray(catalogs)) {
      for (const cat of catalogs) {
        const catId = cat.id || (cat.category && cat.category.id);
        const catName = cat.name || (cat.category && cat.category.name) || catId;
        const catItems = Array.isArray(cat.items) ? cat.items : [];
        if (catId && catItems.length > 0) {
          sendIPCMessage(SCRAPER_IPC_MESSAGES.BATCH, {
            categoryId: catId,
            categoryName: catName,
            baseUrl: cat.baseUrl || (cat.category && cat.category.baseUrl) || null,
            titleSearch: cat.titleSearch || (cat.category && cat.category.titleSearch) || null,
            items: catItems,
          });
          totalItemsEmitted += catItems.length;
        }
      }
    }

    await session.close('completed');

    console.log('================================================================================');
    console.log(`[SCRAPER] SUCCESS: ${totalItemsEmitted} items scraped across ${catalogs?.length || 0} categories (pid=${session.browserPid}, contextId=${session.contextId})`);
    console.log('================================================================================');

    sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, {
      success: true,
      totalItems: totalItemsEmitted,
      categoriesCount: catalogs?.length || 0,
    });
    sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.COMPLETED });

  } catch (err) {
    const isInteractionRequired = err.code === 'INTERACTION_REQUIRED';
    const isAuthRequired = err.code === 'AUTH_REQUIRED';
    closeReason = isInteractionRequired ? 'interaction_required' : (isCancelledFlag ? 'cancelled' : 'scrape_failed');
    const state = isInteractionRequired
      ? SCRAPER_STATES.INTERACTION_REQUIRED
      : isAuthRequired
        ? SCRAPER_STATES.SESSION_REQUIRED
        : (isCancelledFlag ? SCRAPER_STATES.IDLE : SCRAPER_STATES.FAILED);

    console.error('================================================================================');
    console.error(`[SCRAPER] ERROR: ${err.message}`);
    console.error('================================================================================');

    sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, {
      success: false,
      error: err.message,
      reason: isInteractionRequired ? 'interaction_required' : isAuthRequired ? 'auth_required' : undefined,
      accessResult: err.accessResult || null,
    });
    sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state, error: err.message, details: err.accessResult || null });
    process.exitCode = (isInteractionRequired || isAuthRequired || isCancelledFlag) ? 0 : 1;
  } finally {
    clearTimeout(timer);
    if (session) {
      try {
        await session.close(closeReason);
      } catch (closeError) {
        console.error(`[SCRAPER][LIFECYCLE] Session close failed: ${closeError.message}`);
      }
    }
    if (releaseLock) releaseLock();
  }
}

async function main() {
  const options = parseArgs();
  await runScraper(options);
}

// Child Process Message Handling
if (process.send) {
  process.on('message', async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.command === SCRAPER_IPC_MESSAGES.START_COMMAND) {
      try {
        await runScraper(msg.options || {});
      } finally {
        if (process.connected) process.disconnect();
      }
    } else if (msg.command === SCRAPER_IPC_MESSAGES.CANCEL_COMMAND) {
      console.log('[SCRAPER] Received cancel command from parent process.');
      isCancelledFlag = true;
    }
  });
}

if (!process.send && require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  acquireLock,
  runScraper,
  main,
};
