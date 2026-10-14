/**
 * UpdaterManager manages update detection, downloading, and installation
 * exclusively in the Electron Main process.
 *
 * Supported environments:
 * - Linux: AppImage (process.env.APPIMAGE defined)
 * - Windows: NSIS packaged installation (app.isPackaged and process.platform === 'win32')
 *
 * Non-packaged/dev builds and non-AppImage Linux installations (deb/rpm/snap/source)
 * gracefully report UNSUPPORTED.
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const semver = require('semver');
const { UpdaterState, UpdaterErrorCode, createInitialStatus } = require('./updaterTypes.cjs');

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

    this.status = createInitialStatus(this.currentVersion);
    this.activeCheckPromise = null;
    this.autoUpdater = null;
    this.startupTimer = null;
    this.periodicTimer = null;
    this.syncActiveProvider = options.syncActiveProvider || (() => false);

    this.checkPlatformSupport();
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
      // NSIS installation is supported when packaged
      this.status.isSupported = true;
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
      const { AppImageUpdater } = require('electron-updater/out/AppImageUpdater');
      const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
      const { NodeHttpExecutor } = require('builder-util/out/nodeHttpExecutor');

      const appAdapter = {
        whenReady: () => (this.app ? this.app.whenReady() : Promise.resolve()),
        get version() { return this.currentVersion; },
        get name() { return 'RT-Library'; },
        get isPackaged() { return this.isPackaged; },
        get appUpdateConfigPath() { return ''; },
        get userDataPath() { return this.app ? this.app.getPath('userData') : '/tmp'; },
        get baseCachePath() { return this.app ? this.app.getPath('userData') : '/tmp'; },
        quit: () => { if (this.app) this.app.quit(); },
        relaunch: () => { if (this.app) this.app.relaunch(); },
        onQuit: (handler) => { if (this.app) this.app.once('quit', (_, code) => handler(code)); },
      };

      if (this.platform === 'linux') {
        this.autoUpdater = new AppImageUpdater(null, appAdapter);
      } else if (this.platform === 'win32') {
        this.autoUpdater = new NsisUpdater(null, appAdapter);
      } else {
        return null;
      }

      this.autoUpdater.httpExecutor = new NodeHttpExecutor();
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
        this.handleError(err);
      });

      return this.autoUpdater;
    } catch (err) {
      console.error('[UPDATER][INIT_ERROR]', err.message);
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
      this.handleUpdateNotAvailable(info);
      return;
    }

    console.info(`[UPDATER] Update available: ${cleanVersion} (current: ${this.currentVersion})`);
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
    this.emitChange();
  }

  handleUpdateDownloaded(info) {
    console.info(`[UPDATER] Update downloaded successfully: ${this.status.availableVersion}`);
    this.status.state = UpdaterState.DOWNLOADED;
    this.status.progress = 100;
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();
  }

  handleError(err) {
    const rawMsg = err ? (err.message || String(err)) : 'Unknown error';
    console.error('[UPDATER][ERROR]', rawMsg);

    this.status.state = UpdaterState.ERROR;
    if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('EAI_AGAIN') || rawMsg.includes('ETIMEDOUT') || rawMsg.includes('net::ERR_INTERNET_DISCONNECTED')) {
      this.status.errorCode = UpdaterErrorCode.NETWORK_UNAVAILABLE;
      this.status.errorMessage = 'Unable to check for updates. Please check your internet connection.';
    } else if (rawMsg.includes('404') || rawMsg.includes('latest-linux.yml') || rawMsg.includes('latest.yml')) {
      this.status.errorCode = UpdaterErrorCode.RELEASE_METADATA_INVALID;
      this.status.errorMessage = 'Update metadata could not be found on GitHub Releases.';
    } else {
      this.status.errorCode = UpdaterErrorCode.UPDATE_CHECK_FAILED;
      this.status.errorMessage = 'Unable to check for updates at this time.';
    }

    this.emitChange();
  }

  checkForUpdates(isManual = false) {
    if (!this.checkPlatformSupport()) {
      return Promise.resolve(this.getStatus());
    }

    // Duplicate check protection: share active Promise
    if (this.activeCheckPromise) {
      console.info('[UPDATER] Update check already in progress, returning active check.');
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
        return this.getStatus();
      } catch (err) {
        this.handleError(err);
        return this.getStatus();
      } finally {
        this.activeCheckPromise = null;
      }
    })();

    return this.activeCheckPromise;
  }

  async downloadUpdate() {
    if (!this.status.isSupported) {
      throw new Error(this.status.errorMessage || 'Updates unsupported.');
    }

    if (this.status.state !== UpdaterState.UPDATE_AVAILABLE && this.status.state !== UpdaterState.ERROR) {
      return this.getStatus();
    }

    this.status.state = UpdaterState.DOWNLOADING;
    this.status.progress = 0;
    this.status.errorCode = null;
    this.status.errorMessage = null;
    this.emitChange();

    try {
      const updater = this.ensureAutoUpdater();
      if (!updater) throw new Error('Auto updater unavailable.');
      await updater.downloadUpdate();
      return this.getStatus();
    } catch (err) {
      this.handleError(err);
      throw err;
    }
  }

  async quitAndInstall() {
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
