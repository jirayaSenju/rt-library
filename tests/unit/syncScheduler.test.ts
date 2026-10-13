import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockShell, mockPowerMonitor } = vi.hoisted(() => {
  return {
    mockShell: {
      openExternal: vi.fn(async () => true),
      openPath: vi.fn(),
    },
    mockPowerMonitor: {
      on: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  shell: mockShell,
  powerMonitor: mockPowerMonitor,
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '3.0.0'),
  },
  default: {
    shell: mockShell,
    powerMonitor: mockPowerMonitor,
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
    app: {
      getPath: vi.fn(() => '/tmp'),
      getVersion: vi.fn(() => '3.0.0'),
    },
  },
}));

const dbMain = require('../../electron/database/dbMain.cjs');
const appStateRepo = require('../../electron/database/repositories/appStateRepo.cjs');
const ScraperManager = require('../../electron/scraper/scraperManager.cjs');
const syncScheduler = require('../../electron/scraper/syncScheduler.cjs');

describe('V3-77 Smart Scheduled Sync & Idle-Aware Automation', () => {
  let mockDbState: Record<string, any> = {};
  let mockManager: any;
  let mockCompanion: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbState = {
      initial_scan_completed: 'true',
    };

    // Mock dbMain and appStateRepo
    vi.spyOn(dbMain, 'getDatabase').mockReturnValue({} as any);
    vi.spyOn(appStateRepo, 'getAppState').mockImplementation((_db, key) => {
      return mockDbState[key] ?? null;
    });
    vi.spyOn(appStateRepo, 'setAppState').mockImplementation((_db, key, val) => {
      mockDbState[key] = typeof val === 'string' ? val : JSON.stringify(val);
      return true;
    });

    // Mock companion transport
    mockCompanion = {
      isAvailable: vi.fn(() => true),
      checkAccess: vi.fn(async () => ({
        status: 'FORUM_READY',
        httpStatus: 200,
        bytes: 50000,
        forumDetected: true,
        cfMitigated: false,
      })),
    };

    // Mock ScraperManager
    mockManager = {
      isProfileBusy: vi.fn(() => false),
      getState: vi.fn(() => ({ isRunning: false, state: 'idle' })),
      getCompanionTransport: vi.fn(() => mockCompanion),
      start: vi.fn(async () => ({ success: true })),
    };
    vi.spyOn(ScraperManager, 'getInstance').mockReturnValue(mockManager);
    mockShell.openExternal.mockClear();

    syncScheduler.stopSyncScheduler();
  });

  afterEach(() => {
    syncScheduler.stopSyncScheduler();
    vi.restoreAllMocks();
  });

  describe('Configuration & Validation', () => {
    it('initializes with default configuration (disabled by default)', () => {
      const config = syncScheduler.validateAndNormalizeConfig({});
      expect(config.enabled).toBe(false);
      expect(config.scheduleType).toBe('6h');
      expect(config.intervalMinutes).toBe(360);
      expect(config.scope).toBe('ALL_ENABLED');
    });

    it('enforces minimum interval (60 minutes) in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalDev = process.env.RT_LIBRARY_DEV_SCHEDULE;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.RT_LIBRARY_DEV_SCHEDULE;

        const config = syncScheduler.validateAndNormalizeConfig({
          scheduleType: 'custom',
          intervalMinutes: 5, // Attempt sub-hour interval
        });
        expect(config.intervalMinutes).toBe(60);
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.RT_LIBRARY_DEV_SCHEDULE = originalDev;
      }
    });

    it('calculates presets accurately', () => {
      const from = new Date('2026-10-10T12:00:00.000Z');
      const next1h = syncScheduler.calculateNextRun(60, from);
      expect(next1h).toBe('2026-10-10T13:00:00.000Z');

      const next6h = syncScheduler.calculateNextRun(360, from);
      expect(next6h).toBe('2026-10-10T18:00:00.000Z');

      const nextDaily = syncScheduler.calculateNextRun(1440, from);
      expect(nextDaily).toBe('2026-10-11T12:00:00.000Z');
    });

    it('sanitizes and strips secrets before persisting', () => {
      const updated = syncScheduler.updateSchedulerConfig({
        enabled: true,
        intervalMinutes: 180,
        scheduleType: '3h',
        sessionToken: 'SECRET_TOKEN_DO_NOT_PERSIST',
        sessionId: 'SECRET_SESSION_ID',
      } as any);

      expect((updated as any).sessionToken).toBeUndefined();
      expect((updated as any).sessionId).toBeUndefined();

      const saved = JSON.parse(mockDbState['scraper_sync_schedule']);
      expect(saved.sessionToken).toBeUndefined();
      expect(saved.sessionId).toBeUndefined();
      expect(saved.enabled).toBe(true);
      expect(saved.intervalMinutes).toBe(180);
    });
  });

  describe('Preflight Guards & Safe Execution Invariants', () => {
    it('does not start any job when scheduler is disabled', async () => {
      syncScheduler.updateSchedulerConfig({ enabled: false });

      const res = await syncScheduler.runDueCheck();
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('SCHEDULER_DISABLED');
      expect(mockManager.start).not.toHaveBeenCalled();
    });

    it('skips safely when initial library onboarding is pending', async () => {
      mockDbState.initial_scan_completed = 'false';
      syncScheduler.updateSchedulerConfig({ enabled: true });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('INITIAL_SETUP_PENDING');
      expect(mockManager.start).not.toHaveBeenCalled();
    });

    it('defers safely without failure when scraper is currently busy (single job invariant)', async () => {
      mockManager.isProfileBusy.mockReturnValue(true);
      syncScheduler.updateSchedulerConfig({ enabled: true });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('SCRAPER_BUSY');
      expect(mockManager.start).not.toHaveBeenCalled();

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastSkipReason).toBe('SCRAPER_BUSY');
    });

    it('skips safely and does not open browser when Browser Companion is disconnected', async () => {
      mockCompanion.isAvailable.mockReturnValue(false);
      syncScheduler.updateSchedulerConfig({ enabled: true });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('COMPANION_DISCONNECTED');
      expect(mockManager.start).not.toHaveBeenCalled();
      expect(mockShell.openExternal).not.toHaveBeenCalled();

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastSkipReason).toBe('COMPANION_DISCONNECTED');
    });

    it('skips safely and does not auto-open browser when RuTracker tab is missing', async () => {
      mockCompanion.checkAccess.mockResolvedValue({
        status: 'NO_RUTRACKER_TAB',
      });
      syncScheduler.updateSchedulerConfig({ enabled: true });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('NO_RUTRACKER_TAB');
      expect(mockManager.start).not.toHaveBeenCalled();
      expect(mockShell.openExternal).not.toHaveBeenCalled();

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastSkipReason).toBe('NO_RUTRACKER_TAB');
    });

    it('skips safely without automating interaction when verification is required', async () => {
      mockCompanion.checkAccess.mockResolvedValue({
        status: 'VERIFICATION_REQUIRED',
      });
      syncScheduler.updateSchedulerConfig({ enabled: true });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('VERIFICATION_REQUIRED');
      expect(mockManager.start).not.toHaveBeenCalled();
      expect(mockShell.openExternal).not.toHaveBeenCalled();

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastSkipReason).toBe('VERIFICATION_REQUIRED');
    });

    it('starts incremental sync with triggerType=SCHEDULED and transport=BROWSER_COMPANION when READY', async () => {
      syncScheduler.updateSchedulerConfig({
        enabled: true,
        scope: 'ALL_ENABLED',
      });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(true);
      expect(res.skipped).toBe(false);

      expect(mockManager.start).toHaveBeenCalledTimes(1);
      const startArgs = mockManager.start.mock.calls[0][0];
      expect(startArgs.triggerType).toBe('SCHEDULED');
      expect(startArgs.transport).toBe('BROWSER_COMPANION');
      expect(startArgs.full).toBe(false);

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastStartedAt).toBeTruthy();
      expect(status.lastSkipReason).toBeNull();
      expect(status.nextRunAt).toBeTruthy();
    });

    it('passes selected categories when scope is SELECTED', async () => {
      syncScheduler.updateSchedulerConfig({
        enabled: true,
        scope: 'SELECTED',
        categoryIds: ['switch', 'ps4'],
      });

      const res = await syncScheduler.runDueCheck(true);
      expect(res.executed).toBe(true);
      expect(mockManager.start).toHaveBeenCalledTimes(1);
      const startArgs = mockManager.start.mock.calls[0][0];
      expect(startArgs.categoryIds).toEqual(['switch', 'ps4']);
    });
  });

  describe('Missed Runs, App Restart & System Sleep Handling', () => {
    it('does not burst catch-up jobs on startup if scheduled time passed while app was closed', () => {
      const pastTime = new Date('2026-10-09T08:00:00.000Z').toISOString();
      mockDbState['scraper_sync_schedule'] = JSON.stringify({
        enabled: true,
        scheduleType: '6h',
        intervalMinutes: 360,
        nextRunAt: pastTime,
      });

      syncScheduler.initSyncScheduler();

      // Ensure no job was instantly fired
      expect(mockManager.start).not.toHaveBeenCalled();

      // Verify nextRunAt was safely recalculated from now
      const status = syncScheduler.getSchedulerStatus();
      expect(new Date(status.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('handles sleep resume without burst runs', async () => {
      syncScheduler.updateSchedulerConfig({
        enabled: true,
        nextRunAt: new Date(Date.now() - 10000).toISOString(), // Overdue
      });

      // Simulate powerMonitor resume
      const res1 = await syncScheduler.runDueCheck();
      expect(res1.executed).toBe(true);
      expect(mockManager.start).toHaveBeenCalledTimes(1);

      // Verify second immediate check is not run
      const res2 = await syncScheduler.runDueCheck();
      expect(res2.executed).toBe(false);
      expect(res2.skipped).toBe(true);
      expect(mockManager.start).toHaveBeenCalledTimes(1);
    });

    it('clears timer when scheduler is disabled without terminating running job', () => {
      syncScheduler.updateSchedulerConfig({ enabled: true });
      syncScheduler.updateSchedulerConfig({ enabled: false });

      const status = syncScheduler.getSchedulerStatus();
      expect(status.enabled).toBe(false);
      expect(status.nextRunAt).toBeNull();
    });
  });

  describe('Autonomous Embedded Electron Scheduler Integration (V3-82)', () => {
    it('executes autonomous scheduled scan via EMBEDDED_ELECTRON when ready without browser companion', async () => {
      const mockEmbedded = {
        checkAccess: vi.fn(async () => ({
          status: 'FORUM_READY',
          httpStatus: 200,
          topicCount: 50,
        })),
      };
      mockManager.getEmbeddedTransport = vi.fn(() => mockEmbedded);
      mockManager.getCompanionTransport = vi.fn(() => null); // Disconnected companion!

      syncScheduler.updateSchedulerConfig({
        enabled: true,
        transport: 'EMBEDDED_ELECTRON',
        nextRunAt: new Date(Date.now() - 5000).toISOString(),
      });

      const res = await syncScheduler.runDueCheck();
      expect(res.executed).toBe(true);
      expect(mockEmbedded.checkAccess).toHaveBeenCalled();
      expect(mockManager.start).toHaveBeenCalledWith(expect.objectContaining({
        transport: 'EMBEDDED_ELECTRON',
        triggerType: 'SCHEDULED',
      }));
    });

    it('skips safely with VERIFICATION_REQUIRED and never opens window when embedded hits challenge', async () => {
      const mockEmbedded = {
        checkAccess: vi.fn(async () => ({
          status: 'CHALLENGE_REQUIRED',
          httpStatus: 403,
        })),
      };
      mockManager.getEmbeddedTransport = vi.fn(() => mockEmbedded);

      syncScheduler.updateSchedulerConfig({
        enabled: true,
        transport: 'EMBEDDED_ELECTRON',
        nextRunAt: new Date(Date.now() - 5000).toISOString(),
      });

      const res = await syncScheduler.runDueCheck();
      expect(res.executed).toBe(false);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('VERIFICATION_REQUIRED');
      expect(mockManager.start).not.toHaveBeenCalled();

      const status = syncScheduler.getSchedulerStatus();
      expect(status.lastSkipReason).toBe('VERIFICATION_REQUIRED');
    });
  });
});

