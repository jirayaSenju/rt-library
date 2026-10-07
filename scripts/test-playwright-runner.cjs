/**
 * Test Suite for Playwright Scraper Runner (Stage 1)
 * Tests CLI parsing, catalog validation, atomic export, data directory resolution, and lock file.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { parseArgs, acquireLock } = require('../scraper/runner.cjs');
const { resolveDataDir, validateCatalog, writeAtomicJson, exportCatalogsAtomic } = require('../scraper/exportCatalogs.cjs');
const { getConsoleScriptPath } = require('../scraper/scraperBridge.cjs');
const { getScraperProfileDir } = require('../scraper/browser.cjs');

console.log('================================================================================');
console.log('       PLAYWRIGHT SCRAPER RUNNER TEST SUITE (STAGE 1)');
console.log('================================================================================\n');

let testsPassed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Test 1: CLI Argument Parsing
runTest('CLI Argument Parsing (--login, --full, --refresh-screenshots, --category)', () => {
  const origArgv = process.argv;
  process.argv = ['node', 'runner.cjs', '--login', '--full', '--refresh-screenshots', '--category', 'switch', '--data-dir', '/tmp/test-data'];

  const opts = parseArgs();
  assert.strictEqual(opts.login, true);
  assert.strictEqual(opts.full, true);
  assert.strictEqual(opts.refreshScreenshots, true);
  assert.strictEqual(opts.category, 'switch');
  assert.strictEqual(opts.dataDir, '/tmp/test-data');

  process.argv = origArgv;
});

// Test 2: Console Script Path Resolution
runTest('Console Script Path Resolution (scripts/console.js)', () => {
  const scriptPath = getConsoleScriptPath();
  assert.strictEqual(fs.existsSync(scriptPath), true);
  assert.strictEqual(scriptPath.endsWith('console.js'), true);
});

// Test 3: Profile Directory Resolution
runTest('Profile Directory Resolution (userData/scraper-profile outside repo)', () => {
  const profileDir = getScraperProfileDir();
  assert.ok(profileDir && typeof profileDir === 'string');
  assert.strictEqual(profileDir.includes('scraper-profile'), true);
});

// Test 4: Catalog Sanity Validator
runTest('Catalog Sanity Validator (detects invalid schema & empty category exports)', () => {
  const validCat = { id: 'switch', schemaVersion: 2, items: [{ id: 'topic_123', title: 'Test Game' }] };
  const val1 = validateCatalog(validCat);
  assert.strictEqual(val1.valid, true);

  const invalidCat = { id: 'switch', items: 'not-an-array' };
  const val2 = validateCatalog(invalidCat);
  assert.strictEqual(val2.valid, false);

  const tmpTestDir = path.join(os.tmpdir(), `rt-test-cat-${Date.now()}`);
  fs.mkdirSync(tmpTestDir, { recursive: true });
  const existingFile = path.join(tmpTestDir, 'switch.json');
  fs.writeFileSync(existingFile, JSON.stringify({ id: 'switch', items: [{ id: 'topic_1' }] }), 'utf8');

  const emptyCat = { id: 'switch', items: [] };
  const val3 = validateCatalog(emptyCat, existingFile);
  assert.strictEqual(val3.valid, false);
  assert.strictEqual(val3.reason.includes('EXPORT_REJECTED_EMPTY_CATEGORY'), true);

  fs.rmSync(tmpTestDir, { recursive: true, force: true });
});

// Test 5: Atomic JSON File Writer
runTest('Atomic JSON File Writer (writes to .tmp and renames atomically)', () => {
  const tmpDir = path.join(os.tmpdir(), `rt-atomic-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const targetFile = path.join(tmpDir, 'test_cat.json');

  const testData = { id: 'test_cat', schemaVersion: 2, items: [{ id: '1', title: 'Item 1' }] };
  writeAtomicJson(targetFile, testData);

  assert.strictEqual(fs.existsSync(targetFile), true);
  assert.strictEqual(fs.existsSync(`${targetFile}.tmp`), false);

  const readBack = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
  assert.strictEqual(readBack.id, 'test_cat');
  assert.strictEqual(readBack.items.length, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Test 6: Atomic Export Manager
runTest('Atomic Export Manager (exports catalogs to target data dir)', () => {
  const tmpDataDir = path.join(os.tmpdir(), `rt-export-test-${Date.now()}`);
  const catalogs = [
    { id: 'psx', schemaVersion: 2, items: [{ id: 't1', title: 'PS1 Game' }] },
    { id: 'ps2', schemaVersion: 2, items: [{ id: 't2', title: 'PS2 Game' }] },
  ];

  const result = exportCatalogsAtomic(catalogs, { dataDir: tmpDataDir });
  assert.strictEqual(result.exported.length, 2);
  assert.strictEqual(result.rejected.length, 0);

  assert.strictEqual(fs.existsSync(path.join(tmpDataDir, 'psx.json')), true);
  assert.strictEqual(fs.existsSync(path.join(tmpDataDir, 'ps2.json')), true);

  fs.rmSync(tmpDataDir, { recursive: true, force: true });
});

// Test 7: Scraper Lock File
runTest('Scraper Lock File (prevents concurrent execution)', () => {
  const lockFile = path.resolve(__dirname, '../scraper.lock');
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const release1 = acquireLock();
  assert.strictEqual(fs.existsSync(lockFile), true);

  assert.throws(() => {
    acquireLock();
  }, /SCRAPER_LOCKED/);

  release1();
  assert.strictEqual(fs.existsSync(lockFile), false);
});

console.log(`\nRESULTS: ${testsPassed}/7 tests passed.`);
console.log('================================================================================\n');
