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

function createWindow() {
  const appIcon = getAppIconPath();
  const isHeadless = process.env.HEADLESS === 'true' || (!process.env.DISPLAY && process.platform === 'linux');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !isHeadless,
    title: "RT Library - Local Game & Catalog Viewer",
    autoHideMenuBar: true,
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

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

app.whenReady().then(async () => {
  const userDataDir = await ensureConfigDir();
  registerSystemIPCHandlers();
  registerScraperIPCHandlers();
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
    console.log('[DB][NATIVE] Native SQLite initialized in Main process');

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
    ScraperManager.getInstance().cancel();
  } catch (_) {}
  metadataManager.shutdown();
  dbMain.closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
