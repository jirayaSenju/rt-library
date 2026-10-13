/**
 * Smart Scheduled Sync & Idle-Aware Automation (V3-77)
 * Runs safe, user-controlled periodic synchronization in Electron Main
 * strictly while RT-Library is open and Browser Companion is READY.
 *
 * INVARIANTS:
 * 1. Never launches browsers or tabs automatically.
 * 2. Never falls back to Playwright for scheduled jobs.
 * 3. Never solves Cloudflare or interacts with CAPTCHA.
 * 4. Never bursts catch-up runs if app was closed or machine slept.
 * 5. Runs incremental sync with triggerType='SCHEDULED'.
 * 6. Skipped checks never pollute sync_runs table.
 */

const { BrowserWindow, powerMonitor } = require('electron');
const dbMain = require('../database/dbMain.cjs');
const appStateRepo = require('../database/repositories/appStateRepo.cjs');
const { SCRAPER_IPC_MESSAGES } = require('../../scraper/protocol.cjs');

const APP_STATE_SCHEDULE_KEY = 'scraper_sync_schedule';

const FREQUENCY_PRESETS = {
  '1h': { label: 'Every hour', intervalMinutes: 60 },
  '3h': { label: 'Every 3 hours', intervalMinutes: 180 },
  '6h': { label: 'Every 6 hours', intervalMinutes: 360 },
  '12h': { label: 'Every 12 hours', intervalMinutes: 720 },
  '24h': { label: 'Daily', intervalMinutes: 1440 },
  'daily': { label: 'Daily', intervalMinutes: 1440 },
};

const DEFAULT_CONFIG = {
  enabled: false,
  scheduleType: '6h',
  intervalMinutes: 360,
  scope: 'ALL_ENABLED', // 'ALL_ENABLED' | 'SELECTED'
  categoryIds: [],
  transport: null, // null (use system preference) | 'EMBEDDED_ELECTRON' | 'BROWSER_COMPANION'
  lastAttemptAt: null,
  lastStartedAt: null,
  nextRunAt: null,
  lastSkipReason: null, // Normalized skip reason
};

let schedulerTimer = null;
let powerMonitorSubscribed = false;
let isCheckInProgress = false;

function isTestOrDev() {
  return process.env.NODE_ENV === 'test' || process.env.RT_LIBRARY_DEV_SCHEDULE === 'true';
}

function broadcastStatus(status) {
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(SCRAPER_IPC_MESSAGES.EVENT_SCHEDULER_STATUS_CHANGED, status);
    }
  });
}

