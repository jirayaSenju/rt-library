/**
 * Synchronization History & Health Repository for SQLite (V3-75)
 * Handles persistent operational audit log of scraper runs and per-category health.
 */

function generateId(prefix = 'run') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a new sync run in SQLite.
 * Enforces retention policy keeping at most 100 historical runs.
 */
function createRun(db, data = {}) {
  if (!db) throw new Error('[SYNC_HISTORY] Database is required to create sync run');

  const id = data.id || generateId('run');
  const startedAt = data.startedAt || new Date().toISOString();
  const status = data.status || 'RUNNING';
  const mode = data.mode || 'INCREMENTAL';
  const transport = data.transport || 'BROWSER_COMPANION';
  const scopeType = data.scopeType || 'ALL_ENABLED_CATEGORIES';
  const scopeCategoryId = data.scopeCategoryId || null;
  const triggerType = data.triggerType || 'MANUAL';
  const categoriesTotal = Number(data.categoriesTotal) || 0;

  const stmt = db.prepare(`
    INSERT INTO sync_runs (
      id, started_at, status, mode, transport, scope_type, scope_category_id, trigger_type,
      categories_total, categories_completed, topics_found, new_items, updated_items,
      known_items, saved_items, failed_items, duration_ms, cancelled_by_user,
      verification_required, error_code, error_summary
    ) VALUES (
      @id, @startedAt, @status, @mode, @transport, @scopeType, @scopeCategoryId, @triggerType,
      @categoriesTotal, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, NULL, NULL
    )
  `);

  stmt.run({
    id,
    startedAt,
    status,
    mode,
    transport,
    scopeType,
    scopeCategoryId,
    triggerType,
    categoriesTotal,
  });

  // Retention: keep latest 100 runs
  try {
    applyRetention(db, 100);
  } catch (err) {
    console.warn('[SYNC_HISTORY] Retention cleanup warning:', err.message);
  }

  return id;
}

/**
 * Applies retention policy deleting oldest runs beyond maxCount.
 * Does not delete the currently active running run.
 */
function applyRetention(db, maxCount = 100) {
  if (!db) return;
  const countRow = db.prepare('SELECT COUNT(*) AS total FROM sync_runs').get();
  if (countRow && countRow.total > maxCount) {
    db.prepare(`
      DELETE FROM sync_runs
      WHERE status != 'RUNNING' AND id NOT IN (
        SELECT id FROM sync_runs ORDER BY started_at DESC LIMIT ?
      )
    `).run(maxCount);
  }
}

/**
 * Updates an ongoing sync run with progress counters at page boundaries.
 */
function updateRunProgress(db, runId, updates = {}) {
  if (!db || !runId) return;

  const fields = [];
  const params = { id: runId };

  if (updates.categoriesCompleted != null) {
    fields.push('categories_completed = @categoriesCompleted');
    params.categoriesCompleted = Number(updates.categoriesCompleted);
  }
  if (updates.topicsFound != null) {
    fields.push('topics_found = @topicsFound');
    params.topicsFound = Number(updates.topicsFound);
  }
  if (updates.newItems != null) {
    fields.push('new_items = @newItems');
    params.newItems = Number(updates.newItems);
  }
  if (updates.updatedItems != null) {
    fields.push('updated_items = @updatedItems');
    params.updatedItems = Number(updates.updatedItems);
  }
  if (updates.knownItems != null) {
    fields.push('known_items = @knownItems');
    params.knownItems = Number(updates.knownItems);
  }
  if (updates.savedItems != null) {
    fields.push('saved_items = @savedItems');
    params.savedItems = Number(updates.savedItems);
  }
  if (updates.failedItems != null) {
    fields.push('failed_items = @failedItems');
    params.failedItems = Number(updates.failedItems);
  }
  if (updates.durationMs != null) {
    fields.push('duration_ms = @durationMs');
    params.durationMs = Number(updates.durationMs);
  }
  if (updates.verificationRequired != null) {
    fields.push('verification_required = @verificationRequired');
    params.verificationRequired = updates.verificationRequired ? 1 : 0;
  }

  if (fields.length === 0) return;

  const query = `UPDATE sync_runs SET ${fields.join(', ')} WHERE id = @id`;
  db.prepare(query).run(params);
}

/**
 * Finishes a sync run with final status, timestamps, and error summary.
 */
