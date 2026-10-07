const SCHEMA_VERSION = 5;
const { normalizeCanonicalGameTitle, normalizeTitleForDedupe, extractBTIH } = require('../scraper/titleExtractor.cjs');
const { normalizeItemMetadata } = require('../scraper/metadataNormalizer.cjs');

/**
 * Initializes database tables, indexes, and versioning idempotently.
 * @param {import('better-sqlite3').Database} db
 */
function initializeSchema(db) {
  if (!db) {
    throw new Error('[SCHEMA][ERROR] Database connection is required to initialize schema');
  }

  // Ensure PRAGMAs are active
  db.pragma('foreign_keys = ON');

  const currentVersion = db.pragma('user_version', { simple: true });

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT,
      title_search TEXT,
      file_path TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      file_mtime REAL,
      file_size INTEGER,
      last_scraped_at TEXT,
      indexed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'rutracker',
      topic_id TEXT,
      title TEXT NOT NULL,
      topic_title TEXT,
      canonical_title TEXT,
      normalized_title TEXT,
      clean_title TEXT,
      title_sort TEXT NOT NULL,
      info_hash TEXT,
      url TEXT,
      genre TEXT,
      developer TEXT,
      publisher TEXT,
      release_year INTEGER,
      version TEXT,
      language TEXT,
      interface_language TEXT,
      voice_language TEXT,
      image_format TEXT,
      multiplayer TEXT,
      region TEXT,
      cover_url TEXT,
      size_str TEXT,
      size_bytes INTEGER,
      has_cover INTEGER NOT NULL DEFAULT 0,
      has_screenshots INTEGER NOT NULL DEFAULT 0,
      has_magnet INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      discovered_at TEXT,
      scraped_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
      CONSTRAINT uq_source_topic UNIQUE(source, topic_id)
    );

    CREATE TABLE IF NOT EXISTS item_details (
      item_id TEXT PRIMARY KEY,
      magnet TEXT,
      file_list_json TEXT,
      screenshots_json TEXT,
      source_json TEXT,
      scraping_json TEXT,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS torrent_metadata (
      item_id TEXT PRIMARY KEY,
      info_hash TEXT,
      torrent_name TEXT,
      total_size_bytes INTEGER,
      file_count INTEGER,
      files_json TEXT,
      trackers_json TEXT,
      seeds INTEGER,
      leechers INTEGER,
      peers INTEGER,
      metadata_status TEXT NOT NULL DEFAULT 'pending',
      swarm_status TEXT NOT NULL DEFAULT 'pending',
      metadata_fetched_at TEXT,
      swarm_fetched_at TEXT,
      last_attempt_at TEXT,
      next_retry_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      metadata_source TEXT,
      swarm_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );
  `);

  // Ensure newly added columns exist if table was created with older schema
  ensureColumnsExist(db);

  // Create indexes safely after ensuring all columns exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_category_title ON items(category_id, title_sort);
    CREATE INDEX IF NOT EXISTS idx_items_category_discovered ON items(category_id, discovered_at);
    CREATE INDEX IF NOT EXISTS idx_items_discovered_at ON items(discovered_at);
    CREATE INDEX IF NOT EXISTS idx_items_topic ON items(source, topic_id);
    CREATE INDEX IF NOT EXISTS idx_items_favorite ON items(is_favorite) WHERE is_favorite = 1;
    CREATE INDEX IF NOT EXISTS idx_items_canonical_title ON items(canonical_title);
    CREATE INDEX IF NOT EXISTS idx_items_normalized_title ON items(normalized_title);
    CREATE INDEX IF NOT EXISTS idx_items_info_hash ON items(info_hash);
    CREATE INDEX IF NOT EXISTS idx_items_release_year ON items(release_year);
    CREATE INDEX IF NOT EXISTS idx_items_image_format ON items(image_format);

    CREATE INDEX IF NOT EXISTS idx_torrent_metadata_info_hash ON torrent_metadata(info_hash);
    CREATE INDEX IF NOT EXISTS idx_torrent_metadata_status ON torrent_metadata(metadata_status);
    CREATE INDEX IF NOT EXISTS idx_torrent_swarm_fetched_at ON torrent_metadata(swarm_fetched_at);
    CREATE INDEX IF NOT EXISTS idx_torrent_metadata_seeds ON torrent_metadata(seeds);
    CREATE INDEX IF NOT EXISTS idx_torrent_metadata_leechers ON torrent_metadata(leechers);
  `);

  // Run canonical_titles_v1 migration for existing rows
  runCanonicalTitlesMigration(db);

  // Run metadata_normalization_v1 migration for existing rows
  runMetadataNormalizationMigration(db);

  if (currentVersion < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    console.log(`[SCHEMA] Database schema updated from v${currentVersion} to v${SCHEMA_VERSION}`);
  }

  return {
    version: SCHEMA_VERSION,
    initialized: true,
  };
}

