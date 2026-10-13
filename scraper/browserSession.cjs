/**
 * ScraperBrowserSession Module
 * Encapsulates single Chromium process, single PersistentContext, single Page lifecycle,
 * structured health checks, sanitized network tracing, and IndexedDB persistence.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { getConsoleScriptPath, getScraperCategory, injectConsoleScript, runScrapeFlow } = require('./scraperBridge.cjs');
const { exportCatalogsAtomic } = require('./exportCatalogs.cjs');
const { getScraperProfileDir } = require('./platformPaths.cjs');
const { probeCategory, inspectCurrentCategory, classifyCategoryAccess, sanitizeUrlForLog } = require('./accessProbe.cjs');

const activeProfileSessions = new Map();

function isScraperProfileActive(profileDir) {
  return activeProfileSessions.has(path.resolve(profileDir));
}

function cleanStaleProfileLocks(profileDir) {
  try {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    for (const file of lockFiles) {
      const filePath = path.join(profileDir, file);
      if (fs.existsSync(filePath)) {
        try {
          if (process.platform !== 'win32') {
            const linkTarget = fs.readlinkSync(filePath);
            const pidMatch = linkTarget.match(/-(\d+)$/);
            if (pidMatch) {
              const pid = parseInt(pidMatch[1], 10);
              try {
                process.kill(pid, 0);
                continue;
              } catch (_) {
                fs.unlinkSync(filePath);
                console.log(`[SCRAPER][PROFILE] Removed stale Chromium lock file: ${file} (dead pid=${pid})`);
              }
            } else {
              fs.unlinkSync(filePath);
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function isProcessExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function waitForProcessExit(child, timeoutMs) {
  if (isProcessExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('close', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(isProcessExited(child)), timeoutMs);
    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

class ScraperBrowserSession {
  constructor(options = {}) {
    this.options = options;
    this.mode = options.mode || 'scraper';
    this.categoryId = options.categoryId || 'unknown';
    this.context = null;
    this.page = null;
    this.profileDir = options.userDataDir ? path.resolve(options.userDataDir) : getScraperProfileDir();
    this.contextId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.requestId = options.requestId || this.contextId;
    this.browserPid = null;
    this.browserProcess = null;
    this.closePromise = null;
    this.state = 'created'; // created, starting, profile_loaded, index_accessible, target_accessible, challenge_required, ready, running, closing, closed
    this.networkLogs = [];
    this.latestNavigationResponse = null;
    this.navigationSequence = 0;
    this.navigationRequestInfo = new WeakMap();
    this.activeAppNavigation = null;
    this.onNavigationResult = null;
    this.closeReason = null;
    this.closeOrigin = 'unknown'; // USER_CLOSED, APPLICATION_CLOSED, PAGE_DISPLACED_NAV, BROWSER_CRASH, unknown
  }

  async start({ headless = true } = {}) {
    if (this.state !== 'created' && this.state !== 'closed') {
      throw new Error(`SCRAPER_SESSION_ERROR: Cannot start session in state "${this.state}".`);
    }

    this.state = 'starting';
    const owner = activeProfileSessions.get(this.profileDir);
    if (owner && owner !== this.contextId) {
      this.state = 'created';
      throw new Error(`SCRAPER_PROFILE_BUSY: Persistent profile is already owned by context ${owner}.`);
    }
    fs.mkdirSync(this.profileDir, { recursive: true });
    cleanStaleProfileLocks(this.profileDir);
    activeProfileSessions.set(this.profileDir, this.contextId);

    console.log(`[SCRAPER][PROCESS] Initializing single-process Chromium contextId=${this.contextId} (headless=${headless}) ...`);
    console.log(`[SCRAPER][PROFILE] mode=${this.mode} path=${this.profileDir} category=${this.categoryId} requestId=${this.requestId} context=${this.contextId}`);

    const launchArgs = [
      ...(headless ? ['--headless=new'] : []),
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
    ];

    try {
      this.context = await chromium.launchPersistentContext(this.profileDir, {
        headless: false,
        viewport: { width: 1280, height: 800 },
        args: launchArgs,
      });
    } catch (error) {
      if (activeProfileSessions.get(this.profileDir) === this.contextId) activeProfileSessions.delete(this.profileDir);
      this.state = 'closed';
      throw error;
    }

    try {
      this.browserProcess = this.context.browser()?.process?.() || null;
      this.browserPid = this.browserProcess?.pid || null;
    } catch (_) {
      this.browserProcess = null;
      this.browserPid = null;
    }

    console.log(`[SCRAPER][PROCESS] Chromium launched. pid=${this.browserPid} contextId=${this.contextId}`);
    const browser = this.context.browser();
    console.log(`[SCRAPER][CONFIG] mode=${this.mode} playwright=${require('playwright/package.json').version} chromium=${browser?.version?.() || 'unknown'} executable=${chromium.executablePath()} headless=${headless} profile=${this.profileDir} channel=playwright-default viewport=1280x800 locale=default timezone=system userAgent=default proxy=none args=${JSON.stringify(launchArgs)} context=${this.contextId}`);

    this.context.on('close', () => {
      const closeRequestedBy = this.state === 'closing' ? 'APPLICATION' : 'USER';
      const origin = (this.closeOrigin === 'unknown' || !this.closeOrigin) ? (closeRequestedBy === 'USER' ? 'USER_CLOSE' : 'APP_CONTEXT_CLOSE') : this.closeOrigin;
      this.closeOrigin = origin;
      console.log(`[SCRAPER][CLOSE_TRACE] timestamp=${new Date().toISOString()} contextId=${this.contextId} pid=${this.browserPid ?? 'unknown'} event=CONTEXT_CLOSE_EVENT closeRequestedBy=${closeRequestedBy} origin=${origin} reason="Context close event fired" state=${this.state}`);
      console.warn(`[SCRAPER][LIFECYCLE] PersistentContext closed. contextId=${this.contextId} pid=${this.browserPid}`);
      this.state = 'closed';
    });

    this.context.on('page', (newPage) => {
      console.log(`[SCRAPER][LIFECYCLE] New page opened in contextId=${this.contextId}`);
      this.attachPageListeners(newPage);
    });

    this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();
    this.attachPageListeners(this.page);

    // Track only top-level document navigations in normal logs. Challenge pages may
    // make their own navigations while the verification window is being observed.
    this.page.on('request', (request) => {
      try {
        if (!request.isNavigationRequest() || request.frame() !== this.page.mainFrame()) return;
        const parentInfo = request.redirectedFrom() && this.navigationRequestInfo.get(request.redirectedFrom());
        let info = parentInfo;
        if (!info) {
          const isAppNavigation = this.activeAppNavigation
            && request.url() === this.activeAppNavigation.url
            && !this.activeAppNavigation.requestId;
          const navigationId = isAppNavigation ? this.activeAppNavigation.navigationId : `${this.contextId}:nav-${++this.navigationSequence}`;
          const requestId = `${navigationId}:request-${++this.navigationSequence}`;
          info = {
            navigationId,
            requestId,
            initiator: isAppNavigation ? 'app' : 'page',
            attempt: isAppNavigation ? this.activeAppNavigation.attempt : 'browser',
          };
          if (isAppNavigation) this.activeAppNavigation.requestId = requestId;
        }
        this.navigationRequestInfo.set(request, info);
        console.log(`[SCRAPER][NAVIGATION_REQUEST] navigationId=${info.navigationId} requestId=${info.requestId} mode=${this.mode} category=${this.categoryId} initiator=${info.initiator} attempt=${info.attempt} isMainFrame=true resourceType=${request.resourceType()} url=${sanitizeUrlForLog(request.url())} timestamp=${new Date().toISOString()}`);
      } catch (_) {}
    });

    // Response tracing records status and sanitized URLs without inspecting request headers.
    this.page.on('response', (res) => {
      const url = res.url();
      if (url.includes('rutracker.org')) {
        const status = res.status();
        const cfMitigated = res.headers()['cf-mitigated'] || null;
        try {
          const request = res.request();
          if (request.isNavigationRequest() && request.frame() === this.page.mainFrame()) {
            this.latestNavigationResponse = { url, status, cfMitigated };
            const info = this.navigationRequestInfo.get(request) || { navigationId: 'unknown', requestId: 'unknown', initiator: 'page', attempt: 'browser' };
            this.networkLogs.push({ url: sanitizeUrlForLog(url), status, cfMitigated, ...info });
            if (typeof this.onNavigationResult === 'function') {
              this.onNavigationResult({ ...info, url: sanitizeUrlForLog(url), status, cfMitigated });
            }
            console.log(`[SCRAPER][NAVIGATION_RESULT] navigationId=${info.navigationId} requestId=${info.requestId} mode=${this.mode} category=${this.categoryId} initiator=${info.initiator} attempt=${info.attempt} isMainFrame=true resourceType=${request.resourceType()} url=${sanitizeUrlForLog(url)} status=${status}${cfMitigated ? ` cf-mitigated=${cfMitigated}` : ''} timestamp=${new Date().toISOString()}`);
          } else if (process.env.SCRAPER_DEBUG_NETWORK === '1') {
            console.log(`[SCRAPER][NETWORK][DEBUG] mode=${this.mode} category=${this.categoryId} isMainFrame=false resourceType=${request.resourceType()} url=${sanitizeUrlForLog(url)} status=${status}`);
          }
        } catch (_) {}
      }
    });

    this.state = 'profile_loaded';
    console.log(`[SCRAPER][PROFILE] mode=${this.mode} directoryExists=${fs.existsSync(this.profileDir)} cookieCount=${await this.getCookieCount()} context=${this.contextId}`);
    return { context: this.context, page: this.page, pid: this.browserPid, contextId: this.contextId };
  }

  attachPageListeners(page) {
    if (!page) return;
    page.on('close', () => {
      const pageCount = this.context ? this.context.pages().length : 0;
      const closeRequestedBy = this.state === 'closing' ? 'APPLICATION' : (pageCount > 0 ? 'BROWSER' : 'UNKNOWN');
      const origin = pageCount > 0 ? 'PAGE_DISPLACED_NAV' : (this.state === 'closing' ? 'APP_PAGE_CLOSE' : 'UNKNOWN');
      if (pageCount > 0) this.closeOrigin = 'PAGE_DISPLACED_NAV';
      console.log(`[SCRAPER][CLOSE_TRACE] timestamp=${new Date().toISOString()} contextId=${this.contextId} pid=${this.browserPid ?? 'unknown'} event=PAGE_CLOSE_EVENT closeRequestedBy=${closeRequestedBy} remainingPages=${pageCount} origin=${origin} reason="Page closed event fired" state=${this.state}`);
      console.warn(`[SCRAPER][LIFECYCLE] Page closed. contextId=${this.contextId} pid=${this.browserPid}`);
      if (this.context && pageCount > 0) {
        if (this.page === page || !this.page || this.page.isClosed()) {
          this.page = this.context.pages()[0];
        }
      }
    });
    page.on('crash', () => {
      console.log(`[SCRAPER][CLOSE_TRACE] timestamp=${new Date().toISOString()} contextId=${this.contextId} pid=${this.browserPid ?? 'unknown'} event=PAGE_CRASH_EVENT closeRequestedBy=BROWSER origin=PAGE_CRASH reason="Page crash event fired" state=${this.state}`);
      console.error(`[SCRAPER][LIFECYCLE] CRASH DETECTED on page. contextId=${this.contextId} pid=${this.browserPid}`);
      this.closeOrigin = 'PAGE_CRASH';
    });
  }

  get activePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.context && this.context.pages().length > 0) {
      this.page = this.context.pages()[0];
      return this.page;
    }
    return null;
  }

  async getCookieCount() {
    if (!this.context) return null;
    try { return (await this.context.cookies()).length; } catch (_) { return null; }
  }

  async navigate(url, options = {}) {
    const page = this.activePage;
    if (!page) throw new Error('SCRAPER_SESSION_ERROR: Session page not initialized.');
    const navigationId = `${this.contextId}:app-nav-${++this.navigationSequence}`;
    const attempt = 1;
    const appNavigation = { navigationId, url, attempt };
    this.activeAppNavigation = appNavigation;
    console.log(`[SCRAPER][NAVIGATION_ATTEMPT] navigationId=${navigationId} requestId=${this.requestId} mode=${this.mode} category=${this.categoryId} initiator=app attempt=${attempt} isMainFrame=true resourceType=document url=${sanitizeUrlForLog(url)} timestamp=${new Date().toISOString()}`);
    try {
      return await page.goto(url, options);
    } finally {
      if (this.activeAppNavigation === appNavigation) this.activeAppNavigation = null;
    }
  }

  async healthCheck({ category = null } = {}) {
    if (!this.page) throw new Error('SCRAPER_SESSION_ERROR: Session not started.');

    const subforum = getScraperCategory(category);
    console.log(`[HEALTH] Performing structured single-context session health check pid=${this.browserPid} contextId=${this.contextId}...`);
    const result = {
      valid: false,
      state: this.state,
      pid: this.browserPid,
      contextId: this.contextId,
      index: { status: 0, challenge: false },
      target: { id: subforum.id, url: subforum.baseUrl, status: 0, challenge: false, topicCount: 0 },
    };

    console.log(`[HEALTH][1] Navigating to index.php pid=${this.browserPid}...`);
    let indexResponse;
    try {
      indexResponse = await this.navigate('https://rutracker.org/forum/index.php', { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (error) {
      const accessResult = classifyCategoryAccess({ category: subforum, error });
      throw Object.assign(new Error(`RuTracker index request failed: ${accessResult.message}`), { code: 'NETWORK_ERROR', accessResult });
    }
    result.index.status = indexResponse?.status() || 0;
    const indexTitle = await this.page.title();
    const indexInfo = await this.page.evaluate(() => ({
      body: (document.body?.innerText || '').slice(0, 4000),
      hasForumStructure: !!(document.querySelector('#page_container, #page_header, #main-nav') || document.querySelector('a[href*="viewforum.php"]')),
    }));
    const indexAccess = classifyCategoryAccess({
      category: subforum,
      status: result.index.status,
      cfMitigated: indexResponse?.headers()['cf-mitigated'],
      finalUrl: this.page.url(),
      title: indexTitle,
      ...indexInfo,
    });
    if (![ 'ACCESSIBLE', 'ACCESSIBLE_EMPTY' ].includes(indexAccess.status)) {
      result.index.challenge = indexAccess.status === 'INTERACTION_REQUIRED';
      throw Object.assign(new Error(indexAccess.message), { code: indexAccess.status, accessResult: indexAccess });
    }
    this.state = 'index_accessible';

    console.log(`[HEALTH][4] Probing exact category ${subforum.id} (${subforum.baseUrl}) pid=${this.browserPid}...`);
    const categoryAccess = await this.probeCategory(subforum);
    result.target.status = categoryAccess.httpStatus || 0;
    result.target.challenge = categoryAccess.challengeDetected;
    result.target.topicCount = categoryAccess.topicCount || 0;
    if (![ 'ACCESSIBLE', 'ACCESSIBLE_EMPTY' ].includes(categoryAccess.status)) {
      throw Object.assign(new Error(categoryAccess.message), { code: categoryAccess.status, accessResult: categoryAccess });
    }

    result.valid = true;
    this.state = 'ready';
    return result;
  }

  probeCategory(category, options) {
    const page = this.activePage;
    if (!page) throw new Error('SCRAPER_SESSION_ERROR: Session not started.');
    return probeCategory(page, category, { ...options, navigate: (url, navigationOptions) => this.navigate(url, navigationOptions) });
  }

  inspectCurrentCategory(category) {
    const page = this.activePage;
    if (!page) throw new Error('SCRAPER_SESSION_ERROR: Session not started.');
    const latest = this.latestNavigationResponse;
    return inspectCurrentCategory(page, category, latest || {});
  }

  async injectScraper(options = {}) {
    const page = this.activePage;
    if (!page) throw new Error('SCRAPER_SESSION_ERROR: Session page not initialized.');
    console.log(`[SCRAPER][INJECT] Injecting console.js into same page/context pid=${this.browserPid} contextId=${this.contextId} ...`);
    await injectConsoleScript(page, options);
  }

  async run(flowOptions = {}) {
    const page = this.activePage;
    if (!page) throw new Error('SCRAPER_SESSION_ERROR: Session page not initialized.');
    this.state = 'running';
    console.log(`[SCRAPER][RUN] Executing scrape flow in same page/context pid=${this.browserPid} contextId=${this.contextId} ...`);
    const catalogs = await runScrapeFlow(page, flowOptions);
    return catalogs;
  }

  async export(catalogs, options = {}) {
    console.log(`[SCRAPER][EXPORT] Exporting catalog data atomically pid=${this.browserPid} contextId=${this.contextId} ...`);
    return exportCatalogsAtomic(catalogs, options);
  }

  async close(reason = 'completed') {
    if (this.closePromise) return this.closePromise;
    if (this.closeOrigin === 'unknown') this.closeOrigin = 'APPLICATION_CLOSED';
    this.closePromise = (async () => {
      this.state = 'closing';
      this.closeReason = reason;
      const cookiesBeforeClose = await this.getCookieCount();
      console.log(`[SCRAPER][PROFILE] mode=${this.mode} cookieCount=${cookiesBeforeClose ?? 'unknown'} phase=before_close context=${this.contextId}`);
      console.log(`[SCRAPER][LIFECYCLE] Closing ScraperBrowserSession (reason=${reason}) pid=${this.browserPid ?? 'unknown'} contextId=${this.contextId} ...`);

      let closeError = null;
      if (this.context) {
        try {
          await this.context.close();
        } catch (error) {
          closeError = error;
        }
      }

      // Allow small stabilization window for OS filesystem locks and SQLite cookie persistence
      await new Promise((r) => setTimeout(r, 400));

      let exited = await waitForProcessExit(this.browserProcess, 5000);
      if (!exited && this.browserProcess) {
        console.warn(`[SCRAPER][LIFECYCLE] GRACEFUL_CLOSE_TIMEOUT pid=${this.browserPid ?? 'unknown'} contextId=${this.contextId}; requesting termination.`);
        try { this.browserProcess.kill('SIGTERM'); } catch (_) {}
        exited = await waitForProcessExit(this.browserProcess, 2000);
      }
      if (!exited && this.browserProcess) {
        console.error(`[SCRAPER][LIFECYCLE] GRACEFUL_TERMINATION_TIMEOUT pid=${this.browserPid ?? 'unknown'} contextId=${this.contextId}; forcing termination.`);
        try { this.browserProcess.kill('SIGKILL'); } catch (_) {}
        exited = await waitForProcessExit(this.browserProcess, 2000);
      }

      if (activeProfileSessions.get(this.profileDir) === this.contextId) {
        activeProfileSessions.delete(this.profileDir);
      }

      this.state = 'closed';
      console.log(`[SCRAPER][LIFECYCLE] browser exited cleanly pid=${this.browserPid ?? 'unknown'} context=${this.contextId}`);
      if (closeError) {
        throw Object.assign(new Error(`SCRAPER_CONTEXT_CLOSE_FAILED: ${closeError.message}`), { cause: closeError });
      }
      return { success: true, pid: this.browserPid, contextId: this.contextId };
    })();
    return this.closePromise;
  }
}

module.exports = {
  getScraperProfileDir,
  ScraperBrowserSession,
  waitForProcessExit,
  isProcessExited,
  isScraperProfileActive,
};
