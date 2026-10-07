/**
 * Diagnostic Test Suite for Screenshot Normalization & Deduplication
 */
const assert = require('assert');
const {
  detectProvider,
  isViewerPage,
  isDirectImageUrl,
  extractImageIdentity,
  getScreenshotPriority,
  normalizeScreenshots,
} = require('../electron/indexer/normalize.cjs');

console.log('--- RUNNING SCREENSHOT NORMALIZATION TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(err);
  }
}

// Test 1: FastPic pair (fullview hashA + big hashA -> big hashA)
runTest('FastPic pair deduplication preferring big over fullview', () => {
  const viewer = 'https://fastpic.org/fullview/106/2018/1121/b01f9d61bc26b3bcc0b9883cc548046f.jpg.html';
  const direct = 'https://i105.fastpic.org/big/2018/1121/6f/b01f9d61bc26b3bcc0b9883cc548046f.jpeg';
  const input = [viewer, direct];
  const output = normalizeScreenshots(input);
  assert.strictEqual(output.length, 1);
  assert.strictEqual(output[0], direct);
});

// Test 2: Multiple FastPic pairs
runTest('Multiple FastPic pairs deduplication', () => {
  const input = [
    'https://fastpic.org/fullview/106/2018/1121/hash1.jpg.html',
    'https://i105.fastpic.org/big/2018/1121/6f/hash1.jpeg',
    'https://fastpic.org/fullview/106/2018/1121/hash2.jpg.html',
    'https://i105.fastpic.org/big/2018/1121/6f/hash2.jpeg',
  ];
  const output = normalizeScreenshots(input);
  assert.strictEqual(output.length, 2);
  assert.strictEqual(output[0], 'https://i105.fastpic.org/big/2018/1121/6f/hash1.jpeg');
  assert.strictEqual(output[1], 'https://i105.fastpic.org/big/2018/1121/6f/hash2.jpeg');
});

// Test 3: Viewer-only fallback
runTest('Viewer-only URL fallback retained when no direct image available', () => {
  const viewerOnly = 'https://fastpic.org/view/128/2026/0929/uniquehash123.webp.html';
  const output = normalizeScreenshots([viewerOnly]);
  assert.strictEqual(output.length, 1);
  assert.strictEqual(output[0], viewerOnly);
});

// Test 4: ImageBan (show A + thumbs A -> thumbs A)
runTest('ImageBan show + thumbs -> thumbs', () => {
  const show = 'https://imageban.ru/show/2026/09/30/b192415cc7b17e9dfcc978cf39858046/png';
  const thumb = 'https://i3.imageban.ru/thumbs/2026/09/30/b192415cc7b17e9dfcc978cf39858046.jpg';
  const output = normalizeScreenshots([show, thumb]);
  assert.strictEqual(output.length, 1);
  assert.strictEqual(output[0], thumb);
});

// Test 5: ImageBan out (show A + thumbs A + out A -> out A)
runTest('ImageBan show + thumbs + out -> out', () => {
  const show = 'https://imageban.ru/show/2026/09/30/b192415cc7b17e9dfcc978cf39858046/png';
  const thumb = 'https://i3.imageban.ru/thumbs/2026/09/30/b192415cc7b17e9dfcc978cf39858046.jpg';
  const out = 'https://i1.imageban.ru/out/2026/09/30/b192415cc7b17e9dfcc978cf39858046.png';
  const output = normalizeScreenshots([show, thumb, out]);
  assert.strictEqual(output.length, 1);
  assert.strictEqual(output[0], out);
});

// Test 6: Exact duplicate
runTest('Exact duplicate strings deduplicated', () => {
  const url = 'https://i105.fastpic.org/big/2018/1121/6f/b01f9d61bc26b3bcc0b9883cc548046f.jpeg';
  const output = normalizeScreenshots([url, url, url]);
  assert.strictEqual(output.length, 1);
  assert.strictEqual(output[0], url);
});

// Test 7: Order preservation (viewer A, viewer B, direct A, direct B -> direct A, direct B)
runTest('Order preservation of first appearance', () => {
  const viewerA = 'https://fastpic.org/fullview/106/2018/1121/hashA.jpg.html';
  const viewerB = 'https://fastpic.org/fullview/106/2018/1121/hashB.jpg.html';
  const directA = 'https://i105.fastpic.org/big/2018/1121/6f/hashA.jpeg';
  const directB = 'https://i105.fastpic.org/big/2018/1121/6f/hashB.jpeg';
  const output = normalizeScreenshots([viewerA, viewerB, directA, directB]);
  assert.strictEqual(output.length, 2);
  assert.strictEqual(output[0], directA);
  assert.strictEqual(output[1], directB);
});

