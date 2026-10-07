const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const favoritesRepo = require('./repositories/favoritesRepo.cjs');
const itemsRepo = require('./repositories/itemsRepo.cjs');
const categoriesRepo = require('./repositories/categoriesRepo.cjs');
const appStateRepo = require('./repositories/appStateRepo.cjs');
const normalize = require('../indexer/normalize.cjs');

function padZero(num) {
  return String(num).padStart(2, '0');
}

function getFormattedTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = padZero(now.getMonth() + 1);
  const dd = padZero(now.getDate());
  const hh = padZero(now.getHours());
  const mm = padZero(now.getMinutes());
  const ss = padZero(now.getSeconds());
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

function createDatabaseBackup(userDataDir) {
  try {
    const dbPath = path.join(userDataDir, 'rt-library-v2.sqlite');
    if (!fs.existsSync(dbPath)) return null;
    const stats = fs.statSync(dbPath);
    if (stats.size === 0) return null;

    const backupDir = path.join(userDataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPath = path.join(backupDir, `rt-library-before-json-migration-${getFormattedTimestamp()}.sqlite`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[MIGRATION][BACKUP] Created SQLite database backup at: ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.warn('[MIGRATION][BACKUP][WARNING] Failed to create database backup:', err.message);
    return null;
  }
}

function detectLegacyDatabase(userDataDir) {
  const legacyDbPath = path.join(userDataDir, 'rt-library.sqlite');
  if (!fs.existsSync(legacyDbPath)) {
    return null;
  }
  try {
    const stats = fs.statSync(legacyDbPath);
    if (stats.size === 0) {
      return null;
    }
    return legacyDbPath;
  } catch (err) {
    return null;
  }
}

function extractLegacyData(legacyDbPath) {
  let legacyDb = null;
  try {
    legacyDb = new Database(legacyDbPath, { readonly: true, fileMustExist: true });

    let favorites = [];
    try {
      const favRows = legacyDb.prepare('SELECT item_id, added_at FROM favorites').all();
      favorites = favRows.map((row) => ({
        itemId: row.item_id,
        addedAt: row.added_at || new Date().toISOString(),
      }));
    } catch (err) {
      if (err.message.includes('no such table')) {
        favorites = [];
      } else {
        throw err;
      }
    }

    return { success: true, favorites };
  } catch (err) {
    return { success: false, error: err.message, favorites: [] };
  } finally {
    if (legacyDb) {
      try {
        legacyDb.close();
      } catch (e) {}
    }
  }
}

function runFavoritesMigration(nativeDb, userDataDir) {
  if (appStateRepo.hasMigration(nativeDb, 'legacy_db_favorites_migration')) {
    return { status: 'already_migrated' };
  }

  const legacyDbPath = detectLegacyDatabase(userDataDir);
  if (!legacyDbPath) {
    appStateRepo.recordMigration(nativeDb, 'legacy_db_favorites_migration', 'Legacy v1 SQLite favorites migration');
    return { status: 'no_legacy_db' };
  }

  const totalNativeItems = itemsRepo.countByCategory(nativeDb, 'all');
  if (totalNativeItems === 0) {
    return { status: 'pending', reason: 'NATIVE_DB_EMPTY' };
  }

  const extracted = extractLegacyData(legacyDbPath);
  if (!extracted.success) {
    return { status: 'error', error: extracted.error };
  }

  for (const legacyFav of extracted.favorites) {
    let nativeItem = itemsRepo.getById(nativeDb, legacyFav.itemId);
    if (!nativeItem) {
      try {
        const row = nativeDb.prepare('SELECT id FROM items WHERE topic_id = ? OR id LIKE ? LIMIT 1').get(legacyFav.itemId, `%_${legacyFav.itemId}`);
        if (row) {
          nativeItem = itemsRepo.getById(nativeDb, row.id);
        }
      } catch (e) {}
    }

    if (nativeItem) {
      favoritesRepo.setFavorite(nativeDb, nativeItem.id, true, legacyFav.addedAt);
    }
  }

  appStateRepo.recordMigration(nativeDb, 'legacy_db_favorites_migration', 'Legacy v1 SQLite favorites migration');
  return { status: 'completed', total: extracted.favorites.length };
}

function detectLegacyJsonCatalogs(userDataDir) {
  const candidateDirs = [
    path.join(userDataDir, 'data'),
    path.resolve(__dirname, '../../data'),
    process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null,
  ].filter(Boolean);

  const ignoredFiles = new Set(['config.json', 'scraper-categories.json', 'package.json', 'tsconfig.json']);
  const files = [];

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.json') && !ignoredFiles.has(entry.name.toLowerCase())) {
            const fullPath = path.join(dir, entry.name);
            if (!files.includes(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch (_) {}
    }
  }

  return files;
}

function runJsonMigration(nativeDb, userDataDir, progressCallback) {
  if (appStateRepo.hasMigration(nativeDb, 'json_catalog_to_sqlite_v1')) {
    return { status: 'already_migrated', migratedFiles: 0, migratedItems: 0 };
  }

  const jsonFiles = detectLegacyJsonCatalogs(userDataDir);
  if (jsonFiles.length === 0) {
    appStateRepo.recordMigration(nativeDb, 'json_catalog_to_sqlite_v1', 'Legacy JSON catalog migration to SQLite (No JSON found)');
    return { status: 'no_legacy_json', migratedFiles: 0, migratedItems: 0 };
  }

  console.log(`[MIGRATION][START] Migrating ${jsonFiles.length} legacy JSON catalog files to SQLite...`);
  const backupPath = createDatabaseBackup(userDataDir);

  let totalItemsMigrated = 0;
  const BATCH_SIZE = 500;

  try {
    for (let fIdx = 0; fIdx < jsonFiles.length; fIdx++) {
      const filePath = jsonFiles[fIdx];
      const filename = path.basename(filePath);

      let content = null;
      try {
        const rawText = fs.readFileSync(filePath, 'utf8');
        content = JSON.parse(rawText);
      } catch (err) {
        console.warn(`[MIGRATION][WARN] Skipping unparseable JSON file ${filename}:`, err.message);
        continue;
      }

      const catHeader = normalize.parseCategoryHeader(filename, content);
      const rawItems = normalize.extractItemsList(content);

      if (rawItems.length > 0) {
        categoriesRepo.upsert(nativeDb, {
          id: catHeader.id,
          name: catHeader.name,
          baseUrl: catHeader.baseUrl,
          titleSearch: catHeader.titleSearch,
          filePath: '',
          itemCount: rawItems.length,
          lastScrapedAt: new Date().toISOString(),
        });

        for (let i = 0; i < rawItems.length; i += BATCH_SIZE) {
          const chunk = rawItems.slice(i, i + BATCH_SIZE);
          const normalized = chunk
            .map((item) => normalize.normalizeItem(item, catHeader.id, catHeader.name))
            .filter(Boolean);

          itemsRepo.upsertBatch(nativeDb, normalized);
          totalItemsMigrated += normalized.length;

          if (progressCallback && typeof progressCallback === 'function') {
            progressCallback({
              status: 'migrating',
              currentFile: fIdx + 1,
              totalFiles: jsonFiles.length,
              fileName: filename,
              itemsMigrated: totalItemsMigrated,
            });
          }
        }
      }
    }

    if (totalItemsMigrated > 0) {
      appStateRepo.setAppState(nativeDb, 'initial_scan_completed', 'true');
      appStateRepo.setAppState(nativeDb, 'legacy_data_migrated', 'true');
    }

    appStateRepo.recordMigration(nativeDb, 'json_catalog_to_sqlite_v1', 'Legacy JSON catalog migration to SQLite');
    console.log(`[MIGRATION][COMPLETE] Successfully migrated ${totalItemsMigrated} items from ${jsonFiles.length} files to SQLite.`);

    // Run favorites migration after items are imported
    runFavoritesMigration(nativeDb, userDataDir);

    return {
      status: 'completed',
      migratedFiles: jsonFiles.length,
      migratedItems: totalItemsMigrated,
      backupPath,
    };
  } catch (err) {
    console.error('[MIGRATION][ERROR] Failed legacy JSON migration:', err.message);
    return {
      status: 'error',
      error: err.message,
      migratedItems: totalItemsMigrated,
    };
  }
}

function getLibraryReadiness(nativeDb, userDataDir) {
  if (!nativeDb) {
    return {
      state: 'ERROR',
      isReady: false,
      itemCount: 0,
      categoriesCount: 0,
      initialScanCompleted: false,
      error: 'Database connection is not initialized',
    };
  }

  try {
    const totalItems = itemsRepo.getTotalItemCount(nativeDb);
    const categories = categoriesRepo.getAll(nativeDb);
    const initialScanCompleted = appStateRepo.getAppState(nativeDb, 'initial_scan_completed') === 'true';

    // Case A: Valid SQLite with items and initial scan completed
    if (totalItems > 0 && initialScanCompleted) {
      return {
        state: 'READY',
        isReady: true,
        itemCount: totalItems,
        categoriesCount: categories.length,
        initialScanCompleted: true,
      };
    }

    // Case B/C: Check if legacy JSON migration is pending
    const hasJsonMigration = appStateRepo.hasMigration(nativeDb, 'json_catalog_to_sqlite_v1');
    if (!hasJsonMigration) {
      const legacyJsonFiles = detectLegacyJsonCatalogs(userDataDir);
      if (legacyJsonFiles.length > 0) {
        return {
          state: 'MIGRATING',
          isReady: false,
          itemCount: totalItems,
          categoriesCount: categories.length,
          initialScanCompleted,
          legacyFilesCount: legacyJsonFiles.length,
        };
      }
    }

    // Case D/E: SQLite empty or initial scan was cancelled/not completed
    return {
      state: 'SCRAPER_REQUIRED',
      isReady: false,
      itemCount: totalItems,
      categoriesCount: categories.length,
      initialScanCompleted,
    };
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
}

module.exports = {
  createDatabaseBackup,
  detectLegacyDatabase,
  detectLegacyJsonCatalogs,
  runFavoritesMigration,
  runJsonMigration,
  getLibraryReadiness,
};
