const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const Database = require('better-sqlite3');

const dbMain = require('../electron/database/dbMain.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const favoritesRepo = require('../electron/database/repositories/favoritesRepo.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const migration = require('../electron/database/migration.cjs');
const workerManager = require('../electron/indexer/workerManager.cjs');

function createTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-migration-test-'));
  return tmpDir;
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

function seedCategoryAndItem(db, categoryId, itemId, title) {
  categoriesRepo.upsert(db, {
    id: categoryId,
    name: categoryId.toUpperCase(),
  });
  itemsRepo.upsert(db, {
    id: itemId,
    categoryId: categoryId,
    title: title,
    cleanTitle: title.toLowerCase(),
  });
}

function createDummyLegacyDb(dir, options = {}) {
  const legacyPath = path.join(dir, 'rt-library.sqlite');
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
  }
  const db = new Database(legacyPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      item_id TEXT PRIMARY KEY,
      added_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  if (options.favorites) {
    const insertFav = db.prepare('INSERT INTO favorites (item_id, added_at) VALUES (?, ?)');
    for (const fav of options.favorites) {
      insertFav.run(fav.id, fav.addedAt || new Date().toISOString());
    }
  }

  db.close();
  return legacyPath;
}

async function runTests() {
  console.log('🧪 Starting PR 8 — User Data Migration & sql.js Deprecation Test Suite...\n');

  // Test 1: Absent legacy DB
  {
    console.log('Test 1: Absent legacy DB');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.migrated, false);
    assert.strictEqual(result.status, 'no_legacy_db');

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Absent legacy DB handled cleanly.');
  }

  // Test 2: Legacy DB without favorites
  {
    console.log('Test 2: Legacy DB without favorites');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');
    createDummyLegacyDb(tempDir, { favorites: [] });

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.totalLegacyFavorites, 0);
    assert.strictEqual(result.appliedFavorites, 0);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'rt-library.sqlite.bak')), true);

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Legacy DB without favorites migrated and archived.');
  }

  // Test 3: Legacy DB with normal favorites
  {
    console.log('Test 3: Legacy DB with normal favorites');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');
    createDummyLegacyDb(tempDir, {
      favorites: [{ id: 'switch-101', addedAt: '2026-09-01T10:00:00Z' }],
    });

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.totalLegacyFavorites, 1);
    assert.strictEqual(result.matchedFavorites, 1);
    assert.strictEqual(result.appliedFavorites, 1);

    const isFav = favoritesRepo.isFavorite(nativeDb, 'switch-101');
    assert.strictEqual(isFav, true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'rt-library.sqlite.bak')), true);

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Legacy favorites successfully applied to native DB.');
  }

  // Test 4: Unmatched favorites reporting
  {
    console.log('Test 4: Unmatched favorites reporting');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');

    createDummyLegacyDb(tempDir, {
      favorites: [
        { id: 'switch-101', addedAt: '2026-09-01T10:00:00Z' },
        { id: 'non-existent-999', addedAt: '2026-09-01T11:00:00Z' },
      ],
    });

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.totalLegacyFavorites, 2);
    assert.strictEqual(result.matchedFavorites, 1);
    assert.strictEqual(result.unmatchedFavorites, 1);
    assert.strictEqual(result.appliedFavorites, 1);

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Unmatched favorites reported accurately without error.');
  }

  // Test 5: Migration idempotency
  {
    console.log('Test 5: Migration idempotency');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');

    createDummyLegacyDb(tempDir, {
      favorites: [{ id: 'switch-101' }],
    });

    const run1 = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(run1.migrated, true);

    const run2 = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(run2.migrated, false);
    assert.strictEqual(run2.status, 'no_legacy_db');

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Idempotency verified on second migration run.');
  }

  // Test 6: Empty native DB (pending state)
  {
    console.log('Test 6: Empty native DB (pending state)');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    createDummyLegacyDb(tempDir, {
      favorites: [{ id: 'switch-101' }],
    });

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.status, 'pending');
    assert.strictEqual(result.migrated, false);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'rt-library.sqlite')), true);

    // Now populate native DB and run migration again
    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');

    const secondRun = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(secondRun.migrated, true);
    assert.strictEqual(secondRun.appliedFavorites, 1);

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Pending migration state honored when native DB is empty.');
  }

  // Test 7: Corrupted legacy DB error handling
  {
    console.log('Test 7: Corrupted legacy DB error handling');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');

    // Write garbage binary data to legacy DB path
    const legacyPath = path.join(tempDir, 'rt-library.sqlite');
    fs.writeFileSync(legacyPath, Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55]));

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.migrated, false);
    assert.strictEqual(fs.existsSync(legacyPath), true); // Legacy file must remain untouched!

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Corrupted legacy DB handled safely without file deletion.');
  }

  // Test 8: Corrupted native DB error handling
  {
    console.log('Test 8: Corrupted native DB error handling');
    const tempDir = createTempDir();

    createDummyLegacyDb(tempDir, {
      favorites: [{ id: 'switch-101' }],
    });

    const result = migration.runMigration(null, tempDir);
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.migrated, false);

    removeTempDir(tempDir);
    console.log('  ✅ Passed: Null/corrupted native DB connection handled safely.');
  }

  // Test 9: Archive filename collision protection (.bak.1)
  {
    console.log('Test 9: Archive filename collision protection (.bak.1)');
    const tempDir = createTempDir();
    const nativeDb = dbMain.initDatabase(tempDir);

    seedCategoryAndItem(nativeDb, 'switch', 'switch-101', 'Zelda BOTW');

    // Pre-create existing .bak file
    const bakPath = path.join(tempDir, 'rt-library.sqlite.bak');
    fs.writeFileSync(bakPath, 'existing backup file content');

    createDummyLegacyDb(tempDir, {
      favorites: [{ id: 'switch-101' }],
    });

    const result = migration.runMigration(nativeDb, tempDir);
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.archivedPath, path.join(tempDir, 'rt-library.sqlite.bak.1'));
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'rt-library.sqlite.bak.1')), true);
    assert.strictEqual(fs.readFileSync(bakPath, 'utf-8'), 'existing backup file content');

    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Backup filename collision protection (.bak.1) verified.');
  }

  // Test 10: Favorite survives worker re-index
  {
    console.log('Test 10: Favorite survives worker re-index');
    const tempDir = createTempDir();
    const catalogDir = path.join(tempDir, 'catalogs');
    fs.mkdirSync(catalogDir, { recursive: true });

    // Create small catalog JSON file
    const sampleCatalog = [
      {
        id: "101",
        title: "Super Mario Odyssey (Switch)",
        genre: "Platformer",
        magnet: "magnet:?xt=urn:btih:1111111111111111111111111111111111111111"
      }
    ];
    fs.writeFileSync(path.join(catalogDir, 'switch.json'), JSON.stringify(sampleCatalog, null, 2));

    const nativeDb = dbMain.initDatabase(tempDir);

    // Initial worker background index
    await workerManager.indexLibraryBackground(nativeDb, { libraryPath: catalogDir, force: true });

    const itemId = '101';
    favoritesRepo.setFavorite(nativeDb, itemId, true);
    assert.strictEqual(favoritesRepo.isFavorite(nativeDb, itemId), true);

    // Re-run worker background index
    await workerManager.indexLibraryBackground(nativeDb, { libraryPath: catalogDir, force: true });

    // Verify favorite survived worker re-index
    assert.strictEqual(favoritesRepo.isFavorite(nativeDb, itemId), true);

    workerManager.terminateWorker();
    dbMain.closeDatabase();
    removeTempDir(tempDir);
    console.log('  ✅ Passed: Favorites survive background worker re-indexing.');
  }

  console.log('\n🎉 ALL 10 MIGRATION TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ MIGRATION TEST SUITE FAILED:', err);
  process.exit(1);
});
