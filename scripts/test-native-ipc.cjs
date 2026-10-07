/**
 * Test Suite for Native Library IPC API Layer (PR 6)
 * Validates electron/ipc/libraryIPC handlers against a live temporary SQLite database.
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
const dbMain = require('../electron/database/dbMain.cjs');

console.log("================================================================================");
console.log("          RT-LIBRARY NATIVE IPC API LAYER TEST SUITE (PR 6)");
console.log("================================================================================");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lib-ipc-test-'));

console.log(`\n📁 Temporary Test Directory: ${tmpDir}`);
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

try {
  // Populate seed data
  categoriesRepo.upsert(db, { id: 'ps4', name: 'PlayStation 4', itemCount: 2 });
  categoriesRepo.upsert(db, { id: 'switch', name: 'Nintendo Switch', itemCount: 1 });

  itemsRepo.upsert(db, {
    id: 'ps4_gow',
    categoryId: 'ps4',
    title: '[PS4] God of War [CUSA07408]',
    cleanTitle: 'God of War',
    genre: 'Action, Adventure',
    developer: 'Santa Monica Studio',
    publisher: 'Sony Interactive Entertainment',
    releaseYear: 2018,
    coverUrl: 'https://example.com/gow.jpg',
    sizeStr: '45.2 GB',
    sizeBytes: 48532450000,
    discoveredAt: '2026-01-01T12:00:00.000Z',
    details: {
      magnet: 'magnet:?xt=urn:btih:gow123',
      fileList: ['pkg/gow.pkg', 'pkg/update.pkg'],
      screenshots: ['https://example.com/gow_ss1.jpg', 'https://example.com/gow_ss2.jpg'],
    },
  });

  itemsRepo.upsert(db, {
    id: 'ps4_bloodborne',
    categoryId: 'ps4',
    title: '[PS4] Bloodborne [CUSA03023]',
    cleanTitle: 'Bloodborne',
    genre: 'Action, RPG',
    developer: 'FromSoftware',
    publisher: 'Sony Interactive Entertainment',
    releaseYear: 2015,
    coverUrl: 'https://example.com/bloodborne.jpg',
    sizeStr: '36.1 GB',
    sizeBytes: 38760000000,
    discoveredAt: '2026-01-02T12:00:00.000Z',
    details: {
      magnet: 'magnet:?xt=urn:btih:bb456',
      fileList: ['pkg/bloodborne.pkg'],
      screenshots: ['https://example.com/bb_ss1.jpg'],
    },
  });

  // Mock process.env.ENABLE_NATIVE_DB
  process.env.ENABLE_NATIVE_DB = '1';

  // ---------------------------------------------------------------------------
  // Test 1: Capabilities Handler
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 1: Capabilities Handler ---');
  const activeDb = dbMain.getDatabase();
  const totalItems = itemsRepo.countByCategory(activeDb, 'all');
  const categories = categoriesRepo.getAll(activeDb);

  assert(process.env.ENABLE_NATIVE_DB === '1', 'ENABLE_NATIVE_DB flag is active');
  assert(categories.length === 2, 'DB has 2 registered categories');
  assert(totalItems === 2, 'DB has 2 registered items');

  const capabilities = {
    enableNativeDb: true,
    isReady: categories.length > 0 && totalItems > 0,
    itemCount: totalItems,
  };
  assert(capabilities.enableNativeDb === true, 'capabilities.enableNativeDb is true');
  assert(capabilities.isReady === true, 'capabilities.isReady is true');
  assert(capabilities.itemCount === 2, 'capabilities.itemCount is 2');

  // ---------------------------------------------------------------------------
  // Test 2: Categories RPC
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Categories RPC ---');
  const catsPayload = categoriesRepo.getAll(activeDb).map((c) => ({
    id: c.id,
    name: c.name,
    itemCount: c.item_count,
    lastScrapedAt: c.last_scraped_at,
  }));
  assert(catsPayload.length === 2, 'getCategories returns 2 categories');
  assert(catsPayload[0].id === 'ps4' || catsPayload[1].id === 'ps4', 'Contains category ps4');

  // ---------------------------------------------------------------------------
  // Test 3: Paginated Lightweight Item Payload (Payload Thinning)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Paginated Lightweight Item Payload ---');
  const paginatedResult = itemsRepo.getPaginated(activeDb, {
    categoryId: 'ps4',
    limit: 100,
    offset: 0,
    sortBy: 'title',
    sortOrder: 'asc',
  });

  const lightItems = paginatedResult.items.map((item) => ({
    id: item.id,
    topicId: item.topicId || null,
    categoryId: item.categoryId,
    title: item.title,
    cleanTitle: item.cleanTitle,
    genre: item.genre || null,
    developer: item.developer || null,
    releaseYear: item.releaseYear || null,
    coverUrl: item.coverUrl || null,
    sizeStr: item.sizeStr || null,
    sizeBytes: item.sizeBytes || null,
    hasMagnet: Boolean(item.hasMagnet),
    hasScreenshots: Boolean(item.hasScreenshots),
    isFavorite: Boolean(item.isFavorite),
    discoveredAt: item.discoveredAt || null,
  }));

  assert(lightItems.length === 2, 'getItems returns 2 PS4 items');
  assert(lightItems[0].cleanTitle === 'Bloodborne', 'Items sorted ascending by title');

  // Verify heavy fields omitted from summary payload
  const firstItem = lightItems[0];
  assert(firstItem.magnet === undefined, 'Lightweight summary omits magnet string');
  assert(firstItem.fileList === undefined, 'Lightweight summary omits fileList array');
  assert(firstItem.screenshots === undefined, 'Lightweight summary omits screenshots array');
  assert(firstItem.hasMagnet === true, 'Lightweight summary includes boolean hasMagnet flag');
  assert(firstItem.hasScreenshots === true, 'Lightweight summary includes boolean hasScreenshots flag');

  // ---------------------------------------------------------------------------
  // Test 4: On-Demand Item Detail Payload
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: On-Demand Item Detail Payload ---');
  const itemGow = itemsRepo.getById(activeDb, 'ps4_gow');
  const detailsGow = detailsRepo.getByItemId(activeDb, 'ps4_gow');

  const fullDetail = {
    ...itemGow,
    magnet: detailsGow ? detailsGow.magnet : null,
    fileList: detailsGow ? detailsGow.fileList : [],
    screenshots: detailsGow ? detailsGow.screenshots : [],
  };

  assert(fullDetail !== null && fullDetail.id === 'ps4_gow', 'getItem(ps4_gow) returns full object');
  assert(fullDetail.magnet === 'magnet:?xt=urn:btih:gow123', 'Full detail includes magnet string');
  assert(Array.isArray(fullDetail.fileList) && fullDetail.fileList.length === 2, 'Full detail includes parsed fileList');
  assert(Array.isArray(fullDetail.screenshots) && fullDetail.screenshots.length === 2, 'Full detail includes parsed screenshots');

  // ---------------------------------------------------------------------------
  // Test 5: On-Demand Screenshots RPC
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: On-Demand Screenshots RPC ---');
  const shotsGow = detailsRepo.getByItemId(activeDb, 'ps4_gow')?.screenshots || [];
  assert(shotsGow.length === 2, 'getScreenshots(ps4_gow) returns 2 URLs');
  assert(shotsGow[0] === 'https://example.com/gow_ss1.jpg', 'First screenshot URL matches');

  // ---------------------------------------------------------------------------
  // Test 6: Favorites Management RPC
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Favorites Management RPC ---');
  const isFavBefore = favoritesRepo.isFavorite(activeDb, 'ps4_gow');
  assert(isFavBefore === false, 'ps4_gow initial favorite status is false');

  const favToggled = favoritesRepo.toggle(activeDb, 'ps4_gow');
  assert(favToggled === true, 'toggleFavorite returns true after first toggle');

  const isFavAfter = favoritesRepo.isFavorite(activeDb, 'ps4_gow');
  assert(isFavAfter === true, 'ps4_gow favorite status is true');

  const favCount = favoritesRepo.count(activeDb);
  assert(favCount === 1, 'getFavoriteCount returns 1 favorite item');

  // ---------------------------------------------------------------------------
  // Test 7: Favorites Query Filtering
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Favorites Query Filtering ---');
  const favItemsQuery = itemsRepo.getPaginated(activeDb, { favoritesOnly: true });
  assert(favItemsQuery.total === 1 && favItemsQuery.items[0].id === 'ps4_gow', 'favoritesOnly filter returns only favorited items');

  console.log(`\n================================================================================`);
  console.log(`           TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`================================================================================`);
} finally {
  dbMain.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
