/**
 * Torrent Metadata & Swarm Discovery Worker Process
 * Operates in Electron utilityProcess / child_process.
 * Does NOT open SQLite directly. Communicates exclusively via IPC.
 */

const dgram = require('dgram');
const { parseMagnetUrl } = require('./magnetParser.cjs');
const { WORKER_MESSAGES } = require('./torrentProtocol.cjs');

/**
 * Perform BEP 15 UDP Tracker Scrape
 */
function scrapeUdpTracker(trackerUrl, infoHashHex, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const url = new URL(trackerUrl);
      if (url.protocol !== 'udp:') return resolve(null);

      const host = url.hostname;
      const port = parseInt(url.port, 10) || 80;
      const socket = dgram.createSocket('udp4');

      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        try {
          socket.close();
        } catch (_) {}
      };

      timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      socket.on('error', () => {
        cleanup();
        resolve(null);
      });

      // Step 1: Connect Request
      const connectionId = Buffer.from('0000041727101980', 'hex'); // Magic 0x41727101980
      const transactionId = Math.floor(Math.random() * 0x7fffffff);
      const connectReq = Buffer.alloc(16);
      connectionId.copy(connectReq, 0);
      connectReq.writeUInt32BE(0, 8); // Action 0 = Connect
      connectReq.writeUInt32BE(transactionId, 12);

      let step = 'connect';

      socket.on('message', (msg) => {
        try {
          if (step === 'connect') {
            if (msg.length < 16) return;
            const action = msg.readUInt32BE(0);
            const resTransId = msg.readUInt32BE(4);
            if (action !== 0 || resTransId !== transactionId) return;

            const resConnectionId = msg.subarray(8, 16);

            // Step 2: Scrape Request
            step = 'scrape';
            const scrapeReq = Buffer.alloc(36);
            resConnectionId.copy(scrapeReq, 0);
            scrapeReq.writeUInt32BE(2, 8); // Action 2 = Scrape
            scrapeReq.writeUInt32BE(transactionId, 12);
            Buffer.from(infoHashHex, 'hex').copy(scrapeReq, 16);

            socket.send(scrapeReq, 0, scrapeReq.length, port, host, (err) => {
              if (err) {
                cleanup();
                resolve(null);
              }
            });
          } else if (step === 'scrape') {
            if (msg.length < 20) return;
            const action = msg.readUInt32BE(0);
            const resTransId = msg.readUInt32BE(4);
            if (action !== 2 || resTransId !== transactionId) return;

            const seeds = msg.readUInt32BE(8);
            const leechers = msg.readUInt32BE(16);

            cleanup();
            resolve({
              tracker: trackerUrl,
              seeds: seeds < 200000 ? seeds : null,
              leechers: leechers < 200000 ? leechers : null,
              // A scrape gives announced complete/incomplete counts. A peer
              // total is only known when both values are valid; never turn a
              // missing side into zero.
              peers: seeds < 200000 && leechers < 200000 ? seeds + leechers : null,
            });
          }
        } catch (e) {
          cleanup();
          resolve(null);
        }
      });

      socket.send(connectReq, 0, connectReq.length, port, host, (err) => {
        if (err) {
          cleanup();
          resolve(null);
        }
      });
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * Perform bounded parallel UDP Tracker Scrapes and wait for all targets or timeout.
 */
function scrapeUdpTrackersFast(udpTrackers, infoHashHex, timeoutMs = 1800) {
  return new Promise((resolve) => {
    if (!udpTrackers || udpTrackers.length === 0) return resolve([]);

    const results = [];
    const targets = udpTrackers.slice(0, 5);
    let completed = 0;
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve(results);
      }
    }, timeoutMs);

    for (const trackerUrl of targets) {
      scrapeUdpTracker(trackerUrl, infoHashHex, timeoutMs)
        .then((res) => {
          completed++;
          if (res) {
            results.push(res);
          }
          if (completed >= targets.length && !finished) {
            finished = true;
            clearTimeout(timer);
            resolve(results);
          }
        })
        .catch(() => {
          completed++;
          if (completed >= targets.length && !finished) {
            finished = true;
            clearTimeout(timer);
            resolve(results);
          }
        });
    }
  });
}

/**
 * Normalizes raw file entries into standard TorrentFile format:
 * Array of { path: string, name: string, length: number }
 */