// Test 8: Unknown URLs (not discarded)
runTest('Unknown image host URLs preserved', () => {
  const customUrl1 = 'https://mycustomhost.org/screens/game1.png';
  const customUrl2 = 'https://mycustomhost.org/screens/game2.png';
  const output = normalizeScreenshots([customUrl1, customUrl2]);
  assert.strictEqual(output.length, 2);
  assert.strictEqual(output[0], customUrl1);
  assert.strictEqual(output[1], customUrl2);
});

// Test 9: Invalid input safety
runTest('Invalid input arrays and non-string elements safely handled', () => {
  assert.deepStrictEqual(normalizeScreenshots(null), []);
  assert.deepStrictEqual(normalizeScreenshots(undefined), []);
  assert.deepStrictEqual(normalizeScreenshots([123, null, undefined, '', '   ']), []);
  const valid = 'https://i.postimg.cc/b01f9d61/image.png';
  assert.deepStrictEqual(normalizeScreenshots([null, valid, 42]), [valid]);
});

// Test 10: Burnout fixture validation
runTest('Burnout mixed viewer and direct URLs fixture validation', () => {
  const burnoutFixture = [
    'https://fastpic.org/fullview/91/2017/1018/fd933f8d3bf5ce2f7a985ad6706ab12f.jpg.html',
    'https://i91.fastpic.org/big/2017/1018/2f/fd933f8d3bf5ce2f7a985ad6706ab12f.jpg',
    'https://fastpic.org/fullview/91/2017/1018/cbfd81f13f574230e20e7521b3bd516c.jpg.html',
    'https://i91.fastpic.org/big/2017/1018/6c/cbfd81f13f574230e20e7521b3bd516c.jpg',
    'https://fastpic.org/fullview/91/2017/1018/7cdbebc3f84a1b66fe3502e2fb0addb9.jpg.html',
    'https://i91.fastpic.org/big/2017/1018/b9/7cdbebc3f84a1b66fe3502e2fb0addb9.jpg',
  ];
  const output = normalizeScreenshots(burnoutFixture);
  assert.strictEqual(output.length, 3);
  assert.strictEqual(output[0], 'https://i91.fastpic.org/big/2017/1018/2f/fd933f8d3bf5ce2f7a985ad6706ab12f.jpg');
  assert.strictEqual(output[1], 'https://i91.fastpic.org/big/2017/1018/6c/cbfd81f13f574230e20e7521b3bd516c.jpg');
  assert.strictEqual(output[2], 'https://i91.fastpic.org/big/2017/1018/b9/7cdbebc3f84a1b66fe3502e2fb0addb9.jpg');
});


runTest('PostImg uploads with matching filename prefixes remain distinct', () => {
  const urls = [
    'https://i.postimg.cc/BLX9dvGK/Need-for-Speed-Hot-Pursuit-2-SLUS-20362-20251110110816-novyj-razmer.png',
    'https://i.postimg.cc/TLpMZPXL/Need-for-Speed-Hot-Pursuit-2-SLUS-20362-20251110110823-novyj-razmer.png',
    'https://s6.postimg.org/sls97lkzh/image.jpg',
    'https://s6.postimg.org/ynzvy39fh/image.jpg',
  ];
  assert.deepStrictEqual(normalizeScreenshots(urls.concat(urls[0])), urls);
});

runTest('PostImg viewer and direct identifiers are not assumed interchangeable', () => {
  const urls = ['https://postimg.cc/uploadId', 'https://i.postimg.cc/uploadId/image.jpg'];
  assert.deepStrictEqual(normalizeScreenshots(urls), urls);
  const queryImages = ['https://i.postimg.cc/uploadId/image.jpg?v=1', 'https://i.postimg.cc/uploadId/image.jpg?v=2'];
  assert.deepStrictEqual(normalizeScreenshots(queryImages), queryImages);
});

console.log(`\nRESULTS: ${passedTests}/${totalTests} tests passed.`);
if (passedTests !== totalTests) {
  process.exit(1);
}
