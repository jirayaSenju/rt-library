/**
 * Diagnostic Script: Headed Passive RuTracker Verification (V3-51 Phase 7)
 * Opens RuTracker in Playwright Chromium headed mode with ZERO app retries/reloads.
 * Logs all close traces and lifecycle events.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getScraperProfileDir } = require('../scraper/platformPaths.cjs');

async function runDiagnosis() {
  const baseDir = path.dirname(getScraperProfileDir());
  fs.mkdirSync(baseDir, { recursive: true });
  const diagProfileDir = path.join(baseDir, 'scraper-profile-diag');
  fs.mkdirSync(diagProfileDir, { recursive: true });

  console.log(`[DIAG][START] Launching passive headed diagnosis profile=${diagProfileDir}`);

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-infobars',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  const context = await chromium.launchPersistentContext(diagProfileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: launchArgs,
  });

  const browserProcess = context.browser()?.process?.();
  const pid = browserProcess?.pid || 'unknown';
  console.log(`[DIAG][PROCESS] Chromium persistent context launched. pid=${pid}`);

  const logCloseTrace = (origin, detail) => {
    const stack = new Error().stack?.split('\n').slice(2, 6).join(' | ') || '';
    console.log(`[SCRAPER][CLOSE_TRACE] timestamp=${new Date().toISOString()} pid=${pid} origin=${origin} detail="${detail}" stack="${stack}"`);
  };

  context.on('close', () => {
    logCloseTrace('CONTEXT_CLOSE', 'PersistentContext closed');
  });

  context.on('page', (page) => {
    console.log(`[DIAG][EVENT] New page opened in context`);
    page.on('close', () => logCloseTrace('PAGE_CLOSE', `Page closed url=${page.url()}`));
    page.on('crash', () => logCloseTrace('PAGE_CRASH', `Page crashed url=${page.url()}`));
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  page.on('close', () => logCloseTrace('PAGE_CLOSE', `Primary page closed url=${page.url()}`));
  page.on('crash', () => logCloseTrace('PAGE_CRASH', `Primary page crashed url=${page.url()}`));

  process.on('exit', (code) => logCloseTrace('PROCESS_EXIT', `Node process exit code=${code}`));
  process.on('SIGINT', () => logCloseTrace('SIGNAL', 'Received SIGINT'));
  process.on('SIGTERM', () => logCloseTrace('SIGNAL', 'Received SIGTERM'));

  console.log(`[DIAG][NAVIGATE] Step 1: index.php ...`);
  const indexRes = await page.goto('https://rutracker.org/forum/index.php', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`[DIAG][NAVIGATE] Step 1 index.php status=${indexRes?.status() || 0} title="${await page.title()}"`);

  console.log(`[DIAG][NAVIGATE] Step 2: viewforum.php?f=887 (Xbox category) ...`);
  const catRes = await page.goto('https://rutracker.org/forum/viewforum.php?f=887', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`[DIAG][NAVIGATE] Step 2 viewforum.php status=${catRes?.status() || 0} cf-mitigated=${catRes?.headers()['cf-mitigated'] || 'none'} title="${await page.title()}"`);

  console.log(`[DIAG][WAIT] Browser is now OPEN and PASSIVE. No further gotos/reloads will be triggered by app.`);
  console.log(`[DIAG][WAIT] Waiting 3 minutes (180s) for user interaction or Cloudflare challenge result...`);

  await new Promise((resolve) => setTimeout(resolve, 180000));

  console.log(`[DIAG][COMPLETE] Passive test completed. Closing context cleanly...`);
  logCloseTrace('APP_CONTEXT_CLOSE', 'Closing context cleanly after 180s diagnosis window');
  await context.close();
}

runDiagnosis().catch((err) => {
  console.error('[DIAG][ERROR]', err);
  process.exit(1);
});
