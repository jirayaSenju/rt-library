const { ipcMain, BrowserWindow, dialog, app } = require('electron');
const fs = require('fs/promises');
const dbMain = require('../database/dbMain.cjs');
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const detailsRepo = require('../database/repositories/detailsRepo.cjs');
const favoritesRepo = require('../database/repositories/favoritesRepo.cjs');
const migration = require('../database/migration.cjs');

const ALLOWED_SORT_COLUMNS = new Set(['title', 'discoveredAt', 'releaseYear', 'sizeBytes']);
const ALLOWED_SORT_ORDERS = new Set(['asc', 'desc']);

function getDbOrThrow() {
  const db = dbMain.getDatabase();
  if (!db) {
    throw new Error('Native database connection is not initialized');
  }
  return db;
}

function registerLibraryIPCHandlers() {
  // 0. Capabilities & Readiness Check
  ipcMain.handle('library:getCapabilities', async () => {
    try {
      const db = dbMain.getDatabase();
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const readiness = migration.getLibraryReadiness(db, userDataDir);
      return {
        enableNativeDb: true,
        isReady: readiness.isReady,
        state: readiness.state,
        itemCount: readiness.itemCount,
        categoriesCount: readiness.categoriesCount,
        initialScanCompleted: readiness.initialScanCompleted,
      };
    } catch (err) {
      console.warn('[IPC][LIBRARY] Capabilities check warning:', err.message);
      return { enableNativeDb: true, isReady: false, state: 'ERROR', itemCount: 0, categoriesCount: 0, initialScanCompleted: false };
    }
  });

  // 0.1 Explicit Library Readiness Check
  ipcMain.handle('library:getReadiness', async () => {
    try {
      const db = dbMain.getDatabase();
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      return migration.getLibraryReadiness(db, userDataDir);
    } catch (err) {
      return {
        state: 'ERROR',
        isReady: false,
        itemCount: 0,
        categoriesCount: 0,
        initialScanCompleted: false,
        error: err.message,
      };
    }
  });

  // 0.2 Trigger Legacy JSON Migration
  ipcMain.handle('library:runMigration', async () => {
    try {
      const db = getDbOrThrow();
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      return migration.runJsonMigration(db, userDataDir);
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  });

  // 1. Categories List
  ipcMain.handle('library:getCategories', async () => {
    try {
      const t0 = performance.now();
      const db = getDbOrThrow();
      const rows = categoriesRepo.getAll(db);
      const duration = performance.now() - t0;
      if (process.env.RT_LIBRARY_PERF === '1') {
        console.log(`[PERF][IPC] library:getCategories: ${duration.toFixed(2)}ms (${rows.length} categories)`);
      }
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        itemCount: c.item_count,
        lastScrapedAt: c.last_scraped_at,
      }));
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getCategories failed:', err.message);
      return [];
    }
  });

  // 1.1 Filter Facets (V3-07)
  ipcMain.handle('library:getFilterFacets', async (event, options = {}) => {
    try {
      const t0 = performance.now();
      const db = getDbOrThrow();
      const categoryId = options.categoryId && typeof options.categoryId === 'string' ? options.categoryId.trim() : undefined;
      const facets = itemsRepo.getFilterFacets(db, { categoryId });
      const duration = performance.now() - t0;
      if (process.env.RT_LIBRARY_PERF === '1') {
        console.log(`[PERF][IPC] library:getFilterFacets (${categoryId || 'global'}): ${duration.toFixed(2)}ms`);
      }
      return facets;
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getFilterFacets failed:', err.message);
      return {
        developers: [],
        publishers: [],
        genres: [],
        languages: [],
        imageFormats: [],
        regions: [],
        multiplayer: { yes: 0, no: 0 },
      };
    }
  });

  // 2. Paginated Items Grid Payload
  ipcMain.handle('library:getItems', async (event, options = {}) => {
    try {
      const t0 = performance.now();
      const db = getDbOrThrow();

      const rawCat = options.categoryId && typeof options.categoryId === 'string' ? options.categoryId.trim() : undefined;
      const isFavoritesCategory = rawCat === 'favorites' || Boolean(options.favoritesOnly);
      const categoryId = (rawCat === 'all' || rawCat === 'favorites') ? undefined : rawCat;
      const search = options.search && typeof options.search === 'string' ? options.search.trim() : undefined;
      const favoritesOnly = isFavoritesCategory;
      const swarmOptions = {
        hasSeeds: options.hasSeeds === true,
        hasLeechers: options.hasLeechers === true,
        minSeeds: Number.isFinite(options.minSeeds) ? options.minSeeds : null,
        maxSeeds: Number.isFinite(options.maxSeeds) ? options.maxSeeds : null,
        minLeechers: Number.isFinite(options.minLeechers) ? options.minLeechers : null,
        maxLeechers: Number.isFinite(options.maxLeechers) ? options.maxLeechers : null,
      };

      const advancedOptions = {
        yearFrom: Number.isFinite(options.yearFrom) ? options.yearFrom : null,
        yearTo: Number.isFinite(options.yearTo) ? options.yearTo : null,
        minSizeBytes: Number.isFinite(options.minSizeBytes) ? options.minSizeBytes : null,
        maxSizeBytes: Number.isFinite(options.maxSizeBytes) ? options.maxSizeBytes : null,
        hasMagnet: typeof options.hasMagnet === 'boolean' ? options.hasMagnet : null,
        hasScreenshots: typeof options.hasScreenshots === 'boolean' ? options.hasScreenshots : null,
        discoveredPreset: typeof options.discoveredPreset === 'string' ? options.discoveredPreset : null,
      };

      const metadataOptions = {
        developers: Array.isArray(options.developers) ? options.developers : undefined,
        publishers: Array.isArray(options.publishers) ? options.publishers : undefined,
        genres: Array.isArray(options.genres) ? options.genres : undefined,
        languages: Array.isArray(options.languages) ? options.languages : undefined,
        imageFormats: Array.isArray(options.imageFormats) ? options.imageFormats : undefined,
        multiplayer: options.multiplayer === 'yes' || options.multiplayer === 'no' ? options.multiplayer : undefined,
        regions: Array.isArray(options.regions) ? options.regions : undefined,
      };

      const sortBy = options.sortBy && ALLOWED_SORT_COLUMNS.has(options.sortBy) ? options.sortBy : 'discoveredAt';
      const sortOrder = options.sortOrder && ALLOWED_SORT_ORDERS.has(options.sortOrder.toLowerCase()) ? options.sortOrder.toLowerCase() : 'desc';

      const limitRaw = typeof options.limit === 'number' ? options.limit : 100;
      const limit = Math.min(Math.max(1, limitRaw), 500);
      const offset = typeof options.offset === 'number' && options.offset >= 0 ? options.offset : 0;

      const result = itemsRepo.getPaginated(db, {
        categoryId,
        search,
        favoritesOnly,
        ...swarmOptions,
        ...advancedOptions,
        ...metadataOptions,
        sortBy,
        sortOrder,
        limit,
        offset,
      });

      const duration = performance.now() - t0;
      if (process.env.RT_LIBRARY_PERF === '1') {
        console.log(`[PERF][IPC] library:getItems (${result.items.length}/${result.total}): ${duration.toFixed(2)}ms`);
      }

      const lightItems = result.items.map((item) => ({
        id: item.id,
        topicId: item.topicId || null,
        categoryId: item.categoryId,
        title: item.title,
        topicTitle: item.topicTitle || null,
        canonicalTitle: item.canonicalTitle || null,
        canonicalTitleRaw: item.canonicalTitleRaw || null,
        normalizedTitle: item.normalizedTitle || null,
        cleanTitle: item.cleanTitle,
        releaseGroup: item.releaseGroup || null,
        infoHash: item.infoHash || null,
        genre: item.genre || null,
        developer: item.developer || null,
        publisher: item.publisher || null,
        version: item.version || null,
        region: item.region || null,
        releaseYear: item.releaseYear || null,
        coverUrl: item.coverUrl || null,
        sizeStr: item.sizeStr || null,
        sizeBytes: item.sizeBytes || null,
        hasMagnet: Boolean(item.hasMagnet),
        magnet: item.magnet || null,
        magnetLink: item.magnetLink || item.magnet || null,
        hasScreenshots: Boolean(item.hasScreenshots),
        isFavorite: Boolean(item.isFavorite),
        discoveredAt: item.discoveredAt || null,
        seeds: item.seeds,
        leechers: item.leechers,
        peers: item.peers,
        swarmStatus: item.swarmStatus,
        swarmSource: item.swarmSource,
        swarmFetchedAt: item.swarmFetchedAt,
      }));

      return {
        items: lightItems,
        total: result.total,
        hasMore: result.hasMore,
        limit: result.limit,
        offset: result.offset,
      };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getItems failed:', err.message);
      return { items: [], total: 0, hasMore: false, limit: 100, offset: 0 };
    }
  });

  // 3. Item Detail Payload (On-Demand for Modals)
  ipcMain.handle('library:getItem', async (event, id) => {
    if (!id || typeof id !== 'string') return null;
    try {
      const t0 = performance.now();
      const db = getDbOrThrow();
      const item = itemsRepo.getById(db, id);
      if (!item) return null;

      const details = detailsRepo.getByItemId(db, id);
      const duration = performance.now() - t0;
      if (process.env.RT_LIBRARY_PERF === '1') {
        console.log(`[PERF][IPC] library:getItem (${id}): ${duration.toFixed(2)}ms`);
      }

      return {
        ...item,
        magnet: details ? details.magnet : null,
        fileList: details ? details.fileList : [],
        fileCount: details ? details.fileCount : null,
        fileListTotalSizeBytes: details ? details.fileListTotalSizeBytes : item.sizeBytes,
        fileListSource: details ? details.fileListSource : null,
        screenshots: details ? details.screenshots : [],
        source: details ? details.source : null,
        scraping: details ? details.scraping : null,
      };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getItem failed:', err.message);
      return null;
    }
  });

  // 4. Screenshots On-Demand (For Lightbox)
  ipcMain.handle('library:getScreenshots', async (event, id) => {
    if (!id || typeof id !== 'string') return { screenshots: [] };
    try {
      const db = getDbOrThrow();
      const details = detailsRepo.getByItemId(db, id);
      return {
        screenshots: details && Array.isArray(details.screenshots) ? details.screenshots : [],
      };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getScreenshots failed:', err.message);
      return { screenshots: [] };
    }
  });

  // 5. Favorites RPC
  ipcMain.handle('library:setFavorite', async (event, { id, isFavorite }) => {
    if (!id || typeof id !== 'string') return { success: false };
    try {
      const db = getDbOrThrow();
      const success = favoritesRepo.setFavorite(db, id, Boolean(isFavorite));
      return { success };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:setFavorite failed:', err.message);
      return { success: false };
    }
  });

  ipcMain.handle('library:setFavorites', async (event, { ids, isFavorite }) => {
    if (!Array.isArray(ids) || ids.length === 0) return { success: true, updatedCount: 0 };
    try {
      const db = getDbOrThrow();
      const res = favoritesRepo.setFavoritesBatch(db, ids, Boolean(isFavorite));
      return res;
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:setFavorites failed:', err.message);
      return { success: false, updatedCount: 0, error: err.message };
    }
  });

  ipcMain.handle('library:toggleFavorite', async (event, id) => {
    if (!id || typeof id !== 'string') return { success: false, isFavorite: false };
    try {
      const db = getDbOrThrow();
      const isFav = favoritesRepo.toggle(db, id);
      return { success: true, isFavorite: isFav };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:toggleFavorite failed:', err.message);
      return { success: false, isFavorite: false };
    }
  });

  ipcMain.handle('library:getFavoriteCount', async () => {
    try {
      const db = getDbOrThrow();
      const count = favoritesRepo.count(db);
      return { count };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getFavoriteCount failed:', err.message);
      return { count: 0 };
    }
  });

  // 5.1 Export Magnet Links (.txt with native Save Dialog)
  ipcMain.handle('library:exportMagnets', async (event, payload) => {
    const rawMagnets = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.magnets) ? payload.magnets : []);
    const validMagnets = rawMagnets
      .filter((m) => typeof m === 'string' && m.trim().startsWith('magnet:?'))
      .map((m) => m.trim());

    if (validMagnets.length === 0) {
      return { success: false, error: 'No valid magnet links to export' };
    }

    const uniqueMagnets = Array.from(new Set(validMagnets));

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const defaultFilename = `rt-library-magnets-${timestamp}.txt`;

    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Magnet Links',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Text files (*.txt)', extensions: ['txt'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    try {
      const fileContent = uniqueMagnets.join('\n') + '\n';
      await fs.writeFile(filePath, fileContent, 'utf8');
      return { success: true, filePath, count: uniqueMagnets.length };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:exportMagnets failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 6. SQLite Library Refresh / Maintenance
  ipcMain.handle('library:refresh', async () => {
    try {
      const db = getDbOrThrow();
      const total = itemsRepo.getTotalItemCount(db);
      return { status: 'completed', total };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:refresh failed:', err.message);
      return { status: 'error', error: err.message };
    }
  });

  // 7. Indexing Status Check (SQLite-only: always ready unless migration running)
  ipcMain.handle('library:getIndexStatus', async () => {
    return { isIndexing: false, progress: null };
  });

  // 8. Legacy ensureNativeImport Compatibility shim
  ipcMain.handle('library:ensureNativeImport', async () => {
    return { success: true, summary: { total: 0 } };
  });

  // 9. All Image URLs for Cache Warmup / Generation
  ipcMain.handle('library:getAllImageUrls', async () => {
    try {
      const db = getDbOrThrow();
      const stmt = db.prepare(`
        SELECT
          items.id,
          items.title,
          items.cover_url AS coverUrl,
          item_details.screenshots_json AS screenshotsJson
        FROM items
        LEFT JOIN item_details ON item_details.item_id = items.id
      `);
      const rows = stmt.all();
      let totalCovers = 0;
      let totalScreenshots = 0;
      const items = rows.map((r) => {
        let screenshots = [];
        if (r.screenshotsJson) {
          try {
            screenshots = JSON.parse(r.screenshotsJson);
          } catch {}
        }
        if (r.coverUrl) totalCovers++;
        if (Array.isArray(screenshots)) totalScreenshots += screenshots.length;
        return {
          id: r.id,
          title: r.title,
          coverUrl: r.coverUrl || null,
          screenshots: Array.isArray(screenshots) ? screenshots : [],
        };
      });
      return {
        success: true,
        items,
        totalItems: items.length,
        totalCovers,
        totalScreenshots,
      };
    } catch (err) {
      console.error('[IPC][LIBRARY][ERROR] library:getAllImageUrls failed:', err.message);
      return { success: false, items: [], totalItems: 0, totalCovers: 0, totalScreenshots: 0, error: err.message };
    }
  });
}

module.exports = {
  registerLibraryIPCHandlers,
};