function finishRun(db, runId, data = {}) {
  if (!db || !runId) return;

  const finishedAt = data.finishedAt || new Date().toISOString();
  const status = data.status || 'COMPLETED';
  const durationMs = Number(data.durationMs) || 0;
  const cancelledByUser = data.cancelledByUser ? 1 : 0;
  const verificationRequired = data.verificationRequired ? 1 : 0;
  const errorCode = data.errorCode || null;
  const errorSummary = data.errorSummary || null;

  const fields = [
    'finished_at = @finishedAt',
    'status = @status',
    'duration_ms = @durationMs',
    'cancelled_by_user = @cancelledByUser',
    'verification_required = CASE WHEN verification_required = 1 THEN 1 ELSE @verificationRequired END',
    'error_code = @errorCode',
    'error_summary = @errorSummary',
  ];

  const params = {
    id: runId,
    finishedAt,
    status,
    durationMs,
    cancelledByUser,
    verificationRequired,
    errorCode,
    errorSummary,
  };

  if (data.newItems != null) {
    fields.push('new_items = @newItems');
    params.newItems = Number(data.newItems);
  }
  if (data.updatedItems != null) {
    fields.push('updated_items = @updatedItems');
    params.updatedItems = Number(data.updatedItems);
  }
  if (data.savedItems != null) {
    fields.push('saved_items = @savedItems');
    params.savedItems = Number(data.savedItems);
  }
  if (data.categoriesCompleted != null) {
    fields.push('categories_completed = @categoriesCompleted');
    params.categoriesCompleted = Number(data.categoriesCompleted);
  }

  const query = `UPDATE sync_runs SET ${fields.join(', ')} WHERE id = @id`;
  db.prepare(query).run(params);
}

/**
 * Upserts a category run record. Keyed by composite or deterministic id.
 */
function upsertCategoryRun(db, data = {}) {
  if (!db || !data.syncRunId || !data.categoryId) return;

  const id = data.id || `${data.syncRunId}_${data.categoryId}`;
  const syncRunId = data.syncRunId;
  const categoryId = data.categoryId;
  const categoryNameSnapshot = data.categoryNameSnapshot || categoryId;
  const startedAt = data.startedAt || new Date().toISOString();
  const finishedAt = data.finishedAt || null;
  const status = data.status || 'RUNNING';
  const pagesProcessed = Number(data.pagesProcessed) || 0;
  const totalPages = Number(data.totalPages) || 0;
  const topicsFound = Number(data.topicsFound) || 0;
  const newItems = Number(data.newItems) || 0;
  const updatedItems = Number(data.updatedItems) || 0;
  const knownItems = Number(data.knownItems) || 0;
  const savedItems = Number(data.savedItems) || 0;
  const durationMs = Number(data.durationMs) || 0;
  const errorCode = data.errorCode || null;
  const errorSummary = data.errorSummary || null;

  const stmt = db.prepare(`
    INSERT INTO sync_run_categories (
      id, sync_run_id, category_id, category_name_snapshot, started_at, finished_at,
      status, pages_processed, total_pages, topics_found, new_items, updated_items,
      known_items, saved_items, duration_ms, error_code, error_summary
    ) VALUES (
      @id, @syncRunId, @categoryId, @categoryNameSnapshot, @startedAt, @finishedAt,
      @status, @pagesProcessed, @totalPages, @topicsFound, @newItems, @updatedItems,
      @knownItems, @savedItems, @durationMs, @errorCode, @errorSummary
    )
    ON CONFLICT(id) DO UPDATE SET
      finished_at = excluded.finished_at,
      status = excluded.status,
      pages_processed = excluded.pages_processed,
      total_pages = excluded.total_pages,
      topics_found = excluded.topics_found,
      new_items = excluded.new_items,
      updated_items = excluded.updated_items,
      known_items = excluded.known_items,
      saved_items = excluded.saved_items,
      duration_ms = excluded.duration_ms,
      error_code = excluded.error_code,
      error_summary = excluded.error_summary
  `);

  stmt.run({
    id,
    syncRunId,
    categoryId,
    categoryNameSnapshot,
    startedAt,
    finishedAt,
    status,
    pagesProcessed,
    totalPages,
    topicsFound,
    newItems,
    updatedItems,
    knownItems,
    savedItems,
    durationMs,
    errorCode,
    errorSummary,
  });

  return id;
}

