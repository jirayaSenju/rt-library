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
  CHANNEL_IMPORT_RUTRACKER_HTML: 'library:import-rutracker-html',

  // Main Process -> Renderer IPC Events
  EVENT_STATE_CHANGED: 'scraper:stateChanged',
  EVENT_PROGRESS: 'scraper:progress',
  EVENT_LOG: 'scraper:log',
  EVENT_ACCESS_CHANGED: 'scraper:accessChanged',
  EVENT_PAGE_COMMITTED: 'scraper:pageCommitted',
  EVENT_RUN_FINALIZED: 'scraper:runFinalized',
  CHANNEL_PROBE_ACCESS: 'scraper:probeAccess',
  CHANNEL_PAUSE: 'scraper:pause',
  CHANNEL_RESUME: 'scraper:resume',
  CHANNEL_GET_SYNC_HISTORY: 'scraper:getSyncHistory',
  CHANNEL_GET_SYNC_RUN_DETAILS: 'scraper:getSyncRunDetails',
  CHANNEL_GET_SYNC_HEALTH: 'scraper:getSyncHealth',
  CHANNEL_CLEAR_SYNC_HISTORY: 'scraper:clearSyncHistory',
  CHANNEL_GET_SCHEDULER_STATUS: 'scraper:getSchedulerStatus',
  CHANNEL_UPDATE_SCHEDULER_CONFIG: 'scraper:updateSchedulerConfig',
  CHANNEL_RUN_SCHEDULER_DUE_CHECK: 'scraper:runSchedulerDueCheck',
  EVENT_SCHEDULER_STATUS_CHANGED: 'scraper:schedulerStatusChanged',
};

const SCRAPER_STATES = {
  IDLE: 'idle',
  PREFLIGHT: 'preflight',
  STARTING: 'starting',
  VERIFYING: 'verifying',
  REPROBING: 'reprobing',
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  RESUMING: 'resuming',
  CANCELLING: 'cancelling',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SESSION_REQUIRED: 'session_required',
  INTERACTION_REQUIRED: 'interaction_required',
  AUTH_REQUIRED: 'auth_required',
};

module.exports = {
  SCRAPER_IPC_MESSAGES,
  SCRAPER_STATES,
};
