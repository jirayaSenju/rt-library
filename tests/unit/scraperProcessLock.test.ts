import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { acquireScraperLock, isStaleLock, removeStaleScraperLock } = require('../../scraper/processLock.cjs');

describe('scraper process lock', () => {
  let tempDirectory: string | null = null;

  afterEach(() => {
    if (tempDirectory) fs.rmSync(tempDirectory, { recursive: true, force: true });
    tempDirectory = null;
  });

  function createLockPath() {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-scraper-lock-'));
    return path.join(tempDirectory, 'scraper.lock');
  }

  it('records the owning PID and refuses a second live owner', () => {
    const lockFile = createLockPath();
    const release = acquireScraperLock(lockFile);
    try {
      expect(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid).toBe(process.pid);
      expect(() => acquireScraperLock(lockFile)).toThrow(/SCRAPER_LOCKED/);
    } finally {
      release();
    }
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it('removes a lock immediately when its owning process has exited', () => {
    const lockFile = createLockPath();
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 2 ** 30, startedAt: new Date().toISOString(), token: 'dead' }));
    expect(isStaleLock(lockFile)).toBe(true);
    expect(removeStaleScraperLock(lockFile)).toBe(true);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  it('keeps recent legacy timestamp locks during the compatibility window', () => {
    const lockFile = createLockPath();
    const now = Date.now();
    fs.writeFileSync(lockFile, new Date(now).toISOString());
    expect(isStaleLock(lockFile, now + 60_000)).toBe(false);
    expect(isStaleLock(lockFile, now + 4 * 60_000)).toBe(true);
  });
});
