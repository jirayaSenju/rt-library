const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { initializeSchema, runMetadataNormalizationMigration } = require('../electron/database/schema.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const { normalizeItemMetadata } = require('../electron/scraper/metadataNormalizer.cjs');

console.log('=== [TEST] METADATA NORMALIZATION & SQLITE MIGRATION ===');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lib-norm-test-'));
const testDbPath = path.join(tmpDir, 'test-metadata-norm.sqlite');

const db = new Database(testDbPath);
initializeSchema(db);

// 1. Insert category
categoriesRepo.upsert(db, {
  id: 'switch',
  name: 'Nintendo Switch',
  itemCount: 0,
});

// 2. Insert unnormalized legacy items
db.prepare(`
  INSERT INTO items (
    id, category_id, source, topic_id, title, topic_title, canonical_title, normalized_title,
    clean_title, title_sort, genre, developer, publisher, release_year, language,
    interface_language, voice_language, image_format, multiplayer, version, region
  ) VALUES (
    'topic_sin', 'switch', 'rutracker', '10001',
    '[Nintendo Switch] Sin Reloaded Gold + Wages of Sin [NSZ][ENG]',
    '[Nintendo Switch] Sin Reloaded Gold + Wages of Sin [NSZ][ENG]',
    'SiN: Reloaded', 'sin reloaded', 'SiN: Reloaded', 'sin reloaded',
    'First Person Shooter, Action',
    'Ritual Entertainment, 2015 Games, Nightdive Studios',
    'Atari',
    2026,
    'Английский [ENG]',
    'Английский [ENG]',
    'Английский',
    '.NSZ',
    'нет',
    'v1.0.1',
    'EUR'
  )
`).run();

// 3. Run migration
db.prepare("DELETE FROM schema_migrations WHERE id = 'metadata_normalization_v1'").run();
runMetadataNormalizationMigration(db);

// 4. Validate enriched fields
const row = db.prepare('SELECT * FROM items WHERE id = ?').get('topic_sin');
console.log('[ROW] Enriched row:', {
  release_year: row.release_year,
  image_format: row.image_format,
  version: row.version,
  multiplayer: row.multiplayer,
  genre: row.genre,
  developer: row.developer,
  publisher: row.publisher,
  region: row.region,
});

if (row.release_year === 2026 && row.image_format === 'NSZ' && row.version === '1.0.1' && row.multiplayer === 'No' && row.region === 'EUR') {
  console.log('✅ METADATA NORMALIZATION MIGRATION: PASS');
} else {
  console.error('❌ METADATA NORMALIZATION MIGRATION FAILED:', row);
  process.exitCode = 1;
}

// 5. Test search by developer, publisher and genre
const searchDev = itemsRepo.getPaginated(db, { search: 'Nightdive' });
const searchPub = itemsRepo.getPaginated(db, { search: 'Atari' });
const searchGenre = itemsRepo.getPaginated(db, { search: 'First Person' });

if (searchDev.items.length === 1 && searchPub.items.length === 1 && searchGenre.items.length === 1) {
  console.log('✅ REPOSITORY SEARCH ENRICHED FIELDS: PASS');
} else {
  console.error('❌ SEARCH FAILED', { dev: searchDev.items.length, pub: searchPub.items.length, genre: searchGenre.items.length });
  process.exitCode = 1;
}

db.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
console.log('✅ ALL NATIVE METADATA TESTS COMPLETE');
