/**
 * Playwright Persistent Browser Context & Health Check Module
 * Parity Inspection & Structured Step-by-Step Session Verification
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');
const { getScraperCategory } = require('./scraperBridge.cjs');

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

function getProfileParityInfo(profileDir) {
  const exists = fs.existsSync(profileDir);
  let writable = false;
  if (exists) {
    try {
      fs.accessSync(profileDir, fs.constants.W_OK);
      writable = true;
    } catch (_) {}
  }
  return {
    requested: profileDir,
    resolved: path.resolve(profileDir),
    exists,
    writable,
  };
}

async function inspectCookieMetadata(context) {
  try {
    const cookies = await context.cookies();
    const ruTrackerCookies = cookies.filter(c => c.domain && c.domain.includes('rutracker.org'));
    
    const names = ruTrackerCookies.map(c => c.name);
    const cfClearance = ruTrackerCookies.find(c => c.name === 'cf_clearance');
    const bbSession = ruTrackerCookies.find(c => c.name === 'bb_session');

    console.log(`[SCRAPER][COOKIES] Count: ${ruTrackerCookies.length} (names: ${names.join(', ') || 'none'})`);
    if (cfClearance) {
      console.log(`[SCRAPER][COOKIES] cf_clearance present: domain=${cfClearance.domain}, expires=${cfClearance.expires > 0 ? new Date(cfClearance.expires * 1000).toISOString() : 'session'}, secure=${cfClearance.secure}, sameSite=${cfClearance.sameSite}`);
    } else {
      console.log('[SCRAPER][COOKIES] cf_clearance absent');
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

async function launchBrowser({ headless = true, userDataDir = null } = {}) {
  const profileDir = userDataDir ? path.resolve(userDataDir) : getScraperProfileDir();
  cleanupProfileLocks(profileDir);

  const profileInfo = getProfileParityInfo(profileDir);
  console.log(`[SCRAPER][PROFILE] requested=${profileInfo.requested} resolved=${profileInfo.resolved} exists=${profileInfo.exists} writable=${profileInfo.writable}`);
  console.log(`[SCRAPER][BROWSER] executable=${chromium.executablePath()} (headless=${headless})`);

  const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36';

  const context = await chromium.launchPersistentContext(profileDir, {
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

  context.on('close', () => {
    console.warn('[SCRAPER][LIFECYCLE] Browser context closed.');
  });

  const attachPageListeners = (p) => {
    p.on('close', () => {
      console.warn('[SCRAPER][LIFECYCLE] Browser page closed.');
    });
    p.on('crash', () => {
      console.error('[SCRAPER][LIFECYCLE] CRASH DETECTED on browser page.');
    });
    p.on('pageerror', (err) => {
      console.error(`[SCRAPER][PAGE_ERROR] ${err.message}`);
    });
  };

  context.on('page', (newPage) => {
    attachPageListeners(newPage);
  });

  context.pages().forEach(attachPageListeners);

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await inspectCookieMetadata(context);

  return { context, page, profileDir };
}

async function checkSession(page, { category = null } = {}) {
  const subforum = getScraperCategory(category);
  const result = {
    valid: false,
    reason: 'ok',
    details: { subforumUrl: subforum.baseUrl },
  };

  const responseLogs = [];
  const responseListener = (res) => {
    const url = res.url();
    if (url.includes('rutracker.org')) {
      const status = res.status();
      const cfMitigated = res.headers()['cf-mitigated'] || null;
      console.log(`[SCRAPER][NETWORK] GET ${url.replace('https://rutracker.org', '')} -> ${status}${cfMitigated ? ` (cf-mitigated: ${cfMitigated})` : ''}`);
      responseLogs.push({ url, status, cfMitigated });
    }
  };

  page.on('response', responseListener);

  try {
    // Step 1: Open Index
    console.log('[HEALTH][1] Navigating to index.php ...');
    let indexRes;
    try {
      indexRes = await page.goto('https://rutracker.org/forum/index.php', {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
    } catch (err) {
      if (err.message.includes('Timeout')) {
        console.warn('[HEALTH][1] Navigation to index.php TIMED OUT.');
        result.reason = 'timeout';
        result.details.error = 'NAVIGATION_TIMEOUT: index.php';
        return result;
      }
      console.warn(`[HEALTH][1] Network error navigating to index.php: ${err.message}`);
      result.reason = 'network_error';
      result.details.error = `NETWORK_ERROR: ${err.message}`;
      return result;
    }

    const indexStatus = indexRes ? indexRes.status() : 0;
    result.details.indexStatus = indexStatus;
    console.log(`[HEALTH][1] Index navigation PASS (status=${indexStatus})`);

    // Step 2: Challenge Detection on Index
    const indexTitle = await page.title();
    const indexBody = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
    const cfHeader = indexRes ? (indexRes.headers()['cf-mitigated'] || null) : null;

    const challengePatterns = [
      /just a moment/i,
      /um momento/i,
      /enable javascript and cookies/i,
      /attention required/i,
      /checking your browser/i,
      /ddos-guard/i,
    ];

    let challengeFound = false;
    let challengeReason = null;

    if (cfHeader === 'challenge') {
      challengeFound = true;
      challengeReason = 'cf-mitigated: challenge header detected';
    } else {
      for (const pat of challengePatterns) {
        if (pat.test(indexTitle)) {
          challengeFound = true;
          challengeReason = `Title matched ${pat}`;
          break;
        }
        if (pat.test(indexBody)) {
          challengeFound = true;
          challengeReason = `Body text matched ${pat}`;
          break;
        }
      }
    }

    if (challengeFound) {
      console.warn(`[HEALTH][2] Challenge detected on index.php: ${challengeReason}`);
      result.reason = 'challenge';
      result.details.challengeDetected = true;
      result.details.challengeReason = challengeReason;
      return result;
    }
    console.log('[HEALTH][2] Challenge detection PASS');

    // Step 3: Forum DOM check
    const isForumDom = await page.evaluate(() => {
      return !!(
        document.querySelector('#page_container') ||
        document.querySelector('#page_header') ||
        document.querySelector('a[href*="viewforum.php"]') ||
        document.querySelector('#main-nav')
      );
    });

    if (!isForumDom) {
      console.warn('[HEALTH][3] Forum DOM structure not detected on index.php');
      result.reason = 'not_authenticated';
      result.details.error = 'SESSION_REQUIRED: Forum DOM missing';
      return result;
    }
    console.log('[HEALTH][3] Forum DOM check PASS');

    // Step 4: Subforum Navigation
    console.log(`[HEALTH][4] Navigating to subforum (${subforum.id}, ${subforum.baseUrl})...`);
    let subRes;
    try {
      subRes = await page.goto(subforum.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });
    } catch (err) {
      if (err.message.includes('Timeout')) {
        console.warn('[HEALTH][4] Subforum navigation TIMED OUT.');
        result.reason = 'timeout';
        result.details.error = 'NAVIGATION_TIMEOUT: subforum viewforum.php';
        return result;
      }
      console.warn(`[HEALTH][4] Network error navigating to subforum: ${err.message}`);
      result.reason = 'network_error';
      result.details.error = `NETWORK_ERROR: ${err.message}`;
      return result;
    }

    const subStatus = subRes ? subRes.status() : 0;
    result.details.subforumStatus = subStatus;
    const subCfHeader = subRes ? (subRes.headers()['cf-mitigated'] || null) : null;

    if (subStatus === 403 || subCfHeader === 'challenge') {
      console.warn(`[HEALTH][4] Subforum challenge/403 detected (status=${subStatus}, cf-mitigated=${subCfHeader})`);
      result.reason = 'challenge';
      result.details.challengeDetected = true;
      result.details.challengeReason = `Subforum HTTP ${subStatus} (cf-mitigated=${subCfHeader})`;
      return result;
    }
    console.log(`[HEALTH][4] Subforum navigation PASS (status=${subStatus})`);

    // Step 5: Topic Listing Check
    const topicCount = await page.evaluate(() => document.querySelectorAll('a.torTopic').length);
    result.details.topicCount = topicCount;

    if (topicCount === 0) {
      console.warn('[HEALTH][5] Zero torTopic links found on subforum page.');
      result.reason = 'not_authenticated';
      result.details.error = 'SESSION_REQUIRED: Zero topics found on subforum';
      return result;
    }
    console.log(`[HEALTH][5] Topic list check PASS (${topicCount} torTopic links found)`);

    result.valid = true;
    result.reason = 'ok';
    return result;

  } finally {
    page.off('response', responseListener);

    if (!result.valid && (process.env.SCRAPER_DEBUG === 'true' || process.env.NODE_ENV === 'development')) {
      try {
        const debugDir = path.resolve(__dirname, '../userData/scraper-debug');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        const screenshotPath = path.join(debugDir, 'health-failure.png');
        const htmlPath = path.join(debugDir, 'health-failure.html');
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
        const content = await page.content().catch(() => '');
        if (content) fs.writeFileSync(htmlPath, content, 'utf8');
        console.log(`[SCRAPER][DEBUG] Health failure snapshot saved to ${screenshotPath}`);
      } catch (_) {}
    }
  }
}

async function checkSessionHealth(page, options = {}) {
  console.log('[SCRAPER] Performing structured session health check...');
  const check = await checkSession(page, options);
  const loginCommand = `npm run scraper:login${options.category ? ` -- --category ${options.category}` : ''}`;

  if (check.valid) {
    console.log('[SCRAPER] Session health check PASSED. Forum & subforums accessible.');
    return true;
  }

  if (check.reason === 'challenge') {
    throw new Error(`SCRAPER_SESSION_INVALID: Cloudflare / Anti-Bot challenge detected (${check.details.challengeReason || '403'}, URL=${check.details.subforumUrl}). Open \`${loginCommand}\`, complete verification on the subforum, and close the browser to save the profile.`);
  }

  if (check.reason === 'timeout') {
    throw new Error(`SCRAPER_SESSION_INVALID: Navigation timed out (${check.details.error || 'timeout'}).`);
  }

  if (check.reason === 'network_error') {
    throw new Error(`SCRAPER_SESSION_INVALID: Network connection error (${check.details.error || 'network error'}).`);
  }

  throw new Error(`SCRAPER_SESSION_INVALID: Forum DOM or topics not detected (${check.details.error || 'not authenticated'}). Session must be renewed via \`${loginCommand}\`.`);
}

module.exports = {
  getScraperProfileDir,
  launchBrowser,
  checkSession,
  checkSessionHealth,
};
