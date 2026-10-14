import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdaterState, UpdaterErrorCode } from '../../electron/updater/updaterTypes.cjs';
import { UpdaterManager } from '../../electron/updater/updaterManager.cjs';

describe('UpdaterManager Unit Tests', () => {
  let mockApp: any;

  beforeEach(() => {
    mockApp = {
      getVersion: () => '1.1.0',
      isPackaged: true,
      getPath: (name: string) => `/tmp/rt-mock-${name}`,
      whenReady: () => Promise.resolve(),
      quit: vi.fn(),
      relaunch: vi.fn(),
      once: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly reports UNSUPPORTED when isPackaged is false (Development build)', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: false,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/path/to/app.AppImage' },
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(false);
    expect(status.state).toBe(UpdaterState.UNSUPPORTED);
    expect(status.errorCode).toBe(UpdaterErrorCode.DEV_MODE_UNSUPPORTED);
  });

  it('correctly reports UNSUPPORTED on Linux if not running from an AppImage', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: {}, // No APPIMAGE env var
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(false);
    expect(status.state).toBe(UpdaterState.UNSUPPORTED);
    expect(status.errorCode).toBe(UpdaterErrorCode.UNSUPPORTED_INSTALL_TYPE);
  });

  it('correctly reports SUPPORTED on Linux AppImage in writable directory', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(true);
    expect(status.state).toBe(UpdaterState.IDLE);
    expect(status.currentVersion).toBe('1.1.0');
  });

  it('correctly reports SUPPORTED on packaged Windows NSIS build', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'win32',
      env: {},
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(true);
    expect(status.state).toBe(UpdaterState.IDLE);
  });

  it('correctly handles newer version available (SemVer)', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    let lastEmitted: any = null;
    manager.on('status-changed', (s) => { lastEmitted = s; });

    manager.handleUpdateAvailable({
      version: '1.2.0',
      releaseDate: '2026-10-15T00:00:00Z',
      releaseNotes: 'Fixed bugs and improved performance',
    });

    expect(manager.getStatus().state).toBe(UpdaterState.UPDATE_AVAILABLE);
    expect(manager.getStatus().availableVersion).toBe('1.2.0');
    expect(manager.getStatus().releaseNotes).toBe('Fixed bugs and improved performance');
    expect(lastEmitted?.state).toBe(UpdaterState.UPDATE_AVAILABLE);
  });

  it('ignores older or same versions (downgrade/same-version protection)', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.2.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    // Remote version same as current
    manager.handleUpdateAvailable({ version: '1.2.0' });
    expect(manager.getStatus().state).toBe(UpdaterState.UP_TO_DATE);
    expect(manager.getStatus().availableVersion).toBeNull();

    // Remote version older than current
    manager.handleUpdateAvailable({ version: '1.1.0' });
    expect(manager.getStatus().state).toBe(UpdaterState.UP_TO_DATE);
  });

  it('tracks download progress accurately', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    manager.handleDownloadProgress({
      percent: 45.8,
      bytesPerSecond: 5242880,
      transferred: 45000000,
      total: 100000000,
    });

    const status = manager.getStatus();
    expect(status.state).toBe(UpdaterState.DOWNLOADING);
    expect(status.progress).toBe(46);
    expect(status.bytesPerSecond).toBe(5242880);
    expect(status.transferred).toBe(45000000);
    expect(status.total).toBe(100000000);
  });

  it('transitions to DOWNLOADED when download completes', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    manager.handleUpdateDownloaded({ version: '1.2.0' });
    expect(manager.getStatus().state).toBe(UpdaterState.DOWNLOADED);
    expect(manager.getStatus().progress).toBe(100);
  });

  it('prevents quitAndInstall while sync is active', async () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
      syncActiveProvider: () => true, // Sync in progress!
    });

    manager.handleUpdateDownloaded({ version: '1.2.0' });

    await expect(manager.quitAndInstall()).rejects.toThrow(/synchronization is currently running/);
  });

  it('prevents duplicate concurrent checks', async () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    // Mock ensureAutoUpdater
    const fakeUpdater = {
      checkForUpdates: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 50))),
    };
    (manager as any).ensureAutoUpdater = () => fakeUpdater;

    const p1 = manager.checkForUpdates();
    const p2 = manager.checkForUpdates();

    expect(p1).toBe(p2); // Exactly identical promise shared!
    await p1;
    expect(fakeUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('normalizes error messages safely without exposing machine paths', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: '/tmp/test.AppImage' },
    });

    manager.handleError(new Error('getaddrinfo EAI_AGAIN github.com'));
    expect(manager.getStatus().state).toBe(UpdaterState.ERROR);
    expect(manager.getStatus().errorCode).toBe(UpdaterErrorCode.NETWORK_UNAVAILABLE);
    expect(manager.getStatus().errorMessage).toContain('check your internet connection');

    manager.handleError(new Error('Cannot find /home/user/dist-desktop/latest-linux.yml 404'));
    expect(manager.getStatus().errorCode).toBe(UpdaterErrorCode.RELEASE_METADATA_INVALID);
    expect(manager.getStatus().errorMessage).toContain('Update metadata could not be found');
  });
});

