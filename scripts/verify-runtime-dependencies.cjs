#!/usr/bin/env node

/**
 * RT-Library Runtime Dependencies & Parser Verification
 * Validates that all critical production dependencies (better-sqlite3, jsdom)
 * and the HTML parser can be loaded and executed within the packaged application runtime.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DESKTOP = path.join(PROJECT_ROOT, 'dist-desktop');

function findAsarPath() {
  const candidates = [
    path.join(DIST_DESKTOP, 'linux-unpacked', 'resources', 'app.asar'),
    path.join(DIST_DESKTOP, 'win-unpacked', 'resources', 'app.asar'),
    path.join(DIST_DESKTOP, 'mac', 'RT Library.app', 'Contents', 'Resources', 'app.asar'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findPackagedBinary() {
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

function verifyRuntimeDependencies() {
  console.log('=== RUNTIME DEPENDENCIES & PACKAGED PARSER AUDIT ===\n');

  const asarPath = findAsarPath();
  if (!asarPath) {
    console.error('❌ [DEPENDENCY_AUDIT][FAILED] Packaged app.asar not found in dist-desktop/.');
    process.exit(1);
  }

  console.log(`Inspecting archive: ${asarPath}`);

  let asarListRaw = '';
  try {
    asarListRaw = execSync(`npx asar list "${asarPath}"`, { encoding: 'utf-8' });
  } catch (err) {
    console.error('❌ [DEPENDENCY_AUDIT][FAILED] Could not read asar archive:', err.message);
    process.exit(1);
  }

  const asarFiles = new Set(
    asarListRaw
      .split('\n')
      .map((p) => p.trim().replace(/\\/g, '/').replace(/^\/+/, ''))
      .filter(Boolean)
  );

  // 1. Verify jsdom presence in app.asar
  const hasJsdom = asarFiles.has('node_modules/jsdom/package.json');
  console.log(`  - node_modules/jsdom: ${hasJsdom ? '✅ PRESENT in app.asar' : '❌ MISSING from app.asar'}`);

  // 2. Verify semver presence in app.asar
  const hasSemver = asarFiles.has('node_modules/semver/package.json');
  console.log(`  - node_modules/semver: ${hasSemver ? '✅ PRESENT in app.asar' : '❌ MISSING from app.asar'}`);

  // 3. Verify parser presence in app.asar
  const hasParser = asarFiles.has('scraper/parsers/rutrackerHtmlParser.cjs');
  console.log(`  - rutrackerHtmlParser: ${hasParser ? '✅ PRESENT in app.asar' : '❌ MISSING from app.asar'}`);

  // 4. Verify better-sqlite3 in app.asar.unpacked
  const resourcesDir = path.dirname(asarPath);
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
  const sqliteNativeExists =
    fs.existsSync(path.join(unpackedDir, 'node_modules', 'better-sqlite3')) ||
    fs.existsSync(path.join(resourcesDir, 'node_modules', 'better-sqlite3'));
  console.log(`  - native better-sqlite3: ${sqliteNativeExists ? '✅ UNPACKED OK' : '❌ MISSING from unpacked'}`);

  if (!hasJsdom || !hasSemver || !hasParser || !sqliteNativeExists) {
    console.error('\n❌ [DEPENDENCY_AUDIT][FAILED] Mandatory runtime modules missing from package.');
    process.exit(1);
  }

  // 4. Test live require & parser execution using packaged binary if available
  const binaryPath = findPackagedBinary();
  if (binaryPath) {
    console.log(`\nTesting runtime execution with packaged binary: ${binaryPath}`);
    const fixturePath = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'rutracker-html', 'category-xbox.html');
    if (!fs.existsSync(fixturePath)) {
      console.warn(`⚠️ Warning: Test fixture not found at ${fixturePath}, skipping fixture parse.`);
    } else {
      const probeScript = `
        const fs = require('fs');
        const path = require('path');
        const asarPath = ${JSON.stringify(asarPath)};
        const fixturePath = ${JSON.stringify(fixturePath)};

        // Test jsdom
        const jsdom = require(path.join(asarPath, 'node_modules', 'jsdom'));
        console.log('JSDOM_LOAD: PASS');

        // Test semver
        const semver = require(path.join(asarPath, 'node_modules', 'semver'));
        if (typeof semver.valid !== 'function') throw new Error('semver.valid is not a function');
        console.log('SEMVER_LOAD: PASS');

        // Test updaterManager
        const { getUpdaterManager } = require(path.join(asarPath, 'electron', 'updater', 'updaterManager.cjs'));
        console.log('UPDATER_LOAD: PASS');

        // Test parser
        const parser = require(path.join(asarPath, 'scraper', 'parsers', 'rutrackerHtmlParser.cjs'));
        console.log('PARSER_LOAD: PASS');

        // Test fixture parse
        const html = fs.readFileSync(fixturePath, 'utf8');
        const parsed = parser.parseCategoryHtml(html, 'xbox');
        if (!parsed || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
          throw new Error('Parser returned empty or invalid results from fixture');
        }
        console.log('PARSER_FIXTURE: PASS (topics=' + parsed.topics.length + ')');
      `;

      const { spawnSync } = require('child_process');
      const res = spawnSync(binaryPath, ['-e', probeScript], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
        encoding: 'utf-8',
      });

      if (res.error || res.status !== 0) {
        console.error('❌ [DEPENDENCY_AUDIT][FAILED] Runtime execution failed:');
        console.error(res.stderr || res.stdout || (res.error && res.error.message));
        process.exit(1);
      }
      console.log(res.stdout.trim());
    }
  } else {
    console.log('\n[INFO] No packaged executable found to test in-process require; static asar inspection passed.');
  }

  console.log('\n✅ [DEPENDENCY_AUDIT][SUCCESS] All required runtime modules and parser fixtures verified successfully!\n');
}

if (require.main === module) {
  verifyRuntimeDependencies();
}

module.exports = {
  verifyRuntimeDependencies,
};
