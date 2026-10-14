const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { test } = require('node:test');
const { checkSession, checkSessionHealth } = require('../scraper/browser.cjs');
const { getScraperCategory, getConsoleScriptPath } = require('../scraper/scraperBridge.cjs');

function loadBrowserSession(chromium) {
  const filename = path.resolve(__dirname, '../scraper/browserSession.cjs');
  const sessionModule = new Module(filename, module);
  sessionModule.filename = filename;
  sessionModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = sessionModule.require.bind(sessionModule);
  sessionModule.require = id => {
    if (id === 'playwright') return { chromium };
    if (id === './scraperBridge.cjs') return {
      getConsoleScriptPath: () => '', getScraperCategory, injectConsoleScript: async () => {}, runScrapeFlow: async () => [],
    };
    if (id === './exportCatalogs.cjs') return { exportCatalogsAtomic: async () => ({}) };
    return originalRequire(id);
  };
  sessionModule._compile(fs.readFileSync(filename, 'utf8'), filename);
  return sessionModule.exports;
}

function loadScraperManager(SessionClass) {
  const filename = path.resolve(__dirname, '../electron/scraper/scraperManager.cjs');
  const managerModule = new Module(filename, module);
  managerModule.filename = filename;
  managerModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = managerModule.require.bind(managerModule);
  managerModule.require = id => {
    if (id === 'electron') return { BrowserWindow: { getAllWindows: () => [] }, app: null, dialog: {}, shell: {} };
    if (id === '../database/dbMain.cjs' || id.startsWith('../database/repositories/')) return {};
    if (id === '../indexer/normalize.cjs') return {};
    if (id === './executionPlan.cjs') return { normalizeScraperOptions: value => value, createExecutionPlan: value => value };
    if (id === '../../scraper/browserSession.cjs') return { ScraperBrowserSession: SessionClass, isScraperProfileActive: () => false };
    if (id === '../../scraper/platformPaths.cjs') return { resolveScraperProfileDirectory: value => path.join(value, 'scraper-profile') };
    if (id === '../../scraper/accessProbe.cjs') return require('../scraper/accessProbe.cjs');
    if (id === '../../scraper/processLock.cjs') return { removeStaleScraperLock: () => false };
    return originalRequire(id);
  };
  managerModule._compile(fs.readFileSync(filename, 'utf8'), filename);
  return managerModule.exports;
}

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
      querySelector: selector => /login|authentication/i.test(selector) ? null : ({}),
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

test('Default health check uses the first enabled configured category', async () => {
  const page = mockPage();
  assert.equal((await checkSession(page)).valid, true);
  assert.equal(page.urls[1], getScraperCategory().baseUrl);
});

