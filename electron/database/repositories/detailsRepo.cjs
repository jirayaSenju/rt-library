/**
 * Item Details Repository for Native SQLite
 */

function safeJsonParse(jsonStr, fallback = null) {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn(`[DETAILS][WARN] Safe JSON parse fallback triggered:`, err.message);
    return fallback;
  }
}

function getByItemId(db, itemId) {
  if (!itemId) return null;
  const stmt = db.prepare(`
    SELECT item_id, magnet, file_list_json, screenshots_json, source_json, scraping_json
    FROM item_details
    WHERE item_id = ?
  `);
  const row = stmt.get(itemId);
  if (!row) return null;

  return {
    itemId: row.item_id,
    magnet: row.magnet || null,
    fileList: safeJsonParse(row.file_list_json, []),
    screenshots: safeJsonParse(row.screenshots_json, []),
    source: safeJsonParse(row.source_json, null),
    scraping: safeJsonParse(row.scraping_json, null),
  };
}

function upsert(db, itemId, details) {
  if (!itemId || !details) return;

  const fileListJson = Array.isArray(details.fileList)
    ? JSON.stringify(details.fileList)
    : typeof details.fileList === 'string'
    ? details.fileList
    : null;

  const screenshotsJson = Array.isArray(details.screenshots)
    ? JSON.stringify(details.screenshots)
    : typeof details.screenshots === 'string'
    ? details.screenshots
    : null;

  const sourceJson = typeof details.source === 'object' && details.source !== null
    ? JSON.stringify(details.source)
    : typeof details.source === 'string'
    ? details.source
    : null;

  const scrapingJson = typeof details.scraping === 'object' && details.scraping !== null
    ? JSON.stringify(details.scraping)
    : typeof details.scraping === 'string'
    ? details.scraping
    : null;

  const stmt = db.prepare(`
    INSERT INTO item_details (
      item_id, magnet, file_list_json, screenshots_json, source_json, scraping_json
    ) VALUES (
      @itemId, @magnet, @fileListJson, @screenshotsJson, @sourceJson, @scrapingJson
    )
    ON CONFLICT(item_id) DO UPDATE SET
      magnet = COALESCE(excluded.magnet, item_details.magnet),
      file_list_json = COALESCE(excluded.file_list_json, item_details.file_list_json),
      screenshots_json = COALESCE(excluded.screenshots_json, item_details.screenshots_json),
      source_json = COALESCE(excluded.source_json, item_details.source_json),
      scraping_json = COALESCE(excluded.scraping_json, item_details.scraping_json)
  `);

  stmt.run({
    itemId,
    magnet: details.magnet || details.magnetLink || null,
    fileListJson,
    screenshotsJson,
    sourceJson,
    scrapingJson,
  });
}

function remove(db, itemId) {
  const stmt = db.prepare('DELETE FROM item_details WHERE item_id = ?');
  const res = stmt.run(itemId);
  return res.changes > 0;
}

module.exports = {
  getByItemId,
  upsert,
  remove,
};
