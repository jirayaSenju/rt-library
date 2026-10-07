import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('V3-21 Cross-Platform Packaging & Runtime Integrity', () => {
  const rootDir = path.resolve(__dirname, '../..');

  it('configures electron-builder files to include scraper, console script, icons, and electron runtime', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.build).toBeDefined();
    expect(pkg.build.files).toBeDefined();

    const files = pkg.build.files;
    expect(files).toContain('dist/**/*');
    expect(files).toContain('electron/**/*');
    expect(files).toContain('scraper/**/*');
    expect(files).toContain('scripts/console.js');
    expect(files).toContain('build/icons/**/*');
  });

  it('unpacks better-sqlite3 native module in asarUnpack', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.build.asarUnpack).toBeDefined();
    expect(pkg.build.asarUnpack).toContain('**/node_modules/better-sqlite3/**/*');
  });

  it('verifies all relative requires in electron and scraper directories resolve to existing files', () => {
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (!fs.statSync(full).isFile() || !entry.endsWith('.cjs')) continue;

        const content = fs.readFileSync(full, 'utf-8');
        const regex = /require\(['"](\.[^'"]+)['"]\)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const targetRel = match[1];
          const targetAbs = path.resolve(path.dirname(full), targetRel);
          const exists =
            fs.existsSync(targetAbs) ||
            fs.existsSync(targetAbs + '.cjs') ||
            fs.existsSync(targetAbs + '.js') ||
            fs.existsSync(path.join(targetAbs, 'index.js'));

          expect(
            exists,
            `Broken require in ${path.relative(rootDir, full)}: require('${targetRel}') -> ${path.relative(rootDir, targetAbs)} does not exist`
          ).toBe(true);
        }
      }
    };

    checkDir(path.join(rootDir, 'electron'));
    checkDir(path.join(rootDir, 'scraper'));
  });

  it('verifies scraper/protocol.cjs exists and exports SCRAPER_IPC_MESSAGES and SCRAPER_STATES', () => {
    const protocolPath = path.join(rootDir, 'scraper', 'protocol.cjs');
    expect(fs.existsSync(protocolPath)).toBe(true);

    const content = fs.readFileSync(protocolPath, 'utf-8');
    expect(content).toContain('SCRAPER_IPC_MESSAGES');
    expect(content).toContain('SCRAPER_STATES');
  });

  it('verifies scraper/browser.cjs and scraper/scraperBridge.cjs exist', () => {
    expect(fs.existsSync(path.join(rootDir, 'scraper', 'browser.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'scraper', 'scraperBridge.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'scraper', 'browserSession.cjs'))).toBe(true);
  });

  it('verifies scripts/verify-package-runtime.cjs defines all mandatory runtime targets', () => {
    const verifierPath = path.join(rootDir, 'scripts', 'verify-package-runtime.cjs');
    expect(fs.existsSync(verifierPath)).toBe(true);

    const verifierContent = fs.readFileSync(verifierPath, 'utf-8');
    expect(verifierContent).toContain('scraper/protocol.cjs');
    expect(verifierContent).toContain('electron/main.cjs');
    expect(verifierContent).toContain('electron/preload.cjs');
    expect(verifierContent).toContain('scripts/console.js');
    expect(verifierContent).toContain('better-sqlite3');
  });
});

