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
  },
  images: {
    fetch: (url, requestId) => ipcRenderer.invoke('image:fetch', { url, requestId }),
    cancel: (requestId) => ipcRenderer.send('image:cancel', requestId),
  },
  library: {
    getCapabilities: () => ipcRenderer.invoke('library:getCapabilities'),
    getReadiness: () => ipcRenderer.invoke('library:getReadiness'),
    runMigration: () => ipcRenderer.invoke('library:runMigration'),
    getCategories: () => ipcRenderer.invoke('library:getCategories'),
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
    start: (options) => ipcRenderer.invoke('scraper:start', options),
    renewSession: (options) => ipcRenderer.invoke('scraper:renewSession', options),
    cancel: () => ipcRenderer.invoke('scraper:cancel'),
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
    onLog: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('scraper:log', handler);
      return () => ipcRenderer.removeListener('scraper:log', handler);
    },
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
});
