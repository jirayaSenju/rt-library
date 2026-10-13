import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const htmlPath = path.resolve(__dirname, '../../browser-companion/src/popup.html');
const rawHtml = fs.readFileSync(htmlPath, 'utf8');

function setupPopupDom(initialSessionState = { connected: false }) {
  const dom = new JSDOM(rawHtml, { runScripts: 'dangerously' });
  const window = dom.window as any;
  const document = window.document;

  const mockRuntimeListeners: ((msg: any) => void)[] = [];
  let currentSessionState = { ...initialSessionState };

  const mockChrome = {
    runtime: {
      sendMessage: vi.fn(async (msg: any) => {
        if (msg.type === 'GET_SESSION_STATE') {
          return currentSessionState;
        }
        if (msg.type === 'CONNECT') {
          if (!msg.port || !msg.token) return { ok: false, error: 'INVALID_CREDENTIALS' };
          currentSessionState = {
            connected: true,
            endpoint: `http://127.0.0.1:${msg.port}`,
            stats: {
              connectedAt: Date.now(),
              requestsReceived: 0,
              requestsCompleted: 0,
              requestsFailed: 0,
              activeRequests: 0,
              categoryFetches: 0,
              topicFetches: 0,
              bytesTransferred: 0,
              lastActivityAt: Date.now(),
              lastError: null,
            },
            tab: { detected: true, url: 'https://rutracker.org/forum/index.php' },
          };
          return { ok: true, appVersion: '1.0.0' };
        }
        if (msg.type === 'DISCONNECT') {
          currentSessionState = { connected: false, lastError: null };
          return { ok: true };
        }
        if (msg.type === 'OPEN_RUTRACKER') {
          return { ok: true };
        }
        return {};
      }),
      onMessage: {
        addListener: vi.fn((fn: (msg: any) => void) => {
          mockRuntimeListeners.push(fn);
        }),
      },
    },
    tabs: {
      create: vi.fn(),
    },
  };

  window.chrome = mockChrome;

  // Load and execute popup.js in the JSDOM context
  const popupJs = fs.readFileSync(path.resolve(__dirname, '../../browser-companion/src/popup.js'), 'utf8');
  window.eval(popupJs);

  return {
    dom,
    window,
    document,
    mockChrome,
    notifyListeners: (msg: any) => mockRuntimeListeners.forEach(fn => fn(msg)),
    setSessionState: (s: any) => { currentSessionState = s; },
  };
}

