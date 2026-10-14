/**
 * Electron IPC bridge for auto-updater.
 * All operations run strictly in Electron Main.
 * Renderer only interacts via typed invocations and listeners.
 */

const { ipcMain, BrowserWindow } = require('electron');
const { getUpdaterManager } = require('./updaterManager.cjs');

const UPDATER_IPC_CHANNELS = {
  GET_STATUS: 'updater:get-status',
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  INSTALL: 'updater:install',
  STATUS_CHANGED: 'updater:status-changed',
};

function registerUpdaterIPC(options = {}) {
  let updater;
  try {
    updater = getUpdaterManager(options);

    // Broadcast status changes to all active windows
    updater.on('status-changed', (status) => {
      try {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send(UPDATER_IPC_CHANNELS.STATUS_CHANGED, status);
          }
        }
      } catch (err) {
        console.error('[UPDATER][IPC_BROADCAST_ERROR]', err.message);
      }
    });

    if (ipcMain) {
      ipcMain.handle(UPDATER_IPC_CHANNELS.GET_STATUS, () => {
        return updater.getStatus();
      });

      ipcMain.handle(UPDATER_IPC_CHANNELS.CHECK, async () => {
        return await updater.checkForUpdates(true);
      });

      ipcMain.handle(UPDATER_IPC_CHANNELS.DOWNLOAD, async () => {
        return await updater.downloadUpdate();
      });

      ipcMain.handle(UPDATER_IPC_CHANNELS.INSTALL, async () => {
        return await updater.quitAndInstall();
      });
    }

    return updater;
  } catch (err) {
    console.warn('[UPDATER][INIT_WARN] Auto-updater could not be initialized:', err.message);
    if (ipcMain) {
      const fallbackStatus = {
        state: 'UNSUPPORTED',
        currentVersion: options.currentVersion || (options.app && typeof options.app.getVersion === 'function' ? options.app.getVersion() : '1.1.0'),
        availableVersion: null,
        releaseDate: null,
        releaseNotes: null,
        downloadUrl: null,
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        errorCode: 'UPDATER_NOT_SUPPORTED',
        errorMessage: 'Auto-update is unavailable in this environment.',
        lastCheckedAt: null,
        isSupported: false,
        channel: 'stable',
      };
      ipcMain.handle(UPDATER_IPC_CHANNELS.GET_STATUS, () => fallbackStatus);
      ipcMain.handle(UPDATER_IPC_CHANNELS.CHECK, async () => fallbackStatus);
      ipcMain.handle(UPDATER_IPC_CHANNELS.DOWNLOAD, async () => fallbackStatus);
      ipcMain.handle(UPDATER_IPC_CHANNELS.INSTALL, async () => {
        throw new Error('Auto-updater is not supported in this environment.');
      });
    }
    return {
      startPeriodicChecks: () => {},
      shutdown: () => {},
      getStatus: () => ({ isSupported: false }),
    };
  }
}

module.exports = {
  UPDATER_IPC_CHANNELS,
  registerUpdaterIPC,
};

