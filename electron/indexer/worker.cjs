/**
 * Electron utilityProcess Worker Script for RT-Library Catalog Indexing.
 * Responsibilities: File Read (fs.readFileSync), JSON.parse, Header Parsing, Item Normalization.
 * 
 * STRICT ARCHITECTURAL ISOLATION:
 * - Does NOT require better-sqlite3
 * - Does NOT open or access SQLite databases
 * - Does NOT mutate user favorites or database schema
 */

const fs = require('fs');
const { parseCategoryHeader, extractItemsList, normalizeItem } = require('./normalize.cjs');
const {
  WORKER_MESSAGE_TYPES,
  createStartedMessage,
  createParsedMessage,
  createBatchMessage,
  createProgressMessage,
  createCompleteMessage,
  createErrorMessage,
} = require('./workerProtocol.cjs');

function sendToParent(msg) {
  if (process.parentPort) {
    process.parentPort.postMessage(msg);
  } else if (typeof process.send === 'function') {
    process.send(msg);
  }
}

function handleIndexTask(task) {
  const { taskId, filePath, filename, batchSize = 500 } = task;
  const tWorkerStart = performance.now();

  let fileSize = 0;
  try {
    const stat = fs.statSync(filePath);
    fileSize = stat.size;
  } catch (statErr) {
    // Stat is best-effort for progress metadata
  }

  sendToParent(createStartedMessage(taskId, filename, fileSize));

  // 1. File Read
  let rawContent = null;
  const tReadStart = performance.now();
  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } catch (readErr) {
    sendToParent(createErrorMessage(taskId, task.categoryId || 'unknown', 'READ_ERROR', `File read failed: ${readErr.message}`));
    return;
  }
  const readMs = performance.now() - tReadStart;

  // 2. JSON Parse
  let jsonContent = null;
  const tParseStart = performance.now();
  try {
    jsonContent = JSON.parse(rawContent);
  } catch (parseErr) {
    sendToParent(createErrorMessage(taskId, task.categoryId || 'unknown', 'PARSE_ERROR', `JSON parse failed: ${parseErr.message}`));
    return;
  }
  const parseMs = performance.now() - tParseStart;

  // Free raw string reference early to release RAM in worker heap
  rawContent = null;

  // 3. Extract & Header Parse
  const categoryHeader = parseCategoryHeader(filename, jsonContent);
  const rawItems = extractItemsList(jsonContent);
  const totalItems = rawItems.length;

  sendToParent(createParsedMessage(taskId, categoryHeader, totalItems));

  if (totalItems === 0) {
    const workerTotalMs = performance.now() - tWorkerStart;
    sendToParent(createCompleteMessage(taskId, categoryHeader.id, 0, {
      readMs,
      parseMs,
      normalizeMs: 0,
      workerTotalMs,
    }));
    return;
  }

  // 4. Batch Normalization & Streaming Batch Delivery
  const tNormStart = performance.now();
  let processed = 0;
  let batchIndex = 0;

  for (let i = 0; i < totalItems; i += batchSize) {
    const chunk = rawItems.slice(i, i + batchSize);
    const normalizedChunk = [];

    for (const rawItem of chunk) {
      const item = normalizeItem(rawItem, categoryHeader.id, categoryHeader.name);
      if (item) {
        normalizedChunk.push(item);
      }
    }

    processed += chunk.length;
    batchIndex++;

    const percent = Math.min(100, Math.round((processed / totalItems) * 100));

    sendToParent(createBatchMessage(taskId, categoryHeader.id, batchIndex, normalizedChunk, processed, totalItems));
    sendToParent(createProgressMessage(taskId, categoryHeader.id, processed, totalItems, percent));
  }

  const normalizeMs = performance.now() - tNormStart;
  const workerTotalMs = performance.now() - tWorkerStart;

  sendToParent(createCompleteMessage(taskId, categoryHeader.id, totalItems, {
    readMs,
    parseMs,
    normalizeMs,
    workerTotalMs,
  }));
}

if (process.parentPort) {
  process.parentPort.on('message', (event) => {
    const task = event.data;
    if (!task || typeof task !== 'object') return;

    if (task.type === WORKER_MESSAGE_TYPES.INDEX_CATEGORY) {
      handleIndexTask(task);
    } else if (task.type === WORKER_MESSAGE_TYPES.SHUTDOWN) {
      process.exit(0);
    }
  });
} else if (process.on) {
  process.on('message', (task) => {
    if (!task || typeof task !== 'object') return;

    if (task.type === WORKER_MESSAGE_TYPES.INDEX_CATEGORY) {
      handleIndexTask(task);
    } else if (task.type === WORKER_MESSAGE_TYPES.SHUTDOWN) {
      process.exit(0);
    }
  });
}
