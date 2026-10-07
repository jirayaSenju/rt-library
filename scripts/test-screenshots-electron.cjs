const { app, BrowserWindow, ipcMain, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { registerImageIPC } = require('../electron/images/imageFetch.cjs');
const dbMain = require('../electron/database/dbMain.cjs');
const { normalizeItem } = require('../electron/indexer/normalize.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const Database = require('better-sqlite3');
const fixtures = require('./fixtures/screenshot-urls.json');
const dataDir = path.resolve(process.argv[2] || path.join(__dirname, '../../ecohub-app/data'));
const outputPath = process.argv[3] || path.join(os.tmpdir(), 'rt-screenshot-investigation.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-screenshot-electron-'));
app.setPath('userData', temporary);
let url, viteServer;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAHxcCAvG9C4sAAAAASUVORK5CYII=', 'base64');
const contractCalls = {};
let requestsActive = 0, requestsPeak = 0;
let window, db;
const report = { matrix: [], counts: [], contracts: [], benchmark: {} };
let benchmarkItem;
const catalog = new Map();
function sourceFile(name) {
  if (!catalog.has(name)) {
    const json = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
    catalog.set(name, json.items || json);
  }
  return catalog.get(name);
}
function transport(input, options) {
  if (input.startsWith('https://example.com/rt-image-contract/')) {
    const name = new URL(input).pathname.split('/').pop();
    contractCalls[name] = (contractCalls[name] || 0) + 1;
    if (name.includes('404')) return Promise.resolve(new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } }));
    if (name.includes('html')) return Promise.resolve(new Response('<html>anti-hotlink</html>', { headers: { 'content-type': 'text/html' } }));
    if (name.includes('gif')) return Promise.resolve(new Response(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), { headers: { 'content-type': 'image/gif' } }));
    if (name.includes('large')) return Promise.resolve(new Response(Buffer.concat([png, Buffer.alloc(16 * 1024 * 1024)]), { headers: { 'content-type': 'image/png' } }));
    if (name.includes('decode')) return Promise.resolve(new Response('invalid png', { headers: { 'content-type': 'image/png' } }));
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('Aborted')); };
      const timer = setTimeout(() => { options.signal.removeEventListener('abort', abort); resolve(new Response(png, { headers: { 'content-type': 'image/png' } })); }, name.includes('timeout') ? 12000 : name.includes('slow') ? 2000 : 80);
      options.signal.addEventListener('abort', abort, { once: true });
    });
  }
  requestsActive++; requestsPeak = Math.max(requestsPeak, requestsActive);
  return net.fetch(input, options).finally(() => requestsActive--);
}
const execute = code => window.webContents.executeJavaScript(code, true);
async function contract(name, code) {
  const result = await execute(`(async () => { ${code} })()`);
  assert(result === true, `${name}: ${JSON.stringify(result)}`);
  report.contracts.push(name); console.log(`PASS ${name}`);
}
const waitFor = `(async predicate => { const start = performance.now(); while (!predicate()) { if (performance.now() - start > 45000) throw new Error('UI wait timed out'); await new Promise(r => setTimeout(r, 30)); } })`;
const timeout = setTimeout(() => { console.error('Electron screenshot test exceeded overall deadline'); app.exit(1); }, 240000);
app.whenReady().then(async () => {
  const { createServer } = await import('vite');
  viteServer = await createServer({ root: path.resolve(__dirname, '..'), server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await viteServer.listen();
  url = `http://127.0.0.1:${viteServer.httpServer.address().port}`;
  db = dbMain.initDatabase(temporary);
  for (const fixture of fixtures) {
    const categoryId = fixture.catalog.replace('.json', '');
    const raw = sourceFile(fixture.catalog).find(item => item.id === fixture.itemId);
    assert(raw, fixture.itemId);
    categoriesRepo.upsert(db, { id: categoryId, name: categoryId });
    const item = normalizeItem(raw, categoryId, categoryId);
    itemsRepo.upsert(db, item);
    const row = db.prepare('SELECT screenshots_json FROM item_details WHERE item_id = ?').get(item.id);
    report.counts.push({ itemId: item.id, catalog: fixture.catalog, json: (raw.content?.screenshots || raw.screenshots || []).length, normalized: item.details.screenshots.length, sqlite: JSON.parse(row.screenshots_json).length });
  }
  for (const name of ['gamecube', 'wii', '3ds', 'ds', 'xbox', 'dreamcast']) {
    const raw = sourceFile(`${name}.json`).find(item => {
      const shots = item.content?.screenshots || item.screenshots || [];
      return shots.length >= 100 && shots.slice(0, 8).every(url => url.includes('fastpic'));
    });
    if (raw) {
      benchmarkItem = normalizeItem(raw, name, name);
      categoriesRepo.upsert(db, { id: name, name });
      itemsRepo.upsert(db, benchmarkItem); break;
    }
  }
  assert(benchmarkItem, 'Real item with 100+ screenshots available');
  const postimgRaw = sourceFile('ps2.json').find(item => item.id === 'topic_6770733');
  assert(postimgRaw, 'Real PostImg regression item');
  categoriesRepo.upsert(db, { id: 'ps2', name: 'ps2' });
  const postimgItem = normalizeItem(postimgRaw, 'ps2', 'ps2');
  itemsRepo.upsert(db, postimgItem);
  report.storageRegression = { itemId: postimgItem.id, json: postimgRaw.content.screenshots.length, normalized: postimgItem.details.screenshots.length };

  for (const [id, screenshots] of [['rt-test-empty', []], ['rt-test-dead', ['https://example.com/rt-image-contract/404-dead.png']], ['rt-test-a', ['https://example.com/rt-image-contract/slow-a.png']], ['rt-test-b', ['https://example.com/rt-image-contract/ok-b.png']]]) {
    itemsRepo.upsert(db, { id, categoryId: 'gamecube', title: id, cleanTitle: id, details: { screenshots } });
  }
  require('../electron/ipc/libraryIPC.cjs').registerLibraryIPCHandlers();
  ipcMain.handle('load-app-config', () => null);
  ipcMain.handle('get-config-dir', () => temporary);
  ipcMain.handle('torrent:getMetadata', () => null);
  registerImageIPC({ ipcMain, net: { fetch: transport }, trustedUrl: input => new URL(input).origin === url });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await window.loadURL(url);
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) console.log('RENDERER', message); });
  await execute(`(async () => {
    window.testLoader = await import('/src/services/screenshotLoader.ts');
    window.testCache = (await import('/src/services/imageCache.ts')).imageCacheService;
    window.testResolver = await import('/src/services/screenshotResolver.ts');
    window.testReact = (await import('/node_modules/.vite/deps/react.js')).default;
    window.testReactDom = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    window.testModal = (await import('/src/components/library/ItemDetailModal.tsx')).ItemDetailModal;
    const appRoot = document.getElementById('root'); appRoot.style.display = 'none';
    const host = document.createElement('div'); document.body.appendChild(host);
    window.testRoot = window.testReactDom.createRoot(host);
    window.testMount = (item, isOpen = true) => window.testRoot.render(window.testReact.createElement(window.testModal, {
      item, isOpen, isFavorite: false, onToggleFavorite: () => {}, onClose: () => window.testMount(item, false),
    }));
  })()`);
  await contract('A blocked legacy IndexedDB upgrade displays uncached and recovers', `
    const legacy = await new Promise((resolve, reject) => {
      const request = indexedDB.open('RTLibraryImageCache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('cached_images', { keyPath: 'url' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const result = await testLoader.loadScreenshot('https://example.com/rt-image-contract/cache-blocked.png', { itemId: 'cache-blocked', quality: 'full', signal: new AbortController().signal });
      testCache.revokeObjectUrl(result.src);
      if (!testLoader.getScreenshotDiagnostics('cache-blocked').flat().some(entry => entry.status === 'cache_error')) return false;
    } finally { legacy.close(); }
    await new Promise(resolve => setTimeout(resolve, 50));
    await testCache.getBlob('recovery-missing-key');
    return testCache.db.version === 2;
  `);
  // Validate the existing user's DB through a separate read-only connection.
  const actualPath = path.join(os.homedir(), '.config/rt-library/rt-library-v2.sqlite');
  if (fs.existsSync(actualPath)) {
    const actual = new Database(actualPath, { readonly: true, fileMustExist: true });
    for (const count of report.counts) {
      const row = actual.prepare('SELECT screenshots_json FROM item_details WHERE item_id = ?').get(count.itemId);
      count.existingSqlite = row ? JSON.parse(row.screenshots_json || '[]').length : null;
    }
    actual.close();
  }
  for (const count of report.counts) {
    count.ipc = await execute(`window.rtLibrary.library.getScreenshots(${JSON.stringify(count.itemId)}).then(result => result.screenshots.length)`);
    count.modal = await execute(`window.rtLibrary.library.getScreenshots(${JSON.stringify(count.itemId)}).then(result => window.testResolver.uniqueScreenshotUrls(result.screenshots).length)`);
    assert.equal(count.sqlite, count.ipc); assert.equal(count.ipc, count.modal);
  }
  await contract('Real PostImg entries preserve their full count through SQLite, IPC and modal identity', `
    const item = await window.rtLibrary.library.getItem('topic_6770733');
    return item.screenshots.length === 12 && window.testResolver.uniqueScreenshotUrls(item.screenshots).length === 12;
  `);
  report.storageRegression.ipc = await execute(`window.rtLibrary.library.getItem('topic_6770733').then(item => item.screenshots.length)`);
  // Compare renderer CORS with Main transfer for actual HTTP/HTTPS providers.
  report.directRenderer = await execute(`(async () => {
    const results = [];
    for (const input of ${JSON.stringify([fixtures[0].url, fixtures[1].url, fixtures[1].url.replace('http:', 'https:'), fixtures.find(f => f.provider === 'radikal').url])}) {
      try { const r = await fetch(input, { signal: AbortSignal.timeout(10000) }); results.push({ url: input, status: r.status, contentType: r.headers.get('content-type'), redirected: r.redirected }); }
      catch (error) { results.push({ url: input, error: error.message }); }
    }
    return results;
  })()`);
  for (const fixture of fixtures) {
    const result = await execute(`(async () => {
      const started = performance.now();
      const controller = new AbortController();
      let src;
      try {
        const result = await window.testLoader.loadScreenshot(${JSON.stringify(fixture.url)}, { itemId: ${JSON.stringify(fixture.itemId)}, quality: 'full', signal: controller.signal });
        src = result.src;
        const image = new Image(); image.src = src; await image.decode();
        return { selected: result.selected, render: 'loaded', width: image.naturalWidth, height: image.naturalHeight, durationMs: performance.now() - started,
          attempts: window.testLoader.getScreenshotDiagnostics(${JSON.stringify(fixture.itemId)}).find(entries => entries[0]?.originalUrl === ${JSON.stringify(fixture.url)}) || [] };
      } catch (error) { return { render: 'failed', error: error.message, durationMs: performance.now() - started,
        attempts: window.testLoader.getScreenshotDiagnostics(${JSON.stringify(fixture.itemId)}).find(entries => entries[0]?.originalUrl === ${JSON.stringify(fixture.url)}) || [] }; }
      finally { if (src) window.testCache.revokeObjectUrl(src); }
    })()`);
    report.matrix.push({ ...fixture, ...result });
    console.log(`FIXTURE ${fixture.provider} ${fixture.catalog} ${result.render} ${result.width || ''} ${Math.round(result.durationMs)}ms`);
    if (['fastpic', 'imageban', 'imagebam', 'postimg'].includes(fixture.provider)) assert.equal(result.render, 'loaded', fixture.url);
  }
  await contract('Cache hit returns an independently owned Object URL', `
    const input = ${JSON.stringify(fixtures[0].url)};
    const one = await testLoader.loadScreenshot(input, { itemId: 'cache-check', quality: 'full', signal: new AbortController().signal });
    const two = await testLoader.loadScreenshot(input, { itemId: 'cache-check', quality: 'full', signal: new AbortController().signal });
    testCache.revokeObjectUrl(one.src); const image = new Image(); image.src = two.src; await image.decode(); testCache.revokeObjectUrl(two.src);
    return one.src !== two.src && testLoader.getScreenshotDiagnostics('cache-check').some(entries => entries.some(entry => entry.cacheHit));`);
  await contract('Legacy HTML/empty/MIME corruption is deleted and decode corruption refetched', `
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('RTLibraryImageCache', 2); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const input = 'https://example.com/rt-image-contract/cache-valid.png';
    const key = testLoader.screenshotCacheKey(input, input);
    for (const blob of [new Blob(['<html>bad</html>'], { type: 'text/html' }), new Blob([], { type: 'image/png' }), new Blob(['junk'], { type: 'application/octet-stream' })]) {
      await new Promise((resolve, reject) => { const tx = db.transaction('cached_images', 'readwrite'); tx.objectStore('cached_images').put({ url: key, blob, sizeBytes: blob.size, createdAt: 1, lastAccessedAt: 1 }); tx.oncomplete = resolve; tx.onerror = reject; });
      if (await testCache.getBlob(key)) return false;
      const remains = await new Promise(resolve => { const req = db.transaction('cached_images').objectStore('cached_images').get(key); req.onsuccess = () => resolve(req.result); });
      if (remains) return false;
    }
    await testCache.putBlob(key, new Blob(['not a png'], { type: 'image/png' }));
    const result = await testLoader.loadScreenshot(input, { itemId: 'cache-corrupt', quality: 'full', signal: new AbortController().signal });
    testCache.revokeObjectUrl(result.src); db.close(); return true;`);
  await contract('A stalled cache read does not block valid network display', `
    const original = testCache.getBlob;
    testCache.getBlob = () => new Promise(() => {});
    const started = performance.now();
    try {
      const result = await testLoader.loadScreenshot('https://example.com/rt-image-contract/cache-offline.png', { itemId: 'cache-offline', quality: 'full', signal: new AbortController().signal });
      testCache.revokeObjectUrl(result.src);
      return performance.now() - started < 2500 && testLoader.getScreenshotDiagnostics('cache-offline').flat().some(entry => entry.status === 'cache_error');
    } finally { testCache.getBlob = original; }
  `);
  await contract('Abort cancels a stalled cache operation and releases its slot', `
    const original = testCache.getBlob;
    testCache.getBlob = () => new Promise(() => {});
    const controller = new AbortController();
    const started = performance.now();
    try {
      const result = testLoader.loadScreenshot('https://example.com/rt-image-contract/cache-abort.png', { itemId: 'cache-abort', quality: 'full', signal: controller.signal }).then(() => false, () => true);
      setTimeout(() => controller.abort(), 30);
      const aborted = await result;
      await ${waitFor}(() => testLoader.screenshotQueueStats().active === 0);
      return aborted && performance.now() - started < 500;
    } finally { testCache.getBlob = original; }
  `);
  await contract('HTTP 200 HTML and decode errors are never cached', `
    for (const name of ['html', 'decode']) {
      const input = 'https://example.com/rt-image-contract/' + name + '.png';
      try { await testLoader.loadScreenshot(input, { itemId: 'invalid', quality: 'full', signal: new AbortController().signal }); return false; } catch {}
      if (await testCache.getBlob(testLoader.screenshotCacheKey(input, input))) return false;
    } return true;`);
  await contract('Simultaneous consumers deduplicate fetch and own separate URLs', `
    const input = 'https://example.com/rt-image-contract/shared.png';
    const results = await Promise.all([1, 2].map(() => testLoader.loadScreenshot(input, { itemId: 'shared', quality: 'full', signal: new AbortController().signal })));
    const different = results[0].src !== results[1].src; results.forEach(result => testCache.revokeObjectUrl(result.src)); return different;`);
  assert.equal(contractCalls['shared.png'], 1);
  await contract('Negative cache prevents repeated 404; retry is individual', `
    const input = 'https://example.com/rt-image-contract/404.png';
    for (let index = 0; index < 2; index++) { try { await testLoader.loadScreenshot(input, { itemId: 'negative', quality: 'full', signal: new AbortController().signal }); } catch {} }
    return true;`);
  assert.equal(contractCalls['404.png'], 1);
  await contract('Explicit retry bypasses only this screenshot negative cache', `
    const input = 'https://example.com/rt-image-contract/404.png';
    try { await testLoader.loadScreenshot(input, { itemId: 'negative', quality: 'full', retry: true, signal: new AbortController().signal }); } catch {}
    return true;`);
  assert.equal(contractCalls['404.png'], 2);
  await contract('GIF decode and images above 15 MB display without IDB storage', `
    for (const name of ['gif', 'large']) {
      const input = 'https://example.com/rt-image-contract/' + name + '.png';
      const result = await testLoader.loadScreenshot(input, { itemId: 'sizes', quality: 'full', signal: new AbortController().signal });
      const image = new Image(); image.src = result.src; await image.decode(); testCache.revokeObjectUrl(result.src);
      if (name === 'large' && await testCache.getBlob(testLoader.screenshotCacheKey(input, input))) return false;
    } return true;`);
  await contract('One shared consumer can cancel while the other still loads', `
    const input = 'https://example.com/rt-image-contract/slow-shared.png';
    const controller = new AbortController();
    const first = testLoader.loadScreenshot(input, { itemId: 'cancel-one', quality: 'full', signal: controller.signal }).then(() => false, () => true);
    const second = testLoader.loadScreenshot(input, { itemId: 'keep-one', quality: 'full', signal: new AbortController().signal });
    setTimeout(() => controller.abort(), 30);
    const result = await second; testCache.revokeObjectUrl(result.src); return await first;`);
  assert.equal(contractCalls['slow-shared.png'], 1);
  await contract('A candidate reaches timeout and leaves the queue', `
    const input = 'https://example.com/rt-image-contract/timeout.png';
    const started = performance.now();
    try { await testLoader.loadScreenshot(input, { itemId: 'timeout', quality: 'full', signal: new AbortController().signal }); return false; } catch {}
    return performance.now() - started < 12000 && testLoader.getScreenshotDiagnostics('timeout').flat().some(entry => entry.status === 'timeout');`);
  await contract('Cancellation leaves no active/queued stale requests' , `
    const controller = new AbortController();
    const jobs = Array.from({ length: 12 }, (_, index) => testLoader.loadScreenshot('https://example.com/rt-image-contract/slow-' + index + '.png', { itemId: 'cancel', quality: 'full', signal: controller.signal }).then(result => { testCache.revokeObjectUrl(result.src); return 'unexpected'; }, () => 'aborted'));
    setTimeout(() => controller.abort(), 30);
    const results = await Promise.all(jobs);
    await ${waitFor}(() => testLoader.screenshotQueueStats().active === 0);
    return results.every(result => result === 'aborted') && testLoader.screenshotQueueStats().queued === 0;`);
  await contract('Empty array and failed URLs have different UI states', `
    const empty = await rtLibrary.library.getItem('rt-test-empty'); testMount(empty);
    await ${waitFor}(() => document.body.textContent.includes('No screenshots available'));
    const dead = await rtLibrary.library.getItem('rt-test-dead'); testMount(dead);
    await ${waitFor}(() => document.body.textContent.includes('Screenshots unavailable'));
    return document.body.textContent.includes('Image unavailable') && Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Retry');`);
  await contract('Switching items cancels A and displays only B', `
    testMount(await rtLibrary.library.getItem('rt-test-a')); await new Promise(resolve => setTimeout(resolve, 40));
    testMount(await rtLibrary.library.getItem('rt-test-b'));
    await ${waitFor}(() => document.querySelector('img[alt="Screenshot 1"]')?.complete);
    await new Promise(resolve => setTimeout(resolve, 2100));
    return testLoader.getScreenshotDiagnostics('rt-test-a').flat().every(entry => entry.status !== 'loaded') && document.body.textContent.includes('rt-test-b');`);
  const shots = benchmarkItem.details.screenshots;
  report.benchmark = await execute(`(async () => {
    const item = await rtLibrary.library.getItem(${JSON.stringify(benchmarkItem.id)});
    let peakActive = 0; const sample = setInterval(() => { peakActive = Math.max(peakActive, testLoader.screenshotQueueStats().active); }, 5);
    const started = performance.now(); testMount(item);
    await ${waitFor}(() => document.querySelectorAll('button[aria-label^="Enlarge screenshot"]').length === 8);
    const modalOpenMs = performance.now() - started;
    await ${waitFor}(() => Array.from(document.querySelectorAll('img[alt^="Screenshot"]')).some(image => image.complete && image.naturalWidth > 0));
    const firstImageMs = performance.now() - started;
    await ${waitFor}(() => document.querySelectorAll('img[alt^="Screenshot"]').length === 8 && Array.from(document.querySelectorAll('img[alt^="Screenshot"]')).every(image => image.complete && image.naturalWidth > 0));
    const firstPageMs = performance.now() - started;
    clearInterval(sample);
    const attempts = testLoader.getScreenshotDiagnostics(item.id).flat();
    return { itemId: item.id, screenshotCount: item.screenshots.length, modalOpenMs, firstImageMs, firstPageMs, peakActive,
      requestedEntries: new Set(attempts.map(entry => entry.originalUrl)).size, cacheHits: attempts.filter(entry => entry.cacheHit).length,
      rendererHeapBytes: performance.memory?.usedJSHeapSize, domImages: document.querySelectorAll('img[alt^="Screenshot"]').length };
  })()`);
  assert(shots.length >= 100); assert.equal(report.benchmark.requestedEntries, 8); assert(report.benchmark.peakActive <= 6);
  await contract('Pagination fetches only the next eight entries', `
    document.querySelector('button[title="Next page"]').click();
    await ${waitFor}(() => document.querySelector('img[alt="Screenshot 9"]')?.complete);
    const attempts = testLoader.getScreenshotDiagnostics(${JSON.stringify(benchmarkItem.id)}).flat();
    return new Set(attempts.map(entry => entry.originalUrl)).size <= 16 && document.querySelectorAll('button[aria-label^="Enlarge screenshot"]').length === 8;`);
  await contract('Lightbox is bounded to eight thumbnails and closes with Escape', `
    document.querySelector('button[aria-label="Enlarge screenshot 9"]').click();
    await ${waitFor}(() => document.body.textContent.includes('Screenshot Viewer'));
    const bounded = document.querySelectorAll('button[aria-label^="Enlarge screenshot"]').length <= 16;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await new Promise(resolve => setTimeout(resolve, 100));
    return bounded && !document.body.textContent.includes('Screenshot Viewer');`);
  await contract('Unmount revokes all component-owned URLs and debug global', `
    testRoot.unmount(); await new Promise(resolve => setTimeout(resolve, 80));
    await ${waitFor}(() => testLoader.screenshotQueueStats().active === 0);
    return !window.__debugScreenshots && testCache.activeObjectUrls.size === 0;`);
  report.networkPeak = requestsPeak;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log('BENCHMARK', JSON.stringify(report.benchmark));
  console.log(`PASS Electron screenshot integration: ${report.contracts.length} contracts, ${report.matrix.length} fixtures; report ${outputPath}`);
  clearTimeout(timeout); window.destroy(); dbMain.closeDatabase(); await viteServer.close(); app.quit();
}).catch(async error => {
  fs.writeFileSync(outputPath, JSON.stringify({ ...report, failed: error.stack }, null, 2));
  console.error(error); clearTimeout(timeout); if (window && !window.isDestroyed()) window.destroy(); dbMain.closeDatabase(); await viteServer?.close(); app.exit(1);
});
