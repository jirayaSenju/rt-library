const fs = require('fs');
const { scanCatalogDirectory } = require('./scanner.cjs');
const { parseCategoryHeader, extractItemsList, normalizeItem } = require('./normalize.cjs');
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const workerManager = require('./workerManager.cjs');

/**
 * Background catalog JSON importer (PR 7).
 * Offloads read/parse/normalize to utilityProcess worker while Electron Main remains single SQLite owner.
 */
async function importLibraryAsync(db, options = {}) {
  return await workerManager.indexLibraryBackground(db, options);
}

/**
 * Synchronous in-process catalog importer (PR 5 compatibility / test runner fallback).
 */
function importLibrarySync(db, options = {}) {
  const libraryPath = options.libraryPath;
  const force = Boolean(options.force);
  const batchSize = typeof options.batchSize === 'number' ? options.batchSize : 500;

  if (!db) {
    throw new Error('[IMPORTER][ERROR] Database connection is required');
  }

  if (!libraryPath || typeof libraryPath !== 'string') {
    throw new Error('[IMPORTER][ERROR] libraryPath is required');
  }

  const tStart = performance.now();
  console.log(`[IMPORTER][START] Scanning catalog path (sync): ${libraryPath} (force: ${force})`);

  const scannedFiles = scanCatalogDirectory(db, libraryPath, force);

  const summary = {
    totalFiles: scannedFiles.length,
    importedCategories: 0,
    skippedCategories: 0,
    failedCategories: 0,
    totalItems: 0,
    durationMs: 0,
    results: [],
  };

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
      console.log(`[IMPORTER][SKIP] ${fileInfo.filename} (unchanged)`);
      continue;
    }

    const tFileStart = performance.now();
    let rawContent = null;
    let jsonContent = null;

    // 1. Read
    const tReadStart = performance.now();
    try {
      rawContent = fs.readFileSync(fileInfo.filePath, 'utf-8');
    } catch (readErr) {
      console.error(`[IMPORTER][ERROR] Failed to read ${fileInfo.filename}:`, readErr.message);
      summary.failedCategories++;
      summary.results.push({
        categoryId: fileInfo.categoryId,
        filename: fileInfo.filename,
        status: 'failed',
        error: `Read error: ${readErr.message}`,
        durationMs: performance.now() - tFileStart,
      });
      continue;
    }
    const readMs = performance.now() - tReadStart;

    // 2. Parse JSON
    const tParseStart = performance.now();
    try {
      jsonContent = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error(`[IMPORTER][ERROR] Failed to parse JSON in ${fileInfo.filename}:`, parseErr.message);
      summary.failedCategories++;
      summary.results.push({
        categoryId: fileInfo.categoryId,
        filename: fileInfo.filename,
        status: 'failed',
        error: `JSON Parse error: ${parseErr.message}`,
        durationMs: performance.now() - tFileStart,
      });
      continue;
    }
    const parseMs = performance.now() - tParseStart;

    // 3. Normalize
    const tNormStart = performance.now();
    const catHeader = parseCategoryHeader(fileInfo.filename, jsonContent);
    const rawItems = extractItemsList(jsonContent);

    const normalizedItems = [];
    for (const raw of rawItems) {
      const item = normalizeItem(raw, catHeader.id, catHeader.name);
      if (item) {
        normalizedItems.push(item);
      }
    }
    const normalizeMs = performance.now() - tNormStart;

    const now = new Date().toISOString();
    categoriesRepo.upsert(db, {
      id: catHeader.id,
      name: catHeader.name,
      baseUrl: catHeader.baseUrl,
      titleSearch: catHeader.titleSearch,
      filePath: fileInfo.filePath,
      itemCount: normalizedItems.length,
      fileMtime: fileInfo.mtime,
      fileSize: fileInfo.size,
      lastScrapedAt: now,
      indexedAt: now,
    });

    // 4. DB Batch Insertion
    const tDbStart = performance.now();
    try {
      let batchInserted = 0;
      for (let i = 0; i < normalizedItems.length; i += batchSize) {
        const chunk = normalizedItems.slice(i, i + batchSize);
        batchInserted += itemsRepo.upsertBatch(db, chunk);
      }

      const dbMs = performance.now() - tDbStart;
      const fileTotalMs = performance.now() - tFileStart;

      summary.importedCategories++;
      summary.totalItems += normalizedItems.length;
      summary.results.push({
        categoryId: catHeader.id,
        filename: fileInfo.filename,
        status: 'imported',
        itemCount: normalizedItems.length,
        durationMs: fileTotalMs,
        readMs,
        parseMs,
        normalizeMs,
        dbMs,
      });

      console.log(
        `[IMPORTER][DONE] ${fileInfo.filename} (${normalizedItems.length.toLocaleString()} items) | read: ${readMs.toFixed(1)}ms | parse: ${parseMs.toFixed(1)}ms | norm: ${normalizeMs.toFixed(1)}ms | db: ${dbMs.toFixed(1)}ms | total: ${fileTotalMs.toFixed(1)}ms`
      );
    } catch (dbErr) {
      console.error(`[IMPORTER][ERROR] Database transaction failed for ${fileInfo.filename}:`, dbErr.message);
      summary.failedCategories++;
      summary.results.push({
        categoryId: catHeader.id,
        filename: fileInfo.filename,
        status: 'failed',
        error: `Database error: ${dbErr.message}`,
        durationMs: performance.now() - tFileStart,
      });
    }
  }

  summary.durationMs = performance.now() - tStart;
  return summary;
}

module.exports = {
  importLibrary: importLibrarySync,
  importLibrarySync,
  importLibraryAsync,
};

