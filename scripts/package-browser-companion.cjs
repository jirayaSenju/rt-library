#!/usr/bin/env node

/**
 * RT-Library Browser Companion Packaging Script
 * Packages the built unpacked extension (browser-companion/dist) into:
 * rt-library-browser-companion-v<version>.zip
 *
 * Invariants enforced:
 * 1. manifest.json and package.json version consistency
 * 2. Pre-build validation of extension files
 * 3. manifest.json placed directly at archive root (no wrapper directory)
 * 4. Exclusion of source code, test files, git metadata, and markdown docs
 * 5. Post-packaging archive integrity verification
 * 6. SHA-256 checksum generation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const archiver = require('archiver');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const COMPANION_DIR = path.join(PROJECT_ROOT, 'browser-companion');
const DIST_DIR = path.join(COMPANION_DIR, 'dist');
const MANIFEST_PATH = path.join(COMPANION_DIR, 'manifest.json');
const PKG_PATH = path.join(PROJECT_ROOT, 'package.json');

async function packageCompanion(targetOutputDir) {
  console.log('=== PACKAGING BROWSER COMPANION RELEASE ARTIFACT ===\n');

  if (!fs.existsSync(PKG_PATH)) {
    throw new Error('Missing package.json at root');
  }
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('Missing browser-companion/manifest.json');
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const version = (pkg.version || '').trim();
  const manifestVersion = (manifest.version || '').trim();

  console.log(`Desktop version:   ${version}`);
  console.log(`Companion version: ${manifestVersion}`);

  if (version !== manifestVersion) {
    throw new Error(`Version mismatch: package.json (${version}) does not match manifest.json (${manifestVersion})`);
  }

  // 1. Build & Validate. CI release jobs can reuse the exact validated main artifact.
  const skipBuild = process.argv.includes('--skip-build');
  if (skipBuild) {
    console.log('\n>>> Reusing the validated browser-companion/dist artifact...');
  } else {
    console.log('\n>>> Building browser-companion/dist...');
    execSync('npm run companion:build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  console.log('>>> Validating browser-companion/dist...');
  execSync('npm run companion:validate', { cwd: PROJECT_ROOT, stdio: 'inherit' });

  // 2. Prepare Output Directory
  const outDir = targetOutputDir ? path.resolve(targetOutputDir) : path.join(PROJECT_ROOT, 'dist-desktop');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const zipFilename = `rt-library-browser-companion-v${version}.zip`;
  const zipPath = path.join(outDir, zipFilename);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // 3. Create Zip Archive
  console.log(`\n>>> Creating ${zipFilename}...`);
  await new Promise((resolve, reject) => {
    const outputStream = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    outputStream.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(outputStream);
    // Add all files from DIST_DIR directly at the root of the archive (prefix: false)
    archive.directory(DIST_DIR, false);
    archive.finalize();
  });

  const zipStats = fs.statSync(zipPath);
  console.log(`✅ Created archive (${(zipStats.size / 1024).toFixed(1)} KB): ${zipPath}`);

  // 4. Validate Archive Content
  console.log('>>> Validating archive contents...');
  const inspectOutput = execSync(`python3 -c "import zipfile, sys; z = zipfile.ZipFile(sys.argv[1]); [print(n) for n in z.namelist()]" "${zipPath}"`, {
    encoding: 'utf8',
  }).trim().split('\n');

  console.log(`Entries found in archive (${inspectOutput.length} items):`);
  inspectOutput.forEach((entry) => console.log(`  - ${entry}`));

  if (!inspectOutput.includes('manifest.json')) {
    throw new Error('ARCHIVE_VALIDATION_ERROR: manifest.json is missing at the root of the zip archive!');
  }

  // Ensure no forbidden extensions or directories
  for (const entry of inspectOutput) {
    if (entry.startsWith('.git') || entry.includes('node_modules') || entry.endsWith('.ts') || entry.endsWith('.md')) {
      throw new Error(`ARCHIVE_VALIDATION_ERROR: Forbidden entry detected in companion zip: ${entry}`);
    }
  }

  // 5. Compute SHA-256
  const fileBuffer = fs.readFileSync(zipPath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  console.log(`\nSHA-256: ${hash}  ${zipFilename}`);

  console.log('\n✅ BROWSER COMPANION PACKAGE READY FOR RELEASE.\n');
  return {
    filename: zipFilename,
    path: zipPath,
    size: zipStats.size,
    sha256: hash,
  };
}

if (require.main === module) {
  const targetDir = process.argv.slice(2).find((arg) => arg !== '--skip-build') || null;
  packageCompanion(targetDir).catch((err) => {
    console.error(`\n❌ Error packaging Browser Companion: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { packageCompanion };

