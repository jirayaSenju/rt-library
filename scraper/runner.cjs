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
  const lockFile = path.resolve(__dirname, '../scraper.lock');
  if (fs.existsSync(lockFile)) {
    try {
      const lockTimeStr = fs.readFileSync(lockFile, 'utf8').trim();
      const lockTime = new Date(lockTimeStr).getTime();
      const now = Date.now();
      if (isNaN(lockTime) || (now - lockTime > 3 * 60 * 1000)) {
        console.warn(`[SCRAPER] Removing stale lock file (created at ${lockTimeStr}).`);
        fs.unlinkSync(lockFile);
      } else {
        throw new Error(`SCRAPER_LOCKED: Another scraper process is running (started at ${lockTimeStr}).`);
      }
    } catch (err) {
      if (err.message.startsWith('SCRAPER_LOCKED:')) throw err;
      try { fs.unlinkSync(lockFile); } catch (_) {}
    }
  }

  fs.writeFileSync(lockFile, new Date().toISOString(), 'utf8');

  return () => {
    try {
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    } catch (_) {}
  };
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
  sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.RUNNING });

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
    const sessionCategory = getScraperCategory(options.category);
    session = new ScraperBrowserSession({ userDataDir: options.dataDir });

    if (options.login) {
      console.log('[SCRAPER] Mode: LOGIN / SESSION INITIALIZATION');
      await session.start({ headless: false });

      const defaultSubforumUrl = 'https://rutracker.org/forum/viewforum.php?f=773';
      const loginUrl = (options.category && sessionCategory) ? sessionCategory.baseUrl : defaultSubforumUrl;
      console.log(`[SCRAPER] Opening session verification page: ${loginUrl} pid=${session.browserPid} contextId=${session.contextId}`);

      await session.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      console.log('================================================================================');
      console.log('  CLOUDFLARE SESSION VERIFICATION');
      console.log('  1. No account login required. You can use the scraper as a guest.');
      console.log('  2. If a Cloudflare challenge appears, click "Confirme que é humano".');
      console.log(`  3. The window will close AUTOMATICALLY as soon as topics are verified.`);
      console.log('================================================================================');

      let isVerified = false;
      const pollInterval = setInterval(async () => {
        try {
          if (session.context) {
            const pages = session.context.pages();
            for (const p of pages) {
              if (!p.isClosed()) {
                const topicCount = await p.evaluate(() => document.querySelectorAll('a.torTopic').length).catch(() => 0);
                if (topicCount > 0) {
                  isVerified = true;
                  console.log(`[SCRAPER] Session verification PASSED (${topicCount} topics found). Auto-closing browser and saving profile... pid=${session.browserPid} contextId=${session.contextId}`);
                  clearInterval(pollInterval);
                  setTimeout(async () => {
                    await session.close('completed');
                  }, 1200);
                  break;
                }
              }
            }
          }
        } catch (_) {}
      }, 1000);

      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            clearInterval(pollInterval);
            resolve();
          }
        };
        session.context.on('close', done);
        session.page.on('close', () => {
          setTimeout(() => {
            if (!session.context || session.context.pages().length === 0) done();
          }, 500);
        });
      });

      if (isVerified) {
        console.log(`[SCRAPER] Session verification complete. Profile saved. pid=${session.browserPid} contextId=${session.contextId}`);
        sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, { success: true });
        sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.COMPLETED });
      } else {
        console.warn(`[SCRAPER] Session verification window was closed before challenge completion. pid=${session.browserPid}`);
        sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, { success: false, error: 'VERIFICATION_INCOMPLETE' });
        sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state: SCRAPER_STATES.SESSION_REQUIRED, error: 'VERIFICATION_INCOMPLETE' });
        process.exitCode = 1;
      }
      return;
    }

    const headlessMode = !options.headed;
    await session.start({ headless: headlessMode });

    // Single-context health check
    await session.healthCheck({ category: options.category });

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
    const isSessionErr = err.message.includes('SCRAPER_SESSION_INVALID') || err.message.includes('403') || err.message.includes('Cloudflare');
    closeReason = isSessionErr ? 'interaction_required' : (isCancelledFlag ? 'cancelled' : 'scrape_failed');
    const state = isSessionErr ? SCRAPER_STATES.SESSION_REQUIRED : (isCancelledFlag ? SCRAPER_STATES.IDLE : SCRAPER_STATES.FAILED);

    console.error('================================================================================');
    console.error(`[SCRAPER] ERROR: ${err.message}`);
    console.error('================================================================================');

    sendIPCMessage(SCRAPER_IPC_MESSAGES.FINISHED, {
      success: false,
      error: err.message,
    });
    sendIPCMessage(SCRAPER_IPC_MESSAGES.STATE_CHANGED, { state, error: err.message });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    if (session) {
      try {
        await session.close(closeReason);
      } catch (_) {}
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
        setTimeout(() => {
          process.exit(process.exitCode || 0);
        }, 100);
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
