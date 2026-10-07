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
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const appStateRepo = require('../database/repositories/appStateRepo.cjs');
const normalize = require('../indexer/normalize.cjs');
const { normalizeScraperOptions, createExecutionPlan } = require('./executionPlan.cjs');

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

  setState(newState, error = null) {
    this.state = newState;
    const payload = { state: this.state, error };
    this.broadcast(SCRAPER_IPC_MESSAGES.EVENT_STATE_CHANGED, payload);
  }

  getState() {
    return {
      state: this.state,
      progress: this.progress,
      logs: this.logs,
      isRunning: [SCRAPER_STATES.STARTING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(this.state),
      startTime: this.startTime,
    };
  }

  async start(options = {}) {
    // Verify if worker process is genuinely alive
    const isChildAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;

    if (isChildAlive && [SCRAPER_STATES.STARTING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(this.state)) {
      throw new Error('SCRAPER_ALREADY_RUNNING: Scraper process is already executing.');
    }

    if (this.childProcess) {
      try {
        this.childProcess.kill('SIGKILL');
      } catch (_) {}
      this.cleanup();
    }

    // Auto-clean stale lock file
    const fs = require('fs');
    const lockFile = path.resolve(__dirname, '../../scraper.lock');
    if (fs.existsSync(lockFile)) {
      try {
        const lockTimeStr = fs.readFileSync(lockFile, 'utf8').trim();
        const lockTime = new Date(lockTimeStr).getTime();
        if (isNaN(lockTime) || (Date.now() - lockTime > 3 * 60 * 1000)) {
          fs.unlinkSync(lockFile);
        }
      } catch (_) {
        try { fs.unlinkSync(lockFile); } catch (_) {}
      }
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
    this.setState(SCRAPER_STATES.STARTING);

    this.addLog({
      level: 'info',
      message: `[MANAGER] Launching scraper worker process (jobId=${jobId}, scope=${plan.scope.type}, target=${plan.scope.targetCategoryId || 'all'}, mode=${plan.mode}, images=${plan.refresh.images}, size=${plan.refresh.size}, files=${plan.refresh.files}, scanAllPages=${plan.scanAllPages}, scanAllCategories=${plan.scanAllCategories}, headless=${normalizedOptions.headless !== false}, login=${!!normalizedOptions.login})...`,
      timestamp: new Date().toISOString(),
    });

    const runnerPath = path.resolve(__dirname, '../../scraper/runner.cjs');
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

    try {
      this.childProcess = fork(runnerPath, runnerArgs, {
        cwd: path.resolve(__dirname, '../..'),
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
      });

      // IPC message handling (Primary log & event stream)
      this.childProcess.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case SCRAPER_IPC_MESSAGES.STATE_CHANGED:
            this.setState(msg.payload.state, msg.payload.error);
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
                const normalized = batchRawItems
                  .map((item) => normalize.normalizeItem(item, categoryId, categoryName))
                  .filter(Boolean);

                categoriesRepo.upsert(nativeDb, {
                  id: categoryId,
                  name: categoryName || categoryId,
                  baseUrl: baseUrl || null,
                  titleSearch: titleSearch || null,
                  filePath: '',
                  itemCount: normalized.length,
                  lastScrapedAt: new Date().toISOString(),
                });

                const inserted = itemsRepo.upsertBatch(nativeDb, normalized);

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
        this.addLog({
          level: code === 0 ? 'info' : 'warn',
          message: `[MANAGER] Scraper worker process exited (code=${code}, signal=${signal}).`,
          timestamp: new Date().toISOString(),
        });

        this.cleanup();

        if (this.state === SCRAPER_STATES.CANCELLING) {
          this.setState(SCRAPER_STATES.IDLE);
        } else if (code !== 0 && this.state !== SCRAPER_STATES.SESSION_REQUIRED) {
          this.setState(SCRAPER_STATES.FAILED, `Process exited with code ${code}`);
        } else if (this.state === SCRAPER_STATES.RUNNING || this.state === SCRAPER_STATES.STARTING) {
          this.setState(SCRAPER_STATES.COMPLETED);
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

      return { success: true };
    } catch (err) {
      this.cleanup();
      this.setState(SCRAPER_STATES.FAILED, err.message);
      throw err;
    }
  }

  async renewSession(options = {}) {
    const isChildAlive = this.childProcess && this.childProcess.exitCode === null && !this.childProcess.killed;
    if (isChildAlive && [SCRAPER_STATES.STARTING, SCRAPER_STATES.RUNNING, SCRAPER_STATES.CANCELLING].includes(this.state)) {
      throw new Error('SCRAPER_BUSY: A scraper or session renewal job is already running.');
    }

    return await this.start({
      ...options,
      login: true,
      headed: true,
    });
  }

  async cancel() {
    if (!this.childProcess || ![SCRAPER_STATES.STARTING, SCRAPER_STATES.RUNNING].includes(this.state)) {
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

    // 5 second grace period timer before force kill
    this.cancelTimer = setTimeout(() => {
      if (this.childProcess) {
        this.addLog({
          level: 'warn',
          message: '[MANAGER] Grace period expired (5s). Force terminating worker process...',
          timestamp: new Date().toISOString(),
        });
        try {
          this.childProcess.kill('SIGTERM');
        } catch (_) {}
      }
    }, 5000);

    return { success: true };
  }

  cleanup() {
    if (this.cancelTimer) {
      clearTimeout(this.cancelTimer);
      this.cancelTimer = null;
    }
    this.childProcess = null;
  }

  async clearScraperStorage() {
    this.addLog({
      level: 'info',
      message: '[MANAGER] Clearing scraper IndexedDB cache...',
      timestamp: new Date().toISOString(),
    });

    const { launchBrowser } = require('../../scraper/browser.cjs');
    const { injectConsoleScript } = require('../../scraper/scraperBridge.cjs');

    let context;
    try {
      const launch = await launchBrowser({ headless: true });
      context = launch.context;
      const page = launch.page;
      await page.goto('https://rutracker.org/forum/index.php', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
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
        try { await context.close(); } catch (_) {}
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

    return new Promise((resolve, reject) => {
      workerManager.startIndexing(nativeDb, rootDir, (progress) => {
        this.addLog({
          level: 'info',
          message: `[REINDEX] ${progress.message || `Indexed ${progress.itemsProcessed || 0} items`}`,
          timestamp: new Date().toISOString(),
        });
        if (progress.status === 'completed') {
          this.addLog({
            level: 'info',
            message: '[REINDEX] Library re-indexing completed successfully.',
            timestamp: new Date().toISOString(),
          });
          resolve({ success: true, count: progress.itemsProcessed });
        } else if (progress.status === 'error') {
          reject(new Error(progress.error || 'Indexing failed'));
        }
      });
    });
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
}

module.exports = ScraperManager;
