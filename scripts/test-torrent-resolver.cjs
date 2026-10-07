/**
 * Test Suite for PR Torrent Source Resolver & Display Fallbacks
 */

const assert = require('assert');
const { resolveTorrentDisplayData, formatBytes, extractDirName, extractFileExtension } = require('../electron/torrent/torrentSourceResolver.cjs');

console.log('================================================================================');
console.log('       RT-LIBRARY TORRENT SOURCE RESOLVER TEST SUITE');
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

runTest('Test 1: Catalog size available, Torrent metadata absent', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      size: '2.44 GB',
      sizeBytes: 2617221344,
      fileList: [
        { name: 'Resident Evil (Disk 1).iso', path: 'Resident Evil/Resident Evil (Disk 1).iso', sizeBytes: 1232454112 },
        { name: 'Resident Evil (Disk 2).iso', path: 'Resident Evil/Resident Evil (Disk 2).iso', sizeBytes: 1384767232 },
      ],
      fileCount: 2,
    },
    torrentMetadata: null,
  });

  assert.strictEqual(result.totalSizeBytes, 2617221344);
  assert.strictEqual(result.totalSizeFormatted, '2.44 GB');
  assert.strictEqual(result.totalSizeSource, 'catalog');
  assert.strictEqual(result.filesSource, 'catalog');
  assert.strictEqual(result.fileCount, 2);
  assert.strictEqual(result.files.length, 2);
  assert.strictEqual(result.files[0].name, 'Resident Evil (Disk 1).iso');
  assert.strictEqual(result.files[0].dirPath, 'Resident Evil');
  assert.strictEqual(result.files[0].extension, 'ISO');
});

runTest('Test 2: Torrent size available, Catalog size available (Torrent priority)', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      size: '2.40 GB',
      sizeBytes: 2500000000,
    },
    torrentMetadata: {
      totalSizeBytes: 2617221344,
      metadataStatus: 'complete',
    },
  });

  assert.strictEqual(result.totalSizeBytes, 2617221344);
  assert.strictEqual(result.totalSizeFormatted, '2.44 GB');
  assert.strictEqual(result.totalSizeSource, 'torrent');
});

runTest('Test 3: Torrent files absent, Catalog files available', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      fileList: [
        { name: 'Zelda.nsp', path: 'Switch/Zelda.nsp', sizeBytes: 14500000000 },
      ],
      fileCount: 1,
    },
    torrentMetadata: {
      metadataStatus: 'pending',
      files: null,
    },
  });

  assert.strictEqual(result.filesSource, 'catalog');
  assert.strictEqual(result.fileCount, 1);
  assert.strictEqual(result.files.length, 1);
  assert.strictEqual(result.files[0].name, 'Zelda.nsp');
  assert.strictEqual(result.files[0].dirPath, 'Switch');
});

runTest('Test 4: Torrent files complete, Catalog files available (Torrent files priority)', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      fileList: [
        { name: 'OldCatalogFile.iso', path: 'OldCatalogFile.iso', sizeBytes: 1000 },
      ],
    },
    torrentMetadata: {
      metadataStatus: 'complete',
      files: [
        { name: 'P2PFile.iso', path: 'P2P/P2PFile.iso', length: 2000000 },
      ],
    },
  });

  assert.strictEqual(result.filesSource, 'torrent');
  assert.strictEqual(result.files.length, 1);
  assert.strictEqual(result.files[0].name, 'P2PFile.iso');
});

runTest('Test 5: Swarm refresh fails (Catalog files preserved)', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      fileList: [
        { name: 'Disc1.iso', path: 'Game/Disc1.iso', sizeBytes: 1500000000 },
      ],
    },
    torrentMetadata: {
      metadataStatus: 'failed',
      swarmStatus: 'failed',
      files: null,
    },
  });

  assert.strictEqual(result.filesSource, 'catalog');
  assert.strictEqual(result.files.length, 1);
  assert.strictEqual(result.files[0].name, 'Disc1.iso');
});

runTest('Test 6: file.size = null, file.sizeBytes valid (formatBytes helper)', () => {
  const result = resolveTorrentDisplayData({
    catalog: {
      fileList: [
        { name: 'test.pkg', path: 'test.pkg', size: null, sizeBytes: 1232454112 },
      ],
    },
  });

  assert.strictEqual(result.files[0].sizeStr, '1.15 GB');
});

runTest('Test 7: 1,000 files directory extraction & performance benchmark', () => {
  const largeFileList = [];
  for (let i = 0; i < 1000; i++) {
    largeFileList.push({
      name: `file_${i}.dat`,
      path: `Folder_${Math.floor(i / 100)}/file_${i}.dat`,
      sizeBytes: (i + 1) * 1024 * 1024,
    });
  }

  const startMs = Date.now();
  const result = resolveTorrentDisplayData({
    catalog: {
      fileList: largeFileList,
      fileCount: 1000,
    },
  });
  const durationMs = Date.now() - startMs;

  assert.strictEqual(result.files.length, 1000);
  assert.strictEqual(result.files[0].dirPath, 'Folder_0');
  assert.ok(durationMs < 100, `Benchmark took ${durationMs}ms (should be < 100ms)`);
});

console.log(`\nRESULTS: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
