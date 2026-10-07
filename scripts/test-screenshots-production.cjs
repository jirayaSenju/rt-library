const { app, BrowserWindow, ipcMain, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const dbMain = require('../electron/database/dbMain.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const { normalizeItem } = require('../electron/indexer/normalize.cjs');
const { registerImageIPC } = require('../electron/images/imageFetch.cjs');
const fixture = require('./fixtures/screenshot-urls.json')[0];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-image-production-'));
app.setPath('userData', temporary);
let window;
const output = process.argv[2] || path.join(os.tmpdir(), 'rt-screenshot-production.json');
const report = { errors: [], assertions: [] };
const timeout = setTimeout(() => { console.error('Production smoke timed out'); app.exit(1); }, 60000);
async function waitFor(expression, duration = 15000) {
  return window.webContents.executeJavaScript(`(async () => { const start = performance.now(); while (!(${expression})) { if (performance.now() - start > ${duration}) throw new Error('Production UI not ready: ' + ${JSON.stringify(expression)}); await new Promise(resolve => setTimeout(resolve, 40)); } return true; })()`);
}
app.whenReady().then(async () => {
  const source = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../ecohub-app/data', fixture.catalog), 'utf8'));
  const raw = (source.items || source).find(item => item.id === fixture.itemId);
  const db = dbMain.initDatabase(temporary);
  categoriesRepo.upsert(db, { id: 'gamecube', name: 'GameCube', itemCount: 1 });
  itemsRepo.upsert(db, normalizeItem(raw, 'gamecube', 'GameCube'));
  require('../electron/ipc/libraryIPC.cjs').registerLibraryIPCHandlers();
  ipcMain.handle('load-app-config', () => ({ libraryPath: path.resolve(__dirname, '../../ecohub-app/data') }));
  ipcMain.handle('get-config-dir', () => temporary);
  ipcMain.handle('torrent:getMetadata', () => null);
  const index = path.resolve(__dirname, '../dist/index.html');
  registerImageIPC({ ipcMain, net, trustedUrl: url => url === pathToFileURL(index).href });
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.resolve(__dirname, '../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) report.errors.push(message); });
  await window.loadFile(index);
  report.security = window.webContents.getLastWebPreferences();
  report.security = { webSecurity: report.security.webSecurity, contextIsolation: report.security.contextIsolation, nodeIntegration: report.security.nodeIntegration };
  report.fileHttp = await window.webContents.executeJavaScript(`(async () => {
    const url = ${JSON.stringify(require('./fixtures/screenshot-urls.json')[1].url)};
    let fetchResult;
    try { const response = await fetch(url, { signal: AbortSignal.timeout(10000) }); fetchResult = { status: response.status, contentType: response.headers.get('content-type') }; }
    catch (error) { fetchResult = { error: error.message }; }
    const image = new Image();
    const render = await new Promise(resolve => {
      const timer = setTimeout(() => resolve('timeout'), 10000);
      image.onload = () => { clearTimeout(timer); resolve('loaded'); }; image.onerror = () => { clearTimeout(timer); resolve('failed'); }; image.src = url;
    }); image.src = ''; return { url, fetchResult, rawImg: render };
  })()`);
  await waitFor("document.querySelector('h3[title]')");
  await window.webContents.executeJavaScript("document.querySelector('h3[title]').click()");
  await waitFor("document.querySelectorAll('img[alt^=\"Screenshot\"]').length === 6 && Array.from(document.querySelectorAll('img[alt^=\"Screenshot\"]')).every(image => image.complete && image.naturalWidth > 0)", 25000);
  report.assertions.push('Production bundle renders six real FastPic thumbnails over file://');
  assert.equal(await window.webContents.executeJavaScript("typeof window.__debugScreenshots"), 'undefined');
  report.assertions.push('Development debug global absent from production');
  await window.webContents.executeJavaScript("document.querySelector('button[aria-label=\"Enlarge screenshot 1\"]').click()");
  await waitFor("Array.from(document.querySelectorAll('[role=\"dialog\"]')).find(dialog => dialog.textContent.includes('Screenshot Viewer'))?.querySelector('img[alt=\"Screenshot 1\"]')?.naturalWidth > 500", 25000);
  report.assertions.push('Production lightbox renders full-size FastPic');
  await window.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))");
  await waitFor("document.body.textContent.includes('Screenshot Viewer (2 of 6)')");
  await window.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))");
  await waitFor("document.body.textContent.includes('Screenshot Viewer (1 of 6)')");
  await window.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await waitFor("!document.body.textContent.includes('Screenshot Viewer')");
  report.assertions.push('Arrow navigation and Escape work in the production lightbox');
  assert.equal(report.security.webSecurity, true);
  assert.equal(report.security.contextIsolation, true);
  assert.equal(report.security.nodeIntegration, false);
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS production screenshots:', JSON.stringify(report.assertions));
  clearTimeout(timeout); window.destroy(); dbMain.closeDatabase(); app.quit();
}).catch(error => {
  report.failed = error.stack; fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.error(error); clearTimeout(timeout); if (window && !window.isDestroyed()) window.destroy(); dbMain.closeDatabase(); app.exit(1);
});
