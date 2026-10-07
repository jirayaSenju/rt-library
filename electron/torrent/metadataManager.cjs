/**
 * Torrent Metadata & Swarm Manager
 * Manages concurrency queue, deduplication, worker lifecycle, retry backoff, and DB persistence.
 */

const path = require('path');
const { utilityProcess, child_process } = require('electron');
const fork = require('child_process').fork;

const { WORKER_MESSAGES } = require('./torrentProtocol.cjs');
const { parseMagnetUrl } = require('./magnetParser.cjs');
const torrentMetadataRepo = require('../database/repositories/torrentMetadataRepo.cjs');
const detailsRepo = require('../database/repositories/detailsRepo.cjs');

const MAX_CONCURRENT_TASKS = 3;
const RETRY_BACKOFF_MS = [
  15 * 60 * 1000,        // 1st fail: 15 min
  60 * 60 * 1000,        // 2nd fail: 1 hour
  6 * 60 * 60 * 1000,    // 3rd fail: 6 hours
  24 * 60 * 60 * 1000,   // 4th+ fail: 24 hours
];

let workerProcess = null;
let isWorkerReady = false;

const pendingQueue = [];
const activeMap = new Map();
const pendingSet = new Set();
const pendingByInfoHash = new Map();
const activeByInfoHash = new Map();
const hashWaiters = new Map();
const listeners = new Set();
const progressListeners = new Set();

let collectionState = {
  isCollecting: false,
  processed: 0,
  total: 0,
  complete: 0,
  failed: 0,
  percent: 0,
  currentItemTitle: '',
};

function getRetryBackoffMs(attempts) {
  const idx = Math.min(Math.max(0, attempts - 1), RETRY_BACKOFF_MS.length - 1);
  return RETRY_BACKOFF_MS[idx];
}

function spawnWorker() {
  if (workerProcess) return workerProcess;

  const scriptPath = path.join(__dirname, 'metadataWorker.cjs');

  if (utilityProcess && typeof utilityProcess.fork === 'function') {
    workerProcess = utilityProcess.fork(scriptPath);
    workerProcess.on('message', (msg) => handleWorkerMessage(msg));
    workerProcess.on('exit', (code) => {
      console.log(`[TORRENT_MANAGER] Worker process exited with code ${code}`);
      workerProcess = null;
      isWorkerReady = false;
      // Re-trigger pending tasks if any remain
      if (pendingQueue.length > 0) {
        setTimeout(spawnWorker, 1000);
      }
    });
  } else {
    // Fallback for Node child process
    workerProcess = fork(scriptPath);
    workerProcess.on('message', (msg) => handleWorkerMessage(msg));
    workerProcess.on('exit', (code) => {
      workerProcess = null;
      isWorkerReady = false;
    });
  }

  return workerProcess;
}

function sendToWorker(msg) {
  const proc = spawnWorker();
  if (proc.postMessage) {
    proc.postMessage(msg);
  } else if (proc.send) {
    proc.send(msg);
  }
}

function handleWorkerMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === WORKER_MESSAGES.WORKER_READY) {
    isWorkerReady = true;
    processNextTasks();
  } else if (msg.type === WORKER_MESSAGES.METADATA_RESULT && msg.result) {
    handleTaskResult(msg.result);
  }
}

