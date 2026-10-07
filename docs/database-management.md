# Database Management & Schema

RT-Library uses an embedded SQLite database managed via `better-sqlite3` in the Electron Main process.

---

## 1. Schema Structure

The database schema (`electron/database/schema.cjs`) is divided into normalized tables:

### `items`
Main catalog index containing core search columns:
- `id` (TEXT PRIMARY KEY) - Unique slug identifier.
- `topic_id` (INTEGER UNIQUE) - Upstream source topic identifier.
- `category_id` (TEXT) - Category identifier.
- `canonical_title`, `title`, `clean_title`, `topic_title` (TEXT) - Title representations.
- `developer`, `publisher`, `genre`, `release_year`, `language`, `region` (TEXT) - Metadata facets.
- `size_bytes` (INTEGER), `size_str` (TEXT) - File size.
- `has_magnet`, `has_screenshots`, `has_cover`, `is_favorite` (INTEGER) - Status flags.
- `discovered_at`, `scraped_at`, `updated_at` (TEXT) - Timestamps.

### `item_details`
Extended topic details and payloads:
- `item_id` (TEXT PRIMARY KEY REFERENCES items(id))
- `description_html` (TEXT) - Formatted topic description.
- `magnet` (TEXT) - Raw magnet URI.
- `file_tree_json` (TEXT) - JSON structure of torrent files.
- `screenshots_json` (TEXT) - Array of normalized preview image URLs.

### `torrent_metadata`
Swarm health and peer statistics:
- `item_id` (TEXT PRIMARY KEY REFERENCES items(id))
- `seeds`, `leechers`, `peers` (INTEGER) - Live swarm counts.
- `swarm_status`, `swarm_source`, `swarm_fetched_at` - Health status and source tracking.

---

## 2. WAL Mode & Query Optimization

- **Write-Ahead Logging**: SQLite operates with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;` to allow non-blocking concurrent reads during scraper indexing.
- **Indexes**: Includes composite B-Tree indexes for fast filtered pagination (`idx_items_cat_fav_sort`, `idx_items_search_composite`, `idx_items_year_size`).

---

## 3. Maintenance Operations

The **Settings -> Database** section allows users to perform administrative maintenance:

- **Rebuild Indexes**: Recreates SQLite search indexes to ensure query performance on large collections.
- **Vacuum / Defragment**: Runs `VACUUM` to reclaim disk space after large category deletions or migrations.
- **Integrity Check**: Executes `PRAGMA integrity_check` and reports table health, orphan records, or corruption.
- **Clean Orphan Records**: Scans for and removes detached `item_details` or `torrent_metadata` rows without corresponding parent `items`.

---

## 4. Automated Backup Scheduler

The backup scheduler (`electron/database/backupScheduler.cjs`) can be configured for daily, weekly, or manual backups:
- Backups use the SQLite Online Backup API (`db.backup(...)`) ensuring consistent point-in-time snapshots without downtime.
- Preserves a user-configurable number of historical snapshots in the backups directory.

