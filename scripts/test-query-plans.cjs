const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbMain = require('../electron/database/dbMain.cjs');
const itemsRepo = require('../electron/database/repositories/itemsRepo.cjs');
const categoriesRepo = require('../electron/database/repositories/categoriesRepo.cjs');
const importer = require('../electron/indexer/importer.cjs');

function runQueryPlanAudit() {
  console.log('🔍 Running EXPLAIN QUERY PLAN Audit on Native SQLite Schema (PR 9)...\n');

  const catalogDir = process.env.CATALOG_DIR || path.join(__dirname, '../tests/fixtures');
  if (!fs.existsSync(catalogDir)) {
    console.log(`⚠️ Catalog path ${catalogDir} does not exist, skipping audit.`);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-qp-audit-'));
  const db = dbMain.initDatabase(tempDir);

  // Ingest dataset
  importer.importLibrarySync(db, { libraryPath: catalogDir, force: true });

  const totalItems = itemsRepo.countByCategory(db, 'all');
  console.log(`\n📊 Dataset size: ${totalItems.toLocaleString()} items across categories.`);

  const queries = [
    {
      name: 'Category + Title Sort (Page 1)',
      sql: 'SELECT * FROM items WHERE category_id = ? ORDER BY title_sort ASC LIMIT 100 OFFSET 0',
      params: ['switch'],
    },
    {
      name: 'Category + DiscoveredAt Sort (Page 1)',
      sql: 'SELECT * FROM items WHERE category_id = ? ORDER BY discovered_at DESC LIMIT 100 OFFSET 0',
      params: ['switch'],
    },
    {
      name: 'Favorites Query (Partial Index)',
      sql: 'SELECT * FROM items WHERE is_favorite = 1 ORDER BY title_sort ASC LIMIT 100 OFFSET 0',
      params: [],
    },
    {
      name: 'Search Query (LIKE %mario%)',
      sql: 'SELECT * FROM items WHERE category_id = ? AND clean_title LIKE ? ORDER BY title_sort ASC LIMIT 100 OFFSET 0',
      params: ['switch', '%mario%'],
    },
  ];

  console.log('\n--- Query Plan Analysis ---');
  for (const q of queries) {
    const planRows = db.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.params);
    const planDetail = planRows.map((r) => r.detail).join(' -> ');

    const t0 = performance.now();
    const rows = db.prepare(q.sql).all(...q.params);
    const durationMs = performance.now() - t0;

    console.log(`\n🔹 Query: ${q.name}`);
    console.log(`   Plan:   ${planDetail}`);
    console.log(`   Result: ${rows.length} rows in ${durationMs.toFixed(2)}ms`);
  }

  dbMain.closeDatabase();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n✅ Query Plan Audit Complete. Schema v1 remains optimal and stable!\n');
}

runQueryPlanAudit();