/**
 * Detects any leftover RUNNING runs (e.g. from app force quit or crash)
 * and transitions them to INTERRUPTED.
 */
function cleanupInterruptedRuns(db) {
  if (!db) return 0;
  try {
    const now = new Date().toISOString();
    const updateRuns = db.prepare(`
      UPDATE sync_runs
      SET
        status = 'INTERRUPTED',
        finished_at = COALESCE(finished_at, ?),
        error_summary = COALESCE(error_summary, 'Application closed during synchronization')
      WHERE status IN ('RUNNING', 'CANCELLING')
    `);
    const runResult = updateRuns.run(now);

    const updateCats = db.prepare(`
      UPDATE sync_run_categories
      SET
        status = 'INTERRUPTED',
        finished_at = COALESCE(finished_at, ?),
        error_summary = COALESCE(error_summary, 'Application closed during synchronization')
      WHERE status = 'RUNNING'
    `);
    updateCats.run(now);

    return runResult.changes || 0;
  } catch (err) {
    console.warn('[SYNC_HISTORY] cleanupInterruptedRuns warning:', err.message);
    return 0;
  }
}

/**
 * Retrieves paginated list of sync runs with optional status filtering.
 */
function getRuns(db, options = {}) {
  if (!db) return { runs: [], total: 0 };

  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const offset = Math.max(0, Number(options.offset) || 0);
  const statusFilter = typeof options.statusFilter === 'string' ? options.statusFilter.toUpperCase() : 'ALL';

  let whereClause = '';
  const params = [];

  if (statusFilter && statusFilter !== 'ALL') {
    if (statusFilter === 'COMPLETED') {
      whereClause = "WHERE status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')";
    } else if (statusFilter === 'WARNINGS') {
      whereClause = "WHERE status = 'COMPLETED_WITH_WARNINGS'";
    } else if (statusFilter === 'FAILED') {
      whereClause = "WHERE status IN ('FAILED', 'INTERRUPTED')";
    } else if (statusFilter === 'CANCELLED') {
      whereClause = "WHERE status = 'CANCELLED'";
    } else {
      whereClause = 'WHERE status = ?';
      params.push(statusFilter);
    }
  }

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM sync_runs ${whereClause}`).get(...params);
  const total = countRow ? countRow.total : 0;

  const rows = db.prepare(`
    SELECT
      id, started_at AS startedAt, finished_at AS finishedAt, status, mode, transport,
      scope_type AS scopeType, scope_category_id AS scopeCategoryId, trigger_type AS triggerType,
      categories_total AS categoriesTotal, categories_completed AS categoriesCompleted,
      topics_found AS topicsFound, new_items AS newItems, updated_items AS updatedItems,
      known_items AS knownItems, saved_items AS savedItems, failed_items AS failedItems,
      duration_ms AS durationMs, cancelled_by_user AS cancelledByUser,
      verification_required AS verificationRequired, error_code AS errorCode, error_summary AS errorSummary
    FROM sync_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { runs: rows, total };
}

/**
 * Retrieves full details of a specific sync run including category breakdown.
 */
function getRunDetails(db, runId) {
  if (!db || !runId) return null;

  const run = db.prepare(`
    SELECT
      id, started_at AS startedAt, finished_at AS finishedAt, status, mode, transport,
      scope_type AS scopeType, scope_category_id AS scopeCategoryId, trigger_type AS triggerType,
      categories_total AS categoriesTotal, categories_completed AS categoriesCompleted,
      topics_found AS topicsFound, new_items AS newItems, updated_items AS updatedItems,
      known_items AS knownItems, saved_items AS savedItems, failed_items AS failedItems,
      duration_ms AS durationMs, cancelled_by_user AS cancelledByUser,
      verification_required AS verificationRequired, error_code AS errorCode, error_summary AS errorSummary
    FROM sync_runs
    WHERE id = ?
  `).get(runId);

  if (!run) return null;

  const categories = db.prepare(`
    SELECT
      id, sync_run_id AS syncRunId, category_id AS categoryId,
      category_name_snapshot AS categoryNameSnapshot, started_at AS startedAt,
      finished_at AS finishedAt, status, pages_processed AS pagesProcessed,
      total_pages AS totalPages, topics_found AS topicsFound, new_items AS newItems,
      updated_items AS updatedItems, known_items AS knownItems, saved_items AS savedItems,
      duration_ms AS durationMs, error_code AS errorCode, error_summary AS errorSummary
    FROM sync_run_categories
    WHERE sync_run_id = ?
    ORDER BY started_at ASC
  `).all(runId);

  return {
    ...run,
    categories,
  };
}

