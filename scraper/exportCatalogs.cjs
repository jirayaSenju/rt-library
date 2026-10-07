/**
 * Catalog Export Module — Atomic JSON File Writer & Sanity Validator
 */

const path = require('path');
const fs = require('fs');

function resolveDataDir(customPath = null) {
  if (customPath) {
    const resolved = path.resolve(customPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    return resolved;
  }

  if (process.env.DATA_DIR) {
    const resolved = path.resolve(process.env.DATA_DIR);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    return resolved;
  }

  const candidates = [
    path.resolve(__dirname, '../data'),
    path.resolve(__dirname, '../../ecohub-app/data'),
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }

  const defaultDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
}

function validateCatalog(catData, existingFilePath = null) {
  if (!catData || typeof catData !== 'object') {
    return { valid: false, reason: 'Catalog is not an object' };
  }

  const catId = catData.id || (catData.category && catData.category.id);
  if (!catId || typeof catId !== 'string') {
    return { valid: false, reason: 'Missing or invalid catalog id' };
  }

  if (!Array.isArray(catData.items)) {
    return { valid: false, reason: `Catalog ${catId} items property is not an array` };
  }

  // Check if existing file has items, but new export is empty
  if (existingFilePath && fs.existsSync(existingFilePath)) {
    try {
      const existingContent = JSON.parse(fs.readFileSync(existingFilePath, 'utf8'));
      const existingItemsCount = Array.isArray(existingContent.items) ? existingContent.items.length : 0;
      if (existingItemsCount > 0 && catData.items.length === 0) {
        return {
          valid: false,
          reason: `EXPORT_REJECTED_EMPTY_CATEGORY: Existing file has ${existingItemsCount} items, but newly scraped ${catId} has 0 items`,
        };
      }
    } catch (_) {}
  }

  return { valid: true, id: catId };
}

function writeAtomicJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  const jsonStr = JSON.stringify(data, null, 2);

  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, jsonStr, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tmpPath, filePath);
}

function exportCatalogsAtomic(catalogs, options = {}) {
  const dataDir = resolveDataDir(options.dataDir);
  console.log(`[SCRAPER] Data directory: ${dataDir}`);

  if (!Array.isArray(catalogs) || catalogs.length === 0) {
    console.warn('[SCRAPER] No catalogs to export.');
    return { exported: [], rejected: [], dataDir };
  }

  const exported = [];
  const rejected = [];

  for (const cat of catalogs) {
    const catId = cat.id || (cat.category && cat.category.id);
    if (!catId) continue;

    const targetFile = path.join(dataDir, `${catId}.json`);
    const validation = validateCatalog(cat, targetFile);

    if (!validation.valid) {
      console.error(`[SCRAPER][REJECTED] ${catId}: ${validation.reason}`);
      rejected.push({ id: catId, reason: validation.reason });
      continue;
    }

    // Ensure standard schemaVersion = 2
    if (!cat.schemaVersion) {
      cat.schemaVersion = 2;
    }

    try {
      writeAtomicJson(targetFile, cat);
      exported.push({ id: catId, count: cat.items ? cat.items.length : 0, path: targetFile });
      console.log(`[SCRAPER][EXPORTED] ${catId}.json (${cat.items ? cat.items.length : 0} items) -> ${targetFile}`);
    } catch (err) {
      console.error(`[SCRAPER][ERROR] Failed atomic write for ${catId}: ${err.message}`);
      rejected.push({ id: catId, reason: err.message });
    }
  }

  console.log(`[SCRAPER] Export summary: ${exported.length} JSON files updated, ${rejected.length} rejected.`);
  return { exported, rejected, dataDir };
}

module.exports = {
  resolveDataDir,
  validateCatalog,
  writeAtomicJson,
  exportCatalogsAtomic,
};
