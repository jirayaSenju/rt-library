const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { resolveScreenshotCandidates: resolve, canonicalScreenshotKey: key, normalizeScreenshotUrl: normalize, uniqueScreenshotUrls: unique, isScreenshotPage: page, orderScreenshotCandidates: order } = load('src/services/screenshotResolver.ts');
const fixtures = require('./fixtures/screenshot-urls.json');
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }
const fastpic = fixtures.find(f => f.provider === 'fastpic').url;
const imageban = fixtures.find(f => f.provider === 'imageban').url;
test('Catalog provenance and required platform/provider coverage', () => {
  for (const catalog of ['gamecube', 'wii', '3ds', 'ds', 'xbox', 'dreamcast']) assert(fixtures.some(f => f.catalog === `${catalog}.json`));
  for (const [provider, count] of Object.entries({ fastpic: 5, imageban: 5, radikal: 3, imagebam: 3, postimg: 3, other: 3 })) assert(fixtures.filter(f => f.provider === provider).length >= count);
  for (const fixture of fixtures) {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../../ecohub-app/data', fixture.catalog), 'utf8'));
    const found = (source.items || source).some(item => (item.content?.screenshots || item.screenshots || []).includes(fixture.url));
    assert(found, fixture.url);
    assert(resolve(fixture.url).length);
  }
});
test('FastPic thumbnail preserves original and extension with jpg fallback', () => {
  const candidates = resolve(fastpic);
  assert(candidates.some(c => c.url === fastpic && c.kind === 'thumbnail'));
  assert(candidates.some(c => c.url === fastpic.replace('/thumb/', '/big/')));
  assert(candidates.some(c => c.url.endsWith('.jpg') && c.kind === 'derived'));
  assert.equal(order(fastpic, 'thumbnail')[0].url, fastpic);
});
test('FastPic big and malformed structures', () => {
  const big = fastpic.replace('/thumb/', '/big/').replace('.jpeg', '.jpg');
  assert.equal(resolve(big)[0].url, big);
  assert.equal(order(big, 'thumbnail')[0].url, fastpic);
  assert(resolve(big).some(candidate => candidate.url === fastpic));
  assert.equal(resolve('https://i116.fastpic.org/thumb/not-a-date/file.png').length, 1);
  assert.equal(resolve(fastpic.replace('.org', '.ru'))[0].provider, 'fastpic');
});
test('FastPic thumbnail big viewer identity ignores extension and underscore', () => {
  const big = fastpic.replace('/thumb/', '/big/').replace('.jpeg', '.jpg');
  const hash = fastpic.split('/').pop().split('.')[0];
  const viewer = `https://fastpic.org/fullview/106/2018/1209/_${hash}.jpg.html`;
  assert.equal(key(fastpic), key(big)); assert.equal(key(big), key(viewer));
  assert.deepEqual(unique([fastpic, big, viewer]), [fastpic]);
});
test('ImageBan date dots become out/date/slashes, host and extension preserved', () => {
  const direct = resolve(imageban)[0];
  assert.equal(direct.url, imageban.replace('/thumbs/', '/out/').replace('2026.03.20', '2026/03/20'));
  assert.equal(direct.kind, 'full');
  assert(resolve(imageban).some(c => c.url === imageban));
  const png = fixtures.find(f => f.provider === 'imageban' && f.url.endsWith('.png')).url;
  assert(resolve(png)[0].url.endsWith('.png'));
});
test('Radikal HTTPS attempt retains original HTTP', () => {
  const url = fixtures.find(f => f.provider === 'radikal' && f.url.startsWith('http:')).url;
  assert.deepEqual(resolve(url).map(c => c.url), [url.replace('http:', 'https:'), url]);
});
test('ImageBam does not invent a full-size path', () => {
  const url = fixtures.find(f => f.provider === 'imagebam').url;
  assert.deepEqual(resolve(url).map(c => c.url), [url]);
  assert.equal(resolve(url)[0].kind, 'thumbnail');
});
test('PostImg and ibb page/direct distinction', () => {
  assert(page('https://postimg.cc/qgy9TLb5')); assert(page('https://ibb.co/abc'));
  assert(!page('https://i.postimg.cc/qgy9TLb5/01.jpg')); assert(!page('https://i.ibb.co/abc/01.png'));
  assert.equal(resolve('https://postimg.cc/qgy9TLb5')[0].url, 'https://postimg.cc/qgy9TLb5');
  assert.notEqual(key('https://i.postimg.cc/ABC/one.jpg'), key('https://i.postimg.cc/ABC/two.jpg'));
});
test('Invalid/empty inputs and protocols', () => {
  for (const url of ['', ' ', 'not url', 'file:///tmp/a', 'javascript:alert(1)', 'data:image/png,x', 'ftp://host/a.jpg', 'https://user:pass@example.com/a']) assert.deepEqual(resolve(url), []);
});
test('Entities, whitespace, duplicates, query parameters and order', () => {
  assert.equal(normalize(' https://example.com/ a.gif?a=1&amp;b=2 '), 'https://example.com/a.gif?a=1&b=2');
  assert.equal(normalize('[img]http://unknown.example/a.gif[/img]'), 'http://unknown.example/a.gif');
  assert.deepEqual(unique([fastpic, imageban, fastpic]), [fastpic, imageban]);
  assert.notEqual(key('https://example.com/a?token=1'), key('https://example.com/a?token=2'));
  assert.equal(resolve('http://unknown.example/a.gif')[0].url, 'http://unknown.example/a.gif');
  assert.equal(resolve('https://evilfastpic.org/a.jpg')[0].provider, 'generic');
});
console.log(`${passed} resolver tests passed; ${fixtures.length} real fixtures verified`);
