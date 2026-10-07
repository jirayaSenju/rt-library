const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { initializeSchema } = require('./schema.cjs');

let dbInstance = null;
let dbPathInstance = null;

/**
 * Initializes native better-sqlite3 database connection singleton.
 * Target DB file: rt-library-v2.sqlite
 */
function initDatabase(userDataPath) {
  if (dbInstance) {
    return dbInstance;
  }

  if (!userDataPath) {
    throw new Error('[DB][NATIVE][ERROR] userDataPath must be provided to initDatabase');
  }

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'rt-library-v2.sqlite');
  dbPathInstance = dbPath;

  try {
    const db = new Database(dbPath);

    // Initial WAL Pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    dbInstance = db;

    // Initialize Schema Idempotently
    initializeSchema(dbInstance);

    console.log(`[DB][NATIVE] initialized`);
    console.log(`[DB][NATIVE] path: ${dbPath}`);
    console.log(`[DB][NATIVE] journal_mode=WAL, foreign_keys=ON`);

    return dbInstance;
  } catch (err) {
    console.error(`[DB][NATIVE][ERROR] Failed to initialize native SQLite at ${dbPath}:`, err.message);
    throw err;
  }
}

/**
 * Returns active database instance or null.
 */
function getDatabase() {
  return dbInstance;
}

function getDatabasePath() {
  return dbPathInstance;
}

/**
 * Closes native database connection cleanly.
 */
function closeDatabase() {
  if (dbInstance) {
    try {
      dbInstance.close();
      console.log(`[DB][NATIVE] connection closed safely`);
    } catch (err) {
      console.error(`[DB][NATIVE][ERROR] Error closing database:`, err.message);
    } finally {
      dbInstance = null;
      dbPathInstance = null;
    }
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  getDatabasePath,
  closeDatabase,
};
