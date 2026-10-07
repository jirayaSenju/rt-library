const { getDatabase } = require('../dbMain.cjs');

function getDb(customDb) {
  const db = customDb || getDatabase();
  if (!db) {
    throw new Error('[torrentMetadataRepo] Database connection is not initialized');
  }
  return db;
}

function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    itemId: row.item_id,
    infoHash: row.info_hash,
    torrentName: row.torrent_name,
    totalSizeBytes: row.total_size_bytes,
    fileCount: row.file_count,
    files: safeJsonParse(row.files_json, []),
    trackers: safeJsonParse(row.trackers_json, []),
    seeds: row.seeds,
    leechers: row.leechers,
    peers: row.peers,
    metadataStatus: row.metadata_status,
    swarmStatus: row.swarm_status,
    metadataFetchedAt: row.metadata_fetched_at,
    swarmFetchedAt: row.swarm_fetched_at,
    lastAttemptAt: row.last_attempt_at,
    nextRetryAt: row.next_retry_at,
    attempts: row.attempts,
    lastError: row.last_error,
    metadataSource: row.metadata_source,
    swarmSource: row.swarm_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getByItemId(itemId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM torrent_metadata WHERE item_id = ?').get(itemId);
  if (!row) return null;
  const mapped = mapRow(row);
  if (mapped.swarmFetchedAt && mapped.swarmStatus === 'complete' &&
      Date.now() - Date.parse(mapped.swarmFetchedAt) > 6 * 60 * 60 * 1000) {
    mapped.swarmStatus = 'stale';
  }
  return mapped;
}

function getByInfoHash(infoHash) {
  if (!infoHash) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM torrent_metadata WHERE info_hash = ? ORDER BY updated_at DESC LIMIT 1').get(infoHash.toLowerCase());
  return mapRow(row);
}

function upsertMetadata(data) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getByItemId(data.itemId);

  const stmt = db.prepare(`
    INSERT INTO torrent_metadata (
      item_id, info_hash, torrent_name, total_size_bytes, file_count,
      files_json, trackers_json, metadata_status, metadata_fetched_at,
      metadata_source, attempts, last_error, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, 0, NULL, ?, ?
    )
    ON CONFLICT(item_id) DO UPDATE SET
      info_hash = excluded.info_hash,
      torrent_name = COALESCE(excluded.torrent_name, torrent_metadata.torrent_name),
      total_size_bytes = COALESCE(excluded.total_size_bytes, torrent_metadata.total_size_bytes),
      file_count = COALESCE(excluded.file_count, torrent_metadata.file_count),
      files_json = COALESCE(excluded.files_json, torrent_metadata.files_json),
      trackers_json = COALESCE(excluded.trackers_json, torrent_metadata.trackers_json),
      metadata_status = excluded.metadata_status,
      metadata_fetched_at = excluded.metadata_fetched_at,
      metadata_source = COALESCE(excluded.metadata_source, torrent_metadata.metadata_source),
      last_error = NULL,
      updated_at = excluded.updated_at
  `);

  const infoHash = data.infoHash ? data.infoHash.toLowerCase() : null;
  const filesJson = data.files ? JSON.stringify(data.files) : null;
  const trackersJson = data.trackers ? JSON.stringify(data.trackers) : null;
  const status = data.metadataStatus || 'complete';

  stmt.run(
    data.itemId,
    infoHash,
    data.torrentName || null,
    data.totalSizeBytes ?? null,
    data.fileCount ?? (data.files ? data.files.length : null),
    filesJson,
    trackersJson,
    status,
    now,
    data.metadataSource || 'bittorrent',
    existing ? existing.createdAt : now,
    now
  );

  return getByItemId(data.itemId);
}

