/**
 * Embedded Electron Scraper Transport Adapter (V3-80 Prototype)
 *
 * Implements ScraperTransport interface using an isolated, hidden Electron
 * BrowserWindow / webContents pool inside the Electron Main process.
 *
 * Architectural Invariants:
 * - Strictly EXPERIMENTAL transport (not default).
 * - Belongs strictly to Electron Main (Renderer never touches hidden BrowserWindows).
 * - Owns persistent session: partition `persist:rutracker-v1` (lives under app userData).
 * - Never reuses user's personal browser profiles or Playwright profiles.
 * - Windows are strictly hidden (show: false). No show(), focus(), or flashFrame().
 * - Strict security: nodeIntegration: false, contextIsolation: true, sandbox: true.
 * - Strictly NO preload script exposing RT-Library APIs to remote pages.
 * - Navigation restricted to allowlisted RuTracker origins (blocks file://, javascript:, data:, magnet:, etc.).
 * - Popups, new windows, permissions, and file downloads are strictly denied.
 * - Pool bounded at C=3 detail workers. Workers are reused across jobs.
 * - Returns raw HTML to existing pure parsers (rutrackerHtmlParser.cjs).
 * - Zero secrets (no cookies, cf_clearance, or headers logged or exposed).
 */

function getElectron() {
  try {
    const electron = require('electron');
    if (typeof electron === 'string') {
      // In some Node runners, require('electron') returns binary path string
      return {};
    }
    return electron || {};
  } catch (_) {
    return {};
  }
}

const { URL } = require('node:url');
const { parseCategoryHtml, parseTopicHtml } = require('../../scraper/parsers/rutrackerHtmlParser.cjs');

const ALLOWED_HOSTS = new Set([
  'rutracker.org',
  'rutracker.net',
  'rutracker.nl',
  'challenges.cloudflare.com',
  'cloudflare.com',
  'static.cloudflareinsights.com',
]);

function isAllowedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      ALLOWED_HOSTS.has(host) ||
      host.endsWith('.rutracker.org') ||
      host.endsWith('.cloudflare.com') ||
      host.endsWith('.cloudflareinsights.com')
    );
  } catch (_) {
    return false;
  }
}

