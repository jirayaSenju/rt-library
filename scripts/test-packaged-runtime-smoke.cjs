#!/usr/bin/env node

/**
 * RT-Library Packaged Runtime Acceptance Smoke Test
 * Executes against the packaged app.asar and unpacked native binaries in dist-desktop/
 * to verify schema creation, native better-sqlite3 execution, clean startup,
 * and legacy migration in the exact distribution packaging context.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DESKTOP = path.join(PROJECT_ROOT, 'dist-desktop');
const ASAR_PATH = path.join(DIST_DESKTOP, 'linux-unpacked', 'resources', 'app.asar');

if (!fs.existsSync(ASAR_PATH)) {
  console.error(`[SMOKE_TEST][ERROR] Packaged archive not found at: ${ASAR_PATH}`);
  process.exit(1);
}

console.log(`[SMOKE_TEST] Testing packaged archive: ${ASAR_PATH}`);

// Require modules directly from the packaged app.asar
const dbMain = require(path.join(ASAR_PATH, 'electron', 'database', 'dbMain.cjs'));
const schema = require(path.join(ASAR_PATH, 'electron', 'database', 'schema.cjs'));
const migration = require(path.join(ASAR_PATH, 'electron', 'database', 'migration.cjs'));
const categoriesRepo = require(path.join(ASAR_PATH, 'electron', 'database', 'repositories', 'categoriesRepo.cjs'));
const itemsRepo = require(path.join(ASAR_PATH, 'electron', 'database', 'repositories', 'itemsRepo.cjs'));
const favoritesRepo = require(path.join(ASAR_PATH, 'electron', 'database', 'repositories', 'favoritesRepo.cjs'));
const syncHistoryRepo = require(path.join(ASAR_PATH, 'electron', 'database', 'repositories', 'syncHistoryRepo.cjs'));

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rt-packaged-smoke-'));
}

function cleanTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

async function runPackagedSmoke() {
  console.log('\n--- STEP 1: FRESH PROFILE INITIALIZATION IN PACKAGED CONTEXT ---');
  const tempDir = createTempDir();
  console.log(`Using temporary isolated userData directory: ${tempDir}`);

  const db = dbMain.initDatabase(tempDir);
  assert.ok(db, 'Failed to initialize database');

  // Verify pragmas
  const journalMode = db.pragma('journal_mode', { simple: true });
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  console.log(`  Pragmas: journal_mode=${journalMode}, foreign_keys=${foreignKeys}`);
  assert.strictEqual(journalMode.toLowerCase(), 'wal', 'journal_mode must be WAL');
  assert.strictEqual(foreignKeys, 1, 'foreign_keys must be 1');

  // Verify integrity
  const integrity = db.pragma('integrity_check', { simple: true });
  console.log(`  Integrity check: ${integrity}`);
  assert.strictEqual(integrity, 'ok', 'Database integrity check must be ok');

  // Verify all tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log(`  Tables created: ${tables.join(', ')}`);
  const requiredTables = ['schema_migrations', 'app_state', 'categories', 'items', 'item_details', 'torrent_metadata', 'sync_runs', 'sync_run_categories'];
  for (const table of requiredTables) {
    assert.ok(tables.includes(table), `Missing mandatory table: ${table}`);
  }
  console.log('  ✅ Fresh profile schema created and verified.');

  console.log('\n--- STEP 2: CLEAN STATE MIGRATION RUN ---');
  const cleanMigrateResult = migration.runMigration(db, tempDir);
  console.log('  Clean state migration result:', cleanMigrateResult);
  assert.strictEqual(cleanMigrateResult.migrated, false);
  assert.strictEqual(cleanMigrateResult.status, 'no_legacy_db');
  console.log('  ✅ Clean state migration handled cleanly.');

  console.log('\n--- STEP 3: CRUD REPOSITORY VALIDATION IN PACKAGED CONTEXT ---');
  categoriesRepo.upsert(db, { id: 'switch', name: 'Nintendo Switch' });
  itemsRepo.upsert(db, {
    id: '12345',
    categoryId: 'switch',
    title: 'The Legend of Zelda: Tears of the Kingdom',
    cleanTitle: 'the legend of zelda tears of the kingdom',
    contentSize: 18000000000,
    seeds: 150,
    leeches: 20
  });

  const item = itemsRepo.getById(db, '12345');
  assert.ok(item, 'Item was not inserted');
  assert.strictEqual(item.title, 'The Legend of Zelda: Tears of the Kingdom');

  favoritesRepo.setFavorite(db, '12345', true);
  assert.strictEqual(favoritesRepo.isFavorite(db, '12345'), true);

  const runId = syncHistoryRepo.createRun(db, {
    scopeType: 'ALL_ENABLED_CATEGORIES',
    categoriesTotal: 1,
    status: 'RUNNING'
  });
  syncHistoryRepo.upsertCategoryRun(db, {
    syncRunId: runId,
    categoryId: 'switch',
    categoryNameSnapshot: 'Nintendo Switch',
    status: 'COMPLETED',
    newItems: 1
  });
  syncHistoryRepo.finishRun(db, runId, {
    status: 'COMPLETED',
    newItems: 1,
    durationMs: 1250
  });

  const runsResult = syncHistoryRepo.getRuns(db, { limit: 5 });
  assert.strictEqual(runsResult.runs.length, 1);
  assert.strictEqual(runsResult.runs[0].id, runId);
  assert.strictEqual(runsResult.runs[0].status, 'COMPLETED');
  console.log('  ✅ Packaged CRUD repository operations verified.');

  dbMain.closeDatabase();
  cleanTempDir(tempDir);

  console.log('\n--- STEP 4: LEGACY V1.0.0 PROFILE MIGRATION SIMULATION ---');
  const legacyDir = createTempDir();
  const legacyDbPath = path.join(legacyDir, 'rt-library.sqlite');
  
  // Create legacy v1.0.0 database
  const Database = require(path.join(ASAR_PATH, 'node_modules', 'better-sqlite3'));
  const legacyDb = new Database(legacyDbPath);
  legacyDb.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      item_id TEXT PRIMARY KEY,
      added_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    INSERT INTO favorites (item_id, added_at) VALUES ('12345', '2026-08-15T12:00:00Z');
  `);
  legacyDb.close();

  // Initialize v2 native DB
  const migratedDb = dbMain.initDatabase(legacyDir);
  // Prepopulate item so favorite can attach
  categoriesRepo.upsert(migratedDb, { id: 'switch', name: 'Nintendo Switch' });
  itemsRepo.upsert(migratedDb, {
    id: '12345',
    categoryId: 'switch',
    title: 'The Legend of Zelda: Tears of the Kingdom',
  });

  const migrationResult = migration.runMigration(migratedDb, legacyDir);
  console.log('  Migration result:', migrationResult);
  assert.strictEqual(migrationResult.migrated, true);
  assert.strictEqual(migrationResult.appliedFavorites, 1);
  assert.strictEqual(favoritesRepo.isFavorite(migratedDb, '12345'), true);
  assert.ok(fs.existsSync(path.join(legacyDir, 'rt-library.sqlite.bak')), 'Backup file must exist');
  console.log('  ✅ Legacy migration into packaged runtime verified.');

  dbMain.closeDatabase();
  cleanTempDir(legacyDir);

  console.log('\n🎉 [SMOKE_TEST][SUCCESS] Packaged runtime smoke tests passed completely!\n');
}

runPackagedSmoke().catch((err) => {
  console.error('\n❌ [SMOKE_TEST][FAILED]:', err);
  process.exit(1);
});
