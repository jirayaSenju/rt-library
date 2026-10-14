import { describe, expect, it, vi, beforeEach } from 'vitest';

const createdWindows: any[] = [];
let mockSession: any = {
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  on: vi.fn(),
  webRequest: {
    onHeadersReceived: vi.fn(),
  },
};

class FakeBrowserWindow {
  isDestroyedVal = false;
  webContents: any;
  show = false;

  constructor(options: any) {
    this.show = options.show;
    const listeners: Record<string, Function[]> = {};

    this.webContents = {
      session: mockSession,
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      loadURL: vi.fn().mockResolvedValue(undefined),
      executeJavaScript: vi.fn().mockResolvedValue('<table class="forumline"><tr><td>Ready</td></tr></table>'),
      stop: vi.fn(),
      _emit: (event: string, ...args: any[]) => {
        (listeners[event] || []).forEach(cb => cb(...args));
      },
    };
    createdWindows.push(this);
  }

  getTitle() {
    return 'Switch :: RuTracker.org';
  }

  isDestroyed() {
    return this.isDestroyedVal;
  }

  destroy() {
    this.isDestroyedVal = true;
  }
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-userData'),
  },
  BrowserWindow: FakeBrowserWindow,
  session: {
    fromPartition: vi.fn().mockImplementation(() => mockSession),
  },
}));

const {
  EmbeddedElectronTransport,
  isAllowedUrl,
  inspectContent,
} = require('../../electron/scraper/embeddedElectronTransport.cjs');

describe('EmbeddedElectronTransport Security & Detection Helpers', () => {
  describe('isAllowedUrl', () => {
    it('allows rutracker.org origins', () => {
      expect(isAllowedUrl('https://rutracker.org/forum/viewforum.php?f=1605')).toBe(true);
      expect(isAllowedUrl('https://rutracker.org/forum/viewtopic.php?t=6672322')).toBe(true);
      expect(isAllowedUrl('http://rutracker.org/forum/index.php')).toBe(true);
      expect(isAllowedUrl('https://static.rutracker.org/logo.png')).toBe(true);
    });

    it('allows approved mirror domains', () => {
      expect(isAllowedUrl('https://rutracker.net/forum/viewtopic.php?t=123')).toBe(true);
      expect(isAllowedUrl('https://rutracker.nl/forum/viewtopic.php?t=123')).toBe(true);
      expect(isAllowedUrl('https://rutracker.cc/forum/index.php')).toBe(true);
      expect(isAllowedUrl('https://mirror.t-ru.org/forum/index.php')).toBe(true);
      expect(isAllowedUrl('https://challenges.cloudflare.com/turnstile')).toBe(true);
      expect(isAllowedUrl('https://assets.cf-assets.net/challenge.js')).toBe(true);
    });

    it('blocks unallowed external protocols and origins', () => {
      expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
      expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
      expect(isAllowedUrl('data:text/html,<h1>bad</h1>')).toBe(false);
      expect(isAllowedUrl('magnet:?xt=urn:btih:1234567890abcdef')).toBe(false);
      expect(isAllowedUrl('mailto:test@example.com')).toBe(false);
      expect(isAllowedUrl('https://google.com')).toBe(false);
      expect(isAllowedUrl('https://malicious-site.com')).toBe(false);
      expect(isAllowedUrl('not-a-valid-url')).toBe(false);
    });
  });

  describe('inspectContent', () => {
    it('detects FORUM_READY when forum markers exist', () => {
      const html = '<html><body><table class="forumline"><tr><td>Topic</td></tr></table></body></html>';
      const result = inspectContent(html, 'Switch [стр. 1] :: RuTracker.org', 200);
      expect(result.status).toBe('FORUM_READY');
      expect(result.forumDetected).toBe(true);
      expect(result.challengeDetected).toBe(false);
    });

    it('detects CHALLENGE_REQUIRED on Cloudflare challenge titles or bodies', () => {
      const html = '<html><body><div id="challenge-platform">Checking your browser</div></body></html>';
      const result = inspectContent(html, 'Just a moment...', 403);
      expect(result.status).toBe('CHALLENGE_REQUIRED');
      expect(result.challengeDetected).toBe(true);
      expect(result.forumDetected).toBe(false);

      const ptResult = inspectContent('<div>Verificando...</div>', 'Um momento…', 200);
      expect(ptResult.status).toBe('CHALLENGE_REQUIRED');
    });

    it('detects AUTH_REQUIRED when login form is present without forum table', () => {
      const html = '<html><body><form action="login.php"><input name="login_username" /></form></body></html>';
      const result = inspectContent(html, 'Login :: RuTracker.org', 200);
      expect(result.status).toBe('AUTH_REQUIRED');
      expect(result.authRequired).toBe(true);
    });

    it('detects HTTP_ERROR on 500 or 503 without challenge markers', () => {
      const html = '<html><body>Internal Server Error</body></html>';
      const result = inspectContent(html, '500 Error', 500);
      expect(result.status).toBe('HTTP_ERROR');
    });
  });
});

