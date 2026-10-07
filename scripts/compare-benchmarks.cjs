#!/usr/bin/env node

/**
 * RT-Library Cross-Platform Benchmark Comparison Utility
 * Compares two benchmark JSON result files (e.g. Linux vs Windows or Baseline vs Current).
 * 
 * Usage:
 *   node scripts/compare-benchmarks.cjs <baseline.json> <target.json>
 */

const fs = require('fs');
const path = require('path');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Benchmark file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatDelta(base, target, unit = '') {
  if (typeof base !== 'number' || typeof target !== 'number') return 'N/A';
  const diff = target - base;
  const pct = base !== 0 ? ((diff / base) * 100).toFixed(1) : '0.0';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}${unit} (${sign}${pct}%)`;
}

function compareBenchmarks(fileA, fileB) {
  const dataA = loadJson(fileA);
  const dataB = loadJson(fileB);

  console.log('================================================================================');
  console.log('            RT-LIBRARY CROSS-PLATFORM BENCHMARK COMPARISON');
  console.log('================================================================================\n');

  console.log(`Baseline (A): ${path.basename(fileA)} [${dataA.system?.os || 'Unknown OS'}]`);
  console.log(`Target   (B): ${path.basename(fileB)} [${dataB.system?.os || 'Unknown OS'}]\n`);

  console.log(
    'Metric / Scenario'.padEnd(38) +
    'Baseline (A)'.padEnd(16) +
    'Target (B)'.padEnd(16) +
    'Difference'.padEnd(24)
  );
  console.log('-'.repeat(94));

  const comparisons = [
    {
      name: 'Cold Startup (DB Init)',
      valA: dataA.scenarios?.startup?.coldStartupMs,
      valB: dataB.scenarios?.startup?.coldStartupMs,
      unit: 'ms',
    },
    {
      name: 'Warm First Query Latency',
      valA: dataA.scenarios?.startup?.warmStartupQueryMs,
      valB: dataB.scenarios?.startup?.warmStartupQueryMs,
      unit: 'ms',
    },
    {
      name: 'Idle Average CPU',
      valA: dataA.scenarios?.idle?.averageCpuPercent,
      valB: dataB.scenarios?.idle?.averageCpuPercent,
      unit: '%',
    },
    {
      name: 'Idle Resident Memory (RSS)',
      valA: dataA.scenarios?.idle?.finalRssMb,
      valB: dataB.scenarios?.idle?.finalRssMb,
      unit: 'MB',
    },
    {
      name: 'Grid Comfortable (10 pgs)',
      valA: dataA.scenarios?.views?.grid_comfortable?.totalDurationMs,
      valB: dataB.scenarios?.views?.grid_comfortable?.totalDurationMs,
      unit: 'ms',
    },
    {
      name: 'List Compact (10 pgs)',
      valA: dataA.scenarios?.views?.list_compact?.totalDurationMs,
      valB: dataB.scenarios?.views?.list_compact?.totalDurationMs,
      unit: 'ms',
    },
    {
      name: 'Pagination p95 (Page 48)',
      valA: dataA.scenarios?.pagination?.pageSize_48?.p95Ms,
      valB: dataB.scenarios?.pagination?.pageSize_48?.p95Ms,
      unit: 'ms',
    },
    {
      name: 'Item Detail (50 Reopens Delta)',
      valA: dataA.scenarios?.itemDetail?.netGrowthMb,
      valB: dataB.scenarios?.itemDetail?.netGrowthMb,
      unit: 'MB',
    },
    {
      name: 'Heavy Multi-Facet Filter Query',
      valA: dataA.scenarios?.searchAndFilters?.heavyMultiFacetQueryMs,
      valB: dataB.scenarios?.searchAndFilters?.heavyMultiFacetQueryMs,
      unit: 'ms',
    },
    {
      name: '30 Category Rapid Switches',
      valA: dataA.scenarios?.categorySwitching?.totalDurationMs,
      valB: dataB.scenarios?.categorySwitching?.totalDurationMs,
      unit: 'ms',
    },
    {
      name: 'Database Backup Duration',
      valA: dataA.scenarios?.databaseMaintenance?.backupDurationMs,
      valB: dataB.scenarios?.databaseMaintenance?.backupDurationMs,
      unit: 'ms',
    },
    {
      name: 'Integrity Check Duration',
      valA: dataA.scenarios?.databaseMaintenance?.integrityCheckMs,
      valB: dataB.scenarios?.databaseMaintenance?.integrityCheckMs,
      unit: 'ms',
    },
    {
      name: 'Total Estimated App Footprint',
      valA: dataA.processFootprint?.totalEstimatedFootprintMb,
      valB: dataB.processFootprint?.totalEstimatedFootprintMb,
      unit: 'MB',
    },
  ];

  for (const c of comparisons) {
    const strA = typeof c.valA === 'number' ? `${c.valA.toFixed(2)} ${c.unit}` : 'N/A';
    const strB = typeof c.valB === 'number' ? `${c.valB.toFixed(2)} ${c.unit}` : 'N/A';
    const delta = formatDelta(c.valA, c.valB, ` ${c.unit}`);

    console.log(
      c.name.padEnd(38) +
      strA.padEnd(16) +
      strB.padEnd(16) +
      delta.padEnd(24)
    );
  }

  console.log('\n================================================================================');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node scripts/compare-benchmarks.cjs <fileA.json> <fileB.json>');
    process.exit(0);
  }

  try {
    compareBenchmarks(args[0], args[1]);
  } catch (err) {
    console.error('❌ Comparison failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  compareBenchmarks,
};

