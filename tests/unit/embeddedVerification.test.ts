import { describe, expect, it, vi, beforeEach } from 'vitest';
const { EmbeddedElectronTransport } = require('../../electron/scraper/embeddedElectronTransport.cjs');
const ScraperManager = require('../../electron/scraper/scraperManager.cjs');
const { SCRAPER_STATES } = require('../../scraper/protocol.cjs');

function createMockElectron() {
  const listeners: Record<string, Function[]> = {};

  const mockWebContents = {
    setWindowOpenHandler: vi.fn(),
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    removeListener: vi.fn((event, cb) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(fn => fn !== cb);
      }
    }),
    executeJavaScript: vi.fn().mockResolvedValue('<html><body><div id="page_container"><table class="forumline"></table></div></body></html>'),
    getURL: vi.fn().mockReturnValue('https://rutracker.org/forum/index.php'),
    stop: vi.fn(),
  };

  const mockWindowInstance = {
    loadURL: vi.fn().mockResolvedValue(undefined),
    getTitle: vi.fn().mockReturnValue('RuTracker.org'),
    close: vi.fn().mockImplementation(() => {
      mockWindowInstance._isDestroyed = true;
      (listeners['closed'] || []).forEach(cb => cb());
    }),
    destroy: vi.fn().mockImplementation(() => {
      mockWindowInstance._isDestroyed = true;
      (listeners['closed'] || []).forEach(cb => cb());
    }),
    isDestroyed: vi.fn().mockImplementation(() => Boolean(mockWindowInstance._isDestroyed)),
    focus: vi.fn(),
    webContents: mockWebContents,
    _isDestroyed: false,
    _listeners: listeners,
    on: vi.fn((event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
  };

  const mockSession = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    on: vi.fn(),
    clearCache: vi.fn().mockResolvedValue(undefined),
    clearStorageData: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowserWindow = vi.fn().mockImplementation(function (opts) {
    mockWindowInstance._options = opts;
    mockWindowInstance._isDestroyed = false;
    return mockWindowInstance;
  });

  return {
    app: {
      getPath: vi.fn().mockReturnValue('/tmp/rt-test-userdata'),
    },
    BrowserWindow: mockBrowserWindow,
    session: {
      fromPartition: vi.fn().mockReturnValue(mockSession),
    },
    _mockWindowInstance: mockWindowInstance,
    _mockSession: mockSession,
    _listeners: listeners,
  };
}

describe('In-App Verification & Embedded Session Recovery (V3-81)', () => {
  beforeEach(() => {
    const manager = ScraperManager.getInstance();
    manager.setState(SCRAPER_STATES.IDLE);
    manager.isEmbeddedScanning = false;
    manager.isCompanionScanning = false;
    manager.isVerificationWaiting = false;
    manager.childProcess = null;
    manager.probeSession = null;
    manager.pendingScanIntent = null;
  });

  it('creates verification window with exact persist:rutracker-v1 session and hardened sandbox', async () => {
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      sessionPartition: 'persist:rutracker-v1',
      electron: mockElectron,
    });

    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php');

    expect(mockElectron.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        show: true,
        title: expect.stringContaining('RuTracker Verification'),
        webPreferences: expect.objectContaining({
          session: mockElectron._mockSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        }),
      })
    );

    const result = await verifyPromise;
    expect(result.success).toBe(true);
    expect(result.status).toBe('FORUM_READY');
  });

  it('enforces singleton verification window: focuses existing window instead of duplicating', async () => {
    const mockElectron = createMockElectron();
    // Simulate pending verification by returning challenge HTML on initial JS evaluation
    mockElectron._mockWindowInstance.webContents.executeJavaScript = vi.fn()
      .mockResolvedValueOnce('<html><title>Just a moment...</title><body>Checking your browser</body></html>');

    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    const promise1 = transport.openVerificationWindow('https://rutracker.org/forum/index.php');
    promise1.catch(() => {});
    expect(mockElectron.BrowserWindow).toHaveBeenCalledTimes(1);

    const promise2 = transport.openVerificationWindow('https://rutracker.org/forum/viewforum.php?f=1605');
    // Did not create a new window
    expect(mockElectron.BrowserWindow).toHaveBeenCalledTimes(1);
    // Focused the existing window
    expect(mockElectron._mockWindowInstance.focus).toHaveBeenCalled();
    // Returned the exact same promise
    expect(promise1).toBe(promise2);

    transport.closeVerificationWindow();
  });

  it('rejects with VERIFICATION_CANCELLED_BY_USER if user closes window without completing challenge', async () => {
    const mockElectron = createMockElectron();
    // Window displays challenge
    mockElectron._mockWindowInstance.webContents.executeJavaScript = vi.fn()
      .mockResolvedValue('<html><title>Just a moment...</title><body>Cloudflare challenge</body></html>');

    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php');

    // Simulate user manually closing window
    mockElectron._mockWindowInstance.close();

    await expect(verifyPromise).rejects.toMatchObject({
      code: 'VERIFICATION_CANCELLED_BY_USER',
    });
  });

  it('resetSession() clears storage and cache for persist:rutracker-v1 cleanly', async () => {
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    const result = await transport.resetSession();
    expect(result.success).toBe(true);
    expect(mockElectron._mockSession.clearCache).toHaveBeenCalled();
    expect(mockElectron._mockSession.clearStorageData).toHaveBeenCalledWith(
      expect.objectContaining({
        storages: expect.arrayContaining(['cookies', 'localstorage', 'indexdb']),
      })
    );
  });

  it('scraperManager resumes waiting scan job upon successful embedded verification', async () => {
    const manager = ScraperManager.getInstance();
    manager.isVerificationWaiting = true;
    manager.setState(SCRAPER_STATES.INTERACTION_REQUIRED);

    let resolvedData: any = null;
    manager._verificationResolver = (data: any) => {
      resolvedData = data;
    };

    const mockElectron = createMockElectron();
    manager.embeddedTransport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    const result = await manager.openEmbeddedVerification({ categoryId: 'switch' });

    expect(result.success).toBe(true);
    expect(manager.isVerificationWaiting).toBe(false);
    expect(manager.state).toBe(SCRAPER_STATES.RUNNING);
    expect(resolvedData).toMatchObject({ resumed: true });
  });

  it('scraperManager cancel() aborts verification wait cleanly without errors', async () => {
    const manager = ScraperManager.getInstance();
    manager.isVerificationWaiting = true;
    manager.isEmbeddedScanning = true;

    let rejectedErr: any = null;
    manager._verificationRejecter = (err: any) => {
      rejectedErr = err;
    };

    const cancelResult = await manager.cancel();

    expect(cancelResult.success).toBe(true);
    expect(manager.isVerificationWaiting).toBe(false);
    expect(rejectedErr).toBeDefined();
    expect(rejectedErr.message).toContain('CANCELLED');
  });

  it('probeAccess routes to embedded access check when EMBEDDED_ELECTRON is active without touching scraper-profile', async () => {
    const manager = ScraperManager.getInstance();
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });
    vi.spyOn(transport, 'checkAccess').mockResolvedValue({
      status: 'FORUM_READY',
      httpStatus: 200,
      categoryId: 'switch',
      categoryName: 'Nintendo Switch',
    });
    manager.setEmbeddedTransport(transport);

    const result = await manager.probeAccess({ transport: 'EMBEDDED_ELECTRON', category: 'switch' });

    expect(result.status).toBe('ACCESSIBLE');
    expect(result.results[0].transport).toBe('EMBEDDED_ELECTRON');
    expect(transport.checkAccess).toHaveBeenCalled();
  });

  it('start() emits structured [SCRAPER][TRANSPORT] log and clears pendingScanIntent for EMBEDDED_ELECTRON', async () => {
    const manager = ScraperManager.getInstance();
    manager.pendingScanIntent = { some: 'intent' };
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });
    manager.setEmbeddedTransport(transport);

    const startWithEmbeddedSpy = vi.spyOn(manager, 'startWithEmbedded').mockResolvedValue({ success: true, totalItems: 0 });

    const logs: string[] = [];
    vi.spyOn(manager, 'addLog').mockImplementation((logEntry: any) => {
      logs.push(logEntry.message);
    });

    await manager.start({ transport: 'EMBEDDED_ELECTRON', category: 'switch' });

    expect(manager.pendingScanIntent).toBeNull();
    expect(startWithEmbeddedSpy).toHaveBeenCalled();
    const transportLog = logs.find(l => l.includes('[SCRAPER][TRANSPORT]'));
    expect(transportLog).toBeDefined();
    expect(transportLog).toContain('preference=EMBEDDED_ELECTRON');
    expect(transportLog).toContain('resolved=EMBEDDED_ELECTRON');
    expect(transportLog).toContain('session=persist:rutracker-v1');
  });

  it('does NOT increment attempts on repeated polling of the same challenge document (Rule 67)', async () => {
    const mockElectron = createMockElectron();
    mockElectron._mockWindowInstance.webContents.executeJavaScript.mockResolvedValue(
      '<html><body><div id="challenge-platform">Checking your browser</div>Ray ID: 8abc123</body></html>'
    );
    mockElectron._mockWindowInstance.getTitle.mockReturnValue('Just a moment...');

    const transport = new EmbeddedElectronTransport({
      sessionPartition: 'persist:rutracker-v1',
      electron: mockElectron,
    });

    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php', {
      debounceMs: 5,
    });

    // Fire initial dom-ready/finish load
    const finishListeners = mockElectron._listeners['did-finish-load'] || [];
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));

    // Fire duplicate finish-load and interval ticks on the exact SAME document
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));

    // Verify window is still open waiting for human interaction and has not entered loop
    expect(transport.isVerificationWindowOpen()).toBe(true);

    transport.closeVerificationWindow();
    await verifyPromise.catch(() => {});
  });

  it('rejects with VERIFICATION_LOOP when distinct challenge cycles repeat up to max attempts (Rules 37, 68)', async () => {
    const mockElectron = createMockElectron();
    let currentRay = '8abc111';
    mockElectron._mockWindowInstance.webContents.executeJavaScript.mockImplementation(async () => {
      return `<html><body><div id="challenge-platform">Checking your browser</div>Ray ID: ${currentRay}</body></html>`;
    });
    mockElectron._mockWindowInstance.getTitle.mockReturnValue('Just a moment...');

    const transport = new EmbeddedElectronTransport({
      sessionPartition: 'persist:rutracker-v1',
      electron: mockElectron,
    });

    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php', {
      debounceMs: 5,
    });
    const assertionPromise = expect(verifyPromise).rejects.toMatchObject({
      code: 'VERIFICATION_LOOP',
      attempts: 3,
    });

    const startNavListeners = mockElectron._listeners['did-start-navigation'] || [];
    const didNavListeners = mockElectron._listeners['did-navigate'] || [];
    const finishListeners = mockElectron._listeners['did-finish-load'] || [];

    // Cycle 1: initial load
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));

    // Cycle 2: human interacted, page navigated, new challenge with different Ray ID returned
    currentRay = '8abc222';
    startNavListeners.forEach(fn => fn());
    didNavListeners.forEach(fn => fn());
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));

    // Cycle 3: human interacted again, page navigated, third challenge returned
    currentRay = '8abc333';
    startNavListeners.forEach(fn => fn());
    didNavListeners.forEach(fn => fn());
    finishListeners.forEach(fn => fn());
    await new Promise(r => setTimeout(r, 20));

    await assertionPromise;
  });

  it('correctly classifies forum fixture with residual Cloudflare scripts as FORUM_READY (Rules 20, 70)', () => {
    const fs = require('fs');
    const path = require('path');
    const { inspectContent } = require('../../electron/scraper/embeddedElectronTransport.cjs');
    const fixturePath = path.resolve(__dirname, '../fixtures/rutracker-html/forum-with-cloudflare-residual.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');

    const result = inspectContent(fixtureHtml, 'Nintendo Switch :: RuTracker.org', 200);

    expect(result.status).toBe('FORUM_READY');
    expect(result.forumDetected).toBe(true);
    expect(result.challengeDetected).toBe(false);
  });

  it('suspends checkAccess while verification window is open, returning VERIFICATION_IN_PROGRESS (Rule 71)', async () => {
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    // Open verification window
    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php');
    verifyPromise.catch(() => {}); // Safely handle expected rejection on close
    expect(transport.isVerificationWindowOpen()).toBe(true);

    // Call checkAccess while window is active
    const probeResult = await transport.checkAccess({ id: 'switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' });

    expect(probeResult.status).toBe('VERIFICATION_IN_PROGRESS');
    expect(probeResult.forumDetected).toBe(false);

    transport.closeVerificationWindow();
  });

  it('inspectContent prioritizes valid forum markers over residual challenge scripts (Rules 51-53)', () => {
    const { inspectContent } = require('../../electron/scraper/embeddedElectronTransport.cjs');
    // HTML containing valid forum table AND residual cf- / challenge-platform script in footer
    const mixedHtml = `
      <html>
        <head><title>Nintendo Switch :: RuTracker.org</title></head>
        <body>
          <table class="forumline"><tr><td class="torTopic">Game</td></tr></table>
          <script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>
        </body>
      </html>
    `;
    const result = inspectContent(mixedHtml, 'Nintendo Switch :: RuTracker.org', 200);

    expect(result.status).toBe('FORUM_READY');
    expect(result.forumDetected).toBe(true);
    expect(result.challengeDetected).toBe(false);
  });

  it('handles duplicate did-finish-load events gracefully without duplicate resolution (Rules 49, 66)', async () => {
    const mockElectron = createMockElectron();
    mockElectron._mockWindowInstance.webContents.executeJavaScript.mockResolvedValue(
      '<html><body><table class="forumline"><tr><td>Ready</td></tr></table></body></html>'
    );
    mockElectron._mockWindowInstance.getTitle.mockReturnValue('RuTracker.org');

    const transport = new EmbeddedElectronTransport({
      sessionPartition: 'persist:rutracker-v1',
      electron: mockElectron,
    });

    const verifyPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php');

    // Fire duplicate did-finish-load events
    const finishListeners = mockElectron._listeners['did-finish-load'] || [];
    finishListeners.forEach(fn => fn());
    finishListeners.forEach(fn => fn());

    const result = await verifyPromise;
    expect(result.success).toBe(true);
    expect(result.status).toBe('FORUM_READY');
  });

  it('resumeGeneration guard ensures waiting workers are resumed exactly once with generation tracking (Rules 14, 49)', async () => {
    const manager = ScraperManager.getInstance();
    manager.isVerificationWaiting = true;
    let resolvedData: any = null;

    manager._verificationResolvers = [
      (data: any) => { resolvedData = data; }
    ];

    manager.resume();

    expect(resolvedData).toBeDefined();
    expect(resolvedData.resumed).toBe(true);
    expect(resolvedData.resumeGeneration).toBeGreaterThan(0);
    expect(manager.isVerificationWaiting).toBe(false);
  });

  it('suspends worker navigations while verification window is open (Rules 9, 10, 49)', async () => {
    const mockElectron = createMockElectron();
    const transport = new EmbeddedElectronTransport({
      electron: mockElectron,
    });

    // Open verification window
    const vPromise = transport.openVerificationWindow('https://rutracker.org/forum/index.php');
    vPromise.catch(() => {});
    expect(transport.isVerificationWindowOpen()).toBe(true);

    // Call fetchTopic while window is active -> should be suspended
    let topicCompleted = false;
    const fetchPromise = transport.fetchTopic({ url: 'https://rutracker.org/forum/viewtopic.php?t=123' }, { id: 'test' }).then(() => {
      topicCompleted = true;
    }).catch(() => {});

    // Give microtasks time to run
    await new Promise(r => setTimeout(r, 50));
    expect(topicCompleted).toBe(false);

    transport.closeVerificationWindow();
    await fetchPromise;
  });
});
