/**
 * Main Process IPC Handlers for Scraper Integration
 */

const { ipcMain } = require('electron');
const ScraperManager = require('./scraperManager.cjs');
const { SCRAPER_IPC_MESSAGES } = require('../../scraper/protocol.cjs');

function registerScraperIPCHandlers(browserCompanion) {
  const manager = ScraperManager.getInstance();

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_IMPORT_RUTRACKER_HTML, async (event, options = {}) => {
    const { dialog, BrowserWindow } = require('electron');
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    return require('./htmlImport.cjs').importRuTrackerHtml({
      dialog,
      parentWindow,
      selectedCategoryId: typeof options.categoryId === 'string' ? options.categoryId : null,
    });
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_START, async (_event, options) => {
    return await manager.start(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_RENEW_SESSION, async (_event, options) => {
    return await manager.renewSession(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_PROBE_ACCESS, async (_event, options) => {
    return await manager.probeAccess(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_CANCEL, async () => {
    return await manager.cancel();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_PAUSE, async () => {
    return manager.pause();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_RESUME, async () => {
    return manager.resume();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_STATE, async () => {
    return manager.getState();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_CLEAR_STORAGE, async () => {
    return await manager.clearScraperStorage();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_REINDEX_LIBRARY, async () => {
    return await manager.reindexLibrary();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_CURRENT_LOG, async () => {
    return await manager.getCurrentLog();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_EXPORT_LOG, async () => {
    return await manager.exportLog();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_OPEN_LOGS_FOLDER, async () => {
    return await manager.openLogsFolder();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_SYNC_HISTORY, async (_event, options) => {
    return manager.getSyncHistory(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_SYNC_RUN_DETAILS, async (_event, runId) => {
    return manager.getSyncRunDetails(runId);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_SYNC_HEALTH, async () => {
    return manager.getSyncHealth();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_CLEAR_SYNC_HISTORY, async () => {
    return manager.clearSyncHistory();
  });

  const syncScheduler = require('./syncScheduler.cjs');

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_SCHEDULER_STATUS, async () => {
    return syncScheduler.getSchedulerStatus();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_UPDATE_SCHEDULER_CONFIG, async (_event, config) => {
    return syncScheduler.updateSchedulerConfig(config);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_RUN_SCHEDULER_DUE_CHECK, async () => {
    return syncScheduler.runDueCheck(true);
  });

  const { CategoryManager } = require('./categoryManager.cjs');
  const catManager = CategoryManager.getInstance();
  const { BrowserCompanionTransport } = require('./browserCompanionTransport.cjs');
  const companionTransport = new BrowserCompanionTransport(browserCompanion);
  manager.setCompanionTransport(companionTransport);

  ipcMain.handle('companion:connect', async () => browserCompanion.start());
  ipcMain.handle('companion:reconnect', async () => browserCompanion.reconnect());
  ipcMain.handle('companion:disconnect', async () => {
    browserCompanion.disconnect();
    return browserCompanion.getConnection();
  });
  ipcMain.handle('companion:status', async () => browserCompanion.getConnection());
  ipcMain.handle('companion:open-rutracker', async (_event, options = {}) => {
    const { shell } = require('electron');
    const categories = catManager.getScraperCategories();
    const targetCategory = options.categoryId
      ? categories.find(c => c.id === options.categoryId)
      : (categories.find(c => c.enabled !== false) || categories[0]);
    const targetUrl = targetCategory?.baseUrl || 'https://rutracker.org/forum/index.php';
    await shell.openExternal(targetUrl);
    return true;
  });
  ipcMain.handle('companion:check-access', async (_event, options = {}) => {
    const categories = catManager.getScraperCategories();
    const targetCategory = options?.categoryId
      ? categories.find(c => c.id === options.categoryId)
      : (categories.find(c => c.enabled !== false) || categories[0]);
    return await companionTransport.checkAccess(targetCategory);
  });
  ipcMain.handle('companion:fetch-xbox-page', async () => {
    const xbox = catManager.getScraperCategories().find(category => category.id === 'xbox');
    if (!xbox || !/^https:\/\/rutracker\.org\/forum\/viewforum\.php\?f=887$/.test(xbox.baseUrl)) throw new Error('XBOX_CATEGORY_URL_INVALID');
    return browserCompanion.requestPage({ kind: 'category', categoryId: xbox.id, url: xbox.baseUrl });
  });
  const handleFetchTopic = async (options = {}) => {
    const rawUrlOrId = String(options.url || options.topicId || '').trim();
    const match = rawUrlOrId.match(/(?:[?&]t=|^)(\d+)/);
    if (!match) throw new Error('INVALID_TOPIC_ID: Please provide a valid topic ID or RuTracker URL.');
    const topicId = match[1];
    const targetUrl = `https://rutracker.org/forum/viewtopic.php?t=${topicId}`;

    const categories = catManager.getScraperCategories();
    let targetCategory = options.categoryId ? categories.find(c => c.id === options.categoryId) : null;

    let parsed = null;

    if (browserCompanion?.isAvailable()) {
      const pageResult = await browserCompanion.requestPage({
        kind: 'topic',
        topicId,
        url: targetUrl,
      });

      if (pageResult.status !== 'FORUM_READY') {
        throw new Error(pageResult.error || `FETCH_FAILED: Status was ${pageResult.status}`);
      }
      parsed = pageResult.parsedTopic;
    } else {
      const embedded = manager.getEmbeddedTransport();
      parsed = await embedded.fetchTopic({ topicId, url: targetUrl }, targetCategory);
    }

    if (!parsed) throw new Error('PARSE_FAILED');

    const dbMain = require('../database/dbMain.cjs');
    const db = dbMain.getDatabase();
    if (!db) throw new Error('DB_UNAVAILABLE');

    if (!targetCategory && parsed.forumId) {
      targetCategory = categories.find(c => String(c.baseUrl || '').includes(`f=${parsed.forumId}`));
    }
    if (!targetCategory) {
      targetCategory = categories.find(c => c.id === 'switch') || categories[0];
    }

    const { ingestRawBatch } = require('../indexer/ingestionService.cjs');
    const rawItem = {
      ...parsed,
      id: `topic_${topicId}`,
      topicId,
      title: parsed.topicTitle || parsed.canonicalTitle || `Topic ${topicId}`,
      url: targetUrl,
      source: { site: 'rutracker', topicId },
    };

    const ingestion = ingestRawBatch(db, targetCategory, [rawItem]);
    return {
      success: true,
      topicId,
      title: rawItem.title,
      categoryName: targetCategory.name,
      categoryId: targetCategory.id,
      inserted: ingestion.inserted,
      updated: ingestion.updated,
    };
  };

  ipcMain.handle('companion:fetch-topic', async (_event, options = {}) => {
    return await handleFetchTopic(options);
  });
  ipcMain.handle('scraper:fetch-topic', async (_event, options = {}) => {
    return await handleFetchTopic(options);
  });

  ipcMain.handle('scraper:get-active-transport', async () => {
    return manager.getState().activeTransport;
  });

  ipcMain.handle('scraper:get-transport-preference', async () => {
    const { getTransportPreference, isEmbeddedPromoted, getAvailableTransports } = require('./transportResolver.cjs');
    const dbMain = require('../database/dbMain.cjs');
    const db = dbMain.getDatabase();
    const preference = getTransportPreference(db);
    const isPromoted = isEmbeddedPromoted(db);
    const available = getAvailableTransports({
      companionTransport,
      includeExperimental: true,
      isPromoted,
    });
    return {
      preference,
      activeTransport: manager.getState().activeTransport,
      isPromoted,
      available,
    };
  });

  ipcMain.handle('scraper:set-transport-preference', async (_event, preference) => {
    const { setTransportPreference, resolveActiveTransport, isEmbeddedPromoted } = require('./transportResolver.cjs');
    const dbMain = require('../database/dbMain.cjs');
    const db = dbMain.getDatabase();
    const success = setTransportPreference(db, preference);
    const promotionPolicy = (db && isEmbeddedPromoted(db)) ? 'PROMOTED' : 'EXPERIMENTAL';
    const activeTransport = resolveActiveTransport({
      companionTransport: manager.companionTransport,
      embeddedTransport: manager.getEmbeddedTransport(),
      preferredTransport: preference,
      promotionPolicy,
    });
    manager.activeJobTransport = null;
    manager.broadcast(SCRAPER_IPC_MESSAGES.EVENT_STATE_CHANGED, {
      ...manager.getState(),
      activeTransport,
    });
    return { success, preference, activeTransport };
  });

  ipcMain.handle('scraper:set-embedded-promoted', async (_event, promoted) => {
    const { setEmbeddedPromoted } = require('./transportResolver.cjs');
    const dbMain = require('../database/dbMain.cjs');
    const db = dbMain.getDatabase();
    const success = setEmbeddedPromoted(db, Boolean(promoted));
    return { success, isPromoted: Boolean(promoted) };
  });

  function formatMainError(err, context = '') {
    console.error(`[SCRAPER_IPC][${context}][ERROR]:`, err);
    const isMissingModule =
      err.code === 'MODULE_NOT_FOUND' ||
      (err.message && (err.message.includes('Cannot find module') || err.message.includes('MODULE_NOT_FOUND')));

    const code = isMissingModule
      ? 'SCRAPER_RUNTIME_DEPENDENCY_MISSING'
      : (err.code || 'SCRAPER_RUNTIME_ERROR');

    const userMessage = isMissingModule
      ? 'Built-in Scraper could not start.'
      : 'Something went wrong while starting the scraper.';

    const secondaryMessage = isMissingModule
      ? 'A required component is missing from this installation.'
      : undefined;

    return {
      success: false,
      status: isMissingModule ? 'RUNTIME_DEPENDENCY_MISSING' : 'ERROR',
      error: {
        code,
        category: 'RUNTIME',
        userMessage,
        secondaryMessage,
        recoverable: !isMissingModule,
        actions: isMissingModule
          ? ['RETRY', 'USE_COMPANION', 'VIEW_DIAGNOSTICS']
          : ['RETRY', 'VIEW_DIAGNOSTICS'],
        technicalDetails: err.stack || err.message,
      },
    };
  }

  ipcMain.handle('scraper:embedded-verify', async (_event, options = {}) => {
    try {
      return await manager.openEmbeddedVerification(options);
    } catch (err) {
      return formatMainError(err, 'embedded-verify');
    }
  });
  ipcMain.handle('scraper:embedded-probe', async (_event, options = {}) => {
    try {
      return await manager.probeEmbeddedAccess(options);
    } catch (err) {
      return formatMainError(err, 'embedded-probe');
    }
  });
  ipcMain.handle('scraper:embedded-reset-session', async () => {
    try {
      return await manager.resetEmbeddedSession();
    } catch (err) {
      return formatMainError(err, 'embedded-reset-session');
    }
  });
  ipcMain.handle('scraper:embedded-status', async () => {
    try {
      return manager.getEmbeddedStatus();
    } catch (err) {
      return formatMainError(err, 'embedded-status');
    }
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_CATEGORIES, async () => {
    return catManager.getScraperCategories();
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_CREATE_CATEGORY, async (_event, data) => {
    return catManager.createCategory(data);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_UPDATE_CATEGORY, async (_event, { id, updates }) => {
    return catManager.updateCategory(id, updates);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_DELETE_CATEGORY, async (_event, id) => {
    return catManager.deleteCategory(id);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_SET_CATEGORY_ENABLED, async (_event, { id, enabled }) => {
    return catManager.setCategoryEnabled(id, enabled);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_RESET_CATEGORY, async (_event, id) => {
    return catManager.resetCategory(id);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_TEST_CATEGORY, async (_event, data) => {
    return await catManager.testCategory(data);
  });
}

module.exports = {
  registerScraperIPCHandlers,
};
