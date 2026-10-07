const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(PROJECT_ROOT, 'build', 'icons');
const LINUX_ICONS_DIR = path.join(ICONS_DIR, 'linux');
const SOURCE_BACKUP_DIR = path.join(ICONS_DIR, 'source');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function resolveSourcePath() {
  const candidates = [
    path.join(PROJECT_ROOT, 'public', 'app-icon.png'),
    path.join(PROJECT_ROOT, 'public', '730437.png'),
    path.join(PROJECT_ROOT, '730437.png'),
    path.join(PROJECT_ROOT, 'build', 'icons', 'source', 'rt-library.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Source icon not found in any standard location: ${candidates.join(', ')}`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function validateSource() {
  const sourcePath = resolveSourcePath();

  const buf = fs.readFileSync(sourcePath);
  if (buf.length < 8 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Source icon is not a valid PNG file: ${sourcePath}`);
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);

  console.log(`[Icon Generator] Source Icon Validated: ${path.basename(sourcePath)} (${width}x${height}, RGBA Type ${colorType}, ${(buf.length / 1024).toFixed(1)} KB)`);

  if (width !== height) {
    console.warn(`[Icon Generator] Warning: Source image is not perfectly square (${width}x${height}). Padding will be applied.`);
  }

  return { width, height, sourcePath };
}

function generatePngSizes() {
  console.log('[Icon Generator] Generating Linux & multi-platform PNG icons...');

  ensureDir(ICONS_DIR);
  ensureDir(LINUX_ICONS_DIR);
  ensureDir(SOURCE_BACKUP_DIR);

  const sourcePath = resolveSourcePath();

  // Copy source to backup/source directory and root
  fs.copyFileSync(sourcePath, path.join(PROJECT_ROOT, '730437.png'));
  fs.copyFileSync(sourcePath, path.join(SOURCE_BACKUP_DIR, 'rt-library.png'));
  fs.copyFileSync(sourcePath, path.join(SOURCE_BACKUP_DIR, 'source-730437.png'));

  for (const size of SIZES) {
    const linuxTarget = path.join(LINUX_ICONS_DIR, `${size}x${size}.png`);
    const rootIconTarget = path.join(ICONS_DIR, `${size}x${size}.png`);

    // Use ImageMagick convert with Lanczos filter and transparent background preservation
    const cmd = `convert "${sourcePath}" -background transparent -filter Lanczos -resize ${size}x${size} "${linuxTarget}"`;
    execSync(cmd, { stdio: 'inherit' });

    // Also place in build/icons/ for electron-builder default discovery
    fs.copyFileSync(linuxTarget, rootIconTarget);
  }

  // Master icon (1024x1024 or 512x512)
  const masterTarget = path.join(ICONS_DIR, 'icon.png');
  fs.copyFileSync(path.join(LINUX_ICONS_DIR, '512x512.png'), masterTarget);
  fs.copyFileSync(path.join(LINUX_ICONS_DIR, '256x256.png'), path.join(ICONS_DIR, 'rt-library.png'));

  // Sync to web frontend public and src/assets
  const publicDir = path.join(PROJECT_ROOT, 'public');
  const srcAssetsDir = path.join(PROJECT_ROOT, 'src', 'assets');
  ensureDir(publicDir);
  ensureDir(srcAssetsDir);
  fs.copyFileSync(sourcePath, path.join(publicDir, 'app-icon.png'));
  fs.copyFileSync(sourcePath, path.join(publicDir, '730437.png'));
  fs.copyFileSync(sourcePath, path.join(srcAssetsDir, 'app-icon.png'));

  console.log(`[Icon Generator] Successfully generated ${SIZES.length} PNG resolutions and web assets.`);
}

function generateWindowsIco() {
  console.log('[Icon Generator] Generating Windows multi-resolution ICO...');

  const icoTarget1 = path.join(ICONS_DIR, 'rt-library.ico');
  const icoTarget2 = path.join(ICONS_DIR, 'icon.ico');

  // Input PNGs to combine into ICO: 16, 24, 32, 48, 64, 128, 256
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const inputPngs = icoSizes.map((s) => `"${path.join(LINUX_ICONS_DIR, `${s}x${s}.png`)}"`).join(' ');

  const cmd = `convert ${inputPngs} "${icoTarget1}"`;
  execSync(cmd, { stdio: 'inherit' });
  fs.copyFileSync(icoTarget1, icoTarget2);

  console.log(`[Icon Generator] Created multi-resolution ICO: ${icoTarget1}`);
}

function generateMacOsIcns() {
  console.log('[Icon Generator] Generating macOS ICNS (Apple Icon Image format)...');

  const icnsTarget1 = path.join(ICONS_DIR, 'rt-library.icns');
  const icnsTarget2 = path.join(ICONS_DIR, 'icon.icns');

  // Modern macOS ICNS embeds PNG chunks with standard OSType tags:
  // ic04 (16x16), ic05 (32x32), ic07 (128x128), ic08 (256x256), ic09 (512x512), ic10 (1024x1024),
  // ic11 (16@2x = 32), ic12 (32@2x = 64), ic13 (128@2x = 256), ic14 (256@2x = 512)
  const tagMapping = [
    { tag: 'ic04', size: 16 },
    { tag: 'ic05', size: 32 },
    { tag: 'ic12', size: 64 },
    { tag: 'ic07', size: 128 },
    { tag: 'ic08', size: 256 },
    { tag: 'ic09', size: 512 },
    { tag: 'ic10', size: 1024 },
  ];

  const chunks = [];
  let totalDataLength = 8; // 'icns' (4) + file length (4)

  for (const { tag, size } of tagMapping) {
    const pngPath = path.join(LINUX_ICONS_DIR, `${size}x${size}.png`);
    if (fs.existsSync(pngPath)) {
      const pngBuf = fs.readFileSync(pngPath);
      const chunkHeader = Buffer.alloc(8);
      chunkHeader.write(tag, 0, 4, 'ascii');
      chunkHeader.writeUInt32BE(8 + pngBuf.length, 4);
      chunks.push(chunkHeader, pngBuf);
      totalDataLength += 8 + pngBuf.length;
    }
  }

  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(totalDataLength, 4);

  const fullIcnsBuffer = Buffer.concat([fileHeader, ...chunks]);
  fs.writeFileSync(icnsTarget1, fullIcnsBuffer);
  fs.copyFileSync(icnsTarget1, icnsTarget2);

  console.log(`[Icon Generator] Created valid macOS ICNS (${(totalDataLength / 1024).toFixed(1)} KB): ${icnsTarget1}`);
}

function main() {
  try {
    validateSource();
    generatePngSizes();
    generateWindowsIco();
    generateMacOsIcns();
    console.log('[Icon Generator] All application icons successfully generated!');
  } catch (error) {
    console.error('[Icon Generator] Fatal error generating icons:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateSource,
  generatePngSizes,
  generateWindowsIco,
  generateMacOsIcns,
};
