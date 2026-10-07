const fs = require('fs');
const path = require('path');
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const { parseCategoryHeader } = require('./normalize.cjs');

/**
 * Scans library directory and detects changed category files using fs.stat mtime and size.
 */
function scanCatalogDirectory(db, libraryPath, force = false) {
  if (!fs.existsSync(libraryPath)) {
    throw new Error(`[SCANNER][ERROR] Catalog directory does not exist: ${libraryPath}`);
  }

  const entries = fs.readdirSync(libraryPath, { withFileTypes: true });
  const scannedFiles = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const filePath = path.join(libraryPath, entry.name);
      try {
        const stat = fs.statSync(filePath);
        const catHeader = parseCategoryHeader(entry.name, null);
        const existingCat = categoriesRepo.getById(db, catHeader.id);

        const isUnchanged =
          !force &&
          existingCat &&
          existingCat.file_mtime === stat.mtimeMs &&
          existingCat.file_size === stat.size &&
          existingCat.item_count > 0;

        scannedFiles.push({
          filePath,
          filename: entry.name,
          categoryId: catHeader.id,
          size: stat.size,
          mtime: stat.mtimeMs,
          status: isUnchanged ? 'skipped' : 'pending',
          existingItemCount: existingCat ? existingCat.item_count : 0,
        });
      } catch (statErr) {
        console.warn(`[SCANNER][WARN] Could not stat file ${filePath}:`, statErr.message);
      }
    }
  }

  return scannedFiles;
}

module.exports = {
  scanCatalogDirectory,
};
