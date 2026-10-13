/**
 * Playwright Persistent Browser Context & Health Check Module
 * Parity Inspection & Structured Step-by-Step Session Verification
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { getScraperCategory } = require('./scraperBridge.cjs');
const { getScraperProfileDir, getApplicationDataDirectory } = require('./platformPaths.cjs');
const { detectAccessChallenge, classifyCategoryAccess, sanitizeUrlForLog } = require('./accessProbe.cjs');

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

async function launchBrowser({ headless = true, userDataDir = null } = {}) {
  const profileDir = userDataDir ? path.resolve(userDataDir) : getScraperProfileDir();
  const profileInfo = getProfileParityInfo(profileDir);
  console.log(`[SCRAPER][PROFILE] requested=${profileInfo.requested} resolved=${profileInfo.resolved} exists=${profileInfo.exists} writable=${profileInfo.writable}`);
  console.log(`[SCRAPER][BROWSER] executable=${chromium.executablePath()} (headless=${headless})`);

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

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: launchArgs,
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
      console.log(`[SCRAPER][NETWORK] GET ${sanitizeUrlForLog(url)} -> ${status}${cfMitigated ? ` (cf-mitigated: ${cfMitigated})` : ''}`);
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

    const challengeFound = detectAccessChallenge({ status: indexRes?.status(), cfMitigated: cfHeader, title: indexTitle, body: indexBody });
    const challengeReason = challengeFound ? 'Cloudflare browser verification is required.' : null;

    if (challengeFound) {
      console.warn(`[HEALTH][2] Challenge detected on index.php: ${challengeReason}`);
      result.reason = 'challenge';
      result.details.challengeDetected = true;
      result.details.challengeReason = challengeReason;
      result.details.accessResult = classifyCategoryAccess({
        category: subforum,
        status: indexStatus,
        cfMitigated: cfHeader,
        finalUrl: typeof page.url === 'function' ? page.url() : 'https://rutracker.org/forum/index.php',
        title: indexTitle,
        body: indexBody,
      });
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
    const subPageInfo = await page.evaluate(() => ({
      title: document.title || '',
      body: document.body?.innerText?.slice(0, 4000) || '',
      topicCount: document.querySelectorAll('a.torTopic, a.tt-text, a[href*="viewtopic.php?t="]').length,
      hasForumStructure: !!(document.querySelector('#tor-tbl, #forum_main, #page_container, #page_header') || document.querySelector('a[href*="viewtopic.php?t="]')),
      authenticationRequired: !!document.querySelector('form[action*="login"], form#login, input[name="login_username"]'),
    }));
    const categoryAccess = classifyCategoryAccess({
      category: subforum,
      status: subStatus,
      cfMitigated: subCfHeader,
      finalUrl: typeof page.url === 'function' ? page.url() : subforum.baseUrl,
      ...subPageInfo,
      body: subPageInfo.authenticationRequired ? 'authenticationRequired' : subPageInfo.body,
    });
    result.details.topicCount = categoryAccess.topicCount;
    result.details.challengeDetected = categoryAccess.challengeDetected;
    result.details.accessResult = categoryAccess;
    if (!['ACCESSIBLE', 'ACCESSIBLE_EMPTY'].includes(categoryAccess.status)) {
      result.reason = categoryAccess.status === 'INTERACTION_REQUIRED' ? 'challenge' : categoryAccess.status.toLowerCase();
      result.details.error = categoryAccess.message;
      return result;
    }
    console.log(`[HEALTH][5] Category listing validated (${categoryAccess.topicCount} topics, status=${categoryAccess.status})`);

    result.valid = true;
    result.reason = 'ok';
    return result;

  } finally {
    page.off('response', responseListener);

    if (!result.valid && (process.env.SCRAPER_DEBUG === 'true' || process.env.NODE_ENV === 'development')) {
      try {
        const debugDir = path.join(getApplicationDataDirectory(), 'scraper-debug');
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
    throw Object.assign(new Error(`INTERACTION_REQUIRED: ${check.details.challengeReason || 'Cloudflare browser verification is required.'} Category URL: ${check.details.subforumUrl}. Open \`${loginCommand}\` and complete verification manually.`), {
      code: 'INTERACTION_REQUIRED',
      accessResult: check.details.accessResult || null,
    });
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
