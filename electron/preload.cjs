const { contextBridge, ipcRenderer } = require('electron');

const rtLibrary = {
  platform: process.platform,
  dialogs: {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
  },
  filesystem: {
    readDir: (dirPath) => ipcRenderer.invoke('read-dir', dirPath),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    readBinaryFile: (filePath) => ipcRenderer.invoke('fs:read-binary-file', filePath),
    statFile: (filePath) => ipcRenderer.invoke('stat-file', filePath),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
    openMagnet: (magnetUrl, title) => ipcRenderer.invoke('shell:open-magnet', magnetUrl, title),
  },
  system: {
    getConfigDir: () => ipcRenderer.invoke('get-config-dir'),
    loadAppConfig: () => ipcRenderer.invoke('load-app-config'),
    saveAppConfig: (configData) => ipcRenderer.invoke('save-app-config', configData),
    isWindowFocused: () => ipcRenderer.invoke('system:is-window-focused'),
    focusWindow: () => ipcRenderer.invoke('system:focus-window'),
    showNotification: (options) => ipcRenderer.invoke('system:show-notification', options),
  },
  images: {
    fetch: (url, requestId) => ipcRenderer.invoke('image:fetch', { url, requestId }),
    cancel: (requestId) => ipcRenderer.send('image:cancel', requestId),
  },
  library: {
    importRuTrackerHtml: (options) => ipcRenderer.invoke('library:import-rutracker-html', options),
    getCapabilities: () => ipcRenderer.invoke('library:getCapabilities'),
    getReadiness: () => ipcRenderer.invoke('library:getReadiness'),
    dismissOnboarding: () => ipcRenderer.invoke('library:dismissOnboarding'),
    runMigration: () => ipcRenderer.invoke('library:runMigration'),
    getCategories: () => ipcRenderer.invoke('library:getCategories'),
    getFilterFacets: (options) => ipcRenderer.invoke('library:getFilterFacets', options),
    getItems: (options) => ipcRenderer.invoke('library:getItems', options),
    getItem: (id) => ipcRenderer.invoke('library:getItem', id),
    getScreenshots: (id) => ipcRenderer.invoke('library:getScreenshots', id),
    setFavorite: (id, isFavorite) => ipcRenderer.invoke('library:setFavorite', { id, isFavorite }),
    setFavorites: (ids, isFavorite) => ipcRenderer.invoke('library:setFavorites', { ids, isFavorite }),
    toggleFavorite: (id) => ipcRenderer.invoke('library:toggleFavorite', id),
    getFavoriteCount: () => ipcRenderer.invoke('library:getFavoriteCount'),
    exportMagnets: (magnets) => ipcRenderer.invoke('library:exportMagnets', { magnets }),
    ensureNativeImport: (libraryPath, options) => ipcRenderer.invoke('library:ensureNativeImport', libraryPath, options),
    refresh: (options) => ipcRenderer.invoke('library:refresh', options),
    reindex: () => ipcRenderer.invoke('library:reindex'),
    getIndexStatus: () => ipcRenderer.invoke('library:getIndexStatus'),
    getAllImageUrls: () => ipcRenderer.invoke('library:getAllImageUrls'),
    onIndexProgress: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('library:indexProgress', handler);
      return () => {
        ipcRenderer.removeListener('library:indexProgress', handler);
      };
    },
  },
  database: {
    getOverview: () => ipcRenderer.invoke('database:getOverview'),
    getTables: () => ipcRenderer.invoke('database:getTables'),
    getRows: (options) => ipcRenderer.invoke('database:getRows', options),
    executeReadQuery: (sql) => ipcRenderer.invoke('database:executeReadQuery', sql),
    explainQuery: (sql) => ipcRenderer.invoke('database:explainQuery', sql),
    integrityCheck: (full) => ipcRenderer.invoke('database:integrityCheck', full),
    checkpoint: () => ipcRenderer.invoke('database:checkpoint'),
    optimize: () => ipcRenderer.invoke('database:optimize'),
    openFolder: (targetPath) => ipcRenderer.invoke('database:openFolder', targetPath),
    getBackupSchedule: () => ipcRenderer.invoke('database:getBackupSchedule'),
    saveBackupSchedule: (config) => ipcRenderer.invoke('database:saveBackupSchedule', config),
    getBackupHistory: (customDir) => ipcRenderer.invoke('database:getBackupHistory', customDir),
    verifyBackup: (filePath) => ipcRenderer.invoke('database:verifyBackup', filePath),
    deleteBackup: (filePath) => ipcRenderer.invoke('database:deleteBackup', filePath),
    selectBackupDirectory: () => ipcRenderer.invoke('database:selectBackupDirectory'),
    selectRestoreFile: () => ipcRenderer.invoke('database:selectRestoreFile'),
    createBackup: (options) => ipcRenderer.invoke('database:createBackup', options),
    restoreBackup: (customFilePath) => ipcRenderer.invoke('database:restoreBackup', customFilePath),
    runVacuum: () => ipcRenderer.invoke('database:runVacuum'),
    runDataCleanup: (options) => ipcRenderer.invoke('database:runDataCleanup', options),
    exportTable: (options) => ipcRenderer.invoke('database:exportTable', options),
    onRestored: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = () => callback();
      ipcRenderer.on('database:restored', handler);
      return () => ipcRenderer.removeListener('database:restored', handler);
    },
  },
  torrent: {
    getMetadata: (itemId) => ipcRenderer.invoke('torrent:getMetadata', itemId),
    refreshMetadata: (itemId, magnetUrl) => ipcRenderer.invoke('torrent:refreshMetadata', itemId, magnetUrl),
    getQueueStatus: () => ipcRenderer.invoke('torrent:getQueueStatus'),
    startCollection: (mode) => ipcRenderer.invoke('torrent:startCollection', mode),
    stopCollection: () => ipcRenderer.invoke('torrent:stopCollection'),
    getCollectionProgress: () => ipcRenderer.invoke('torrent:getCollectionProgress'),
    onCollectionProgress: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('torrent:collectionProgress', handler);
      return () => {
        ipcRenderer.removeListener('torrent:collectionProgress', handler);
      };
    },
    onMetadataUpdated: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('torrent:metadataUpdated', handler);
      return () => {
        ipcRenderer.removeListener('torrent:metadataUpdated', handler);
      };
    },
  },
  scraper: {
    importRuTrackerHtml: (options) => ipcRenderer.invoke('library:import-rutracker-html', options),
    start: (options) => ipcRenderer.invoke('scraper:start', options),
    renewSession: (options) => ipcRenderer.invoke('scraper:renewSession', options),
    probeAccess: (options) => ipcRenderer.invoke('scraper:probeAccess', options),
    cancel: () => ipcRenderer.invoke('scraper:cancel'),
    pause: () => ipcRenderer.invoke('scraper:pause'),
    resume: () => ipcRenderer.invoke('scraper:resume'),
    getState: () => ipcRenderer.invoke('scraper:getState'),
    clearStorage: () => ipcRenderer.invoke('scraper:clearStorage'),
    reindexLibrary: () => ipcRenderer.invoke('scraper:reindexLibrary'),
    getCurrentLog: () => ipcRenderer.invoke('scraper:getCurrentLog'),
    exportLog: () => ipcRenderer.invoke('scraper:exportLog'),
    openLogsFolder: () => ipcRenderer.invoke('scraper:openLogsFolder'),
    getCategories: () => ipcRenderer.invoke('scraper:getCategories'),
    createCategory: (data) => ipcRenderer.invoke('scraper:createCategory', data),
    updateCategory: (id, updates) => ipcRenderer.invoke('scraper:updateCategory', { id, updates }),
    deleteCategory: (id) => ipcRenderer.invoke('scraper:deleteCategory', id),
    setCategoryEnabled: (id, enabled) => ipcRenderer.invoke('scraper:setCategoryEnabled', { id, enabled }),
    resetCategory: (id) => ipcRenderer.invoke('scraper:resetCategory', id),
    testCategory: (data) => ipcRenderer.invoke('scraper:testCategory', data),
    getSyncHistory: (options) => ipcRenderer.invoke('scraper:getSyncHistory', options),
    getSyncRunDetails: (runId) => ipcRenderer.invoke('scraper:getSyncRunDetails', runId),
    getSyncHealth: () => ipcRenderer.invoke('scraper:getSyncHealth'),
    clearSyncHistory: () => ipcRenderer.invoke('scraper:clearSyncHistory'),
    onStateChanged: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:stateChanged', handler);
      return () => ipcRenderer.removeListener('scraper:stateChanged', handler);
    },
    onProgress: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:progress', handler);
      return () => ipcRenderer.removeListener('scraper:progress', handler);
    },
    onAccessChanged: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:accessChanged', handler);
      return () => ipcRenderer.removeListener('scraper:accessChanged', handler);
    },
    onPageCommitted: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:pageCommitted', handler);
      return () => ipcRenderer.removeListener('scraper:pageCommitted', handler);
    },
    onRunFinalized: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:runFinalized', handler);
      return () => ipcRenderer.removeListener('scraper:runFinalized', handler);
    },
    getActiveTransport: () => ipcRenderer.invoke('scraper:get-active-transport'),
    getTransportPreference: () => ipcRenderer.invoke('scraper:get-transport-preference'),
    setTransportPreference: (preference) => ipcRenderer.invoke('scraper:set-transport-preference', preference),
    setEmbeddedPromoted: (promoted) => ipcRenderer.invoke('scraper:set-embedded-promoted', promoted),
    fetchTopic: (options) => ipcRenderer.invoke('scraper:fetch-topic', options),
    embeddedVerify: (options) => ipcRenderer.invoke('scraper:embedded-verify', options),
    embeddedProbe: (options) => ipcRenderer.invoke('scraper:embedded-probe', options),
    embeddedResetSession: () => ipcRenderer.invoke('scraper:embedded-reset-session'),
    embeddedStatus: () => ipcRenderer.invoke('scraper:embedded-status'),
    getSchedulerStatus: () => ipcRenderer.invoke('scraper:getSchedulerStatus'),
    updateSchedulerConfig: (config) => ipcRenderer.invoke('scraper:updateSchedulerConfig', config),
    runSchedulerDueCheck: () => ipcRenderer.invoke('scraper:runSchedulerDueCheck'),
    onSchedulerStatusChanged: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:schedulerStatusChanged', handler);
      return () => ipcRenderer.removeListener('scraper:schedulerStatusChanged', handler);
    },
    onLog: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:log', handler);
      return () => ipcRenderer.removeListener('scraper:log', handler);
    },
  },
  companion: {
    connect: () => ipcRenderer.invoke('companion:connect'),
    reconnect: () => ipcRenderer.invoke('companion:reconnect'),
    disconnect: () => ipcRenderer.invoke('companion:disconnect'),
    status: () => ipcRenderer.invoke('companion:status'),
    openRuTracker: (options) => ipcRenderer.invoke('companion:open-rutracker', options),
    checkAccess: (options) => ipcRenderer.invoke('companion:check-access', options),
    fetchXboxPage: () => ipcRenderer.invoke('companion:fetch-xbox-page'),
    fetchTopic: (options) => ipcRenderer.invoke('companion:fetch-topic', options),
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:get-status'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatusChanged: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('updater:status-changed', handler);
      return () => ipcRenderer.removeListener('updater:status-changed', handler);
    },
  },
  window: {
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    onMaximizedChange: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on('window:maximized-change', handler);
      return () => ipcRenderer.removeListener('window:maximized-change', handler);
    },
  },
  tools: {
    openExternal: (payload) => ipcRenderer.invoke('tools:open-external', payload),
    getRegistry: () => ipcRenderer.invoke('tools:get-registry'),
  },
};

contextBridge.exposeInMainWorld('rtLibrary', rtLibrary);
contextBridge.exposeInMainWorld('electronAPI', {
  ...rtLibrary,
  selectFolder: rtLibrary.dialogs.selectFolder,
  readDir: rtLibrary.filesystem.readDir,
  readFile: rtLibrary.filesystem.readFile,
  statFile: rtLibrary.filesystem.statFile,
  getConfigDir: rtLibrary.system.getConfigDir,
  loadAppConfig: rtLibrary.system.loadAppConfig,
  saveAppConfig: rtLibrary.system.saveAppConfig,
  library: rtLibrary.library,
  torrent: rtLibrary.torrent,
  scraper: rtLibrary.scraper,
  companion: rtLibrary.companion,
  window: rtLibrary.window,
  tools: rtLibrary.tools,
});