describe('V3-68 Browser Companion Popup UX & Session Lifecycle', () => {
  it('1. Disconnected Mode: renders connection form and shows Disconnected badge', async () => {
    const { document } = setupPopupDom({ connected: false });

    // Allow initial async refreshState() to resolve
    await new Promise(r => setTimeout(r, 20));

    const disconnectedView = document.getElementById('disconnected-view');
    const connectedView = document.getElementById('connected-view');
    const headerBadge = document.getElementById('header-badge');
    const portInput = document.getElementById('port');
    const tokenInput = document.getElementById('token');
    const connectBtn = document.getElementById('connect');

    expect(disconnectedView?.classList.contains('hidden')).toBe(false);
    expect(connectedView?.classList.contains('hidden')).toBe(true);
    expect(headerBadge?.textContent).toBe('Disconnected');
    expect(portInput).toBeTruthy();
    expect(tokenInput).toBeTruthy();
    expect(connectBtn).toBeTruthy();
  });

  it('2. Connected Mode: completely hides connection form, port, token, and connect button', async () => {
    const { document } = setupPopupDom({
      connected: true,
      endpoint: 'http://127.0.0.1:48921',
      stats: {
        connectedAt: Date.now() - 65000, // 1m 5s ago
        requestsReceived: 10,
        requestsCompleted: 10,
        requestsFailed: 0,
        activeRequests: 0,
        categoryFetches: 2,
        topicFetches: 8,
        bytesTransferred: 1024 * 500,
        lastActivityAt: Date.now() - 5000,
        lastError: null,
      },
      tab: { detected: true, url: 'https://rutracker.org/forum/index.php' },
    });

    await new Promise(r => setTimeout(r, 20));

    const disconnectedView = document.getElementById('disconnected-view');
    const connectedView = document.getElementById('connected-view');
    const headerBadge = document.getElementById('header-badge');
    const tokenInput = document.getElementById('token') as HTMLInputElement;
    const codeInput = document.getElementById('code-input') as HTMLInputElement;

    expect(disconnectedView?.classList.contains('hidden')).toBe(true);
    expect(connectedView?.classList.contains('hidden')).toBe(false);
    expect(headerBadge?.textContent).toBe('Connected');

    // Security check: token inputs are cleared and never visible in connected view
    expect(tokenInput?.value).toBe('');
    expect(codeInput?.value).toBe('');
    expect(connectedView?.innerHTML).not.toContain('secret-token');
  });

  it('3. Renders runtime session stats, duration, and scraper metrics', async () => {
    const now = Date.now();
    const { document } = setupPopupDom({
      connected: true,
      endpoint: 'http://127.0.0.1:48921',
      stats: {
        connectedAt: now - 125000, // 2m 5s
        requestsReceived: 25,
        requestsCompleted: 24,
        requestsFailed: 1,
        activeRequests: 2,
        categoryFetches: 4,
        topicFetches: 20,
        bytesTransferred: 1024 * 1024 * 15.5, // 15.5 MB
        lastActivityAt: now - 3000,
        lastError: 'RuTracker tab unavailable',
      },
      tab: { detected: true },
    });

    await new Promise(r => setTimeout(r, 20));

    const statEndpoint = document.getElementById('stat-endpoint');
    const tabStatus = document.getElementById('tab-status');
    const statDuration = document.getElementById('stat-duration');
    const statActive = document.getElementById('stat-active');
    const statCompleted = document.getElementById('stat-completed');
    const statFailed = document.getElementById('stat-failed');
    const statCategories = document.getElementById('stat-categories');
    const statTopics = document.getElementById('stat-topics');
    const statBytes = document.getElementById('stat-bytes');
    const statLastActivity = document.getElementById('stat-last-activity');
    const statError = document.getElementById('stat-error');

    expect(statEndpoint?.textContent).toBe('127.0.0.1:48921');
    expect(tabStatus?.textContent).toContain('Tab detected');
    expect(statDuration?.textContent).toBe('02:05');
    expect(statActive?.textContent).toBe('2');
    expect(statCompleted?.textContent).toBe('24');
    expect(statFailed?.textContent).toBe('1');
    expect(statCategories?.textContent).toBe('4');
    expect(statTopics?.textContent).toBe('20');
    expect(statBytes?.textContent).toBe('15.5 MB');
    expect(statLastActivity?.textContent).toBe('Just now');
    expect(statError?.textContent).toBe('RuTracker tab unavailable');
  });

  it('4. Tab Status: shows warning when RuTracker tab is not detected', async () => {
    const { document } = setupPopupDom({
      connected: true,
      endpoint: 'http://127.0.0.1:48921',
      stats: { connectedAt: Date.now(), requestsCompleted: 0, activeRequests: 0, requestsFailed: 0 },
      tab: { detected: false },
    });

    await new Promise(r => setTimeout(r, 20));

    const tabStatus = document.getElementById('tab-status');
    expect(tabStatus?.textContent).toContain('Not detected');
    expect(tabStatus?.className).toContain('tab-missing');
  });

  it('5. Manual Disconnect: switches popup immediately to disconnected and wipes session state', async () => {
    const { document, mockChrome } = setupPopupDom({
      connected: true,
      endpoint: 'http://127.0.0.1:48921',
      stats: { connectedAt: Date.now() },
      tab: { detected: true },
    });

    await new Promise(r => setTimeout(r, 20));

    const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;
    expect(disconnectBtn).toBeTruthy();

    disconnectBtn.click();
    await new Promise(r => setTimeout(r, 20));

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'DISCONNECT' });

    const disconnectedView = document.getElementById('disconnected-view');
    const connectedView = document.getElementById('connected-view');
    const headerBadge = document.getElementById('header-badge');

    expect(disconnectedView?.classList.contains('hidden')).toBe(false);
    expect(connectedView?.classList.contains('hidden')).toBe(true);
    expect(headerBadge?.textContent).toBe('Disconnected');
  });

  it('6. Bridge Closed / App Unavailable: transitions to disconnected mode via runtime message', async () => {
    const { document, notifyListeners } = setupPopupDom({
      connected: true,
      endpoint: 'http://127.0.0.1:48921',
      stats: { connectedAt: Date.now() },
      tab: { detected: true },
    });

    await new Promise(r => setTimeout(r, 20));

    // Simulate background script broadcasting disconnection due to 3 consecutive failures
    notifyListeners({
      type: 'SESSION_STATE_CHANGED',
      state: 'DISCONNECTED',
      reason: 'APP_UNAVAILABLE',
    });

    const disconnectedView = document.getElementById('disconnected-view');
    const connectedView = document.getElementById('connected-view');
    const statusOutput = document.getElementById('status');

    expect(disconnectedView?.classList.contains('hidden')).toBe(false);
    expect(connectedView?.classList.contains('hidden')).toBe(true);
    expect(statusOutput?.textContent).toContain('RT-Library closed or bridge unavailable');
  });

  it('7. Connect form: auto-parses PORT:TOKEN connection code and transitions to connected mode', async () => {
    const { document, mockChrome } = setupPopupDom({ connected: false });
    await new Promise(r => setTimeout(r, 20));

    const codeInput = document.getElementById('code-input') as HTMLInputElement;
    const connectForm = document.getElementById('connect-form') as HTMLFormElement;

    const dummyToken = 'a'.repeat(64);
    codeInput.value = `52144:${dummyToken}`;
    codeInput.dispatchEvent(new (document.defaultView as any).Event('input'));

    connectForm.dispatchEvent(new (document.defaultView as any).Event('submit'));
    await new Promise(r => setTimeout(r, 30));

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CONNECT',
      port: '52144',
      token: dummyToken,
    });

    const connectedView = document.getElementById('connected-view');
    expect(connectedView?.classList.contains('hidden')).toBe(false);
  });
});

