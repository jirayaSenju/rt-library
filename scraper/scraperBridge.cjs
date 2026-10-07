/**
 * Scraper Bridge Module - Injects console.js & executes scraping API
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { normalizeScraperOptions, createExecutionPlan } = require('./executionPlan.cjs');

function getConsoleScriptPath() {
  const scriptsPath = path.resolve(__dirname, '../scripts/console.js');
  if (fs.existsSync(scriptsPath)) return scriptsPath;
  const rootPath = path.resolve(__dirname, '../console.js');
  if (fs.existsSync(rootPath)) return rootPath;
  throw new Error('console.js script not found in scripts/ or root directory');
}

function getResolvedCategories() {
  try {
    const { CategoryManager } = require('../electron/scraper/categoryManager.cjs');
    return CategoryManager.getInstance().getResolvedCategories();
  } catch (_) {
    try {
      const { DEFAULT_CATEGORIES } = require('../electron/scraper/defaultCategories.cjs');
      return DEFAULT_CATEGORIES;
    } catch (__) {
      const scriptPath = getConsoleScriptPath();
      const metadata = { exports: {} };
      vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { module: metadata }, {
        filename: scriptPath,
        timeout: 1000,
      });
      return Array.isArray(metadata.exports) ? metadata.exports : metadata.exports?.CATEGORIES || [];
    }
  }
}

function getScraperCategory(category = null) {
  const list = getResolvedCategories();
  const selected = list.find(c => c.id === (category || 'switch') && c.enabled !== false);
  if (!selected) throw new Error(`SCRAPER_CATEGORY_INVALID: Unknown or disabled category "${category}".`);
  return selected;
}

async function injectConsoleScript(page, options = {}) {
  const scriptPath = getConsoleScriptPath();
  console.log(`[SCRAPER] Injecting scraper script from ${scriptPath} ...`);
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Forward browser console logs with [BROWSER] prefix
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[PERF]') || text.includes('EcoHub') || text.includes('⚡') || text.includes('✓') || text.includes('⚠️')) {
      console.log(`[BROWSER] ${text}`);
    } else {
      console.log(`[BROWSER] ${text}`);
    }
  });

  try {
    await page.exposeFunction('__rtScraperProgress', (progressData) => {
      if (options.onProgress && typeof options.onProgress === 'function') {
        options.onProgress(progressData);
      }
    });
  } catch (_) {
    // Function may already be exposed if script re-injected
  }

  await page.evaluate(scriptContent);

  const isLoaded = await page.evaluate(() => typeof window.EcoHubScraper === 'object');
  if (!isLoaded) {
    throw new Error('Script injection failed: window.EcoHubScraper is undefined');
  }

  console.log('[SCRAPER] EcoHubScraper injected and verified successfully.');
}

async function waitForScraperIdle(page, options = {}) {
  const { onProgress, isCancelled } = options;
  const pollIntervalMs = 1000;

  while (true) {
    if (page.isClosed()) {
      throw new Error('SCRAPER_PAGE_CLOSED: Browser page closed unexpectedly during scraping execution');
    }

    if (isCancelled && isCancelled()) {
      console.log('[SCRAPER] Cancellation signal received. Stopping EcoHubScraper...');
      await page.evaluate(() => {
        if (window.EcoHubScraper) window.EcoHubScraper.stop();
      }).catch(() => {});
      throw new Error('SCRAPER_CANCELLED: Execution cancelled by user request');
    }

    const state = await page.evaluate(() => {
      return {
        isRunning: !!(window.EcoHubScraper && window.EcoHubScraper.isRunning),
        progress: window.EcoHubScraper ? window.EcoHubScraper.progress : null,
      };
    }).catch((err) => {
      throw new Error(`SCRAPER_EVALUATE_ERROR: ${err.message}`);
    });

    if (state.progress && onProgress) {
      onProgress(state.progress);
    }

    if (!state.isRunning) {
      break;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

async function runScrapeFlow(page, options = {}) {
  const plan = options.plan || createExecutionPlan(options);
  const normalized = plan.options || normalizeScraperOptions(options);

  const targetCategory = (plan.scope && plan.scope.type === 'single')
    ? plan.scope.targetCategoryId
    : ((!plan.scanAllCategories && normalized.category && normalized.category !== 'all') ? normalized.category : null);

  const serializablePlan = {
    scope: plan.scope || { type: targetCategory ? 'single' : 'all', targetCategoryId: targetCategory },
    mode: plan.mode,
    refresh: plan.refresh,
    scanAllCategories: plan.scanAllCategories,
    scanAllPages: plan.scanAllPages,
    allowKnownTopicEarlyStop: plan.allowKnownTopicEarlyStop,
    knownPageLimit: Number.isFinite(plan.knownPageLimit) ? plan.knownPageLimit : 999999,
    category: targetCategory,
  };

  console.log(`[SCRAPER] Configuring options (scope=${serializablePlan.scope.type}, target=${serializablePlan.category || 'all'}, mode=${plan.mode}, images=${plan.refresh.images}, size=${plan.refresh.size}, files=${plan.refresh.files}, scanAllCategories=${plan.scanAllCategories}, scanAllPages=${plan.scanAllPages}, knownPageLimit=${plan.knownPageLimit}) ...`);

  await page.evaluate(({ serializablePlan }) => {
    if (window.EcoHubScraper) {
      window.EcoHubScraper.setOptions({
        mode: serializablePlan.mode,
        bufferLimit: 5,
        knownPageLimit: serializablePlan.knownPageLimit,
        refreshScreenshots: serializablePlan.refresh.images,
        refreshSizes: serializablePlan.refresh.size,
        refreshFiles: serializablePlan.refresh.files,
      });
      window.EcoHubScraper.targetCategory = serializablePlan.category;
    }
  }, { serializablePlan });

  console.log('[SCRAPER] Starting unified scraping execution ...');
  await page.evaluate(({ serializablePlan }) => {
    if (window.EcoHubScraper) {
      const p = window.EcoHubScraper.start({
        mode: serializablePlan.mode,
        refreshScreenshots: serializablePlan.refresh.images,
        refreshSizes: serializablePlan.refresh.size,
        refreshFiles: serializablePlan.refresh.files,
        knownPageLimit: serializablePlan.knownPageLimit,
      });
      if (p && typeof p.catch === 'function') {
        p.catch((err) => console.error('[BROWSER] Async scraper error:', err));
      }
    }
  }, { serializablePlan });

  await waitForScraperIdle(page, options);
  console.log('[SCRAPER] Unified scraping execution finished.');

  console.log('[SCRAPER] Fetching exported categories via EcoHubScraper.exportAll() ...');
  const catalogs = await page.evaluate(() => window.EcoHubScraper.exportAll());
  return catalogs;
}

module.exports = {
  getConsoleScriptPath,
  getScraperCategory,
  injectConsoleScript,
  waitForScraperIdle,
  runScrapeFlow,
};
