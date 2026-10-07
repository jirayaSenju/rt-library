const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { test } = require('node:test');
const { checkSession, checkSessionHealth } = require('../scraper/browser.cjs');
const { getScraperCategory, getConsoleScriptPath } = require('../scraper/scraperBridge.cjs');

function mockPage({ subStatus = 200, subHeaders = {}, topics = 5, indexHeaders = {} } = {}) {
  const page = new EventEmitter();
  page.urls = [];
  page.goto = async url => {
    page.urls.push(url);
    const index = url.endsWith('index.php');
    return {
      status: () => index ? 200 : subStatus,
      headers: () => index ? indexHeaders : subHeaders,
    };
  };
  page.title = async () => 'Forum';
  page.evaluate = async fn => vm.runInNewContext(`(${fn})()`, {
    document: {
      body: { innerText: 'Forum topics' },
      querySelector: () => ({}),
      querySelectorAll: () => Array(topics).fill({}),
    },
  });
  return page;
}

test('Xbox health check uses f=887 and removes its response listener', async () => {
  const page = mockPage();
  const result = await checkSession(page, { category: 'xbox' });
  assert.equal(result.valid, true);
  assert.equal(result.details.topicCount, 5);
  assert.deepEqual(page.urls, [
    'https://rutracker.org/forum/index.php',
    'https://rutracker.org/forum/viewforum.php?f=887',
  ]);
  assert.equal(page.listenerCount('response'), 0);
});

test('Default health check preserves the existing Wii forum', async () => {
  const page = mockPage();
  assert.equal((await checkSession(page)).valid, true);
  assert.equal(page.urls[1], 'https://rutracker.org/forum/viewforum.php?f=773');
});

test('Subforum challenge stops execution and recommends category-specific renewal', async () => {
  const page = mockPage({ subStatus: 403, subHeaders: { 'cf-mitigated': 'challenge' } });
  await assert.rejects(checkSessionHealth(page, { category: 'xbox' }), error => {
    assert.match(error.message, /SCRAPER_SESSION_INVALID/);
    assert.match(error.message, /npm run scraper:login -- --category xbox/);
    assert.match(error.message, /viewforum.php\?f=887/);
    return true;
  });
  assert.equal(page.listenerCount('response'), 0);
});

test('Challenge headers are rejected even with HTTP 200', async () => {
  const result = await checkSession(mockPage({ subHeaders: { 'cf-mitigated': 'challenge' } }), { category: 'xbox' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'challenge');
});

test('Index challenge stops before subforum navigation', async () => {
  const page = mockPage({ indexHeaders: { 'cf-mitigated': 'challenge' } });
  assert.equal((await checkSession(page, { category: 'xbox' })).reason, 'challenge');
  assert.equal(page.urls.length, 1);
});

test('Missing topics cannot pass session validation', async () => {
  assert.equal((await checkSession(mockPage({ topics: 0 }), { category: 'xbox' })).valid, false);
});

test('Unknown category fails before making network requests', async () => {
  const page = mockPage();
  await assert.rejects(checkSession(page, { category: 'missing' }), /SCRAPER_CATEGORY_INVALID/);
  assert.equal(page.urls.length, 0);
});

test('Node category metadata and browser scraper use the same console script', () => {
  assert.equal(getScraperCategory('switch').baseUrl, 'https://rutracker.org/forum/viewforum.php?f=1605');
  const browser = { window: {}, console: { log() {} } };
  vm.runInNewContext(fs.readFileSync(getConsoleScriptPath(), 'utf8'), browser);
  assert.equal(typeof browser.window.EcoHubScraper.start, 'function');
  assert.equal(browser.window.EcoHubScraper.isRunning, false);
});

function loadRunner(browser, bridge, exports) {
  const filename = path.resolve(__dirname, '../scraper/runner.cjs');
  const runnerModule = new Module(filename, module);
  runnerModule.filename = filename;
  runnerModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = runnerModule.require.bind(runnerModule);
  runnerModule.require = id => {
    if (id === './browser.cjs') return browser;
    if (id === './scraperBridge.cjs') return { getScraperCategory, ...bridge };
    if (id === './exportCatalogs.cjs') return exports;
    return originalRequire(id);
  };
  runnerModule._compile(fs.readFileSync(filename, 'utf8'), filename);
  return runnerModule.exports;
}

test('Runner passes Xbox into health validation and never scrapes a challenge', async () => {
  let injected = false;
  let exported = false;
  let closed = false;
  const runner = loadRunner({
    launchBrowser: async () => ({ context: { close: async () => { closed = true; } }, page: {} }),
    checkSessionHealth: async (_page, options) => {
      assert.equal(options.category, 'xbox');
      throw new Error('SCRAPER_SESSION_INVALID: challenge');
    },
  }, {
    injectConsoleScript: async () => { injected = true; },
  }, {
    exportCatalogsAtomic: () => { exported = true; },
  });
  const originalExitCode = process.exitCode;
  try {
    await runner.runScraper({ category: 'xbox' });
    assert.equal(process.exitCode, 1);
    assert.equal(injected, false);
    assert.equal(exported, false);
    assert.equal(closed, true);
  } finally {
    process.exitCode = originalExitCode;
  }
});

test('Login opens the selected subforum in a visible browser', async () => {
  const context = new EventEmitter();
  context.pages = () => [];
  context.close = async () => {};
  let loginUrl;
  const runner = loadRunner({
    launchBrowser: async options => {
      assert.equal(options.headless, false);
      const page = new EventEmitter();
      page.goto = async url => {
        loginUrl = url;
        setImmediate(() => context.emit('close'));
      };
      return { context, page, profileDir: '/test/profile' };
    },
  }, {}, {});
  await runner.runScraper({ login: true, category: 'xbox' });
  assert.equal(loginUrl, 'https://rutracker.org/forum/viewforum.php?f=887');
});
