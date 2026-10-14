const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const { JSDOM } = require('jsdom');
const parser = require('../../scraper/parsers/rutrackerHtmlParser.cjs');
const dbMain = require('../database/dbMain.cjs');
const categoriesRepo = require('../database/repositories/categoriesRepo.cjs');
const { CategoryManager } = require('./categoryManager.cjs');
const { ingestRawBatch } = require('../indexer/ingestionService.cjs');

const MAX_HTML_BYTES = 15 * 1024 * 1024;
const IMPORT_STATUSES = Object.freeze({
  SUCCESS: 'IMPORT_SUCCESS', PARTIAL: 'IMPORT_PARTIAL', INVALID: 'INVALID_HTML',
  UNSUPPORTED: 'UNSUPPORTED_PAGE', TOO_LARGE: 'FILE_TOO_LARGE', READ_ERROR: 'FILE_READ_ERROR',
  PARSE_ERROR: 'PARSE_ERROR', IMPORT_ERROR: 'IMPORT_ERROR', CANCELLED: 'CANCELLED',
});

function isRuTrackerCategoryHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return false;
  const doc = new JSDOM(html).window.document;
  const hasListing = doc.querySelector('a.torTopic[href*="t="], a.pg[href*="start="], a[href*="start="]');
  return !!(hasListing && doc.querySelector('table.forumline, #tor-list, .forumline, form#tor-form'));
}

function isRuTrackerTopicHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return false;
  const doc = new JSDOM(html).window.document;
  return !!(doc.querySelector('.post_body') && (doc.querySelector('a.magnet-link, a[href^="magnet:?"]') || doc.querySelector('.topic')));
}

function getTopicId(doc) {
  const candidates = [doc.querySelector('link[rel="canonical"]')?.href, doc.querySelector('meta[property="og:url"]')?.content, doc.URL];
  for (const candidate of candidates) {
    const match = String(candidate || '').match(/[?&]t=(\d+)/);
    if (match) return match[1];
  }
  const anchor = doc.querySelector('a[href*="viewtopic.php?t="]');
  return anchor?.getAttribute('href')?.match(/[?&]t=(\d+)/)?.[1] || null;
}

function getForumId(doc) {
  const candidates = [doc.querySelector('link[rel="canonical"]')?.href, doc.querySelector('meta[property="og:url"]')?.content];
  for (const candidate of candidates) {
    const match = String(candidate || '').match(/[?&]f=(\d+)/);
    if (match) return match[1];
  }
  const forumLink = doc.querySelector('a[href*="viewforum.php?f="]');
  return forumLink?.getAttribute('href')?.match(/[?&]f=(\d+)/)?.[1] || null;
}

function detectRuTrackerPageType(html) {
  if (isRuTrackerCategoryHtml(html)) return 'CATEGORY_PAGE';
  if (isRuTrackerTopicHtml(html)) return 'TOPIC_PAGE';
  return 'UNKNOWN';
}

function readHtmlBounded(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_HTML_BYTES) {
        stream.destroy(Object.assign(new Error('HTML file exceeds the import size limit.'), { code: 'IMPORT_FILE_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const header = buffer.subarray(0, 4096).toString('ascii');
      const charset = header.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.-]+)/i)?.[1] || 'utf-8';
      try { resolve(new TextDecoder(charset).decode(buffer)); }
      catch { resolve(buffer.toString('utf8')); }
    });
  });
}

function resolveCategory(db, forumId, selectedCategoryId) {
  const configured = CategoryManager.getInstance().getResolvedCategories();
  if (selectedCategoryId) {
    const selected = configured.find((category) => category.id === selectedCategoryId);
    if (selected) return selected;
    const stored = categoriesRepo.getById(db, selectedCategoryId);
    if (stored) return { id: stored.id, name: stored.name, baseUrl: stored.base_url };
  }
  if (forumId) {
    return configured.find((category) => String(category.baseUrl || '').match(/[?&]f=(\d+)/)?.[1] === forumId)
      || configured.find((category) => category.id === forumId)
      || null;
  }
  return null;
}

function importParsedItems(db, category, rawItems) {
  return ingestRawBatch(db, category, rawItems, { preserveMissingFields: true });
}

