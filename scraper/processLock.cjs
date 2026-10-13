const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LEGACY_LOCK_MAX_AGE_MS = 3 * 60 * 1000;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLock(lockFile) {
  try {
    const text = fs.readFileSync(lockFile, 'utf8').trim();
    try {
      const data = JSON.parse(text);
      if (Number.isInteger(data.pid) && typeof data.startedAt === 'string') return data;
    } catch (_) {}
    return { pid: null, startedAt: text };
  } catch (_) {
    return null;
  }
}

function isStaleLock(lockFile, now = Date.now()) {
  const lock = readLock(lockFile);
  if (!lock) return true;
  if (lock.pid) return !processIsAlive(lock.pid);

  const createdAt = Date.parse(lock.startedAt);
  if (!Number.isFinite(createdAt)) {
    try { return now - fs.statSync(lockFile).mtimeMs > LEGACY_LOCK_MAX_AGE_MS; } catch (_) { return true; }
  }
  return now - createdAt > LEGACY_LOCK_MAX_AGE_MS;
}

function removeStaleScraperLock(lockFile) {
  if (!fs.existsSync(lockFile) || !isStaleLock(lockFile)) return false;
  try {
    fs.unlinkSync(lockFile);
    return true;
  } catch (_) {
    return false;
  }
}

function acquireScraperLock(lockFile) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  removeStaleScraperLock(lockFile);

  const lock = { pid: process.pid, startedAt: new Date().toISOString(), token: crypto.randomUUID() };
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx', 0o600);
    fs.writeSync(fd, JSON.stringify(lock));
    fs.fsyncSync(fd);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = readLock(lockFile);
    const startedAt = existing?.startedAt || 'unknown';
    throw new Error(`SCRAPER_LOCKED: Another scraper process is running (started at ${startedAt}).`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  return () => {
    const current = readLock(lockFile);
    if (current?.token !== lock.token) return;
    try { fs.unlinkSync(lockFile); } catch (_) {}
  };
}

module.exports = { acquireScraperLock, isStaleLock, processIsAlive, readLock, removeStaleScraperLock };
