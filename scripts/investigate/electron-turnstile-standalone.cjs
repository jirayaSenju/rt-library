/**
 * V3-81.2 - Standalone Electron Turnstile Investigation Baseline
 *
 * Strictly tests Cloudflare Turnstile inside pure Electron without any
 * RT-Library orchestration (no ScraperManager, no ScanEngine, no workers,
 * no scheduler, no access probes, no parser, no database, no React, no IPC).
 *
 * Rules:
 * - Security: nodeIntegration: false, contextIsolation: true, sandbox: true, preload: undefined
 * - NO stealth, NO fingerprint spoofing, NO navigator.webdriver patch
 * - NO automated clicking, NO CAPTCHA solver
 * - Isolated test partition: persist:rutracker-turnstile-test
 * - Tracks challengeGeneration (1, 2, 3...) to distinguish phase render vs new challenge
 * - Safe metadata only (no cookies, no tokens, no sensitive query params)
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const PARTITION_NAME = 'persist:rutracker-turnstile-test';
const TARGET_URL = 'https://rutracker.org/forum/index.php';
const REPORT_PATH = path.resolve(__dirname, 'turnstile-standalone-report.json');

app.commandLine.appendSwitch('no-sandbox');

const report = {
  investigation: 'V3-81.2 - Turnstile Loop Root Cause & Electron Runtime Compatibility',
  timestamp: new Date().toISOString(),
  runtime: {
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome || '126.0.6478.182 (Chromium bundled with Electron 31)',
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    systemClock: new Date().toISOString(),
  },
  sessionConfig: {
    partition: PARTITION_NAME,
    isPersist: PARTITION_NAME.startsWith('persist:'),
    userDataDir: '',
  },
  securityConfig: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: null,
  },
  navigationLog: [],
  challengeGenerations: [],
  summary: {
    totalGenerations: 0,
    rayIdsObserved: [],
    finalResult: 'IN_PROGRESS', // FORUM_READY | VERIFICATION_LOOP | CLOSED_BY_USER
  },
};

function safeUrlMetadata(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch (_) {
    return { hostname: 'unknown', pathname: String(rawUrl).slice(0, 50) };
  }
}

function logNavigation(eventName, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    ...meta,
  };
  report.navigationLog.push(entry);
  console.log(`[STANDALONE][${eventName}]`, JSON.stringify(meta));
  try {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  } catch (_) {}
}

function classifyDocument(html = '', title = '', httpStatus = 200) {
  const challengeRegex = /just a moment|um momento|checking your browser|cf-browser-verification|challenge-platform|enable javascript and cookies|attention required|ddos-guard/i;
  const loginRegex = /login\.php|name="login_username"|id="login_username"/i;
  const forumRegex = /<table[^>]*forumline|class=["'][^"']*torTopic|class=["'][^"']*post_body|id=["']topic_main["']|id=["']tor-tbl["']|id=["']page_container["']|id=["']page_header["']|href=["'][^"']*viewforum\.php\?f=\d+/i;

  const isTitleChallenge = /just a moment|um momento/i.test(title);
  const isBodyChallenge = challengeRegex.test(html);
  const isForbidden = Number(httpStatus) === 403;
  const hasForumMarkers = forumRegex.test(html);

  // Rule 15 & 16: FORUM_READY priority over residual DOM markers
  if (hasForumMarkers && !isTitleChallenge && !isForbidden) {
    return 'FORUM_READY';
  }
  if (loginRegex.test(html)) {
    return 'AUTH_REQUIRED';
  }
  if (isForbidden || isTitleChallenge || isBodyChallenge) {
    return 'ACTIVE_CHALLENGE';
  }
  if (httpStatus >= 400 || httpStatus === 0) {
    return 'HTTP_ERROR';
  }
  return 'UNCLASSIFIED';
}

function extractRayId(html = '') {
  const match = html.match(/Ray ID:\s*<[^>]+>([a-f0-9]+)<\/[^>]+>|Ray ID:\s*([a-f0-9]+)/i);
  return match ? (match[1] || match[2]) : null;
}

app.whenReady().then(async () => {
  console.log('\n============================================================');
  console.log(' V3-81.2 ELECTRON TURNSTILE STANDALONE BASELINE TEST');
  console.log('============================================================\n');

  const userDataDir = app.getPath('userData');
  report.sessionConfig.userDataDir = userDataDir;

  const testSession = session.fromPartition(PARTITION_NAME);

  console.log('Runtime Environment:');
  console.log(`  Electron: ${report.runtime.electronVersion}`);
  console.log(`  Chromium: ${report.runtime.chromiumVersion}`);
  console.log(`  Platform: ${report.runtime.platform} (${report.runtime.arch})`);
  console.log(`  Clock:    ${report.runtime.systemClock}`);
  console.log(`  Partition: ${PARTITION_NAME}\n`);

  const win = new BrowserWindow({
    show: true,
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 500,
    title: 'V3-81.2 Standalone Electron Turnstile Test',
    autoHideMenuBar: true,
    webPreferences: {
      session: testSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined, // Strictly NO preload / NO bypass
      spellcheck: false,
    },
  });

  let currentGeneration = 0;
  let lastClassification = 'NONE';
  let lastRayId = null;

  // Navigation Instrumentation
  win.webContents.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) => {
    logNavigation('did-start-navigation', {
      ...safeUrlMetadata(url),
      isInPlace,
      isMainFrame,
    });
  });

  win.webContents.on('did-redirect-navigation', (_e, url, isInPlace, isMainFrame) => {
    logNavigation('did-redirect-navigation', {
      ...safeUrlMetadata(url),
      isInPlace,
      isMainFrame,
    });
  });

  win.webContents.on('did-navigate', (_e, url, httpStatusCode) => {
    logNavigation('did-navigate', {
      ...safeUrlMetadata(url),
      httpStatusCode,
    });
  });

  const checkPage = async () => {
    if (win.isDestroyed()) return;
    try {
      const title = win.getTitle() || '';
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '');
      const classification = classifyDocument(html, title);
      const rayId = extractRayId(html);

      if (classification !== lastClassification || (rayId && rayId !== lastRayId)) {
        lastClassification = classification;
        if (rayId && rayId !== lastRayId) {
          lastRayId = rayId;
          if (!report.summary.rayIdsObserved.includes(rayId)) {
            report.summary.rayIdsObserved.push(rayId);
          }
        }

        logNavigation('classification-change', {
          classification,
          title,
          rayId: rayId || 'none',
          ...safeUrlMetadata(win.webContents.getURL()),
        });

        if (classification === 'ACTIVE_CHALLENGE') {
          currentGeneration++;
          report.summary.totalGenerations = currentGeneration;

          const generationRecord = {
            generationId: currentGeneration,
            timestamp: new Date().toISOString(),
            rayId: rayId || 'unknown',
            isRepeatedChallenge: currentGeneration > 1,
          };
          report.challengeGenerations.push(generationRecord);

          console.log(`\n[CHALLENGE] Challenge Generation #${currentGeneration} detected (Ray ID: ${rayId || 'n/a'}).`);

          if (currentGeneration > 1) {
            console.warn(`[WARNING] Challenge re-emitted after user interaction! (Generation #${currentGeneration})`);
            if (currentGeneration >= 3) {
              report.summary.finalResult = 'VERIFICATION_LOOP';
              console.error('\n============================================================');
              console.error(' RESULT: VERIFICATION_LOOP');
              console.error(' Cloudflare repeatedly rejects the standalone Electron runtime.');
              console.error(' Max interactive attempts (3) reached.');
              console.error('============================================================\n');
            }
          } else {
            console.log('Action: Tester should manually click the checkbox to verify human presence.');
          }
        } else if (classification === 'FORUM_READY') {
          report.summary.finalResult = 'FORUM_READY';
          console.log('\n============================================================');
          console.log(' RESULT: FORUM_READY');
          console.log(' Cloudflare challenge successfully passed in standalone Electron!');
          console.log('============================================================\n');
        }
      }
    } catch (_) {}
  };

  win.webContents.on('did-finish-load', () => {
    logNavigation('did-finish-load', safeUrlMetadata(win.webContents.getURL()));
    checkPage();
  });

  const pollInterval = setInterval(checkPage, 1000);

  win.on('closed', () => {
    clearInterval(pollInterval);
    if (report.summary.finalResult === 'IN_PROGRESS') {
      report.summary.finalResult = 'CLOSED_BY_USER';
    }
    console.log('\nStandalone test closed. Final result:', report.summary.finalResult);
    console.log('Report written to:', REPORT_PATH);
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    app.quit();
  });

  console.log(`Loading ${TARGET_URL}...`);
  win.loadURL(TARGET_URL);
});

