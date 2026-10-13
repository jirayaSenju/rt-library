const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const { normalizeItem } = require('./normalize.cjs');

/** Shared Main-process normalization and transactional persistence for scraper and HTML batches. */
function ingestRawBatch(db, category, rawItems, { preserveMissingFields = false, batchDiscoveredAt = null } = {}) {
  if (!db) throw new Error('Database connection is required for ingestion.');
  if (!category?.id || !Array.isArray(rawItems)) throw new Error('A category and item list are required for ingestion.');

  const invalid = [];
  const unique = new Map();
  let duplicateCount = 0;
  for (const raw of rawItems) {
    const topicId = String(raw?.topicId || raw?.url?.match(/[?&]t=(\d+)/)?.[1] || '');
    if (!/^\d+$/.test(topicId)) { invalid.push(raw); continue; }
    const itemId = `topic_${topicId}`;
    if (unique.has(itemId)) { duplicateCount += 1; continue; }
    unique.set(itemId, { ...raw, id: itemId, topicId, source: { ...(raw.source || {}), site: raw.source?.site || 'rutracker' } });
  }

  const normalized = [...unique.values()].map((raw) => {
    const item = normalizeItem(raw, category.id, category.name);
    if (item && preserveMissingFields) {
      item.preserveMissingFields = true;
      if (typeof raw.fileList === 'string' && raw.fileList.trim()) item.details.fileList = [raw.fileList.trim()];
    }
    if (item && batchDiscoveredAt && !item.discoveredAt) {
      item.discoveredAt = batchDiscoveredAt;
    }
    return item;
  }).filter(Boolean);
  const exists = db.prepare('SELECT id FROM items WHERE id = ?');
  const existingIds = new Set(normalized.filter((item) => exists.get(item.id)).map((item) => item.id));

  if (normalized.length) {
    const now = new Date().toISOString();
    db.transaction(() => {
      // 1. Ensure category exists FIRST to satisfy foreign key constraint
      categoriesRepo.upsert(db, {
        id: category.id,
        name: category.name || category.id,
        baseUrl: category.baseUrl || category.base_url || null,
        titleSearch: category.titleSearch || category.title_search || null,
        filePath: category.filePath || category.file_path || '',
        itemCount: 0,
        lastScrapedAt: now,
      });

      // 2. Batch upsert items referencing this category
      itemsRepo.upsertBatch(db, normalized);

      // 3. Update category with accurate item count
      const totalCount = itemsRepo.countByCategory(db, category.id);
      categoriesRepo.upsert(db, { ...category, itemCount: totalCount, lastScrapedAt: now });
    })();
  }

  const updated = normalized.filter((item) => existingIds.has(item.id)).length;
  return {
    items: normalized,
    inserted: normalized.length - updated,
    updated,
    skipped: invalid.length + duplicateCount,
    invalid: invalid.length,
    written: normalized.length,
  };
}

module.exports = { ingestRawBatch };
