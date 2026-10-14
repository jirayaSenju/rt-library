/**
 * UpdaterManager manages update detection, downloading, and installation
 * exclusively in the Electron Main process.
 *
 * Supported environments:
 * - Linux: AppImage (process.env.APPIMAGE defined)
 * - Windows: Portable Executable (app.isPackaged and process.platform === 'win32')
 *
 * Non-packaged/dev builds and unsupported installation formats
 * gracefully report UNSUPPORTED.
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const semver = require('semver');
const { UpdaterState, UpdaterErrorCode, createInitialStatus } = require('./updaterTypes.cjs');
const { WindowsPortableUpdater } = require('./windowsPortableUpdater.cjs');

const REPO_OWNER = 'jirayaSenju';
const REPO_NAME = 'rt-library';

class UpdaterManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.app = options.app || require('electron').app;
    this.currentVersion = options.currentVersion || (this.app ? this.app.getVersion() : '1.0.0');
    this.isPackaged = options.isPackaged !== undefined ? options.isPackaged : (this.app ? this.app.isPackaged : false);
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.updaterLogPath = options.updaterLogPath || this.resolveUpdaterLogPath();

    this.status = createInitialStatus(this.currentVersion);
    this.activeCheckPromise = null;
    this.autoUpdater = null;
    this.startupTimer = null;
    this.periodicTimer = null;
    this.syncActiveProvider = options.syncActiveProvider || (() => false);

    this.checkPlatformSupport();
    this.logDiagnostic('manager_initialized', {
      version: this.currentVersion,
      platform: this.platform,
      packaged: this.isPackaged,
      supported: this.status.isSupported,
      state: this.status.state,
      errorCode: this.status.errorCode,
    });
  }

  resolveUpdaterLogPath() {
    try {
      if (this.app && typeof this.app.getPath === 'function') {
        return path.join(this.app.getPath('userData'), 'logs', 'updater.log');
      }
    } catch (_) {}
    return path.join(require('os').tmpdir(), 'rt-library-updater.log');
  }

  logDiagnostic(event, details = {}) {
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    })}\n`;
    try {
      fs.mkdirSync(path.dirname(this.updaterLogPath), { recursive: true });
      fs.appendFileSync(this.updaterLogPath, line, 'utf8');
    } catch (err) {
      console.error('[UPDATER][LOG_WRITE_ERROR]', this.updaterLogPath, err.message);
    }
  }

  describeError(err) {
    return {
      name: err?.name || 'Error',
      message: err?.message || String(err || 'Unknown error'),
      code: err?.code || null,
      stack: err?.stack ? String(err.stack).slice(0, 12000) : null,
    };
  }

  checkPlatformSupport() {
    if (!this.isPackaged) {
      this.status.isSupported = false;
      this.status.state = UpdaterState.UNSUPPORTED;
      this.status.errorCode = UpdaterErrorCode.DEV_MODE_UNSUPPORTED;
      this.status.errorMessage = 'Automatic updates are unavailable in development builds.';
      return false;
    }

    if (this.platform === 'linux') {
      if (!this.env.APPIMAGE) {
        this.status.isSupported = false;
        this.status.state = UpdaterState.UNSUPPORTED;
        this.status.errorCode = UpdaterErrorCode.UNSUPPORTED_INSTALL_TYPE;
        this.status.errorMessage = 'Automatic updates are only supported for AppImage packages on Linux.';
        return false;
      }

      // Check if AppImage file location is writable
      try {
        const appImagePath = this.env.APPIMAGE;
        fs.accessSync(path.dirname(appImagePath), fs.constants.W_OK);
      } catch (err) {
        this.status.isSupported = false;
        this.status.state = UpdaterState.UNSUPPORTED;
        this.status.errorCode = UpdaterErrorCode.READ_ONLY_LOCATION;
        this.status.errorMessage = 'Current AppImage directory is read-only. Move AppImage to a writable folder to enable updates.';
        return false;
      }
    } else if (this.platform === 'win32') {
      // Portable executable update is supported when packaged
      try {
        const targetExe = this.env.PORTABLE_EXECUTABLE_FILE || (this.app && typeof this.app.getPath === 'function' ? this.app.getPath('exe') : process.execPath);
        if (targetExe) {
          fs.accessSync(path.dirname(targetExe), fs.constants.W_OK);
        }
      } catch (err) {
        this.status.isSupported = false;
        this.status.state = UpdaterState.UNSUPPORTED;
        this.status.errorCode = UpdaterErrorCode.READ_ONLY_LOCATION;
        this.status.errorMessage = 'Current portable executable directory is read-only. Move it to a writable folder to enable updates.';
        return false;
      }
    } else {
      this.status.isSupported = false;
      this.status.state = UpdaterState.UNSUPPORTED;
      this.status.errorCode = UpdaterErrorCode.UNSUPPORTED_INSTALL_TYPE;
      this.status.errorMessage = `Automatic updates are not supported on ${this.platform}.`;
      return false;
    }

    this.status.isSupported = true;
    return true;
  }

  ensureAutoUpdater() {
    if (this.autoUpdater) return this.autoUpdater;
    if (!this.status.isSupported) return null;

    try {
      this.logDiagnostic('updater_initialization_started', {
        platform: this.platform,
        version: this.currentVersion,
      });
      const { AppImageUpdater } = require('electron-updater');

      const self = this;
      const appAdapter = {
        whenReady: () => (self.app ? self.app.whenReady() : Promise.resolve()),
        get version() { return self.currentVersion; },
        get name() { return 'RT-Library'; },
        get isPackaged() { return self.isPackaged; },
        get appUpdateConfigPath() {
          if (process.resourcesPath) {
            const p = path.join(process.resourcesPath, 'app-update.yml');
            if (fs.existsSync(p)) return p;
          }
          if (self.app && typeof self.app.getPath === 'function') {
            const p = path.join(self.app.getPath('userData'), 'app-update.yml');
            if (fs.existsSync(p)) return p;
          }
          const winUnpacked = path.join(process.cwd(), 'dist-desktop', 'win-unpacked', 'resources', 'app-update.yml');
          if (fs.existsSync(winUnpacked)) return winUnpacked;
          return path.join(process.cwd(), 'dist-desktop', 'linux-unpacked', 'resources', 'app-update.yml');
        },
        get userDataPath() { return self.app ? self.app.getPath('userData') : '/tmp'; },
        get baseCachePath() { return self.app ? self.app.getPath('userData') : '/tmp'; },
        quit: () => { if (self.app) self.app.quit(); },
        relaunch: () => { if (self.app) self.app.relaunch(); },
        onQuit: (handler) => { if (self.app) self.app.once('quit', (_, code) => handler(code)); },
      };

      if (this.platform === 'linux') {
        this.autoUpdater = new AppImageUpdater(null, appAdapter);
      } else if (this.platform === 'win32') {
        this.autoUpdater = new WindowsPortableUpdater(null, appAdapter);
      } else {
        return null;
      }

      // In real Electron runtime (Main process with session & net), use ElectronHttpExecutor
      // In headless unit-tests / node runner, provide a pure Node HttpExecutor fallback
      let electronHttpAvailable = false;
      try {
        const electron = require('electron');
        if (electron && electron.session && electron.net) {
          const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
          this.autoUpdater.httpExecutor = new ElectronHttpExecutor();
          electronHttpAvailable = true;
        }
      } catch (_) {
        electronHttpAvailable = false;
      }

      if (!electronHttpAvailable) {
        const http = require('http');
        const https = require('https');
        let builderRuntime;
        try {
          builderRuntime = require('builder-util-runtime');
        } catch {
          builderRuntime = require('electron-updater/node_modules/builder-util-runtime');
        }
        const { HttpExecutor, configureRequestUrl, configureRequestOptions } = builderRuntime;

        class FallbackNodeHttpExecutor extends HttpExecutor {
          createRequest(options, callback) {
            const isHttps = options.protocol === 'https:';
            const client = isHttps ? https : http;
            return client.request(options, callback);
          }
        }

        const fallbackExec = new FallbackNodeHttpExecutor();
        fallbackExec.download = async function (url, destination, options) {
          return await options.cancellationToken.createPromise((resolve, reject, onCancel) => {
            const requestOptions = {
              headers: options.headers || undefined,
              redirect: 'manual',
            };
            configureRequestUrl(url, requestOptions);
            configureRequestOptions(requestOptions);
            this.doDownload(requestOptions, {
              destination,
              options,
              onCancel,
              callback: (error) => {
                if (error == null) resolve(destination);
                else reject(error);
              },
              responseHandler: null,
            }, 0);
          });
        };
        this.autoUpdater.httpExecutor = fallbackExec;
      }

      this.autoUpdater.disableDifferentialDownload = true;
      this.autoUpdater.setFeedURL({
        provider: 'github',
        owner: REPO_OWNER,
        repo: REPO_NAME,
      });

      this.autoUpdater.autoDownload = false;
      this.autoUpdater.autoInstallOnAppQuit = false;
      this.autoUpdater.allowPrerelease = false;
      this.autoUpdater.allowDowngrade = false;

      this.autoUpdater.on('checking-for-update', () => {
        console.info('[UPDATER] Checking for updates on GitHub...');
        this.logDiagnostic('checking_for_update');
      });

      this.autoUpdater.on('update-available', (info) => {
        this.handleUpdateAvailable(info);
      });

      this.autoUpdater.on('update-not-available', (info) => {
        this.handleUpdateNotAvailable(info);
      });

      this.autoUpdater.on('download-progress', (progressObj) => {
        this.handleDownloadProgress(progressObj);
      });

      this.autoUpdater.on('update-downloaded', (info) => {
        this.handleUpdateDownloaded(info);
      });

      this.autoUpdater.on('error', (err) => {
        this.logDiagnostic('updater_error_event', { error: this.describeError(err) });
        this.handleError(err);
      });

      return this.autoUpdater;
    } catch (err) {
      console.error('[UPDATER][INIT_ERROR]', err.message);
      this.logDiagnostic('updater_initialization_failed', { error: this.describeError(err) });
      this.status.state = UpdaterState.ERROR;
      this.status.errorCode = UpdaterErrorCode.UNKNOWN;
      this.status.errorMessage = 'Failed to initialize update subsystem.';
      this.emitChange();
      return null;
    }
  }

  handleUpdateAvailable(info) {
    const rawVersion = info?.version;
    const cleanVersion = semver.clean(rawVersion || '');

    // Strict SemVer verification: must be strictly newer
    if (!cleanVersion || !semver.gt(cleanVersion, this.currentVersion)) {
      this.logDiagnostic('update_candidate_rejected', {
        currentVersion: this.currentVersion,
        candidateVersion: rawVersion || null,
      });
      this.handleUpdateNotAvailable(info);
      return;
    }

    console.info(`[UPDATER] Update available: ${cleanVersion} (current: ${this.currentVersion})`);
    this.logDiagnostic('update_available', { currentVersion: this.currentVersion, availableVersion: cleanVersion });
    this.status.state = UpdaterState.UPDATE_AVAILABLE;
    this.status.availableVersion = cleanVersion;
    this.status.releaseDate = info.releaseDate || null;
    this.status.releaseNotes = typeof info.releaseNotes === 'string'
      ? info.releaseNotes.slice(0, 4000)
      : (Array.isArray(info.releaseNotes) ? info.releaseNotes.map(n => n.note).join('\n').slice(0, 4000) : null);
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();
  }

  handleUpdateNotAvailable(info) {
    console.info(`[UPDATER] Application is up to date (${this.currentVersion}).`);
    this.logDiagnostic('update_not_available', { currentVersion: this.currentVersion, reportedVersion: info?.version || null });
    this.status.state = UpdaterState.UP_TO_DATE;
    this.status.availableVersion = null;
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();
  }

  handleDownloadProgress(progressObj) {
    this.status.state = UpdaterState.DOWNLOADING;
    this.status.progress = Math.round(progressObj.percent || 0);
    this.status.bytesPerSecond = Math.round(progressObj.bytesPerSecond || 0);
    this.status.transferred = Math.round(progressObj.transferred || 0);
    this.status.total = Math.round(progressObj.total || 0);
    const progressMilestone = Math.floor(this.status.progress / 25) * 25;
    if (progressMilestone > (this._lastLoggedProgressMilestone || 0)) {
      this._lastLoggedProgressMilestone = progressMilestone;
      this.logDiagnostic('download_progress', {
        percent: this.status.progress,
        transferred: this.status.transferred,
        total: this.status.total,
        bytesPerSecond: this.status.bytesPerSecond,
      });
    }
    this.emitChange();
  }

  handleUpdateDownloaded(info) {
    console.info(`[UPDATER] Update downloaded successfully: ${this.status.availableVersion}`);
    this.logDiagnostic('update_downloaded', { availableVersion: this.status.availableVersion || info?.version || null });
    this.status.state = UpdaterState.DOWNLOADED;
    this.status.progress = 100;
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();
  }

  handleError(err) {
    const rawMsg = err ? (err.message || String(err)) : 'Unknown error';
    this.logDiagnostic('updater_error', { error: this.describeError(err), state: this.status.state });

    // Deduplicate identical immediate error logging
    if (this._lastLoggedError !== rawMsg) {
      this._lastLoggedError = rawMsg;
      console.error('[UPDATER][ERROR]', rawMsg);
      setTimeout(() => {
        if (this._lastLoggedError === rawMsg) this._lastLoggedError = null;
      }, 5000);
    }

    this.status.state = UpdaterState.ERROR;
    if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('EAI_AGAIN') || rawMsg.includes('ETIMEDOUT') || rawMsg.includes('net::ERR_INTERNET_DISCONNECTED')) {
      this.status.errorCode = UpdaterErrorCode.NETWORK_UNAVAILABLE;
      this.status.errorMessage = 'Unable to check for updates. Please check your internet connection.';
    } else if (rawMsg.includes('404') || rawMsg.includes('latest-linux.yml') || rawMsg.includes('latest.yml')) {
      this.status.errorCode = UpdaterErrorCode.UPDATE_METADATA_MISSING;
      this.status.errorMessage = 'Update information is temporarily unavailable. Please try again later or view releases on GitHub.';
    } else {
      this.status.errorCode = UpdaterErrorCode.UPDATE_CHECK_FAILED;
      this.status.errorMessage = 'Unable to check for updates at this time.';
    }

    this.emitChange();
  }

  checkForUpdates(isManual = false) {
    this.logDiagnostic('check_requested', {
      manual: Boolean(isManual),
      currentVersion: this.currentVersion,
      platform: this.platform,
      supported: this.status.isSupported,
    });
    if (!this.checkPlatformSupport()) {
      this.logDiagnostic('check_skipped_unsupported', { errorCode: this.status.errorCode, message: this.status.errorMessage });
      return Promise.resolve(this.getStatus());
    }

    // Duplicate check protection: share active Promise
    if (this.activeCheckPromise) {
      console.info('[UPDATER] Update check already in progress, returning active check.');
      this.logDiagnostic('check_deduplicated');
      return this.activeCheckPromise;
    }

    this.status.state = UpdaterState.CHECKING;
    this.status.lastCheckedAt = new Date().toISOString();
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();

    this.activeCheckPromise = (async () => {
      try {
        const updater = this.ensureAutoUpdater();
        if (!updater) {
          return this.getStatus();
        }
        await updater.checkForUpdates();
        this.logDiagnostic('check_completed', { state: this.status.state, availableVersion: this.status.availableVersion });
        return this.getStatus();
      } catch (err) {
        this.logDiagnostic('check_failed', { error: this.describeError(err) });
        this.handleError(err);
        return this.getStatus();
      } finally {
        this.activeCheckPromise = null;
      }
    })();

    return this.activeCheckPromise;
  }

  async downloadUpdate() {
    this.logDiagnostic('download_requested', {
      currentVersion: this.currentVersion,
      availableVersion: this.status.availableVersion,
      state: this.status.state,
      platform: this.platform,
      supported: this.status.isSupported,
    });
    if (!this.status.isSupported) {
      const err = new Error(this.status.errorMessage || 'Updates unsupported.');
      this.logDiagnostic('download_rejected_unsupported', { error: this.describeError(err) });
      throw err;
    }

    if (this.status.state !== UpdaterState.UPDATE_AVAILABLE && this.status.state !== UpdaterState.ERROR) {
      return this.getStatus();
    }

    this.status.state = UpdaterState.DOWNLOADING;
    this.status.progress = 0;
    this._lastLoggedProgressMilestone = 0;
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();

    try {
      const updater = this.ensureAutoUpdater();
      if (!updater) throw new Error('Auto updater unavailable.');
      await updater.downloadUpdate();
      this.logDiagnostic('download_completed', { availableVersion: this.status.availableVersion });
      return this.getStatus();
    } catch (err) {
      this.logDiagnostic('download_failed', { error: this.describeError(err) });
      this.handleError(err);
      throw err;
    }
  }

  async quitAndInstall() {
    this.logDiagnostic('install_requested', { state: this.status.state, availableVersion: this.status.availableVersion });
    if (!this.status.isSupported) {
      throw new Error('Updates unsupported.');
    }

    if (this.status.state !== UpdaterState.DOWNLOADED) {
      throw new Error('No downloaded update ready for installation.');
    }

    // Guard: Scraper active job
    if (this.syncActiveProvider()) {
      const err = new Error('A synchronization is currently running. Please cancel or wait for it to finish before updating.');
      err.code = UpdaterErrorCode.SYNC_IN_PROGRESS;
      throw err;
    }

    console.info('[UPDATER] Initiating application restart and update installation...');
    this.status.state = UpdaterState.INSTALLING;
    this.logDiagnostic('install_started', { availableVersion: this.status.availableVersion });
    this.emitChange();

    const updater = this.ensureAutoUpdater();
    if (!updater) throw new Error('Auto updater unavailable.');

    // Gracefully invoke quitAndInstall(isSilent, isForceRunAfter)
    // isSilent: false (user requested it), isForceRunAfter: true (relaunch RT-Library)
    updater.quitAndInstall(false, true);
  }

  startPeriodicChecks({ initialDelayMs = 10000, intervalMs = 4 * 60 * 60 * 1000 } = {}) {
    if (!this.status.isSupported) return;

    this.stopPeriodicChecks();

    this.startupTimer = setTimeout(() => {
      console.info('[UPDATER] Executing initial startup update check...');
      this.checkForUpdates(false).catch((err) => {
        console.warn('[UPDATER][STARTUP_CHECK_WARN]', err.message);
      });
    }, initialDelayMs);

    this.periodicTimer = setInterval(() => {
      console.info('[UPDATER] Executing periodic background update check...');
      this.checkForUpdates(false).catch((err) => {
        console.warn('[UPDATER][PERIODIC_CHECK_WARN]', err.message);
      });
    }, intervalMs);
  }

  stopPeriodicChecks() {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  getStatus() {
    return { ...this.status };
  }

  emitChange() {
    this.emit('status-changed', this.getStatus());
  }

  shutdown() {
    this.stopPeriodicChecks();
    this.removeAllListeners();
  }
}

let singletonInstance = null;

function getUpdaterManager(options) {
  if (!singletonInstance) {
    singletonInstance = new UpdaterManager(options);
  }
  return singletonInstance;
}

module.exports = {
  UpdaterManager,
  getUpdaterManager,
};
