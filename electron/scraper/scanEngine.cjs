/**
 * Universal Scraper Scan Engine (V3-61)
 * Single shared scanning engine for both First Run / Initial Discovery and Update Library.
 * Fully decoupled from Playwright, executing scans over any ScraperTransport.
 * Integrates SQLite Main process transactions via itemsRepo and ingestionService.
 */

const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const itemsRepo = require('../database/repositories/itemsRepo.cjs');
const appStateRepo = require('../database/repositories/appStateRepo.cjs');
const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
const { ingestRawBatch } = require('../indexer/ingestionService.cjs');
const { shouldStopAfterPage } = require('./executionPlan.cjs');

const COMPANION_TOPIC_CONCURRENCY = 3;

async function sleep(ms) {
  if (ms <= 0) return;
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanLibrary({
  transport,
  plan,
  db,
  syncRunId = null,
  onProgress = () => {},
  onStatus = () => {},
  onLog = () => {},
  onPageCommitted = () => {},
  onVerificationRequired = null,
  isCancelled = () => false,
  isPaused = () => false,
  pageDelayMs = 400,
}) {
  if (!transport) throw new Error('A valid ScraperTransport is required for scanLibrary.');
  if (!plan?.scope?.categories) throw new Error('A valid execution plan is required for scanLibrary.');
  if (!db) throw new Error('A database instance is required for scanLibrary.');

  const categories = plan.scope.categories;
  const scanStartedAt = new Date().toISOString();
  let totalItemsScraped = 0;
  let totalNewItems = 0;
  let totalUpdatedItems = 0;
  let totalTopicsFound = 0;
  const categoriesScraped = [];

  onLog({
    level: 'info',
    message: `[SCAN_ENGINE] Starting scan across ${categories.length} categories using transport "${transport.name || transport.id}". Mode: ${plan.mode}.`,
    timestamp: new Date().toISOString(),
  });

  const categoryStatuses = categories.map((c, i) => ({
    id: c.id,
    name: c.name || c.id,
    status: i === 0 ? 'in_progress' : 'pending',
    itemsCount: 0,
  }));

  for (let catIndex = 0; catIndex < categories.length; catIndex++) {
    if (isCancelled()) {
      onLog({ level: 'info', message: '[SCAN_ENGINE] Scan cancelled by user before category start.', timestamp: new Date().toISOString() });
      if (syncRunId) {
        try {
          syncHistoryRepo.finishRun(db, syncRunId, {
            status: 'CANCELLED',
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - new Date(scanStartedAt).getTime(),
            cancelledByUser: true,
            newItems: totalNewItems,
            updatedItems: totalUpdatedItems,
            savedItems: totalItemsScraped,
            categoriesCompleted: categoriesScraped.length,
          });
        } catch (_) {}
      }
      return { success: false, cancelled: true, totalItems: totalItemsScraped, newItems: totalNewItems, updatedItems: totalUpdatedItems, categories: categoriesScraped };
    }

    const category = categories[catIndex];
    categoryStatuses[catIndex].status = 'in_progress';
    const catStartedAt = new Date().toISOString();
    let categoryTopicsFound = 0;
    let categoryNewItems = 0;
    let categoryUpdatedItems = 0;
    let categoryItemsScraped = 0;

    if (syncRunId) {
      try {
        syncHistoryRepo.upsertCategoryRun(db, {
          id: `${syncRunId}_${category.id}`,
          syncRunId,
          categoryId: category.id,
          categoryNameSnapshot: category.name || category.id,
          startedAt: catStartedAt,
          status: 'RUNNING',
          pagesProcessed: 0,
          totalPages: 1,
          topicsFound: 0,
          newItems: 0,
          updatedItems: 0,
          knownItems: 0,
          savedItems: 0,
          durationMs: 0,
        });
      } catch (_) {}
    }

    try {
      categoriesRepo.upsert(db, {
        id: category.id,
        name: category.name || category.id,
        baseUrl: category.baseUrl || category.base_url || null,
        titleSearch: category.titleSearch || category.title_search || null,
        filePath: category.filePath || category.file_path || '',
        itemCount: 0,
        lastScrapedAt: new Date().toISOString(),
      });
    } catch (_) {}

    onLog({
      level: 'info',
      message: `[SCAN_ENGINE] Starting category "${category.name}" (${category.id}) [${catIndex + 1}/${categories.length}]...`,
      timestamp: new Date().toISOString(),
    });

    const knownTopicIds = new Set(itemsRepo.getKnownTopicIds(db, 'rutracker', category.id));
    const newlyAddedTopicIds = new Set();
    onLog({
      level: 'info',
      message: `[SCAN_ENGINE] Category "${category.id}": loaded ${knownTopicIds.size} existing known topic IDs from SQLite.`,
      timestamp: new Date().toISOString(),
    });

    let pageNum = 1;
    let totalPages = 1;
    let consecutiveKnownPages = 0;
    let completedPages = 0;
    let paginationKnown = false;
    let completedEarly = false;

    while (pageNum <= totalPages) {
      while (isPaused() && !isCancelled()) {
        await sleep(250);
      }

      if (isCancelled()) {
        onLog({ level: 'info', message: `[SCAN_ENGINE] Scan cancelled during category "${category.id}" page ${pageNum}.`, timestamp: new Date().toISOString() });
        if (syncRunId) {
          try {
            syncHistoryRepo.upsertCategoryRun(db, {
              id: `${syncRunId}_${category.id}`,
              syncRunId,
              categoryId: category.id,
              categoryNameSnapshot: category.name || category.id,
              startedAt: catStartedAt,
              finishedAt: new Date().toISOString(),
              status: 'CANCELLED',
              pagesProcessed: pageNum - 1,
              totalPages,
              topicsFound: categoryTopicsFound,
              newItems: categoryNewItems,
              updatedItems: categoryUpdatedItems,
              savedItems: categoryItemsScraped,
              durationMs: Date.now() - new Date(catStartedAt).getTime(),
            });
            syncHistoryRepo.finishRun(db, syncRunId, {
              status: 'CANCELLED',
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - new Date(scanStartedAt).getTime(),
              cancelledByUser: true,
              newItems: totalNewItems,
              updatedItems: totalUpdatedItems,
              savedItems: totalItemsScraped,
              categoriesCompleted: categoriesScraped.length,
            });
          } catch (_) {}
        }
        return { success: false, cancelled: true, totalItems: totalItemsScraped, newItems: totalNewItems, updatedItems: totalUpdatedItems, categories: categoriesScraped };
      }

      onProgress({
        category: category.id,
        categoryName: category.name,
        categoryIndex: catIndex + 1,
        totalCategories: categories.length,
        categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
        currentPage: completedPages,
        totalPages: paginationKnown ? totalPages : 0,
        totalItems: totalItemsScraped,
        newItems: totalNewItems,
        updatedItems: totalUpdatedItems,
        processedItems: categoryItemsScraped,
        status: 'scanning',
      });

      let pageResult;
      while (true) {
        try {
          pageResult = await transport.fetchCategory(category, pageNum);
          break;
        } catch (err) {
          if (err.code === 'INTERACTION_REQUIRED' || err.status === 'CHALLENGE_REQUIRED') {
            if (typeof onVerificationRequired === 'function') {
              try {
                const vRes = await onVerificationRequired({ category, pageNum, error: err });
                if (vRes && vRes.resumed) {
                  onLog({
                    level: 'info',
                    message: `[SCAN_ENGINE] Verification resolved for "${category.id}". Retrying page ${pageNum}...`,
                    timestamp: new Date().toISOString(),
                  });
                  continue;
                }
              } catch (vErr) {
                err = vErr;
              }
            }
            categoryStatuses[catIndex].status = 'paused';
            if (syncRunId) {
              try {
                syncHistoryRepo.upsertCategoryRun(db, {
                  id: `${syncRunId}_${category.id}`,
                  syncRunId,
                  categoryId: category.id,
                  categoryNameSnapshot: category.name || category.id,
                  startedAt: catStartedAt,
                  status: 'WARNING',
                  pagesProcessed: pageNum - 1,
                  totalPages,
                  topicsFound: categoryTopicsFound,
                  newItems: categoryNewItems,
                  updatedItems: categoryUpdatedItems,
                  savedItems: categoryItemsScraped,
                  durationMs: Date.now() - new Date(catStartedAt).getTime(),
                  errorCode: 'INTERACTION_REQUIRED',
                  errorSummary: 'Browser verification required',
                });
                syncHistoryRepo.updateRunProgress(db, syncRunId, { verificationRequired: true });
              } catch (_) {}
            }
            onProgress({
              category: category.id,
              categoryName: category.name,
              categoryIndex: catIndex + 1,
              totalCategories: categories.length,
              categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
              currentPage: completedPages,
              totalPages: paginationKnown ? totalPages : 0,
              totalItems: totalItemsScraped,
              newItems: totalNewItems,
              updatedItems: totalUpdatedItems,
              processedItems: categoryItemsScraped,
              status: 'paused',
            });
            onLog({ level: 'warn', message: `[SCAN_ENGINE] Verification required for "${category.id}". Halting scan at checkpoint.`, timestamp: new Date().toISOString() });
            throw Object.assign(err, { categoryId: category.id, checkpoint: { categoryId: category.id, pageNum } });
          }
          categoryStatuses[catIndex].status = 'failed';
        if (syncRunId) {
          try {
            syncHistoryRepo.upsertCategoryRun(db, {
              id: `${syncRunId}_${category.id}`,
              syncRunId,
              categoryId: category.id,
              categoryNameSnapshot: category.name || category.id,
              startedAt: catStartedAt,
              finishedAt: new Date().toISOString(),
              status: 'FAILED',
              pagesProcessed: pageNum - 1,
              totalPages,
              topicsFound: categoryTopicsFound,
              newItems: categoryNewItems,
              updatedItems: categoryUpdatedItems,
              savedItems: categoryItemsScraped,
              durationMs: Date.now() - new Date(catStartedAt).getTime(),
              errorCode: err.code || 'FETCH_ERROR',
              errorSummary: err.message || 'Error fetching category page',
            });
          } catch (_) {}
        }
        onLog({ level: 'error', message: `[SCAN_ENGINE] Error fetching page ${pageNum} for "${category.id}": ${err.message}`, timestamp: new Date().toISOString() });
        throw err;
      }
    }

      if (pageResult.pagination?.totalPages) {
        totalPages = Math.max(totalPages, pageResult.pagination.totalPages);
        paginationKnown = true;
      }

      const rawTopics = pageResult.topics || [];
      const knownCountOnPage = rawTopics.filter(t => knownTopicIds.has(t.topicId)).length;
      const newCountOnPage = rawTopics.length - knownCountOnPage;
      onLog({
        level: 'info',
        message: `[SCAN_ENGINE] Category "${category.id}" page ${pageNum}/${totalPages}: retrieved ${rawTopics.length} topics.`,
        timestamp: new Date().toISOString(),
      });

      onProgress({
        category: category.id,
        categoryName: category.name,
        categoryIndex: catIndex + 1,
        totalCategories: categories.length,
        categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
        currentPage: completedPages,
        totalPages: paginationKnown ? totalPages : 0,
        topicsDiscovered: rawTopics.length,
        newTopics: newCountOnPage,
        knownTopics: knownCountOnPage,
        totalItems: totalItemsScraped,
        newItems: totalNewItems,
        updatedItems: totalUpdatedItems,
        processedItems: categoryItemsScraped,
        status: 'scanning',
      });

      // Check known topics for incremental early stop
      if (rawTopics.length > 0) {
        for (const t of rawTopics) {
          if (t.topicId && !knownTopicIds.has(t.topicId)) {
            newlyAddedTopicIds.add(t.topicId);
          }
        }
        const knownCountOnPage = rawTopics.filter(t => knownTopicIds.has(t.topicId)).length;
        if (knownCountOnPage === rawTopics.length) {
          consecutiveKnownPages++;
          if (shouldStopAfterPage({ plan, consecutiveKnownPages })) {
            onLog({
              level: 'info',
              message: `[SCAN_ENGINE] Early stop triggered for category "${category.id}" after ${consecutiveKnownPages} consecutive fully known pages.`,
              timestamp: new Date().toISOString(),
            });
            completedPages = pageNum;
            completedEarly = true;
            break;
          }
        } else {
          consecutiveKnownPages = 0;
        }
      }

      // Filter or ingest topics
      let topicsToIngest = rawTopics;
      if (plan.discoverNewTopics === false) {
        // Refresh mode: only update existing catalog items
        topicsToIngest = rawTopics.filter(t => knownTopicIds.has(t.topicId));
      }

      if (topicsToIngest.length > 0) {
        let enrichedTopics = topicsToIngest;
        const canEnrich = plan.enrichTopics !== false && typeof transport.fetchTopic === 'function';

        if (canEnrich) {
          const isEmbedded = transport.id === 'EMBEDDED_ELECTRON';
          const defaultConcurrency = isEmbedded ? 1 : COMPANION_TOPIC_CONCURRENCY;
          const concurrencyLimit = typeof plan.concurrency === 'number' && plan.concurrency > 0
            ? plan.concurrency
            : defaultConcurrency;

          const queue = topicsToIngest.map((t, idx) => ({ topic: t, index: idx }));
          const resultsMap = new Map();
          let processedDetailsCount = 0;
          let verificationError = null;
          let activeVerificationPromise = null;

          const worker = async () => {
            while (queue.length > 0 && !isCancelled() && !verificationError) {
              while (isPaused() && !isCancelled() && !verificationError) {
                await sleep(250);
              }
              const item = queue.shift();
              if (!item) break;
              const { topic, index } = item;

              const isNew = !knownTopicIds.has(topic.topicId);
              const shouldEnrichItem = isNew || plan.mode === 'refresh' || Boolean(plan.refresh?.images);

              if (!shouldEnrichItem) {
                resultsMap.set(index, topic);
                continue;
              }

              // Polite delay for embedded scraper to avoid anti-flood / rate limits
              if (isEmbedded && processedDetailsCount > 0) {
                await sleep(600);
              }

              const tStart = Date.now();
              try {
                const details = await transport.fetchTopic(topic, category);
                const fetchDurationMs = Date.now() - tStart;
                processedDetailsCount++;

                onProgress({
                  category: category.id,
                  categoryName: category.name,
                  categoryIndex: catIndex + 1,
                  totalCategories: categories.length,
                  categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
                  currentPage: completedPages,
                  totalPages: paginationKnown ? totalPages : 0,
                  topicsDiscovered: rawTopics.length,
                  newTopics: newCountOnPage,
                  knownTopics: knownCountOnPage,
                  detailsProcessed: processedDetailsCount,
                  detailsTotal: topicsToIngest.length,
                  totalItems: totalItemsScraped,
                  newItems: totalNewItems,
                  updatedItems: totalUpdatedItems,
                  processedItems: categoryItemsScraped,
                  status: 'enriching',
                });

                if (details && typeof details === 'object' && Object.keys(details).length > 0) {
                  resultsMap.set(index, {
                    ...topic,
                    ...details,
                    title: details.canonicalTitle || details.topicTitle || topic.title,
                    canonicalTitle: details.canonicalTitle || topic.title,
                    canonicalTitleRaw: details.canonicalTitleRaw || topic.title,
                    releaseGroup: details.releaseGroup || null,
                    cover: details.cover || null,
                    coverUrl: details.cover || null,
                    screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                    magnet: details.magnet || null,
                    fileList: details.fileList || null,
                    developer: details.developer || null,
                    publisher: details.publisher || null,
                    genre: details.genre || null,
                    releaseYear: details.releaseYear || null,
                    version: details.version || null,
                    interfaceLanguage: details.interfaceLanguage || details.language || null,
                    voiceLanguage: details.voiceLanguage || null,
                    imageFormat: details.imageFormat || null,
                    multiplayer: details.multiplayer || null,
                    region: details.region || null,
                    sizeStr: details.size || topic.sizeStr || null,
                    sizeBytes: details.sizeBytes ?? null,
                    content: {
                      cover: details.cover || null,
                      screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                      magnet: details.magnet || null,
                      size: details.size || topic.sizeStr || null,
                      sizeBytes: details.sizeBytes ?? null,
                      fileList: details.fileList || null,
                    },
                  });
                  onLog({
                    level: 'info',
                    message: `[SCAN_ENGINE][PERF] Enriched topic "${topic.title}" (${topic.topicId}) in ${fetchDurationMs}ms: cover=${Boolean(details.cover)} magnet=${Boolean(details.magnet)} screenshots=${details.screenshots?.length || 0}`,
                    timestamp: new Date().toISOString(),
                  });
                } else {
                  resultsMap.set(index, topic);
                }
              } catch (fetchErr) {
                if (fetchErr.code === 'INTERACTION_REQUIRED' || fetchErr.status === 'CHALLENGE_REQUIRED') {
                  if (typeof onVerificationRequired === 'function') {
                    try {
                      let vRes;
                      if (activeVerificationPromise) {
                        vRes = await activeVerificationPromise;
                      } else {
                        activeVerificationPromise = onVerificationRequired({ category, pageNum, topic, error: fetchErr })
                          .finally(() => {
                            activeVerificationPromise = null;
                          });
                        vRes = await activeVerificationPromise;
                      }

                      if (vRes && vRes.resumed) {
                        try {
                          const details = await transport.fetchTopic(topic, category);
                          processedDetailsCount++;
                          if (details && typeof details === 'object' && Object.keys(details).length > 0) {
                            resultsMap.set(index, {
                              ...topic,
                              ...details,
                              title: details.canonicalTitle || details.topicTitle || topic.title,
                              canonicalTitle: details.canonicalTitle || topic.title,
                              canonicalTitleRaw: details.canonicalTitleRaw || topic.title,
                              releaseGroup: details.releaseGroup || null,
                              cover: details.cover || null,
                              coverUrl: details.cover || null,
                              screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                              magnet: details.magnet || null,
                              fileList: details.fileList || null,
                              developer: details.developer || null,
                              publisher: details.publisher || null,
                              genre: details.genre || null,
                              releaseYear: details.releaseYear || null,
                              version: details.version || null,
                              interfaceLanguage: details.interfaceLanguage || details.language || null,
                              voiceLanguage: details.voiceLanguage || null,
                              imageFormat: details.imageFormat || null,
                              multiplayer: details.multiplayer || null,
                              region: details.region || null,
                              sizeStr: details.size || topic.sizeStr || null,
                              sizeBytes: details.sizeBytes ?? null,
                              content: {
                                cover: details.cover || null,
                                screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                                magnet: details.magnet || null,
                                size: details.size || topic.sizeStr || null,
                                sizeBytes: details.sizeBytes ?? null,
                                fileList: details.fileList || null,
                              },
                            });
                          } else {
                            resultsMap.set(index, topic);
                          }
                          continue;
                        } catch (retryErr) {
                          verificationError = retryErr;
                          return;
                        }
                      }
                    } catch (vErr) {
                      verificationError = vErr;
                      return;
                    }
                  }
                  categoryStatuses[catIndex].status = 'paused';
                  verificationError = fetchErr;
                  return;
                }
                onLog({
                  level: 'warn',
                  message: `[SCAN_ENGINE] Detail fetch failed for "${topic.title}" (${fetchErr.message}). Ingesting basic listing data.`,
                  timestamp: new Date().toISOString(),
                });
                resultsMap.set(index, topic);
              }
            }
          };

          const workerCount = Math.min(concurrencyLimit, topicsToIngest.length);
          const workers = Array.from({ length: workerCount }, () => worker());
          await Promise.all(workers);

          if (isCancelled()) {
            onLog({ level: 'info', message: '[SCAN_ENGINE] Scan cancelled by user during topic enrichment.', timestamp: new Date().toISOString() });
            return { success: false, cancelled: true, totalItems: totalItemsScraped, newItems: totalNewItems, updatedItems: totalUpdatedItems, categories: categoriesScraped };
          }

          if (verificationError) {
            throw verificationError;
          }

          enrichedTopics = topicsToIngest.map((t, idx) => resultsMap.get(idx) || t);
        }

        const ingestion = ingestRawBatch(db, category, enrichedTopics, { batchDiscoveredAt: scanStartedAt });
        totalItemsScraped += ingestion.written;
        totalNewItems += ingestion.inserted;
        totalUpdatedItems += ingestion.updated;
        categoryItemsScraped += ingestion.written;
        totalTopicsFound += rawTopics.length;
        categoryTopicsFound += rawTopics.length;

        for (const item of enrichedTopics) {
          if (item.topicId) knownTopicIds.add(item.topicId);
        }

        if (syncRunId) {
          try {
            syncHistoryRepo.upsertCategoryRun(db, {
              id: `${syncRunId}_${category.id}`,
              syncRunId,
              categoryId: category.id,
              categoryNameSnapshot: category.name || category.id,
              startedAt: catStartedAt,
              status: 'RUNNING',
              pagesProcessed: pageNum,
              totalPages,
              topicsFound: categoryTopicsFound,
              newItems: categoryNewItems,
              updatedItems: categoryUpdatedItems,
              savedItems: categoryItemsScraped,
              durationMs: Date.now() - new Date(catStartedAt).getTime(),
            });
            syncHistoryRepo.updateRunProgress(db, syncRunId, {
              topicsFound: totalTopicsFound,
              newItems: totalNewItems,
              updatedItems: totalUpdatedItems,
              savedItems: totalItemsScraped,
              durationMs: Date.now() - new Date(scanStartedAt).getTime(),
            });
          } catch (_) {}
        }

        onLog({
          level: 'info',
          message: `[SCAN_ENGINE][DB] Ingested page ${pageNum} for "${category.id}": ${ingestion.inserted} inserted, ${ingestion.updated} updated.`,
          timestamp: new Date().toISOString(),
        });

        if (ingestion.written > 0) {
          try {
            onPageCommitted({
              categoryId: category.id,
              categoryName: category.name,
              page: pageNum,
              totalPages: totalPages,
              inserted: ingestion.inserted,
              updated: ingestion.updated,
              totalSaved: totalItemsScraped,
            });
          } catch (_) {}
        }
      }

      completedPages = pageNum;
      onProgress({
        category: category.id,
        categoryName: category.name,
        categoryIndex: catIndex + 1,
        totalCategories: categories.length,
        categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
        currentPage: completedPages,
        totalPages: paginationKnown ? totalPages : 0,
        topicsDiscovered: rawTopics.length,
        newTopics: newCountOnPage,
        knownTopics: knownCountOnPage,
        detailsProcessed: topicsToIngest.length,
        detailsTotal: topicsToIngest.length,
        totalItems: totalItemsScraped,
        newItems: totalNewItems,
        updatedItems: totalUpdatedItems,
        processedItems: categoryItemsScraped,
        status: 'saving',
      });

      pageNum++;
      if (pageNum <= totalPages) {
        await sleep(pageDelayMs);
      }
    }

    // Post-scan detail enrichment for newly added items lacking details (screenshots, size, file list)
    const canEnrichPostScan = plan.enrichTopics !== false && typeof transport.fetchTopic === 'function';
    if (canEnrichPostScan && !isCancelled()) {
      try {
        const targetTopicIds = newlyAddedTopicIds.size > 0 ? Array.from(newlyAddedTopicIds) : (plan.mode === 'full' ? null : []);
        const pendingItems = (typeof itemsRepo.getItemsNeedingDetailEnrichment === 'function' && targetTopicIds !== null && targetTopicIds.length === 0)
          ? []
          : (typeof itemsRepo.getItemsNeedingDetailEnrichment === 'function'
            ? itemsRepo.getItemsNeedingDetailEnrichment(db, category.id, { limit: 50, topicIds: targetTopicIds })
            : []);
        if (pendingItems && pendingItems.length > 0) {
          onLog({
            level: 'info',
            message: `[SCAN_ENGINE] Category "${category.id}": starting post-scan enrichment for ${pendingItems.length} newly added items lacking details (screenshots, item sizes, file lists)...`,
            timestamp: new Date().toISOString(),
          });

          const isEmbedded = transport.id === 'EMBEDDED_ELECTRON';
          const defaultConcurrency = isEmbedded ? 1 : COMPANION_TOPIC_CONCURRENCY;
          const concurrencyLimit = typeof plan.concurrency === 'number' && plan.concurrency > 0
            ? plan.concurrency
            : defaultConcurrency;

          const queue = [...pendingItems];
          let processedCount = 0;
          let verificationError = null;
          let activeVerificationPromise = null;

          const worker = async () => {
            while (queue.length > 0 && !isCancelled() && !verificationError) {
              while (isPaused() && !isCancelled() && !verificationError) {
                await sleep(250);
              }
              const item = queue.shift();
              if (!item) break;

              if (isEmbedded && processedCount > 0) {
                await sleep(600);
              }

              const tStart = Date.now();
              try {
                const topicObj = {
                  topicId: item.topicId,
                  title: item.title,
                  url: item.url || `https://rutracker.org/forum/viewtopic.php?t=${item.topicId}`,
                  sizeStr: item.sizeStr,
                };
                const details = await transport.fetchTopic(topicObj, category);
                const fetchDurationMs = Date.now() - tStart;
                processedCount++;

                onProgress({
                  category: category.id,
                  categoryName: category.name,
                  categoryIndex: catIndex + 1,
                  totalCategories: categories.length,
                  categoryStatuses: [...categoryStatuses],
                  currentPage: pageNum > 1 ? pageNum - 1 : 1,
                  totalPages,
                  topicsDiscovered: categoryTopicsFound,
                  newTopics: categoryNewItems,
                  knownTopics: knownTopicIds.size,
                  detailsProcessed: processedCount,
                  detailsTotal: pendingItems.length,
                  totalItems: totalItemsScraped,
                  newItems: totalNewItems,
                  updatedItems: totalUpdatedItems,
                  processedItems: categoryItemsScraped,
                  status: 'enriching',
                });

                if (details && typeof details === 'object' && Object.keys(details).length > 0) {
                  const enrichedTopic = {
                    ...topicObj,
                    ...details,
                    title: details.canonicalTitle || details.topicTitle || topicObj.title,
                    canonicalTitle: details.canonicalTitle || topicObj.title,
                    canonicalTitleRaw: details.canonicalTitleRaw || topicObj.title,
                    releaseGroup: details.releaseGroup || null,
                    cover: details.cover || null,
                    coverUrl: details.cover || null,
                    screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                    magnet: details.magnet || null,
                    fileList: details.fileList || null,
                    developer: details.developer || null,
                    publisher: details.publisher || null,
                    genre: details.genre || null,
                    releaseYear: details.releaseYear || null,
                    version: details.version || null,
                    interfaceLanguage: details.interfaceLanguage || details.language || null,
                    voiceLanguage: details.voiceLanguage || null,
                    imageFormat: details.imageFormat || null,
                    multiplayer: details.multiplayer || null,
                    region: details.region || null,
                    sizeStr: details.size || topicObj.sizeStr || null,
                    sizeBytes: details.sizeBytes ?? null,
                    content: {
                      cover: details.cover || null,
                      screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                      magnet: details.magnet || null,
                      size: details.size || topicObj.sizeStr || null,
                      sizeBytes: details.sizeBytes ?? null,
                      fileList: details.fileList || null,
                    },
                  };

                  ingestRawBatch(db, category, [enrichedTopic], { batchDiscoveredAt: scanStartedAt });

                  onLog({
                    level: 'info',
                    message: `[SCAN_ENGINE][POST_SCAN_ENRICH] (${processedCount}/${pendingItems.length}) Enriched "${item.title}" in ${fetchDurationMs}ms: cover=${Boolean(details.cover)} screenshots=${details.screenshots?.length || 0} size=${details.size || item.sizeStr} files=${Array.isArray(details.fileList) ? details.fileList.length : (details.fileList ? 'yes' : 'no')}`,
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (fetchErr) {
                if (fetchErr.code === 'INTERACTION_REQUIRED' || fetchErr.status === 'CHALLENGE_REQUIRED') {
                  if (typeof onVerificationRequired === 'function') {
                    try {
                      let vRes;
                      if (activeVerificationPromise) {
                        vRes = await activeVerificationPromise;
                      } else {
                        activeVerificationPromise = onVerificationRequired({ category, pageNum, topic: item, error: fetchErr })
                          .finally(() => { activeVerificationPromise = null; });
                        vRes = await activeVerificationPromise;
                      }
                      if (vRes && vRes.resumed) {
                        try {
                          const topicObj = {
                            topicId: item.topicId,
                            title: item.title,
                            url: item.url || `https://rutracker.org/forum/viewtopic.php?t=${item.topicId}`,
                            sizeStr: item.sizeStr,
                          };
                          const details = await transport.fetchTopic(topicObj, category);
                          processedCount++;
                          if (details && typeof details === 'object' && Object.keys(details).length > 0) {
                            const enrichedTopic = {
                              ...topicObj,
                              ...details,
                              title: details.canonicalTitle || details.topicTitle || topicObj.title,
                              canonicalTitle: details.canonicalTitle || topicObj.title,
                              canonicalTitleRaw: details.canonicalTitleRaw || topicObj.title,
                              releaseGroup: details.releaseGroup || null,
                              cover: details.cover || null,
                              coverUrl: details.cover || null,
                              screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                              magnet: details.magnet || null,
                              fileList: details.fileList || null,
                              developer: details.developer || null,
                              publisher: details.publisher || null,
                              genre: details.genre || null,
                              releaseYear: details.releaseYear || null,
                              version: details.version || null,
                              interfaceLanguage: details.interfaceLanguage || details.language || null,
                              voiceLanguage: details.voiceLanguage || null,
                              imageFormat: details.imageFormat || null,
                              multiplayer: details.multiplayer || null,
                              region: details.region || null,
                              sizeStr: details.size || topicObj.sizeStr || null,
                              sizeBytes: details.sizeBytes ?? null,
                              content: {
                                cover: details.cover || null,
                                screenshots: Array.isArray(details.screenshots) ? details.screenshots : [],
                                magnet: details.magnet || null,
                                size: details.size || topicObj.sizeStr || null,
                                sizeBytes: details.sizeBytes ?? null,
                                fileList: details.fileList || null,
                              },
                            };
                            ingestRawBatch(db, category, [enrichedTopic], { batchDiscoveredAt: scanStartedAt });
                          }
                          continue;
                        } catch (retryErr) {
                          verificationError = retryErr;
                          return;
                        }
                      }
                    } catch (vErr) {
                      verificationError = vErr;
                      return;
                    }
                  }
                  categoryStatuses[catIndex].status = 'paused';
                  verificationError = fetchErr;
                  return;
                }
                onLog({
                  level: 'warn',
                  message: `[SCAN_ENGINE] Post-scan detail fetch failed for "${item.title}" (${fetchErr.message}).`,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          };

          const workerCount = Math.min(concurrencyLimit, pendingItems.length);
          const workers = Array.from({ length: workerCount }, () => worker());
          await Promise.all(workers);

          if (isCancelled()) {
            onLog({ level: 'info', message: '[SCAN_ENGINE] Scan cancelled by user during post-scan topic enrichment.', timestamp: new Date().toISOString() });
            return { success: false, cancelled: true, totalItems: totalItemsScraped, newItems: totalNewItems, updatedItems: totalUpdatedItems, categories: categoriesScraped };
          }

          if (verificationError) {
            throw verificationError;
          }
        }
      } catch (postEnrichErr) {
        if (postEnrichErr.code === 'INTERACTION_REQUIRED' || postEnrichErr.status === 'CHALLENGE_REQUIRED') {
          throw postEnrichErr;
        }
        onLog({
          level: 'warn',
          message: `[SCAN_ENGINE] Error in post-scan enrichment for "${category.id}": ${postEnrichErr.message}`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    categoryStatuses[catIndex].status = 'completed';
    categoryStatuses[catIndex].itemsCount = categoryItemsScraped;
    onProgress({
      category: category.id,
      categoryName: category.name,
      categoryIndex: catIndex + 1,
      totalCategories: categories.length,
      categoryStatuses: categoryStatuses.map(entry => ({ ...entry })),
      currentPage: completedPages,
      totalPages: paginationKnown ? totalPages : 0,
      totalItems: totalItemsScraped,
      newItems: totalNewItems,
      updatedItems: totalUpdatedItems,
      processedItems: categoryItemsScraped,
      status: completedEarly ? 'category_completed_early_stop' : 'category_completed',
    });

    if (syncRunId) {
      try {
        syncHistoryRepo.upsertCategoryRun(db, {
          id: `${syncRunId}_${category.id}`,
          syncRunId,
          categoryId: category.id,
          categoryNameSnapshot: category.name || category.id,
          startedAt: catStartedAt,
          finishedAt: new Date().toISOString(),
          status: 'COMPLETED',
          pagesProcessed: pageNum - 1,
          totalPages,
          topicsFound: categoryTopicsFound,
          newItems: categoryNewItems,
          updatedItems: categoryUpdatedItems,
          savedItems: categoryItemsScraped,
          durationMs: Date.now() - new Date(catStartedAt).getTime(),
        });
        syncHistoryRepo.updateRunProgress(db, syncRunId, {
          categoriesCompleted: categoriesScraped.length + 1,
        });
      } catch (_) {}
    }

    categoriesScraped.push({
      id: category.id,
      name: category.name,
      itemsCount: categoryItemsScraped,
    });
  }

  // Update initial_scan_completed if library has items
  try {
    const totalInDb = itemsRepo.getTotalItemCount(db);
    if (totalInDb > 0) {
      appStateRepo.setAppState(db, 'initial_scan_completed', 'true');
    }
  } catch (_) {}

  let finalStatus = 'COMPLETED';
  if (syncRunId) {
    try {
      const hasWarnings = categoryStatuses.some(cs => cs.status === 'paused' || cs.status === 'failed');
      finalStatus = hasWarnings && categoriesScraped.length > 0
        ? 'COMPLETED_WITH_WARNINGS'
        : (categoriesScraped.length === 0 && categories.length > 0 ? 'FAILED' : 'COMPLETED');

      syncHistoryRepo.finishRun(db, syncRunId, {
        status: finalStatus,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(scanStartedAt).getTime(),
        newItems: totalNewItems,
        updatedItems: totalUpdatedItems,
        savedItems: totalItemsScraped,
        categoriesCompleted: categoriesScraped.length,
      });
    } catch (_) {}
  }

  onLog({
    level: 'info',
    message: `[SCAN_ENGINE] Scan finished successfully. Total written: ${totalItemsScraped} (${totalNewItems} new, ${totalUpdatedItems} updated) across ${categoriesScraped.length} categories.`,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    status: finalStatus,
    syncRunId,
    totalItems: totalItemsScraped,
    newItems: totalNewItems,
    updatedItems: totalUpdatedItems,
    categoriesCount: categoriesScraped.length,
    categories: categoriesScraped,
  };
}

module.exports = {
  scanLibrary,
  COMPANION_TOPIC_CONCURRENCY,
};

