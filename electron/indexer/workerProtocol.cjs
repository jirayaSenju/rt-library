/**
 * Message protocol constants and formatters for Main <-> utilityProcess Worker IPC
 */

const WORKER_MESSAGE_TYPES = {
  // Main -> Worker
  INDEX_CATEGORY: 'INDEX_CATEGORY',
  CANCEL_TASK: 'CANCEL_TASK',
  SHUTDOWN: 'SHUTDOWN',

  // Worker -> Main
  STARTED: 'STARTED',
  PARSED: 'PARSED',
  BATCH: 'BATCH',
  PROGRESS: 'PROGRESS',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
};

function createIndexTaskMessage(taskId, filePath, filename, categoryId, batchSize = 500) {
  return {
    type: WORKER_MESSAGE_TYPES.INDEX_CATEGORY,
    taskId,
    filePath,
    filename,
    categoryId,
    batchSize,
  };
}

function createStartedMessage(taskId, filename, fileSize) {
  return {
    type: WORKER_MESSAGE_TYPES.STARTED,
    taskId,
    filename,
    fileSize,
  };
}

function createParsedMessage(taskId, categoryHeader, totalItems) {
  return {
    type: WORKER_MESSAGE_TYPES.PARSED,
    taskId,
    categoryHeader,
    totalItems,
  };
}

function createBatchMessage(taskId, categoryId, batchIndex, items, processed, total) {
  return {
    type: WORKER_MESSAGE_TYPES.BATCH,
    taskId,
    categoryId,
    batchIndex,
    items,
    processed,
    total,
  };
}

function createProgressMessage(taskId, categoryId, processed, total, percent) {
  return {
    type: WORKER_MESSAGE_TYPES.PROGRESS,
    taskId,
    categoryId,
    processed,
    total,
    percent,
  };
}

function createCompleteMessage(taskId, categoryId, totalItems, timings) {
  return {
    type: WORKER_MESSAGE_TYPES.COMPLETE,
    taskId,
    categoryId,
    totalItems,
    timings,
  };
}

function createErrorMessage(taskId, categoryId, code, message) {
  return {
    type: WORKER_MESSAGE_TYPES.ERROR,
    taskId,
    categoryId,
    code,
    message,
  };
}

module.exports = {
  WORKER_MESSAGE_TYPES,
  createIndexTaskMessage,
  createStartedMessage,
  createParsedMessage,
  createBatchMessage,
  createProgressMessage,
  createCompleteMessage,
  createErrorMessage,
};
