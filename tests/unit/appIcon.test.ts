import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('V3-20 App Icon and Desktop Launcher Integration', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const sourceCandidates = [
    path.join(rootDir, '730437.png'),
    path.join(rootDir, 'public', '730437.png'),
    path.join(rootDir, 'public', 'app-icon.png'),
  ];
  const sourceIcon = sourceCandidates.find(p => fs.existsSync(p)) || sourceCandidates[0];
  const buildIconsDir = path.join(rootDir, 'build', 'icons');
  const linuxIconsDir = path.join(buildIconsDir, 'linux');

  it('preserves the original source icon at project asset locations', () => {
    expect(fs.existsSync(sourceIcon)).toBe(true);
    const stats = fs.statSync(sourceIcon);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it('generates all standard square resolution PNGs for Linux and Electron window icon', () => {
    const expectedSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

    for (const size of expectedSizes) {
      const rootSizeIcon = path.join(buildIconsDir, `${size}x${size}.png`);
      const linuxSizeIcon = path.join(linuxIconsDir, `${size}x${size}.png`);

      expect(fs.existsSync(rootSizeIcon), `Missing ${size}x${size}.png in build/icons`).toBe(true);
      expect(fs.existsSync(linuxSizeIcon), `Missing ${size}x${size}.png in build/icons/linux`).toBe(true);

      const rootStats = fs.statSync(rootSizeIcon);
      expect(rootStats.size).toBeGreaterThan(50);
    }

    expect(fs.existsSync(path.join(buildIconsDir, 'icon.png'))).toBe(true);
    expect(fs.existsSync(path.join(buildIconsDir, 'rt-library.png'))).toBe(true);
  });

  it('generates a valid multi-resolution Windows ICO file', () => {
    const icoPath = path.join(buildIconsDir, 'rt-library.ico');
    expect(fs.existsSync(icoPath)).toBe(true);

    const buffer = fs.readFileSync(icoPath);
    expect(buffer.length).toBeGreaterThan(10000);

    // ICO magic header: 0x00 0x00, type 1 (0x01 0x00)
    expect(buffer.readUInt16LE(0)).toBe(0);
    expect(buffer.readUInt16LE(2)).toBe(1);

    // Number of embedded images (should be >= 4)
    const imageCount = buffer.readUInt16LE(4);
    expect(imageCount).toBeGreaterThanOrEqual(4);
  });

  it('generates a valid macOS ICNS file', () => {
    const icnsPath = path.join(buildIconsDir, 'rt-library.icns');
    expect(fs.existsSync(icnsPath)).toBe(true);

    const buffer = fs.readFileSync(icnsPath);
    expect(buffer.length).toBeGreaterThan(1000);

    // ICNS magic header: 'icns' in ASCII (0x69636e73)
    const magic = buffer.toString('utf-8', 0, 4);
    expect(magic).toBe('icns');
  });

  it('configures electron-builder with cross-platform icon assets and desktop entry', () => {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    expect(pkg.build).toBeDefined();
    expect(pkg.build.appId).toBe('com.rtlibrary.app');
    expect(pkg.build.linux.icon).toBe('build/icons');
    expect(pkg.build.win.icon).toBe('build/icons/rt-library.ico');
    expect(pkg.build.mac.icon).toBe('build/icons/rt-library.icns');
    expect(pkg.build.linux.desktop.Icon).toBe('rt-library');
    expect(pkg.build.linux.desktop.Categories).toContain('Game');
    expect(pkg.scripts['generate:icons']).toBe('node scripts/generate-app-icons.cjs');
  });

  it('verifies electron/main.cjs sets appUserModelId and uses getAppIconPath', () => {
    const mainPath = path.join(rootDir, 'electron', 'main.cjs');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');

    expect(mainContent).toContain('setAppUserModelId');
    expect(mainContent).toContain('com.rtlibrary.app');
    expect(mainContent).toContain('getAppIconPath');
    expect(mainContent).toContain('icon: appIcon');
  });
});

