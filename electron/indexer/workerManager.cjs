/**
 * Worker Manager for Electron Main Process.
 * Manages utilityProcess lifecycle, receives normalized item batches,
 * executes SQLite prepared statement UPSERTs in Main, and tracks background indexing progress.
 */

const electron = require('electron');
const childProcess = require('child_process');
const path = require('path');
const { scanCatalogDirectory } = require('./scanner.cjs');
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const { WORKER_MESSAGE_TYPES, createIndexTaskMessage } = require('./workerProtocol.cjs');

let workerChild = null;
let activeTaskPromiseMap = new Map();
const progressListeners = new Set();

const indexingState = {
  isIndexing: false,
  currentCategory: null,
  currentFile: null,
  processed: 0,
  total: 0,
  percent: 0,
  startedAt: null,
  status: 'idle', // 'idle' | 'scanning' | 'indexing' | 'completed' | 'failed'
  lastError: null,
};

function getIndexingState() {
  return { ...indexingState };
}

function addProgressListener(listener) {
  if (typeof listener === 'function') {
    progressListeners.add(listener);
  }
  return () => {
    progressListeners.delete(listener);
  };
}

function notifyProgressListeners(data) {
  for (const listener of progressListeners) {
    try {
      listener(data);
    } catch (err) {
      console.warn('[WORKER_MANAGER][WARN] Progress listener error:', err.message);
    }
  }
}

function sendTaskToWorker(worker, taskMsg) {
  if (worker && typeof worker.postMessage === 'function') {
    worker.postMessage(taskMsg);
  } else if (worker && typeof worker.send === 'function') {
    worker.send(taskMsg);
  }
}

function getOrSpawnWorker() {
  if (workerChild && !workerChild.killed) {
    return workerChild;
  }

  const workerScript = path.join(__dirname, 'worker.cjs');

  try {
    if (electron && electron.utilityProcess && typeof electron.utilityProcess.fork === 'function') {
      console.log(`[WORKER_MANAGER] Forking Electron utilityProcess worker: ${workerScript}`);
      workerChild = electron.utilityProcess.fork(workerScript);
    } else {
      console.log(`[WORKER_MANAGER] Forking Node.js child_process worker: ${workerScript}`);
      workerChild = childProcess.fork(workerScript, [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      });
    }

    workerChild.on('message', (msg) => {
      handleWorkerMessage(msg);
    });

    const spawnedWorker = workerChild;
    workerChild.on('exit', (code) => {
      console.log(`[WORKER_MANAGER] Background worker process exited with code: ${code}`);
      // A terminated worker can exit after its replacement has already started.
      if (workerChild !== spawnedWorker) return;
      workerChild = null;

      if (indexingState.isIndexing) {
        indexingState.isIndexing = false;
        indexingState.status = 'failed';
        indexingState.lastError = `Worker process exited unexpectedly with code ${code}`;
        notifyProgressListeners({
          status: 'failed',
          error: indexingState.lastError,
        });

        // Reject active pending promises
        for (const [taskId, deferred] of activeTaskPromiseMap.entries()) {
          deferred.reject(new Error(`Worker process exited unexpectedly with code ${code}`));
        }
        activeTaskPromiseMap.clear();
      }
    });

    workerChild.on('error', (err) => {
      console.error('[WORKER_MANAGER][ERROR] Background worker process error:', err.message);
    });

    return workerChild;
  } catch (spawnErr) {
    console.error('[WORKER_MANAGER][ERROR] Failed to spawn background worker:', spawnErr.message);
    throw spawnErr;
  }
}

function terminateWorker() {
  if (workerChild) {
    try {
      if (!workerChild.killed) {
        workerChild.kill();
      }
      console.log('[WORKER_MANAGER] Worker process killed safely');
    } catch (err) {
      console.warn('[WORKER_MANAGER][WARN] Error terminating worker:', err.message);
    } finally {
      workerChild = null;
    }
  }
}

function handleWorkerMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  const taskId = msg.taskId;
  const deferred = activeTaskPromiseMap.get(taskId);

  switch (msg.type) {
    case WORKER_MESSAGE_TYPES.STARTED:
      indexingState.currentFile = msg.filename;
      break;

    case WORKER_MESSAGE_TYPES.PARSED:
      if (deferred) {
        deferred.categoryHeader = msg.categoryHeader;
        deferred.totalItems = msg.totalItems;

        // Ensure parent category record exists in SQLite for Foreign Key constraint satisfaction
        if (deferred.db && msg.categoryHeader) {
          const now = new Date().toISOString();
          categoriesRepo.upsert(deferred.db, {
            id: msg.categoryHeader.id,
            name: msg.categoryHeader.name,
            baseUrl: msg.categoryHeader.baseUrl,
            titleSearch: msg.categoryHeader.titleSearch,
            filePath: deferred.filePath,
            itemCount: 0,
            fileMtime: deferred.fileMtime,
            fileSize: deferred.fileSize,
            lastScrapedAt: now,
            indexedAt: now,
          });
        }
      }
      break;

    case WORKER_MESSAGE_TYPES.BATCH:
      // MAIN PROCESS WRITER: Execute itemsRepo.upsertBatch within SQLite transaction in Main
      if (deferred && deferred.db && Array.isArray(msg.items) && msg.items.length > 0) {
        try {
          const tDbStart = performance.now();
          const inserted = itemsRepo.upsertBatch(deferred.db, msg.items);
          deferred.dbMs = (deferred.dbMs || 0) + (performance.now() - tDbStart);
          deferred.batchInsertedCount = (deferred.batchInsertedCount || 0) + inserted;
        } catch (dbErr) {
          console.error(`[WORKER_MANAGER][ERROR] DB batch insert failed for task ${taskId}:`, dbErr.message);
          deferred.dbError = dbErr.message;
        }
      }
      break;

    case WORKER_MESSAGE_TYPES.PROGRESS:
      indexingState.processed = msg.processed;
      indexingState.total = msg.total;
      indexingState.percent = msg.percent;
      indexingState.currentCategory = msg.categoryId;

      notifyProgressListeners({
        status: 'indexing',
        categoryId: msg.categoryId,
        processed: msg.processed,
        total: msg.total,
        percent: msg.percent,
        currentFile: indexingState.currentFile,
      });
      break;

    case WORKER_MESSAGE_TYPES.COMPLETE:
      if (deferred) {
        // Validate category & update category metadata only upon full success
        if (deferred.db && deferred.categoryHeader && !deferred.dbError) {
          const now = new Date().toISOString();
          categoriesRepo.upsert(deferred.db, {
            id: deferred.categoryHeader.id,
            name: deferred.categoryHeader.name,
            baseUrl: deferred.categoryHeader.baseUrl,
            titleSearch: deferred.categoryHeader.titleSearch,
            filePath: deferred.filePath,
            itemCount: msg.totalItems,
            fileMtime: deferred.fileMtime,
            fileSize: deferred.fileSize,
            lastScrapedAt: now,
            indexedAt: now,
          });
        }

        activeTaskPromiseMap.delete(taskId);
        deferred.resolve({
          status: deferred.dbError ? 'failed' : 'imported',
          categoryId: msg.categoryId,
          totalItems: msg.totalItems,
          timings: {
            ...msg.timings,
            dbMs: deferred.dbMs || 0,
          },
          error: deferred.dbError || null,
        });
      }
      break;

    case WORKER_MESSAGE_TYPES.ERROR:
      console.error(`[WORKER_MANAGER][ERROR] Task ${taskId} failed in worker:`, msg.message);
      if (deferred) {
        activeTaskPromiseMap.delete(taskId);
        deferred.resolve({
          status: 'failed',
          categoryId: msg.categoryId,
          error: msg.message,
        });
      }
      break;

    default:
      console.warn('[WORKER_MANAGER][WARN] Unknown worker message type:', msg.type);
  }
}

/**
 * Runs background indexing using utilityProcess worker for file reading/parsing/normalization.
 * Electron Main remains single SQLite owner.
 */
