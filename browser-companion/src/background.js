importScripts('protocol.js');

let pollTimer = null;
let aborters = new Map();
let cachedTabId = null;

const MAX_COMPANION_CONCURRENCY = 3;
let activeCommandCount = 0;
let activeWorkers = 0;
let consecutiveBridgeFailures = 0;
let workerRunning = false;

let sessionStats = {
  connectedAt: null,
  requestsReceived: 0,
  requestsCompleted: 0,
  requestsFailed: 0,
  activeRequests: 0,
  categoryFetches: 0,
  topicFetches: 0,
  bytesTransferred: 0,
  lastActivityAt: null,
  lastError: null,
};

function formatFriendlyError(err) {
  if (!err) return null;
  const msg = String(err);
  if (msg.includes('NO_RUTRACKER_TAB')) return 'RuTracker tab unavailable';
  if (msg.includes('PAYLOAD_TOO_LARGE')) return 'Payload too large (>10MB)';
  if (msg.includes('URL_NOT_ALLOWED')) return 'URL not allowed';
  if (msg.includes('FETCH_FAILED')) return 'Browser tab fetch failed';
  if (msg.includes('INTERACTION_REQUIRED') || msg.includes('CHALLENGE_REQUIRED')) return 'Cloudflare verification required';
  return msg.slice(0, 50);
}

// Safe tab cache invalidation listeners
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (cachedTabId === tabId) {
      cachedTabId = null;
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (cachedTabId === tabId && changeInfo.url) {
      try {
        if (new URL(changeInfo.url).origin !== 'https://rutracker.org') {
          cachedTabId = null;
        }
      } catch {
        cachedTabId = null;
      }
    }
  });
}

async function checkRuTrackerTabStatus() {
  if (cachedTabId !== null) {
    try {
      const tab = await chrome.tabs.get(cachedTabId);
      if (tab && tab.url && new URL(tab.url).origin === 'https://rutracker.org') {
        return { detected: true, tabId: tab.id, url: tab.url };
      }
    } catch {
      // Tab closed or inaccessible
    }
    cachedTabId = null;
  }

  try {
    const allTabs = await chrome.tabs.query({});
    const rutrackerTabs = allTabs.filter(t => {
      try {
        return t.url && new URL(t.url).origin === 'https://rutracker.org';
      } catch {
        return false;
      }
    });

    if (rutrackerTabs.length > 0) {
      const tab = rutrackerTabs.find(t => t.active) || rutrackerTabs[0];
      cachedTabId = tab.id;
      return { detected: true, tabId: tab.id, url: tab.url };
    }
  } catch (err) {
    console.warn(`[COMPANION] Tab query error: ${err.message}`);
  }

  return { detected: false };
}

async function getRuTrackerTab() {
  const status = await checkRuTrackerTabStatus();
  if (!status.detected) {
    throw new Error('NO_RUTRACKER_TAB');
  }
  return await chrome.tabs.get(status.tabId);
}

async function readConfig() {
  const value = await chrome.storage.session.get(['endpoint', 'token', 'sessionId', 'connectedAt']);
  if (value.endpoint && value.token && value.sessionId) {
    if (!sessionStats.connectedAt && value.connectedAt) {
      sessionStats.connectedAt = value.connectedAt;
    }
    return value;
  }
  return null;
}

async function disconnectSession(reason = 'MANUAL') {
  console.info(`[COMPANION] Disconnecting session. Reason=${reason}`);

  // 1. Abort all active in-flight fetch controllers
  for (const controller of aborters.values()) {
    try { controller.abort(); } catch {}
  }
  aborters.clear();

  workerRunning = false;
  // 2. Clear timers and alarms
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  try {
    await chrome.alarms.clear('rt-companion-poll');
  } catch {}

  // 3. Best-effort notify bridge if manual disconnect
  if (reason === 'MANUAL') {
    try {
      const config = await readConfig();
      if (config) {
        await fetch(`${config.endpoint}${RT_COMPANION_API}/disconnect`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'X-RT-Protocol': String(RT_COMPANION_PROTOCOL_VERSION),
            'X-RT-Session': config.sessionId,
          },
        });
      }
    } catch {}
  }

  // 4. Clear storage
  await chrome.storage.session.remove(['endpoint', 'token', 'sessionId', 'connectedAt']);

  // 5. Reset stats
  sessionStats = {
    connectedAt: null,
    requestsReceived: 0,
    requestsCompleted: 0,
    requestsFailed: 0,
    activeRequests: 0,
    categoryFetches: 0,
    topicFetches: 0,
    bytesTransferred: 0,
    lastActivityAt: null,
    lastError: reason !== 'MANUAL' ? (reason === 'APP_UNAVAILABLE' ? 'RT-Library closed or unavailable' : 'Session invalidated by app') : null,
  };
  activeCommandCount = 0;
  consecutiveBridgeFailures = 0;

  // 6. Broadcast to popup if open
  try {
    chrome.runtime.sendMessage({ type: 'SESSION_STATE_CHANGED', state: 'DISCONNECTED', reason });
  } catch {}
}

