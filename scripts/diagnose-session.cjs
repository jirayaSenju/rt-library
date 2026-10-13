/**
 * Playwright Scraper Session Diagnostic Tool
 * Evaluates profile existence, index accessibility, category response,
 * and whether the server explicitly requires browser verification.
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

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  let indexStatus = 0;
  let indexChallenge = false;
  let targetStatus = 0;
  let targetCfMitigated = false;

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
