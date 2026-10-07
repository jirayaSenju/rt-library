const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dbMain = require('./dbMain.cjs');
const appStateRepo = require('./repositories/appStateRepo.cjs');
const { SCHEMA_VERSION } = require('./schema.cjs');

const APP_STATE_SCHEDULE_KEY = 'database_backup_schedule';
const APP_STATE_OPERATIONS_KEY = 'database_operations_log';

let schedulerTimer = null;
let isBackupRunning = false;
let initialized = false;
let cachedUserDataDir = null;

const SCHEDULE_PRESETS = {
  '6h': { label: 'Every 6 hours', intervalHours: 6 },
  '12h': { label: 'Every 12 hours', intervalHours: 12 },
  'daily': { label: 'Daily (03:00)', hour: 3, minute: 0 },
  'weekly': { label: 'Weekly (Sun 03:00)', dayOfWeek: 0, hour: 3, minute: 0 },
  'monthly': { label: 'Monthly (1st 03:00)', dayOfMonth: 1, hour: 3, minute: 0 },
};

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

function getDefaultBackupDir(userDataDir) {
  const dir = userDataDir || cachedUserDataDir || (dbMain.getDatabasePath() ? path.dirname(dbMain.getDatabasePath()) : process.cwd());
  return path.join(dir, 'backups');
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseCronPart(part, min, max) {
  if (part === '*') return null;
  const values = new Set();
  const items = part.split(',');
  for (const item of items) {
    if (item.includes('/')) {
      const [range, stepStr] = item.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid cron step: ${stepStr}`);
      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          const [rStart, rEnd] = range.split('-').map(Number);
          if (!isNaN(rStart) && !isNaN(rEnd)) { start = rStart; end = rEnd; }
        } else {
          start = parseInt(range, 10);
        }
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (item.includes('-')) {
      const [start, end] = item.split('-').map(Number);
      if (isNaN(start) || isNaN(end) || start > end || start < min || end > max) {
        throw new Error(`Invalid cron range: ${item}`);
      }
      for (let i = start; i <= end; i++) values.add(i);
    } else {
      const num = parseInt(item, 10);
      if (isNaN(num) || num < min || num > max) throw new Error(`Invalid cron number: ${item}`);
      values.add(num);
    }
  }
  return values;
}

function validateCronExpression(expression) {
  if (typeof expression !== 'string') throw new Error('Cron expression must be a string');
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('Cron expression must have exactly 5 parts: minute hour day-of-month month day-of-week');
  }
  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;
  parseCronPart(minPart, 0, 59);
  parseCronPart(hourPart, 0, 23);
  parseCronPart(domPart, 1, 31);
  parseCronPart(monthPart, 1, 12);
  parseCronPart(dowPart, 0, 6);
  return true;
}

function calculateNextCronRun(expression, fromDate = new Date()) {
  validateCronExpression(expression);
  const parts = expression.trim().split(/\s+/);
  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;
  const minutes = parseCronPart(minPart, 0, 59);
  const hours = parseCronPart(hourPart, 0, 23);
  const doms = parseCronPart(domPart, 1, 31);
  const months = parseCronPart(monthPart, 1, 12);
  const dows = parseCronPart(dowPart, 0, 6);

  const current = new Date(fromDate.getTime());
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  // Search forward up to 5 years (minute by minute / step checks)
  const maxIterations = 5 * 366 * 24 * 60;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    const month = current.getMonth() + 1;
    if (months && !months.has(month)) {
      current.setMonth(current.getMonth() + 1, 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    const dom = current.getDate();
    const dow = current.getDay();
    const domMatch = doms ? doms.has(dom) : true;
    const dowMatch = dows ? dows.has(dow) : true;

    if (doms && dows) {
      if (!domMatch && !dowMatch) {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
        continue;
      }
    } else if (doms && !domMatch) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    } else if (dows && !dowMatch) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    const hour = current.getHours();
    if (hours && !hours.has(hour)) {
      current.setHours(current.getHours() + 1, 0, 0, 0);
      continue;
    }

    const minute = current.getMinutes();
    if (minutes && !minutes.has(minute)) {
      current.setMinutes(current.getMinutes() + 1);
      continue;
    }

    return current;
  }

  throw new Error('Unable to find next scheduled run date');
}

function calculateNextRun(config, fromDate = new Date()) {
  const { scheduleType = 'daily', cronExpression = '0 3 * * *' } = config || {};
  const base = new Date(fromDate.getTime());

  if (scheduleType === 'custom') {
    return calculateNextCronRun(cronExpression, base);
  }

  if (scheduleType === '6h' || scheduleType === '12h') {
    const hours = scheduleType === '6h' ? 6 : 12;
    const next = new Date(base.getTime());
    next.setSeconds(0, 0);
    const currentHour = next.getHours();
    const nextHourSlot = Math.floor(currentHour / hours) * hours + hours;
    next.setHours(nextHourSlot, 0, 0, 0);
    if (next <= base) next.setHours(next.getHours() + hours);
    return next;
  }

  if (scheduleType === 'daily') {
    const next = new Date(base.getTime());
    next.setHours(3, 0, 0, 0);
    if (next <= base) next.setDate(next.getDate() + 1);
    return next;
  }

  if (scheduleType === 'weekly') {
    const next = new Date(base.getTime());
    next.setHours(3, 0, 0, 0);
    const day = next.getDay();
    const diff = (7 - day) % 7;
    next.setDate(next.getDate() + diff);
    if (next <= base) next.setDate(next.getDate() + 7);
    return next;
  }

  if (scheduleType === 'monthly') {
    const next = new Date(base.getFullYear(), base.getMonth(), 1, 3, 0, 0, 0);
    if (next <= base) next.setMonth(next.getMonth() + 1, 1);
    return next;
  }

  return calculateNextCronRun('0 3 * * *', base);
}

function getDefaultConfig() {
  return {
    enabled: false,
    scheduleType: 'daily',
    cronExpression: '0 3 * * *',
    retentionCount: 7,
    destinationDir: null,
    runMissedOnLaunch: true,
    lastRun: null,
    lastStatus: null,
    lastError: null,
    nextRun: null,
  };
}

function loadScheduleConfig() {
  const db = dbMain.getDatabase();
  if (!db || db.open !== true) return getDefaultConfig();
  try {
    const raw = appStateRepo.getAppState(db, APP_STATE_SCHEDULE_KEY);
    if (!raw) return getDefaultConfig();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...getDefaultConfig(), ...parsed };
  } catch (err) {
    console.error('[BACKUP][SCHEDULER] Failed to load config from app_state:', err.message);
    return getDefaultConfig();
  }
}

function saveScheduleConfig(config) {
  const db = dbMain.getDatabase();
  if (!db || db.open !== true) return false;
  try {
    appStateRepo.setAppState(db, APP_STATE_SCHEDULE_KEY, config);
    return true;
  } catch (err) {
    console.error('[BACKUP][SCHEDULER] Failed to save config to app_state:', err.message);
    return false;
  }
}

function logOperation(type, details = {}) {
  const db = dbMain.getDatabase();
  if (!db || db.open !== true) return;
  try {
    const raw = appStateRepo.getAppState(db, APP_STATE_OPERATIONS_KEY);
    let logs = [];
    if (raw) {
      try { logs = JSON.parse(raw); } catch (_) {}
    }
    const entry = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      ...details,
    };
    logs.unshift(entry);
    if (logs.length > 20) logs = logs.slice(0, 20);
    appStateRepo.setAppState(db, APP_STATE_OPERATIONS_KEY, JSON.stringify(logs));
  } catch (_) {}
}

function getRecentOperations() {
  const db = dbMain.getDatabase();
  if (!db || db.open !== true) return [];
  try {
    const raw = appStateRepo.getAppState(db, APP_STATE_OPERATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

function isDatabaseBusy() {
  try {
    const scraper = require('../scraper/scraperManager.cjs').getInstance();
    if (scraper.getState().isRunning) return true;
  } catch (_) {}
  try {
    const indexing = require('../indexer/workerManager.cjs').getIndexingState();
    if (indexing.isIndexing) return true;
  } catch (_) {}
  try {
    const metadata = require('../torrent/metadataManager.cjs').getStatus();
    if (metadata.activeTasks > 0 || metadata.queueSize > 0) return true;
  } catch (_) {}
  return false;
}

async function executeBackup({ isManual = false, targetPath = null } = {}) {
  if (isBackupRunning) {
    throw new Error('A database backup is already in progress');
  }

  const db = dbMain.getDatabase();
  if (!db || db.open !== true) throw new Error('Database is unavailable for backup');

  isBackupRunning = true;
  const config = loadScheduleConfig();
  const backupDir = targetPath ? path.dirname(targetPath) : (config.destinationDir || getDefaultBackupDir());
  ensureDirectory(backupDir);

  const timestampStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '');
  const finalPath = targetPath || path.join(backupDir, `rt-library-backup-${timestampStr}.sqlite`);
  const temporaryPath = `${finalPath}.partial-${process.pid}-${Date.now()}`;

  const t0 = performance.now();
  try {
    await db.backup(temporaryPath);

    // Verify backup integrity immediately
    const checkDb = new Database(temporaryPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = checkDb.pragma('quick_check').map((r) => Object.values(r)[0]);
      if (integrity.length !== 1 || integrity[0] !== 'ok') {
        throw new Error('Backup quick_check verification failed');
      }
    } finally {
      checkDb.close();
    }

    fs.renameSync(temporaryPath, finalPath);
    const stat = fs.statSync(finalPath);
    const durationMs = Math.round(performance.now() - t0);

    // Apply retention policy for scheduled backups
    if (!isManual) {
      applyRetention(backupDir, config.retentionCount || 7);
    }

    config.lastRun = new Date().toISOString();
    config.lastStatus = 'SUCCESS';
    config.lastError = null;
    config.nextRun = calculateNextRun(config, new Date()).toISOString();
    saveScheduleConfig(config);

    logOperation('backup', {
      status: 'success',
      manual: isManual,
      filePath: finalPath,
      fileName: path.basename(finalPath),
      size: stat.size,
      durationMs,
    });

    return {
      success: true,
      filePath: finalPath,
      fileName: path.basename(finalPath),
      size: stat.size,
      durationMs,
    };
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    if (!isManual) {
      config.lastStatus = 'FAILED';
      config.lastError = error.message;
      saveScheduleConfig(config);
    }
    logOperation('backup', {
      status: 'failed',
      manual: isManual,
      error: error.message,
    });
    throw error;
  } finally {
    isBackupRunning = false;
  }
}

function applyRetention(backupDir, keepCount = 7) {
  if (!fs.existsSync(backupDir) || keepCount <= 0) return;
  try {
    const files = fs.readdirSync(backupDir);
    // Only target scheduled auto-generated backups with rt-library-backup- pattern
    const scheduledBackups = files
      .filter((f) => f.startsWith('rt-library-backup-') && (f.endsWith('.sqlite') || f.endsWith('.db')))
      .map((f) => {
        const fullPath = path.join(backupDir, f);
        try {
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, mtime: stat.mtimeMs };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    if (scheduledBackups.length > keepCount) {
      const toDelete = scheduledBackups.slice(keepCount);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.path);
          console.log(`[BACKUP][RETENTION] Removed older scheduled backup: ${item.name}`);
        } catch (err) {
          console.error(`[BACKUP][RETENTION] Failed to delete ${item.name}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[BACKUP][RETENTION] Retention check error:', err.message);
  }
}

function listBackups(customDir = null) {
  const config = loadScheduleConfig();
  const dir = customDir || config.destinationDir || getDefaultBackupDir();
  if (!fs.existsSync(dir)) return [];

  try {
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => f.endsWith('.sqlite') || f.endsWith('.db'))
      .map((f) => {
        const fullPath = path.join(dir, f);
        try {
          const stat = fs.statSync(fullPath);
          const isScheduled = f.startsWith('rt-library-backup-');
          const isPreRestore = f.startsWith('rt-library-before-restore-');
          return {
            fileName: f,
            filePath: fullPath,
            size: stat.size,
            createdAt: stat.birthtime || stat.mtime,
            type: isScheduled ? 'scheduled' : isPreRestore ? 'pre-restore' : 'manual',
          };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (_) {
    return [];
  }
}

function verifyBackupFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Backup file does not exist');
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const quickResults = db.pragma('quick_check').map((row) => Object.values(row)[0]);
    const integrityResults = db.pragma('integrity_check').map((row) => Object.values(row)[0]);
    const foreignKeys = db.pragma('foreign_key_check');
    const version = db.pragma('user_version', { simple: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
    let itemCount = 0;
    if (tables.includes('items')) {
      itemCount = db.prepare('SELECT COUNT(*) AS count FROM items').get().count;
    }
    const isValid = integrityResults.length === 1 && integrityResults[0] === 'ok' && foreignKeys.length === 0;
    return {
      valid: isValid,
      quickCheck: quickResults,
      integrityCheck: integrityResults,
      foreignKeyErrors: foreignKeys.length,
      schemaVersion: version,
      itemCount,
      tableCount: tables.length,
    };
  } finally {
    db.close();
  }
}

function armScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const config = loadScheduleConfig();
  if (!config.enabled) return;

  let nextRunDate = config.nextRun ? new Date(config.nextRun) : null;
  const now = new Date();

  if (!nextRunDate || isNaN(nextRunDate.getTime()) || nextRunDate <= now) {
    nextRunDate = calculateNextRun(config, now);
    config.nextRun = nextRunDate.toISOString();
    saveScheduleConfig(config);
  }

  const delayMs = Math.max(1000, nextRunDate.getTime() - Date.now());
  // Prevent overflow of setTimeout (max 24.8 days ~ 2147483647 ms)
  const safeDelay = Math.min(delayMs, 24 * 60 * 60 * 1000);

  schedulerTimer = setTimeout(async () => {
    if (Date.now() >= nextRunDate.getTime() - 2000) {
      if (isDatabaseBusy()) {
        console.log('[BACKUP][SCHEDULER] Database is currently busy. Deferring scheduled backup by 5 minutes.');
        logOperation('backup', { status: 'deferred', reason: 'database_busy' });
        // Defer 5 minutes
        schedulerTimer = setTimeout(() => armScheduler(), 5 * 60 * 1000);
        return;
      }
      try {
        console.log('[BACKUP][SCHEDULER] Triggering scheduled database backup...');
        await executeBackup({ isManual: false });
      } catch (err) {
        console.error('[BACKUP][SCHEDULER] Scheduled backup failed:', err.message);
      }
    }
    armScheduler();
  }, safeDelay);
}

function initScheduler(userDataDir) {
  if (initialized) return;
  initialized = true;
  cachedUserDataDir = userDataDir;

  const config = loadScheduleConfig();
  if (config.enabled && config.runMissedOnLaunch && config.nextRun) {
    const nextRunDate = new Date(config.nextRun);
    const now = new Date();
    // If nextRun was in the past and lastRun was before nextRun
    if (nextRunDate < now && (!config.lastRun || new Date(config.lastRun) < nextRunDate)) {
      console.log('[BACKUP][SCHEDULER] Missed scheduled backup detected from previous session. Running on launch...');
      setTimeout(async () => {
        if (!isDatabaseBusy()) {
          try {
            await executeBackup({ isManual: false });
          } catch (e) {
            console.error('[BACKUP][SCHEDULER] Missed backup on launch failed:', e.message);
          }
        }
      }, 3000);
    }
  }

  armScheduler();
}

function updateSchedule(newConfig) {
  const current = loadScheduleConfig();
  const merged = { ...current, ...newConfig };

  if (merged.scheduleType === 'custom') {
    validateCronExpression(merged.cronExpression);
  }

  merged.nextRun = calculateNextRun(merged, new Date()).toISOString();
  saveScheduleConfig(merged);
  armScheduler();
  return {
    ...merged,
    timezone: getTimezone(),
  };
}

function getScheduleStatus() {
  const config = loadScheduleConfig();
  return {
    ...config,
    timezone: getTimezone(),
    isBackupRunning,
    defaultDestinationDir: getDefaultBackupDir(),
  };
}

module.exports = {
  initScheduler,
  getScheduleStatus,
  updateSchedule,
  executeBackup,
  listBackups,
  verifyBackupFile,
  applyRetention,
  validateCronExpression,
  calculateNextRun,
  calculateNextCronRun,
  getTimezone,
  getDefaultBackupDir,
  getRecentOperations,
  logOperation,
};

