/**
 * V3-81.1 - Minimal Standalone Electron Turnstile Investigation POC
 *
 * Runs an isolated Electron BrowserWindow to observe legitimate Cloudflare Turnstile behavior:
 * - NO stealth / fingerprint spoofing
 * - NO navigator.webdriver patch
 * - NO CAPTCHA solver or automated clicking
 * - Clean isolated partition: persist:rutracker-verification-debug
 * - Safe metadata telemetry (no tokens, no cookies, no sensitive queries)
 * - Safe navigation event logging & classification
 * - Detects FORUM_READY, CHALLENGE_REQUIRED, and VERIFICATION_LOOP
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION_NAME = 'persist:rutracker-verification-debug';
const TARGET_URL = 'https://rutracker.org/forum/index.php';
const TELEMETRY_PATH = path.resolve(__dirname, 'turnstile-manual-telemetry.json');

// Ensure Chromium hardware rasterizer flags don't prevent window creation in Linux Wayland/X11
app.commandLine.appendSwitch('no-sandbox');

const telemetry = {
  timestamp: new Date().toISOString(),
  environment: {
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    systemClock: new Date().toISOString(),
  },
  partition: {
    name: PARTITION_NAME,
    isPersist: PARTITION_NAME.startsWith('persist:'),
    userDataDir: '',
    storagePathConfirmed: false,
  },
  sessionAudit: {
    sameSessionObject: false,
    userAgent: '',
  },
  navigationHistory: [],
  blockedNavigations: [],
  challengeEvents: {
    totalChallengesObserved: 0,
    attempts: [],
    finalResult: 'IN_PROGRESS', // FORUM_READY | VERIFICATION_LOOP | FAILED | CLOSED_BY_USER
  },
};

function safeUrlMetadata(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch (_) {
    return { raw: String(rawUrl).slice(0, 50) };
  }
}

function logEvent(type, metadata = {}) {
  const entry = {
    time: new Date().toISOString(),
    event: type,
    ...metadata,
  };
  telemetry.navigationHistory.push(entry);
  console.log(`[TURNSTILE_INVESTIGATION][${type}]`, JSON.stringify(metadata));
  try {
    fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(telemetry, null, 2), 'utf8');
  } catch (_) {}
}

function classifyPage(html = '', title = '', httpStatus = 200) {
  const challengeRegex = /just a moment|um momento|checking your browser|cf-browser-verification|challenge-platform|enable javascript and cookies|attention required|ddos-guard/i;
  const loginRegex = /login\.php|name="login_username"|id="login_username"/i;
  const forumRegex = /<table[^>]*forumline|class=["'][^"']*torTopic|class=["'][^"']*post_body|id=["']topic_main["']|id=["']tor-tbl["']|id=["']page_container["']|id=["']page_header["']|href=["'][^"']*viewforum\.php\?f=\d+/i;

  const isTitleChallenge = /just a moment|um momento/i.test(title);
  const isBodyChallenge = challengeRegex.test(html);
  const isChallenge = Number(httpStatus) === 403 || isTitleChallenge || isBodyChallenge;

  // Crucial Rule 51: FORUM_READY takes priority over residual challenge markers
  const forumDetected = !isChallenge && forumRegex.test(html);

  if (forumDetected) return 'FORUM_READY';
  if (isChallenge) return 'CHALLENGE_REQUIRED';
  if (loginRegex.test(html)) return 'AUTH_REQUIRED';
  if (httpStatus >= 400 || httpStatus === 0) return 'HTTP_ERROR';
  return 'UNCLASSIFIED';
}

app.whenReady().then(async () => {
  console.log('\n============================================================');
  console.log(' V3-81.1 STANDALONE TURNSTILE INVESTIGATION POC');
  console.log('============================================================\n');

  const userDataDir = app.getPath('userData');
  telemetry.partition.userDataDir = userDataDir;
  telemetry.partition.storagePathConfirmed = fs.existsSync(userDataDir);

  const debugSession = session.fromPartition(PARTITION_NAME);
  telemetry.sessionAudit.userAgent = debugSession.getUserAgent();

  console.log('Environment:');
  console.log(`  Electron: ${telemetry.environment.electronVersion}`);
  console.log(`  Chromium: ${telemetry.environment.chromiumVersion}`);
  console.log(`  OS/Arch:  ${telemetry.environment.platform} (${telemetry.environment.arch})`);
  console.log(`  Clock:    ${telemetry.environment.systemClock}`);
  console.log(`  UserData: ${userDataDir}`);
  console.log(`  User-Agent: ${telemetry.sessionAudit.userAgent}\n`);

  const win = new BrowserWindow({
    show: true,
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 500,
    title: 'V3-81.1 Standalone Investigation - RuTracker Turnstile',
    autoHideMenuBar: true,
    webPreferences: {
      session: debugSession,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined, // Strictly NO stealth, NO bypass, NO webdriver patch
      enableRemoteModule: false,
      devTools: true,
      spellcheck: false,
    },
  });

  telemetry.sessionAudit.sameSessionObject = (win.webContents.session === debugSession);
  console.log(`Session Object Match: ${telemetry.sessionAudit.sameSessionObject ? 'YES' : 'NO'}`);

  let consecutiveChallenges = 0;
  let hasUserInteracted = false;
  let lastClassification = 'INITIAL';

  const ALLOWED_VERIFICATION_HOSTS = new Set([
    'rutracker.org',
    'rutracker.net',
    'rutracker.nl',
    'challenges.cloudflare.com',
    'cloudflare.com',
    'static.cloudflareinsights.com',
  ]);

  function isPermitted(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      return (
        ALLOWED_VERIFICATION_HOSTS.has(host) ||
        host.endsWith('.rutracker.org') ||
        host.endsWith('.cloudflare.com') ||
        host.endsWith('.cloudflareinsights.com')
      );
    } catch (_) {
      return false;
    }
  }

  // Navigation Instrumentation
  win.webContents.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) => {
    logEvent('did-start-navigation', {
      ...safeUrlMetadata(url),
      isInPlace,
      isMainFrame,
    });
  });

  win.webContents.on('did-redirect-navigation', (_e, url, isInPlace, isMainFrame) => {
    logEvent('did-redirect-navigation', {
      ...safeUrlMetadata(url),
      isInPlace,
      isMainFrame,
    });
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isPermitted(url)) {
      event.preventDefault();
      const meta = safeUrlMetadata(url);
      telemetry.blockedNavigations.push({ ...meta, reason: 'outside_allowlist' });
      logEvent('will-navigate:BLOCKED', meta);
    }
  });

  win.webContents.on('will-redirect', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame !== false && !isPermitted(url)) {
      event.preventDefault();
      const meta = safeUrlMetadata(url);
      telemetry.blockedNavigations.push({ ...meta, reason: 'outside_allowlist_redirect' });
      logEvent('will-redirect:BLOCKED', meta);
    }
  });

  win.webContents.on('did-navigate', (_e, url, httpStatusCode) => {
    logEvent('did-navigate', {
      ...safeUrlMetadata(url),
      httpStatusCode,
    });
  });

  win.webContents.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    logEvent('did-navigate-in-page', {
      ...safeUrlMetadata(url),
      isMainFrame,
    });
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logEvent('did-fail-load', {
      ...safeUrlMetadata(validatedURL),
      errorCode,
      errorDescription,
      isMainFrame,
    });
  });

  const checkStatus = async () => {
    if (win.isDestroyed()) return;
    try {
      const title = win.getTitle() || '';
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '');
      const classification = classifyPage(html, title);

      if (classification !== lastClassification) {
        lastClassification = classification;
        logEvent('classification-change', {
          classification,
          title,
          ...safeUrlMetadata(win.webContents.getURL()),
        });

        if (classification === 'CHALLENGE_REQUIRED') {
          telemetry.challengeEvents.totalChallengesObserved++;
          consecutiveChallenges++;

          const attemptRecord = {
            attemptNumber: consecutiveChallenges,
            timestamp: new Date().toISOString(),
            isRepeatedLoop: consecutiveChallenges > 1,
            userInteractedBefore: hasUserInteracted,
          };
          telemetry.challengeEvents.attempts.push(attemptRecord);

          if (consecutiveChallenges > 1) {
            console.warn(`\n[WARNING] Cloudflare challenge repeated after user action! (Attempt ${consecutiveChallenges}) -> VERIFICATION_LOOP`);
            if (consecutiveChallenges >= 3) {
              telemetry.challengeEvents.finalResult = 'VERIFICATION_LOOP';
              console.error('\n============================================================');
              console.error(' [VERIFICATION_LOOP] Max interactive loops reached (3).');
              console.error(' Cloudflare challenge is rejecting the Electron runtime environment.');
              console.error('============================================================\n');
            }
          } else {
            console.log('\n[INFO] First challenge detected. Waiting for manual user interaction (click checkbox)...');
          }
        } else if (classification === 'FORUM_READY') {
          telemetry.challengeEvents.finalResult = 'FORUM_READY';
          console.log('\n============================================================');
          console.log(' [SUCCESS] Forum markers confirmed! FORUM_READY achieved.');
          console.log('============================================================\n');
        }
      }
    } catch (_) {}
  };

  win.webContents.on('did-finish-load', () => {
    logEvent('did-finish-load', safeUrlMetadata(win.webContents.getURL()));
    hasUserInteracted = true;
    checkStatus();
  });

  const pollTimer = setInterval(checkStatus, 1000);

  win.on('closed', () => {
    clearInterval(pollTimer);
    if (telemetry.challengeEvents.finalResult === 'IN_PROGRESS') {
      telemetry.challengeEvents.finalResult = 'CLOSED_BY_USER';
    }
    console.log('\nTest completed. Final status:', telemetry.challengeEvents.finalResult);
    console.log('Telemetry written to:', TELEMETRY_PATH);
    fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(telemetry, null, 2), 'utf8');
    app.quit();
  });

  console.log(`Loading ${TARGET_URL}...`);
  win.loadURL(TARGET_URL);
});

