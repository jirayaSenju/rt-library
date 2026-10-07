/**
 * Favorites Repository for Native SQLite
 * Operates directly on the `items.is_favorite` field.
 */

function setFavorite(db, itemId, isFavorite) {
  if (!itemId) return false;
  const now = new Date().toISOString();
  const flag = isFavorite ? 1 : 0;
  const stmt = db.prepare(`
    UPDATE items
    SET is_favorite = ?, updated_at = ?
    WHERE id = ?
  `);
  const res = stmt.run(flag, now, itemId);
  return res.changes > 0;
}

function toggle(db, itemId) {
  if (!itemId) return false;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE items
    SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END,
        updated_at = ?
    WHERE id = ?
  `);
  const res = stmt.run(now, itemId);
  if (res.changes === 0) return false;

  const checkStmt = db.prepare('SELECT is_favorite FROM items WHERE id = ?');
  const row = checkStmt.get(itemId);
  return row ? Boolean(row.is_favorite) : false;
}

function isFavorite(db, itemId) {
  if (!itemId) return false;
  const stmt = db.prepare('SELECT is_favorite FROM items WHERE id = ?');
  const row = stmt.get(itemId);
  return row ? Boolean(row.is_favorite) : false;
}

function setFavoritesBatch(db, itemIds, isFavorite) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return { success: true, updatedCount: 0 };
  const now = new Date().toISOString();
  const flag = isFavorite ? 1 : 0;
  const stmt = db.prepare(`
    UPDATE items
    SET is_favorite = ?, updated_at = ?
    WHERE id = ?
  `);

  const runTx = db.transaction((ids) => {
    let count = 0;
    for (const id of ids) {
      if (typeof id !== 'string' || !id) continue;
      const res = stmt.run(flag, now, id);
      if (res.changes > 0) count++;
    }
    return count;
  });

  const updatedCount = runTx(itemIds);
  return { success: true, updatedCount };
}

function count(db) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM items WHERE is_favorite = 1');
  const row = stmt.get();
  return row ? row.count : 0;
}

module.exports = {
  setFavorite,
  setFavoritesBatch,
  toggle,
  isFavorite,
  count,
};

