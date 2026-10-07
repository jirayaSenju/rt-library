#!/usr/bin/env node

/**
 * RT-Library Packaged Runtime Verification Script
 * Validates that all critical runtime CJS files, preload scripts, scraper protocol,
 * browser bridges, UI bundles, and native bindings are present inside the packaged app.asar.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DESKTOP = path.join(PROJECT_ROOT, 'dist-desktop');

const MANDATORY_RUNTIME_FILES = [
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/scraper/scraperManager.cjs',
  'electron/scraper/scraperIPC.cjs',
  'electron/scraper/categoryManager.cjs',
  'electron/scraper/defaultCategories.cjs',
  'electron/scraper/executionPlan.cjs',
  'electron/scraper/metadataNormalizer.cjs',
  'electron/scraper/titleExtractor.cjs',
  'scraper/protocol.cjs',
  'scraper/runner.cjs',
  'scraper/browser.cjs',
  'scraper/browserSession.cjs',
  'scraper/scraperBridge.cjs',
  'scraper/executionPlan.cjs',
  'scraper/exportCatalogs.cjs',
  'scripts/console.js',
  'electron/database/dbMain.cjs',
  'electron/database/schema.cjs',
  'electron/database/backupScheduler.cjs',
  'electron/database/migration.cjs',
  'electron/database/repositories/appStateRepo.cjs',
  'electron/database/repositories/categoriesRepo.cjs',
  'electron/database/repositories/detailsRepo.cjs',
  'electron/database/repositories/favoritesRepo.cjs',
  'electron/database/repositories/itemsRepo.cjs',
  'electron/database/repositories/torrentMetadataRepo.cjs',
  'electron/indexer/importer.cjs',
  'electron/indexer/normalize.cjs',
  'electron/indexer/scanner.cjs',
  'electron/indexer/worker.cjs',
  'electron/indexer/workerManager.cjs',
  'electron/indexer/workerProtocol.cjs',
  'electron/torrent/magnetParser.cjs',
  'electron/torrent/metadataManager.cjs',
  'electron/torrent/metadataWorker.cjs',
  'electron/torrent/torrentMetadataService.cjs',
  'electron/torrent/torrentProtocol.cjs',
  'electron/torrent/torrentSourceResolver.cjs',
  'electron/ipc/libraryIPC.cjs',
  'electron/ipc/databaseIPC.cjs',
  'electron/images/imageFetch.cjs',
  'dist/index.html',
  'THIRD_PARTY_LICENSES.txt',
  'LEGAL.md',
  'package.json',
];

function findAsarFile() {
  const candidates = [
    path.join(DIST_DESKTOP, 'linux-unpacked', 'resources', 'app.asar'),
    path.join(DIST_DESKTOP, 'win-unpacked', 'resources', 'app.asar'),
    path.join(DIST_DESKTOP, 'mac', 'RT Library.app', 'Contents', 'Resources', 'app.asar'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Deep search in dist-desktop
  if (fs.existsSync(DIST_DESKTOP)) {
    const findInDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === 'app.asar') {
          return full;
        } else if (entry.isDirectory()) {
          const found = findInDir(full);
          if (found) return found;
        }
      }
      return null;
    };

    const found = findInDir(DIST_DESKTOP);
    if (found) return found;
  }

  return null;
}

function normalizeAsarPath(archivePath) {
  return archivePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function verifyPackageRuntime() {
  const isInspect = process.argv.includes('--inspect');
  const asarPath = findAsarFile();

  if (!asarPath) {
    console.error('[PACKAGE_VERIFIER][ERROR] No packaged app.asar found in dist-desktop/.');
    console.error('Run "npm run desktop:package" or "npm run package:linux" first.');
    process.exit(1);
  }

  console.log(`[PACKAGE_VERIFIER] Inspecting packaged archive: ${asarPath}`);

  let asarListRaw = '';
  try {
    asarListRaw = execSync(`npx asar list "${asarPath}"`, { encoding: 'utf-8' });
  } catch (err) {
    console.error('[PACKAGE_VERIFIER][ERROR] Failed to list asar contents:', err.message);
    process.exit(1);
  }

  const asarFiles = new Set(
    asarListRaw
      .split('\n')
      .map(normalizeAsarPath)
      .filter(Boolean)
  );

  if (isInspect) {
    console.log(`\n=== ALL PACKAGED FILES (${asarFiles.size}) ===`);
    Array.from(asarFiles).sort().forEach((f) => console.log(`  /${f}`));
    console.log('====================================\n');
  }

  const missingFiles = [];
  for (const requiredFile of MANDATORY_RUNTIME_FILES) {
    const normalizedReq = requiredFile.replace(/^\//, '');
    if (!asarFiles.has(normalizedReq)) {
      missingFiles.push(requiredFile);
    }
  }

  const FORBIDDEN_PATTERNS = [
    { name: 'SQLite database files', pattern: /\.(sqlite|db|sqlite3|sqlite-wal|sqlite-shm|db-wal|db-shm)$/i },
    { name: 'Scraped data directories', pattern: /^(data|diagnostics|backups|logs|scratch|\.userData)\//i },
    { name: 'Scraper profiles & sessions', pattern: /(scraper-profile|playwright-profile|browser-profile|cookies\.json|storage[-_]?state\.json|\.session)/i },
    { name: 'Torrent files & magnets', pattern: /\.(torrent|magnet)$/i },
    { name: 'Environment secrets', pattern: /^\.env/i },
    { name: 'Scraped image caches & media dumps', pattern: /(^|\/)(covers|screenshots|image-cache|artwork)\/.+\.(png|jpe?g|webp|gif|avif)$/i },
    { name: 'Scraped catalog JSON dumps', pattern: /(^|\/)(catalog-export|topic-dump|scraped-items|all-topics)\.json$/i },
    { name: 'Database backups', pattern: /(^|\/)(backups\/|.*\.bak$)/i },
  ];

  // Whitelisted test/sample assets inside build or public
  const ALLOWED_ASSET_EXCEPTIONS = [
    'build/icons',
    'public/favicon',
    'public/icon',
    'src/assets',
  ];

  const forbiddenFiles = [];
  for (const file of asarFiles) {
    const isAllowedException = ALLOWED_ASSET_EXCEPTIONS.some((exc) => file.includes(exc));
    if (isAllowedException) continue;

    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(file)) {
        forbiddenFiles.push({ file, rule: rule.name });
      }
    }
  }

  // Check better-sqlite3 native unpack
  const resourcesDir = path.dirname(asarPath);
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
  const nativeBindingExists =
    fs.existsSync(path.join(unpackedDir, 'node_modules', 'better-sqlite3')) ||
    fs.existsSync(path.join(resourcesDir, 'node_modules', 'better-sqlite3'));

  console.log('\n--- PACKAGING RUNTIME INTEGRITY & PRIVACY AUDIT ---');
  console.log(`Total archive files:        ${asarFiles.size}`);
  console.log(`Required runtime checklist: ${MANDATORY_RUNTIME_FILES.length} verified`);
  console.log(`Forbidden files detected:   ${forbiddenFiles.length}`);
  console.log(`Native better-sqlite3:      ${nativeBindingExists ? 'UNPACKED OK' : 'MISSING (Check asarUnpack)'}`);

  if (forbiddenFiles.length > 0) {
    console.error(`\n[PACKAGE_VERIFIER][FAILED] Found ${forbiddenFiles.length} forbidden private/generated files inside app.asar:`);
    for (const item of forbiddenFiles) {
      console.error(`  ❌ FORBIDDEN (${item.rule}): ${item.file}`);
    }
    process.exit(1);
  }

  if (missingFiles.length > 0) {
    console.error(`\n[PACKAGE_VERIFIER][FAILED] Found ${missingFiles.length} missing runtime files inside app.asar:`);
    for (const f of missingFiles) {
      console.error(`  ❌ MISSING: ${f}`);
    }
    process.exit(1);
  }

  if (!nativeBindingExists) {
    console.error(`\n[PACKAGE_VERIFIER][FAILED] Native module better-sqlite3 was not found in app.asar.unpacked.`);
    process.exit(1);
  }

  console.log('\n[PACKAGE_VERIFIER][SUCCESS] All mandatory runtime modules are present, and NO private/scraped/database files were packaged!\n');
  process.exit(0);
}

if (require.main === module) {
  verifyPackageRuntime();
}

module.exports = {
  MANDATORY_RUNTIME_FILES,
  findAsarFile,
  normalizeAsarPath,
};
