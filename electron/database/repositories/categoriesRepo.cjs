/**
 * Categories Repository for Native SQLite
 */

function getAll(db) {
  const stmt = db.prepare(`
    SELECT id, name, base_url, title_search, file_path, item_count, file_mtime, file_size, last_scraped_at, indexed_at, created_at, updated_at
    FROM categories
    ORDER BY name ASC
  `);
  return stmt.all();
}

function getById(db, id) {
  if (!id) return null;
  const stmt = db.prepare(`
    SELECT id, name, base_url, title_search, file_path, item_count, file_mtime, file_size, last_scraped_at, indexed_at, created_at, updated_at
    FROM categories
    WHERE id = ?
  `);
  return stmt.get(id) || null;
}

function upsert(db, category) {
  const now = new Date().toISOString();
  const titleSearchStr = Array.isArray(category.titleSearch)
    ? JSON.stringify(category.titleSearch)
    : category.titleSearch || null;

  const stmt = db.prepare(`
    INSERT INTO categories (
      id, name, base_url, title_search, file_path, item_count, file_mtime, file_size, last_scraped_at, indexed_at, created_at, updated_at
    ) VALUES (
      @id, @name, @baseUrl, @titleSearch, @filePath, @itemCount, @fileMtime, @fileSize, @lastScrapedAt, @indexedAt, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = COALESCE(excluded.base_url, categories.base_url),
      title_search = COALESCE(excluded.title_search, categories.title_search),
      file_path = COALESCE(excluded.file_path, categories.file_path),
      item_count = excluded.item_count,
      file_mtime = COALESCE(excluded.file_mtime, categories.file_mtime),
      file_size = COALESCE(excluded.file_size, categories.file_size),
      last_scraped_at = COALESCE(excluded.last_scraped_at, categories.last_scraped_at),
      indexed_at = COALESCE(excluded.indexed_at, categories.indexed_at),
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id: category.id,
    name: category.name,
    baseUrl: category.baseUrl || category.base_url || null,
    titleSearch: titleSearchStr,
    filePath: category.filePath || category.file_path || null,
    itemCount: category.itemCount || category.item_count || 0,
    fileMtime: category.fileMtime || category.file_mtime || null,
    fileSize: category.fileSize || category.file_size || null,
    lastScrapedAt: category.lastScrapedAt || category.last_scraped_at || null,
    indexedAt: category.indexedAt || category.indexed_at || now,
    createdAt: category.createdAt || category.created_at || now,
    updatedAt: now,
  });
}

function updateIndexMetadata(db, id, metadata) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE categories
    SET
      item_count = COALESCE(@itemCount, item_count),
      file_mtime = COALESCE(@fileMtime, file_mtime),
      file_size = COALESCE(@fileSize, file_size),
      last_scraped_at = COALESCE(@lastScrapedAt, last_scraped_at),
      indexed_at = COALESCE(@indexedAt, indexed_at),
      updated_at = @updatedAt
    WHERE id = @id
  `);

  stmt.run({
    id,
    itemCount: metadata.itemCount ?? metadata.item_count ?? null,
    fileMtime: metadata.fileMtime ?? metadata.file_mtime ?? null,
    fileSize: metadata.fileSize ?? metadata.file_size ?? null,
    lastScrapedAt: metadata.lastScrapedAt ?? metadata.last_scraped_at ?? null,
    indexedAt: metadata.indexedAt ?? metadata.indexed_at ?? now,
    updatedAt: now,
  });
}

function remove(db, id) {
  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  const res = stmt.run(id);
  return res.changes > 0;
}

module.exports = {
  getAll,
  getById,
  upsert,
  updateIndexMetadata,
  remove,
};
