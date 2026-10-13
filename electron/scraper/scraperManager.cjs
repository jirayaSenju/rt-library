/**
 * Main Process Scraper Manager Singleton
 * Manages scraper process isolation via child_process.fork(),
 * state machine, IPC broadcasting, and storage maintenance.
 */

const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const { BrowserWindow, app, dialog, shell } = require('electron');
const { SCRAPER_IPC_MESSAGES, SCRAPER_STATES } = require('../../scraper/protocol.cjs');
const dbMain = require('../database/dbMain.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const appStateRepo = require('../database/repositories/appStateRepo.cjs');
const { ingestRawBatch } = require('../indexer/ingestionService.cjs');
const { normalizeScraperOptions, createExecutionPlan } = require('./executionPlan.cjs');
const { ScraperBrowserSession, isScraperProfileActive } = require('../../scraper/browserSession.cjs');
const { resolveScraperProfileDirectory } = require('../../scraper/platformPaths.cjs');
const { ACCESS_STATUSES, sanitizeUrlForLog, resolveProbeScope, summarizeAccess } = require('../../scraper/accessProbe.cjs');
const { removeStaleScraperLock } = require('../../scraper/processLock.cjs');

class ScraperManager {
  constructor() {
    this.childProcess = null;
    this.state = SCRAPER_STATES.IDLE;
    this.progress = null;
    this.logs = [];
    this.maxLogs = 200;
    this.startTime = null;
    this.cancelTimer = null;
    this.currentOptions = null;
    this.currentLogPath = null;
    this.lastLogPath = null;
    this.access = { status: 'UNKNOWN', scanReady: false, results: [], checkedAt: null };
    this.probeSession = null;
    this.probeCancelled = false;
    this.pendingScanIntent = null;
    this.companionTransport = null;
    this.embeddedTransport = null;
    this.activeJobTransport = null;
    this.isCompanionScanning = false;
    this.isEmbeddedScanning = false;
    this.isCancelledFlag = false;
    this.isPausedFlag = false;
    this.currentSyncRunId = null;
    this._verificationResolver = null;
    this._verificationRejecter = null;
    this.isVerificationWaiting = false;
  }

  setCompanionTransport(transport) {
    this.companionTransport = transport;
  }

  getCompanionTransport() {
    return this.companionTransport;
  }

  setEmbeddedTransport(transport) {
    this.embeddedTransport = transport;
  }

  getEmbeddedTransport() {
    if (!this.embeddedTransport) {
      const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
      this.embeddedTransport = new EmbeddedElectronTransport();
    }
    return this.embeddedTransport;
  }

  static getInstance() {
    if (!ScraperManager.instance) {
      ScraperManager.instance = new ScraperManager();
    }
    return ScraperManager.instance;
  }

  getLogsDir() {
    try {
      const userDataPath = app ? app.getPath('userData') : path.resolve(__dirname, '../../.userData');
      const logsDir = path.join(userDataPath, 'logs', 'scraper');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      return logsDir;
    } catch (err) {
      console.error('[MANAGER] Failed to resolve logs dir:', err);
      return path.resolve(__dirname, '../../logs');
    }
  }

  initJobLogFile(category = 'all') {
    try {
      const logsDir = this.getLogsDir();

      // Retention policy: keep latest 20 files
      try {
        const files = fs.readdirSync(logsDir)
          .filter(f => f.endsWith('.log'))
          .map(f => ({ name: f, path: path.join(logsDir, f), mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length >= 20) {
          files.slice(19).forEach(f => {
            try { fs.unlinkSync(f.path); } catch (_) {}
          });
        }
      } catch (_) {}

      const now = new Date();
      const datePart = now.toISOString().slice(0, 10);
      const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
      const catSanitized = (category || 'all').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const filename = `${datePart}_${timePart}-${catSanitized}.log`;

      this.currentLogPath = path.join(logsDir, filename);
      this.lastLogPath = this.currentLogPath;

      const header = `=== RT-LIBRARY SCRAPER JOB LOG ===\nDate: ${now.toISOString()}\nCategory: ${category || 'all'}\nLog File: ${filename}\n==================================\n\n`;
      fs.writeFileSync(this.currentLogPath, header, 'utf8');
    } catch (err) {
      console.error('[MANAGER] Failed to initialize job log file:', err);
    }
  }

  broadcast(channel, data) {
    if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    });
  }

  addLog(logEntry) {
    if (!logEntry || !logEntry.message) return;
    const lastLog = this.logs[this.logs.length - 1];
    if (lastLog && lastLog.message === logEntry.message) {
      const lastTs = new Date(lastLog.timestamp).getTime();
      const currTs = new Date(logEntry.timestamp).getTime();
      if (Math.abs(currTs - lastTs) < 1000) {
        return; // Suppress duplicate log stream entry
      }
    }
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_LOG, logEntry);

    // Append line to persistent log file
    if (this.currentLogPath) {
      try {
        const ts = logEntry.timestamp ? new Date(logEntry.timestamp).toISOString().replace('T', ' ').slice(0, 19) : new Date().toISOString().replace('T', ' ').slice(0, 19);
        const level = (logEntry.level || 'info').toUpperCase().padEnd(5);
        const line = `${ts} [${level}] ${logEntry.message}\n`;
        fs.appendFileSync(this.currentLogPath, line, 'utf8');
      } catch (err) {
        console.error('[MANAGER] Failed to append log line:', err);
      }
    }
  }

  setState(newState, error = null, details = null) {
    this.state = newState;
    if (details?.results && Array.isArray(details.results)) {
      this.access = details;
    } else if (details?.categoryId && details?.status) {
      const results = new Map(this.access.results.map((item) => [item.categoryId, item]));
      results.set(details.categoryId, details);
      const merged = [...results.values()];
      const expectedCount = this.access.expectedCount || merged.length;
      this.access = { ...summarizeAccess(merged, expectedCount), scope: this.access.scope, categoryIds: this.access.categoryIds, checkedAt: new Date().toISOString() };
      this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
    }
    const payload = { state: this.state, error, details };
    this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_STATE_CHANGED, payload);
  }

  getState() {
    let activeTransport = this.activeJobTransport || 'NONE';
    if (activeTransport === 'NONE') {
      try {
        const { resolveActiveTransport, TRANSPORTS, getTransportPreference, isEmbeddedPromoted } = require('./transportResolver.cjs');
        const dbInstance = dbMain.getDatabase();
        const systemPreference = dbInstance ? getTransportPreference(dbInstance) : TRANSPORTS.AUTOMATIC;
        const promotionPolicy = (dbInstance && isEmbeddedPromoted(dbInstance)) ? 'PROMOTED' : 'EXPERIMENTAL';
        activeTransport = resolveActiveTransport({
          companionTransport: this.companionTransport,
          embeddedTransport: this.getEmbeddedTransport(),
          preferredTransport: systemPreference,
          promotionPolicy,
        });
      } catch (_) {}
    }

    return {
      state: this.state,
      progress: this.progress,
      logs: this.logs,
      isRunning: this.isCompanionScanning || this.isEmbeddedScanning || [SCRAPER_STATES.PREFLIGHT, SCRAPER_STATES.STARTING, SCRAPER_STATES.VERIFYING, SCRAPER_STATES.REPROBING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(this.state),
      pendingScan: !!this.pendingScanIntent,
      startTime: this.startTime,
      access: this.access,
      activeTransport,
      companionConnected: Boolean(this.companionTransport?.isAvailable()),
    };
  }

  getUserDataPath() {
    return app ? app.getPath('userData') : path.resolve(__dirname, '../../.userData');
  }

  getScraperProfilePath() {
    return resolveScraperProfileDirectory(this.getUserDataPath());
  }

  isProfileBusy() {
    if (this.isCompanionScanning || this.isEmbeddedScanning) return true;
    const childAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;
    return !!(this.probeSession || childAlive || isScraperProfileActive(this.getScraperProfilePath()) || [
      SCRAPER_STATES.PREFLIGHT, SCRAPER_STATES.STARTING, SCRAPER_STATES.VERIFYING,
      SCRAPER_STATES.REPROBING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING,
    ].includes(this.state));
  }

  getAccessScope(options = {}, categories) {
    const selectedId = options.category && options.category !== 'all' ? String(options.category).toLowerCase() : null;
    return resolveProbeScope(categories, selectedId);
  }

  async probeScope(scope, { merge = false } = {}) {
    if (this.probeSession) throw new Error('SCRAPER_BUSY: An access check is already running.');
    this.probeCancelled = false;
    const session = new ScraperBrowserSession({ userDataDir: this.getScraperProfilePath(), mode: 'preflight', requestId: `preflight_${Date.now()}` });
    this.probeSession = session;
    const incoming = [];
    const urlResults = new Map();
    let closeReason = 'preflight_complete';
    this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, { status: 'CHECKING', scope: scope.type, results: this.access.results });
    const uniqueUrlCount = new Set(scope.categories.map((category) => category.baseUrl)).size;
    this.addLog({ level: 'info', message: `[SESSION_PROBE_START] mode=preflight requestId=${session.requestId} context=${session.contextId} scope=${scope.type} categories=${scope.categoryIds.length} uniqueUrls=${uniqueUrlCount}`, timestamp: new Date().toISOString() });

    try {
      await session.start({ headless: true });
      this.addLog({ level: 'info', message: `[SCRAPER][PROFILE] mode=preflight path=${session.profileDir} context=${session.contextId}`, timestamp: new Date().toISOString() });
      for (const category of scope.categories) {
        if (this.probeCancelled) throw Object.assign(new Error('Access check cancelled.'), { code: 'CANCELLED' });
        const cachedUrlResult = urlResults.has(category.baseUrl);
        if (!cachedUrlResult) {
          this.addLog({
            level: 'info',
            message: `[SCRAPER][PREFLIGHT] attempt=1 logicalAttempt=${urlResults.size + 1} requestId=${session.requestId} category=${category.id} isMainFrame=true resourceType=document url=${sanitizeUrlForLog(category.baseUrl)}`,
            timestamp: new Date().toISOString(),
          });
        }
        const result = cachedUrlResult
          ? { ...urlResults.get(category.baseUrl), categoryId: category.id, categoryName: category.name, url: category.baseUrl }
          : await session.probeCategory(category);
        urlResults.set(category.baseUrl, result);
        if (result.status === ACCESS_STATUSES.INTERACTION_REQUIRED) closeReason = 'preflight_blocked';
        if (this.probeCancelled) throw Object.assign(new Error('Access check cancelled.'), { code: 'CANCELLED' });
        incoming.push(result);
        const event = result.status === ACCESS_STATUSES.ACCESSIBLE || result.status === ACCESS_STATUSES.ACCESSIBLE_EMPTY
          ? 'CATEGORY_ACCESSIBLE'
          : result.status === ACCESS_STATUSES.INTERACTION_REQUIRED
            ? 'CATEGORY_INTERACTION_REQUIRED'
            : 'SESSION_PROBE_RESULT';
        this.addLog({
          level: result.status === ACCESS_STATUSES.ACCESSIBLE || result.status === ACCESS_STATUSES.ACCESSIBLE_EMPTY ? 'info' : 'warn',
          message: `[${event}] mode=preflight requestId=${session.contextId}:${category.id} context=${session.contextId} category=${category.id} attempt=${cachedUrlResult ? 'shared' : '1'} status=${result.status} http=${result.httpStatus ?? 'none'}`,
          timestamp: new Date().toISOString(),
        });
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, {
          status: 'CHECKING', scope: scope.type, currentCategoryId: category.id, results: [...this.access.results, ...incoming],
        });
        // A Cloudflare challenge is host-level interaction, not a category retry
        // signal. One blocked document is sufficient; probing every sibling URL
        // creates more challenge traffic without adding actionable information.
        if (result.status === ACCESS_STATUSES.INTERACTION_REQUIRED) break;
      }
    } finally {
      try {
        await session.close(this.probeCancelled ? 'cancelled' : closeReason);
      } finally {
        if (this.probeSession === session) this.probeSession = null;
      }
    }

    const mergedResults = new Map(merge ? this.access.results.map((item) => [item.categoryId, item]) : []);
    for (const result of incoming) mergedResults.set(result.categoryId, result);
    const expectedResults = scope.type === 'all'
      ? scope.categories.map((category) => mergedResults.get(category.id) || {
        categoryId: category.id, categoryName: category.name, url: category.baseUrl,
        status: ACCESS_STATUSES.UNKNOWN, httpStatus: null, challengeDetected: false,
        authenticationRequired: false, checkedAt: null, message: 'Not checked yet.',
      })
      : incoming;
    const summary = summarizeAccess(expectedResults, scope.categories.length);
    this.access = { ...summary, scope: scope.type, categoryIds: scope.categoryIds, checkedAt: new Date().toISOString() };
    this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
    this.addLog({ level: summary.scanReady ? 'info' : 'warn', message: `[SESSION_PROBE_RESULT] scope=${scope.type} status=${summary.status} accessible=${summary.accessibleCount}/${summary.expectedCount}`, timestamp: new Date().toISOString() });
    return this.access;
  }

  async probeAccess(options = {}, { internal = false } = {}) {
    const isChildAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;
    if (isChildAlive || [SCRAPER_STATES.STARTING, SCRAPER_STATES.VERIFYING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(this.state)
      || isScraperProfileActive(this.getScraperProfilePath())
      || (!internal && this.state === SCRAPER_STATES.REPROBING)) {
      throw new Error('SCRAPER_BUSY: A scraper or verification window is already running.');
    }
    const { resolveActiveTransport, TRANSPORTS, getTransportPreference, isEmbeddedPromoted } = require('./transportResolver.cjs');
    const dbInstance = dbMain.getDatabase();
    const systemPreference = dbInstance ? getTransportPreference(dbInstance) : TRANSPORTS.AUTOMATIC;
    const promotionPolicy = (dbInstance && isEmbeddedPromoted(dbInstance)) ? 'PROMOTED' : 'EXPERIMENTAL';
    const activeTransport = resolveActiveTransport({
      companionTransport: this.companionTransport,
      embeddedTransport: this.getEmbeddedTransport(),
      preferredTransport: (options.transport && options.transport !== TRANSPORTS.AUTOMATIC) ? options.transport : systemPreference,
      promotionPolicy,
    });

    if (activeTransport === TRANSPORTS.EMBEDDED_ELECTRON) {
      try {
        const probeResult = await this.probeEmbeddedAccess(options);
        const isReady = probeResult && ['ACCESSIBLE', 'FORUM_READY'].includes(probeResult.status);
        const status = isReady ? ACCESS_STATUSES.ACCESSIBLE : ACCESS_STATUSES.INTERACTION_REQUIRED;
        this.access = {
          status,
          scanReady: isReady,
          accessibleCount: isReady ? 1 : 0,
          expectedCount: 1,
          scope: 'single',
          categoryIds: [probeResult.categoryId || options.categoryId || 'switch'],
          checkedAt: new Date().toISOString(),
          results: [{
            categoryId: probeResult.categoryId || options.categoryId || 'switch',
            categoryName: probeResult.categoryName,
            status,
            httpStatus: probeResult.httpStatus,
            challengeDetected: !isReady,
            transport: 'EMBEDDED_ELECTRON',
          }],
        };
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
        return this.access;
      } catch (err) {
        const status = (err.code === 'INTERACTION_REQUIRED' || err.status === 'CHALLENGE_REQUIRED')
          ? ACCESS_STATUSES.INTERACTION_REQUIRED
          : 'ERROR';
        this.access = {
          status,
          scanReady: false,
          accessibleCount: 0,
          expectedCount: 1,
          scope: 'single',
          categoryIds: [options.categoryId || 'switch'],
          checkedAt: new Date().toISOString(),
          results: [{
            categoryId: options.categoryId || 'switch',
            status,
            challengeDetected: status === ACCESS_STATUSES.INTERACTION_REQUIRED,
            transport: 'EMBEDDED_ELECTRON',
            message: err.message,
          }],
          error: err.message,
        };
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
        return this.access;
      }
    }

    const { CategoryManager } = require('./categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories();
    const scope = this.getAccessScope(options, categories);
    try {
      return await this.probeScope(scope, { merge: true });
    } catch (error) {
      if (error.code !== 'CANCELLED') {
        this.access = { status: 'ERROR', scanReady: false, accessibleCount: 0, expectedCount: scope.categories.length, scope: scope.type, categoryIds: scope.categoryIds, checkedAt: new Date().toISOString(), results: [], error: error.message };
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
        this.addLog({ level: 'error', message: `[SESSION_PROBE_RESULT] scope=${scope.type} status=ERROR`, timestamp: new Date().toISOString() });
      }
      throw error;
    } finally {
      if (this.state === SCRAPER_STATES.CANCELLING) this.setState(SCRAPER_STATES.IDLE);
    }
  }

  async start(options = {}, { preflightValidated = false } = {}) {
    // Verify if worker process is genuinely alive
    const isChildAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;

    const { resolveActiveTransport, TRANSPORTS, getTransportPreference, isEmbeddedPromoted } = require('./transportResolver.cjs');
    const dbInstance = dbMain.getDatabase();
    const systemPreference = dbInstance ? getTransportPreference(dbInstance) : TRANSPORTS.AUTOMATIC;
    const promotionPolicy = (dbInstance && isEmbeddedPromoted(dbInstance)) ? 'PROMOTED' : 'EXPERIMENTAL';

    const preferredTransport = options.login
      ? TRANSPORTS.PLAYWRIGHT
      : ((options.transport && options.transport !== TRANSPORTS.AUTOMATIC) ? options.transport : systemPreference);

    const activeTransport = resolveActiveTransport({
      companionTransport: this.companionTransport,
      embeddedTransport: this.getEmbeddedTransport(),
      preferredTransport,
      promotionPolicy,
    });

    this.activeJobTransport = activeTransport;

    const sessionLabel = activeTransport === TRANSPORTS.EMBEDDED_ELECTRON
      ? 'persist:rutracker-v1'
      : (activeTransport === TRANSPORTS.BROWSER_COMPANION ? 'companion' : 'scraper-profile');

    this.addLog({
      level: 'info',
      message: `[SCRAPER][TRANSPORT] preference=${preferredTransport} resolved=${activeTransport} session=${sessionLabel}`,
      timestamp: new Date().toISOString(),
    });

    if (activeTransport === TRANSPORTS.BROWSER_COMPANION || activeTransport === TRANSPORTS.EMBEDDED_ELECTRON) {
      this.pendingScanIntent = null;
    } else if (this.pendingScanIntent && !options.login) {
      return {
        success: false,
        blocked: true,
        reason: 'verification_pending',
        status: ACCESS_STATUSES.INTERACTION_REQUIRED,
        categoryId: this.access.results.find((item) => item.status === ACCESS_STATUSES.INTERACTION_REQUIRED)?.categoryId || null,
      };
    }

    if (this.isProfileBusy() || isChildAlive) {
      throw new Error('SCRAPER_ALREADY_RUNNING: Scraper process is already executing.');
    }

    if (this.childProcess) {
      this.cleanup();
    }

    const runtimeDataDir = app?.isPackaged
      ? app.getPath('userData')
      : path.resolve(__dirname, '../..');
    const lockFile = path.join(runtimeDataDir, 'scraper.lock');
    if (removeStaleScraperLock(lockFile)) {
      this.addLog({ level: 'warn', message: '[SCRAPER][LOCK] Removed abandoned scraper lock owned by a terminated process.', timestamp: new Date().toISOString() });
    }

    const { CategoryManager } = require('./categoryManager.cjs');
    const catManager = CategoryManager.getInstance();
    const allCategories = catManager.getResolvedCategories();
    const enabledCategories = allCategories.filter((c) => c.enabled !== false);

    const plan = createExecutionPlan(options, { allCategories, enabledCategories });
    const normalizedOptions = plan.options;

    const jobId = normalizedOptions.jobId || `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.currentOptions = { ...normalizedOptions, jobId, plan };
    this.logs = [];

    const logCatName = plan.scope.type === 'single' ? plan.scope.categories[0].id : 'all';
    this.initJobLogFile(logCatName);

    this.progress = {
      category: plan.scope.type === 'single' ? plan.scope.categories[0].id : 'ALL',
      categoryName: plan.scope.type === 'single' ? (plan.scope.categories[0].name || plan.scope.categories[0].id) : 'Todas as categorias',
      currentPage: 0,
      totalPages: 0,
      processedItems: 0,
      newItems: 0,
      totalItems: 0,
      elapsedMs: 0,
    };
    this.startTime = Date.now();

    if (activeTransport === TRANSPORTS.BROWSER_COMPANION) {
      return await this.startWithCompanion(plan, normalizedOptions, jobId);
    }

    if (activeTransport === TRANSPORTS.EMBEDDED_ELECTRON) {
      return await this.startWithEmbedded(plan, normalizedOptions, jobId);
    }

    this.setState(normalizedOptions.login || preflightValidated ? SCRAPER_STATES.STARTING : SCRAPER_STATES.PREFLIGHT);

    if (!normalizedOptions.login && !preflightValidated) {
      try {
        const accessScope = { type: plan.scope.type, categories: plan.scope.categories, categoryIds: plan.scope.categoryIds };
        const access = await this.probeScope(accessScope, { merge: false });
        if (!access.scanReady) {
          const blocked = access.results.filter((item) => ![ACCESS_STATUSES.ACCESSIBLE, ACCESS_STATUSES.ACCESSIBLE_EMPTY].includes(item.status));
          const blockedState = blocked.some((item) => item.status === ACCESS_STATUSES.INTERACTION_REQUIRED)
            ? SCRAPER_STATES.INTERACTION_REQUIRED
            : blocked.some((item) => item.status === ACCESS_STATUSES.AUTH_REQUIRED)
              ? SCRAPER_STATES.SESSION_REQUIRED
              : SCRAPER_STATES.FAILED;
          this.pendingScanIntent = blockedState === SCRAPER_STATES.INTERACTION_REQUIRED
            ? { options: { ...normalizedOptions, category: normalizedOptions.category || null }, createdAt: Date.now() }
            : null;
          this.addLog({ level: 'warn', message: `[SCRAPER_PREFLIGHT_BLOCKED] ${blocked.map((item) => `${item.categoryId}:${item.status}`).join(',')}`, timestamp: new Date().toISOString() });
          this.setState(blockedState, null, { ...access, blocked, pendingScan: !!this.pendingScanIntent });
          return { success: false, blocked: true, reason: 'preflight_failed', status: access.status, categoryId: blocked[0]?.categoryId || null };
        }
        this.setState(SCRAPER_STATES.STARTING);
      } catch (error) {
        if (this.state === SCRAPER_STATES.CANCELLING) this.setState(SCRAPER_STATES.IDLE);
        else if ([SCRAPER_STATES.STARTING, SCRAPER_STATES.PREFLIGHT].includes(this.state)) {
          if (this.access.status === 'CHECKING') {
            this.access = { status: 'ERROR', scanReady: false, accessibleCount: 0, expectedCount: plan.scope.categories.length, scope: plan.scope.type, categoryIds: plan.scope.categoryIds, checkedAt: new Date().toISOString(), results: [], error: error.message };
            this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_ACCESS_CHANGED, this.access);
          }
          this.setState(SCRAPER_STATES.FAILED, error.message, this.access);
        }
        throw error;
      }
    }

    this.addLog({
      level: 'info',
      message: `[MANAGER] Launching scraper worker process (jobId=${jobId}, scope=${plan.scope.type}, target=${plan.scope.targetCategoryId || 'all'}, mode=${plan.mode}, images=${plan.refresh.images}, size=${plan.refresh.size}, files=${plan.refresh.files}, scanAllPages=${plan.scanAllPages}, scanAllCategories=${plan.scanAllCategories}, headless=${normalizedOptions.headless !== false}, login=${!!normalizedOptions.login})...`,
      timestamp: new Date().toISOString(),
    });

    const runnerPath = path.resolve(__dirname, '../../scraper/runner.cjs');
    // Packaged application files live inside app.asar, which is not a real
    // directory and cannot be used as a child process working directory.
    const workerCwd = runtimeDataDir;
    if (!fs.existsSync(runnerPath)) {
      const error = new Error(`SCRAPER_RUNNER_NOT_FOUND: Scraper runner was not found at ${runnerPath}`);
      this.setState(SCRAPER_STATES.FAILED, error.message);
      throw error;
    }
    const runnerArgs = [];
    if (normalizedOptions.login) runnerArgs.push('--login');
    if (plan.scope.type === 'single' && plan.scope.targetCategoryId) {
      runnerArgs.push('--category', plan.scope.targetCategoryId);
    }
    if (plan.mode === 'full') runnerArgs.push('--full');
    if (plan.refresh.images) runnerArgs.push('--refresh-screenshots');
    if (plan.refresh.size) runnerArgs.push('--refresh-sizes');
    if (plan.refresh.files) runnerArgs.push('--refresh-files');
    if (normalizedOptions.headed || normalizedOptions.headless === false) runnerArgs.push('--headed');

    let resolveVerificationReady;
    let rejectVerificationReady;
    let verificationReadySettled = false;
    const verificationReady = normalizedOptions.login
      ? new Promise((resolve, reject) => {
        resolveVerificationReady = resolve;
        rejectVerificationReady = reject;
      })
      : null;
    const settleVerificationReady = (error) => {
      if (!verificationReady || verificationReadySettled) return;
      verificationReadySettled = true;
      if (error) rejectVerificationReady(error);
      else resolveVerificationReady({ success: true, verificationWindowOpened: true });
    };

    try {
      this.childProcess = fork(runnerPath, runnerArgs, {
        cwd: workerCwd,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          SCRAPER_LOCK_FILE: lockFile,
          SCRAPER_PROFILE_DIR: this.getScraperProfilePath(),
          ...(app?.isPackaged ? { DATA_DIR: path.join(runtimeDataDir, 'catalogs') } : {}),
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      // IPC message handling (Primary log & event stream)
      this.childProcess.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case SCRAPER_IPC_MESSAGES.STATE_CHANGED:
            this.setState(msg.payload.state, msg.payload.error, msg.payload.details || null);
            if (normalizedOptions.login && msg.payload.state === SCRAPER_STATES.VERIFYING && msg.payload.details?.categoryId) {
              settleVerificationReady(null);
            } else if (normalizedOptions.login && msg.payload.state === SCRAPER_STATES.FAILED) {
              settleVerificationReady(new Error(msg.payload.error || 'Verification window failed to start.'));
            }
            break;

          case SCRAPER_IPC_MESSAGES.PROGRESS:
            this.progress = {
              ...this.progress,
              ...msg.payload,
              elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
            };
            this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PROGRESS, this.progress);
            break;

          case SCRAPER_IPC_MESSAGES.LOG:
            this.addLog(msg.payload);
            break;

          case SCRAPER_IPC_MESSAGES.BATCH:
            try {
              const nativeDb = dbMain.getDatabase();
              const { categoryId, categoryName, baseUrl, titleSearch, items: batchRawItems } = msg.payload;
              if (nativeDb && categoryId && Array.isArray(batchRawItems) && batchRawItems.length > 0) {
                const ingestion = ingestRawBatch(nativeDb, {
                  id: categoryId,
                  name: categoryName || categoryId,
                  baseUrl: baseUrl || null,
                  titleSearch: titleSearch || null,
                  filePath: '',
                }, batchRawItems);
                const inserted = ingestion.written;

                this.progress = {
                  ...this.progress,
                  category: categoryId,
                  categoryName: categoryName || categoryId,
                  totalItems: (this.progress?.totalItems || 0) + inserted,
                  newItems: (this.progress?.newItems || 0) + inserted,
                };
                this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PROGRESS, this.progress);
                this.addLog({
                  level: 'info',
                  message: `[MANAGER][DB] Persisted batch of ${inserted} items for "${categoryId}" directly into SQLite.`,
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (dbErr) {
              console.error('[MANAGER][DB][ERROR] Failed to persist scraper batch to SQLite:', dbErr.message);
              this.addLog({
                level: 'error',
                message: `[MANAGER][DB] Error saving batch to SQLite: ${dbErr.message}`,
                timestamp: new Date().toISOString(),
              });
            }
            break;

          case SCRAPER_IPC_MESSAGES.FINISHED:
            try {
              const nativeDb = dbMain.getDatabase();
              if (msg.payload.success && nativeDb) {
                const totalCount = itemsRepo.getTotalItemCount(nativeDb);
                if (totalCount > 0) {
                  appStateRepo.setAppState(nativeDb, 'initial_scan_completed', 'true');
                }
              }
            } catch (_) {}

            this.addLog({
              level: msg.payload.success ? 'info' : 'error',
              message: msg.payload.success
                ? `[MANAGER] Scraper finished successfully (jobId=${jobId}). Items persisted to SQLite.`
                : `[MANAGER] Scraper finished with status: ${msg.payload.error}`,
              timestamp: new Date().toISOString(),
            });
            break;
        }
      });

      this.childProcess.on('exit', (code, signal) => {
        const finishedOptions = this.currentOptions;
        this.addLog({ level: code === 0 ? 'info' : 'warn', message: `[SCRAPER_STOPPED] code=${code} signal=${signal || 'none'} state=${this.state}`, timestamp: new Date().toISOString() });
        this.addLog({
          level: code === 0 ? 'info' : 'warn',
          message: `[MANAGER] Scraper worker process exited (code=${code}, signal=${signal}).`,
          timestamp: new Date().toISOString(),
        });

        this.cleanup();

        if (this.state === SCRAPER_STATES.CANCELLING) {
          this.setState(SCRAPER_STATES.IDLE);
        } else if (code !== 0 && ![SCRAPER_STATES.SESSION_REQUIRED, SCRAPER_STATES.INTERACTION_REQUIRED].includes(this.state)) {
          this.setState(SCRAPER_STATES.FAILED, `Process exited with code ${code}`);
        } else if (this.state === SCRAPER_STATES.RUNNING || this.state === SCRAPER_STATES.STARTING) {
          this.setState(SCRAPER_STATES.COMPLETED);
        }
        this.currentOptions = null;
        if (normalizedOptions.login && !verificationReadySettled) {
          settleVerificationReady(new Error(`Verification worker exited before opening the browser (code=${code}, signal=${signal || 'none'}).`));
        }
        if (code === 0 && finishedOptions?.login && this.state === SCRAPER_STATES.COMPLETED) {
          const pendingIntent = this.pendingScanIntent;
          const reprobeOptions = { category: finishedOptions.category || 'all' };
          this.setState(SCRAPER_STATES.REPROBING, null, { categoryId: finishedOptions.category || null, pendingScan: !!pendingIntent });
          this.addLog({ level: 'info', message: `[SCRAPER][VERIFY] starting headless reprobe category=${finishedOptions.category || 'all'} profile=${this.getScraperProfilePath()}`, timestamp: new Date().toISOString() });
          this.probeAccess(reprobeOptions, { internal: true }).then(async (result) => {
            this.addLog({ level: result.scanReady ? 'info' : 'warn', message: `[SCRAPER][VERIFY] reprobe result=${result.status}`, timestamp: new Date().toISOString() });
            if (!pendingIntent) {
              this.setState(result.status === 'INTERACTION_REQUIRED' ? SCRAPER_STATES.INTERACTION_REQUIRED : SCRAPER_STATES.IDLE, null, result);
              return;
            }
            if (result.scanReady) {
              this.pendingScanIntent = null;
              this.addLog({ level: 'info', message: '[SCRAPER][LIFECYCLE] resuming pending initial scan after successful verification.', timestamp: new Date().toISOString() });
              this.setState(SCRAPER_STATES.IDLE, null, { pendingScan: false });
              await this.start(pendingIntent.options, { preflightValidated: true });
            } else {
              this.setState(result.status === 'INTERACTION_REQUIRED' ? SCRAPER_STATES.INTERACTION_REQUIRED : SCRAPER_STATES.SESSION_REQUIRED, null, { ...result, pendingScan: true });
            }
          }).catch((error) => {
            this.addLog({ level: 'warn', message: `[SESSION_PROBE_RESULT] category=${finishedOptions.category || 'all'} error=${error.message}`, timestamp: new Date().toISOString() });
            if (pendingIntent) this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, error.message, { pendingScan: true });
          });
        }
      });

      this.childProcess.on('error', (err) => {
        this.addLog({
          level: 'error',
          message: `[MANAGER] Scraper worker process error: ${err.message}`,
          timestamp: new Date().toISOString(),
        });
        this.cleanup();
        this.setState(SCRAPER_STATES.FAILED, err.message);
        settleVerificationReady(err);
      });

      // Retrieve known topic IDs from SQLite for incremental scan
      const nativeDb = dbMain.getDatabase();
      const targetCatId = plan.scope.type === 'single' ? plan.scope.targetCategoryId : null;
      const knownTopicIds = nativeDb ? itemsRepo.getKnownTopicIds(nativeDb, 'rutracker', targetCatId) : [];

      // Send start command to child process
      this.childProcess.send({
        command: SCRAPER_IPC_MESSAGES.START_COMMAND,
        options: {
          login: normalizedOptions.login || false,
          headed: normalizedOptions.login ? true : (normalizedOptions.headed || false),
          full: plan.mode === 'full',
          category: targetCatId,
          refreshScreenshots: plan.refresh.images,
          refreshSizes: plan.refresh.size,
          refreshFiles: plan.refresh.files,
          dataDir: normalizedOptions.dataDir || null,
          knownTopicIds,
        },
      });

      this.addLog({ level: 'info', message: `[SCRAPER_STARTED] jobId=${jobId} scope=${plan.scope.type}`, timestamp: new Date().toISOString() });

      if (verificationReady) {
        let startupTimer;
        try {
          await Promise.race([
            verificationReady,
            new Promise((_, reject) => {
              startupTimer = setTimeout(() => {
                try { this.childProcess?.send({ command: SCRAPER_IPC_MESSAGES.CANCEL_COMMAND }); } catch (_) {}
                reject(new Error('VERIFICATION_WINDOW_START_TIMEOUT: The browser did not reach the verification page in time.'));
              }, 45000);
            }),
          ]);
        } finally {
          clearTimeout(startupTimer);
        }
        return { success: true, verificationWindowOpened: true };
      }

      return { success: true };
    } catch (err) {
      this.cleanup();
      this.setState(SCRAPER_STATES.FAILED, err.message);
      throw err;
    }
  }

  async startWithCompanion(plan, normalizedOptions, jobId) {
    this.isCompanionScanning = true;
    this.isCancelledFlag = false;
    this.isPausedFlag = false;
    this.setState(SCRAPER_STATES.RUNNING);
    this.addLog({
      level: 'info',
      message: `[MANAGER] Launching scraper via Browser Companion (jobId=${jobId}, scope=${plan.scope.type}, target=${plan.scope.targetCategoryId || 'all'}, mode=${plan.mode})...`,
      timestamp: new Date().toISOString(),
    });

    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    const nativeDb = dbMain.getDatabase();
    let syncRunId = null;
    if (nativeDb) {
      try {
        syncRunId = syncHistoryRepo.createRun(nativeDb, {
          mode: plan.mode === 'full' ? 'FULL_SCAN' : (plan.mode === 'refresh' ? 'REFRESH' : 'INCREMENTAL'),
          transport: 'BROWSER_COMPANION',
          scopeType: plan.scope.type === 'single' ? 'SINGLE_CATEGORY' : 'ALL_ENABLED_CATEGORIES',
          scopeCategoryId: plan.scope.type === 'single' ? plan.scope.targetCategoryId : null,
          triggerType: normalizedOptions?.triggerType || (plan.mode === 'initial' ? 'FIRST_RUN' : 'MANUAL'),
          categoriesTotal: plan.scope.categories?.length || 1,
        });
        this.currentSyncRunId = syncRunId;
      } catch (err) {
        console.warn('[MANAGER] Failed to create sync run record:', err.message);
      }
    }

    try {
      const { scanLibrary } = require('./scanEngine.cjs');
      const result = await scanLibrary({
        transport: this.companionTransport,
        plan,
        db: nativeDb,
        syncRunId,
        onProgress: (p) => {
          this.progress = {
            ...this.progress,
            ...p,
            elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
          };
          this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PROGRESS, this.progress);
        },
        onStatus: (s) => this.setState(s),
        onLog: (l) => this.addLog(l),
        onPageCommitted: (data) => {
          this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PAGE_COMMITTED, data);
        },
        isCancelled: () => this.isCancelledFlag,
        isPaused: () => this.isPausedFlag,
      });

      if (this.isCancelledFlag || result.cancelled) {
        this.addLog({ level: 'info', message: '[MANAGER] Scraper scan cancelled.', timestamp: new Date().toISOString() });
        this.setState(SCRAPER_STATES.IDLE);
        return { success: false, cancelled: true };
      }

      this.addLog({
        level: 'info',
        message: `[MANAGER] Scraper finished successfully via Browser Companion (jobId=${jobId}). ${result.totalItems} items saved to SQLite.`,
        timestamp: new Date().toISOString(),
      });
      this.broadcast(SCRAPER_IPC_MESSAGES.FINISHED, {
        success: true,
        totalItems: result.totalItems,
        categoriesCount: result.categoriesCount,
      });
      if (syncRunId) {
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_RUN_FINALIZED, {
          runId: syncRunId,
          status: result.status || 'COMPLETED',
          newItems: result.newItems || 0,
          updatedItems: result.updatedItems || 0,
          savedItems: result.totalItems || 0,
          categoriesCompleted: result.categoriesCount || 0,
          categoriesTotal: plan.scope.categories.length,
          errorCode: null,
          errorSummary: null,
          cancelledByUser: false,
        });
      }
      this.setState(SCRAPER_STATES.COMPLETED);
      return { success: true, ...result };
    } catch (err) {
      if (err.code === 'INTERACTION_REQUIRED' || err.status === 'CHALLENGE_REQUIRED') {
        this.addLog({ level: 'warn', message: `[MANAGER] Verification required for category "${err.categoryId || ''}".`, timestamp: new Date().toISOString() });
        this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, err.message, { categoryId: err.categoryId });
        return { success: false, blocked: true, status: 'INTERACTION_REQUIRED', categoryId: err.categoryId };
      }
      this.addLog({ level: 'error', message: `[MANAGER] Scraper failed: ${err.message}`, timestamp: new Date().toISOString() });
      if (syncRunId && nativeDb) {
        try {
          syncHistoryRepo.finishRun(nativeDb, syncRunId, {
            status: 'FAILED',
            finishedAt: new Date().toISOString(),
            durationMs: this.startTime ? Date.now() - this.startTime : 0,
            errorCode: err.code || 'FAILED',
            errorSummary: err.message,
          });
        } catch (_) {}
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_RUN_FINALIZED, {
          runId: syncRunId,
          status: 'FAILED',
          newItems: this.progress?.newItems || 0,
          updatedItems: this.progress?.updatedItems || 0,
          savedItems: this.progress?.processedItems || 0,
          categoriesCompleted: 0,
          categoriesTotal: 1,
          errorCode: err.code || 'FAILED',
          errorSummary: err.message,
          cancelledByUser: false,
        });
      }
      this.broadcast(SCRAPER_IPC_MESSAGES.FINISHED, { success: false, error: err.message });
      this.setState(SCRAPER_STATES.FAILED, err.message);
      throw err;
    } finally {
      this.isCompanionScanning = false;
      this.currentSyncRunId = null;
      this.activeJobTransport = null;
    }
  }

  async startWithEmbedded(plan, normalizedOptions, jobId) {
    const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
    if (!this.embeddedTransport) {
      this.embeddedTransport = new EmbeddedElectronTransport();
    }
    this.isEmbeddedScanning = true;
    this.isCancelledFlag = false;
    this.isPausedFlag = false;
    this.isVerificationWaiting = false;
    this.startTime = Date.now();
    this.setState(SCRAPER_STATES.RUNNING);
    this.progress = {
      ...this.progress,
      elapsedMs: 0,
    };
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
    }
    this._progressTimer = setInterval(() => {
      if (this.isEmbeddedScanning && !this.isPausedFlag && !this.isVerificationWaiting) {
        this.progress = {
          ...this.progress,
          elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
        };
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PROGRESS, this.progress);
      }
    }, 1000);

    this.addLog({
      level: 'info',
      message: `[MANAGER] Launching scraper via Embedded Electron (jobId=${jobId}, scope=${plan.scope.type}, target=${plan.scope.targetCategoryId || 'all'}, mode=${plan.mode})...`,
      timestamp: new Date().toISOString(),
    });

    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    const nativeDb = dbMain.getDatabase();
    let syncRunId = null;
    if (nativeDb) {
      try {
        syncRunId = syncHistoryRepo.createRun(nativeDb, {
          mode: plan.mode === 'full' ? 'FULL_SCAN' : (plan.mode === 'refresh' ? 'REFRESH' : 'INCREMENTAL'),
          transport: 'EMBEDDED_ELECTRON',
          scopeType: plan.scope.type === 'single' ? 'SINGLE_CATEGORY' : 'ALL_ENABLED_CATEGORIES',
          scopeCategoryId: plan.scope.type === 'single' ? plan.scope.targetCategoryId : null,
          triggerType: normalizedOptions?.triggerType || (plan.mode === 'initial' ? 'FIRST_RUN' : 'MANUAL'),
          categoriesTotal: plan.scope.categories?.length || 1,
        });
        this.currentSyncRunId = syncRunId;
      } catch (err) {
        console.warn('[MANAGER] Failed to create sync run record:', err.message);
      }
    }

    try {
      const { scanLibrary } = require('./scanEngine.cjs');
      const result = await scanLibrary({
        transport: this.embeddedTransport,
        plan,
        db: nativeDb,
        syncRunId,
        onProgress: (p) => {
          this.progress = {
            ...this.progress,
            ...p,
            elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
          };
          this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PROGRESS, this.progress);
        },
        onStatus: (s) => this.setState(s),
        onLog: (l) => this.addLog(l),
        onPageCommitted: (data) => {
          this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_PAGE_COMMITTED, data);
        },
        onVerificationRequired: async ({ category, pageNum, error }) => {
          this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, error.message, {
            categoryId: category?.id,
            categoryName: category?.name,
            transport: 'EMBEDDED_ELECTRON',
            pageNum,
          });

          return new Promise((resolve, reject) => {
            if (!Array.isArray(this._verificationResolvers)) {
              this._verificationResolvers = [];
              this._verificationRejecters = [];
            }
            this._verificationResolvers.push(resolve);
            this._verificationRejecters.push(reject);

            if (!this.isVerificationWaiting) {
              this.isVerificationWaiting = true;
              this.addLog({
                level: 'warn',
                message: `[MANAGER] Cloudflare challenge encountered for "${category?.name || category?.id}" (page ${pageNum}). Opening in-app verification window...`,
                timestamp: new Date().toISOString(),
              });

              // Automatically launch in-app verification window so the user sees and solves challenge
              this.openEmbeddedVerification({
                categoryId: category?.id,
                url: category?.baseUrl,
              }).catch((err) => {
                this.addLog({
                  level: 'warn',
                  message: `[MANAGER] In-app verification closed: ${err.message}`,
                  timestamp: new Date().toISOString(),
                });
                if (err.code === 'VERIFICATION_LOOP') {
                  this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, 'Built-in verification could not be completed.', {
                    categoryId: category?.id,
                    categoryName: category?.name,
                    transport: 'EMBEDDED_ELECTRON',
                    pageNum,
                    verificationOutcome: 'VERIFICATION_LOOP',
                    isVerificationLoop: true,
                  });
                }
                const rejecters = (this._verificationRejecters || []).splice(0);
                this._verificationResolvers = [];
                this._verificationResolver = null;
                this._verificationRejecter = null;
                this.isVerificationWaiting = false;
                for (const rej of rejecters) {
                  try { rej(err); } catch (_) {}
                }
              });
            }
          });
        },
        isCancelled: () => this.isCancelledFlag,
        isPaused: () => this.isPausedFlag,
      });

      if (this.isCancelledFlag || result.cancelled) {
        this.addLog({ level: 'info', message: '[MANAGER] Scraper scan cancelled.', timestamp: new Date().toISOString() });
        this.setState(SCRAPER_STATES.IDLE);
        return { success: false, cancelled: true };
      }

      this.addLog({
        level: 'info',
        message: `[MANAGER] Scraper finished successfully via Embedded Electron (jobId=${jobId}). ${result.totalItems} items saved to SQLite.`,
        timestamp: new Date().toISOString(),
      });
      this.broadcast(SCRAPER_IPC_MESSAGES.FINISHED, {
        success: true,
        totalItems: result.totalItems,
        categoriesCount: result.categoriesCount,
      });
      if (syncRunId) {
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_RUN_FINALIZED, {
          runId: syncRunId,
          status: result.status || 'COMPLETED',
          newItems: result.newItems || 0,
          updatedItems: result.updatedItems || 0,
          savedItems: result.totalItems || 0,
          categoriesCompleted: result.categoriesCount || 0,
          categoriesTotal: plan.scope.categories.length,
          errorCode: null,
          errorSummary: null,
          cancelledByUser: false,
        });
      }
      this.setState(SCRAPER_STATES.COMPLETED);
      return { success: true, ...result };
    } catch (err) {
      if (err.code === 'VERIFICATION_LOOP') {
        this.addLog({ level: 'error', message: `[MANAGER] In-app verification loop encountered: ${err.message}`, timestamp: new Date().toISOString() });
        this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, 'Built-in verification could not be completed.', {
          categoryId: err.categoryId,
          transport: 'EMBEDDED_ELECTRON',
          verificationOutcome: 'VERIFICATION_LOOP',
          isVerificationLoop: true,
        });
        return { success: false, blocked: true, status: 'VERIFICATION_LOOP', categoryId: err.categoryId };
      }
      if (err.code === 'INTERACTION_REQUIRED' || err.status === 'CHALLENGE_REQUIRED') {
        this.addLog({ level: 'warn', message: `[MANAGER] Verification required for category "${err.categoryId || ''}".`, timestamp: new Date().toISOString() });
        this.setState(SCRAPER_STATES.INTERACTION_REQUIRED, err.message, { categoryId: err.categoryId, transport: 'EMBEDDED_ELECTRON' });
        return { success: false, blocked: true, status: 'INTERACTION_REQUIRED', categoryId: err.categoryId };
      }
      this.addLog({ level: 'error', message: `[MANAGER] Scraper failed: ${err.message}`, timestamp: new Date().toISOString() });
      if (syncRunId && nativeDb) {
        try {
          syncHistoryRepo.finishRun(nativeDb, syncRunId, {
            status: 'FAILED',
            finishedAt: new Date().toISOString(),
            durationMs: this.startTime ? Date.now() - this.startTime : 0,
            errorCode: err.code || 'FAILED',
            errorSummary: err.message,
          });
        } catch (_) {}
        this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_RUN_FINALIZED, {
          runId: syncRunId,
          status: 'FAILED',
          newItems: this.progress?.newItems || 0,
          updatedItems: this.progress?.updatedItems || 0,
          savedItems: this.progress?.processedItems || 0,
          categoriesCompleted: 0,
          categoriesTotal: 1,
          errorCode: err.code || 'FAILED',
          errorSummary: err.message,
          cancelledByUser: false,
        });
      }
      this.broadcast(SCRAPER_IPC_MESSAGES.FINISHED, { success: false, error: err.message });
      this.setState(SCRAPER_STATES.FAILED, err.message);
      throw err;
    } finally {
      if (this._progressTimer) {
        clearInterval(this._progressTimer);
        this._progressTimer = null;
      }
      if (this.embeddedTransport) {
        try { this.embeddedTransport.dispose(); } catch (_) {}
        this.embeddedTransport = null;
      }
      this.isEmbeddedScanning = false;
      this.currentSyncRunId = null;
      this.activeJobTransport = null;
      this._verificationResolver = null;
      this._verificationRejecter = null;
      this.isVerificationWaiting = false;
    }
  }

  async openEmbeddedVerification(options = {}) {
    if (!this.embeddedTransport) {
      const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
      this.embeddedTransport = new EmbeddedElectronTransport();
    }
    const { CategoryManager } = require('./categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories();
    const targetCategory = options.categoryId
      ? categories.find(c => c.id === options.categoryId)
      : (categories.find(c => c.enabled !== false) || categories[0]);
    const targetUrl = options.url || targetCategory?.baseUrl || 'https://rutracker.org/forum/index.php';

    this.addLog({
      level: 'info',
      message: `[MANAGER] Opening in-app verification window for ${targetUrl}...`,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await this.embeddedTransport.openVerificationWindow(targetUrl, options);
      this.addLog({
        level: 'info',
        message: '[MANAGER] In-app verification completed successfully. Forum access confirmed.',
        timestamp: new Date().toISOString(),
      });

      // If a scan job is paused waiting for verification, resume all waiting workers exactly once (Rule 14 resumeGeneration)
      if (this.isVerificationWaiting && (this._verificationResolver || (Array.isArray(this._verificationResolvers) && this._verificationResolvers.length > 0))) {
        this._resumeGeneration = (this._resumeGeneration || 0) + 1;
        const currentGen = this._resumeGeneration;
        const resolvers = Array.isArray(this._verificationResolvers) ? this._verificationResolvers.splice(0) : [];
        if (this._verificationResolver) {
          resolvers.push(this._verificationResolver);
          this._verificationResolver = null;
        }
        this._verificationRejecters = [];
        this._verificationRejecter = null;
        this.isVerificationWaiting = false;
        this.setState(SCRAPER_STATES.RUNNING);
        for (const resolver of resolvers) {
          try { resolver({ resumed: true, resumeGeneration: currentGen }); } catch (_) {}
        }
      }

      return { success: true, status: 'FORUM_READY' };
    } catch (err) {
      this.addLog({
        level: 'warn',
        message: `[MANAGER] In-app verification window closed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  async probeEmbeddedAccess(options = {}) {
    if (!this.embeddedTransport) {
      const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
      this.embeddedTransport = new EmbeddedElectronTransport();
    }
    const { CategoryManager } = require('./categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories();
    const targetCategory = options.categoryId
      ? categories.find(c => c.id === options.categoryId)
      : (categories.find(c => c.enabled !== false) || categories[0]);

    return await this.embeddedTransport.checkAccess(targetCategory);
  }

  async resetEmbeddedSession() {
    if (!this.embeddedTransport) {
      const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
      this.embeddedTransport = new EmbeddedElectronTransport();
    }
    return await this.embeddedTransport.resetSession();
  }

  getEmbeddedStatus() {
    if (this.embeddedTransport) {
      return this.embeddedTransport.getStatus();
    }
    const { EmbeddedElectronTransport } = require('./embeddedElectronTransport.cjs');
    const temp = new EmbeddedElectronTransport();
    return temp.getStatus();
  }

  async renewSession(options = {}) {
    const isChildAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;
    if (isChildAlive || this.isProfileBusy()) {
      throw new Error('SCRAPER_BUSY: A scraper or session renewal job is already running.');
    }

    const { CategoryManager } = require('./categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories().filter((category) => category.enabled !== false);
    const targetCategory = options.category
      || this.access.results.find((result) => result.status === ACCESS_STATUSES.INTERACTION_REQUIRED || result.status === ACCESS_STATUSES.AUTH_REQUIRED)?.categoryId
      || categories[0]?.id;
    if (!targetCategory) throw new Error('No enabled category is available for session verification.');

    return await this.start({
      ...options,
      category: targetCategory,
      login: true,
      headed: true,
    });
  }

  pause() {
    if ((this.isCompanionScanning || this.isEmbeddedScanning) && !this.isPausedFlag) {
      this.isPausedFlag = true;
      this.setState(SCRAPER_STATES.PAUSED);
      this.addLog({ level: 'info', message: '[MANAGER] Scraper scan paused by user.', timestamp: new Date().toISOString() });
      return { success: true };
    }
    return { success: false, message: 'Scraper is not running or already paused.' };
  }

  resume() {
    if (this.isVerificationWaiting && (this._verificationResolver || (Array.isArray(this._verificationResolvers) && this._verificationResolvers.length > 0))) {
      this._resumeGeneration = (this._resumeGeneration || 0) + 1;
      const currentGen = this._resumeGeneration;
      const resolvers = Array.isArray(this._verificationResolvers) ? this._verificationResolvers.splice(0) : [];
      if (this._verificationResolver) {
        resolvers.push(this._verificationResolver);
        this._verificationResolver = null;
      }
      this._verificationRejecters = [];
      this._verificationRejecter = null;
      this.isVerificationWaiting = false;
      this.setState(SCRAPER_STATES.RUNNING);
      this.addLog({ level: 'info', message: '[MANAGER] Scraper scan resumed after verification.', timestamp: new Date().toISOString() });
      for (const resolver of resolvers) {
        try { resolver({ resumed: true, resumeGeneration: currentGen }); } catch (_) {}
      }
      return { success: true };
    }
    if ((this.isCompanionScanning || this.isEmbeddedScanning) && this.isPausedFlag) {
      this.isPausedFlag = false;
      this.setState(SCRAPER_STATES.RUNNING);
      this.addLog({ level: 'info', message: '[MANAGER] Scraper scan resumed.', timestamp: new Date().toISOString() });
      return { success: true };
    }
    return { success: false, message: 'Scraper is not paused.' };
  }

  async cancel() {
    const hadPendingScan = !!this.pendingScanIntent;
    this.pendingScanIntent = null;
    this.isPausedFlag = false;
    const cancelledRunId = this.currentSyncRunId;
    this.currentSyncRunId = null;

    if (this._verificationRejecter || (Array.isArray(this._verificationRejecters) && this._verificationRejecters.length > 0)) {
      const rejecters = Array.isArray(this._verificationRejecters) ? this._verificationRejecters.splice(0) : [];
      if (this._verificationRejecter) {
        rejecters.push(this._verificationRejecter);
        this._verificationRejecter = null;
      }
      this._verificationResolvers = [];
      this._verificationResolver = null;
      this.isVerificationWaiting = false;
      for (const rej of rejecters) {
        try { rej(new Error('CANCELLED: Scraper job cancelled by user.')); } catch (_) {}
      }
    }

    if (cancelledRunId) {
      const nativeDb = dbMain.getDatabase();
      if (nativeDb) {
        try {
          const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
          syncHistoryRepo.finishRun(nativeDb, cancelledRunId, {
            status: 'CANCELLED',
            finishedAt: new Date().toISOString(),
            durationMs: this.startTime ? Date.now() - this.startTime : 0,
            cancelledByUser: true,
          });
        } catch (_) {}
      }
      this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_RUN_FINALIZED, {
        runId: cancelledRunId,
        status: 'CANCELLED',
        newItems: this.progress?.newItems || 0,
        updatedItems: this.progress?.updatedItems || 0,
        savedItems: this.progress?.processedItems || 0,
        categoriesCompleted: 0,
        categoriesTotal: 1,
        errorCode: null,
        errorSummary: 'Cancelled by user',
        cancelledByUser: true,
      });
    }

    if (this.isCompanionScanning) {
      this.isCancelledFlag = true;
      this.companionTransport?.cancel();
      this.setState(SCRAPER_STATES.IDLE);
      return { success: true };
    }
    if (this.isEmbeddedScanning) {
      this.isCancelledFlag = true;
      this.embeddedTransport?.cancel();
      if (this.isVerificationWaiting && (this._verificationRejecter || (Array.isArray(this._verificationRejecters) && this._verificationRejecters.length > 0))) {
        const rejecters = Array.isArray(this._verificationRejecters) ? this._verificationRejecters.splice(0) : [];
        if (this._verificationRejecter) {
          rejecters.push(this._verificationRejecter);
          this._verificationRejecter = null;
        }
        this._verificationResolvers = [];
        this._verificationResolver = null;
        this.isVerificationWaiting = false;
        for (const rej of rejecters) {
          try { rej(Object.assign(new Error('CANCELLED'), { code: 'CANCELLED' })); } catch (_) {}
        }
      }
      this.setState(SCRAPER_STATES.IDLE);
      return { success: true };
    }
    if (this.probeSession) {
      this.probeCancelled = true;
      this.setState(SCRAPER_STATES.CANCELLING);
      try { await this.probeSession.close('cancelled'); } catch (_) {}
      return { success: true };
    }
    if (!this.childProcess || ![SCRAPER_STATES.STARTING, SCRAPER_STATES.VERIFYING, SCRAPER_STATES.REPROBING, SCRAPER_STATES.RUNNING].includes(this.state)) {
      if (hadPendingScan) {
        this.setState(SCRAPER_STATES.IDLE, null, { pendingScan: false });
        return { success: true };
      }
      return { success: false, message: 'Scraper is not running.' };
    }

    this.setState(SCRAPER_STATES.CANCELLING);
    this.addLog({
      level: 'warn',
      message: '[MANAGER] Cancellation requested. Sending stop signal to scraper worker...',
      timestamp: new Date().toISOString(),
    });

    try {
      this.childProcess.send({ command: SCRAPER_IPC_MESSAGES.CANCEL_COMMAND });
    } catch (_) {}

    // Allow the worker to close its Playwright context and Chromium process cleanly.
    this.cancelTimer = setTimeout(() => {
      if (this.childProcess) {
        this.addLog({
          level: 'warn',
          message: '[MANAGER] Grace period expired (15s). Requesting worker termination...',
          timestamp: new Date().toISOString(),
        });
        try {
          this.childProcess.kill('SIGTERM');
        } catch (_) {}
      }
    }, 15000);

    return { success: true };
  }

  cleanup() {
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
      this.cancelTimer = null;
    }
    if (this.embeddedTransport) {
      try { this.embeddedTransport.dispose(); } catch (_) {}
      this.embeddedTransport = null;
    }
    this.childProcess = null;
  }

  async clearScraperStorage() {
    if (this.isProfileBusy()) throw new Error('SCRAPER_BUSY: The persistent scraper profile is in use.');
    this.addLog({
      level: 'info',
      message: '[MANAGER] Clearing scraper IndexedDB cache...',
      timestamp: new Date().toISOString(),
    });

    const { ScraperBrowserSession } = require('../../scraper/browserSession.cjs');
    const { injectConsoleScript } = require('../../scraper/scraperBridge.cjs');

    let context;
    try {
      context = new ScraperBrowserSession({ userDataDir: this.getScraperProfilePath(), mode: 'storage_cleanup' });
      await context.start({ headless: true });
      const page = context.page;
      await context.navigate('https://rutracker.org/forum/index.php', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await injectConsoleScript(page);
      await page.evaluate(() => window.EcoHubScraper.clearStorage());
      this.addLog({
        level: 'info',
        message: '[MANAGER] Scraper IndexedDB cache cleared successfully.',
        timestamp: new Date().toISOString(),
      });
      return { success: true };
    } catch (err) {
      this.addLog({
        level: 'error',
        message: `[MANAGER] Failed to clear scraper cache: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      throw err;
    } finally {
      if (context) {
        await context.close('storage_cleanup');
      }
    }
  }

  async reindexLibrary() {
    this.addLog({
      level: 'info',
      message: '[MANAGER] Re-indexing local JSON catalog files to native SQLite...',
      timestamp: new Date().toISOString(),
    });

    const workerManager = require('../indexer/workerManager.cjs');
    const dbMain = require('../database/dbMain.cjs');
    const nativeDb = dbMain.getDatabase();

    if (!nativeDb) {
      throw new Error('Database not initialized');
    }

    const path = require('path');
    const fs = require('fs');
    const rootDir = path.resolve(__dirname, '../..');

    try {
      const summary = await workerManager.startIndexing(nativeDb, rootDir, (progress) => {
        this.addLog({
          level: 'info',
          message: `[REINDEX] ${progress.message || `Indexed ${progress.itemsProcessed || 0} items`}`,
          timestamp: new Date().toISOString(),
        });
      });

      this.addLog({
        level: 'info',
        message: '[REINDEX] Library re-indexing completed successfully.',
        timestamp: new Date().toISOString(),
      });
      return { success: true, count: summary?.totalItems || 0 };
    } catch (err) {
      this.addLog({
        level: 'error',
        message: `[REINDEX] Library re-indexing failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  async getCurrentLog() {
    const targetPath = this.currentLogPath || this.lastLogPath;
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        return fs.readFileSync(targetPath, 'utf8');
      } catch (err) {
        console.error('[MANAGER] Failed to read log file:', err);
      }
    }
    // Fallback to memory buffer if file not available
    return this.logs.map((l) => `${l.timestamp} [${l.level?.toUpperCase() || 'INFO'}] ${l.message}`).join('\n');
  }

  async exportLog() {
    const targetPath = this.currentLogPath || this.lastLogPath;
    let defaultFilename = `rt-library-scraper-${new Date().toISOString().slice(0, 10)}.log`;
    if (targetPath) {
      defaultFilename = `rt-library-scraper-${path.basename(targetPath)}`;
    }

    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Scraper Execution Log',
      defaultPath: defaultFilename,
      filters: [
        { name: 'Log files', extensions: ['log', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    try {
      if (targetPath && fs.existsSync(targetPath)) {
        fs.copyFileSync(targetPath, filePath);
      } else {
        const content = await this.getCurrentLog();
        fs.writeFileSync(filePath, content, 'utf8');
      }
      return { success: true, filePath };
    } catch (err) {
      console.error('[MANAGER] Failed to export log file:', err);
      return { success: false, error: err.message };
    }
  }

  async openLogsFolder() {
    const logsDir = this.getLogsDir();
    try {
      await shell.openPath(logsDir);
      return { success: true, path: logsDir };
    } catch (err) {
      console.error('[MANAGER] Failed to open logs folder:', err);
      return { success: false, error: err.message };
    }
  }

  getSyncHistory(options = {}) {
    const db = dbMain.getDatabase();
    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    return syncHistoryRepo.getRuns(db, options);
  }

  getSyncRunDetails(runId) {
    const db = dbMain.getDatabase();
    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    return syncHistoryRepo.getRunDetails(db, runId);
  }

  getSyncHealth() {
    const db = dbMain.getDatabase();
    const { CategoryManager } = require('./categoryManager.cjs');
    const categories = CategoryManager.getInstance().getResolvedCategories();
    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    return syncHistoryRepo.getSyncHealth(db, categories);
  }

  clearSyncHistory() {
    const db = dbMain.getDatabase();
    const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
    return syncHistoryRepo.clearHistory(db);
  }
}

module.exports = ScraperManager;