function updateSwarmStats(itemId, swarmData) {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE torrent_metadata SET
      seeds = COALESCE(?, seeds),
      leechers = COALESCE(?, leechers),
      peers = COALESCE(?, peers),
      swarm_status = ?,
      swarm_fetched_at = COALESCE(?, swarm_fetched_at),
      swarm_source = ?,
      updated_at = ?
    WHERE item_id = ?
  `);

  const status = swarmData.swarmStatus || 'complete';
  stmt.run(
    swarmData.seeds ?? null,
    swarmData.leechers ?? null,
    swarmData.peers ?? null,
    status,
    status === 'failed' ? null : now,
    swarmData.swarmSource || 'unknown',
    now,
    itemId
  );

  return getByItemId(itemId);
}

function markFetching(itemId) {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = getByItemId(itemId);
  if (!existing) {
    db.prepare(`
      INSERT INTO torrent_metadata (
        item_id, metadata_status, swarm_status, last_attempt_at, attempts, created_at, updated_at
      ) VALUES (?, 'fetching', 'fetching', ?, 1, ?, ?)
    `).run(itemId, now, now, now);
  } else {
    db.prepare(`
      UPDATE torrent_metadata SET
        metadata_status = CASE WHEN metadata_status != 'complete' THEN 'fetching' ELSE metadata_status END,
        swarm_status = CASE WHEN swarm_status != 'complete' THEN 'fetching' ELSE swarm_status END,
        last_attempt_at = ?,
        attempts = attempts + 1,
        updated_at = ?
      WHERE item_id = ?
    `).run(now, now, itemId);
  }

  return getByItemId(itemId);
}

function markFailed(itemId, errorMsg, nextRetryMs = 900000) {
  const db = getDb();
  const now = new Date();
  const nowStr = now.toISOString();
  const nextRetryStr = new Date(now.getTime() + nextRetryMs).toISOString();

  const existing = getByItemId(itemId);
  if (!existing) {
    db.prepare(`
      INSERT INTO torrent_metadata (
        item_id, metadata_status, swarm_status, last_attempt_at, next_retry_at, attempts, last_error, created_at, updated_at
      ) VALUES (?, 'failed', 'failed', ?, ?, 1, ?, ?, ?)
    `).run(itemId, nowStr, nextRetryStr, errorMsg, nowStr, nowStr);
  } else {
    db.prepare(`
      UPDATE torrent_metadata SET
        metadata_status = CASE WHEN metadata_status != 'complete' THEN 'failed' ELSE metadata_status END,
        swarm_status = CASE WHEN swarm_status != 'complete' THEN 'failed' ELSE swarm_status END,
        last_attempt_at = ?,
        next_retry_at = ?,
        last_error = ?,
        updated_at = ?
      WHERE item_id = ?
    `).run(nowStr, nextRetryStr, errorMsg, nowStr, itemId);
  }

  return getByItemId(itemId);
}

function getPending(limit = 10) {
  const db = getDb();
  const nowStr = new Date().toISOString();
  const rows = db.prepare(`
    SELECT i.id as item_id, idt.magnet
    FROM items i
    JOIN item_details idt ON i.id = idt.item_id
    LEFT JOIN torrent_metadata tm ON i.id = tm.item_id
    WHERE idt.magnet IS NOT NULL
      AND (
        tm.item_id IS NULL
        OR (
          tm.metadata_status IN ('pending', 'failed')
          AND (tm.next_retry_at IS NULL OR tm.next_retry_at <= ?)
        )
      )
    LIMIT ?
  `).all(nowStr, limit);

  return rows;
}

function getStaleSwarm(ttlMs = 21600000, limit = 10) {
  const db = getDb();
  const cutoff = new Date(Date.now() - ttlMs).toISOString();
  const rows = db.prepare(`
    SELECT tm.item_id, idt.magnet, tm.info_hash
    FROM torrent_metadata tm
    JOIN item_details idt ON tm.item_id = idt.item_id
    WHERE tm.metadata_status = 'complete'
      AND (tm.swarm_fetched_at IS NULL OR tm.swarm_fetched_at <= ?)
    LIMIT ?
  `).all(cutoff, limit);

  return rows;
}

function getStats() {
  const db = getDb();
  const totalMagnets = db.prepare(`
    SELECT COUNT(*) as count FROM item_details WHERE magnet IS NOT NULL
  `).get().count;

  const metadataStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN metadata_status = 'complete' THEN 1 END) as complete,
      COUNT(CASE WHEN metadata_status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN metadata_status = 'fetching' THEN 1 END) as fetching,
      COUNT(CASE WHEN metadata_status = 'failed' THEN 1 END) as failed
    FROM torrent_metadata
  `).get();

  const coverage = totalMagnets > 0 ? ((metadataStats.complete / totalMagnets) * 100).toFixed(1) : '0.0';

  return {
    totalMagnets,
    metadataComplete: metadataStats.complete,
    metadataPending: metadataStats.pending,
    metadataFetching: metadataStats.fetching,
    metadataFailed: metadataStats.failed,
    coveragePercent: parseFloat(coverage),
  };
}

module.exports = {
  getByItemId,
  getByInfoHash,
  upsertMetadata,
  updateSwarmStats,
  markFetching,
  markFailed,
  getPending,
  getStaleSwarm,
  getStats,
};