async function importRuTrackerHtml({ dialog, parentWindow, selectedCategoryId } = {}) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: 'Import saved RuTracker page',
    properties: ['openFile'],
    filters: [{ name: 'HTML Files', extensions: ['html', 'htm'] }],
  });
  if (canceled || !filePaths?.[0]) return { status: IMPORT_STATUSES.CANCELLED };
  const filePath = filePaths[0];
  const filename = path.basename(filePath);
  const startedAt = performance.now();
  let html;
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_HTML_BYTES) return { status: IMPORT_STATUSES.TOO_LARGE, filename, message: 'The selected HTML file is too large.' };
    html = await readHtmlBounded(filePath);
  } catch (error) {
    return { status: error.code === 'IMPORT_FILE_TOO_LARGE' ? IMPORT_STATUSES.TOO_LARGE : IMPORT_STATUSES.READ_ERROR, filename,
      message: error.code === 'IMPORT_FILE_TOO_LARGE' ? 'The selected HTML file is too large.' : 'Could not read the selected HTML file.' };
  }
  if (!html.trim()) return { status: IMPORT_STATUSES.INVALID, filename, message: 'The selected file is empty.' };
  let pageType;
  try { pageType = detectRuTrackerPageType(html); }
  catch { return { status: IMPORT_STATUSES.PARSE_ERROR, filename, message: 'The selected HTML file could not be parsed.' }; }
  if (pageType === 'UNKNOWN') return { status: IMPORT_STATUSES.UNSUPPORTED, filename, pageType, message: 'This file is not a supported RuTracker category or topic page.' };

  const db = dbMain.getDatabase();
  if (!db) return { status: IMPORT_STATUSES.IMPORT_ERROR, filename, pageType, message: 'The library database is unavailable.' };
  let phase = 'parse';
  try {
    const doc = new JSDOM(html).window.document;
    let category = resolveCategory(db, getForumId(doc), selectedCategoryId);
    let rawItems;
    let categoryId = category?.id || null;
    if (pageType === 'CATEGORY_PAGE') {
      if (!category) return { status: IMPORT_STATUSES.INVALID, filename, pageType, reason: 'CATEGORY_REQUIRED', message: 'Select a matching library category before importing this page.' };
      rawItems = parser.parseCategoryHtml(html, { categoryId: category.id, categoryName: category.name, categoryBaseUrl: category.baseUrl }).topics;
      const invalidTopicLinks = [...doc.querySelectorAll('a.torTopic')].filter((link) => !/[?&]t=\d+/.test(link.getAttribute('href') || ''));
      rawItems.push(...invalidTopicLinks.map((link) => ({ title: link.textContent?.trim() || null, url: link.getAttribute('href') || null })));
    } else {
      const topicId = getTopicId(doc);
      if (!topicId) return { status: IMPORT_STATUSES.INVALID, filename, pageType, reason: 'TOPIC_ID_MISSING', message: 'The topic page does not contain a valid topic ID.' };
      if (!category) return { status: IMPORT_STATUSES.INVALID, filename, pageType, reason: 'CATEGORY_REQUIRED', message: 'Select a library category for this topic before importing.' };
      const parsed = parser.parseTopicHtml(html, { topicId });
      const title = doc.querySelector('title')?.textContent?.trim() || '';
      const topicTitle = title.replace(/\s*[–|-]\s*RuTracker.*$/i, '').trim();
      rawItems = [{ ...parsed, id: `topic_${topicId}`, topicId, title: topicTitle || `Topic ${topicId}`, topicTitle: topicTitle || null,
        url: doc.querySelector('link[rel="canonical"]')?.href || doc.querySelector('meta[property="og:url"]')?.content || null,
        source: { site: 'rutracker', topicId } }];
    }
    const parsedCount = rawItems.length;
    phase = 'import';
    const result = importParsedItems(db, category, rawItems);
    const status = result.invalid ? IMPORT_STATUSES.PARTIAL : IMPORT_STATUSES.SUCCESS;
    const durationMs = Math.round(performance.now() - startedAt);
    console.info(`[HTML_IMPORT] status=${status} pageType=${pageType} categoryId=${categoryId} filename=${JSON.stringify(filename)} parsed=${parsedCount} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped} invalid=${result.invalid} durationMs=${durationMs}`);

    try {
      const syncHistoryRepo = require('../database/repositories/syncHistoryRepo.cjs');
      const runId = syncHistoryRepo.createRun(db, {
        mode: 'HTML_IMPORT',
        transport: 'MANUAL_IMPORT',
        scopeType: pageType === 'CATEGORY_PAGE' ? 'SINGLE_CATEGORY' : 'SINGLE_TOPIC',
        scopeCategoryId: categoryId,
        triggerType: 'MANUAL',
        categoriesTotal: 1,
      });
      syncHistoryRepo.upsertCategoryRun(db, {
        id: `${runId}_${categoryId}`,
        syncRunId: runId,
        categoryId: categoryId,
        categoryNameSnapshot: category.name || categoryId,
        startedAt: new Date(Date.now() - durationMs).toISOString(),
        finishedAt: new Date().toISOString(),
        status: status === IMPORT_STATUSES.SUCCESS ? 'COMPLETED' : 'WARNING',
        pagesProcessed: 1,
        totalPages: 1,
        topicsFound: parsedCount,
        newItems: result.inserted,
        updatedItems: result.updated,
        savedItems: result.inserted + result.updated,
        durationMs,
      });
      syncHistoryRepo.finishRun(db, runId, {
        status: status === IMPORT_STATUSES.SUCCESS ? 'COMPLETED' : 'COMPLETED_WITH_WARNINGS',
        finishedAt: new Date().toISOString(),
        durationMs,
        newItems: result.inserted,
        updatedItems: result.updated,
        savedItems: result.inserted + result.updated,
        categoriesCompleted: 1,
      });
    } catch (_) {}

    return { status, pageType, categoryId, categoryName: category.name, filename, imported: result.inserted, updated: result.updated, skipped: result.skipped,
      invalid: result.invalid, parsedCount, importedAt: new Date().toISOString(), warnings: result.skipped ? invalidWarnings(result.skipped) : [], durationMs };
  } catch (error) {
    console.error(`[HTML_IMPORT] status=IMPORT_ERROR filename=${JSON.stringify(filename)} error=${error?.name || 'Error'}`);
    return { status: phase === 'parse' ? IMPORT_STATUSES.PARSE_ERROR : IMPORT_STATUSES.IMPORT_ERROR, filename, pageType,
      message: phase === 'parse' ? 'The selected HTML file could not be parsed.' : 'The RuTracker page could not be imported.' };
  }
}

function invalidWarnings(count) { return [`${count} invalid or duplicate topic entr${count === 1 ? 'y was' : 'ies were'} skipped.`]; }

module.exports = { MAX_HTML_BYTES, IMPORT_STATUSES, isRuTrackerCategoryHtml, isRuTrackerTopicHtml, detectRuTrackerPageType, readHtmlBounded, importParsedItems, importRuTrackerHtml };
