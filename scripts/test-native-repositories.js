#!/usr/bin/env node
/**
 * Test Suite for Native SQLite Repositories (PR 4)
 * Runs against a temporary isolated SQLite database.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { initializeSchema, SCHEMA_VERSION } = require('../electron/database/schema.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const detailsRepo = require('../electron/database/repositories/detailsRepo.cjs');
const favoritesRepo = require('../electron/database/repositories/favoritesRepo.cjs');

console.log("================================================================================");
console.log("          RT-LIBRARY NATIVE REPOSITORIES TEST SUITE (PR 4)");
console.log("================================================================================");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lib-test-'));
const testDbPath = path.join(tmpDir, 'test-rt-library-v2.sqlite');

console.log(`\n📁 Temporary Test DB: ${testDbPath}`);
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

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
  // Test 1: Schema Initialization & Idempotency
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 1: Schema Initialization & Idempotency ---');
  const schemaRes1 = initializeSchema(db);
  const version1 = db.pragma('user_version', { simple: true });
  assert(version1 === SCHEMA_VERSION, `Schema user_version is ${SCHEMA_VERSION}`);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").pluck().all();
  assert(tables.includes('categories'), 'Table categories exists');
  assert(tables.includes('items'), 'Table items exists');
  assert(tables.includes('item_details'), 'Table item_details exists');

  const fkStatus = db.pragma('foreign_keys', { simple: true });
  assert(fkStatus === 1, 'Foreign keys are enabled (ON)');

  // Test idempotency
  const schemaRes2 = initializeSchema(db);
  assert(schemaRes2.version === SCHEMA_VERSION, 'Re-running initializeSchema() is idempotent');

  // ---------------------------------------------------------------------------
  // Test 2: Categories Repository
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Categories Repository ---');
  categoriesRepo.upsert(db, {
    id: 'switch',
    name: 'Nintendo Switch',
    baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605',
    titleSearch: ['[Nintendo Switch]', '[Switch]'],
    filePath: '/data/switch.json',
    itemCount: 100,
    fileMtime: 1700000000000,
    fileSize: 50000000,
  });

  const catSwitch = categoriesRepo.getById(db, 'switch');
  assert(catSwitch !== null && catSwitch.id === 'switch', 'Category switch fetched correctly');
  assert(catSwitch.name === 'Nintendo Switch', 'Category name matches');
  assert(catSwitch.item_count === 100, 'Category item_count matches');

  const allCats = categoriesRepo.getAll(db);
  assert(allCats.length === 1 && allCats[0].id === 'switch', 'getAll() returns 1 category');

  categoriesRepo.updateIndexMetadata(db, 'switch', { itemCount: 250 });
  const catUpdated = categoriesRepo.getById(db, 'switch');
  assert(catUpdated.item_count === 250, 'updateIndexMetadata updated item_count to 250');

  // Add dummy category for delete test
  categoriesRepo.upsert(db, { id: 'dummy', name: 'Dummy Platform' });
  assert(categoriesRepo.getById(db, 'dummy') !== null, 'Dummy category created');
  categoriesRepo.remove(db, 'dummy');
  assert(categoriesRepo.getById(db, 'dummy') === null, 'Dummy category removed');

  // ---------------------------------------------------------------------------
  // Test 3: Item & Details Repository
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Item & Details Repository ---');
  itemsRepo.upsert(db, {
    id: 'item_switch_001',
    categoryId: 'switch',
    source: 'rutracker',
    topicId: '123456',
    title: '[Nintendo Switch] Super Mario Odyssey [NSW]',
    cleanTitle: 'Super Mario Odyssey',
    titleSort: 'super mario odyssey',
    genre: 'Platformer, Action',
    developer: 'Nintendo',
    publisher: 'Nintendo',
    releaseYear: 2017,
    coverUrl: 'https://example.com/mario.jpg',
    sizeStr: '5.6 GB',
    sizeBytes: 6012954214,
    discoveredAt: '2026-01-01T10:00:00.000Z',
    details: {
      magnet: 'magnet:?xt=urn:btih:mario123',
      fileList: ['Mario.nsp', 'Update.nsp'],
      screenshots: ['https://example.com/ss1.jpg', 'https://example.com/ss2.jpg'],
      source: { forumId: '1605' },
    },
  });

  const itemMario = itemsRepo.getById(db, 'item_switch_001');
  assert(itemMario !== null && itemMario.cleanTitle === 'Super Mario Odyssey', 'Item Mario fetched correctly');
  assert(itemMario.hasCover === true, 'Item hasCover flag is true');
  assert(itemMario.hasMagnet === true, 'Item hasMagnet flag is true');
  assert(itemMario.hasScreenshots === true, 'Item hasScreenshots flag is true');

  const marioDetails = detailsRepo.getByItemId(db, 'item_switch_001');
  assert(marioDetails !== null && marioDetails.magnet === 'magnet:?xt=urn:btih:mario123', 'Details magnet fetched correctly');
  assert(Array.isArray(marioDetails.fileList) && marioDetails.fileList.length === 2, 'Details fileList array parsed correctly');
  assert(Array.isArray(marioDetails.screenshots) && marioDetails.screenshots.length === 2, 'Details screenshots array parsed correctly');

  // ---------------------------------------------------------------------------
  // Test 4: Favorite Preservation on Re-UPSERT (CRITICAL REQUIREMENT)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Favorite Preservation on Re-UPSERT ---');
  favoritesRepo.setFavorite(db, 'item_switch_001', true);
  assert(favoritesRepo.isFavorite(db, 'item_switch_001') === true, 'Favorite set to true');

  // Re-upsert item as if catalog scraper updated
  itemsRepo.upsert(db, {
    id: 'item_switch_001',
    categoryId: 'switch',
    title: '[Nintendo Switch] Super Mario Odyssey [NSW] [v1.3.0]',
    cleanTitle: 'Super Mario Odyssey',
    sizeStr: '5.8 GB',
    isFavorite: false, // Scraper defaults to false
  });

  const itemReUpserted = itemsRepo.getById(db, 'item_switch_001');
  assert(itemReUpserted.isFavorite === true, 'CRITICAL PASSED: Favorite flag remains TRUE after catalog re-upsert');

  // ---------------------------------------------------------------------------
  // Test 5: Batch UPSERT Performance & Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Batch UPSERT Performance & Integrity ---');
  const batch1000 = [];
  for (let i = 1; i <= 1000; i++) {
    batch1000.push({
      id: `item_switch_${String(i).padStart(4, '0')}`,
      categoryId: 'switch',
      source: 'rutracker',
      topicId: String(200000 + i),
      title: `Game Title ${i}`,
      cleanTitle: `Game Title ${i}`,
      titleSort: `game title ${String(i).padStart(4, '0')}`,
      genre: i % 2 === 0 ? 'Action' : 'RPG',
      releaseYear: 2010 + (i % 14),
      sizeBytes: i * 1048576,
      discoveredAt: new Date(1700000000000 + i * 1000).toISOString(),
      details: {
        magnet: `magnet:?xt=urn:btih:hash${i}`,
        fileList: [`Game_${i}.iso`],
        screenshots: [`https://example.com/ss_${i}.jpg`],
      },
    });
  }

  const tBatchStart = performance.now();
  const insertedCount = itemsRepo.upsertBatch(db, batch1000);
  const batchDuration = performance.now() - tBatchStart;

  assert(insertedCount === 1000, 'upsertBatch inserted 1,000 items');
  const itemsPerSec = Math.round((1000 / batchDuration) * 1000);
  console.log(`  ⚡ Batch Throughput: 1,000 items inserted in ${batchDuration.toFixed(1)}ms (${itemsPerSec.toLocaleString()} items/sec)`);

  const totalInDb = itemsRepo.countByCategory(db, 'switch');
  assert(totalInDb === 1000, 'Database contains 1,000 items in switch category');

  // ---------------------------------------------------------------------------
  // Test 6: Pagination Integrity
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Pagination Integrity ---');
  const page1 = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 100, offset: 0, sortBy: 'title', sortOrder: 'asc' });
  assert(page1.items.length === 100, 'Page 1 returns 100 items');
  assert(page1.total === 1000, 'Page 1 reports 1,000 total items');
  assert(page1.hasMore === true, 'Page 1 reports hasMore = true');
  assert(page1.items[0].cleanTitle === 'Game Title 1', 'Page 1 first item is Game Title 1');

  const page2 = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 100, offset: 100, sortBy: 'title', sortOrder: 'asc' });
  assert(page2.items.length === 100, 'Page 2 returns 100 items');
  assert(page2.items[0].cleanTitle === 'Game Title 101', 'Page 2 first item is Game Title 101');

  // Verify zero overlap between page 1 and page 2
  const p1Ids = new Set(page1.items.map(i => i.id));
  const hasDuplicates = page2.items.some(i => p1Ids.has(i.id));
  assert(!hasDuplicates, 'Zero ID duplicates between Page 1 and Page 2');

  // Test category "all" logical view
  const pageAll = itemsRepo.getPaginated(db, { categoryId: 'all', limit: 100, offset: 0 });
  assert(pageAll.total === 1000, 'Category "all" query returns full dataset (1,000 total)');

  // Test pagination max limit cap (500 limit cap)
  const pageCapped = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 1000, offset: 0 });
  assert(pageCapped.limit === 500 && pageCapped.items.length === 500, 'Pagination limit is capped at 500 maximum');

  // ---------------------------------------------------------------------------
  // Test 7: Sorting Validation & NULL Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Sorting Validation & NULL Handling ---');
  const sortTitleDesc = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 10, offset: 0, sortBy: 'title', sortOrder: 'desc' });
  assert(sortTitleDesc.items[0].cleanTitle === 'Super Mario Odyssey', 'Title DESC sorts Mario Odyssey first');

  const sortDiscoveredAsc = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 10, offset: 0, sortBy: 'discoveredAt', sortOrder: 'asc' });
  assert(sortDiscoveredAsc.items.length === 10, 'DiscoveredAt ASC returns 10 items without errors');

  const sortReleaseYearDesc = itemsRepo.getPaginated(db, { categoryId: 'switch', limit: 10, offset: 0, sortBy: 'releaseYear', sortOrder: 'desc' });
  assert(sortReleaseYearDesc.items[0].releaseYear === 2023, 'ReleaseYear DESC sorts 2023 items first');

  // ---------------------------------------------------------------------------
  // Test 8: Search & Special Character Escaping
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Search & Special Character Escaping ---');
  const searchMarioLower = itemsRepo.getPaginated(db, { categoryId: 'switch', search: 'mario' });
  assert(searchMarioLower.total === 1, 'Search "mario" finds Super Mario Odyssey');

  const searchMarioUpper = itemsRepo.getPaginated(db, { categoryId: 'switch', search: 'MARIO' });
  assert(searchMarioUpper.total === 1, 'Case-insensitive search "MARIO" finds Super Mario Odyssey');

  // Add item with special SQL LIKE wildcard characters (%)
  itemsRepo.upsert(db, {
    id: 'item_special_001',
    categoryId: 'switch',
    title: '100% Completion Guide [Switch]',
    cleanTitle: '100% Completion Guide',
    genre: 'Guide',
  });

  const searchPercent = itemsRepo.getPaginated(db, { categoryId: 'switch', search: '100%' });
  assert(searchPercent.total === 1 && searchPercent.items[0].id === 'item_special_001', 'LIKE escaping handles "%" character correctly');

  // ---------------------------------------------------------------------------
  // Test 9: Foreign Keys & ON DELETE CASCADE
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 9: Foreign Keys & ON DELETE CASCADE ---');
  let fkFailed = false;
  try {
    itemsRepo.upsert(db, {
      id: 'invalid_fk_item',
      categoryId: 'non_existent_category',
      title: 'Invalid Item',
    });
  } catch (err) {
    fkFailed = true;
  }
  assert(fkFailed, 'Inserting item with non-existent category_id fails FOREIGN KEY constraint');

  // Test CASCADE delete
  categoriesRepo.upsert(db, { id: 'cascade_cat', name: 'Cascade Platform' });
  itemsRepo.upsert(db, {
    id: 'cascade_item_1',
    categoryId: 'cascade_cat',
    title: 'Cascade Item 1',
    details: { magnet: 'magnet:cascade' },
  });
  assert(itemsRepo.getById(db, 'cascade_item_1') !== null, 'Cascade item created');
  assert(detailsRepo.getByItemId(db, 'cascade_item_1') !== null, 'Cascade item details created');

  categoriesRepo.remove(db, 'cascade_cat');
  assert(itemsRepo.getById(db, 'cascade_item_1') === null, 'Deleting category CASCADE deleted items');
  assert(detailsRepo.getByItemId(db, 'cascade_item_1') === null, 'Deleting category CASCADE deleted item_details');

  // ---------------------------------------------------------------------------
  // Test 10: Corrupted Details JSON Recovery
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 10: Corrupted Details JSON Recovery ---');
  db.prepare(`
    INSERT INTO item_details (item_id, magnet, screenshots_json)
    VALUES ('corrupt_item', 'magnet:corrupt', '{invalid_json_string')
  `).run();

  const corruptDetails = detailsRepo.getByItemId(db, 'corrupt_item');
  assert(corruptDetails !== null, 'Corrupted details record retrieved without crashing');
  assert(Array.isArray(corruptDetails.screenshots) && corruptDetails.screenshots.length === 0, 'Corrupted JSON falls back safely to empty array []');

  console.log(`\n================================================================================`);
  console.log(`           TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`================================================================================`);
} finally {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
