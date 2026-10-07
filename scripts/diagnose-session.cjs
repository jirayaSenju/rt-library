/**
 * Playwright Scraper Session Diagnostic Tool
 * Evaluates profile existence, cookie persistence, cookie applicability,
 * network request header sending, index accessibility, subforum target response,
 * and Cloudflare mitigation status.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getScraperProfileDir } = require('../scraper/browserSession.cjs');
const { getScraperCategory } = require('../scraper/scraperBridge.cjs');

async function diagnoseSession() {
  const args = process.argv.slice(2);
  let categoryArg = 'wii';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && i + 1 < args.length) {
      categoryArg = args[++i];
    }
  }

  const category = getScraperCategory(categoryArg);
  const profileDir = getScraperProfileDir();
  const profileExists = fs.existsSync(profileDir);

  const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Safari/537.36';

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    userAgent: DEFAULT_USER_AGENT,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  const cookies = await context.cookies();
  const ruTrackerCookies = cookies.filter(c => c.domain && c.domain.includes('rutracker.org'));
  const cfClearance = ruTrackerCookies.find(c => c.name === 'cf_clearance');
  const bbSession = ruTrackerCookies.find(c => c.name === 'bb_session');

  // Cookie applicability check for target subforum URL
  const targetCookies = await context.cookies(category.baseUrl);
  const targetClearance = targetCookies.find(c => c.name === 'cf_clearance');

  let indexStatus = 0;
  let indexChallenge = false;
  let targetStatus = 0;
  let targetCfMitigated = false;
  let cookieHeaderObserved = false;

  page.on('request', async (req) => {
    if (req.url().includes('viewforum.php')) {
      try {
        const headers = await req.allHeaders().catch(() => req.headers());
        const cookieHeader = headers['cookie'] || headers['Cookie'] || null;
        if (cookieHeader && cookieHeader.includes('cf_clearance')) {
          cookieHeaderObserved = true;
        }
      } catch (_) {}
    }
  });

  try {
    const resIndex = await page.goto('https://rutracker.org/forum/index.php', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
    indexStatus = resIndex ? resIndex.status() : 0;
    const indexTitle = await page.title().catch(() => '');
    if (/just a moment|um momento|checking your browser/i.test(indexTitle)) {
      indexChallenge = true;
    }

    const resTarget = await page.goto(category.baseUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
    targetStatus = resTarget ? resTarget.status() : 0;
    const cfMitigatedHeader = resTarget ? (resTarget.headers()['cf-mitigated'] || null) : null;
    if (cfMitigatedHeader === 'challenge') {
      targetCfMitigated = true;
    }
  } finally {
    await context.close().catch(() => {});
  }

  const isReady = targetStatus === 200 && !targetCfMitigated;

  console.log('PROFILE');
  console.log(profileExists ? 'PASS' : 'FAIL');
  console.log('');
  console.log('COOKIE STORED');
  console.log(`cf_clearance ${cfClearance ? 'YES' : 'NO'}`);
  console.log('');
  console.log('COOKIE APPLICABLE TO TARGET');
  console.log(targetClearance ? 'YES' : 'NO');
  console.log('');
  console.log('COOKIE HEADER OBSERVED');
  console.log(cookieHeaderObserved ? 'YES' : 'NO');
  console.log('');
  console.log('INDEX');
  console.log(indexStatus);
  console.log('');
  console.log('TARGET');
  console.log(targetStatus);
  console.log('');
  console.log('CF MITIGATED');
  console.log(targetCfMitigated ? 'YES' : 'NO');
  console.log('');
  console.log('RESULT');
  console.log(isReady ? 'READY' : 'INTERACTION_REQUIRED');
}

diagnoseSession().catch((err) => {
  console.error('Session Diagnostic Error:', err.message);
  process.exit(1);
});
