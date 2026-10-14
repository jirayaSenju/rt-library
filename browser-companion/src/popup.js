// DOM Elements
const disconnectedView = document.getElementById('disconnected-view');
const connectedView = document.getElementById('connected-view');
const headerBadge = document.getElementById('header-badge');
const connectForm = document.getElementById('connect-form');
const codeInput = document.getElementById('code-input');
const portInput = document.getElementById('port');
const tokenInput = document.getElementById('token');
const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');
const openRuTrackerBtn = document.getElementById('open-rutracker');
const statusOutput = document.getElementById('status');

// Stat Display Elements
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
const statErrorBox = document.getElementById('stat-error-box');
const statError = document.getElementById('stat-error');

let currentConnectedAt = null;

function formatDuration(connectedAt) {
  if (!connectedAt) return '00:00';
  const totalSecs = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastActivity(timestamp) {
  if (!timestamp) return 'None';
  const diffSecs = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSecs < 5) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const mins = Math.floor(diffSecs / 60);
  return `${mins}m ago`;
}

function renderConnected(data) {
  disconnectedView.classList.add('hidden');
  connectedView.classList.remove('hidden');

  headerBadge.className = 'badge badge-connected';
  headerBadge.textContent = 'Connected';

  // Wipe sensitive token from inputs & memory
  tokenInput.value = '';
  codeInput.value = '';

  const endpointStr = data?.endpoint ? data.endpoint.replace(/^https?:\/\//, '') : '127.0.0.1';
  statEndpoint.textContent = endpointStr;

  // RuTracker Tab Status
  if (data?.tab?.detected) {
    tabStatus.textContent = '✓ Tab detected';
    tabStatus.className = 'card-value tab-detected';
  } else {
    tabStatus.textContent = '⚠️ Not detected';
    tabStatus.className = 'card-value tab-missing';
  }

  // Session stats
  const stats = data?.stats || {};
  currentConnectedAt = stats.connectedAt || currentConnectedAt || Date.now();
  statDuration.textContent = formatDuration(currentConnectedAt);
  statActive.textContent = String(Math.max(0, stats.activeRequests || 0));
  statCompleted.textContent = String(stats.requestsCompleted || 0);
  statFailed.textContent = String(stats.requestsFailed || 0);
  statCategories.textContent = String(stats.categoryFetches || 0);
  statTopics.textContent = String(stats.topicFetches || 0);
  statBytes.textContent = formatBytes(stats.bytesTransferred || 0);
  statLastActivity.textContent = formatLastActivity(stats.lastActivityAt);

  if (stats.lastError) {
    statErrorBox.classList.remove('hidden');
    statError.textContent = stats.lastError;
  } else {
    statErrorBox.classList.add('hidden');
  }

  statusOutput.textContent = '';
}

function renderDisconnected(msg = '') {
  connectedView.classList.add('hidden');
  disconnectedView.classList.remove('hidden');

  headerBadge.className = 'badge badge-disconnected';
  headerBadge.textContent = 'Disconnected';
  currentConnectedAt = null;

  if (msg) {
    statusOutput.textContent = msg;
  }
}

async function refreshState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' });
    if (res?.connected) {
      renderConnected(res);
    } else {
      if (!connectedView.classList.contains('hidden')) {
        renderDisconnected(res?.lastError || 'Session disconnected.');
      }
    }
  } catch (err) {
    // Service worker might be sleeping
  }
}

// Initial state fetch
refreshState();

// Timer to refresh stats and tick duration
const refreshTimer = setInterval(() => {
  if (!connectedView.classList.contains('hidden')) {
    statDuration.textContent = formatDuration(currentConnectedAt);
    refreshState();
  }
}, 1000);

// Cleanup on unload
window.addEventListener('unload', () => {
  clearInterval(refreshTimer);
});

// Listen for background push updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SESSION_STATE_CHANGED') {
    if (msg.state === 'DISCONNECTED') {
      const reasonMsg = msg.reason === 'APP_UNAVAILABLE'
        ? 'RT-Library closed or bridge unavailable.'
        : msg.reason === 'SESSION_INVALID'
        ? 'Session invalidated by RT-Library.'
        : 'Disconnected.';
      renderDisconnected(reasonMsg);
    } else if (msg.state === 'CONNECTED') {
      refreshState();
    }
  }
});

// Auto-parse code on paste into codeInput or portInput
function parseConnectionCode(text) {
  const trimmed = text.trim();
  const colonMatch = trimmed.match(/^(\d{1,5}):([a-f0-9]{64})$/i);
  if (colonMatch) {
    return { port: colonMatch[1], token: colonMatch[2] };
  }
  const spaceMatch = trimmed.match(/^(\d{1,5})\s+([a-f0-9]{64})$/i);
  if (spaceMatch) {
    return { port: spaceMatch[1], token: spaceMatch[2] };
  }
  return null;
}

codeInput.addEventListener('input', () => {
  const parsed = parseConnectionCode(codeInput.value);
  if (parsed) {
    portInput.value = parsed.port;
    tokenInput.value = parsed.token;
  }
});

// Connect Form Submit
connectForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  let targetPort = portInput.value.trim();
  let targetToken = tokenInput.value.trim();

  const codeVal = codeInput.value.trim();
  if (codeVal) {
    const parsed = parseConnectionCode(codeVal);
    if (parsed) {
      targetPort = parsed.port;
      targetToken = parsed.token;
    }
  }

  if (!targetPort || !targetToken) {
    statusOutput.textContent = 'Please provide both Port and Session token.';
    return;
  }

  statusOutput.textContent = 'Connecting…';
  connectBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'CONNECT',
      port: targetPort,
      token: targetToken,
    });

    if (result?.ok) {
      statusOutput.textContent = '';
      codeInput.value = '';
      tokenInput.value = '';
      await refreshState();
    } else {
      renderDisconnected(`Connection failed: ${result?.error || 'unknown error'}`);
    }
  } catch (err) {
    renderDisconnected(`Connection error: ${err.message}`);
  } finally {
    connectBtn.disabled = false;
  }
});

// Disconnect Action
disconnectBtn.addEventListener('click', async () => {
  statusOutput.textContent = 'Disconnecting…';
  disconnectBtn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
    renderDisconnected('Disconnected from RT-Library.');
  } catch (err) {
    renderDisconnected('Disconnected.');
  } finally {
    disconnectBtn.disabled = false;
  }
});

// Open RuTracker Action
openRuTrackerBtn.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'OPEN_RUTRACKER' });
  } catch (err) {
    window.open('https://rutracker.org/forum/index.php', '_blank');
  }
});