const mockElectron = {
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/mock-userData'),
  },
  BrowserWindow: FakeBrowserWindow,
  session: {
    fromPartition: vi.fn().mockImplementation(() => mockSession),
  },
};

describe('EmbeddedElectronTransport Lifecycle & Worker Pool', () => {
  beforeEach(() => {
    createdWindows.length = 0;
  });

  it('initializes with bounded pool maxWorkers=3 and hidden configuration', () => {
    const transport = new EmbeddedElectronTransport({ electron: mockElectron });
    expect(transport.id).toBe('EMBEDDED_ELECTRON');
    expect(transport.maxWorkers).toBe(3);
    expect(transport.isAvailable()).toBe(true);

    const status = transport.getStatus();
    expect(status.poolSize).toBe(0);
    expect(status.activeWorkers).toBe(0);
    expect(status.experimental).toBe(true);
  });

  it('bounds worker creation to maxWorkers (C=3)', async () => {
    const transport = new EmbeddedElectronTransport({ maxWorkers: 3, electron: mockElectron });

    const w1 = await transport._acquireWorker();
    const w2 = await transport._acquireWorker();
    const w3 = await transport._acquireWorker();

    expect(createdWindows.length).toBe(3);
    expect(w1.state).toBe('NAVIGATING');
    expect(w2.state).toBe('NAVIGATING');
    expect(w3.state).toBe('NAVIGATING');
    // Ensure all windows were created with show: false
    createdWindows.forEach(w => expect(w.show).toBe(false));

    // Requesting a 4th worker must trigger backpressure (queue) and NOT create a 4th window
    let worker4Resolved = false;
    const p4 = transport._acquireWorker().then((w: any) => {
      worker4Resolved = true;
      return w;
    });

    expect(createdWindows.length).toBe(3);
    expect(worker4Resolved).toBe(false);

    // Releasing w1 allows p4 to resolve using w1
    transport._releaseWorker(w1);
    const w4 = await p4;
    expect(w4).toBe(w1);
    expect(createdWindows.length).toBe(3);

    transport.dispose();
  });

  it('cancels active navigations and clears queue cleanly', async () => {
    const transport = new EmbeddedElectronTransport({ maxWorkers: 2, electron: mockElectron });
    const w1 = await transport._acquireWorker();
    const w2 = await transport._acquireWorker();

    let p3Rejected = false;
    const p3 = transport._acquireWorker().catch(err => {
      if (err.message.includes('CANCELLED')) p3Rejected = true;
    });

    transport.cancel();
    await p3;

    expect(transport.isCancelled).toBe(true);
    expect(w1.window.webContents.stop).toHaveBeenCalled();
    expect(w2.window.webContents.stop).toHaveBeenCalled();
    expect(p3Rejected).toBe(true);

    transport.dispose();
  });

  it('disposes all hidden windows on dispose()', async () => {
    const transport = new EmbeddedElectronTransport({ maxWorkers: 2, electron: mockElectron });
    await transport._acquireWorker();
    await transport._acquireWorker();

    expect(createdWindows.length).toBe(2);
    transport.dispose();

    expect(transport.disposed).toBe(true);
    expect(transport.workers.length).toBe(0);
    expect(createdWindows.every(w => w.isDestroyed())).toBe(true);
  });

  it('replaces a crashed worker up to crash limit', async () => {
    const transport = new EmbeddedElectronTransport({ maxWorkers: 1, electron: mockElectron });
    const worker = await transport._acquireWorker();

    expect(createdWindows.length).toBe(1);
    // Simulate render-process-gone
    worker.window.webContents._emit('render-process-gone', {}, { reason: 'crashed', exitCode: 139 });

    expect(transport.stats.crashes).toBe(1);
    // Worker was replaced with a new one
    expect(createdWindows.length).toBe(2);
    expect(transport.workers.length).toBe(1);
    expect(transport.workers[0].id).toBe('worker_1');

    transport.dispose();
  });
});
