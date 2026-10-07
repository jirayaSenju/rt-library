/**
 * Test Suite for Background Indexer Worker (PR 7)
 * Tests workerProtocol, utilityProcess fork, worker isolation (NO SQLite in worker),
 * streaming batch delivery to Main, change detection, broken JSON handling,
 * worker crash recovery, duplicate refresh guard, and concurrent WAL reads during background writes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { initializeSchema } = require('../electron/database/schema.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const dbMain = require('../electron/database/dbMain.cjs');
const workerManager = require('../electron/indexer/workerManager.cjs');

console.log("================================================================================");
console.log("          RT-LIBRARY BACKGROUND WORKER INDEXER TEST SUITE (PR 7)");
console.log("================================================================================");

const catalogDataDir = process.argv[2] || path.join(__dirname, '..', 'data');
if (!fs.existsSync(catalogDataDir)) {
  console.error(`❌ Data directory not found: ${catalogDataDir}`);
  process.exit(1);
}

const catalogFiles = fs.readdirSync(catalogDataDir).filter(file => file.endsWith('.json'));
const expectedCounts = Object.fromEntries(catalogFiles.map(file => {
  const json = JSON.parse(fs.readFileSync(path.join(catalogDataDir, file), 'utf8'));
  const items = Array.isArray(json) ? json : json.items;
  if (!Array.isArray(items)) throw new Error(`Invalid test catalog: ${file}`);
  return [file, items.length];
}));
const expectedTotal = Object.values(expectedCounts).reduce((total, count) => total + count, 0);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-worker-test-'));
console.log(`\n📁 Catalog Data Path: ${catalogDataDir}`);
console.log(`📁 Temporary Test Directory: ${tmpDir}`);

const db = dbMain.initDatabase(tmpDir);

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

async function runTests() {
  try {
    // ---------------------------------------------------------------------------
    // Test 1: Small Category Background Indexing (ps2.json)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 1: Small Category Background Indexing (ps2.json) ---');
    const ps2Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps2-worker-test-'));
    fs.copyFileSync(path.join(catalogDataDir, 'ps2.json'), path.join(ps2Dir, 'ps2.json'));

    const ps2Summary = await workerManager.indexLibraryBackground(db, {
      libraryPath: ps2Dir,
      force: true,
    });

    assert(ps2Summary.importedCategories === 1, 'ps2.json category imported via worker');
    assert(ps2Summary.totalItems === expectedCounts['ps2.json'], 'ps2.json imported the source catalog item count');
    assert(categoriesRepo.getById(db, 'ps2').item_count === expectedCounts['ps2.json'], 'Category ps2 metadata item_count matches source catalog');
    assert(itemsRepo.countByCategory(db, 'ps2') === expectedCounts['ps2.json'], 'itemsRepo returns the expected first page for ps2');
    fs.rmSync(ps2Dir, { recursive: true, force: true });

    // ---------------------------------------------------------------------------
    // Test 2: Large Category Ingestion (switch.json)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 2: Large Category Ingestion (switch.json) ---');
    const switchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-worker-test-'));
    fs.copyFileSync(path.join(catalogDataDir, 'switch.json'), path.join(switchDir, 'switch.json'));

    let progressEventCount = 0;
    const removeListener = workerManager.addProgressListener((data) => {
      if (data.status === 'indexing') {
        progressEventCount++;
      }
    });

    const switchSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: switchDir,
      force: true,
      batchSize: 500,
    });

    removeListener();

    assert(switchSummary.importedCategories === 1, 'switch.json category imported cleanly');
    assert(switchSummary.totalItems === expectedCounts['switch.json'], 'switch.json imported the source catalog item count');
    assert(categoriesRepo.getById(db, 'switch').item_count === expectedCounts['switch.json'], 'Category switch metadata item_count matches source catalog');
    assert(progressEventCount > 0, 'Progress listener received streaming progress updates');
    fs.rmSync(switchDir, { recursive: true, force: true });

    // ---------------------------------------------------------------------------
    // Test 3: Full Catalog Background Indexing (all source catalogs)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 3: Full Catalog Background Indexing ---');
    const fullSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: true,
    });

    assert(fullSummary.importedCategories === catalogFiles.length, 'Full background indexing imported 16 categories');
    assert(fullSummary.totalItems === expectedTotal, 'Full background indexing loaded the source catalog total');
    assert(fullSummary.failedCategories === 0, 'Zero category failures in full import');

    // ---------------------------------------------------------------------------
    // Test 4: Incremental Change Detection (0 Files Reprocessed)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 4: Incremental Change Detection ---');
    const skipSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: false,
    });

    assert(skipSummary.importedCategories === 0, 'Unchanged catalog import imported 0 categories');
    assert(skipSummary.skippedCategories === catalogFiles.length, 'Unchanged catalog import skipped all 16 categories');

    // ---------------------------------------------------------------------------
    // Test 5: Force Re-Indexing (force = true)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 5: Force Re-Indexing ---');
    const forceSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: true,
    });

    assert(forceSummary.importedCategories === catalogFiles.length, 'Force re-import reprocessed all 16 categories');

    // ---------------------------------------------------------------------------
    // Test 6: Broken JSON Error Handling in Worker
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 6: Broken JSON Error Handling in Worker ---');
    const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-worker-test-'));
    fs.writeFileSync(path.join(brokenDir, 'broken.json'), '{ invalid_json_content');
    fs.writeFileSync(path.join(brokenDir, 'valid.json'), JSON.stringify({
      category: { id: 'valid_cat', name: 'Valid Category' },
      items: [{ id: 'v1', title: 'Valid Game' }],
    }));

    const brokenSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: brokenDir,
      force: true,
    });

    assert(brokenSummary.importedCategories === 1, 'Valid category in broken dir imported');
    assert(brokenSummary.failedCategories === 1, 'Broken JSON recorded 1 category failure in summary');
    assert(categoriesRepo.getById(db, 'broken') === null, 'Failed broken category metadata was not updated to success');
    fs.rmSync(brokenDir, { recursive: true, force: true });

    // ---------------------------------------------------------------------------
    // Test 7: Worker Crash Recovery
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 7: Worker Crash Recovery ---');
    // Terminate worker child explicitly to simulate crash/kill
    workerManager.terminateWorker();
    const stateAfterKill = workerManager.getIndexingState();
    assert(stateAfterKill.isIndexing === false, 'Worker termination reset isIndexing to false');

    // Re-run indexing to ensure worker automatically re-spawns cleanly
    const respawnSummary = await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: false,
    });
    assert(respawnSummary.skippedCategories === catalogFiles.length, 'Worker automatically re-spawned cleanly after termination');

    // ---------------------------------------------------------------------------
    // Test 8: Duplicate Refresh Guard
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 8: Duplicate Refresh Guard ---');
    const firstPromise = workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: true,
    });

    const secondRes = await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: true,
    });

    assert(secondRes.status === 'already_indexing', 'Duplicate refresh request returned status "already_indexing"');
    await firstPromise;

    // ---------------------------------------------------------------------------
    // Test 9: Progress Listener Unsubscribe (Zero Memory Leaks)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 9: Progress Listener Unsubscribe ---');
    let listenerCalled = false;
    const unsub = workerManager.addProgressListener(() => {
      listenerCalled = true;
    });
    unsub();

    await workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: false,
    });
    assert(listenerCalled === false, 'Unsubscribed progress listener was not invoked (zero memory leak)');

    // ---------------------------------------------------------------------------
    // Test 10: Concurrent Queries During Background Writes (WAL Mode Verification)
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 10: Concurrent Queries During Background Writes ---');
    const bgIndexPromise = workerManager.indexLibraryBackground(db, {
      libraryPath: catalogDataDir,
      force: true,
    });

    let queryCount = 0;
    let queryFailures = 0;
    const tQueryStart = performance.now();

    while (workerManager.getIndexingState().isIndexing) {
      try {
        const catRes = categoriesRepo.getAll(db);
        const itemRes = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 50, offset: 0 });
        if (catRes && itemRes) {
          queryCount++;
        }
      } catch (err) {
        queryFailures++;
        console.error('[WAL_TEST][ERROR] Read query failed during background write:', err.message);
      }
      // Small tick delay
      await new Promise(r => setTimeout(r, 10));
    }

    await bgIndexPromise;
    const queryDuration = performance.now() - tQueryStart;

    assert(queryCount > 0, `Executed ${queryCount} concurrent read queries during background indexing`);
    assert(queryFailures === 0, 'Zero SQLITE_BUSY or query lock failures during background writes');
    console.log(`  ⚡ Concurrent WAL Query Performance: ${queryCount} read queries completed in ${queryDuration.toFixed(1)}ms while worker inserted ${expectedTotal.toLocaleString()} items`);

    // ---------------------------------------------------------------------------
    // Test 11: Database Integrity & Foreign Key Checks
    // ---------------------------------------------------------------------------
    console.log('\n--- Test 11: Database Integrity & Foreign Key Checks ---');
    const integrityResult = db.pragma('integrity_check', { simple: true });
    assert(integrityResult === 'ok', 'PRAGMA integrity_check = ok');

    const fkResult = db.pragma('foreign_key_check');
    assert(Array.isArray(fkResult) && fkResult.length === 0, 'PRAGMA foreign_key_check is clean (0 errors)');

    console.log(`\n================================================================================`);
    console.log(`           TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log(`================================================================================`);

  } finally {
    workerManager.terminateWorker();
    dbMain.closeDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
