/**
 * Main Process IPC Handlers for Scraper Integration
 */

const { ipcMain } = require('electron');
const ScraperManager = require('./scraperManager.cjs');
const { SCRAPER_IPC_MESSAGES } = require('../../scraper/protocol.cjs');

function registerScraperIPCHandlers() {
  const manager = ScraperManager.getInstance();

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_START, async (_event, options) => {
    return await manager.start(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_RENEW_SESSION, async (_event, options) => {
    return await manager.renewSession(options);
  });

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_CANCEL, async () => {
    return await manager.cancel();
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

  const { CategoryManager } = require('./categoryManager.cjs');
  const catManager = CategoryManager.getInstance();

  ipcMain.handle(SCRAPER_IPC_MESSAGES.CHANNEL_GET_CATEGORIES, async () => {
    return catManager.getResolvedCategories();
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
