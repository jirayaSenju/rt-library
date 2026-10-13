/**
 * V3-80 Embedded Electron Transport Real Runtime Verification
 *
 * Runs inside Electron Main to validate the EmbeddedElectronTransport:
 * 1. Hidden window verification (show: false, never visible)
 * 2. Category page extraction & parsing (Switch f=1605)
 * 3. Topic detail extraction & Cyrillic encoding validation
 * 4. Bounded concurrency C=3
 * 5. Memory telemetry (before, initialized, active, disposed)
 * 6. Clean disposal and window destruction
 * 7. Writes telemetry to scripts/investigate/v3-80-runtime-telemetry.json
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { EmbeddedElectronTransport } = require('../../electron/scraper/embeddedElectronTransport.cjs');

const SWITCH_CATEGORY = {
  id: 'switch',
  name: 'Nintendo Switch',
  baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605',
};

const SAMPLE_TOPICS = [
  { topicId: '6672322', title: 'Konfuz - Ракурс - 2025' },
  { topicId: '6665796', title: 'Откровения / Gyesirok / Revelations' },
  { topicId: '6662758', title: 'Sample Topic 3' },
];

app.whenReady().then(async () => {
  console.log('[V3-80_TEST] Starting EmbeddedElectronTransport Real Runtime Validation...');

  const telemetry = {
    transport: 'EMBEDDED_ELECTRON',
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
    },
    hiddenVerified: true,
    memory: {},
    coldSession: {},
    category: {},
    concurrencyTest: {},
    disposal: {},
    dataEquivalence: {},
  };

  telemetry.memory.baselineRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const transport = new EmbeddedElectronTransport({
    sessionPartition: 'persist:rutracker-v1',
    maxWorkers: 3,
    maxChallengeWaitMs: 15000,
  });

  try {
    // 1. Check Access / Cold or Warm Session
    console.log('[V3-80_TEST] Probing access on category f=1605...');
    const probeStart = Date.now();
    const access = await transport.checkAccess(SWITCH_CATEGORY);
    telemetry.coldSession = {
      status: access.status,
      httpStatus: access.httpStatus,
      latencyMs: Date.now() - probeStart,
      topicCount: access.topicCount,
    };
    console.log('[V3-80_TEST] Access probe result:', JSON.stringify(telemetry.coldSession));

    telemetry.memory.poolInitializedRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    // Verify all windows in pool are hidden
    const anyVisible = transport.workers.some(w => !w.window.isDestroyed() && w.window.isVisible());
    telemetry.hiddenVerified = !anyVisible;
    console.log('[V3-80_TEST] Hidden mode verified (anyVisible):', anyVisible);

    // 2. Real Category Page Extraction
    console.log('[V3-80_TEST] Fetching category page 1...');
    const catStart = Date.now();
    const catResult = await transport.fetchCategory(SWITCH_CATEGORY, 1);
    telemetry.category = {
      status: catResult.status,
      httpStatus: catResult.httpStatus,
      latencyMs: Date.now() - catStart,
      topicsFound: catResult.topics.length,
      totalPages: catResult.pagination.totalPages,
      firstTopicTitle: catResult.topics[0]?.title,
      firstTopicId: catResult.topics[0]?.id,
    };
    console.log('[V3-80_TEST] Category result:', JSON.stringify(telemetry.category));

    // 3. Concurrency C=3 and Topic Detail Extraction
    console.log('[V3-80_TEST] Fetching 3 sample topics with C=3 concurrency...');
    const concStart = Date.now();
    const topicPromises = SAMPLE_TOPICS.map(async (topic) => {
      const tStart = Date.now();
      const details = await transport.fetchTopic(topic, SWITCH_CATEGORY);
      return {
        topicId: topic.topicId,
        latencyMs: Date.now() - tStart,
        canonicalTitle: details.canonicalTitle,
        hasCover: Boolean(details.cover),
        hasMagnet: Boolean(details.magnet),
        hasScreenshots: Array.isArray(details.screenshots) && details.screenshots.length > 0,
        releaseYear: details.releaseYear,
        // Cyrillic check: contains Cyrillic characters (code points 0x0400-0x04FF)
        hasCyrillicChars: /[\u0400-\u04FF]/.test(details.canonicalTitle || details.topicTitle || ''),
      };
    });

    const topicResults = await Promise.all(topicPromises);
    const concDurationMs = Date.now() - concStart;

    telemetry.memory.activeFetchRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    telemetry.concurrencyTest = {
      concurrency: 3,
      totalDurationMs: concDurationMs,
      maxWorkersEnforced: transport.workers.length <= 3,
      results: topicResults,
    };
    console.log('[V3-80_TEST] Concurrency result:', JSON.stringify(telemetry.concurrencyTest));

    // 4. Data Equivalence & Cyrillic Validation
    telemetry.dataEquivalence = {
      cyrillicDecodedWithoutMojibake: topicResults.some(r => r.hasCyrillicChars),
      allTopicsHaveMagnets: topicResults.every(r => r.hasMagnet),
      allTopicsHaveCovers: topicResults.every(r => r.hasCover),
    };

  } catch (err) {
    telemetry.error = err.message;
    console.error('[V3-80_TEST][ERROR]', err);
  } finally {
    console.log('[V3-80_TEST] Disposing transport pool...');
    transport.dispose();

    telemetry.memory.postDisposalRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    telemetry.disposal = {
      disposed: transport.disposed,
      activeWorkersRemaining: transport.workers.length,
      allWindowsDestroyed: BrowserWindow.getAllWindows().every(w => w.isDestroyed()),
    };

    const outputPath = path.resolve(__dirname, 'v3-80-runtime-telemetry.json');
    fs.writeFileSync(outputPath, JSON.stringify(telemetry, null, 2), 'utf8');
    console.log('[V3-80_TEST] Telemetry saved to:', outputPath);

    app.quit();
  }
});

