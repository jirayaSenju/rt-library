#!/usr/bin/env node

/**
 * Generates latest.yml for Windows Portable distribution.
 * 
 * Since electron-builder only auto-generates latest.yml for installer targets (NSIS),
 * this script generates compliant electron-updater metadata for standalone portable executables.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function generatePortableMetadata(dirPath = 'dist-desktop', targetVersion) {
  const root = path.resolve(PROJECT_ROOT, dirPath);
  if (!fs.existsSync(root)) {
    console.error(`[PORTABLE_METADATA] Target directory does not exist: ${root}`);
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const version = targetVersion || pkg.version;

  const files = fs.readdirSync(root);
  const portableExe = files.find(f => f.endsWith('.exe') && f.includes('portable'));

  if (!portableExe) {
    console.warn(`[PORTABLE_METADATA] No portable .exe found in ${root}. Skipping latest.yml generation.`);
    return false;
  }

  const exePath = path.join(root, portableExe);
  const fileBuffer = fs.readFileSync(exePath);
  const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
  const size = fileBuffer.length;
  const releaseDate = new Date().toISOString();

  const metadata = {
    version,
    files: [
      {
        url: portableExe,
        sha512,
        size,
      },
    ],
    path: portableExe,
    sha512,
    releaseDate,
  };

  const yamlContent = yaml.dump(metadata, { lineWidth: -1 });
  const outPath = path.join(root, 'latest.yml');
  fs.writeFileSync(outPath, yamlContent, 'utf8');

  console.log(`✅ [PORTABLE_METADATA] Generated ${outPath} for ${portableExe} (version ${version}, sha512: ${sha512.slice(0, 16)}...)`);
  return true;
}

if (require.main === module) {
  const dir = process.argv[2] || 'dist-desktop';
  const ver = process.argv[3];
  generatePortableMetadata(dir, ver);
}

module.exports = {
  generatePortableMetadata,
};