async function indexLibraryBackground(db, options = {}) {
  if (indexingState.isIndexing) {
    console.log('[WORKER_MANAGER] Indexing request ignored: indexer is already running');
    return { status: 'already_indexing', state: getIndexingState() };
  }

  const libraryPath = options.libraryPath;
  const force = Boolean(options.force);
  const batchSize = typeof options.batchSize === 'number' ? options.batchSize : 500;

  if (!db) {
    throw new Error('[WORKER_MANAGER][ERROR] Database instance is required');
  }

  if (!libraryPath || typeof libraryPath !== 'string') {
    throw new Error('[WORKER_MANAGER][ERROR] libraryPath string is required');
  }

  indexingState.isIndexing = true;
  indexingState.status = 'scanning';
  indexingState.startedAt = Date.now();
  indexingState.lastError = null;

  notifyProgressListeners({
    status: 'scanning',
    libraryPath,
  });

  const tStart = performance.now();
  console.log(`[WORKER_MANAGER][START] Background indexing path: ${libraryPath} (force: ${force})`);

  let scannedFiles = [];
  try {
    scannedFiles = scanCatalogDirectory(db, libraryPath, force);
  } catch (scanErr) {
    indexingState.isIndexing = false;
    indexingState.status = 'failed';
    indexingState.lastError = scanErr.message;
    notifyProgressListeners({ status: 'failed', error: scanErr.message });
    throw scanErr;
  }

  const summary = {
    totalFiles: scannedFiles.length,
    importedCategories: 0,
    skippedCategories: 0,
    failedCategories: 0,
    totalItems: 0,
    durationMs: 0,
    results: [],
  };

  const pendingFiles = scannedFiles.filter(f => f.status === 'pending');

  if (pendingFiles.length === 0) {
    for (const f of scannedFiles) {
      summary.skippedCategories++;
      summary.totalItems += f.existingItemCount;
      summary.results.push({
        categoryId: f.categoryId,
        filename: f.filename,
        status: 'skipped',
        itemCount: f.existingItemCount,
        durationMs: 0,
      });
    }

    indexingState.isIndexing = false;
    indexingState.status = 'completed';
    summary.durationMs = performance.now() - tStart;

    notifyProgressListeners({
      status: 'complete',
      totalItems: summary.totalItems,
      changedCategories: [],
      durationMs: summary.durationMs,
    });

    console.log(`[WORKER_MANAGER][SKIP] All ${scannedFiles.length} catalog files are up to date`);
    return summary;
  }

  // Ensure worker process is alive
  const worker = getOrSpawnWorker();

  indexingState.status = 'indexing';
  const changedCategories = [];

  for (const fileInfo of scannedFiles) {
    if (fileInfo.status === 'skipped') {
      summary.skippedCategories++;
      summary.totalItems += fileInfo.existingItemCount;
      summary.results.push({
        categoryId: fileInfo.categoryId,
        filename: fileInfo.filename,
        status: 'skipped',
        itemCount: fileInfo.existingItemCount,
        durationMs: 0,
      });
      console.log(`[WORKER_MANAGER][SKIP] ${fileInfo.filename} (unchanged)`);
      continue;
    }

    const taskId = `task_${fileInfo.categoryId}_${Date.now()}`;
    const taskMsg = createIndexTaskMessage(taskId, fileInfo.filePath, fileInfo.filename, fileInfo.categoryId, batchSize);

    const taskPromise = new Promise((resolve, reject) => {
      activeTaskPromiseMap.set(taskId, {
        db,
        filePath: fileInfo.filePath,
        fileMtime: fileInfo.mtime,
        fileSize: fileInfo.size,
        resolve,
        reject,
      });
    });

    sendTaskToWorker(worker, taskMsg);

    let result = null;
    try {
      result = await taskPromise;
    } catch (taskErr) {
      result = {
        status: 'failed',
        categoryId: fileInfo.categoryId,
        error: taskErr.message,
      };
    }

    if (result.status === 'imported') {
      summary.importedCategories++;
      summary.totalItems += result.totalItems;
      summary.results.push({
        categoryId: fileInfo.categoryId,
        filename: fileInfo.filename,
        status: 'imported',
        itemCount: result.totalItems,
        durationMs: result.timings?.workerTotalMs || 0,
        timings: result.timings,
      });
      changedCategories.push(fileInfo.categoryId);

      console.log(
        `[WORKER_MANAGER][DONE] ${fileInfo.filename} (${result.totalItems.toLocaleString()} items) | workerRead: ${result.timings?.readMs?.toFixed(1) || 0}ms | workerParse: ${result.timings?.parseMs?.toFixed(1) || 0}ms | workerNorm: ${result.timings?.normalizeMs?.toFixed(1) || 0}ms | mainDb: ${result.timings?.dbMs?.toFixed(1) || 0}ms`
      );
    } else {
      summary.failedCategories++;
      summary.results.push({
        categoryId: fileInfo.categoryId,
        filename: fileInfo.filename,
        status: 'failed',
        error: result.error,
      });
    }
  }

  summary.durationMs = performance.now() - tStart;
  indexingState.isIndexing = false;
  indexingState.status = 'completed';

  notifyProgressListeners({
    status: 'complete',
    totalItems: summary.totalItems,
    changedCategories,
    durationMs: summary.durationMs,
  });

  console.log(
    `[WORKER_MANAGER][SUMMARY] Background indexing finished: ${summary.importedCategories}/${summary.totalFiles} imported (${summary.totalItems.toLocaleString()} items) in ${(summary.durationMs / 1000).toFixed(2)}s`
  );

  return summary;
}

module.exports = {
  indexLibraryBackground,
  getIndexingState,
  addProgressListener,
  terminateWorker,
};
