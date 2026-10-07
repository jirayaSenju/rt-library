const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { initializeSchema } = require('../electron/database/schema.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');

console.log('=== [TEST] METADATA FILTERS & FACETS INTEGRATION (V3-07) ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lib-filter-test-'));
const testDbPath = path.join(tmpDir, 'test-metadata-filters.sqlite');

const db = new Database(testDbPath);
initializeSchema(db);

// 1. Insert Categories
categoriesRepo.upsert(db, { id: 'switch', name: 'Nintendo Switch', itemCount: 0 });
categoriesRepo.upsert(db, { id: 'ps2', name: 'Sony PlayStation 2', itemCount: 0 });

// 2. Insert Test Fixtures
const testItems = [
  {
    id: 'item_1',
    category_id: 'switch',
    title: 'SiN: Reloaded',
    canonical_title: 'SiN: Reloaded',
    normalized_title: 'sin reloaded',
    genre: 'Action, FPS',
    developer: 'Nightdive Studios, Slipgate',
    publisher: 'Atari',
    release_year: 2026,
    interface_language: 'en, ru',
    language: 'en, ru',
    image_format: 'NSZ',
    multiplayer: 'No',
    region: 'EUR',
  },
  {
    id: 'item_2',
    category_id: 'switch',
    title: 'Monster Hunter Rise',
    canonical_title: 'Monster Hunter Rise',
    normalized_title: 'monster hunter rise',
    genre: 'Action, RPG',
    developer: 'Capcom',
    publisher: 'Capcom',
    release_year: 2021,
    interface_language: 'ja, en',
    language: 'ja, en',
    image_format: 'NSP',
    multiplayer: 'Yes',
    region: 'JPN',
  },
  {
    id: 'item_3',
    category_id: 'switch',
    title: 'Resident Evil 4',
    canonical_title: 'Resident Evil 4',
    normalized_title: 'resident evil 4',
    genre: 'Horror, Action',
    developer: 'Capcom',
    publisher: 'Capcom',
    release_year: 2019,
    interface_language: 'en',
    language: 'en',
    image_format: 'XCI',
    multiplayer: 'No',
    region: 'USA',
  },
  {
    id: 'item_4',
    category_id: 'ps2',
    title: 'Silent Hill 2',
    canonical_title: 'Silent Hill 2',
    normalized_title: 'silent hill 2',
    genre: 'Horror, Adventure',
    developer: 'Team Silent',
    publisher: 'Konami',
    release_year: 2001,
    interface_language: 'en, ja',
    language: 'en, ja',
    image_format: 'ISO',
    multiplayer: null, // Unknown
    region: 'USA',
  },
  {
    id: 'item_5',
    category_id: 'ps2',
    title: 'Gran Turismo 4',
    canonical_title: 'Gran Turismo 4',
    normalized_title: 'gran turismo 4',
    genre: 'Racing, Simulation',
    developer: 'Polyphony Digital',
    publisher: 'Sony',
    release_year: 2004,
    interface_language: 'en',
    language: 'en',
    image_format: 'ISO',
    multiplayer: 'Yes',
    region: 'WORLD',
  },
];

const insertStmt = db.prepare(`
  INSERT INTO items (
    id, category_id, source, topic_id, title, topic_title, canonical_title, normalized_title,
    clean_title, title_sort, genre, developer, publisher, release_year, language,
    interface_language, image_format, multiplayer, region
  ) VALUES (
    @id, @category_id, 'rutracker', @id, @title, @title, @canonical_title, @normalized_title,
    @canonical_title, @normalized_title, @genre, @developer, @publisher, @release_year, @language,
    @interface_language, @image_format, @multiplayer, @region
  )
`);

for (const it of testItems) {
  insertStmt.run(it);
}

console.log(`[SETUP] Inserted ${testItems.length} test records into SQLite.`);

// Test 1: Developer Single & Multi (OR within field)
console.log('\n--- TEST 1: Developer Single & Multiselect (OR) ---');
const devSingle = itemsRepo.getPaginated(db, { developers: ['Capcom'] });
console.log(`Developer = ['Capcom']: ${devSingle.total} items (Expected: 2) -> ${devSingle.items.map(i => i.title).join(', ')}`);
if (devSingle.total !== 2) throw new Error(`Developer single failed: expected 2, got ${devSingle.total}`);

const devMulti = itemsRepo.getPaginated(db, { developers: ['Capcom', 'Nightdive Studios'] });
console.log(`Developer = ['Capcom', 'Nightdive Studios']: ${devMulti.total} items (Expected: 3) -> ${devMulti.items.map(i => i.title).join(', ')}`);
if (devMulti.total !== 3) throw new Error(`Developer multi failed: expected 3, got ${devMulti.total}`);

// Test 2: Publisher
console.log('\n--- TEST 2: Publisher Filter ---');
const pubResult = itemsRepo.getPaginated(db, { publishers: ['Atari', 'Konami'] });
console.log(`Publisher = ['Atari', 'Konami']: ${pubResult.total} items (Expected: 2) -> ${pubResult.items.map(i => i.title).join(', ')}`);
if (pubResult.total !== 2) throw new Error(`Publisher filter failed: expected 2, got ${pubResult.total}`);

// Test 3: Genre Multivalued
console.log('\n--- TEST 3: Genre Multivalued Filter (OR) ---');
const genreResult = itemsRepo.getPaginated(db, { genres: ['Horror', 'Racing'] });
console.log(`Genre = ['Horror', 'Racing']: ${genreResult.total} items (Expected: 3) -> ${genreResult.items.map(i => i.title).join(', ')}`);
if (genreResult.total !== 3) throw new Error(`Genre filter failed: expected 3, got ${genreResult.total}`);

