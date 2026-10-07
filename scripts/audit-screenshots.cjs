/**
 * Global Screenshot Audit Script
 * Audits all 16 ecohub JSON catalog files to report raw vs. normalized screenshot statistics.
 */
const fs = require('fs');
const path = require('path');
const {
  isViewerPage,
  isDirectImageUrl,
  normalizeScreenshots,
} = require('../electron/indexer/normalize.cjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../tests/fixtures');

console.log('=== GLOBAL SCREENSHOT NORMALIZATION AUDIT ===\n');

if (!fs.existsSync(DATA_DIR)) {
  console.log(`Data directory not found: ${DATA_DIR}, skipping audit.`);
  process.exit(0);
}

const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();

let globalTotalItems = 0;
let globalRawScreenshots = 0;
let globalNormalizedScreenshots = 0;
let globalRawViewerPages = 0;
let globalRawDirectImages = 0;

console.log(
  'Catalog'.padEnd(16) +
  'Items'.padStart(8) +
  'Raw SC'.padStart(10) +
  'Norm SC'.padStart(10) +
  'Viewer'.padStart(10) +
  'Direct'.padStart(10) +
  'Reduction'.padStart(12)
);
console.log('-'.repeat(76));

for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = Array.isArray(content) ? content : (content.items || []);

  let catRawCount = 0;
  let catNormCount = 0;
  let catViewerCount = 0;
  let catDirectCount = 0;

  for (const item of items) {
    const rawSc = item.content?.screenshots || item.screenshots || [];
    if (!Array.isArray(rawSc) || rawSc.length === 0) continue;

    catRawCount += rawSc.length;
    for (const url of rawSc) {
      if (typeof url === 'string') {
        if (isViewerPage(url)) catViewerCount++;
        else catDirectCount++;
      }
    }

    const normSc = normalizeScreenshots(rawSc);
    catNormCount += normSc.length;
  }

  const reduction = catRawCount > 0 ? (((catRawCount - catNormCount) / catRawCount) * 100).toFixed(1) : '0.0';

  globalTotalItems += items.length;
  globalRawScreenshots += catRawCount;
  globalNormalizedScreenshots += catNormCount;
  globalRawViewerPages += catViewerCount;
  globalRawDirectImages += catDirectCount;

  console.log(
    file.padEnd(16) +
    items.length.toString().padStart(8) +
    catRawCount.toString().padStart(10) +
    catNormCount.toString().padStart(10) +
    catViewerCount.toString().padStart(10) +
    catDirectCount.toString().padStart(10) +
    `${reduction}%`.padStart(12)
  );
}

const globalReduction = globalRawScreenshots > 0
  ? (((globalRawScreenshots - globalNormalizedScreenshots) / globalRawScreenshots) * 100).toFixed(1)
  : '0.0';

console.log('-'.repeat(76));
console.log(
  'GLOBAL TOTAL'.padEnd(16) +
  globalTotalItems.toString().padStart(8) +
  globalRawScreenshots.toString().padStart(10) +
  globalNormalizedScreenshots.toString().padStart(10) +
  globalRawViewerPages.toString().padStart(10) +
  globalRawDirectImages.toString().padStart(10) +
  `${globalReduction}%`.padStart(12)
);
console.log('\n=== AUDIT COMPLETE ===');