function loadConfig() {
  try {
    const db = dbMain.getDatabase();
    if (!db) return { ...DEFAULT_CONFIG };
    const raw = appStateRepo.getAppState(db, APP_STATE_SCHEDULE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Security: ensure no token or sensitive session data is kept
      sessionToken: undefined,
      sessionId: undefined,
    };
  } catch (err) {
    console.error('[SYNC][SCHEDULER] Failed to load config:', err.message);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  try {
    const db = dbMain.getDatabase();
    if (!db) return false;
    // Strip any sensitive fields before persisting
    const cleanConfig = {
      enabled: Boolean(config.enabled),
      scheduleType: config.scheduleType || '6h',
      intervalMinutes: Number(config.intervalMinutes) || 360,
      scope: config.scope === 'SELECTED' ? 'SELECTED' : 'ALL_ENABLED',
      categoryIds: Array.isArray(config.categoryIds) ? config.categoryIds : [],
      transport: config.transport || null,
      lastAttemptAt: config.lastAttemptAt || null,
      lastStartedAt: config.lastStartedAt || null,
      nextRunAt: config.nextRunAt || null,
      lastSkipReason: config.lastSkipReason || null,
    };
    appStateRepo.setAppState(db, APP_STATE_SCHEDULE_KEY, cleanConfig);
    return true;
  } catch (err) {
    console.error('[SYNC][SCHEDULER] Failed to save config:', err.message);
    return false;
  }
}

function calculateNextRun(intervalMinutes, fromDate = new Date()) {
  const fromMs = fromDate instanceof Date ? fromDate.getTime() : new Date(fromDate).getTime();
  const nextMs = fromMs + intervalMinutes * 60 * 1000;
  return new Date(nextMs).toISOString();
}

function validateAndNormalizeConfig(newConfig, currentConfig = DEFAULT_CONFIG) {
  const merged = { ...currentConfig, ...newConfig };

  const enabled = Boolean(merged.enabled);
  let scheduleType = merged.scheduleType || '6h';
  let intervalMinutes = Number(merged.intervalMinutes);

  if (FREQUENCY_PRESETS[scheduleType]) {
    intervalMinutes = FREQUENCY_PRESETS[scheduleType].intervalMinutes;
  } else if (!intervalMinutes || isNaN(intervalMinutes)) {
    scheduleType = '6h';
    intervalMinutes = 360;
  }

  // Enforce minimum interval: 60 minutes in production, 1 minute in dev/test
  const minInterval = isTestOrDev() ? 1 : 60;
  if (intervalMinutes < minInterval) {
    intervalMinutes = minInterval;
  }

  const scope = merged.scope === 'SELECTED' ? 'SELECTED' : 'ALL_ENABLED';
  const categoryIds = Array.isArray(merged.categoryIds) ? merged.categoryIds : [];

  return {
    ...merged,
    enabled,
    scheduleType,
    intervalMinutes,
    scope,
    categoryIds,
    transport: merged.transport || null,
  };
}

/**
 * Execute due check before initiating a scheduled synchronization.
 * Checks all preconditions without opening any browsers or forcing access.
 */
async function runDueCheck(isManualTrigger = false) {
  if (isCheckInProgress) {
    return { executed: false, skipped: true, reason: 'CHECK_IN_PROGRESS' };
  }
  isCheckInProgress = true;

  const config = loadConfig();
  if (!config.enabled && !isManualTrigger) {
    isCheckInProgress = false;
    return { executed: false, skipped: true, reason: 'SCHEDULER_DISABLED' };
  }

  const now = new Date();
  if (!isManualTrigger && config.nextRunAt) {
    const nextRunMs = new Date(config.nextRunAt).getTime();
    // Allow 2-second grace threshold for timer jitter
    if (now.getTime() + 2000 < nextRunMs) {
      isCheckInProgress = false;
      return { executed: false, skipped: true, reason: 'NOT_DUE_YET' };
    }
  }

  config.lastAttemptAt = now.toISOString();

  const ScraperManager = require('./scraperManager.cjs');
  const manager = ScraperManager.getInstance();

  // 1. Initial Setup Guard
  try {
    const db = dbMain.getDatabase();
    if (db) {
      const initialScanDone = appStateRepo.getAppState(db, 'initial_scan_completed');
      if (initialScanDone !== 'true') {
        config.lastSkipReason = 'INITIAL_SETUP_PENDING';
        saveConfig(config);
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'INITIAL_SETUP_PENDING' };
      }
    }
  } catch (_) {}

  // 2. Scraper Busy Guard (One active job invariant & Rule 9 scheduler freeze during VERIFYING)
  if (manager.isProfileBusy() || manager.getState().isRunning || manager.isVerificationWaiting || manager.getEmbeddedTransport?.()?.isVerificationWindowOpen?.()) {
    config.lastSkipReason = 'SCRAPER_BUSY';
    // Defer next check by 15 minutes (or 2 minutes in test/dev) to check again
    const deferMinutes = isTestOrDev() ? 2 : 15;
    config.nextRunAt = calculateNextRun(deferMinutes, now);
    saveConfig(config);
    armScheduler();
    broadcastStatus(getSchedulerStatus());
    isCheckInProgress = false;
    return { executed: false, skipped: true, reason: 'SCRAPER_BUSY' };
  }

  // 3. Resolve Target Categories Snapshot
  const { CategoryManager } = require('./categoryManager.cjs');
  const catManager = CategoryManager.getInstance();
  const allCategories = catManager.getResolvedCategories();
  const enabledCategories = allCategories.filter((c) => c.enabled !== false);

  let targetCategories = enabledCategories;
  if (config.scope === 'SELECTED' && config.categoryIds.length > 0) {
    targetCategories = enabledCategories.filter((c) => config.categoryIds.includes(c.id));
  }

  if (targetCategories.length === 0) {
    config.lastSkipReason = 'NO_ENABLED_CATEGORIES';
    config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
    saveConfig(config);
    armScheduler();
    broadcastStatus(getSchedulerStatus());
    isCheckInProgress = false;
    return { executed: false, skipped: true, reason: 'NO_ENABLED_CATEGORIES' };
  }

  // 4. Resolve Scheduled Transport (V3-82)
  const { resolveActiveTransport, TRANSPORTS, getTransportPreference, isEmbeddedPromoted } = require('./transportResolver.cjs');
  const dbInstance = dbMain.getDatabase();
  const preferredTransport = config.transport || (dbInstance ? getTransportPreference(dbInstance) : TRANSPORTS.AUTOMATIC);
  const promotionPolicy = (dbInstance && isEmbeddedPromoted(dbInstance)) ? 'PROMOTED' : 'EXPERIMENTAL';

  const scheduledTransport = resolveActiveTransport({
    companionTransport: manager.getCompanionTransport(),
    embeddedTransport: manager.getEmbeddedTransport?.(),
    preferredTransport,
    promotionPolicy,
  });

  // 5. Pre-flight Readiness Check based on resolved transport
  if (scheduledTransport === TRANSPORTS.EMBEDDED_ELECTRON) {
    const embedded = manager.getEmbeddedTransport ? manager.getEmbeddedTransport() : null;
    if (!embedded) {
      config.lastSkipReason = 'EMBEDDED_UNAVAILABLE';
      config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
      saveConfig(config);
      armScheduler();
      broadcastStatus(getSchedulerStatus());
      isCheckInProgress = false;
      return { executed: false, skipped: true, reason: 'EMBEDDED_UNAVAILABLE' };
    }

    try {
      const probeCat = targetCategories[0];
      const accessResult = await embedded.checkAccess(probeCat);

      if (accessResult.status === 'CHALLENGE_REQUIRED' || accessResult.status === 'VERIFICATION_REQUIRED' || accessResult.status === 'INTERACTION_REQUIRED') {
        // Zero Surprise Windows: NEVER open verification window automatically during background schedule!
        config.lastSkipReason = 'VERIFICATION_REQUIRED';
        config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
        saveConfig(config);
        armScheduler();
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'VERIFICATION_REQUIRED' };
      }

      if (accessResult.status !== 'FORUM_READY' && accessResult.status !== 'ACCESSIBLE') {
        config.lastSkipReason = 'ACCESS_NOT_READY';
        config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
        saveConfig(config);
        armScheduler();
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'ACCESS_NOT_READY' };
      }
    } catch (err) {
      config.lastSkipReason = 'ACCESS_NOT_READY';
      config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
      saveConfig(config);
      armScheduler();
      broadcastStatus(getSchedulerStatus());
      isCheckInProgress = false;
      return { executed: false, skipped: true, reason: 'ACCESS_NOT_READY', error: err.message };
    }
  } else {
    // Browser Companion Transport checks
    const companion = manager.getCompanionTransport();
    if (!companion || !companion.isAvailable()) {
      config.lastSkipReason = 'COMPANION_DISCONNECTED';
      config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
      saveConfig(config);
      armScheduler();
      broadcastStatus(getSchedulerStatus());
      isCheckInProgress = false;
      return { executed: false, skipped: true, reason: 'COMPANION_DISCONNECTED' };
    }

    try {
      const probeCat = targetCategories[0];
      const accessResult = await companion.checkAccess(probeCat);

      if (accessResult.status === 'NO_RUTRACKER_TAB') {
        config.lastSkipReason = 'NO_RUTRACKER_TAB';
        config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
        saveConfig(config);
        armScheduler();
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'NO_RUTRACKER_TAB' };
      }

      if (accessResult.status === 'CHALLENGE_REQUIRED' || accessResult.status === 'VERIFICATION_REQUIRED') {
        config.lastSkipReason = 'VERIFICATION_REQUIRED';
        config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
        saveConfig(config);
        armScheduler();
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'VERIFICATION_REQUIRED' };
      }

      if (accessResult.status !== 'FORUM_READY') {
        config.lastSkipReason = 'ACCESS_NOT_READY';
        config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
        saveConfig(config);
        armScheduler();
        broadcastStatus(getSchedulerStatus());
        isCheckInProgress = false;
        return { executed: false, skipped: true, reason: 'ACCESS_NOT_READY' };
      }
    } catch (err) {
      config.lastSkipReason = 'ACCESS_NOT_READY';
      config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
      saveConfig(config);
      armScheduler();
      broadcastStatus(getSchedulerStatus());
      isCheckInProgress = false;
      return { executed: false, skipped: true, reason: 'ACCESS_NOT_READY', error: err.message };
    }
  }

  // 6. All pre-flight checks passed: Launch incremental scheduled sync
  config.lastSkipReason = null;
  config.lastStartedAt = now.toISOString();
  config.nextRunAt = calculateNextRun(config.intervalMinutes, now);
  saveConfig(config);
  armScheduler();
  broadcastStatus(getSchedulerStatus());

  try {
    const startOptions = {
      transport: scheduledTransport,
      triggerType: 'SCHEDULED',
      full: false,
      ignoreEarlyStop: false,
      category: config.scope === 'SELECTED' && targetCategories.length === 1 ? targetCategories[0].id : null,
      categoryIds: config.scope === 'SELECTED' ? targetCategories.map((c) => c.id) : null,
    };

    console.log(`[SYNC][SCHEDULER] Launching scheduled incremental sync (${config.scope}, categories=${targetCategories.length}, transport=${scheduledTransport})...`);
    await manager.start(startOptions);
    isCheckInProgress = false;
    return { executed: true, skipped: false };
  } catch (err) {
    console.error('[SYNC][SCHEDULER] Failed to start scheduled scraper job:', err.message);
    config.lastSkipReason = 'START_ERROR';
    saveConfig(config);
    broadcastStatus(getSchedulerStatus());
    isCheckInProgress = false;
    return { executed: false, skipped: true, reason: 'START_ERROR', error: err.message };
  }
}

function armScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  const config = loadConfig();
  if (!config.enabled) {
    return;
  }

  const now = Date.now();
  let targetMs = config.nextRunAt ? new Date(config.nextRunAt).getTime() : 0;

  // If nextRunAt is unset or invalid, set from now
  if (!targetMs || isNaN(targetMs)) {
    config.nextRunAt = calculateNextRun(config.intervalMinutes, new Date());
    saveConfig(config);
    targetMs = new Date(config.nextRunAt).getTime();
  }

  let delayMs = Math.max(500, targetMs - now);

  // If target time has already passed while app was open, run due check shortly
  if (targetMs <= now) {
    delayMs = 500;
  }

  schedulerTimer = setTimeout(async () => {
    try {
      await runDueCheck();
    } catch (err) {
      console.error('[SYNC][SCHEDULER] Error during scheduled due check:', err);
    }
  }, delayMs);
}

function initSyncScheduler() {
  const config = loadConfig();

  // If next run was missed while app was closed, schedule from launch (never burst multiple runs)
  if (config.enabled) {
    const now = Date.now();
    const nextRunMs = config.nextRunAt ? new Date(config.nextRunAt).getTime() : 0;

    if (!nextRunMs || nextRunMs <= now) {
      // Missed run while closed: advance next run to 1 interval from now
      config.nextRunAt = calculateNextRun(config.intervalMinutes, new Date());
      saveConfig(config);
    }

    armScheduler();
  }

  // Handle system wake/sleep resume
  if (powerMonitor && !powerMonitorSubscribed) {
    powerMonitorSubscribed = true;
    powerMonitor.on('resume', () => {
      console.log('[SYNC][SCHEDULER] System resumed from sleep/suspend. Checking schedule...');
      const current = loadConfig();
      if (!current.enabled) return;

      const now = Date.now();
      const targetMs = current.nextRunAt ? new Date(current.nextRunAt).getTime() : 0;

      // Only run if overdue, and at most once
      if (targetMs && targetMs <= now) {
        runDueCheck().catch((err) => {
          console.warn('[SYNC][SCHEDULER] Error executing resumed due check:', err.message);
        });
      } else {
        armScheduler();
      }
    });
  }
}

function stopSyncScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function updateSchedulerConfig(newConfig) {
  const current = loadConfig();
  const updated = validateAndNormalizeConfig(newConfig, current);

  // If explicit nextRunAt provided, preserve it
  if (newConfig.nextRunAt !== undefined) {
    updated.nextRunAt = newConfig.nextRunAt;
  } else if (updated.enabled && (!current.enabled || updated.intervalMinutes !== current.intervalMinutes)) {
    // If frequency changed or enabled toggled, recalculate next run
    updated.nextRunAt = calculateNextRun(updated.intervalMinutes, new Date());
  } else if (!updated.enabled) {
    updated.nextRunAt = null;
    updated.lastSkipReason = null;
  }

  saveConfig(updated);

  if (updated.enabled) {
    armScheduler();
  } else {
    stopSyncScheduler();
  }

  const status = getSchedulerStatus();
  broadcastStatus(status);
  return status;
}

function getSchedulerStatus() {
  const config = loadConfig();
  const ScraperManager = require('./scraperManager.cjs');
  const manager = ScraperManager.getInstance();
  const companion = manager.getCompanionTransport();
  const isCompanionConnected = Boolean(companion?.isAvailable());
  const isScraperBusy = manager.isProfileBusy() || manager.getState().isRunning;

  let scheduledTransport = 'BROWSER_COMPANION';
  try {
    const { resolveActiveTransport, TRANSPORTS, getTransportPreference, isEmbeddedPromoted } = require('./transportResolver.cjs');
    const dbInstance = dbMain.getDatabase();
    const preferredTransport = config.transport || (dbInstance ? getTransportPreference(dbInstance) : TRANSPORTS.AUTOMATIC);
    const promotionPolicy = (dbInstance && isEmbeddedPromoted(dbInstance)) ? 'PROMOTED' : 'EXPERIMENTAL';

    scheduledTransport = resolveActiveTransport({
      companionTransport: companion,
      embeddedTransport: manager.getEmbeddedTransport?.(),
      preferredTransport,
      promotionPolicy,
    });
  } catch (_) {}

  return {
    ...config,
    scheduledTransport,
    isCompanionConnected,
    isScraperBusy,
  };
}

module.exports = {
  initSyncScheduler,
  stopSyncScheduler,
  updateSchedulerConfig,
  getSchedulerStatus,
  runDueCheck,
  calculateNextRun,
  validateAndNormalizeConfig,
  FREQUENCY_PRESETS,
  DEFAULT_CONFIG,
};
