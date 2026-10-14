#!/usr/bin/env node
/**
 * RT-Library V3-67 Concurrency & Scraper Benchmark
 * Benchmarks scraper throughput, latency percentiles, and resource usage across concurrency levels (C=1, C=2, C=3, C=4).
 * Validates data integrity across all concurrency levels.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseTopicHtml } = require('../scraper/parsers/rutrackerHtmlParser.cjs');

const fixturePath = path.join(__dirname, '../tests/fixtures/rutracker-html/topic-detail.html');
const topicHtml = fs.readFileSync(fixturePath, 'utf8');

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runWorkerPool(items, concurrency, workerFn) {
  const executing = new Set();
  const results = [];

  for (const item of items) {
    const promise = Promise.resolve().then(() => workerFn(item)).then(res => {
      executing.delete(promise);
      return res;
    }, err => {
      executing.delete(promise);
      throw err;
    });

    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function benchmarkLevel(concurrency, topicCount = 30, simulatedLatencyMs = 150) {
  const topics = Array.from({ length: topicCount }, (_, i) => ({
    topicId: `topic_${1000 + i}`,
    title: `Benchmark Item ${i}`,
    url: `https://rutracker.org/forum/viewtopic.php?t=${1000 + i}`,
  }));

  const latencies = [];
  const initialMem = process.memoryUsage().heapUsed;
  const start = performance.now();

  const results = await runWorkerPool(topics, concurrency, async (topic) => {
    const t0 = performance.now();

    // 1. Simulated companion fetch latency (network/tab communication)
    if (simulatedLatencyMs > 0) {
      await new Promise(r => setTimeout(r, simulatedLatencyMs));
    }

    // 2. Real parsing step
    const parsed = parseTopicHtml(topicHtml, {
      topicId: topic.topicId,
      categoryId: 'switch',
      categoryName: 'Nintendo Switch',
      url: topic.url,
    });

    // 3. Merging step (exact same logic as scanEngine)
    const merged = {
      ...topic,
      ...parsed,
      title: parsed.canonicalTitle || parsed.topicTitle || topic.title,
      canonicalTitle: parsed.canonicalTitle || topic.title,
      canonicalTitleRaw: parsed.canonicalTitleRaw || topic.title,
      releaseGroup: parsed.releaseGroup || null,
      cover: parsed.cover || null,
      coverUrl: parsed.cover || null,
      screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : [],
      magnet: parsed.magnet || null,
      fileList: parsed.fileList || null,
      developer: parsed.developer || null,
      publisher: parsed.publisher || null,
      genre: parsed.genre || null,
      releaseYear: parsed.releaseYear || null,
      version: parsed.version || null,
      interfaceLanguage: parsed.interfaceLanguage || parsed.language || null,
      voiceLanguage: parsed.voiceLanguage || null,
      imageFormat: parsed.imageFormat || null,
      multiplayer: parsed.multiplayer || null,
      region: parsed.region || null,
      sizeStr: parsed.size || topic.sizeStr || null,
      sizeBytes: parsed.sizeBytes ?? null,
    };

    const elapsed = performance.now() - t0;
    latencies.push(elapsed);

    return merged;
  });

  const totalTimeMs = performance.now() - start;
  const finalMem = process.memoryUsage().heapUsed;

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const throughputTopicsPerMin = (topicCount / (totalTimeMs / 1000)) * 60;

  return {
    concurrency,
    topicCount,
    totalTimeMs,
    avgLatencyMs: avgLatency,
    p50Ms: p50,
    p95Ms: p95,
    throughputTopicsPerMin,
    heapDeltaMb: (finalMem - initialMem) / (1024 * 1024),
    results,
  };
}

async function main() {
  console.log('================================================================================');
  console.log('       RT-LIBRARY V3-67 SCRAPER CONCURRENCY BENCHMARK & VALIDATION');
  console.log('================================================================================');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPUs: ${os.cpus().length}x ${os.cpus()[0]?.model}`);
  console.log(`Node: ${process.version}`);
  console.log(`HTML Fixture Size: ${(Buffer.byteLength(topicHtml) / 1024).toFixed(1)} KB`);
  console.log('--------------------------------------------------------------------------------\n');

  const NUM_TOPICS = 30;
  const LATENCY_MS = 150; // typical companion bridge round-trip
  const concurrencyLevels = [1, 2, 3, 4];
  const summaries = [];

  for (const c of concurrencyLevels) {
    process.stdout.write(`Benchmarking concurrency C=${c} (${NUM_TOPICS} topics, latency=${LATENCY_MS}ms)... `);
    const summary = await benchmarkLevel(c, NUM_TOPICS, LATENCY_MS);
    summaries.push(summary);
    console.log(`Done in ${(summary.totalTimeMs / 1000).toFixed(2)}s (${summary.throughputTopicsPerMin.toFixed(1)} topics/min)`);
  }

  console.log('\n================================================================================');
  console.log('                               BENCHMARK RESULTS');
  console.log('================================================================================');
  console.log('| Concurrency | Total Time (s) | Speedup vs C=1 | Mean Latency (ms) | p50 (ms) | p95 (ms) | Throughput (topics/min) |');
  console.log('|-------------|----------------|----------------|-------------------|----------|----------|-------------------------|');

  const baselineTime = summaries[0].totalTimeMs;

  for (const s of summaries) {
    const speedup = (baselineTime / s.totalTimeMs).toFixed(2);
    console.log(`| C=${s.concurrency.toString().padEnd(9)} | ${(s.totalTimeMs / 1000).toFixed(2).padEnd(14)} | ${(speedup + 'x').padEnd(14)} | ${s.avgLatencyMs.toFixed(1).padEnd(17)} | ${s.p50Ms.toFixed(1).padEnd(8)} | ${s.p95Ms.toFixed(1).padEnd(8)} | ${s.throughputTopicsPerMin.toFixed(1).padEnd(23)} |`);
  }

  // Data Integrity Verification
  console.log('\n================================================================================');
  console.log('                           DATA INTEGRITY VERIFICATION');
  console.log('================================================================================');

  const baselineResults = summaries[0].results;
  let allMatch = true;

  for (let i = 1; i < summaries.length; i++) {
    const current = summaries[i];
    for (let j = 0; j < NUM_TOPICS; j++) {
      const b = baselineResults[j];
      const c = current.results[j];
      if (b.title !== c.title || b.magnet !== c.magnet || b.sizeBytes !== c.sizeBytes) {
        allMatch = false;
        console.error(`Mismatch at C=${current.concurrency}, item ${j}:`, { b, c });
      }
    }
  }

  if (allMatch) {
    console.log('✓ PASS: All extracted metadata records are 100% IDENTICAL across all concurrency levels.');
    console.log(`  Sample Title: "${baselineResults[0].title}"`);
    console.log(`  Sample Magnet xt: "${baselineResults[0].magnet.slice(0, 45)}..."`);
    console.log(`  Sample Size: ${baselineResults[0].sizeBytes} bytes`);
  } else {
    console.error('❌ FAIL: Data mismatch detected between concurrency levels!');
    process.exit(1);
  }

  console.log('\n================================================================================');
  console.log('                        FULL RUN PROJECTIONS (CATALOG)');
  console.log('================================================================================');

  const switchTopics = 4000;
  const fullCatalogTopics = 7333;

  for (const s of summaries) {
    const switchMin = (switchTopics / s.throughputTopicsPerMin).toFixed(1);
    const catalogMin = (fullCatalogTopics / s.throughputTopicsPerMin).toFixed(1);
    console.log(`C=${s.concurrency}: Switch (${switchTopics} topics) = ~${switchMin} min | Full Catalog (${fullCatalogTopics} topics) = ~${catalogMin} min`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
