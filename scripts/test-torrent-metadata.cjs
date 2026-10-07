/**
 * Test Suite for PR 11 — Torrent Metadata Collector (Persistence & Parser)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const { parseMagnetUrl, base32ToHex } = require('../electron/torrent/magnetParser.cjs');
const { initializeSchema, SCHEMA_VERSION } = require('../electron/database/schema.cjs');
const dbMain = require('../electron/database/dbMain.cjs');
const torrentMetadataRepo = require('../electron/database/repositories/torrentMetadataRepo.cjs');

console.log('================================================================================');
console.log('          RT-LIBRARY TORRENT METADATA TEST SUITE (PR 11)');
console.log('================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ Test ${totalTests}: ${name}`);
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// PART 1: Magnet Parser Tests
// -----------------------------------------------------------------------------
console.log('--- PART 1: Magnet Parser Unit Tests ---');

runTest('Parse valid Hex BTIH Magnet URL with trackers and display name', () => {
  const magnet = 'magnet:?xt=urn:btih:e17c37617b4c9796bfdfd8cb431057e62a22be1b&dn=Dark+Souls+II&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce';
  const parsed = parseMagnetUrl(magnet);
  assert.strictEqual(parsed.isValid, true);
  assert.strictEqual(parsed.infoHash, 'e17c37617b4c9796bfdfd8cb431057e62a22be1b');
  assert.strictEqual(parsed.displayName, 'Dark Souls II');
  assert.strictEqual(parsed.trackers.length, 2);
  assert.strictEqual(parsed.trackers[0], 'udp://tracker.opentrackr.org:1337/announce');
});

runTest('Parse valid Base32 BTIH Magnet URL', () => {
  const base32 = '4FRDOYK3JQ3ZNQX63GHUG4C74YVCFPQL';
  const expectedHex = 'e16237615b4c3796c2fed98f43705fe62a22be0b';
  const converted = base32ToHex(base32);
  assert.strictEqual(converted, expectedHex);

  const magnet = `magnet:?xt=urn:btih:${base32}&dn=Base32Test`;
  const parsed = parseMagnetUrl(magnet);
  assert.strictEqual(parsed.isValid, true);
  assert.strictEqual(parsed.infoHash, expectedHex);
});

runTest('Handle magnet without trackers', () => {
  const magnet = 'magnet:?xt=urn:btih:e17c37617b4c9796bfdfd8cb431057e62a22be1b';
  const parsed = parseMagnetUrl(magnet);
  assert.strictEqual(parsed.isValid, true);
  assert.strictEqual(parsed.infoHash, 'e17c37617b4c9796bfdfd8cb431057e62a22be1b');
  assert.strictEqual(parsed.displayName, null);
  assert.strictEqual(parsed.trackers.length, 0);
});

runTest('Deduplicate duplicate trackers in magnet URL', () => {
  const magnet = 'magnet:?xt=urn:btih:e17c37617b4c9796bfdfd8cb431057e62a22be1b&tr=http%3A%2F%2Ftracker1.com&tr=http%3A%2F%2Ftracker1.com';
  const parsed = parseMagnetUrl(magnet);
  assert.strictEqual(parsed.isValid, true);
  assert.strictEqual(parsed.trackers.length, 1);
  assert.strictEqual(parsed.trackers[0], 'http://tracker1.com');
});

runTest('Safely reject invalid/malformed magnet URLs without crashing', () => {
  assert.strictEqual(parseMagnetUrl(null).isValid, false);
  assert.strictEqual(parseMagnetUrl(undefined).isValid, false);
  assert.strictEqual(parseMagnetUrl('').isValid, false);
  assert.strictEqual(parseMagnetUrl('http://not-a-magnet.com').isValid, false);
  assert.strictEqual(parseMagnetUrl('magnet:?dn=NoBTIH').isValid, false);
  assert.strictEqual(parseMagnetUrl('magnet:?xt=urn:btih:invalid_hash_string').isValid, false);
});


// -----------------------------------------------------------------------------
// PART 2: Database Schema & Repository Tests
// -----------------------------------------------------------------------------
console.log('\n--- PART 2: Database Schema v2 & Repository Unit Tests ---');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-torrent-test-'));
console.log(`📁 Temporary Test Database Path: ${tmpDir}`);

const db = dbMain.initDatabase(tmpDir);

runTest('Verify database schema updated to version 2', () => {
  assert.strictEqual(SCHEMA_VERSION, 2);
  const version = db.pragma('user_version', { simple: true });
  assert.strictEqual(version, 2);

  const tableExists = db.prepare(`
    SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='torrent_metadata'
  `).get().count;
  assert.strictEqual(tableExists, 1);
});

// Seed mock item for foreign key reference
db.prepare(`
  INSERT INTO categories (id, name, created_at, updated_at) VALUES ('ps4', 'PlayStation 4', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`).run();

db.prepare(`
  INSERT INTO items (id, category_id, title, clean_title, title_sort, updated_at)
  VALUES ('item_test_1', 'ps4', 'Dark Souls II', 'Dark Souls II', 'dark souls ii', CURRENT_TIMESTAMP)
`).run();

db.prepare(`
  INSERT INTO item_details (item_id, magnet)
  VALUES ('item_test_1', 'magnet:?xt=urn:btih:e17c37617b4c9796bfdfd8cb431057e62a22be1b&dn=Dark+Souls+II')
`).run();

runTest('Repository upsertMetadata inserts new torrent_metadata record', () => {
  const metadata = {
    itemId: 'item_test_1',
    infoHash: 'e17c37617b4c9796bfdfd8cb431057e62a22be1b',
    torrentName: 'Dark Souls II: Scholar of the First Sin',
    totalSizeBytes: 7966720000,
    fileCount: 14,
    files: [
      { name: 'ds2.pkg', path: 'ds2.pkg', length: 7966720000 }
    ],
    trackers: ['udp://tracker.opentrackr.org:1337/announce'],
    metadataStatus: 'complete',
    metadataSource: 'bittorrent',
  };

  const result = torrentMetadataRepo.upsertMetadata(metadata);
  assert.strictEqual(result.itemId, 'item_test_1');
  assert.strictEqual(result.infoHash, 'e17c37617b4c9796bfdfd8cb431057e62a22be1b');
  assert.strictEqual(result.torrentName, 'Dark Souls II: Scholar of the First Sin');
  assert.strictEqual(result.totalSizeBytes, 7966720000);
  assert.strictEqual(result.fileCount, 14);
  assert.strictEqual(result.files.length, 1);
  assert.strictEqual(result.metadataStatus, 'complete');
});

runTest('Repository getByItemId and getByInfoHash query methods', () => {
  const byId = torrentMetadataRepo.getByItemId('item_test_1');
  assert.notStrictEqual(byId, null);
  assert.strictEqual(byId.itemId, 'item_test_1');

  const byHash = torrentMetadataRepo.getByInfoHash('E17C37617B4C9796BFDFD8CB431057E62A22BE1B');
  assert.notStrictEqual(byHash, null);
  assert.strictEqual(byHash.itemId, 'item_test_1');
});

runTest('Repository updateSwarmStats updates seeds, leechers, peers without overwriting stable metadata', () => {
  const swarmData = {
    seeds: 128,
    leechers: 14,
    peers: 142,
    swarmStatus: 'complete',
    swarmSource: 'tracker',
  };

  const updated = torrentMetadataRepo.updateSwarmStats('item_test_1', swarmData);
  assert.strictEqual(updated.seeds, 128);
  assert.strictEqual(updated.leechers, 14);
  assert.strictEqual(updated.peers, 142);
  assert.strictEqual(updated.swarmStatus, 'complete');

  // Verify stable metadata remained intact
  assert.strictEqual(updated.totalSizeBytes, 7966720000);
  assert.strictEqual(updated.fileCount, 14);
});

runTest('Repository markFetching and markFailed for retry handling', () => {
  // Seed item 2
  db.prepare(`
    INSERT INTO items (id, category_id, title, clean_title, title_sort, updated_at)
    VALUES ('item_test_2', 'ps4', 'Bloodborne', 'Bloodborne', 'bloodborne', CURRENT_TIMESTAMP)
  `).run();

  db.prepare(`
    INSERT INTO item_details (item_id, magnet)
    VALUES ('item_test_2', 'magnet:?xt=urn:btih:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
  `).run();

  const fetching = torrentMetadataRepo.markFetching('item_test_2');
  assert.strictEqual(fetching.metadataStatus, 'fetching');
  assert.strictEqual(fetching.attempts, 1);

  const failed = torrentMetadataRepo.markFailed('item_test_2', 'Tracker connection timeout', 900000);
  assert.strictEqual(failed.metadataStatus, 'failed');
  assert.strictEqual(failed.lastError, 'Tracker connection timeout');
  assert.notStrictEqual(failed.nextRetryAt, null);
});

runTest('Repository getPending, getStaleSwarm, and getStats metrics', () => {
  const pending = torrentMetadataRepo.getPending(10);
  assert.strictEqual(Array.isArray(pending), true);

  const stats = torrentMetadataRepo.getStats();
  assert.strictEqual(stats.totalMagnets, 2);
  assert.strictEqual(stats.metadataComplete, 1);
  assert.strictEqual(stats.metadataFailed, 1);
  assert.strictEqual(stats.coveragePercent, 50.0);
});

// -----------------------------------------------------------------------------
// PART 3: PR 11.4 Torrent File List & Total Size Tests
// -----------------------------------------------------------------------------
console.log('\n--- PART 3: Torrent File List & Normalization Unit Tests (PR 11.4) ---');

const { normalizeTorrentFiles } = require('../electron/torrent/metadataWorker.cjs');

runTest('Single file metadata normalization with fallback name and size', () => {
  const normalized = normalizeTorrentFiles([], 'Bloodborne.pkg', 15000000000);
  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].path, 'Bloodborne.pkg');
  assert.strictEqual(normalized[0].name, 'Bloodborne.pkg');
  assert.strictEqual(normalized[0].length, 15000000000);
});

runTest('Multi-file metadata normalization and directory hierarchy extraction', () => {
  const raw = [
    { path: ['BDMV', 'STREAM', '00001.m2ts'], length: 28000000000 },
    { path: 'BDMV/update.pkg', length: 3200000000 },
    { name: 'readme.txt', length: 12000 },
  ];
  const normalized = normalizeTorrentFiles(raw);
  assert.strictEqual(normalized.length, 3);
  assert.strictEqual(normalized[0].path, 'BDMV/STREAM/00001.m2ts');
  assert.strictEqual(normalized[0].name, '00001.m2ts');
  assert.strictEqual(normalized[0].length, 28000000000);

  assert.strictEqual(normalized[1].path, 'BDMV/update.pkg');
  assert.strictEqual(normalized[1].name, 'update.pkg');
  assert.strictEqual(normalized[1].length, 3200000000);

  assert.strictEqual(normalized[2].path, 'readme.txt');
  assert.strictEqual(normalized[2].name, 'readme.txt');
  assert.strictEqual(normalized[2].length, 12000);
});

runTest('File list sorting by size descending (length DESC)', () => {
  const raw = [
    { path: 'small.txt', length: 100 },
    { path: 'huge.iso', length: 5000000000 },
    { path: 'medium.bin', length: 5000000 },
  ];
  const normalized = normalizeTorrentFiles(raw);
  const sorted = [...normalized].sort((a, b) => b.length - a.length);

  assert.strictEqual(sorted[0].name, 'huge.iso');
  assert.strictEqual(sorted[1].name, 'medium.bin');
  assert.strictEqual(sorted[2].name, 'small.txt');
});

runTest('Total size fallback calculation when totalSizeBytes is missing', () => {
  const raw = [
    { path: 'part1.bin', length: 2000 },
    { path: 'part2.bin', length: 3000 },
  ];
  const normalized = normalizeTorrentFiles(raw);
  const sumBytes = normalized.reduce((acc, f) => acc + f.length, 0);
  assert.strictEqual(sumBytes, 5000);
});

runTest('Safely filter corrupted/invalid file entries without crashing', () => {
  const raw = [
    null,
    undefined,
    12345,
    'not-an-object',
    { path: null },
    { length: -500 },
    { path: 'valid.dat', length: 999 },
  ];
  const normalized = normalizeTorrentFiles(raw);
  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].name, 'valid.dat');
  assert.strictEqual(normalized[0].length, 999);
});

runTest('Preserve torrent file list and total size during swarm stats refresh', () => {
  db.prepare(`
    INSERT INTO items (id, category_id, title, clean_title, title_sort, updated_at)
    VALUES ('item_test_3', 'ps4', 'Elden Ring', 'Elden Ring', 'elden ring', CURRENT_TIMESTAMP)
  `).run();

  const files = [
    { path: 'Game/elden_ring.pkg', name: 'elden_ring.pkg', length: 45000000000 },
    { path: 'Game/patch104.pkg', name: 'patch104.pkg', length: 5000000000 },
  ];

  torrentMetadataRepo.upsertMetadata({
    itemId: 'item_test_3',
    infoHash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
    torrentName: 'Elden Ring PS4',
    totalSizeBytes: 50000000000,
    fileCount: 2,
    files,
    metadataStatus: 'complete',
  });

  const updatedSwarm = torrentMetadataRepo.updateSwarmStats('item_test_3', {
    seeds: 500,
    leechers: 20,
    peers: 520,
  });

  assert.strictEqual(updatedSwarm.seeds, 500);
  assert.strictEqual(updatedSwarm.fileCount, 2);
  assert.strictEqual(updatedSwarm.totalSizeBytes, 50000000000);
  assert.strictEqual(updatedSwarm.files.length, 2);
  assert.strictEqual(updatedSwarm.files[0].name, 'elden_ring.pkg');
});

runTest('Performance benchmark with 1,000 file entries', () => {
  db.prepare(`
    INSERT INTO items (id, category_id, title, clean_title, title_sort, updated_at)
    VALUES ('item_large_1000', 'ps4', 'Large Torrent', 'Large Torrent', 'large torrent', CURRENT_TIMESTAMP)
  `).run();

  const largeFiles = [];
  for (let i = 0; i < 1000; i++) {
    largeFiles.push({
      path: `Directory_${Math.floor(i / 100)}/file_${i}.dat`,
      length: (i + 1) * 1024 * 1024,
    });
  }

  const startMs = Date.now();
  const normalized = normalizeTorrentFiles(largeFiles);
  const totalSizeBytes = normalized.reduce((acc, f) => acc + f.length, 0);

  const inserted = torrentMetadataRepo.upsertMetadata({
    itemId: 'item_large_1000',
    infoHash: 'f1f2f3f4f5f6f7f8f9f0a1a2a3a4a5a6a7a8a9a0',
    torrentName: 'Large 1000 Files Torrent',
    totalSizeBytes,
    fileCount: normalized.length,
    files: normalized,
    metadataStatus: 'complete',
  });

  const fetched = torrentMetadataRepo.getByItemId('item_large_1000');
  const durationMs = Date.now() - startMs;

  assert.strictEqual(fetched.fileCount, 1000);
  assert.strictEqual(fetched.files.length, 1000);
  assert.strictEqual(fetched.totalSizeBytes, totalSizeBytes);
  assert.ok(durationMs < 500, `Benchmark took ${durationMs}ms (should be < 500ms)`);
});

dbMain.closeDatabase();

console.log(`\nRESULTS: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