/**
 * Computes the operational sync health summary across all categories.
 */
function getSyncHealth(db, allCategories = []) {
  if (!db) {
    return {
      lastSuccessfulSync: null,
      lastRun: null,
      healthyCategoriesCount: 0,
      needingAttentionCount: 0,
      categories: [],
    };
  }

  // 1. Last successful sync
  const lastSuccessRow = db.prepare(`
    SELECT id, started_at AS startedAt, finished_at AS finishedAt, new_items AS newItems, updated_items AS updatedItems, duration_ms AS durationMs
    FROM sync_runs
    WHERE status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')
    ORDER BY finished_at DESC
    LIMIT 1
  `).get();

  // 2. Last run overall
  const lastRunRow = db.prepare(`
    SELECT id, started_at AS startedAt, finished_at AS finishedAt, status, new_items AS newItems, updated_items AS updatedItems, duration_ms AS durationMs, error_summary AS errorSummary
    FROM sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).get();

  // 3. Category health breakdown
  const categoryHealthList = [];
  let healthyCount = 0;
  let attentionCount = 0;

  for (const cat of allCategories) {
    const catId = cat.id;
    const catName = cat.name || catId;

    // Get latest category run record
    const latestCatRun = db.prepare(`
      SELECT src.status, src.started_at AS startedAt, src.finished_at AS finishedAt, src.error_summary AS errorSummary, sr.status AS runStatus
      FROM sync_run_categories src
      JOIN sync_runs sr ON sr.id = src.sync_run_id
      WHERE src.category_id = ?
      ORDER BY src.started_at DESC
      LIMIT 1
    `).get(catId);

    // Get latest successful category run timestamp
    const latestSuccess = db.prepare(`
      SELECT src.finished_at AS finishedAt
      FROM sync_run_categories src
      WHERE src.category_id = ? AND src.status = 'COMPLETED'
      ORDER BY src.finished_at DESC
      LIMIT 1
    `).get(catId);

    let status = 'NEVER_SYNCED';
    let lastError = null;

    if (latestCatRun) {
      if (latestCatRun.status === 'COMPLETED') {
        status = 'UP_TO_DATE';
      } else if (latestCatRun.status === 'FAILED' || latestCatRun.status === 'INTERRUPTED') {
        status = 'FAILED';
        lastError = latestCatRun.errorSummary || 'Category synchronization failed';
      } else if (latestCatRun.status === 'WARNING') {
        status = 'WARNING';
        lastError = latestCatRun.errorSummary || 'Completed with warnings';
      } else if (latestCatRun.status === 'CANCELLED') {
        status = latestSuccess ? 'UP_TO_DATE' : 'WARNING';
      }
    }

    if (status === 'UP_TO_DATE') {
      healthyCount++;
    } else {
      attentionCount++;
    }

    categoryHealthList.push({
      categoryId: catId,
      categoryName: catName,
      status,
      lastSuccessfulSyncAt: latestSuccess ? latestSuccess.finishedAt : (cat.last_scraped_at || cat.lastScrapedAt || null),
      lastAttemptAt: latestCatRun ? latestCatRun.startedAt : null,
      lastError,
    });
  }

  return {
    lastSuccessfulSync: lastSuccessRow || null,
    lastRun: lastRunRow || null,
    healthyCategoriesCount: healthyCount,
    needingAttentionCount: attentionCount,
    categories: categoryHealthList,
  };
}

/**
 * Clears historical sync runs (preserves any active RUNNING run).
 */
function clearHistory(db) {
  if (!db) return 0;
  const result = db.prepare("DELETE FROM sync_runs WHERE status != 'RUNNING'").run();
  return result.changes || 0;
}

module.exports = {
  createRun,
  updateRunProgress,
  finishRun,
  upsertCategoryRun,
  cleanupInterruptedRuns,
  getRuns,
  getRunDetails,
  getSyncHealth,
  clearHistory,
};

