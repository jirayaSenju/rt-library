/**
 * Minimal Isolated Diagnostic Script for RuTracker Cloudflare Verification (V3-46)
 *
 * Runs completely separate from RT-Library.
 * Uses Playwright persistent context to open Chromium headed once to f=1605.
 * Performs NO auto-reloads, NO secondary gotos, NO polling re-navigations.
 * Logs only main-frame navigation events.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

async function runDiagnostic() {
  const diagnosticProfileDir = path.join(os.tmpdir(), 'rt-library-cf-diagnostic-profile');
  fs.mkdirSync(diagnosticProfileDir, { recursive: true });

  console.log('====================================================');
  console.log('[ISOLATED_DIAGNOSTIC] Starting Playwright Cloudflare Test');
  console.log(`[ISOLATED_DIAGNOSTIC] Profile Dir: ${diagnosticProfileDir}`);
  console.log('====================================================');

  const context = await chromium.launchPersistentContext(diagnosticProfileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`[MAIN_FRAME_NAVIGATED] timestamp=${new Date().toISOString()} url=${frame.url()}`);
    }
  });

  page.on('response', (response) => {
    if (response.frame() === page.mainFrame() && response.request().resourceType() === 'document') {
      console.log(`[MAIN_FRAME_RESPONSE] timestamp=${new Date().toISOString()} status=${response.status()} url=${response.url()} cfMitigated=${response.headers()['cf-mitigated'] || 'none'}`);
    }
  });

  const targetUrl = 'https://rutracker.org/forum/viewforum.php?f=1605';
  console.log(`[APP_GOTO_SINGLE] Navigating main-frame ONCE to: ${targetUrl}`);
  
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    console.error(`[APP_GOTO_ERROR] ${err.message}`);
  }

  console.log('\n[PASSIVE_OBSERVATION] Navigation completed.');
  console.log('[PASSIVE_OBSERVATION] Zero automated GOTOs or RELOADs will occur from this script.');
  console.log('[PASSIVE_OBSERVATION] Please solve the Cloudflare challenge manually in the browser window.');
  console.log('[PASSIVE_OBSERVATION] Press Ctrl+C in terminal when done, or wait 3 minutes for auto-exit.\n');

  await new Promise((resolve) => setTimeout(resolve, 180000));
  await context.close();
  console.log('[ISOLATED_DIAGNOSTIC] Test completed cleanly.');
}

runDiagnostic().catch((err) => {
  console.error('[ISOLATED_DIAGNOSTIC_FATAL]', err);
  process.exit(1);
});

