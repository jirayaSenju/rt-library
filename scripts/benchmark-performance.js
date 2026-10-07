#!/usr/bin/env node
/**
 * RT-Library Performance Benchmark Baseline Runner (PR 1)
 * Measures static dataset sizes and pure V8 JSON parsing benchmarks.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveHome(p) {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

const possibleDataDirs = [
  path.join(__dirname, '../data'),
  resolveHome('~/Documents/projects/ecohub-app/data'),
  resolveHome('~/Documents/projects/rt-library/data'),
];

let dataDir = null;
for (const dir of possibleDataDirs) {
  if (fs.existsSync(dir)) {
    dataDir = dir;
    break;
  }
}

console.log("================================================================================");
console.log("           RT-LIBRARY PERFORMANCE BENCHMARK BASELINE (PR 1)");
console.log("================================================================================");

console.log(`\n1. Environment Information:`);
console.log(`   - OS: ${os.type()} ${os.release()} (${os.arch()})`);
console.log(`   - CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model || 'Unknown'}`);
console.log(`   - System RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`   - Node.js Version: ${process.version}`);
console.log(`   - V8 Version: ${process.versions.v8}`);

if (!dataDir) {
  console.log(`\n⚠️ Catalog Data Directory not found in expected paths.`);
  console.log(`   Searched: ${possibleDataDirs.join(', ')}`);
  console.log(`   Please pass data directory as argument: node scripts/benchmark-performance.js /path/to/data`);
  process.exit(0);
}

console.log(`\n2. Catalog Data Directory Found:`);
console.log(`   - Path: ${dataDir}`);

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
let totalBytes = 0;
let totalItemsEst = 0;

const statsTable = [];

for (const file of files) {
  const filePath = path.join(dataDir, file);
  const stat = fs.statSync(filePath);
  totalBytes += stat.size;

  const tReadStart = performance.now();
  const rawContent = fs.readFileSync(filePath, 'utf-8');
  const readMs = performance.now() - tReadStart;

  const tParseStart = performance.now();
  let itemCount = 0;
  try {
    const json = JSON.parse(rawContent);
    const items = json.items || json;
    itemCount = Array.isArray(items) ? items.length : 0;
  } catch (err) {
    itemCount = 0;
  }
  const parseMs = performance.now() - tParseStart;

  totalItemsEst += itemCount;
  statsTable.push({
    file,
    sizeBytes: stat.size,
    sizeMB: (stat.size / 1024 / 1024).toFixed(2) + ' MB',
    itemCount,
    readMs: readMs.toFixed(1) + ' ms',
    parseMs: parseMs.toFixed(1) + ' ms',
  });
}

// Sort by size descending
statsTable.sort((a, b) => b.sizeBytes - a.sizeBytes);

console.log(`\n3. Catalog JSON Files Analysis (${files.length} files, Total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB):`);
console.table(statsTable.map(({ file, sizeMB, itemCount, readMs, parseMs }) => ({
  File: file,
  Size: sizeMB,
  Items: itemCount,
  'Read Time': readMs,
  'Parse Time': parseMs,
})));

console.log(`\n4. Baseline Summary Metrics (Static Data):`);
console.log(`   - Total Files: ${files.length}`);
console.log(`   - Total Dataset Size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`   - Total Extracted Items: ${totalItemsEst.toLocaleString()}`);

console.log(`\n5. Instructions for Interactive UI & Runtime Benchmarks:`);
console.log(`   Run the app with telemetry enabled:`);
console.log(`   $ RT_LIBRARY_PERF=1 npm run desktop:dev`);
console.log(``);
console.log(`   Key telemetry logs will print to terminal & console:`);
console.log(`   - [PERF][MAIN] App ready & window created in XXXms`);
console.log(`   - [PERF][MAIN] load-sqlite-db / save-sqlite-db durations & Memory RSS`);
console.log(`   - [PERF][INDEXER] File parse, normalize, database, and persist breakdowns`);
console.log(`   - [PERF][SQLITE] Query execution times`);
console.log(`   - [PERF][UI] Category switch cache HIT/MISS timing`);
console.log(`   - [PERF][DOM] Node count snapshots at 100, 500, 1000 items`);
console.log(`   - [PERF][MEMORY] V8 Heap snapshots`);
console.log(`   - [PERF][UI] Scroll FPS sampling window`);
console.log("================================================================================");
