/**
 * Torrent Metadata Main Process IPC Service
 * Exposes IPC channels for Renderer process to query torrent metadata, refresh magnet info, and receive real-time updates.
 */

const { ipcMain, BrowserWindow } = require('electron');
const torrentMetadataRepo = require('../database/repositories/torrentMetadataRepo.cjs');
const metadataManager = require('./metadataManager.cjs');
const { getDatabase } = require('../database/dbMain.cjs');

function registerIpcHandlers() {
  ipcMain.handle('torrent:getMetadata', async (_, itemId) => {
    if (!itemId) return null;
    return torrentMetadataRepo.getByItemId(itemId);
  });

  ipcMain.handle('torrent:refreshMetadata', async (_, itemId, magnetUrl) => {
    if (!itemId) return false;
    const db = getDatabase();
    return metadataManager.refreshItem(db, itemId, magnetUrl);
  });

  ipcMain.handle('torrent:getQueueStatus', async () => {
    return metadataManager.getStatus();
  });

  ipcMain.handle('torrent:startCollection', async (_, mode = 'all') => {
    const db = getDatabase();
    return metadataManager.startBulkCollection(db, mode);
  });

  ipcMain.handle('torrent:stopCollection', async () => {
    return metadataManager.stopBulkCollection();
  });

  ipcMain.handle('torrent:getCollectionProgress', async () => {
    return metadataManager.getCollectionProgress();
  });

  metadataManager.addProgressListener((progressData) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('torrent:collectionProgress', progressData);
      }
    }
  });

  metadataManager.addUpdateListener((itemId, record) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        const lightRecord = record
          ? {
              itemId: record.itemId,
              infoHash: record.infoHash,
              torrentName: record.torrentName,
              totalSizeBytes: record.totalSizeBytes,
              fileCount: record.fileCount,
              seeds: record.seeds,
              leechers: record.leechers,
              peers: record.peers,
              metadataStatus: record.metadataStatus,
              swarmStatus: record.swarmStatus,
              metadataFetchedAt: record.metadataFetchedAt,
              swarmFetchedAt: record.swarmFetchedAt,
              updatedAt: record.updatedAt,
            }
          : null;
        win.webContents.send('torrent:metadataUpdated', { itemId, record: lightRecord });
      }
    }
  });
}

module.exports = {
  registerIpcHandlers,
};