// Test 4: Interface Language
console.log('\n--- TEST 4: Interface Language Filter ---');
const langResult = itemsRepo.getPaginated(db, { languages: ['ja'] });
console.log(`Language = ['ja']: ${langResult.total} items (Expected: 2) -> ${langResult.items.map(i => i.title).join(', ')}`);
if (langResult.total !== 2) throw new Error(`Language filter failed: expected 2, got ${langResult.total}`);

// Test 5: Image Format
console.log('\n--- TEST 5: Image Format Filter ---');
const fmtResult = itemsRepo.getPaginated(db, { imageFormats: ['NSZ', 'ISO'] });
console.log(`Format = ['NSZ', 'ISO']: ${fmtResult.total} items (Expected: 3) -> ${fmtResult.items.map(i => i.title).join(', ')}`);
if (fmtResult.total !== 3) throw new Error(`Image format filter failed: expected 3, got ${fmtResult.total}`);

// Test 6: Multiplayer Tri-State (Yes / No / Any)
console.log('\n--- TEST 6: Multiplayer Tri-State ---');
const multiYes = itemsRepo.getPaginated(db, { multiplayer: 'yes' });
console.log(`Multiplayer = 'yes': ${multiYes.total} items (Expected: 2) -> ${multiYes.items.map(i => i.title).join(', ')}`);
if (multiYes.total !== 2) throw new Error(`Multiplayer 'yes' failed: expected 2, got ${multiYes.total}`);

const multiNo = itemsRepo.getPaginated(db, { multiplayer: 'no' });
console.log(`Multiplayer = 'no': ${multiNo.total} items (Expected: 2) -> ${multiNo.items.map(i => i.title).join(', ')}`);
if (multiNo.total !== 2) throw new Error(`Multiplayer 'no' failed: expected 2, got ${multiNo.total}`);

const multiAny = itemsRepo.getPaginated(db, { multiplayer: 'any' });
console.log(`Multiplayer = 'any': ${multiAny.total} items (Expected: 5) -> ${multiAny.items.map(i => i.title).join(', ')}`);
if (multiAny.total !== 5) throw new Error(`Multiplayer 'any' failed: expected 5, got ${multiAny.total}`);

// Test 7: Region
console.log('\n--- TEST 7: Region Filter ---');
const regResult = itemsRepo.getPaginated(db, { regions: ['EUR', 'JPN'] });
console.log(`Region = ['EUR', 'JPN']: ${regResult.total} items (Expected: 2) -> ${regResult.items.map(i => i.title).join(', ')}`);
if (regResult.total !== 2) throw new Error(`Region filter failed: expected 2, got ${regResult.total}`);

// Test 8: Cross-field Combination (AND between fields)
console.log('\n--- TEST 8: Cross-Field AND Combination ---');
const crossResult = itemsRepo.getPaginated(db, {
  developers: ['Capcom'],
  genres: ['Horror'],
  regions: ['USA'],
});
console.log(`Developer=Capcom AND Genre=Horror AND Region=USA: ${crossResult.total} items (Expected: 1) -> ${crossResult.items.map(i => i.title).join(', ')}`);
if (crossResult.total !== 1 || crossResult.items[0].id !== 'item_3') {
  throw new Error(`Cross-field AND failed: expected item_3, got ${JSON.stringify(crossResult.items)}`);
}

// Test 9: Facet Extraction & Aggregation
console.log('\n--- TEST 9: getFilterFacets Query & Scope ---');
const globalFacets = itemsRepo.getFilterFacets(db, {});
console.log('Global Facets:', {
  developersCount: globalFacets.developers.length,
  publishersCount: globalFacets.publishers.length,
  genresCount: globalFacets.genres.length,
  languagesCount: globalFacets.languages.length,
  formatsCount: globalFacets.imageFormats.length,
  regionsCount: globalFacets.regions.length,
  multiplayer: globalFacets.multiplayer,
});
if (globalFacets.developers.length === 0 || globalFacets.genres.length === 0) {
  throw new Error('Global facets empty');
}

const switchFacets = itemsRepo.getFilterFacets(db, { categoryId: 'switch' });
console.log('Switch-scoped Facets developers:', switchFacets.developers.map(d => `${d.value} (${d.count})`).join(', '));
if (switchFacets.developers.some(d => d.value === 'Team Silent')) {
  throw new Error('Switch-scoped facets leaked PS2 developer Team Silent');
}

// Test 10: Performance & EXPLAIN QUERY PLAN
console.log('\n--- TEST 10: Query Plan & Performance ---');
const plan = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT items.*
  FROM items
  WHERE items.developer LIKE '%Capcom%'
    AND items.genre LIKE '%Horror%'
    AND items.release_year >= 2000
`).all();
console.log('Query Plan:', plan);

const t0 = performance.now();
for (let i = 0; i < 50; i++) {
  itemsRepo.getPaginated(db, { developers: ['Capcom'], genres: ['Action'], limit: 50 });
}
const avgMs = (performance.now() - t0) / 50;
console.log(`Average getPaginated time with metadata filters: ${avgMs.toFixed(3)}ms`);

console.log('\n[SUCCESS] All V3-07 Metadata Filter & Facet tests passed successfully!');
process.exit(0);