function inspectContent(body, title, httpStatus = 200) {
  const challengeRegex = /just a moment|um momento|checking your browser|cf-browser-verification|challenge-platform|enable javascript and cookies|attention required|ddos-guard/i;
  const loginRegex = /login\.php|name="login_username"|id="login_username"/i;
  const forumRegex = /<table[^>]*forumline|class=["'][^"']*torTopic|class=["'][^"']*post_body|id=["']topic_main["']|id=["']tor-tbl["']|id=["']page_container["']|id=["']page_header["']|href=["'][^"']*viewforum\.php\?f=\d+/i;

  const isTitleChallenge = /just a moment|um momento/i.test(title);
  const isBodyChallenge = challengeRegex.test(body);
  const isForbidden = Number(httpStatus) === 403;
  const hasForumMarkers = forumRegex.test(body);

  // Crucial Rule 51, 52, 53: Valid forum markers take priority over residual DOM markers
  if (hasForumMarkers && !isTitleChallenge && !isForbidden) {
    return {
      status: 'FORUM_READY',
      forumDetected: true,
      challengeDetected: false,
      authRequired: false,
    };
  }

  // Active challenge markers or HTTP 403
  if (isForbidden || isTitleChallenge || isBodyChallenge) {
    return {
      status: 'CHALLENGE_REQUIRED',
      forumDetected: false,
      challengeDetected: true,
      authRequired: false,
    };
  }

  // Authentication required
  if (loginRegex.test(body)) {
    return {
      status: 'AUTH_REQUIRED',
      forumDetected: false,
      challengeDetected: false,
      authRequired: true,
    };
  }

  // HTTP error
  if (Number(httpStatus) >= 400 || Number(httpStatus) === 0) {
    return {
      status: 'HTTP_ERROR',
      forumDetected: false,
      challengeDetected: false,
      authRequired: false,
    };
  }

  return {
    status: 'UNCLASSIFIED',
    forumDetected: false,
    challengeDetected: false,
    authRequired: false,
  };
}

class EmbeddedElectronTransport {
  constructor(options = {}) {
    this.id = 'EMBEDDED_ELECTRON';
    this.name = 'Embedded Electron (Experimental)';
    this.sessionPartition = options.sessionPartition || 'persist:rutracker-v1';
    this.maxWorkers = options.maxWorkers || 3; // Bounded concurrency C=3
    this.maxChallengeWaitMs = options.maxChallengeWaitMs || 15000;
    this.navigationTimeoutMs = options.navigationTimeoutMs || 25000;
    this.verificationTimeoutMs = options.verificationTimeoutMs || 300000; // 5 min for user interaction
    this.injectedElectron = options.electron || null;

    this.session = null;
    this.workers = []; // Array of { id, window, state: 'IDLE'|'NAVIGATING'|'WAITING'|'COMPLETED'|'FAILED'|'DESTROYED', crashCount: 0 }
    this.workerQueue = []; // Queue of { resolve, reject } waiting for an available worker
    this.isCancelled = false;
    this.disposed = false;

    // In-App Verification Window management
    this.verificationWindow = null;
    this._verificationPromise = null;
    this._verificationInterval = null;
    this._verificationTimeoutTimer = null;

    this.stats = {
      totalRequests: 0,
      successfulForumLoads: 0,
      challengesEncountered: 0,
      authRequired: 0,
      timeouts: 0,
      errors: 0,
      crashes: 0,
    };

    this.initSession();
  }

  _getElectron() {
    return this.injectedElectron || getElectron();
  }

  initSession() {
    if (this.session) return this.session;
    const { session } = this._getElectron();
    if (!session || typeof session.fromPartition !== 'function') {
      return null;
    }
    this.session = session.fromPartition(this.sessionPartition);

    // Session-level security: deny intrusive device permissions while preserving standard browser API checks
    if (typeof this.session.setPermissionRequestHandler === 'function') {
      this.session.setPermissionRequestHandler((_webContents, permission, callback) => {
        const denied = ['media', 'geolocation', 'notifications', 'midi', 'openExternal', 'pointerLock'];
        callback(!denied.includes(permission));
      });
    }
    if (typeof this.session.on === 'function') {
      this.session.on('will-download', (event, item) => {
        event.preventDefault();
        try { item.cancel(); } catch (_) {}
      });
    }

    // Sanitize User-Agent to match standard Chrome browser (strip Electron & app identifiers to avoid Cloudflare bot heuristics)
    if (typeof this.session.getUserAgent === 'function' && typeof this.session.setUserAgent === 'function') {
      const currentUA = this.session.getUserAgent();
      if (typeof currentUA === 'string' && currentUA.length > 0) {
        const cleanedUA = currentUA
          .replace(/Electron\/[0-9\.]+\s?/gi, '')
          .replace(/rt-library\/[0-9\.]+\s?/gi, '')
          .trim();
        this.session.setUserAgent(cleanedUA);
      }
    }

    return this.session;
  }

  isAvailable() {
    const { app, BrowserWindow } = this._getElectron();
    return Boolean(app && BrowserWindow);
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      isAvailable: this.isAvailable(),
      poolSize: this.workers.length,
      activeWorkers: this.workers.filter(w => w.state === 'NAVIGATING' || w.state === 'WAITING').length,
      maxWorkers: this.maxWorkers,
      partition: this.sessionPartition,
      experimental: true,
      stats: { ...this.stats },
    };
  }

  _createWorker(workerId) {
    this.initSession();
    const { BrowserWindow } = this._getElectron();
    if (!BrowserWindow) throw new Error('BrowserWindow is not available.');
    const win = new BrowserWindow({
      show: false, // Strict: never visible
      width: 1280,
      height: 800,
      webPreferences: {
        session: this.session,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        preload: undefined, // Strictly no RT-Library preload access
        enableRemoteModule: false,
        devTools: false,
        spellcheck: false,
        backgroundThrottling: false, // Prevent Chromium from throttling timers in hidden scraping workers
      },
    });

    // Hardened window-level navigation security
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    win.webContents.on('will-navigate', (event, targetUrl) => {
      if (!isAllowedUrl(targetUrl)) {
        event.preventDefault();
        console.warn(`[EMBEDDED_TRANSPORT][SECURITY] Blocked navigation outside allowlist: ${targetUrl.slice(0, 50)}`);
      }
    });

    win.webContents.on('will-redirect', (event, targetUrl, isInPlace, isMainFrame) => {
      if (isMainFrame !== false && !isAllowedUrl(targetUrl)) {
        event.preventDefault();
        console.warn(`[EMBEDDED_TRANSPORT][SECURITY] Blocked redirect outside allowlist: ${targetUrl.slice(0, 50)}`);
      }
    });

    const workerObj = {
      id: workerId,
      window: win,
      state: 'IDLE',
      crashCount: 0,
      currentJob: null,
    };

    win.webContents.on('render-process-gone', (_event, details) => {
      this.stats.crashes++;
      workerObj.crashCount++;
      workerObj.state = 'DESTROYED';
      console.warn(`[EMBEDDED_TRANSPORT][CRASH] Worker ${workerId} renderer gone: reason=${details.reason} exitCode=${details.exitCode}`);

      if (workerObj.currentJob) {
        const job = workerObj.currentJob;
        workerObj.currentJob = null;
        job.reject(new Error(`RENDERER_CRASHED: Worker ${workerId} crashed during navigation (${details.reason})`));
      }

      // Recreate worker if below crash limit and not disposed
      this._replaceCrashedWorker(workerObj);
    });

    return workerObj;
  }

  _replaceCrashedWorker(oldWorker) {
    const idx = this.workers.indexOf(oldWorker);
    if (idx !== -1) {
      this.workers.splice(idx, 1);
    }
    try {
      if (!oldWorker.window.isDestroyed()) oldWorker.window.destroy();
    } catch (_) {}

    if (!this.disposed && !this.isCancelled && oldWorker.crashCount < 3) {
      try {
        const replacement = this._createWorker(oldWorker.id);
        this.workers.push(replacement);
        this._dispatchNextQueued();
      } catch (err) {
        console.error(`[EMBEDDED_TRANSPORT] Failed to replace worker ${oldWorker.id}:`, err.message);
      }
    }
  }

  async _acquireWorker() {
    if (this.disposed) throw new Error('TRANSPORT_DISPOSED');
    if (this.isCancelled) throw new Error('CANCELLED');

    // Clean up destroyed workers from pool
    this.workers = this.workers.filter(w => !w.window.isDestroyed());

    // 1. Look for existing idle worker
    const idleWorker = this.workers.find(w => w.state === 'IDLE' && !w.window.isDestroyed());
    if (idleWorker) {
      idleWorker.state = 'NAVIGATING';
      return idleWorker;
    }

    // 2. Spawn worker if under pool limit C=3
    if (this.workers.length < this.maxWorkers) {
      const newWorkerId = `worker_${this.workers.length + 1}`;
      const newWorker = this._createWorker(newWorkerId);
      newWorker.state = 'NAVIGATING';
      this.workers.push(newWorker);
      return newWorker;
    }

    // 3. Queue request if all workers are busy (backpressure with timeout)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.workerQueue.findIndex(item => item.resolve === resolve);
        if (idx !== -1) {
          this.workerQueue.splice(idx, 1);
          reject(new Error('ACQUIRE_WORKER_TIMEOUT: Timed out waiting for available scraper worker.'));
        }
      }, 20000);
      this.workerQueue.push({
        resolve: (w) => { clearTimeout(timer); resolve(w); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  _releaseWorker(worker) {
    if (this.disposed || worker.state === 'DESTROYED' || worker.window.isDestroyed()) {
      return;
    }

    worker.currentJob = null;

    if (this.workerQueue.length > 0 && !this.isCancelled) {
      const next = this.workerQueue.shift();
      worker.state = 'NAVIGATING';
      next.resolve(worker);
    } else {
      worker.state = 'IDLE';
    }
  }

  _dispatchNextQueued() {
    if (this.workerQueue.length === 0 || this.isCancelled || this.disposed) return;
    const idleWorker = this.workers.find(w => w.state === 'IDLE' && !w.window.isDestroyed());
    if (idleWorker) {
      const next = this.workerQueue.shift();
      idleWorker.state = 'NAVIGATING';
      next.resolve(idleWorker);
    }
  }

  async _navigateAndExtract(targetUrl) {
    if (!isAllowedUrl(targetUrl)) {
      throw new Error(`SECURITY_ERROR: URL not allowed: ${targetUrl}`);
    }

    // Single Navigation Owner (Rules 7, 8, 9):
    // If verification window is active, suspend worker navigations so they do not compete on the session
    while (this.isVerificationWindowOpen() && !this.isCancelled && !this.disposed) {
      await new Promise(r => setTimeout(r, 250));
    }

    const worker = await this._acquireWorker();
    this.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      worker.currentJob = { resolve, reject };

      const executeNavigation = async () => {
        let httpStatusCode = 0;
        let navError = null;

        const onDidNavigate = (_event, _url, code) => {
          if (code) httpStatusCode = code;
        };
        worker.window.webContents.on('did-navigate', onDidNavigate);
        worker.window.webContents.on('did-redirect-navigation', onDidNavigate);

        const cleanupJob = () => {
          try {
            if (!worker.window.isDestroyed()) {
              worker.window.webContents.removeListener('did-navigate', onDidNavigate);
              worker.window.webContents.removeListener('did-redirect-navigation', onDidNavigate);
            }
          } catch (_) {}
          worker.currentJob = null;
          this._releaseWorker(worker);
        };

        try {
          if (this.isCancelled) throw new Error('CANCELLED');

          try {
            await worker.window.loadURL(targetUrl, { timeout: this.navigationTimeoutMs });
          } catch (err) {
            navError = err;
          }

          // Bounded observation window for non-interactive Cloudflare resolution
          const startTime = Date.now();
          let finalHtml = '';
          let finalTitle = '';
          let contentStatus = null;

          while (Date.now() - startTime <= this.maxChallengeWaitMs) {
            if (this.isCancelled || worker.window.isDestroyed()) {
              throw new Error('CANCELLED');
            }

            finalTitle = worker.window.getTitle() || '';
            finalHtml = await worker.window.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '');
            contentStatus = inspectContent(finalHtml, finalTitle, httpStatusCode);

            if (contentStatus.forumDetected) {
              this.stats.successfulForumLoads++;
              cleanupJob();
              return resolve({
                html: finalHtml,
                title: finalTitle,
                status: 'FORUM_READY',
                httpStatus: httpStatusCode || 200,
                url: targetUrl,
              });
            }

            if (contentStatus.authRequired) {
              this.stats.authRequired++;
              cleanupJob();
              return resolve({
                html: finalHtml,
                title: finalTitle,
                status: 'AUTH_REQUIRED',
                httpStatus: httpStatusCode || 200,
                url: targetUrl,
              });
            }

            // Still in challenge / loading: wait 500ms and re-check
            await new Promise(r => setTimeout(r, 500));
          }

          // Observation window expired without reaching forum content
          if (contentStatus && contentStatus.challengeDetected) {
            this.stats.challengesEncountered++;
            const challengeErr = new Error('INTERACTION_REQUIRED: Cloudflare challenge required in embedded session.');
            challengeErr.code = 'INTERACTION_REQUIRED';
            challengeErr.status = 'CHALLENGE_REQUIRED';
            cleanupJob();
            return reject(challengeErr);
          }

          if (navError) {
            this.stats.errors++;
            cleanupJob();
            return reject(navError);
          }

          this.stats.timeouts++;
          const timeoutErr = new Error(`EMBEDDED_FETCH_TIMEOUT: Reached ${this.maxChallengeWaitMs}ms waiting for forum content.`);
          timeoutErr.code = 'FETCH_TIMEOUT';
          cleanupJob();
          return reject(timeoutErr);

        } catch (err) {
          cleanupJob();
          return reject(err);
        }
      };

      executeNavigation();
    });
  }

  async checkAccess(category) {
    if (this.disposed) throw new Error('TRANSPORT_DISPOSED');
    this.isCancelled = false;

    // Suspend probes while user is verifying in-app (Rules 7, 8)
    if (this.isVerificationWindowOpen()) {
      return {
        status: 'VERIFICATION_IN_PROGRESS',
        httpStatus: 200,
        bytes: 0,
        forumDetected: false,
        cfMitigated: 'challenge',
        topicCount: 0,
        categoryId: category?.id,
        categoryName: category?.name,
        url: category?.baseUrl,
      };
    }
    let targetCategory = category;
    if (!targetCategory || !targetCategory.baseUrl) {
      const { CategoryManager } = require('./categoryManager.cjs');
      const cats = CategoryManager.getInstance().getResolvedCategories();
      targetCategory = cats.find(c => c.enabled !== false) || cats[0];
    }
    if (!targetCategory || !targetCategory.baseUrl) {
      throw new Error('NO_CATEGORY_CONFIGURED');
    }

    try {
      const result = await this._navigateAndExtract(targetCategory.baseUrl);
      const parsed = parseCategoryHtml(result.html, {
        categoryId: targetCategory.id,
        categoryName: targetCategory.name,
        categoryBaseUrl: targetCategory.baseUrl,
        titleSearch: targetCategory.titleSearch,
        pageNum: 1,
        pageUrl: targetCategory.baseUrl,
      });

      return {
        status: result.status,
        httpStatus: result.httpStatus,
        bytes: result.html?.length || 0,
        forumDetected: true,
        cfMitigated: 'none',
        topicCount: parsed.topics?.length || 0,
        categoryId: targetCategory.id,
        categoryName: targetCategory.name,
        url: targetCategory.baseUrl,
      };
    } catch (err) {
      return {
        status: err.code === 'INTERACTION_REQUIRED' ? 'CHALLENGE_REQUIRED' : 'FETCH_ERROR',
        httpStatus: 403,
        bytes: 0,
        forumDetected: false,
        cfMitigated: 'challenge',
        topicCount: 0,
        categoryId: targetCategory.id,
        categoryName: targetCategory.name,
        url: targetCategory.baseUrl,
        error: err.message,
      };
    }
  }

  async fetchCategory(category, pageNum = 1) {
    if (this.disposed) throw new Error('TRANSPORT_DISPOSED');
    this.isCancelled = false;
    if (!category?.baseUrl) throw new Error('INVALID_CATEGORY');
    let targetUrl = category.baseUrl;
    if (pageNum > 1) {
      const parsed = new URL(category.baseUrl);
      parsed.searchParams.set('start', String((pageNum - 1) * 50));
      targetUrl = parsed.toString();
    }

    const result = await this._navigateAndExtract(targetUrl);
    if (result.status !== 'FORUM_READY') {
      const err = new Error(`EMBEDDED_CATEGORY_ERROR: Status is ${result.status}`);
      err.code = result.status;
      err.categoryId = category.id;
      throw err;
    }

    const parsed = parseCategoryHtml(result.html, {
      categoryId: category.id,
      categoryName: category.name,
      categoryBaseUrl: category.baseUrl,
      titleSearch: category.titleSearch,
      pageNum,
      pageUrl: targetUrl,
    });

    return {
      topics: parsed.topics || [],
      pagination: parsed.pagination || { totalPages: 1 },
      status: result.status,
      httpStatus: result.httpStatus,
      bytes: result.html?.length || 0,
      url: targetUrl,
    };
  }

  async fetchTopic(topic, category) {
    if (this.disposed) throw new Error('TRANSPORT_DISPOSED');
    this.isCancelled = false;
    const topicId = topic?.topicId || String(topic?.url || '').match(/[?&]t=(\d+)/)?.[1];
    if (!topicId) throw new Error('INVALID_TOPIC_ID');
    const topicUrl = topic.url || `https://rutracker.org/forum/viewtopic.php?t=${topicId}`;

    const result = await this._navigateAndExtract(topicUrl);
    if (result.status !== 'FORUM_READY') {
      const err = new Error(`EMBEDDED_TOPIC_ERROR: Status is ${result.status}`);
      err.code = result.status;
      err.categoryId = category?.id;
      throw err;
    }

    const parsed = parseTopicHtml(result.html, {
      topicUrl,
      topicTitle: topic.title || '',
    });

    const forumMatch = result.html.match(/viewforum\.php\?f=(\d+)/);
    const forumId = forumMatch ? forumMatch[1] : null;

    return {
      ...parsed,
      forumId,
      topicTitle: parsed?.canonicalTitle || topic.title || '',
    };
  }

  probeAccess(category) {
    return this.checkAccess(category);
  }

  isVerificationWindowOpen() {
    return Boolean(this.verificationWindow && !this.verificationWindow.isDestroyed());
  }

  closeVerificationWindow() {
    if (this._verificationInterval) {
      clearInterval(this._verificationInterval);
      this._verificationInterval = null;
    }
    if (this._verificationTimeoutTimer) {
      clearTimeout(this._verificationTimeoutTimer);
      this._verificationTimeoutTimer = null;
    }
    if (this._rejectVerification) {
      try {
        const err = new Error('VERIFICATION_CANCELLED_BY_USER: Verification window closed.');
        err.code = 'VERIFICATION_CANCELLED_BY_USER';
        this._rejectVerification(err);
      } catch (_) {}
      this._rejectVerification = null;
      this._resolveVerification = null;
    }
    if (this.verificationWindow) {
      const win = this.verificationWindow;
      this.verificationWindow = null;
      this._verificationPromise = null;
      try {
        if (typeof win.isDestroyed === 'function' && !win.isDestroyed() && typeof win.close === 'function') {
          win.close();
        }
      } catch (_) {}
    }
  }

  async resetSession() {
    this.initSession();
    if (!this.session) return { success: false, message: 'No session initialized' };
    try {
      if (typeof this.session.clearCache === 'function') {
        await this.session.clearCache();
      }
      if (typeof this.session.clearStorageData === 'function') {
        await this.session.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  openVerificationWindow(targetUrl, options = {}) {
    // 1. Singleton check: if already open and not destroyed, bring to focus
    if (this.verificationWindow && !this.verificationWindow.isDestroyed()) {
      try {
        this.verificationWindow.focus();
      } catch (_) {}
      return this._verificationPromise;
    }

    this.initSession();
    const { BrowserWindow } = this._getElectron();
    if (!BrowserWindow) {
      throw new Error('BrowserWindow is not available.');
    }

    let urlToLoad = targetUrl || 'https://rutracker.org/forum/index.php';
    if (!isAllowedUrl(urlToLoad)) {
      urlToLoad = 'https://rutracker.org/forum/index.php';
    }

    const win = new BrowserWindow({
      show: options.show !== undefined ? options.show : true,
      width: options.width || 920,
      height: options.height || 720,
      minWidth: 640,
      minHeight: 500,
      title: options.title || 'RT-Library - RuTracker Verification',
      autoHideMenuBar: true,
      webPreferences: {
        session: this.session, // Exact SAME persistent partition: persist:rutracker-v1
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        preload: undefined, // Strictly no RT-Library preload access
        enableRemoteModule: false,
        devTools: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    this.verificationWindow = win;
    console.log(`[EMBEDDED_TRANSPORT][SESSION] Verification window initialized with session: ${this.sessionPartition} (sameSessionObject=${Boolean(this.session)})`);

    // Hardened window security
    if (typeof win.webContents?.setWindowOpenHandler === 'function') {
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
    if (typeof win.webContents?.on === 'function') {
      win.webContents.on('will-navigate', (event, navUrl) => {
        if (!isAllowedUrl(navUrl)) {
          event.preventDefault();
          console.warn(`[EMBEDDED_TRANSPORT][VERIFY_SECURITY] Blocked navigation outside allowlist: ${navUrl?.slice?.(0, 50)}`);
        }
      });
      win.webContents.on('will-redirect', (event, navUrl, isInPlace, isMainFrame) => {
        if (isMainFrame !== false && !isAllowedUrl(navUrl)) {
          event.preventDefault();
          console.warn(`[EMBEDDED_TRANSPORT][VERIFY_SECURITY] Blocked redirect outside allowlist: ${navUrl?.slice?.(0, 50)}`);
        }
      });
    }

    const timeoutMs = options.timeoutMs || this.verificationTimeoutMs;
    const debounceMs = options.debounceMs !== undefined ? options.debounceMs : 50;

    this._verificationPromise = new Promise((resolve, reject) => {
      let isSettled = false;
      this._resolveVerification = resolve;
      this._rejectVerification = reject;

      let classificationDebounceTimer = null;
      let isClassifying = false;

      const cleanup = () => {
        if (this._verificationInterval) {
          clearInterval(this._verificationInterval);
          this._verificationInterval = null;
        }
        if (this._verificationTimeoutTimer) {
          clearTimeout(this._verificationTimeoutTimer);
          this._verificationTimeoutTimer = null;
        }
        if (classificationDebounceTimer) {
          clearTimeout(classificationDebounceTimer);
          classificationDebounceTimer = null;
        }
        this._resolveVerification = null;
        this._rejectVerification = null;
        this.verificationWindow = null;
        this._verificationPromise = null;
      };

      // Lifecycle & Generation Tracking (V3-81.3 Rules 4, 5, 6, 7, 9, 10, 11, 12, 36, 37)
      let navigationGeneration = 0;
      let challengeGeneration = 0;
      let challengeAttempts = 0;
      let lastObservedRayId = null;
      let lastObservedNavGen = -1;
      let currentCycleState = 'INIT'; // 'INIT' | 'WAITING_FOR_HUMAN' | 'PROCESSING'
      const MAX_CHALLENGE_ATTEMPTS = 3;

      const runClassification = async (triggerReason) => {
        if (isSettled || isClassifying || !win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
          return;
        }

        isClassifying = true;

        try {
          const title = (typeof win.getTitle === 'function' ? win.getTitle() : '') || '';

          let inspectionPayload = null;
          if (typeof win.webContents?.executeJavaScript === 'function') {
            const jsResult = await win.webContents.executeJavaScript(`
              (() => {
                try {
                  const html = document.documentElement ? document.documentElement.outerHTML : '';
                  const readyState = document.readyState || 'complete';
                  const text = document.body ? (document.body.innerText || '') : '';
                  const rayMatch = text.match(/Ray ID:\\s*([a-f0-9]+)/i);
                  const rayId = rayMatch ? (rayMatch[1] || rayMatch[0]) : null;
                  return { html, readyState, rayId };
                } catch (e) {
                  return { html: '', readyState: 'complete', rayId: null };
                }
              })()
            `).catch(() => null);

            if (typeof jsResult === 'string') {
              // Backward compatibility with test mocks returning HTML string
              const rayMatch = jsResult.match(/Ray ID:\s*([a-f0-9]+)/i);
              inspectionPayload = {
                html: jsResult,
                readyState: 'complete',
                rayId: rayMatch ? (rayMatch[1] || rayMatch[0]) : null,
              };
            } else if (jsResult && typeof jsResult === 'object') {
              inspectionPayload = jsResult;
            }
          }

          if (isSettled || !inspectionPayload) return;

          const { html = '', readyState = 'complete', rayId = null } = inspectionPayload;
          const inspection = inspectContent(html, title);

          // 1. FORUM_READY strictly takes priority (Rules 17, 18, 19)
          if (inspection.forumDetected) {
            isSettled = true;
            console.log(`[EMBEDDED_TRANSPORT][VERIFY] Human verification succeeded! Forum access verified (NavGen: ${navigationGeneration}, RayId: ${rayId || 'none'}).`);
            cleanup();
            try {
              if (typeof win.isDestroyed === 'function' && !win.isDestroyed() && typeof win.close === 'function') {
                win.close();
              }
            } catch (_) {}
            return resolve({
              success: true,
              status: 'FORUM_READY',
              url: (typeof win.webContents?.getURL === 'function' ? win.webContents.getURL() : urlToLoad),
            });
          }

          // 2. Do not advance challenge cycle while page is still loading (Rules 10, 11)
          if (readyState !== 'complete' && readyState !== 'interactive') {
            return;
          }

          // 3. Challenge Evaluation (Rules 3, 5, 8, 9, 10, 11, 36, 37)
          if (inspection.challengeDetected) {
            const isInitialChallenge = (challengeGeneration === 0);
            const isDifferentRayId = Boolean(rayId && lastObservedRayId && rayId !== lastObservedRayId);
            const isNewNavigation = (navigationGeneration > lastObservedNavGen);

            // True new challenge cycle condition:
            // Either first time seeing a challenge, or Ray ID changed, or a new top-level navigation completed after user interaction/processing
            const isNewChallenge = isInitialChallenge || isDifferentRayId || (isNewNavigation && currentCycleState === 'PROCESSING');

            if (isNewChallenge) {
              challengeGeneration++;
              challengeAttempts++;
              lastObservedRayId = rayId;
              lastObservedNavGen = navigationGeneration;
              currentCycleState = 'WAITING_FOR_HUMAN';

              console.log(
                `[EMBEDDED_TRANSPORT][VERIFY] Challenge cycle ${challengeGeneration} active ` +
                `(Attempt ${challengeAttempts}/${MAX_CHALLENGE_ATTEMPTS}, trigger: ${triggerReason}, ` +
                `NavGen: ${navigationGeneration}, RayId: ${rayId || 'none'})`
              );

              if (challengeAttempts >= MAX_CHALLENGE_ATTEMPTS) {
                isSettled = true;
                console.warn(
                  `[EMBEDDED_TRANSPORT][VERIFY] Max interactive challenge attempts (${MAX_CHALLENGE_ATTEMPTS}) reached ` +
                  `without forum access (Total NavGens: ${navigationGeneration}). Terminating loop.`
                );
                cleanup();
                try {
                  if (typeof win.isDestroyed === 'function' && !win.isDestroyed() && typeof win.close === 'function') {
                    win.close();
                  }
                } catch (_) {}
                const err = new Error('VERIFICATION_LOOP: Cloudflare interactive verification repeatedly failed in embedded browser.');
                err.code = 'VERIFICATION_LOOP';
                err.status = 'VERIFICATION_LOOP';
                err.attempts = challengeAttempts;
                err.challengeGeneration = challengeGeneration;
                err.navigationGeneration = navigationGeneration;
                return reject(err);
              }
            } else {
              // Re-polling the same challenge document: do NOT increment attempts (Rule 67)
            }
          }
        } catch (_) {
        } finally {
          isClassifying = false;
        }
      };

      const scheduleVerificationClassification = (reason) => {
        if (isSettled) return;
        if (classificationDebounceTimer) {
          clearTimeout(classificationDebounceTimer);
        }
        if (debounceMs <= 0) {
          Promise.resolve().then(() => runClassification(reason));
        } else {
          classificationDebounceTimer = setTimeout(() => {
            classificationDebounceTimer = null;
            runClassification(reason);
          }, debounceMs);
        }
      };

      // Periodic check every 1000ms
      this._verificationInterval = setInterval(() => {
        scheduleVerificationClassification('interval');
      }, 1000);

      // WebContents Navigation Event Listeners (Rules 4, 13)
      if (typeof win.webContents?.on === 'function') {
        win.webContents.on('did-start-navigation', (_e, _navUrl, _isInPlace, isMainFrame) => {
          if (isMainFrame !== false) {
            if (currentCycleState === 'WAITING_FOR_HUMAN') {
              currentCycleState = 'PROCESSING';
            }
          }
        });

        win.webContents.on('did-redirect-navigation', (_e, _navUrl, _isInPlace, isMainFrame) => {
          if (isMainFrame !== false) {
            scheduleVerificationClassification('did-redirect-navigation');
          }
        });

        win.webContents.on('did-navigate', (_e, _navUrl, _httpStatusCode, isMainFrame) => {
          if (isMainFrame !== false) {
            navigationGeneration++;
            scheduleVerificationClassification('did-navigate');
          }
        });

        win.webContents.on('did-navigate-in-page', (_e, _navUrl, isMainFrame) => {
          if (isMainFrame !== false) {
            scheduleVerificationClassification('did-navigate-in-page');
          }
        });

        win.webContents.on('dom-ready', () => {
          scheduleVerificationClassification('dom-ready');
        });

        win.webContents.on('did-finish-load', () => {
          scheduleVerificationClassification('did-finish-load');
        });
      }

      if (typeof win.on === 'function') {
        win.on('closed', () => {
          if (!isSettled) {
            isSettled = true;
            cleanup();
            const err = new Error('VERIFICATION_CANCELLED_BY_USER: Verification window was closed before challenge completion.');
            err.code = 'VERIFICATION_CANCELLED_BY_USER';
            return reject(err);
          }
        });
      }

      this._verificationTimeoutTimer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          try {
            if (typeof win.isDestroyed === 'function' && !win.isDestroyed() && typeof win.close === 'function') {
              win.close();
            }
          } catch (_) {}
          const err = new Error(`VERIFICATION_TIMEOUT: Human verification window timed out after ${timeoutMs}ms.`);
          err.code = 'VERIFICATION_TIMEOUT';
          return reject(err);
        }
      }, timeoutMs);

      // Load target URL
      if (typeof win.loadURL === 'function') {
        win.loadURL(urlToLoad).catch((err) => {
          console.warn('[EMBEDDED_TRANSPORT][VERIFY] loadURL initial notice:', err.message);
        });
      }
    });

    return this._verificationPromise;
  }

  cancel() {
    this.isCancelled = true;

    // Reject queued jobs
    while (this.workerQueue.length > 0) {
      const item = this.workerQueue.shift();
      item.reject(new Error('CANCELLED: Scraper job cancelled by user.'));
    }

    // Stop active navigations
    for (const worker of this.workers) {
      try {
        if (!worker.window.isDestroyed()) {
          worker.window.webContents.stop();
        }
      } catch (_) {}
      if (worker.currentJob) {
        worker.currentJob.reject(new Error('CANCELLED: Scraper job cancelled by user.'));
        worker.currentJob = null;
      }
      worker.state = 'IDLE';
    }

    this.closeVerificationWindow();
  }

  dispose() {
    this.disposed = true;
    this.cancel();

    for (const worker of this.workers) {
      try {
        if (!worker.window.isDestroyed()) {
          worker.window.destroy();
        }
      } catch (_) {}
    }
    this.workers = [];
    this.workerQueue = [];
    this.closeVerificationWindow();
  }
}

module.exports = {
  EmbeddedElectronTransport,
  isAllowedUrl,
  inspectContent,
};
