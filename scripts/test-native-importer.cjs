/**
 * Automated Test Runner & Benchmark for PR 5 Native JSON Importer
 * Usage: node scripts/test-native-importer.cjs [/path/to/data]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { initializeSchema } = require('../electron/database/schema.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const detailsRepo = require('../electron/database/repositories/detailsRepo.cjs');
const favoritesRepo = require('../electron/database/repositories/favoritesRepo.cjs');
const { importLibrary } = require('../electron/indexer/importer.cjs');

function resolveHome(p) {
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const defaultDataDirs = [
  process.argv[2] ? resolveHome(process.argv[2]) : null,
  path.join(__dirname, '../data'),
  resolveHome('~/Documents/projects/ecohub-app/data'),
  resolveHome('~/Documents/projects/rt-library/data'),
].filter(Boolean);

let dataDir = null;
for (const dir of defaultDataDirs) {
  if (fs.existsSync(dir)) {
    dataDir = dir;
    break;
  }
}

console.log("================================================================================");
console.log("          RT-LIBRARY NATIVE IMPORTER TEST SUITE (PR 5)");
console.log("================================================================================");

if (!dataDir) {
  console.error("❌ Catalog data directory not found.");
  console.error("   Usage: node scripts/test-native-importer.cjs /path/to/catalog/data");
  process.exit(1);
}

console.log(`\n📁 Catalog Path: ${dataDir}`);

const catalogFiles = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
const expectedCounts = Object.fromEntries(catalogFiles.map(file => {
  const json = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const items = Array.isArray(json) ? json : json.items;
  if (!Array.isArray(items)) throw new Error(`Invalid test catalog: ${file}`);
  return [file, items.length];
}));
const expectedTotal = Object.values(expectedCounts).reduce((total, count) => total + count, 0);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-importer-test-'));
const testDbPath = path.join(tmpDir, 'test-rt-library-v2.sqlite');

console.log(`📁 Test Database: ${testDbPath}`);
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

initializeSchema(db);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

try {
  // ---------------------------------------------------------------------------
  // Test 1: Small Category Import (ps2.json)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 1: Small Category Import (ps2.json) ---');
  const ps2Path = path.join(dataDir, 'ps2.json');
  if (fs.existsSync(ps2Path)) {
    const ps2TmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps2-test-'));
    fs.copyFileSync(ps2Path, path.join(ps2TmpDir, 'ps2.json'));

    const resPs2 = importLibrary(db, { libraryPath: ps2TmpDir });
    assert(resPs2.importedCategories === 1, 'ps2.json category imported');
    assert(resPs2.totalItems === expectedCounts['ps2.json'], 'ps2.json imported the source catalog item count');

    const catPs2 = categoriesRepo.getById(db, 'ps2');
    assert(catPs2 !== null && catPs2.item_count === expectedCounts['ps2.json'], 'Category ps2 metadata item_count matches source catalog');

    const ps2Items = itemsRepo.getPaginated(db, { categoryId: 'ps2', limit: 100 });
    assert(ps2Items.items.length === Math.min(100, expectedCounts['ps2.json']), 'itemsRepo returns the expected first page for ps2');

    fs.rmSync(ps2TmpDir, { recursive: true, force: true });
  } else {
    console.log('  ⚠️ ps2.json not found in data dir, skipping small category test');
  }

  // ---------------------------------------------------------------------------
  // Test 2: Switch Import (switch.json)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Switch Import (switch.json) ---');
  const switchPath = path.join(dataDir, 'switch.json');
  if (fs.existsSync(switchPath)) {
    const switchTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-test-'));
    fs.copyFileSync(switchPath, path.join(switchTmpDir, 'switch.json'));

    const resSwitch = importLibrary(db, { libraryPath: switchTmpDir });
    assert(resSwitch.importedCategories === 1, 'switch.json category imported');
    assert(resSwitch.totalItems === expectedCounts['switch.json'], 'switch.json imported the source catalog item count cleanly');

    const catSwitch = categoriesRepo.getById(db, 'switch');
    assert(catSwitch.item_count === expectedCounts['switch.json'], 'Category switch metadata item_count matches source catalog');

    const switchItems = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 100 });
    assert(switchItems.total === expectedCounts['switch.json'], 'itemsRepo getPaginated total reports the source catalog item count');

    fs.rmSync(switchTmpDir, { recursive: true, force: true });
  } else {
    console.log('  ⚠️ switch.json not found in data dir, skipping switch import test');
  }

  // ---------------------------------------------------------------------------
  // Test 3: Full Catalog Import (All 16 Files)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Full Catalog Import ---');
  const resFull = importLibrary(db, { libraryPath: dataDir, force: true });
  assert(resFull.totalFiles === catalogFiles.length, 'Full import scanned 16 JSON files');
  assert(resFull.importedCategories === catalogFiles.length, 'Full import imported 16 categories');
  assert(resFull.failedCategories === 0, 'Zero category import failures');
  assert(resFull.totalItems === expectedTotal, 'Full import loaded the source catalog total');
  const { uniqueScreenshotUrls } = require('./load-typescript.cjs')('src/services/screenshotResolver.ts');
  const screenshotRows = new Map(db.prepare('SELECT item_id, screenshots_json FROM item_details').all().map(row => [row.item_id, JSON.parse(row.screenshots_json || '[]')]));
  const screenshotMismatches = [];
  for (const filename of catalogFiles) {
    const json = JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));
    for (const raw of Array.isArray(json) ? json : json.items) {
      const id = raw.id || (raw.topicId ? `topic_${raw.topicId}` : null);
      const expected = uniqueScreenshotUrls(raw.content?.screenshots ?? raw.screenshots ?? []);
      const stored = screenshotRows.get(id);
      if (!stored || stored.length !== expected.length) screenshotMismatches.push(id);
    }
  }
  assert(screenshotMismatches.length === 0, 'Every source item preserves its unique screenshot count in SQLite');


  // ---------------------------------------------------------------------------
  // Test 4: Skip Test (Incremental Change Detection)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Skip Test (Incremental Change Detection) ---');
  const resSkip = importLibrary(db, { libraryPath: dataDir, force: false });
  assert(resSkip.importedCategories === 0, 'Unchanged catalog import imported 0 categories');
  assert(resSkip.skippedCategories === catalogFiles.length, 'Unchanged catalog import skipped all 16 categories');

  // ---------------------------------------------------------------------------
  // Test 5: Force Test (force = true)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Force Test (force = true) ---');
  const resForce = importLibrary(db, { libraryPath: dataDir, force: true });
  assert(resForce.importedCategories === catalogFiles.length, 'Force re-import reprocessed all 16 categories');

  // ---------------------------------------------------------------------------
  // Test 6: Single File Change Detection
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Single File Change Detection ---');
  db.prepare("UPDATE categories SET file_mtime = 0 WHERE id = 'psx'").run();
  const resSingleChange = importLibrary(db, { libraryPath: dataDir, force: false });
  assert(resSingleChange.importedCategories === 1, 'Only modified category (psx) was re-imported');
  assert(resSingleChange.skippedCategories === catalogFiles.length - 1, 'Remaining 15 categories were skipped');

  // ---------------------------------------------------------------------------
  // Test 7: Favorite Preservation on Re-Import
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Favorite Preservation on Re-Import ---');
  const pageSwitch = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 1 });
  const sampleItemId = pageSwitch.items[0].id;

  favoritesRepo.setFavorite(db, sampleItemId, true);
  assert(favoritesRepo.isFavorite(db, sampleItemId) === true, `Marked item ${sampleItemId} as favorite`);

  // Force re-import catalog
  importLibrary(db, { libraryPath: dataDir, force: true });
  assert(favoritesRepo.isFavorite(db, sampleItemId) === true, 'CRITICAL PASSED: User favorite flag preserved after full force re-import');

  // ---------------------------------------------------------------------------
  // Test 8: Broken JSON Error Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Broken JSON Error Handling ---');
  const brokenTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-test-'));
  fs.writeFileSync(path.join(brokenTmpDir, 'valid.json'), JSON.stringify({ category: { id: 'valid', name: 'Valid' }, items: [{ title: 'Valid Game' }] }));
  fs.writeFileSync(path.join(brokenTmpDir, 'broken.json'), '{invalid_json_content');

  const resBroken = importLibrary(db, { libraryPath: brokenTmpDir });
  assert(resBroken.importedCategories === 1, 'Valid category in broken dir imported successfully');
  assert(resBroken.failedCategories === 1, 'Broken JSON recorded 1 category failure without process crash');

  const catBroken = categoriesRepo.getById(db, 'broken');
  assert(catBroken === null, 'Failed broken category metadata was not updated as success');

  fs.rmSync(brokenTmpDir, { recursive: true, force: true });

  // ---------------------------------------------------------------------------
  // Test 9: Database Integrity Check & Size Metrics
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 9: Database Integrity Check & Size Metrics ---');
  const integrity = db.pragma('integrity_check', { simple: true });
  assert(integrity === 'ok', 'PRAGMA integrity_check = ok');

  const fkCheck = db.pragma('foreign_key_check');
  assert(fkCheck.length === 0, 'PRAGMA foreign_key_check is clean (0 errors)');

  const mainDbStat = fs.statSync(testDbPath);
  const walPath = `${testDbPath}-wal`;
  const walStat = fs.existsSync(walPath) ? fs.statSync(walPath) : { size: 0 };

  console.log(`  💾 Native SQLite DB File Size: ${(mainDbStat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  💾 SQLite WAL File Size: ${(walStat.size / 1024 / 1024).toFixed(2)} MB`);

  // ---------------------------------------------------------------------------
  // Batch Size Benchmark Comparison (250 vs 500 vs 1000 items)
  // ---------------------------------------------------------------------------
  console.log('\n--- Batch Size Benchmark Comparison ---');
  for (const bSize of [250, 500, 1000]) {
    const tBenchStart = performance.now();
    importLibrary(db, { libraryPath: dataDir, force: true, batchSize: bSize });
    const bDuration = performance.now() - tBenchStart;
    const itemsPerSec = Math.round((expectedTotal / bDuration) * 1000);
    console.log(`  ⚡ Batch Size ${bSize}: ${expectedTotal.toLocaleString()} items imported in ${(bDuration / 1000).toFixed(2)}s (${itemsPerSec.toLocaleString()} items/sec)`);
  }

  console.log(`\n================================================================================`);
  console.log(`           TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`================================================================================`);
} finally {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
