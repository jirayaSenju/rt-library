/**
 * ScraperBrowserSession Module
 * Encapsulates single Chromium process, single PersistentContext, single Page lifecycle,
 * structured health checks, network redirect tracing, cookie sending verification, and IndexedDB persistence.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');
const { getConsoleScriptPath, getScraperCategory, injectConsoleScript, runScrapeFlow } = require('./scraperBridge.cjs');
const { exportCatalogsAtomic } = require('./exportCatalogs.cjs');

function getScraperProfileDir() {
  if (process.env.SCRAPER_PROFILE_DIR) {
    const custom = path.resolve(process.env.SCRAPER_PROFILE_DIR);
    if (!fs.existsSync(custom)) fs.mkdirSync(custom, { recursive: true });
    return custom;
  }
  try {
    const baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const profileDir = path.join(baseDir, 'rt-library', 'scraper-profile');
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  } catch (_) {
    const fallbackDir = path.join(os.tmpdir(), 'rt-library', 'scraper-profile');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

function cleanupProfileLocks(profileDir) {
  if (!fs.existsSync(profileDir)) return;
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  lockFiles.forEach((file) => {
    const target = path.join(profileDir, file);
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    } catch (_) {}
  });
}

class ScraperBrowserSession {
  constructor(options = {}) {
    this.options = options;
    this.context = null;
    this.page = null;
    this.profileDir = options.userDataDir ? path.resolve(options.userDataDir) : getScraperProfileDir();
    this.contextId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.browserPid = null;
    this.state = 'created'; // created, starting, profile_loaded, index_accessible, target_accessible, challenge_required, ready, running, closing, closed
    this.networkLogs = [];
    this.sentCookiesLog = [];
    this.closeReason = null;
  }

  async start({ headless = true } = {}) {
    if (this.state !== 'created' && this.state !== 'closed') {
      throw new Error(`SCRAPER_SESSION_ERROR: Cannot start session in state "${this.state}".`);
    }

    this.state = 'starting';
    cleanupProfileLocks(this.profileDir);

    console.log(`[SCRAPER][PROCESS] Initializing single-process Chromium contextId=${this.contextId} (headless=${headless}) ...`);
    console.log(`[SCRAPER][PROFILE] profileDir=${this.profileDir}`);

    const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36';

    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      userAgent: DEFAULT_USER_AGENT,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        ...(headless ? ['--headless=new'] : []),
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    // Clean stale Cloudflare challenge retry cookies that cause Turnstile loops
    try {
      const existingCookies = await this.context.cookies();
      const challengeCookies = existingCookies.filter(c => c.name.startsWith('cf_chl_'));
      if (challengeCookies.length > 0) {
        await this.context.clearCookies();
        const validCookies = existingCookies.filter(c => !c.name.startsWith('cf_chl_'));
        await this.context.addCookies(validCookies);
      }
    } catch (_) {}

    try {
      const browserProcess = this.context.browser() ? this.context.browser().process() : null;
      this.browserPid = browserProcess ? browserProcess.pid : process.pid;
    } catch (_) {
      this.browserPid = process.pid;
    }

    console.log(`[SCRAPER][PROCESS] Chromium launched. pid=${this.browserPid} contextId=${this.contextId}`);

    this.context.on('close', () => {
      console.warn(`[SCRAPER][LIFECYCLE] PersistentContext closed. contextId=${this.contextId} pid=${this.browserPid}`);
      this.state = 'closed';
    });

    this.page = this.context.pages().length > 0 ? this.context.pages()[0] : await this.context.newPage();

    this.page.on('close', () => {
      console.warn(`[SCRAPER][LIFECYCLE] Page closed. contextId=${this.contextId} pid=${this.browserPid}`);
    });
    this.page.on('crash', () => {
      console.error(`[SCRAPER][LIFECYCLE] CRASH DETECTED on page. contextId=${this.contextId} pid=${this.browserPid}`);
    });

    // Request & Response network tracing for redirect inspection & cookie sending verification
    this.page.on('request', async (req) => {
      const url = req.url();
      if (url.includes('rutracker.org')) {
        try {
          const headers = await req.allHeaders().catch(() => req.headers());
          const cookieHeader = headers['cookie'] || headers['Cookie'] || null;
          const cookieNames = cookieHeader
            ? cookieHeader.split(';').map(c => c.split('=')[0].trim())
            : [];

          this.sentCookiesLog.push({
            url,
            timestamp: new Date().toISOString(),
            cookieHeaderPresent: !!cookieHeader,
            cookieNames,
            hasClearance: cookieNames.includes('cf_clearance'),
            hasBbSession: cookieNames.includes('bb_session'),
          });

          if (url.includes('viewforum.php')) {
            console.log(`[SCRAPER][NETWORK_REQ] GET ${url.replace('https://rutracker.org', '')} -> Sent Cookies: [${cookieNames.join(', ') || 'NONE'}] (cf_clearance: ${cookieNames.includes('cf_clearance')})`);
          }
        } catch (_) {}
      }
    });

    this.page.on('response', (res) => {
      const url = res.url();
      if (url.includes('rutracker.org')) {
        const status = res.status();
        const cfMitigated = res.headers()['cf-mitigated'] || null;
        const location = res.headers()['location'] || null;

        this.networkLogs.push({ url, status, cfMitigated, location });

        if (status === 301 || status === 302 || status === 307 || status === 308) {
          console.log(`[SCRAPER][NETWORK] ${status} Redirect from ${url.replace('https://rutracker.org', '')} -> Location: ${location || 'NONE'}`);
        } else if (url.includes('viewforum.php')) {
          console.log(`[SCRAPER][NETWORK] GET ${url.replace('https://rutracker.org', '')} -> ${status}${cfMitigated ? ` (cf-mitigated: ${cfMitigated})` : ''}`);
        }
      }
    });

    this.state = 'profile_loaded';
    return { context: this.context, page: this.page, pid: this.browserPid, contextId: this.contextId };
  }

  async inspectCookies() {
    if (!this.context) return { count: 0, names: [], hasClearance: false, hasBbSession: false };
    try {
      const cookies = await this.context.cookies();
      const ruTrackerCookies = cookies.filter(c => c.domain && c.domain.includes('rutracker.org'));
      const names = ruTrackerCookies.map(c => c.name);
      const cfClearance = ruTrackerCookies.find(c => c.name === 'cf_clearance');
      const bbSession = ruTrackerCookies.find(c => c.name === 'bb_session');

      console.log(`[SCRAPER][COOKIES] Count: ${ruTrackerCookies.length} (names: ${names.join(', ') || 'none'}) pid=${this.browserPid} contextId=${this.contextId}`);
      if (cfClearance) {
        console.log(`[SCRAPER][COOKIES] cf_clearance present: domain=${cfClearance.domain}, expires=${cfClearance.expires > 0 ? new Date(cfClearance.expires * 1000).toISOString() : 'session'}`);
      } else {
        console.log('[SCRAPER][COOKIES] cf_clearance ABSENT');
      }

      if (bbSession) {
        console.log(`[SCRAPER][COOKIES] bb_session present: domain=${bbSession.domain}`);
      } else {
        console.log('[SCRAPER][COOKIES] Guest mode: bb_session cookie absent (No account login needed for browsing)');
      }

      return {
        count: ruTrackerCookies.length,
        names,
        hasClearance: !!cfClearance,
        hasBbSession: !!bbSession,
      };
    } catch (_) {
      return { count: 0, names: [], hasClearance: false, hasBbSession: false };
    }
  }

  async healthCheck({ category = null } = {}) {
    if (!this.page) throw new Error('SCRAPER_SESSION_ERROR: Session not started.');

    const subforum = getScraperCategory(category);
    console.log(`[HEALTH] Performing structured single-context session health check pid=${this.browserPid} contextId=${this.contextId}...`);

    const cookieState = await this.inspectCookies();
    const result = {
      valid: false,
      state: this.state,
      pid: this.browserPid,
      contextId: this.contextId,
      index: { status: 0, challenge: false },
      target: { id: subforum.id, url: subforum.baseUrl, status: 0, challenge: false, topicCount: 0 },
      cookies: {
        clearancePresent: cookieState.hasClearance,
        clearanceSent: false,
        bbSessionPresent: cookieState.hasBbSession,
      },
    };

    // Step 1: Navigating to index.php
    console.log(`[HEALTH][1] Navigating to index.php pid=${this.browserPid}...`);
    let indexRes;
    try {
      indexRes = await this.page.goto('https://rutracker.org/forum/index.php', {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
    } catch (err) {
      this.state = 'challenge_required';
      throw new Error(`SCRAPER_SESSION_INVALID: Navigation to index.php failed (${err.message}).`);
    }

    result.index.status = indexRes ? indexRes.status() : 0;
    console.log(`[HEALTH][1] Index navigation PASS (status=${result.index.status}) pid=${this.browserPid}`);

    // Step 2: Challenge detection on index
    const indexTitle = await this.page.title();
    const cfHeader = indexRes ? (indexRes.headers()['cf-mitigated'] || null) : null;
    if (cfHeader === 'challenge' || /just a moment|um momento|checking your browser/i.test(indexTitle)) {
      result.index.challenge = true;
      this.state = 'challenge_required';
      throw new Error(`SCRAPER_SESSION_INVALID: Cloudflare challenge detected on index.php.`);
    }
    console.log(`[HEALTH][2] Challenge detection PASS pid=${this.browserPid}`);
    this.state = 'index_accessible';

    // Allow Cloudflare background challenge platform scripts to settle token
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Forum DOM Check
    const isForumDom = await this.page.evaluate(() => {
      return !!(
        document.querySelector('#page_container') ||
        document.querySelector('#page_header') ||
        document.querySelector('a[href*="viewforum.php"]') ||
        document.querySelector('#main-nav')
      );
    });

    if (!isForumDom) {
      this.state = 'challenge_required';
      throw new Error(`SCRAPER_SESSION_INVALID: Forum DOM structure not detected on index.php.`);
    }
    console.log(`[HEALTH][3] Forum DOM check PASS pid=${this.browserPid}`);

    // Step 4: Subforum Target Navigation (Testing exact target category)
    console.log(`[HEALTH][4] Navigating to subforum target (${subforum.id}, ${subforum.baseUrl}) pid=${this.browserPid}...`);
    let subRes;
    try {
      subRes = await this.page.goto(subforum.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
    } catch (err) {
      this.state = 'challenge_required';
      throw new Error(`SCRAPER_SESSION_INVALID: Navigation to subforum failed (${err.message}).`);
    }

    result.target.status = subRes ? subRes.status() : 0;
    let subCfHeader = subRes ? (subRes.headers()['cf-mitigated'] || null) : null;

    if (result.target.status === 403 || subCfHeader === 'challenge') {
      console.log(`[HEALTH][4] Initial subforum access returned 403. Waiting 3.5s for Cloudflare clearance token verification... pid=${this.browserPid}`);
      await new Promise(r => setTimeout(r, 3500));
      try {
        subRes = await this.page.goto(subforum.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
        result.target.status = subRes ? subRes.status() : 0;
        subCfHeader = subRes ? (subRes.headers()['cf-mitigated'] || null) : null;
      } catch (_) {}
    }

    // Check sent cookies log for clearance sending verification
    const subReqLog = this.sentCookiesLog.filter(l => l.url.includes(subforum.baseUrl)).pop();
    if (subReqLog) {
      result.cookies.clearanceSent = subReqLog.hasClearance;
    }

    if (result.target.status === 403 || subCfHeader === 'challenge') {
      result.target.challenge = true;
      this.state = 'challenge_required';
      console.warn(`[HEALTH][4] Subforum challenge/403 detected (status=${result.target.status}, cf-mitigated=${subCfHeader}) pid=${this.browserPid}`);
      throw new Error(`SCRAPER_SESSION_INVALID: Cloudflare / Anti-Bot challenge detected (Subforum HTTP ${result.target.status} (cf-mitigated=${subCfHeader}), URL=${subforum.baseUrl}). Open \`npm run scraper:login${category ? ` -- --category ${category}` : ''}\`, complete verification on the subforum, and close the browser to save the profile.`);
    }
    console.log(`[HEALTH][4] Subforum navigation PASS (status=${result.target.status}) pid=${this.browserPid}`);
    this.state = 'target_accessible';

    // Step 5: Topic Listing Check
    const topicCount = await this.page.evaluate(() => document.querySelectorAll('a.torTopic').length);
    result.target.topicCount = topicCount;

    if (topicCount === 0) {
      this.state = 'challenge_required';
      throw new Error(`SCRAPER_SESSION_INVALID: Zero torTopic links found on target subforum page.`);
    }
    console.log(`[HEALTH][5] Topic list check PASS (${topicCount} torTopic links found) pid=${this.browserPid}`);

    result.valid = true;
    this.state = 'ready';
    return result;
  }

  async injectScraper(options = {}) {
    if (!this.page) throw new Error('SCRAPER_SESSION_ERROR: Session page not initialized.');
    console.log(`[SCRAPER][INJECT] Injecting console.js into same page/context pid=${this.browserPid} contextId=${this.contextId} ...`);
    await injectConsoleScript(this.page, options);
  }

  async run(flowOptions = {}) {
    if (!this.page) throw new Error('SCRAPER_SESSION_ERROR: Session page not initialized.');
    this.state = 'running';
    console.log(`[SCRAPER][RUN] Executing scrape flow in same page/context pid=${this.browserPid} contextId=${this.contextId} ...`);
    const catalogs = await runScrapeFlow(this.page, flowOptions);
    return catalogs;
  }

  async export(catalogs, options = {}) {
    console.log(`[SCRAPER][EXPORT] Exporting catalog data atomically pid=${this.browserPid} contextId=${this.contextId} ...`);
    return exportCatalogsAtomic(catalogs, options);
  }

  async close(reason = 'completed') {
    if (this.state === 'closing' || this.state === 'closed') return;
    this.state = 'closing';
    this.closeReason = reason;

    console.log(`[SCRAPER][LIFECYCLE] Closing ScraperBrowserSession (reason=${reason}) pid=${this.browserPid} contextId=${this.contextId} ...`);

    if (this.context) {
      try {
        await this.context.close();
      } catch (_) {}
    }

    this.state = 'closed';
  }
}

module.exports = {
  getScraperProfileDir,
  cleanupProfileLocks,
  ScraperBrowserSession,
};
