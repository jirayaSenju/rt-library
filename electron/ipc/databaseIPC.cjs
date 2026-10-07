const { ipcMain, app, dialog, shell, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dbMain = require('../database/dbMain.cjs');
const { SCHEMA_VERSION } = require('../database/schema.cjs');
const backupScheduler = require('../database/backupScheduler.cjs');

const PAGE_SIZES = new Set([50, 100, 200]);
const READONLY_PRAGMAS = new Set([
  'user_version', 'schema_version', 'page_count', 'page_size',
  'freelist_count', 'journal_mode', 'foreign_keys', 'busy_timeout', 'synchronous'
]);
const qid = (value) => `"${String(value).replace(/"/g, '""')}"`;

let lastIntegrityCheck = null;

function getDb() {
  const db = dbMain.getDatabase();
  if (!db || db.open !== true) throw new Error('Database is unavailable');
  return db;
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function getTable(db, name) {
  if (typeof name !== 'string' || !tableNames(db).includes(name)) throw new Error('Unknown database table');
  return name;
}

function overview() {
  const db = getDb();
  const dbPath = dbMain.getDatabasePath();
  const walPath = `${dbPath}-wal`;
  const tables = tableNames(db);
  const healthResults = db.pragma('quick_check').map((row) => Object.values(row)[0]);
  const foreignKeyErrors = db.pragma('foreign_key_check');
  const health = healthResults.length !== 1 || healthResults[0] !== 'ok' ? 'Corrupted' : foreignKeyErrors.length ? 'Warning' : db.readonly ? 'Read-only' : 'Healthy';
  const schema = db.prepare("SELECT type, COUNT(*) AS count FROM sqlite_master WHERE type IN ('table','index','trigger','view') GROUP BY type").all();
  const counts = Object.fromEntries(schema.map((row) => [row.type, row.count]));
  
  let itemCount = null;
  if (tables.includes('items')) itemCount = db.prepare('SELECT COUNT(*) AS count FROM items').get().count;

  // Largest tables by row count
  const largestTables = tables.map((name) => {
    const rowCount = db.prepare(`SELECT COUNT(*) AS count FROM ${qid(name)}`).get().count;
    return { name, rowCount };
  }).sort((a, b) => b.rowCount - a.rowCount);

  const statSize = (file) => { try { return fs.statSync(file).size; } catch (_) { return 0; } };
  const scheduleStatus = backupScheduler.getScheduleStatus();
  const recentOperations = backupScheduler.getRecentOperations();

  return {
    path: dbPath,
    schemaVersion: db.pragma('user_version', { simple: true }),
    expectedSchemaVersion: SCHEMA_VERSION,
    sqliteVersion: db.prepare('SELECT sqlite_version() AS version').get().version,
    journalMode: db.pragma('journal_mode', { simple: true }),
    health,
    lastIntegrityCheck,
    size: statSize(dbPath),
    walSize: statSize(walPath),
    tableCount: counts.table || 0,
    indexCount: counts.index || 0,
    triggerCount: counts.trigger || 0,
    viewCount: counts.view || 0,
    itemCount,
    tables,
    largestTables,
    scheduleStatus,
    recentOperations,
  };
}

function listTables() {
  const db = getDb();
  return tableNames(db).map((name) => ({
    name,
    rows: db.prepare(`SELECT COUNT(*) AS count FROM ${qid(name)}`).get().count,
    columns: db.prepare(`PRAGMA table_info(${qid(name)})`).all().map((column) => ({
      name: column.name, type: column.type, nullable: !column.notnull, primaryKey: Boolean(column.pk), defaultValue: column.dflt_value,
    })),
    indexes: db.prepare(`PRAGMA index_list(${qid(name)})`).all().map((index) => ({
      name: index.name, unique: Boolean(index.unique), columns: db.prepare(`PRAGMA index_info(${qid(index.name)})`).all().map((col) => col.name),
    })),
    sql: db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql || null,
  }));
}

function getRows(_event, { table, limit, offset, orderBy, order = 'asc', searchColumn, searchValue } = {}) {
  const db = getDb();
  const name = getTable(db, table);
  const columns = db.prepare(`PRAGMA table_info(${qid(name)})`).all().map((column) => column.name);
  const safeLimit = PAGE_SIZES.has(limit) ? limit : 50;
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const sort = columns.includes(orderBy) ? qid(orderBy) : qid(columns[0]);
  const direction = order === 'desc' ? 'DESC' : 'ASC';

  let whereClause = '';
  const params = [];

  if (searchColumn && columns.includes(searchColumn) && typeof searchValue === 'string' && searchValue.trim()) {
    whereClause = `WHERE CAST(${qid(searchColumn)} AS TEXT) LIKE ?`;
    params.push(`%${searchValue.trim()}%`);
  }

  const rows = db.prepare(`SELECT * FROM ${qid(name)} ${whereClause} ORDER BY ${sort} ${direction} LIMIT ? OFFSET ?`).all(...params, safeLimit, safeOffset);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM ${qid(name)} ${whereClause}`).get(...params).count;

  return { rows, total, limit: safeLimit, offset: safeOffset };
}

function validateReadQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > 10000) throw new Error('Enter a query under 10,000 characters');
  if (/[;]|--|\/\*/.test(sql)) throw new Error('Semicolons and SQL comments are disabled in read-only mode');
  if (/\b(DELETE|INSERT|UPDATE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX|REPLACE)\b/i.test(sql)) {
    throw new Error('Write and DDL statements are disabled in read-only mode');
  }
  const statement = sql.trim();
  const first = statement.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase();
  if (first === 'PRAGMA') {
    const pragma = statement.match(/^PRAGMA\s+(?:main\.)?([A-Za-z_]+)/i)?.[1]?.toLowerCase();
    if (!pragma || !READONLY_PRAGMAS.has(pragma) || /=|\(/.test(statement)) throw new Error('This PRAGMA is not available in read-only mode');
    return { statement, pragma: true };
  }
  if (first !== 'SELECT' && first !== 'EXPLAIN' && first !== 'WITH') throw new Error('Read-only mode accepts SELECT, EXPLAIN, and approved PRAGMA statements');
  return { statement, pragma: false };
}

function validateBackupFile(filePath) {
  const source = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = source.pragma('integrity_check').map((row) => Object.values(row)[0]);
    const foreignKeys = source.pragma('foreign_key_check');
    const version = source.pragma('user_version', { simple: true });
    const sourceTables = new Set(tableNames(source));
    if (integrity.length !== 1 || integrity[0] !== 'ok' || foreignKeys.length || version > SCHEMA_VERSION || !sourceTables.has('items') || !sourceTables.has('categories')) {
      throw new Error('Backup failed integrity, foreign key, or schema compatibility checks');
    }
    return { version };
  } finally { source.close(); }
}

function collectRows(prepared, limit = 500) {
  const columns = prepared.columns().map((column) => column.name);
  const rows = [];
  const iterator = prepared.raw(true).iterate();
  for (const values of iterator) {
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
    if (rows.length >= limit) break;
  }
  return { columns, rows, truncated: rows.length === limit };
}

function runReadQuery(sql, explain = false) {
  const db = getDb();
  const { statement, pragma } = validateReadQuery(sql);
  const query = explain ? `EXPLAIN QUERY PLAN ${statement}` : statement;
  const t0 = performance.now();
  const prepared = db.prepare(query);
  if (!pragma && prepared.readonly !== true) throw new Error('The statement is not read-only');
  const { columns, rows, truncated } = collectRows(prepared);
  return { columns, rows, rowCount: rows.length, executionTimeMs: Math.round(performance.now() - t0), truncated };
}

function isBusy() {
  try {
    const scraper = require('../scraper/scraperManager.cjs').getInstance();
    if (scraper.getState().isRunning) return true;
  } catch (_) {}
  try {
    const indexing = require('../indexer/workerManager.cjs').getIndexingState();
    if (indexing.isIndexing) return true;
  } catch (_) {}
  try {
    const metadata = require('../torrent/metadataManager.cjs').getStatus();
    if (metadata.activeTasks > 0 || metadata.queueSize > 0) return true;
  } catch (_) {}
  return false;
}

function registerDatabaseIPCHandlers() {
  ipcMain.handle('database:getOverview', () => overview());
  ipcMain.handle('database:getTables', () => listTables());
  ipcMain.handle('database:getRows', getRows);
  ipcMain.handle('database:executeReadQuery', (_event, sql) => runReadQuery(sql));
  ipcMain.handle('database:explainQuery', (_event, sql) => runReadQuery(sql, true));

  ipcMain.handle('database:integrityCheck', (_event, full = false) => {
    const db = getDb();
    const check = full ? 'integrity_check' : 'quick_check';
    const results = db.pragma(check).map((row) => Object.values(row)[0]);
    const foreignKeys = db.pragma('foreign_key_check');
    const checkedAt = new Date().toISOString();
    lastIntegrityCheck = checkedAt;

    backupScheduler.logOperation('integrity_check', {
      type: check,
      status: results.length === 1 && results[0] === 'ok' && foreignKeys.length === 0 ? 'healthy' : 'warning',
      foreignKeyErrors: foreignKeys.length,
    });

    return { check, results, foreignKeys, checkedAt };
  });

  ipcMain.handle('database:checkpoint', () => {
    const before = overview().walSize;
    const t0 = performance.now();
    const result = getDb().pragma('wal_checkpoint(TRUNCATE)');
    const durationMs = Math.round(performance.now() - t0);
    const after = overview().walSize;

    backupScheduler.logOperation('checkpoint', {
      before,
      after,
      durationMs,
    });

    return { before, after, result, durationMs };
  });

  ipcMain.handle('database:optimize', () => {
    const t0 = performance.now();
    getDb().pragma('optimize');
    const durationMs = Math.round(performance.now() - t0);

    backupScheduler.logOperation('optimize', {
      durationMs,
    });

    return { success: true, durationMs };
  });

  ipcMain.handle('database:openFolder', async (_event, targetPath) => {
    const defaultPath = targetPath || dbMain.getDatabasePath();
    if (!defaultPath) return false;
    if (fs.existsSync(defaultPath)) {
      if (fs.statSync(defaultPath).isDirectory()) {
        await shell.openPath(defaultPath);
      } else {
        shell.showItemInFolder(defaultPath);
      }
      return true;
    }
    return false;
  });

  // Backup Schedule & Management
  ipcMain.handle('database:getBackupSchedule', () => backupScheduler.getScheduleStatus());
  ipcMain.handle('database:saveBackupSchedule', (_event, config) => backupScheduler.updateSchedule(config));
  ipcMain.handle('database:getBackupHistory', (_event, customDir) => backupScheduler.listBackups(customDir));
  ipcMain.handle('database:verifyBackup', (_event, filePath) => backupScheduler.verifyBackupFile(filePath));

  ipcMain.handle('database:deleteBackup', (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') throw new Error('File path required');
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    fs.unlinkSync(filePath);
    return { success: true };
  });

  ipcMain.handle('database:selectBackupDirectory', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parent, {
      title: 'Select Backup Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, directory: result.filePaths[0] };
  });

  // Manual Backup
  ipcMain.handle('database:createBackup', async (event, options = {}) => {
    if (options.useSaveDialog) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const { canceled, filePath } = await dialog.showSaveDialog(parent, {
        title: 'Create SQLite backup',
        defaultPath: `rt-library-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
        filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
      });
      if (canceled || !filePath) return { canceled: true };
      if (!['.sqlite', '.db'].includes(path.extname(filePath).toLowerCase())) throw new Error('Choose a .sqlite or .db file');
      const sourcePath = dbMain.getDatabasePath();
      if (path.resolve(filePath) === path.resolve(sourcePath)) throw new Error('Choose a different path from the active database');
      const res = await backupScheduler.executeBackup({ isManual: true, targetPath: filePath });
      return { canceled: false, ...res };
    }
    const res = await backupScheduler.executeBackup({ isManual: true });
    return { canceled: false, ...res };
  });

  // Restore Backup
  ipcMain.handle('database:restoreBackup', async (event, customFilePath = null) => {
    let sourcePath = customFilePath;
    if (!sourcePath) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const choice = await dialog.showOpenDialog(parent, {
        title: 'Restore SQLite backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
      });
      if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
      sourcePath = choice.filePaths[0];
    }

    if (!['.sqlite', '.db'].includes(path.extname(sourcePath).toLowerCase())) throw new Error('Choose a .sqlite or .db backup file');
    validateBackupFile(sourcePath);

    if (isBusy()) {
      throw new Error('Database is busy with scraper, indexing, or metadata work');
    }

    const currentPath = dbMain.getDatabasePath();
    if (path.resolve(sourcePath) === path.resolve(currentPath)) throw new Error('Choose a backup file other than the active database');
    const dataDir = path.dirname(currentPath);
    const backupsDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const automaticBackupPath = path.join(backupsDir, `rt-library-before-restore-${timestamp}.sqlite`);
    await getDb().backup(automaticBackupPath);
    const stagingPath = `${currentPath}.restore-${process.pid}-${Date.now()}`;
    const rollbackPath = `${currentPath}.rollback-${process.pid}-${Date.now()}`;
    let movedCurrent = false;

    try {
      fs.copyFileSync(sourcePath, stagingPath);
      const staged = new Database(stagingPath, { readonly: true, fileMustExist: true });
      try {
        if (staged.pragma('integrity_check').some((row) => Object.values(row)[0] !== 'ok') || staged.pragma('foreign_key_check').length) {
          throw new Error('Staged backup validation failed');
        }
      } finally { staged.close(); }
      dbMain.closeDatabase();
      fs.renameSync(currentPath, rollbackPath);
      movedCurrent = true;
      fs.renameSync(stagingPath, currentPath);
      dbMain.initDatabase(dataDir);
      try { fs.unlinkSync(rollbackPath); } catch (_) {}

      backupScheduler.logOperation('restore', {
        status: 'success',
        restoredFrom: path.basename(sourcePath),
        preRestoreBackup: path.basename(automaticBackupPath),
      });

      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('database:restored');
      return { canceled: false, success: true, automaticBackupPath };
    } catch (error) {
      try { dbMain.closeDatabase(); } catch (_) {}
      try { if (fs.existsSync(currentPath) && movedCurrent) fs.unlinkSync(currentPath); } catch (_) {}
      try { if (movedCurrent && fs.existsSync(rollbackPath)) fs.renameSync(rollbackPath, currentPath); } catch (_) {}
      try { dbMain.initDatabase(dataDir); } catch (reopenError) { error.message += `; database reopen failed: ${reopenError.message}`; }
      try { if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath); } catch (_) {}

      backupScheduler.logOperation('restore', {
        status: 'failed',
        error: error.message,
      });

      throw error;
    }
  });

  // Vacuum with busy protection
  ipcMain.handle('database:runVacuum', async () => {
    if (isBusy()) {
      throw new Error('Cannot run VACUUM while scraper or indexing is in progress');
    }
    const db = getDb();
    const t0 = performance.now();
    db.exec('VACUUM');
    const durationMs = Math.round(performance.now() - t0);

    backupScheduler.logOperation('vacuum', {
      durationMs,
    });

    return { success: true, durationMs };
  });

  // Data cleanup (Scan & Execute)
  ipcMain.handle('database:runDataCleanup', (_event, { execute = false } = {}) => {
    const db = getDb();
    const tables = new Set(tableNames(db));

    let orphanDetails = 0;
    let orphanMetadata = 0;
    let invalidFavorites = 0;

    if (tables.has('item_details') && tables.has('items')) {
      orphanDetails = db.prepare('SELECT COUNT(*) AS count FROM item_details WHERE id NOT IN (SELECT id FROM items)').get().count;
    }
    if (tables.has('torrent_metadata') && tables.has('items')) {
      orphanMetadata = db.prepare('SELECT COUNT(*) AS count FROM torrent_metadata WHERE id NOT IN (SELECT id FROM items)').get().count;
    }
    if (tables.has('favorites') && tables.has('items')) {
      invalidFavorites = db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE item_id NOT IN (SELECT id FROM items)').get().count;
    }

    if (!execute) {
      return {
        orphanDetails,
        orphanMetadata,
        invalidFavorites,
        totalProblems: orphanDetails + orphanMetadata + invalidFavorites,
      };
    }

    if (isBusy()) {
      throw new Error('Cannot clean database while tasks are active');
    }

    const runCleanup = db.transaction(() => {
      let d1 = 0, d2 = 0, d3 = 0;
      if (tables.has('item_details') && tables.has('items')) {
        d1 = db.prepare('DELETE FROM item_details WHERE id NOT IN (SELECT id FROM items)').run().changes;
      }
      if (tables.has('torrent_metadata') && tables.has('items')) {
        d2 = db.prepare('DELETE FROM torrent_metadata WHERE id NOT IN (SELECT id FROM items)').run().changes;
      }
      if (tables.has('favorites') && tables.has('items')) {
        d3 = db.prepare('DELETE FROM favorites WHERE item_id NOT IN (SELECT id FROM items)').run().changes;
      }
      return { d1, d2, d3 };
    });

    const result = runCleanup();
    backupScheduler.logOperation('cleanup', {
      deletedDetails: result.d1,
      deletedMetadata: result.d2,
      deletedFavorites: result.d3,
    });

    return {
      success: true,
      deletedDetails: result.d1,
      deletedMetadata: result.d2,
      deletedFavorites: result.d3,
      totalDeleted: result.d1 + result.d2 + result.d3,
    };
  });

  // Export Table
  ipcMain.handle('database:exportTable', async (event, { table, format = 'csv' } = {}) => {
    const db = getDb();
    const name = getTable(db, table);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const extension = format === 'json' ? 'json' : 'csv';

    const { canceled, filePath } = await dialog.showSaveDialog(parent, {
      title: `Export ${name} as ${format.toUpperCase()}`,
      defaultPath: `${name}-${new Date().toISOString().slice(0, 10)}.${extension}`,
      filters: [{ name: format.toUpperCase(), extensions: [extension] }],
    });

    if (canceled || !filePath) return { canceled: true };

    const total = db.prepare(`SELECT COUNT(*) AS count FROM ${qid(name)}`).get().count;
    const columns = db.prepare(`PRAGMA table_info(${qid(name)})`).all().map((c) => c.name);

    const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });

    if (format === 'json') {
      writeStream.write('[\n');
      const chunkSize = 500;
      let offset = 0;
      let first = true;

      while (offset < total) {
        const batch = db.prepare(`SELECT * FROM ${qid(name)} LIMIT ? OFFSET ?`).all(chunkSize, offset);
        for (const row of batch) {
          const jsonStr = JSON.stringify(row);
          if (!first) writeStream.write(',\n');
          writeStream.write(`  ${jsonStr}`);
          first = false;
        }
        offset += chunkSize;
      }
      writeStream.write('\n]\n');
    } else {
      // CSV
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (/[",\n\r]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      writeStream.write(columns.map(escapeCsv).join(',') + '\n');
      const chunkSize = 500;
      let offset = 0;

      while (offset < total) {
        const batch = db.prepare(`SELECT * FROM ${qid(name)} LIMIT ? OFFSET ?`).all(chunkSize, offset);
        for (const row of batch) {
          const line = columns.map((col) => escapeCsv(row[col])).join(',');
          writeStream.write(line + '\n');
        }
        offset += chunkSize;
      }
    }

    await new Promise((resolve, reject) => {
      writeStream.end(resolve);
      writeStream.on('error', reject);
    });

    return { canceled: false, filePath, totalRows: total };
  });
}

module.exports = {
  registerDatabaseIPCHandlers,
  validateReadQuery,
  runReadQuery,
  collectRows,
  validateBackupFile,
};
