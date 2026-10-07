#!/usr/bin/env node

/**
 * RT-Library Packaged Binary Smoke Test
 * Spawns the packaged executable from dist-desktop/linux-unpacked/
 * and verifies that Main process, SQLite, IPC, and Scraper modules boot without MODULE_NOT_FOUND.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DESKTOP = path.join(PROJECT_ROOT, 'dist-desktop');

function findPackagedExecutable() {
  const candidates = [
    path.join(DIST_DESKTOP, 'linux-unpacked', 'rt-library'),
    path.join(DIST_DESKTOP, 'win-unpacked', 'RT Library.exe'),
    path.join(DIST_DESKTOP, 'mac', 'RT Library.app', 'Contents', 'MacOS', 'RT Library'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function runPackageSmoke() {
  const executablePath = findPackagedExecutable();

  if (!executablePath) {
    console.error('[PACKAGE_SMOKE][ERROR] Packaged executable not found in dist-desktop/.');
    console.error('Run "npm run desktop:package" first.');
    process.exit(1);
  }

  console.log(`[PACKAGE_SMOKE] Testing packaged executable: ${executablePath}`);

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-library-pkg-smoke-'));

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    RT_LIBRARY_USER_DATA_DIR: tempUserDataDir,
    ELECTRON_ENABLE_LOGGING: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let stdoutLogs = '';
  let stderrLogs = '';
  let fatalError = null;

  const child = spawn(executablePath, ['--no-sandbox', '--disable-gpu'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdoutLogs += text;
    process.stdout.write(`[APP_STDOUT] ${text}`);
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    stderrLogs += text;
    // Disregard non-blocking GTK appmenu warnings
    if (text.includes('Failed to load module "appmenu-gtk-module"')) {
      console.log('[PACKAGE_SMOKE][INFO] Ignored non-blocking GTK warning: appmenu-gtk-module');
      return;
    }
    if (text.includes('Cannot find module') || text.includes('MODULE_NOT_FOUND')) {
      fatalError = text;
    }
    process.stderr.write(`[APP_STDERR] ${text}`);
  });

  // Give the packaged binary 4 seconds to bootstrap Main process and SQLite
  await new Promise((resolve) => setTimeout(resolve, 4000));

  try {
    child.kill('SIGTERM');
  } catch (_) {}

  // Cleanup temp userData
  try {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n--- SMOKE TEST RESULT ---');
  if (fatalError) {
    console.error(`\n[PACKAGE_SMOKE][FAILED] Fatal runtime exception detected:`);
    console.error(fatalError);
    process.exit(1);
  }

  if (stderrLogs.includes('Cannot find module') || stderrLogs.includes('MODULE_NOT_FOUND')) {
    console.error(`\n[PACKAGE_SMOKE][FAILED] MODULE_NOT_FOUND error encountered.`);
    process.exit(1);
  }

  console.log('[PACKAGE_SMOKE][SUCCESS] Packaged executable bootstrapped successfully with zero missing modules!\n');
  process.exit(0);
}

runPackageSmoke();
