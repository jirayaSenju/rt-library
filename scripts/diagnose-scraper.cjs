/**
 * Scraper Parity & Session Diagnostic Tool
 * Matrix: Headed vs Headless with Persistent Profile & Clean Profile
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');
const { getScraperProfileDir } = require('../scraper/browser.cjs');

console.log('================================================================================');
console.log('       RUTRACKER PLAYWRIGHT SCRAPER PARITY & DIAGNOSTIC SUITE');
console.log('================================================================================\n');

function getProfileMetrics(profileDir) {
  const exists = fs.existsSync(profileDir);
  let writable = false;
  let fileCount = 0;
  let totalSize = 0;
  let lastModified = null;

  if (exists) {
    try {
      fs.accessSync(profileDir, fs.constants.W_OK);
      writable = true;
    } catch (_) {}

    try {
      const walk = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fp = path.join(dir, file);
          const stat = fs.statSync(fp);
          if (stat.isDirectory()) {
            walk(fp);
          } else {
            fileCount++;
            totalSize += stat.size;
            if (!lastModified || stat.mtimeMs > lastModified) {
              lastModified = stat.mtimeMs;
            }
          }
        }
      };
      walk(profileDir);
    } catch (_) {}
  }

  return {
    requested: profileDir,
    resolved: path.resolve(profileDir),
    exists,
    writable,
    fileCount,
    totalSizeBytes: totalSize,
    totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    lastModified: lastModified ? new Date(lastModified).toISOString() : null,
  };
}

async function inspectContext(context) {
  const cookies = await context.cookies();
  const ruTrackerCookies = cookies.filter(c => c.domain.includes('rutracker.org'));
  
  const cookieMetadata = ruTrackerCookies.map(c => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    expires: c.expires > 0 ? new Date(c.expires * 1000).toISOString() : 'session',
    secure: c.secure,
    sameSite: c.sameSite,
  }));

  const cfClearance = cookieMetadata.find(c => c.name === 'cf_clearance');

  return {
    totalCookies: cookies.length,
    ruTrackerCookiesCount: ruTrackerCookies.length,
    cookieNames: ruTrackerCookies.map(c => c.name),
    cfClearance: cfClearance || null,
  };
}

async function runHealthCheckTrace(page, modeLabel) {
  const networkLogs = [];

  const responseListener = (res) => {
    const url = res.url();
    if (url.includes('rutracker.org')) {
      networkLogs.push({
        url,
        status: res.status(),
        statusText: res.statusText(),
        headers: {
          server: res.headers()['server'] || null,
          contentType: res.headers()['content-type'] || null,
          cfMitigated: res.headers()['cf-mitigated'] || null,
          cfRay: res.headers()['cf-ray'] ? 'present' : 'absent',
        },
      });
    }
  };

  page.on('response', responseListener);

  const trace = {
    mode: modeLabel,
    step1_index: { status: 'PENDING' },
    step2_challenge: { detected: false },
    step3_forum_dom: { visible: false },
    step4_subforum: { status: 'PENDING' },
    step5_topics: { count: 0 },
    networkLogs,
  };

  try {
    // Step 1: Open Index
    console.log(`  [${modeLabel}] Step 1: Navigating to https://rutracker.org/forum/index.php ...`);
    const indexRes = await page.goto('https://rutracker.org/forum/index.php', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    trace.step1_index = {
      status: indexRes ? indexRes.status() : 0,
      finalUrl: page.url(),
      title: await page.title(),
    };

    // Step 2: Challenge Detection
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
    const challengePatterns = [
      /just a moment/i,
      /um momento/i,
      /enable javascript and cookies/i,
      /attention required/i,
      /checking your browser/i,
    ];

    let challengeReason = null;
    for (const pattern of challengePatterns) {
      if (pattern.test(title)) {
        challengeReason = `title matched ${pattern}`;
        break;
      }
      if (pattern.test(bodyText)) {
        challengeReason = `body text matched ${pattern}`;
        break;
      }
    }

    trace.step2_challenge = {
      detected: !!challengeReason,
      reason: challengeReason,
    };

    // Step 3: Forum DOM check
    const isDomVisible = await page.evaluate(() => {
      return !!(
        document.querySelector('#page_container') ||
        document.querySelector('#page_header') ||
        document.querySelector('a[href*="viewforum.php"]')
      );
    });
    trace.step3_forum_dom = { visible: isDomVisible };

    // Step 4: Open Subforum
    console.log(`  [${modeLabel}] Step 4: Navigating to subforum (f=773)...`);
    const subRes = await page.goto('https://rutracker.org/forum/viewforum.php?f=773', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    trace.step4_subforum = {
      status: subRes ? subRes.status() : 0,
      finalUrl: page.url(),
      title: await page.title(),
    };

    // Step 5: Topics Count
    const topicCount = await page.evaluate(() => document.querySelectorAll('a.torTopic').length);
    trace.step5_topics = { count: topicCount };

  } catch (err) {
    trace.error = err.message;
  } finally {
    page.off('response', responseListener);
  }

  return trace;
}

async function testMatrixCell(label, { headless, profileDir }) {
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(` Matrix Test ${label}: headless=${headless}, profile=${profileDir}`);
  console.log(`--------------------------------------------------------------------------------`);

  const profileMetrics = getProfileMetrics(profileDir);
  console.log(`  Profile requested: ${profileMetrics.requested}`);
  console.log(`  Profile resolved:  ${profileMetrics.resolved} (exists=${profileMetrics.exists}, size=${profileMetrics.totalSizeMB}MB)`);

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const cookieData = await inspectContext(context);

    console.log(`  Cookies found: ${cookieData.ruTrackerCookiesCount} for RuTracker (names: ${cookieData.cookieNames.join(', ') || 'none'})`);
    if (cookieData.cfClearance) {
      console.log(`  cf_clearance cookie PRESENT: domain=${cookieData.cfClearance.domain}, expires=${cookieData.cfClearance.expires}`);
    } else {
      console.log(`  cf_clearance cookie ABSENT`);
    }

    const trace = await runHealthCheckTrace(page, label);
    console.log(`  Trace Summary for ${label}:`);
    console.log(`    Index Status:     ${trace.step1_index.status} (${trace.step1_index.finalUrl})`);
    console.log(`    Challenge:        ${trace.step2_challenge.detected ? `DETECTED (${trace.step2_challenge.reason})` : 'PASSED (None)'}`);
    console.log(`    Subforum Status:  ${trace.step4_subforum.status} (${trace.step4_subforum.finalUrl})`);
    console.log(`    Topics Found:     ${trace.step5_topics.count}`);
    if (trace.error) {
      console.log(`    Error encountered: ${trace.error}`);
    }

    return {
      label,
      headless,
      profileDir,
      cookieData,
      trace,
      pass: !trace.step2_challenge.detected && trace.step5_topics.count > 0,
    };

  } catch (err) {
    console.error(`  ✕ Test ${label} failed to launch or run: ${err.message}`);
    return { label, headless, profileDir, error: err.message, pass: false };
  } finally {
    if (context) {
      try { await context.close(); } catch (_) {}
    }
  }
}

async function runDiagnostics() {
  console.log('--- ENVIRONMENT PARITY ---');
  console.log(`  HOME:            ${process.env.HOME}`);
  console.log(`  XDG_CONFIG_HOME: ${process.env.XDG_CONFIG_HOME || '(unset)'}`);
  console.log(`  XDG_CACHE_HOME:  ${process.env.XDG_CACHE_HOME || '(unset)'}`);
  console.log(`  CWD:             ${process.cwd()}`);
  console.log(`  NODE_ENV:        ${process.env.NODE_ENV || 'production'}`);
  console.log(`  Node version:    ${process.version}`);
  console.log(`  Playwright exec: ${chromium.executablePath()}`);

  const persistentProfile = getScraperProfileDir();
  const tmpProfile = path.join(os.tmpdir(), `rt-diag-clean-profile-${Date.now()}`);

  const results = [];
  results.push(await testMatrixCell('A (Headed + Persistent Profile)', { headless: false, profileDir: persistentProfile }));
  results.push(await testMatrixCell('B (Headless + Persistent Profile)', { headless: true, profileDir: persistentProfile }));
  results.push(await testMatrixCell('C (Headed + Clean Profile)', { headless: false, profileDir: tmpProfile }));
  results.push(await testMatrixCell('D (Headless + Clean Profile)', { headless: true, profileDir: tmpProfile }));

  try {
    fs.rmSync(tmpProfile, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n================================================================================');
  console.log('       DIAGNOSTIC MATRIX PARITY SUMMARY');
  console.log('================================================================================');
  console.log('  Matrix Cell                          | Cookies | Challenge | Topics | Result');
  console.log('  -----------------------------------------------------------------------------');
  results.forEach(r => {
    const cookies = r.cookieData ? r.cookieData.ruTrackerCookiesCount : 0;
    const challenge = r.trace?.step2_challenge?.detected ? 'YES' : 'NO';
    const topics = r.trace?.step5_topics?.count || 0;
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`  ${r.label.padEnd(36)} | ${String(cookies).padStart(7)} | ${challenge.padStart(9)} | ${String(topics).padStart(6)} | ${status}`);
  });
  console.log('================================================================================\n');
}

if (require.main === module) {
  runDiagnostics();
}
