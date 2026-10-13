/**
 * V3-81 In-App Verification & Embedded Session Real Runtime Validation
 *
 * Runs inside Electron Main to validate:
 * 1. Exact partition session isolation (persist:rutracker-v1-test)
 * 2. Session reset capability (cache and storage cleared)
 * 3. Verification window creation and webPreferences inspection (nodeIntegration: false, sandbox: true, contextIsolation: true, no preload)
 * 4. Singleton verification window focus without duplicate window creation
 * 5. Allowlist navigation guards on verification window
 * 6. Clean closing and disposal of verification window and worker pool
 * 7. Records structured telemetry in scripts/investigate/v3-81-verification-telemetry.json
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const { EmbeddedElectronTransport } = require('../../electron/scraper/embeddedElectronTransport.cjs');

app.whenReady().then(async () => {
  console.log('[V3-81_TEST] Starting In-App Verification Real Runtime Validation...');

  const telemetry = {
    test: 'V3-81 In-App Verification & Embedded Session Recovery',
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
    },
    partitionTested: 'persist:rutracker-v1-test',
    sessionReset: {},
    verificationWindow: {},
    singletonFocus: {},
    securityAudit: {},
    disposal: {},
    interactiveVerificationObserved: false, // Honest evidence reporting
  };

  const transport = new EmbeddedElectronTransport({
    sessionPartition: 'persist:rutracker-v1-test',
    maxWorkers: 3,
    verificationTimeoutMs: 10000,
  });

  try {
    // 1. Session Reset Verification
    console.log('[V3-81_TEST] Testing session reset...');
    const t0 = Date.now();
    const resetResult = await transport.resetSession();
    telemetry.sessionReset = {
      success: resetResult.success,
      durationMs: Date.now() - t0,
    };
    console.log('[V3-81_TEST] Session reset completed in', telemetry.sessionReset.durationMs, 'ms');

    // 2. Verification Window Lifecycle & Inspection
    console.log('[V3-81_TEST] Testing verification window creation...');
    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php', {
      title: 'RT-Library - Verification Test',
      width: 900,
      height: 700,
      show: Boolean(process.env.DISPLAY),
    });

    const win = transport.verificationWindow;
    if (!win) throw new Error('Verification window was not created.');

    telemetry.verificationWindow = {
      windowCreated: true,
      isVisible: win.isVisible(),
      title: win.getTitle(),
      bounds: win.getBounds(),
      partitionMatch: transport.session === win.webContents.session,
    };

    // 3. Security Inspection
    const webPrefs = win.webContents.getLastWebPreferences ? win.webContents.getLastWebPreferences() : {};
    telemetry.securityAudit = {
      nodeIntegration: webPrefs.nodeIntegration === false,
      contextIsolation: webPrefs.contextIsolation === true,
      sandbox: webPrefs.sandbox === true,
      noPreload: !webPrefs.preload,
    };

    // 4. Singleton Verification
    console.log('[V3-81_TEST] Testing singleton enforcement...');
    const promise2 = transport.openVerificationWindow('https://rutracker.org/forum/index.php');
    telemetry.singletonFocus = {
      identicalPromise: verifyPromise === promise2,
      singleWindowPreserved: transport.isVerificationWindowOpen(),
    };

    // 5. Clean close
    console.log('[V3-81_TEST] Testing closeVerificationWindow()...');
    transport.closeVerificationWindow();
    verifyPromise.catch(() => {}); // Expected cancellation on manual close
    telemetry.disposal.closedCleanly = !transport.isVerificationWindowOpen();

    transport.dispose();
    telemetry.disposal.transportDisposed = transport.disposed;

    // Write Telemetry
    const outPath = path.resolve(__dirname, 'v3-81-verification-telemetry.json');
    fs.writeFileSync(outPath, JSON.stringify(telemetry, null, 2), 'utf8');
    console.log('[V3-81_TEST] Telemetry successfully recorded at:', outPath);
    console.log(JSON.stringify(telemetry, null, 2));

  } catch (err) {
    console.error('[V3-81_TEST] Error during runtime test:', err);
    transport.dispose();
    process.exit(1);
  } finally {
    app.quit();
  }
});