function handleTaskResult(result) {
  const { taskId, itemId, infoHash, metadata, swarm, error } = result;
  const task = activeMap.get(itemId);
  activeMap.delete(itemId);
  const hash = (infoHash || task?.infoHash || '').toLowerCase();
  if (hash) activeByInfoHash.delete(hash);

  if (error || !infoHash) {
    const existing = torrentMetadataRepo.getByItemId(itemId);
    const attempts = existing ? existing.attempts + 1 : 1;
    const backoffMs = getRetryBackoffMs(attempts);
    torrentMetadataRepo.markFailed(itemId, error || 'Unknown metadata discovery error', backoffMs);
    console.log(`[TORRENT][METADATA][FAILED] item=${itemId} error=${error}`);
    if (collectionState.isCollecting) collectionState.failed++;
  } else {
    // Upsert stable metadata
    torrentMetadataRepo.upsertMetadata({
      itemId,
      infoHash,
      torrentName: metadata?.name || null,
      totalSizeBytes: metadata?.totalSizeBytes || null,
      fileCount: metadata?.fileCount || 0,
      files: metadata?.files || [],
      trackers: metadata?.trackers || [],
      metadataStatus: 'complete',
      metadataSource: result.metadataSource || 'magnet_parse',
    });

    // Update dynamic swarm stats
    if (swarm) {
      torrentMetadataRepo.updateSwarmStats(itemId, {
        seeds: swarm.seeds,
        leechers: swarm.leechers,
        peers: swarm.peers,
        swarmStatus: swarm.status || (swarm.seeds !== null || swarm.leechers !== null ? 'partial' : 'failed'),
        swarmSource: swarm.source || result.swarmSource || 'unknown',
      });
      if (swarm.status === 'failed') {
        const existing = torrentMetadataRepo.getByItemId(itemId);
        torrentMetadataRepo.markFailed(itemId, 'No tracker returned a scrape response', getRetryBackoffMs(existing?.attempts || 1));
      }
    }

    console.log(`[TORRENT][SWARM] item=${itemId} infoHash=${infoHash.substring(0, 8)}... trackers=${swarm?.trackerCount ?? 0} responded=${swarm?.respondedTrackers ?? 0} seeds=${swarm?.seeds ?? 'null'} leechers=${swarm?.leechers ?? 'null'} peers=${swarm?.peers ?? 'null'} source=${swarm?.source || 'unknown'} status=${swarm?.status || 'failed'} durationMs=${result.timing?.totalMs ?? 0}`);
    if (collectionState.isCollecting) collectionState.complete++;
  }

  if (collectionState.isCollecting) {
    collectionState.processed++;
    collectionState.percent = collectionState.total > 0
      ? Math.min(100, Math.floor((collectionState.processed / collectionState.total) * 100))
      : 100;

    if (collectionState.processed >= collectionState.total) {
      collectionState.isCollecting = false;
    }
    notifyProgressListeners();
  }

  const updatedRecord = torrentMetadataRepo.getByItemId(itemId);
  notifyListeners(itemId, updatedRecord);

  // Reuse one scrape/metadata result for other catalog items with the same
  // infoHash. They are persisted independently without issuing duplicate UDP
  // tracker requests.
  const waiters = hash ? (hashWaiters.get(hash) || []) : [];
  hashWaiters.delete(hash);
  for (const waiter of waiters) {
    handleTaskResult({ ...result, taskId: waiter.taskId, itemId: waiter.itemId });
  }

  processNextTasks();
}

function processNextTasks() {
  const maxTasks = MAX_CONCURRENT_TASKS;
  if (activeMap.size >= maxTasks || pendingQueue.length === 0) {
    return;
  }

  spawnWorker();
  let currentItemSet = false;

  while (activeMap.size < maxTasks && pendingQueue.length > 0) {
    const task = pendingQueue.shift();
    pendingSet.delete(task.itemId);
    if (task.infoHash) pendingByInfoHash.delete(task.infoHash);

    activeMap.set(task.itemId, task);
    if (task.infoHash) activeByInfoHash.set(task.infoHash, task);
    // Keep the progress dialog tied to the work that is actually starting.
    // Several tasks may start in the same tick; show the first one so the
    // label does not jump between all concurrent workers.
    if (collectionState.isCollecting && !currentItemSet) {
      collectionState.currentItemTitle = task.title || task.itemId;
      currentItemSet = true;
      notifyProgressListeners();
    }
    const fetchingRecord = torrentMetadataRepo.markFetching(task.itemId);
    notifyListeners(task.itemId, fetchingRecord);

    sendToWorker({
      type: WORKER_MESSAGES.START_METADATA_FETCH,
      task,
    });
  }
}

function enqueue(itemId, magnet, priority = 0, title = '') {
  if (!itemId || !magnet) return false;

  if (activeMap.has(itemId)) {
    return true;
  }

  if (pendingSet.has(itemId)) {
    if (priority > 0) {
      const idx = pendingQueue.findIndex((t) => t.itemId === itemId);
      if (idx !== -1) pendingQueue.splice(idx, 1);
      pendingSet.delete(itemId);
    } else {
      return false;
    }
  }

  const parsed = parseMagnetUrl(magnet);
  const infoHash = parsed.isValid ? parsed.infoHash.toLowerCase() : null;
  const existingHashTask = infoHash && (activeByInfoHash.get(infoHash) || pendingByInfoHash.get(infoHash));
  if (existingHashTask) {
    const waiters = hashWaiters.get(infoHash) || [];
    if (!waiters.some(waiter => waiter.itemId === itemId)) {
      waiters.push({ taskId: `task_${itemId}_${Date.now()}`, itemId, title });
      hashWaiters.set(infoHash, waiters);
    }
    return true;
  }

  const task = {
    taskId: `task_${itemId}_${Date.now()}`,
    itemId,
    magnet,
    priority,
    infoHash,
    title: title || '',
  };

  pendingSet.add(itemId);
  if (infoHash) pendingByInfoHash.set(infoHash, task);

  if (priority > 0) {
    pendingQueue.unshift(task);
  } else {
    pendingQueue.push(task);
  }

  processNextTasks();
  return true;
}