async function api(config, path, options = {}) {
  try {
    const response = await fetch(`${config.endpoint}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'X-RT-Protocol': String(RT_COMPANION_PROTOCOL_VERSION),
        'X-RT-Session': config.sessionId,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403 || response.status === 409 || response.status === 410) {
      console.warn(`[COMPANION] Session invalidated by bridge (HTTP ${response.status}). Disconnecting.`);
      await disconnectSession('SESSION_INVALID');
      throw new Error('SESSION_INVALID');
    }

    if (!response.ok) {
      throw new Error(`LOCAL_BRIDGE_${response.status}`);
    }

    consecutiveBridgeFailures = 0;
    return response.json();
  } catch (error) {
    if (error.message === 'SESSION_INVALID') throw error;

    // Track consecutive bridge network failures (app closed, port unreachable)
    consecutiveBridgeFailures++;
    console.warn(`[COMPANION] Bridge connection failure (${consecutiveBridgeFailures}/3): ${error.message}`);
    if (consecutiveBridgeFailures >= 3) {
      console.warn('[COMPANION] Bridge unavailable after 3 consecutive failures. Disconnecting session.');
      await disconnectSession('APP_UNAVAILABLE');
    }
    throw error;
  }
}

async function fetchInPage(command) {
  if (!isAllowedRuTrackerUrl(command.url, command.type)) throw new Error('URL_NOT_ALLOWED');

  // Obtain validated cached tab or discover fresh
  const tab = await getRuTrackerTab();

  console.info(`[COMPANION][TAB_FOUND] requestId=${command.requestId} tabId=${tab.id} url=${tab.url}`);

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    args: [command.url, command.requestId],
    func: async (targetUrl, requestId) => {
      console.info(`[COMPANION][CONTENT_RECEIVED] requestId=${requestId} targetUrl=${targetUrl}`);
      console.info(`[COMPANION][FETCH_STARTED] requestId=${requestId} targetUrl=${targetUrl}`);
      try {
        const response = await fetch(targetUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        const bytes = await response.arrayBuffer();
        const html = new TextDecoder('windows-1251').decode(bytes);
        console.info(`[COMPANION][FETCH_RESULT] requestId=${requestId} status=${response.status} finalUrl=${response.url} htmlLength=${html.length} bytes=${bytes.byteLength}`);
        if (bytes.byteLength > 10 * 1024 * 1024) {
          return { tooLarge: true, httpStatus: response.status, url: response.url, html: '' };
        }
        return {
          httpStatus: response.status,
          url: response.url,
          sourceBytes: bytes.byteLength,
          html,
        };
      } catch (err) {
        console.error(`[COMPANION][FETCH_ERROR] requestId=${requestId} error=${err.message}`);
        return {
          httpStatus: 0,
          url: targetUrl,
          sourceBytes: 0,
          html: '',
          error: err.message,
        };
      }
    },
  });

  if (!result || !result.result) {
    throw new Error('FETCH_FAILED');
  }
  if (result.result.tooLarge) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  return result.result;
}

async function processCommand(config, command) {
  if (!command || !['FETCH_CATEGORY', 'FETCH_TOPIC', 'CANCEL'].includes(command.type)) return;
  if (command.type === 'CANCEL') {
    aborters.get(command.requestId)?.abort();
    return;
  }

  sessionStats.requestsReceived++;
  sessionStats.activeRequests = Math.max(0, activeCommandCount);
  sessionStats.lastActivityAt = Date.now();

  const controller = new AbortController();
  aborters.set(command.requestId, controller);
  let page;
  try {
    page = await fetchInPage(command);
    sessionStats.requestsCompleted++;
    if (command.type === 'FETCH_CATEGORY') sessionStats.categoryFetches++;
    if (command.type === 'FETCH_TOPIC') sessionStats.topicFetches++;
    sessionStats.bytesTransferred += (page.sourceBytes || 0);
  } catch (error) {
    sessionStats.requestsFailed++;
    sessionStats.lastError = formatFriendlyError(error.message);
    page = { html: '', httpStatus: 0, url: command.url, error: error.message, sourceBytes: 0 };
  } finally {
    aborters.delete(command.requestId);
    sessionStats.lastActivityAt = Date.now();
    sessionStats.activeRequests = Math.max(0, activeCommandCount - 1);
  }

  console.info(`[COMPANION][RESPONSE_SENT] requestId=${command.requestId} status=${page.httpStatus} bytes=${page.sourceBytes} error=${page.error || 'none'}`);
  await api(config, `${RT_COMPANION_API}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocolVersion: RT_COMPANION_PROTOCOL_VERSION, requestId: command.requestId, ...page }),
  });
}

