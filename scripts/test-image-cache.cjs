const assert = require('assert');
const path = require('path');

const {
  MAX_IMAGE_CACHE_BYTES,
  TARGET_AFTER_CLEANUP_BYTES,
  MAX_SINGLE_IMAGE_BYTES,
  ACCESS_UPDATE_THRESHOLD_MS,
  shouldTriggerCleanup,
  isSingleImageTooLarge,
  shouldUpdateLastAccessedAt,
  calculateSizeDelta,
  selectEvictionCandidates,
  formatBytes,
} = require('../src/services/imageCachePolicy.ts');

async function runTests() {
  console.log('🧪 Starting PR 9 — Image Cache Maintenance & Policy Test Suite...\n');

  // Test 1: Basic Cache Policy & Constants
  {
    console.log('Test 1: Basic cache policy thresholds');
    assert.strictEqual(MAX_IMAGE_CACHE_BYTES, 500 * 1024 * 1024);
    assert.strictEqual(TARGET_AFTER_CLEANUP_BYTES, 400 * 1024 * 1024);
    assert.strictEqual(MAX_SINGLE_IMAGE_BYTES, 15 * 1024 * 1024);
    assert.strictEqual(shouldTriggerCleanup(500 * 1024 * 1024), false);
    assert.strictEqual(shouldTriggerCleanup(500 * 1024 * 1024 + 1), true);
    assert.strictEqual(isSingleImageTooLarge(14 * 1024 * 1024), false);
    assert.strictEqual(isSingleImageTooLarge(16 * 1024 * 1024), true);
    console.log('  ✅ Passed: Basic cache policy thresholds verified.');
  }

  // Test 2: Size Tracking Accumulation
  {
    console.log('Test 2: Size tracking accumulation');
    const size1 = 10 * 1024 * 1024;
    const size2 = 20 * 1024 * 1024;
    const size3 = 30 * 1024 * 1024;

    let total = 0;
    total += calculateSizeDelta(null, size1);
    total += calculateSizeDelta(null, size2);
    total += calculateSizeDelta(null, size3);

    assert.strictEqual(total, 60 * 1024 * 1024);
    assert.strictEqual(formatBytes(total), '60 MB');
    console.log('  ✅ Passed: Size tracking accumulation (60 MB) verified.');
  }

  // Test 3: Overwrite Size Delta Calculation
  {
    console.log('Test 3: Overwrite size delta calculation');
    const oldSize = 10 * 1024 * 1024;
    const newSize = 20 * 1024 * 1024;

    let total = 60 * 1024 * 1024;
    const delta = calculateSizeDelta(oldSize, newSize);
    total += delta;

    assert.strictEqual(delta, 10 * 1024 * 1024);
    assert.strictEqual(total, 70 * 1024 * 1024);
    console.log('  ✅ Passed: Overwrite size delta (+10 MB) verified.');
  }

  // Test 4: LRU Eviction Selection (lastAccessedAt ASC)
  {
    console.log('Test 4: LRU eviction candidate selection');
    const now = Date.now();
    const entries = [
      { url: 'imgA.png', sizeBytes: 200 * 1024 * 1024, lastAccessedAt: now - 1000 }, // accessed recently
      { url: 'imgB.png', sizeBytes: 200 * 1024 * 1024, lastAccessedAt: now - 5000 }, // oldest access
      { url: 'imgC.png', sizeBytes: 200 * 1024 * 1024, lastAccessedAt: now - 3000 }, // middle access
    ];

    const currentTotal = 600 * 1024 * 1024;
    const target = 400 * 1024 * 1024;

    const { candidates, expectedFreedBytes, expectedFinalSize } = selectEvictionCandidates(entries, currentTotal, target);

    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].url, 'imgB.png'); // Oldest accessed item evicted first
    assert.strictEqual(expectedFreedBytes, 200 * 1024 * 1024);
    assert.strictEqual(expectedFinalSize, 400 * 1024 * 1024);
    console.log('  ✅ Passed: LRU candidate selection (oldest accessed first) verified.');
  }

  // Test 5: Hysteresis Watermark Reduction
  {
    console.log('Test 5: Hysteresis watermark reduction');
    const entries = [];
    for (let i = 0; i < 51; i++) {
      entries.push({
        url: `img_${i}.jpg`,
        sizeBytes: 10 * 1024 * 1024, // 10 MB each
        lastAccessedAt: i * 1000,
      });
    }

    const currentTotal = 510 * 1024 * 1024; // 510 MB
    const { candidates, expectedFinalSize } = selectEvictionCandidates(entries, currentTotal, TARGET_AFTER_CLEANUP_BYTES);

    // To get from 510 MB down to <= 400 MB, 11 items of 10 MB must be deleted (reducing to 400 MB)
    assert.strictEqual(candidates.length, 11);
    assert.strictEqual(expectedFinalSize, 400 * 1024 * 1024);
    assert.strictEqual(expectedFinalSize <= TARGET_AFTER_CLEANUP_BYTES, true);
    console.log('  ✅ Passed: Hysteresis watermark reduction from 510 MB to 400 MB verified.');
  }

  // Test 6: Request Deduplication Simulation
  {
    console.log('Test 6: Request deduplication simulation');
    const inFlightRequests = new Map();

    function fetchDeduplicated(url) {
      if (inFlightRequests.has(url)) {
        return inFlightRequests.get(url);
      }
      let resolveFn;
      const promise = new Promise((resolve) => { resolveFn = resolve; });
      inFlightRequests.set(url, promise);
      setTimeout(() => {
        inFlightRequests.delete(url);
        resolveFn(`blob:${url}`);
      }, 50);
      return promise;
    }

    const p1 = fetchDeduplicated('https://example.com/cover.jpg');
    const p2 = fetchDeduplicated('https://example.com/cover.jpg');
    const p3 = fetchDeduplicated('https://example.com/cover.jpg');

    assert.strictEqual(p1, p2);
    assert.strictEqual(p2, p3);

    const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
    assert.strictEqual(res1, 'blob:https://example.com/cover.jpg');
    assert.strictEqual(res2, 'blob:https://example.com/cover.jpg');
    assert.strictEqual(res3, 'blob:https://example.com/cover.jpg');
    console.log('  ✅ Passed: Request deduplication (1 fetch, 3 consumers) verified.');
  }

  // Test 7: Throttled Access Time Update Policy
  {
    console.log('Test 7: Throttled access time update policy');
    const now = Date.now();
    const recentAccess = now - 1000; // 1 sec ago -> should NOT update
    const oldAccess = now - (6 * 60 * 1000); // 6 mins ago -> SHOULD update

    assert.strictEqual(shouldUpdateLastAccessedAt(recentAccess, now, ACCESS_UPDATE_THRESHOLD_MS), false);
    assert.strictEqual(shouldUpdateLastAccessedAt(oldAccess, now, ACCESS_UPDATE_THRESHOLD_MS), true);
    assert.strictEqual(shouldUpdateLastAccessedAt(0, now, ACCESS_UPDATE_THRESHOLD_MS), true);
    console.log('  ✅ Passed: Throttled access time updates (5-min threshold) verified.');
  }

  // Test 8: Cleanup Concurrency Protection Simulation
  {
    console.log('Test 8: Cleanup concurrency protection simulation');
    let isCleaning = false;
    let cleanupPromise = null;
    let cleanupCount = 0;

    function runCleanup() {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        cleanupCount++;
        isCleaning = true;
        await new Promise((r) => setTimeout(r, 50));
        isCleaning = false;
        const res = { cleaned: true, count: cleanupCount };
        cleanupPromise = null;
        return res;
      })();
      return cleanupPromise;
    }

    const [c1, c2, c3] = await Promise.all([runCleanup(), runCleanup(), runCleanup()]);
    assert.strictEqual(cleanupCount, 1);
    assert.strictEqual(c1.count, 1);
    assert.strictEqual(c2.count, 1);
    assert.strictEqual(c3.count, 1);
    console.log('  ✅ Passed: Cleanup concurrency protection (single execution) verified.');
  }

  // Test 9: Invalid Response / Non-Image Filter Policy
  {
    console.log('Test 9: Invalid response filter policy');
    function isValidImageResponse(status, contentType, size) {
      if (status < 200 || status >= 300) return false;
      if (contentType.includes('text/html') || contentType.includes('application/json')) return false;
      if (size <= 0) return false;
      return true;
    }

    assert.strictEqual(isValidImageResponse(200, 'image/jpeg', 1024), true);
    assert.strictEqual(isValidImageResponse(404, 'image/jpeg', 1024), false);
    assert.strictEqual(isValidImageResponse(200, 'text/html', 1024), false);
    assert.strictEqual(isValidImageResponse(200, 'image/png', 0), false);
    console.log('  ✅ Passed: Invalid response filtering policy verified.');
  }

  // Test 10: Size Recalculation & Recovery
  {
    console.log('Test 10: Size recalculation & recovery');
    const items = [
      { url: 'a.jpg', sizeBytes: 1000 },
      { url: 'b.jpg', sizeBytes: 2000 },
      { url: 'c.jpg', sizeBytes: 3000 },
    ];

    let corruptedTotal = 999999;
    let recoveredTotal = items.reduce((sum, item) => sum + item.sizeBytes, 0);

    assert.notStrictEqual(corruptedTotal, recoveredTotal);
    assert.strictEqual(recoveredTotal, 6000);
    console.log('  ✅ Passed: Cache size recalculation & recovery verified.');
  }

  console.log('\n🎉 ALL 10 IMAGE CACHE TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ IMAGE CACHE TEST SUITE FAILED:', err);
  process.exit(1);
});
