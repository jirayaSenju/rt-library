const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');

// Allow isolated custom userData directory in test mode
if (process.env.RT_LIBRARY_USER_DATA_DIR && app) {
  app.setPath('userData', process.env.RT_LIBRARY_USER_DATA_DIR);
}

// Configure Chromium rendering switches for high-density image grids
if (app && app.commandLine && typeof app.commandLine.appendSwitch === 'function') {
  app.commandLine.appendSwitch('max-decoded-image-kb', '512000');
}

// Set stable Application User Model ID for Windows taskbar grouping and notification routing
if (app && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId('com.rtlibrary.app');
}

const perfEnabled = process.env.RT_LIBRARY_PERF === '1' || process.env.VITE_PERF_TELEMETRY === 'true';
const appStartTime = performance.now();

function getAppIconPath() {
  const fsSync = require('fs');
  const candidatePaths = [
    path.join(process.resourcesPath || '', 'build', 'icons', '512x512.png'),
    path.join(process.resourcesPath || '', 'build', 'icons', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icons', '512x512.png'),
    path.join(__dirname, '..', 'build', 'icons', '256x256.png'),
    path.join(__dirname, '..', 'build', 'icons', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icons', 'rt-library.ico'),
    path.join(__dirname, '..', '730437.png'),
  ];
  for (const candidate of candidatePaths) {
    if (candidate && fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolvePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return targetPath;
  if (targetPath.startsWith('~')) {
    return path.join(os.homedir(), targetPath.slice(1));
  }
  return targetPath;
}

const IPC_CHANNELS = {
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',
  FS_READ_DIR: 'fs:read-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_READ_BINARY_FILE: 'fs:read-binary-file',
  FS_STAT_FILE: 'fs:stat-file',
  FS_EXISTS: 'fs:exists',
  FS_MKDIR: 'fs:mkdir',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_OPEN_MAGNET: 'shell:open-magnet',
  SYSTEM_GET_CONFIG_DIR: 'system:get-config-dir',
  SYSTEM_LOAD_APP_CONFIG: 'system:load-app-config',
  SYSTEM_SAVE_APP_CONFIG: 'system:save-app-config',
};

function getConfigDirPath() {
  return app.getPath('userData');
}

async function ensureConfigDir() {
  const dir = getConfigDirPath();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const { registerWindowIPCHandlers, attachWindowStateListeners } = require('./ipc/windowIPC.cjs');
const { registerToolsIPCHandlers } = require('./ipc/toolsIPC.cjs');

function createWindow() {
  const appIcon = getAppIconPath();
  const isHeadless = process.env.HEADLESS === 'true' || (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && process.platform === 'linux');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !isHeadless,
    title: "RT Library - Local Game & Catalog Viewer",
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { frame: false } : { titleBarStyle: 'hidden' }),
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  attachWindowStateListeners(win);

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[MAIN] Renderer process gone / crashed:', details);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[MAIN] Page failed to load:', errorCode, errorDescription, validatedURL);
  });

  const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.NODE_ENV !== 'test';

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
    const loadDev = () => {
      win.loadURL(devUrl).catch(() => {
        setTimeout(loadDev, 500);
      });
    };
    loadDev();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function registerSystemIPCHandlers() {
  if (!ipcMain) return;

  // Dialog Handlers
  const handleSelectFolder = async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  };
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, handleSelectFolder);
  ipcMain.handle('select-folder', handleSelectFolder);

  // Filesystem Handlers
  const handleReadDir = async (event, dirPath) => {
    const resolvedPath = resolvePath(dirPath);
    try {
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      return entries.map(entry => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }));
    } catch (err) {
      console.warn(`[Main IPC] FS_READ_DIR error for ${dirPath} (resolved: ${resolvedPath}):`, err.message);
      return [];
    }
  };
  ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, handleReadDir);
  ipcMain.handle('read-dir', handleReadDir);

  const handleReadFile = async (event, filePath) => {
    const resolvedPath = resolvePath(filePath);
    const t0 = performance.now();
    const content = await fs.readFile(resolvedPath, 'utf-8');
    if (perfEnabled) {
      const duration = performance.now() - t0;
      console.log(`[PERF][MAIN] IPC read-file (${path.basename(resolvedPath)}): ${duration.toFixed(2)}ms (${content.length} chars)`);
    }
    return content;
  };
  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, handleReadFile);
  ipcMain.handle('read-file', handleReadFile);

  ipcMain.handle(IPC_CHANNELS.FS_READ_BINARY_FILE, async (event, filePath) => {
    const resolvedPath = resolvePath(filePath);
    try {
      const buffer = await fs.readFile(resolvedPath);
      return new Uint8Array(buffer);
    } catch (err) {
      return null;
    }
  });

  const handleStatFile = async (event, filePath) => {
    const resolvedPath = resolvePath(filePath);
    try {
      const stats = await fs.stat(resolvedPath);
      return {
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch (err) {
      return null;
    }
  };
  ipcMain.handle(IPC_CHANNELS.FS_STAT_FILE, handleStatFile);
  ipcMain.handle('stat-file', handleStatFile);

  ipcMain.handle(IPC_CHANNELS.FS_EXISTS, async (event, targetPath) => {
    const resolvedPath = resolvePath(targetPath);
    try {
      await fs.access(resolvedPath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FS_MKDIR, async (event, dirPath) => {
    const resolvedPath = resolvePath(dirPath);
    try {
      await fs.mkdir(resolvedPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });

  // Shell Handlers
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_MAGNET, async (event, magnetUrl) => {
    if (magnetUrl && magnetUrl.startsWith('magnet:')) {
      await shell.openExternal(magnetUrl);
      return true;
    }
    return false;
  });

  // System & Storage Handlers
  const handleGetConfigDir = async () => {
    return await ensureConfigDir();
  };
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_CONFIG_DIR, handleGetConfigDir);
  ipcMain.handle('get-config-dir', handleGetConfigDir);

  const handleLoadAppConfig = async () => {
    const configDir = await ensureConfigDir();
    const configPath = path.join(configDir, 'config.json');
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  };
  ipcMain.handle(IPC_CHANNELS.SYSTEM_LOAD_APP_CONFIG, handleLoadAppConfig);
  ipcMain.handle('load-app-config', handleLoadAppConfig);

  const handleSaveAppConfig = async (event, configData) => {
    const configDir = await ensureConfigDir();
    const configPath = path.join(configDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    return true;
  };
  ipcMain.handle(IPC_CHANNELS.SYSTEM_SAVE_APP_CONFIG, handleSaveAppConfig);
  ipcMain.handle('save-app-config', handleSaveAppConfig);

  // Window Focus & Notification Handlers (V3-76)
  ipcMain.handle('system:is-window-focused', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      return win.isFocused() && !win.isMinimized();
    } catch {
      return false;
    }
  });

  ipcMain.handle('system:focus-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      if (win.isMinimized()) win.restore();
      win.focus();
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('system:show-notification', (event, { title, body, silent } = {}) => {
    try {
      const { Notification } = require('electron');
      if (!Notification || !Notification.isSupported || !Notification.isSupported()) return false;
      const notif = new Notification({
        title: title || 'RT Library',
        body: body || '',
        silent: !!silent,
        icon: getAppIconPath(),
      });
      notif.on('click', () => {
        try {
          const win = BrowserWindow.fromWebContents(event.sender);
          if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
            win.webContents.send('system:notification-clicked', { title });
          }
        } catch (_) {}
      });
      notif.show();
      return true;
    } catch (err) {
      console.warn('[Main IPC] Notification error:', err.message);
      return false;
    }
  });

  registerWindowIPCHandlers(ipcMain, BrowserWindow);
  registerToolsIPCHandlers(ipcMain, shell);
}

const dbMain = require('./database/dbMain.cjs');
const { registerLibraryIPCHandlers } = require('./ipc/libraryIPC.cjs');
const { registerDatabaseIPCHandlers } = require('./ipc/databaseIPC.cjs');
const torrentMetadataService = require('./torrent/torrentMetadataService.cjs');
const metadataManager = require('./torrent/metadataManager.cjs');
const migration = require('./database/migration.cjs');
const workerManager = require('./indexer/workerManager.cjs');
const { registerScraperIPCHandlers } = require('./scraper/scraperIPC.cjs');
const ScraperManager = require('./scraper/scraperManager.cjs');

const { BrowserCompanionBridge } = require('./scraper/browserCompanionBridge.cjs');
const browserCompanion = new BrowserCompanionBridge({
  appVersion: app.getVersion(),
  onPage: async ({ html, url, bytes, kind, request, httpStatus, error, requestId }) => {
    const lower = (html || '').toLowerCase();
    const forumDetected = /class=["'][^"']*tortopic|id=["']page_container["']|id=["']page_header["']|<table[^>]*forumline/.test(lower);
    const cfMitigated = /cf-chl-|challenge-platform|just a moment|проверка браузера/.test(lower);

    let status = 'UNKNOWN_PAGE';
    if (error === 'NO_RUTRACKER_TAB') status = 'NO_RUTRACKER_TAB';
    else if (error === 'PAYLOAD_TOO_LARGE') status = 'PAYLOAD_TOO_LARGE';
    else if (forumDetected) status = 'FORUM_READY';
    else if (cfMitigated || Number(httpStatus) === 403) status = 'VERIFICATION_REQUIRED';
    else if (/name=["']login["']|id=["']login["']|forum\/login\.php/.test(lower)) status = 'AUTH_REQUIRED';
    else if (error || Number(httpStatus) >= 400 || Number(httpStatus) === 0) status = 'FETCH_ERROR';

    const output = {
      status,
      url,
      httpStatus: Number(httpStatus) || 0,
      bytes: Number(bytes) || 0,
      forumDetected,
      cfMitigated,
      fetchedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    };

    if (status === 'FORUM_READY' && kind === 'category') {
      console.info(`[COMPANION][PARSE_STARTED] requestId=${requestId || 'unknown'} kind=${kind}`);
      try {
        const { parseCategoryHtml } = require('../scraper/parsers/rutrackerHtmlParser.cjs');
        const categories = require('./scraper/categoryManager.cjs').CategoryManager.getInstance().getScraperCategories();
        const category = categories.find(item => item.id === request?.categoryId) || {
          id: request?.categoryId || 'category',
          name: request?.categoryId || 'Category',
          baseUrl: url,
        };
        const parsed = parseCategoryHtml(html, {
          categoryId: category.id,
          categoryName: category.name,
          categoryBaseUrl: category.baseUrl,
          titleSearch: category.titleSearch,
          topicTitleIncludes: category.topicTitleIncludes,
          topicTitleExcludes: category.topicTitleExcludes,
          pageNum: request?.pageNum || 1,
          pageUrl: url,
        });
        output.parsed = parsed;
        output.topicCount = parsed.topics?.length ?? 0;
        console.info(`[COMPANION][PARSE_RESULT] requestId=${requestId || 'unknown'} topicCount=${output.topicCount}`);
      } catch (err) {
        console.error(`[COMPANION][PARSE_ERROR] requestId=${requestId || 'unknown'} error=${err.message}`);
        output.status = 'PARSE_ERROR';
        output.error = err.message;
      }
    } else if (status === 'FORUM_READY' && kind === 'topic') {
      console.info(`[COMPANION][PARSE_STARTED] requestId=${requestId || 'unknown'} kind=${kind}`);
      try {
        const { parseTopicHtml } = require('../scraper/parsers/rutrackerHtmlParser.cjs');
        const parsed = parseTopicHtml(html, {
          topicUrl: url,
          topicTitle: request?.topicTitle || '',
        });
        const forumMatch = html.match(/viewforum\.php\?f=(\d+)/);
        const forumId = forumMatch ? forumMatch[1] : null;
        const pageTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const pageTitle = pageTitleMatch ? pageTitleMatch[1].replace(/\s*[–|-]\s*RuTracker.*$/i, '').trim() : '';
        output.parsedTopic = {
          ...parsed,
          forumId,
          topicTitle: pageTitle || parsed?.canonicalTitle || '',
        };
        console.info(`[COMPANION][PARSE_RESULT] requestId=${requestId || 'unknown'} topic=${parsed?.canonicalTitle || pageTitle || 'unknown'}`);
      } catch (err) {
        console.error(`[COMPANION][PARSE_ERROR] requestId=${requestId || 'unknown'} error=${err.message}`);
        output.status = 'PARSE_ERROR';
        output.error = err.message;
      }
    }
    console.info(`[COMPANION] page result type=${kind} status=${output.status} bytes=${bytes} topics=${output.topicCount ?? 'n/a'}`);
    return output;
  },
});

app.whenReady().then(async () => {
  const userDataDir = await ensureConfigDir();
  registerSystemIPCHandlers();
  registerScraperIPCHandlers(browserCompanion);
  require('./images/imageFetch.cjs').registerImageIPC({
    ipcMain, net,
    trustedUrl: (url) => {
      const { pathToFileURL } = require('node:url');
      if (url === pathToFileURL(path.join(__dirname, '../dist/index.html')).href) return true;
      if (app.isPackaged) return false;
      try {
        return new URL(url).origin === new URL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420').origin;
      } catch { return false; }
    },
  });

  try {
    const nativeDb = dbMain.initDatabase(userDataDir);
    registerLibraryIPCHandlers();
    registerDatabaseIPCHandlers();
    torrentMetadataService.registerIpcHandlers();
    require('./database/backupScheduler.cjs').initScheduler(userDataDir);
    require('./scraper/syncScheduler.cjs').initSyncScheduler();
    console.log('[DB][NATIVE] Native SQLite initialized in Main process');

    // Register Auto-Updater IPC & start background checks
    try {
      const { registerUpdaterIPC } = require('./updater/updaterIPC.cjs');
      const updaterManager = registerUpdaterIPC({
        syncActiveProvider: () => {
          try {
            const sm = ScraperManager.getInstance();
            return sm && (sm.getState().state === 'running' || sm.getState().state === 'preflight');
          } catch {
            return false;
          }
        },
      });
      updaterManager.startPeriodicChecks({ initialDelayMs: 10000, intervalMs: 4 * 60 * 60 * 1000 });
    } catch (updaterErr) {
      console.warn('[UPDATER][INIT_WARN] Auto-updater could not be initialized:', updaterErr.message);
    }

    // Run legacy JSON catalog migration to SQLite (idempotent, automatic)
    const jsonMigRes = migration.runJsonMigration(nativeDb, userDataDir);
    console.log(`[DB][MIGRATION] JSON migration status: ${jsonMigRes.status} (migrated: ${jsonMigRes.migratedItems || 0} items)`);

    // Run legacy favorites migration
    const favMigRes = migration.runFavoritesMigration(nativeDb, userDataDir);
    console.log(`[DB][MIGRATION] Favorites migration status: ${favMigRes.status}`);
  } catch (err) {
    console.error('[DB][NATIVE][ERROR] Native SQLite initialization failed:', err.message);
  }

  createWindow();
  if (perfEnabled) {
    console.log(`[PERF][MAIN] App ready & window created in ${(performance.now() - appStartTime).toFixed(2)}ms`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  try {
    require('./scraper/syncScheduler.cjs').stopSyncScheduler();
  } catch (_) {}
  browserCompanion.stop().catch(() => {});
  try {
    ScraperManager.getInstance().cancel();
  } catch (_) {}
  try {
    const { getUpdaterManager } = require('./updater/updaterManager.cjs');
    getUpdaterManager().shutdown();
  } catch (_) {}
  metadataManager.shutdown();
  dbMain.closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