async function startWorkerLoop(workerId) {
  while (workerRunning) {
    const config = await readConfig();
    if (!config || !workerRunning) break;

    let res;
    try {
      res = await api(config, `${RT_COMPANION_API}/commands`);
    } catch (pollErr) {
      if (!workerRunning) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    if (!workerRunning) break;
    const command = res?.command;
    if (!command) {
      // Long poll timed out with no command; immediately loop to wait for next command
      continue;
    }

    activeCommandCount++;
    sessionStats.activeRequests = Math.max(0, activeCommandCount);
    console.info(`[COMPANION][EXTENSION_RECEIVED] worker=${workerId} requestId=${command.requestId} type=${command.type} active=${activeCommandCount}`);

    try {
      await processCommand(config, command);
    } catch (err) {
      console.error(`[COMPANION] Command execution error (worker ${workerId}): ${err.message}`);
    } finally {
      activeCommandCount = Math.max(0, activeCommandCount - 1);
      sessionStats.activeRequests = Math.max(0, activeCommandCount);
    }
  }
}

function ensureWorkerPool() {
  if (!workerRunning) {
    workerRunning = true;
  }
  while (activeWorkers < MAX_COMPANION_CONCURRENCY) {
    activeWorkers++;
    const id = activeWorkers;
    (async () => {
      try {
        await startWorkerLoop(id);
      } finally {
        activeWorkers = Math.max(0, activeWorkers - 1);
      }
    })();
  }
}

async function poll() {
  const config = await readConfig();
  if (config) {
    ensureWorkerPool();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_SESSION_STATE') {
    (async () => {
      const config = await readConfig();
      if (!config) {
        return {
          connected: false,
          lastError: sessionStats.lastError,
        };
      }
      const tab = await checkRuTrackerTabStatus();
      return {
        connected: true,
        endpoint: config.endpoint,
        stats: {
          ...sessionStats,
          activeRequests: Math.max(0, activeCommandCount),
        },
        tab,
      };
    })().then(sendResponse).catch(err => sendResponse({ connected: false, error: err.message }));
    return true;
  }

  if (message?.type === 'DISCONNECT') {
    disconnectSession('MANUAL')
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message?.type === 'OPEN_RUTRACKER') {
    chrome.tabs.create({ url: 'https://rutracker.org/forum/index.php' });
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'CONNECT') {
    (async () => {
      const endpoint = `http://127.0.0.1:${Number(message.port)}`;
      const token = String(message.token || '');
      if (!Number.isInteger(Number(message.port)) || Number(message.port) < 1 || Number(message.port) > 65535 || !/^[a-f0-9]{64}$/.test(token)) {
        throw new Error('INVALID_CONNECTION_CODE');
      }
      const hello = await fetch(`${endpoint}/v1/hello`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-RT-Protocol': String(RT_COMPANION_PROTOCOL_VERSION),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ protocolVersion: RT_COMPANION_PROTOCOL_VERSION, extensionVersion: chrome.runtime.getManifest().version }),
      });
      if (!hello.ok) throw new Error(`HANDSHAKE_${hello.status}`);
      const welcome = await hello.json();
      if (welcome.protocolVersion !== RT_COMPANION_PROTOCOL_VERSION || welcome.type !== 'WELCOME') {
        throw new Error('PROTOCOL_MISMATCH');
      }

      const connectedAt = Date.now();
      await chrome.storage.session.set({ endpoint, token, sessionId: welcome.sessionId, connectedAt });

      sessionStats = {
        connectedAt,
        requestsReceived: 0,
        requestsCompleted: 0,
        requestsFailed: 0,
        activeRequests: 0,
        categoryFetches: 0,
        topicFetches: 0,
        bytesTransferred: 0,
        lastActivityAt: connectedAt,
        lastError: null,
      };
      consecutiveBridgeFailures = 0;

      await chrome.alarms.create('rt-companion-poll', { periodInMinutes: 0.5 });
      poll();

      try {
        chrome.runtime.sendMessage({ type: 'SESSION_STATE_CHANGED', state: 'CONNECTED' });
      } catch {}

      return { ok: true, appVersion: welcome.appVersion, endpoint };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.runtime.onStartup.addListener(() => poll());
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'rt-companion-poll') poll();
});