function ensureColumnsExist(db) {
  try {
    const tableInfo = db.prepare('PRAGMA table_info(items)').all();
    const existingCols = new Set(tableInfo.map((c) => c.name));

    if (!existingCols.has('topic_title')) {
      db.exec('ALTER TABLE items ADD COLUMN topic_title TEXT');
    }
    if (!existingCols.has('canonical_title')) {
      db.exec('ALTER TABLE items ADD COLUMN canonical_title TEXT');
    }
    if (!existingCols.has('normalized_title')) {
      db.exec('ALTER TABLE items ADD COLUMN normalized_title TEXT');
    }
    if (!existingCols.has('clean_title')) {
      db.exec('ALTER TABLE items ADD COLUMN clean_title TEXT');
    }
    if (!existingCols.has('info_hash')) {
      db.exec('ALTER TABLE items ADD COLUMN info_hash TEXT');
    }
    if (!existingCols.has('version')) {
      db.exec('ALTER TABLE items ADD COLUMN version TEXT');
    }
    if (!existingCols.has('region')) {
      db.exec('ALTER TABLE items ADD COLUMN region TEXT');
    }
  } catch (err) {
    console.warn('[SCHEMA] ensureColumnsExist warning:', err.message);
  }
}

function runCanonicalTitlesMigration(db) {
  try {
    // 1. Backfill titles for items missing canonical_title, topic_title or normalized_title
    const titleRows = db.prepare(`
      SELECT id, title, clean_title, topic_title, canonical_title, normalized_title
      FROM items
      WHERE canonical_title IS NULL OR canonical_title = ''
         OR normalized_title IS NULL OR normalized_title = ''
         OR topic_title IS NULL OR topic_title = ''
    `).all();

    if (titleRows.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE items
        SET
          topic_title = @topicTitle,
          canonical_title = @canonicalTitle,
          normalized_title = @normalizedTitle,
          clean_title = @cleanTitle,
          title_sort = @titleSort
        WHERE id = @id
      `);

      const BATCH_SIZE = 1000;
      for (let i = 0; i < titleRows.length; i += BATCH_SIZE) {
        const chunk = titleRows.slice(i, i + BATCH_SIZE);
        const updateMany = db.transaction((items) => {
          for (const row of items) {
            const rawTitle = row.title || 'Untitled';
            const topicTitle = row.topic_title || rawTitle;
            const norm = normalizeCanonicalGameTitle(row.clean_title || rawTitle, topicTitle);
            const canonicalTitle = row.canonical_title || norm.canonicalTitle;
            const normalizedTitle = row.normalized_title || normalizeTitleForDedupe(canonicalTitle);
            const cleanTitle = canonicalTitle;
            const titleSort = normalizedTitle || canonicalTitle.toLowerCase();

            updateStmt.run({
              id: row.id,
              topicTitle,
              canonicalTitle,
              normalizedTitle,
              cleanTitle,
              titleSort,
            });
          }
        });
        updateMany(chunk);
      }
      console.log(`[MIGRATION][canonical_titles_v1] Backfilled ${titleRows.length} existing items with canonical/normalized titles.`);
    }

    // 2. Backfill info_hash from item_details.magnet if info_hash is missing
    const hashRows = db.prepare(`
      SELECT items.id, item_details.magnet
      FROM items
      INNER JOIN item_details ON items.id = item_details.item_id
      WHERE (items.info_hash IS NULL OR items.info_hash = '')
        AND item_details.magnet IS NOT NULL
        AND item_details.magnet != ''
    `).all();

    if (hashRows.length > 0) {
      const updateHashStmt = db.prepare(`
        UPDATE items
        SET info_hash = @infoHash
        WHERE id = @id
      `);

      const BATCH_SIZE = 1000;
      let backfilledHashCount = 0;
      for (let i = 0; i < hashRows.length; i += BATCH_SIZE) {
        const chunk = hashRows.slice(i, i + BATCH_SIZE);
        const updateHashes = db.transaction((items) => {
          for (const row of items) {
            const hash = extractBTIH(row.magnet);
            if (hash) {
              updateHashStmt.run({ id: row.id, infoHash: hash });
              backfilledHashCount++;
            }
          }
        });
        updateHashes(chunk);
      }
      if (backfilledHashCount > 0) {
        console.log(`[MIGRATION][canonical_titles_v1] Backfilled ${backfilledHashCount} items with info_hash from magnet.`);
      }
    }

    db.prepare("INSERT OR REPLACE INTO schema_migrations (id, name, applied_at) VALUES ('canonical_titles_v1', 'Canonical and normalized title columns', ?)").run(new Date().toISOString());
  } catch (err) {
    console.warn('[MIGRATION][canonical_titles_v1] Warning:', err.message);
  }
}

function runMetadataNormalizationMigration(db) {
  try {
    const isApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE id = 'metadata_normalization_v1'").get();
    if (isApplied) return;

    const rows = db.prepare(`
      SELECT id, title, topic_title, canonical_title, genre, developer, publisher, release_year,
             language, interface_language, voice_language, image_format, multiplayer, version, region
      FROM items
    `).all();

    if (rows.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE items
        SET
          genre = @genre,
          developer = @developer,
          publisher = @publisher,
          release_year = @releaseYear,
          version = @version,
          interface_language = @interfaceLanguage,
          voice_language = @voiceLanguage,
          language = @language,
          image_format = @imageFormat,
          multiplayer = @multiplayer,
          region = @region
        WHERE id = @id
      `);

      const BATCH_SIZE = 500;
      let updatedCount = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const updateMany = db.transaction((items) => {
          for (const row of items) {
            const norm = normalizeItemMetadata({
              title: row.title,
              topicTitle: row.topic_title,
              canonicalTitle: row.canonical_title,
              genre: row.genre,
              developer: row.developer,
              publisher: row.publisher,
              releaseYear: row.release_year,
              version: row.version,
              interfaceLanguage: row.interface_language || row.language,
              voiceLanguage: row.voice_language,
              language: row.language,
              imageFormat: row.image_format,
              multiplayer: row.multiplayer,
              region: row.region,
            });

            updateStmt.run({
              id: row.id,
              genre: norm.genre || row.genre || null,
              developer: norm.developer || row.developer || null,
              publisher: norm.publisher || row.publisher || null,
              releaseYear: norm.releaseYear !== null ? norm.releaseYear : (row.release_year || null),
              version: norm.version || row.version || null,
              interfaceLanguage: norm.interfaceLanguage || row.interface_language || null,
              voiceLanguage: norm.voiceLanguage || row.voice_language || null,
              language: norm.language || row.language || null,
              imageFormat: norm.imageFormat || row.image_format || null,
              multiplayer: norm.multiplayer || row.multiplayer || null,
              region: norm.region || row.region || null,
            });
            updatedCount++;
          }
        });
        updateMany(chunk);
      }
      console.log(`[MIGRATION][metadata_normalization_v1] Enriched and normalized ${updatedCount} items.`);
    }

    db.prepare("INSERT OR REPLACE INTO schema_migrations (id, name, applied_at) VALUES ('metadata_normalization_v1', 'Catalog metadata enrichment and normalization', ?)").run(new Date().toISOString());
  } catch (err) {
    console.warn('[MIGRATION][metadata_normalization_v1] Warning:', err.message);
  }
}

module.exports = {
  SCHEMA_VERSION,
  initializeSchema,
  runMetadataNormalizationMigration,
};
