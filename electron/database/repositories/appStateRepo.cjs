/**
 * App State and Schema Migrations Repository for SQLite
 */

function getAppState(db, key) {
  if (!key) return null;
  const stmt = db.prepare('SELECT value FROM app_state WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : null;
}

function setAppState(db, key, value) {
  if (!key) return false;
  const now = new Date().toISOString();
  const valStr = typeof value === 'string' ? value : JSON.stringify(value);
  const stmt = db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  stmt.run(key, valStr, now);
  return true;
}

function hasMigration(db, migrationId) {
  if (!migrationId) return false;
  const stmt = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?');
  const row = stmt.get(migrationId);
  return !!row;
}

function recordMigration(db, migrationId, name) {
  if (!migrationId) return false;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO schema_migrations (id, name, applied_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  stmt.run(migrationId, name || migrationId, now);
  return true;
}

function getAllMigrations(db) {
  const stmt = db.prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY applied_at ASC');
  return stmt.all();
}

module.exports = {
  getAppState,
  setAppState,
  hasMigration,
  recordMigration,
  getAllMigrations,
};