function normalizeTorrentFiles(rawFiles, defaultName = null, defaultSize = null) {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    if (defaultName && typeof defaultSize === 'number' && defaultSize >= 0) {
      const cleanName = String(defaultName).split(/[/\\]/).pop() || String(defaultName);
      return [{
        path: cleanName,
        name: cleanName,
        length: Math.max(0, Math.floor(defaultSize)),
      }];
    }
    return [];
  }

  const result = [];
  for (const item of rawFiles) {
    if (!item || typeof item !== 'object') continue;

    let pathStr = '';
    if (Array.isArray(item.path)) {
      pathStr = item.path.filter(Boolean).join('/');
    } else if (typeof item.path === 'string') {
      pathStr = item.path.replace(/\\/g, '/');
    } else if (typeof item.name === 'string') {
      pathStr = item.name.replace(/\\/g, '/');
    }

    if (!pathStr) continue;

    pathStr = pathStr.replace(/^\/+/, '');
    const nameStr = pathStr.split('/').pop() || pathStr;

    let len = 0;
    if (typeof item.length === 'number' && item.length >= 0) {
      len = Math.floor(item.length);
    } else if (typeof item.size === 'number' && item.size >= 0) {
      len = Math.floor(item.size);
    }

    result.push({
      path: pathStr,
      name: nameStr,
      length: len,
    });
  }

  return result;
}

/**
 * Execute single metadata & swarm discovery task
 */
async function executeTask(task) {
  const startedAt = Date.now();
  const { taskId, itemId, magnet } = task;

  const parsed = parseMagnetUrl(magnet);
  if (!parsed.isValid) {
    return {
      taskId,
      itemId,
      error: parsed.error,
      metadata: null,
      swarm: null,
      timing: { startedAt, totalMs: Date.now() - startedAt },
    };
  }

  const defaultTrackers = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://opentracker.i2p.rocks:6969/announce',
  ];

  const allTrackers = Array.from(new Set([...parsed.trackers, ...defaultTrackers]));
  const udpTrackers = allTrackers.filter((t) => t.startsWith('udp:'));

  // Query every configured UDP tracker within the bounded timeout. Taking the
  // maximum per field avoids double-counting peers across tracker mirrors.
  const results = await scrapeUdpTrackersFast(udpTrackers, parsed.infoHash, 1800);

  let maxSeeds = null;
  let maxLeechers = null;
  let maxPeers = null;

  if (results.length > 0) {
    for (const r of results) {
      if (r.seeds !== null && (maxSeeds === null || r.seeds > maxSeeds)) {
        maxSeeds = r.seeds;
      }
      if (r.leechers !== null && (maxLeechers === null || r.leechers > maxLeechers)) {
        maxLeechers = r.leechers;
      }
      if (r.peers !== null && (maxPeers === null || r.peers > maxPeers)) {
        maxPeers = r.peers;
      }
    }
  }

  const rawFiles = task.files || task.rawFiles || (task.metadata && task.metadata.files) || [];
  const normalizedFiles = normalizeTorrentFiles(rawFiles, parsed.displayName, task.totalSizeBytes || task.length);

  let totalSizeBytes = task.totalSizeBytes || task.length || null;
  if (normalizedFiles.length > 0) {
    const sumBytes = normalizedFiles.reduce((acc, f) => acc + (f.length || 0), 0);
    if (!totalSizeBytes || totalSizeBytes === 0) {
      totalSizeBytes = sumBytes;
    }
  }

  return {
    taskId,
    itemId,
    infoHash: parsed.infoHash,
    metadata: {
      name: parsed.displayName,
      totalSizeBytes: totalSizeBytes,
      fileCount: normalizedFiles.length,
      files: normalizedFiles,
      trackers: allTrackers,
    },
    swarm: {
      seeds: maxSeeds,
      leechers: maxLeechers,
      peers: maxPeers,
      status: results.length === 0 ? 'failed' : results.length < udpTrackers.length ? 'partial' : 'complete',
      source: results.length > 0 ? 'tracker' : 'unknown',
      trackerCount: udpTrackers.length,
      respondedTrackers: results.length,
    },
    metadataSource: 'magnet_parse',
    swarmSource: results.length > 0 ? 'tracker' : 'unknown',
    timing: {
      startedAt,
      totalMs: Date.now() - startedAt,
    },
    error: null,
  };
}

// Handler for incoming messages from parent process
function handleParentMessage(data) {
  if (!data || typeof data !== 'object') return;
  const { type, task } = data;

  if (type === WORKER_MESSAGES.START_METADATA_FETCH && task) {
    executeTask(task).then((result) => {
      sendToParent({
        type: WORKER_MESSAGES.METADATA_RESULT,
        result,
      });
    });
  } else if (type === WORKER_MESSAGES.SHUTDOWN) {
    process.exit(0);
  }
}

function sendToParent(msg) {
  if (process.parentPort) {
    process.parentPort.postMessage(msg);
  } else if (process.send) {
    process.send(msg);
  }
}

if (process.parentPort) {
  process.parentPort.on('message', (event) => handleParentMessage(event.data));
} else if (process.on) {
  process.on('message', (msg) => handleParentMessage(msg));
}

sendToParent({ type: WORKER_MESSAGES.WORKER_READY });

module.exports = {
  scrapeUdpTracker,
  normalizeTorrentFiles,
  executeTask,
};
