import path from 'path';
import os from 'os';
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
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(true);
    expect(status.state).toBe(UpdaterState.IDLE);
    expect(status.currentVersion).toBe('1.1.0');
  });

  it('correctly reports SUPPORTED on packaged Windows portable build in writable directory', () => {
    const testExe = path.join(os.tmpdir(), 'RT-Library-1.1.0-windows-x64-portable.exe');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'win32',
      env: { PORTABLE_EXECUTABLE_FILE: testExe },
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(true);
    expect(status.state).toBe(UpdaterState.IDLE);
  });

  it('correctly reports UNSUPPORTED on Windows portable build in read-only directory', () => {
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'win32',
      env: { PORTABLE_EXECUTABLE_FILE: '/root/read-only-dir/app.exe' },
    });

    const status = manager.getStatus();
    expect(status.isSupported).toBe(false);
    expect(status.state).toBe(UpdaterState.UNSUPPORTED);
    expect(status.errorCode).toBe(UpdaterErrorCode.READ_ONLY_LOCATION);
  });

  it('correctly handles newer version available (SemVer)', () => {
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
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
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.2.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
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
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
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
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
    });

    manager.handleUpdateDownloaded({ version: '1.2.0' });
    expect(manager.getStatus().state).toBe(UpdaterState.DOWNLOADED);
    expect(manager.getStatus().progress).toBe(100);
  });

  it('prevents quitAndInstall while sync is active', async () => {
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
      syncActiveProvider: () => true, // Sync in progress!
    });

    manager.handleUpdateDownloaded({ version: '1.2.0' });

    await expect(manager.quitAndInstall()).rejects.toThrow(/synchronization is currently running/);
  });

  it('prevents duplicate concurrent checks', async () => {
    const testAppImage = path.join(os.tmpdir(), 'test.AppImage');
    const manager = new UpdaterManager({
      app: mockApp,
      isPackaged: true,
      currentVersion: '1.1.0',
      platform: 'linux',
      env: { APPIMAGE: testAppImage },
    });

    // Mock ensureAutoUpdater
    const fakeUpdater = {
      checkForUpdates: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 50))),
    };
    (manager as any).ensureAutoUpdater = () => fakeUpdater;

    const p1 = manager.checkForUpdates();
    const p2 = manager.checkForUpdates();

    await Promise.all([p1, p2]);
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
    expect(manager.getStatus().errorCode).toBe(UpdaterErrorCode.UPDATE_METADATA_MISSING);
    expect(manager.getStatus().errorMessage).toContain('Update information is temporarily unavailable');
  });
});

