/**
 * Diagnostic Harness: Browser Runtime Compatibility Investigation (V3-54)
 * Evaluates supported browser runtime combinations with isolated profiles and passive verification.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CURRENT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-session-crashed-bubble',
  '--hide-crash-restore-bubble',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--password-store=basic',
];

const MINIMAL_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
];

async function runTest(config) {
  const {
    name,
    channel,
    headless = false,
    args = MINIMAL_ARGS,
    timeoutMs = 45000,
  } = config;

  const profileDir = path.join('/tmp', 'rt-runtime-tests', name);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });

  console.log(`\n============================================================`);
  console.log(`[HARNESS] Starting Test: ${name}`);
  console.log(`[HARNESS] Channel: ${channel || 'playwright-bundled'} | Headless: ${headless}`);
  console.log(`[HARNESS] Args: ${JSON.stringify(args)}`);
  console.log(`[HARNESS] Isolated Profile: ${profileDir}`);

  const launchOptions = {
    headless: headless ? (args.includes('--headless=new') ? false : true) : false,
    viewport: { width: 1280, height: 800 },
    args: [...args, ...(headless && !args.includes('--headless=new') ? ['--headless=new'] : [])],
  };
  if (channel) {
    launchOptions.channel = channel;
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, launchOptions);
  } catch (err) {
    console.error(`[HARNESS] Launch failed for ${name}: ${err.message}`);
    return {
      name,
      channel: channel || 'bundled',
      headless,
      argsType: args === CURRENT_ARGS ? 'current' : 'minimal',
      outcome: 'BROWSER_FAILED',
      error: err.message,
    };
  }

  const browser = context.browser();
  const browserVersion = browser?.version?.() || 'unknown';
  console.log(`[HARNESS] Browser launched successfully. Version: ${browserVersion}`);

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log(`[HARNESS] Navigating ONCE to target category: https://rutracker.org/forum/viewforum.php?f=887 ...`);
  const response = await page.goto('https://rutracker.org/forum/viewforum.php?f=887', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  }).catch((err) => {
    console.warn(`[HARNESS] Navigation warning: ${err.message}`);
    return null;
  });

  const httpStatus = response?.status() || 0;
  const cfMitigated = response?.headers()?.['cf-mitigated'] || 'none';
  const initialTitle = await page.title().catch(() => '');
  console.log(`[HARNESS] Navigation Result: HTTP ${httpStatus} | cf-mitigated: ${cfMitigated} | Title: "${initialTitle}"`);

  if (headless) {
    // In headless mode, simply check if target category was accessible or challenged
    const isChallenged = httpStatus === 403 || cfMitigated === 'challenge' || /just a moment|um momento/i.test(initialTitle);
    await context.close().catch(() => {});
    const outcome = isChallenged ? 'CHALLENGE_REMAINS' : (httpStatus === 200 ? 'FORUM_REACHED' : 'BROWSER_FAILED');
    console.log(`[HARNESS] Headless baseline outcome for ${name}: ${outcome}`);
    return {
      name,
      browserVersion,
      channel: channel || 'bundled',
      headless: true,
      argsType: args === CURRENT_ARGS ? 'current' : 'minimal',
      httpStatus,
      cfMitigated,
      outcome,
    };
  }

  console.log(`[HARNESS] Entering passive observation window (${timeoutMs / 1000}s). ZERO reloads/gotos from app.`);
  let forumDetected = false;
  let challengeDetected = true;
  let finalUrl = page.url();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (context.pages().length === 0) {
      console.log(`[HARNESS] Context closed.`);
      break;
    }

    const activePage = context.pages().find((p) => !p.isClosed()) || page;
    if (!activePage || activePage.isClosed()) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    try {
      const pageState = await activePage.evaluate(() => {
        const title = document.title || '';
        const bodyText = (document.body?.innerText || '').slice(0, 4000);
        const hasChallenge = /just a moment|um momento|checking your browser|verificando se você é humano/i.test(title)
          || /confirme que é humano|checking your browser|turnstile/i.test(bodyText);
        const hasForumDom = !!(document.querySelector('#page_container, #page_header, #main-nav, a[href*="viewforum.php"]'));
        const topicCount = document.querySelectorAll('a.torTopic').length;
        const isLogin = !!document.querySelector('form[action*="login.php"]');
        return {
          title,
          url: window.location.href,
          hasChallenge,
          hasForumDom,
          topicCount,
          isLogin,
        };
      });

      if (pageState) {
        finalUrl = pageState.url;
        challengeDetected = pageState.hasChallenge;
        if (!pageState.hasChallenge && pageState.hasForumDom) {
          forumDetected = true;
          console.log(`[HARNESS] SUCCESS: Forum category reached! (topics=${pageState.topicCount}) Title: "${pageState.title}"`);
          break;
        }
      }
    } catch (_) {}

    await new Promise((r) => setTimeout(r, 1500));
  }

  await context.close().catch(() => {});
  const outcome = forumDetected ? 'FORUM_REACHED' : (challengeDetected ? 'CHALLENGE_REMAINS' : 'CHALLENGE_REMAINS');
  console.log(`[HARNESS] Completed ${name}: Outcome = ${outcome}`);

  return {
    name,
    browserVersion,
    channel: channel || 'bundled',
    headless: false,
    argsType: args === CURRENT_ARGS ? 'current' : 'minimal',
    httpStatus,
    cfMitigated,
    outcome,
    finalUrl,
  };
}

async function main() {
  const mode = process.argv[2] || 'all';
  const results = [];

  const testDefinitions = [
    {
      name: 'bundled-headed-current-args',
      channel: null,
      headless: false,
      args: CURRENT_ARGS,
      timeoutMs: 35000,
    },
    {
      name: 'bundled-headed-minimal-args',
      channel: null,
      headless: false,
      args: MINIMAL_ARGS,
      timeoutMs: 35000,
    },
    {
      name: 'bundled-headless-minimal-args',
      channel: null,
      headless: true,
      args: MINIMAL_ARGS,
    },
    {
      name: 'system-chrome-minimal-args',
      channel: 'chrome',
      headless: false,
      args: MINIMAL_ARGS,
      timeoutMs: 35000,
    },
  ];

  const selectedTests = mode === 'all'
    ? testDefinitions
    : testDefinitions.filter((t) => t.name.includes(mode));

  for (const t of selectedTests) {
    const result = await runTest(t);
    results.push(result);
  }

  console.log(`\n============================================================`);
  console.log(`[HARNESS] BROWSER RUNTIME COMPATIBILITY MATRIX SUMMARY`);
  console.log(`============================================================`);
  console.log(`| Test Name | Browser | Version | Headed | Args | Result | Status | cf-mitigated |`);
  console.log(`|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    console.log(`| ${r.name} | ${r.channel} | ${r.browserVersion || 'n/a'} | ${!r.headless} | ${r.argsType} | **${r.outcome}** | ${r.httpStatus || 0} | ${r.cfMitigated || 'none'} |`);
  }
  console.log(`============================================================\n`);
}

main().catch(console.error);

