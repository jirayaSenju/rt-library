// Compare catalog screenshots with indexer normalization and an optional read-only DB.
const fs = require('node:fs');
const path = require('node:path');
const { extractItemsList, normalizeScreenshots } = require('../electron/indexer/normalize.cjs');
const { uniqueScreenshotUrls } = require('./load-typescript.cjs')('src/services/screenshotResolver.ts');

const catalogPath = path.resolve(process.argv[2] || path.join(__dirname, '../../ecohub-app/data'));
const databasePath = process.argv[3];
const db = databasePath ? new (require('better-sqlite3'))(databasePath, { readonly: true, fileMustExist: true }) : null;
const query = db?.prepare('SELECT screenshots_json FROM item_details WHERE item_id = ?');
const report = { items: 0, raw: 0, normalized: 0, rendererUnique: 0, stored: 0, resolverMismatches: [], storageMismatches: [] };
try {
  for (const filename of fs.readdirSync(catalogPath).filter(name => name.endsWith('.json')).sort()) {
    const json = JSON.parse(fs.readFileSync(path.join(catalogPath, filename), 'utf8'));
    for (const item of extractItemsList(json)) {
      const raw = item.content?.screenshots ?? item.screenshots ?? [];
      const normalized = normalizeScreenshots(raw);
      const renderer = uniqueScreenshotUrls(raw);
      const id = item.id || (item.topicId ? `topic_${item.topicId}` : null);
      const row = id && query?.get(id);
      const stored = row ? JSON.parse(row.screenshots_json || '[]') : null;
      report.items++; report.raw += Array.isArray(raw) ? raw.length : 0;
      report.normalized += normalized.length; report.rendererUnique += renderer.length;
      report.stored += stored?.length || 0;
      if (normalized.length !== renderer.length) report.resolverMismatches.push({ catalog: filename, itemId: id, normalized: normalized.length, renderer: renderer.length });
      if (db && (!stored || JSON.stringify(stored) !== JSON.stringify(normalized))) {
        report.storageMismatches.push({ catalog: filename, itemId: id, normalized: normalized.length, sqlite: stored?.length ?? null });
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.resolverMismatches.length) process.exitCode = 1;
} finally { db?.close(); }
