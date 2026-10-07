/**
 * Protocol definition for Scraper IPC communication
 * Stage 1 Desktop Integration
 */

const SCRAPER_IPC_MESSAGES = {
  // Child Process -> Main Process IPC Messages
  STATE_CHANGED: 'SCRAPER_STATE_CHANGED',
  PROGRESS: 'SCRAPER_PROGRESS',
  LOG: 'SCRAPER_LOG',
  BATCH: 'SCRAPER_BATCH',
  BATCH_ACK: 'SCRAPER_BATCH_ACK',
  FINISHED: 'SCRAPER_FINISHED',

  // Main Process -> Child Process IPC Commands
  START_COMMAND: 'START_SCRAPE',
  CANCEL_COMMAND: 'CANCEL_SCRAPE',

  // Renderer -> Main Process IPC Channels
  CHANNEL_START: 'scraper:start',
  CHANNEL_RENEW_SESSION: 'scraper:renewSession',
  CHANNEL_CANCEL: 'scraper:cancel',
  CHANNEL_GET_STATE: 'scraper:getState',
  CHANNEL_CLEAR_STORAGE: 'scraper:clearStorage',
  CHANNEL_REINDEX_LIBRARY: 'scraper:reindexLibrary',
  CHANNEL_GET_CURRENT_LOG: 'scraper:getCurrentLog',
  CHANNEL_EXPORT_LOG: 'scraper:exportLog',
  CHANNEL_OPEN_LOGS_FOLDER: 'scraper:openLogsFolder',
  CHANNEL_GET_CATEGORIES: 'scraper:getCategories',
  CHANNEL_CREATE_CATEGORY: 'scraper:createCategory',
  CHANNEL_UPDATE_CATEGORY: 'scraper:updateCategory',
  CHANNEL_DELETE_CATEGORY: 'scraper:deleteCategory',
  CHANNEL_SET_CATEGORY_ENABLED: 'scraper:setCategoryEnabled',
  CHANNEL_RESET_CATEGORY: 'scraper:resetCategory',
  CHANNEL_TEST_CATEGORY: 'scraper:testCategory',

  // Main Process -> Renderer IPC Events
  EVENT_STATE_CHANGED: 'scraper:stateChanged',
  EVENT_PROGRESS: 'scraper:progress',
  EVENT_LOG: 'scraper:log',
};

const SCRAPER_STATES = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SESSION_REQUIRED: 'session_required',
  INTERACTION_REQUIRED: 'interaction_required',
};

module.exports = {
  SCRAPER_IPC_MESSAGES,
  SCRAPER_STATES,
};