test('Subforum challenge stops execution and recommends category-specific renewal', async () => {
  const page = mockPage({ subStatus: 403, subHeaders: { 'cf-mitigated': 'challenge' } });
  await assert.rejects(checkSessionHealth(page, { category: 'xbox' }), error => {
    assert.equal(error.code, 'INTERACTION_REQUIRED');
    assert.match(error.message, /INTERACTION_REQUIRED/);
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

test('An empty but structurally valid category is accessible', async () => {
  const result = await checkSession(mockPage({ topics: 0 }), { category: 'xbox' });
  assert.equal(result.valid, true);
  assert.equal(result.details.accessResult.status, 'ACCESSIBLE_EMPTY');
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
    if (id === './browserSession.cjs') {
        return {
          ScraperBrowserSession: class {
            async start(options) { Object.assign(this, await browser.launchBrowser(options)); }
            async navigate(url, options) { return this.page.goto(url, options); }
            async healthCheck(options) { return browser.checkSessionHealth(this.page, options); }
          async inspectCurrentCategory(page, category) {
            return browser.inspectCurrentCategory
              ? browser.inspectCurrentCategory(page, category)
              : { status: 'NETWORK_ERROR' };
          }
          async injectScraper(options) { return bridge.injectConsoleScript(this.page, options); }
          async run() { return []; }
          async close() { if (this.context) await this.context.close(); }
        },
      };
    }
    if (id === './scraperBridge.cjs') return { getScraperCategory, ...bridge };
    if (id === './exportCatalogs.cjs') return exports;
    return originalRequire(id);
  };
  runnerModule._compile(fs.readFileSync(filename, 'utf8'), filename);
  return runnerModule.exports;
}

test('Runner passes Xbox into health validation and exits cleanly on interaction required', async () => {
  let injected = false;
  let exported = false;
  let closed = false;
  const runner = loadRunner({
    launchBrowser: async () => ({ context: { close: async () => { closed = true; } }, page: {} }),
    checkSessionHealth: async (_page, options) => {
      assert.equal(options.category, 'xbox');
      throw Object.assign(new Error('INTERACTION_REQUIRED: challenge'), { code: 'INTERACTION_REQUIRED' });
    },
  }, {
    injectConsoleScript: async () => { injected = true; },
  }, {
    exportCatalogsAtomic: () => { exported = true; },
  });
  const originalExitCode = process.exitCode;
  try {
    await runner.runScraper({ category: 'xbox' });
    assert.equal(process.exitCode, 0);
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
      page.bringToFront = async () => {};
      return { context, page, profileDir: '/test/profile' };
    },
  }, {}, {});
  await runner.runScraper({ login: true, category: 'xbox' });
  assert.equal(loginUrl, 'https://rutracker.org/forum/viewforum.php?f=887');
});

test('Persistent sessions serialize one profile and await a clean Chromium exit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-profile-lifecycle-'));
  const profileDir = path.join(root, 'userData', 'scraper-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'SingletonLock'), 'must not be removed by the app');
  let launches = 0;

  const chromium = {
    executablePath: () => '/mock/chromium',
    launchPersistentContext: async requestedPath => {
      launches += 1;
      assert.equal(requestedPath, profileDir);
      const process = new EventEmitter();
      process.pid = 1234 + launches;
      process.exitCode = null;
      process.signalCode = null;
      process.killed = false;
      const page = new EventEmitter();
      page.mainFrame = () => ({});
      const context = new EventEmitter();
      context.pages = () => [page];
      context.browser = () => ({ process: () => process });
      context.cookies = async () => [{ value: 'sensitive-1' }, { value: 'sensitive-2' }];
      context.close = async () => {
        context.emit('close');
        setImmediate(() => { process.exitCode = 0; process.emit('exit', 0, null); });
      };
      context.newPage = async () => page;
      return context;
    },
  };
  const { ScraperBrowserSession } = loadBrowserSession(chromium);
  const headed = new ScraperBrowserSession({ userDataDir: profileDir, mode: 'verification' });
  const headless = new ScraperBrowserSession({ userDataDir: profileDir, mode: 'preflight' });
  try {
    await headed.start({ headless: false });
    assert.equal(headed.profileDir, headless.profileDir);
    assert.equal(headed.browserPid, 1235);
    assert.equal(await headed.getCookieCount(), 2);
    await assert.rejects(headless.start({ headless: true }), /SCRAPER_PROFILE_BUSY/);
    assert.equal(launches, 1);
    assert.equal(fs.existsSync(path.join(profileDir, 'SingletonLock')), true);

    await headed.close('verified');
    assert.equal(headed.state, 'closed');
    await headless.start({ headless: true });
    assert.equal(headless.profileDir, profileDir);
    await headless.close('reprobe_complete');
    assert.equal(launches, 2);
  } finally {
    if (headed.state !== 'closed') await headed.close('test_cleanup').catch(() => {});
    if (headless.state !== 'closed') await headless.close('test_cleanup').catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Navigation logs separate app attempts, page navigations, and subrequests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-navigation-trace-'));
  const profileDir = path.join(root, 'profile');
  const frame = {};
  const page = new EventEmitter();
  page.mainFrame = () => frame;
  page.goto = async url => {
    const request = {
      url: () => url,
      isNavigationRequest: () => true,
      frame: () => frame,
      resourceType: () => 'document',
      redirectedFrom: () => null,
    };
    page.emit('request', request);
    const response = {
      url: () => url,
      status: () => 403,
      headers: () => ({ 'cf-mitigated': 'challenge' }),
      request: () => request,
    };
    page.emit('response', response);
    return response;
  };

  const context = new EventEmitter();
  context.pages = () => [page];
  context.browser = () => null;
  context.cookies = async () => [];
  context.close = async () => context.emit('close');
  const { ScraperBrowserSession } = loadBrowserSession({
    executablePath: () => '/mock/chromium',
    launchPersistentContext: async () => context,
  });
  const session = new ScraperBrowserSession({ userDataDir: profileDir, mode: 'preflight', requestId: 'preflight-test' });
  const navigationResults = [];
  session.onNavigationResult = result => navigationResults.push(result);
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));
  try {
    await session.start({ headless: true });
    await session.navigate('https://rutracker.org/forum/viewforum.php?f=1605');

    const subrequest = {
      url: () => 'https://rutracker.org/forum/viewforum.php?f=1605',
      isNavigationRequest: () => false,
      frame: () => frame,
      resourceType: () => 'xhr',
      redirectedFrom: () => null,
    };
    page.emit('request', subrequest);
    page.emit('response', {
      url: subrequest.url,
      status: () => 403,
      headers: () => ({ 'cf-mitigated': 'challenge' }),
      request: () => subrequest,
    });

    const pageNavigation = {
      url: () => 'https://rutracker.org/forum/viewforum.php?f=1605',
      isNavigationRequest: () => true,
      frame: () => frame,
      resourceType: () => 'document',
      redirectedFrom: () => null,
    };
    page.emit('request', pageNavigation);
    page.emit('response', {
      url: pageNavigation.url,
      status: () => 403,
      headers: () => ({ 'cf-mitigated': 'challenge' }),
      request: () => pageNavigation,
    });

    assert.equal(session.networkLogs.length, 2);
    assert.equal(session.networkLogs[0].initiator, 'app');
    assert.equal(session.networkLogs[1].initiator, 'page');
    assert.equal(navigationResults[1].cfMitigated, 'challenge');
    assert.equal(navigationResults[1].initiator, 'page');
    assert.match(logs.join('\n'), /NAVIGATION_ATTEMPT\] .*initiator=app attempt=1/);
    assert.match(logs.join('\n'), /NAVIGATION_RESULT\] .*initiator=app .*resourceType=document/);
    assert.match(logs.join('\n'), /NAVIGATION_RESULT\] .*initiator=page attempt=browser/);
    assert.doesNotMatch(logs.join('\n'), /NETWORK\]\s+.*viewforum/);
  } finally {
    console.log = originalLog;
    await session.close('test_cleanup').catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Preflight stops after its first Cloudflare challenge across all categories', async () => {
  const attempts = [];
  class Session {
    constructor(options) {
      this.requestId = options.requestId;
      this.contextId = 'test-context';
      this.profileDir = '/test/profile';
    }
    async start() {}
    async close() {}
    async probeCategory(category) {
      attempts.push(category.id);
      return {
        categoryId: category.id,
        categoryName: category.name,
        url: category.baseUrl,
        status: 'INTERACTION_REQUIRED',
        httpStatus: 403,
        challengeDetected: true,
        message: 'Challenge required',
      };
    }
  }
  const ScraperManager = loadScraperManager(Session);
  const manager = Object.create(ScraperManager.prototype);
  manager.probeSession = null;
  manager.probeCancelled = false;
  manager.access = { results: [], expectedCount: 0 };
  manager.getScraperProfilePath = () => '/test/user-data/scraper-profile';
  manager.broadcast = () => {};
  const logs = [];
  manager.addLog = entry => logs.push(entry.message);
  const scope = {
    type: 'all',
    categoryIds: ['switch', 'psx', 'ps2'],
    categories: [
      { id: 'switch', name: 'Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' },
      { id: 'psx', name: 'PSX', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=908' },
      { id: 'ps2', name: 'PS2', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=9' },
    ],
  };

  const result = await manager.probeScope(scope);
  assert.deepEqual(attempts, ['switch']);
  assert.equal(logs.filter(message => message.startsWith('[SCRAPER][PREFLIGHT]')).length, 1);
  assert.equal(result.status, 'INTERACTION_REQUIRED');
  assert.equal(result.expectedCount, 3);
  assert.equal(result.results.filter(item => item.status === 'UNKNOWN').length, 2);
});
