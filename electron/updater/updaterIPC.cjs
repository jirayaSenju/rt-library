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
  const updater = getUpdaterManager(options);

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
}

module.exports = {
  UPDATER_IPC_CHANNELS,
  registerUpdaterIPC,
};