function refreshItem(db, itemId, magnetUrl = null) {
  if (!itemId) return false;
  let magnet = magnetUrl;

  if (!magnet && db) {
    const detail = detailsRepo.getByItemId(db, itemId);
    magnet = detail?.magnet || null;
  }

  if (!magnet) {
    const existing = torrentMetadataRepo.getByItemId(itemId);
    if (existing?.infoHash) {
      magnet = `magnet:?xt=urn:btih:${existing.infoHash}`;
    }
  }

  if (!magnet && db) {
    try {
      const row = db.prepare('SELECT magnet FROM items WHERE id = ?').get(itemId);
      if (row?.magnet) magnet = row.magnet;
    } catch (_) {}
  }

  if (!magnet) return false;

  return enqueue(itemId, magnet, 1);
}

function startBulkCollection(db, mode = 'all') {
  if (!db) return { success: false, error: 'Database instance required' };

  try {
    let sql = '';
    if (mode === 'missing') {
      sql = `
        SELECT idt.item_id, idt.magnet, i.clean_title, i.title
        FROM item_details idt
        JOIN items i ON idt.item_id = i.id
        LEFT JOIN torrent_metadata tm ON tm.item_id = idt.item_id
        WHERE idt.magnet IS NOT NULL AND idt.magnet != ''
          AND (tm.item_id IS NULL OR tm.seeds IS NULL)
      `;
    } else if (mode === 'zero') {
      sql = `
        SELECT idt.item_id, idt.magnet, i.clean_title, i.title
        FROM item_details idt
        JOIN items i ON idt.item_id = i.id
        JOIN torrent_metadata tm ON tm.item_id = idt.item_id
        WHERE idt.magnet IS NOT NULL AND idt.magnet != ''
          AND tm.seeds = 0
      `;
    } else {
      sql = `
        SELECT idt.item_id, idt.magnet, i.clean_title, i.title
        FROM item_details idt
        JOIN items i ON idt.item_id = i.id
        WHERE idt.magnet IS NOT NULL AND idt.magnet != ''
      `;
    }

    const rows = db.prepare(sql).all();

    if (!rows || rows.length === 0) {
      return { success: false, message: 'Nenhum item encontrado para o modo de scan selecionado' };
    }

    collectionState = {
      isCollecting: true,
      mode,
      total: rows.length,
      processed: 0,
      complete: 0,
      failed: 0,
      percent: 0,
      currentItemTitle: rows[0].clean_title || rows[0].title || '',
    };

    notifyProgressListeners();

    for (const r of rows) {
      enqueue(r.item_id, r.magnet, 0, r.clean_title || r.title || r.item_id);
    }

    return { success: true, count: rows.length, mode };
  } catch (err) {
    console.error('[TORRENT_MANAGER] startBulkCollection error:', err.message);
    return { success: false, error: err.message };
  }
}

function stopBulkCollection() {
  collectionState.isCollecting = false;
  pendingQueue.length = 0;
  pendingSet.clear();
  pendingByInfoHash.clear();
  hashWaiters.clear();
  notifyProgressListeners();
  return { success: true };
}

function getCollectionProgress() {
  return { ...collectionState };
}

function addProgressListener(fn) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

function notifyProgressListeners() {
  for (const fn of progressListeners) {
    try {
      fn({ ...collectionState });
    } catch (_) {}
  }
}

function addUpdateListener(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners(itemId, record) {
  for (const fn of listeners) {
    try {
      fn(itemId, record);
    } catch (_) {}
  }
}

function getStatus() {
  const stats = torrentMetadataRepo.getStats();
  return {
    activeTasks: activeMap.size,
    queueSize: pendingQueue.length,
    ...stats,
  };
}

function shutdown() {
  if (workerProcess) {
    try {
      sendToWorker({ type: WORKER_MESSAGES.SHUTDOWN });
    } catch (_) {}
    workerProcess = null;
    isWorkerReady = false;
  }
  pendingQueue.length = 0;
  pendingSet.clear();
  activeMap.clear();
  collectionState.isCollecting = false;
}

module.exports = {
  enqueue,
  refreshItem,
  startBulkCollection,
  stopBulkCollection,
  getCollectionProgress,
  addProgressListener,
  addUpdateListener,
  getStatus,
  shutdown,
};
