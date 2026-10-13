/**
 * Pure RuTracker HTML Parser (V3-56 Phase 1)
 * Decoupled, stateless HTML DOM parser for category subforums and topic detail pages.
 * Operates purely on raw HTML strings without any Playwright or browser dependencies.
 */

const { JSDOM } = require('jsdom');
const {
  extractCanonicalTitleFromDOM,
  normalizeCanonicalGameTitle,
  normalizeTitleForDedupe,
  extractBTIH,
} = require('../../electron/scraper/titleExtractor.cjs');
const {
  cleanText,
  normalizeItemMetadata,
} = require('../../electron/scraper/metadataNormalizer.cjs');

function isTrackerDecorationOrSmile(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return lower.includes('smiles/') ||
         lower.includes('tr_oops.gif') ||
         lower.includes('broken_image_') ||
         lower.includes('spacer.gif') ||
         lower.includes('icon_') ||
         lower.includes('rating') ||
         lower.includes('static.rutracker');
}

function resolveRawImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let clean = url.trim();
  if (!clean || isTrackerDecorationOrSmile(clean)) return null;

  if (clean.startsWith('http://')) {
    clean = clean.replace(/^http:\/\//i, 'https://');
  }

  if (clean.includes('fastpic.org/thumb/') || clean.includes('fastpic.ru/thumb/')) {
    clean = clean.replace(/\/thumb\//i, '/big/').replace('_thumb', '');
  }

  if (clean.includes('fastpic.org/fullview/') || clean.includes('fastpic.org/view/') || clean.includes('fastpic.ru/')) {
    const match = clean.match(/fastpic\.(?:org|ru)\/(?:fullview|view)\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
    if (match) {
      const [, server, year, date, hash] = match;
      const sub = hash.slice(-2);
      const extMatch = clean.match(/\.(webp|png|gif|jpeg|jpg)\.html/i);
      const ext = extMatch ? extMatch[1] : 'jpg';
      return `https://i${server}.fastpic.org/big/${year}/${date}/${sub}/${hash}.${ext}`;
    }
  }

  if (clean.includes('imagebam.com/') && clean.includes('_t.')) {
    clean = clean.replace(/thumbs(\d+)?\.imagebam\.com/i, 'images$1.imagebam.com').replace(/_t\./i, '.');
  }

  if (clean.includes('imageban.ru/show/')) {
    const match = clean.match(/imageban\.ru\/show\/(\d+)\/(\d+)\/(\d+)\/([^/.\s]+)/i);
    if (match) {
      const [, year, month, day, hash] = match;
      return `https://i4.imageban.ru/out/${year}/${month}/${day}/${hash}.jpg`;
    }
    clean = clean.replace(/\/show\//i, '/out/').replace(/\/jpg$/i, '.jpg');
  }

  if (clean.includes('postimg.cc/') && !clean.includes('i.postimg.cc')) {
    clean = clean.replace(/postimg\.cc\//i, 'i.postimg.cc/') + '.jpg';
  }

  if (/\.(html|htm|php)($|\?)/i.test(clean)) {
    return null;
  }

  return clean;
}

function extractPaginationInfo(doc) {
  let maxStart = 0;
  const links = doc.querySelectorAll('a.pg, p a[href*="start="]');
  links.forEach(a => {
    const href = a.getAttribute('href') || '';
    const match = href.match(/start=(\d+)/);
    if (match) {
      const startVal = parseInt(match[1], 10);
      if (startVal > maxStart) maxStart = startVal;
    }
  });
  const totalPages = Math.floor(maxStart / 50) + 1;
  return { totalPages, maxStart };
}

/**
 * Parses raw HTML of a RuTracker category listing (viewforum.php?f=...)
 * @param {string} html Raw HTML string of category page
 * @param {Object} context Context metadata (categoryId, pageNum, pageUrl, etc.)
 * @returns {Object} { topics: Array, pagination: Object }
 */
function parseCategoryHtml(html, context = {}) {
  if (!html || typeof html !== 'string') {
    return { topics: [], pagination: { totalPages: 1, maxStart: 0 } };
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const categoryId = context.categoryId || context.category?.id || 'unknown';
  const categoryName = context.categoryName || context.category?.name || categoryId;
  const categoryBaseUrl = context.categoryBaseUrl || context.category?.baseUrl || `https://rutracker.org/forum/viewforum.php?f=${categoryId}`;
  const pageNum = context.pageNum || 1;
  const pageUrl = context.pageUrl || categoryBaseUrl;
  const titleSearch = context.titleSearch || context.category?.titleSearch || null;

  const pagination = extractPaginationInfo(doc);
  const topics = [];
  const links = doc.querySelectorAll('a.torTopic');

  links.forEach(el => {
    const title = el.textContent.trim();
    const href = el.getAttribute('href') || '';

    const matchesTitle = !titleSearch ||
      (Array.isArray(titleSearch)
        ? titleSearch.some(term => title.toLowerCase().includes(term.toLowerCase()))
        : title.toLowerCase().includes(titleSearch.toLowerCase()));

    if (title && matchesTitle && href) {
      const topicIdMatch = href.match(/t=(\d+)/);
      const topicId = topicIdMatch ? topicIdMatch[1] : null;

      if (topicId) {
        const fullUrl = href.startsWith('http')
          ? href
          : `https://rutracker.org/forum/${href.startsWith('/') ? href.substring(1) : href}`;

        const row = el.closest('tr');
        let sizeStr = null;
        let seeds = null;
        let leechers = null;

        if (row) {
          const sizeEl = row.querySelector('a.small.f-dl, td.tor-size, a[href*="dl.php?t="]');
          if (sizeEl) sizeStr = sizeEl.textContent.trim();

          const seedEl = row.querySelector('b.seedmed, span.seedmed, .seedmed');
          if (seedEl) {
            const parsedSeed = parseInt(seedEl.textContent.trim(), 10);
            if (!isNaN(parsedSeed)) seeds = parsedSeed;
          }

          const leechEl = row.querySelector('b.leechmed, span.leechmed, .leechmed');
          if (leechEl) {
            const parsedLeech = parseInt(leechEl.textContent.trim(), 10);
            if (!isNaN(parsedLeech)) leechers = parsedLeech;
          }
        }

        topics.push({
          id: `topic_${topicId}`,
          topicId,
          title,
          url: fullUrl,
          category: categoryId,
          sizeStr,
          seeds,
          leechers,
          source: {
            site: 'rutracker',
            forumId: categoryBaseUrl.match(/f=(\d+)/)?.[1] || categoryId,
            forumName: categoryName,
            category: categoryId,
            categoryName,
            categoryUrl: categoryBaseUrl,
            page: pageNum,
            pageOffset: (pageNum - 1) * 50,
            pageUrl,
          },
        });
      }
    }
  });

  return { topics, pagination };
}

/**
 * Parses raw HTML of a RuTracker topic detail page (viewtopic.php?t=...)
 * @param {string} html Raw HTML string of topic page
 * @param {Object} context Context metadata (topicUrl, topicTitle)
 * @returns {Object} Extracted and normalized topic details
 */
function parseTopicHtml(html, context = {}) {
  if (!html || typeof html !== 'string') return {};

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const postBody = doc.querySelector('.post_body');
  if (!postBody) return {};

  const topicTitle = context.topicTitle || '';
  const titleExtract = extractCanonicalTitleFromDOM(postBody, topicTitle);
  const canonicalTitle = titleExtract.canonicalTitle;
  const canonicalTitleRaw = titleExtract.canonicalTitleRaw;
  const releaseGroup = titleExtract.releaseGroup;
  const normalizedTitle = normalizeTitleForDedupe(canonicalTitle);

  // Cover image extraction
  let cover = null;
  const coverImg = postBody.querySelector('img.postImg.postImgAligned, img.img-right, img.postImgAligned');
  if (coverImg) {
    const rawCover = coverImg.getAttribute('src') || coverImg.getAttribute('data-src') || coverImg.closest('a')?.getAttribute('href');
    if (rawCover && !isTrackerDecorationOrSmile(rawCover)) {
      cover = resolveRawImageUrl(rawCover);
    }
  }
  if (!cover) {
    const cleanBody = postBody.cloneNode(true);
    cleanBody.querySelectorAll('.sp-wrap').forEach(el => el.remove());
    const firstVar = cleanBody.querySelector('var.postImg, var');
    if (firstVar && firstVar.getAttribute('title')) {
      const rawTitle = firstVar.getAttribute('title');
      if (rawTitle && !isTrackerDecorationOrSmile(rawTitle)) {
        cover = resolveRawImageUrl(rawTitle);
      }
    }
    if (!cover) {
      const candidateImgs = Array.from(cleanBody.querySelectorAll('img.postImg, img'));
      for (const img of candidateImgs) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || img.closest('a')?.getAttribute('href');
        if (src && !isTrackerDecorationOrSmile(src)) {
          cover = resolveRawImageUrl(src);
          if (cover) break;
        }
      }
    }
  }

  // Screenshots extraction
  const screenshots = [];
  const seenScreenshotKeys = new Set();
  const screenshotSpWraps = Array.from(postBody.querySelectorAll('.sp-wrap'));

  screenshotSpWraps.sort((a, b) => {
    const aText = (a.querySelector('.sp-head, .sp-tit')?.textContent || '').trim().toLowerCase();
    const bText = (b.querySelector('.sp-head, .sp-tit')?.textContent || '').trim().toLowerCase();
    const aExact = aText === 'скриншоты' || aText === 'скриншот' || aText === 'screenshots';
    const bExact = bText === 'скриншоты' || bText === 'скриншот' || bText === 'screenshots';
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return 0;
  });

  screenshotSpWraps.forEach(wrap => {
    const headText = (wrap.querySelector('.sp-head, .sp-tit')?.textContent || '').toLowerCase();
    if (headText.includes('скриншот') || headText.includes('screenshot') || headText.includes('снимок')) {
      const spBody = wrap.querySelector('.sp-body');
      if (!spBody) return;

      spBody.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const imgOrVar = a.querySelector('img, var');
        const src = imgOrVar ? (imgOrVar.getAttribute('src') || imgOrVar.getAttribute('data-src') || imgOrVar.getAttribute('title') || '') : '';

        const candidates = [href, src].filter(Boolean);
        for (const cand of candidates) {
          const resolved = resolveRawImageUrl(cand);
          if (resolved && !isTrackerDecorationOrSmile(resolved)) {
            if (cover && resolved === cover) continue;
            const dedupeKey = resolved.replace(/^https?:\/\//i, '').replace(/\.(jpe?g|png|webp|gif)$/i, '');
            if (!seenScreenshotKeys.has(dedupeKey)) {
              seenScreenshotKeys.add(dedupeKey);
              screenshots.push(resolved);
              break;
            }
          }
        }
      });

      spBody.querySelectorAll('img.postImg, var.postImg, img').forEach(el => {
        if (!el.closest('a')) {
          const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('title') || '';
          const resolved = resolveRawImageUrl(src);
          if (resolved && !isTrackerDecorationOrSmile(resolved)) {
            if (cover && resolved === cover) return;
            const dedupeKey = resolved.replace(/^https?:\/\//i, '').replace(/\.(jpe?g|png|webp|gif)$/i, '');
            if (!seenScreenshotKeys.has(dedupeKey)) {
              seenScreenshotKeys.add(dedupeKey);
              screenshots.push(resolved);
            }
          }
        }
      });
    }
  });

  // Magnet link & infoHash
  let magnet = null;
  const magnetLink = doc.querySelector('a.magnet-link, a[href^="magnet:"], a[href*="magnet:?xt="]');
  if (magnetLink) {
    magnet = magnetLink.getAttribute('href');
  }
  const infoHash = extractBTIH(magnet);

  // Exact torrent size and sizeBytes from #tor-size-humn
  let torrentSize = null;
  let torrentSizeBytes = null;
  const torrentSizeEl = doc.querySelector('#tor-size-humn');
  if (torrentSizeEl) {
    torrentSize = cleanText(torrentSizeEl.textContent || '');
    const exactBytes = (torrentSizeEl.getAttribute('title') || '').trim();
    if (/^\d+$/.test(exactBytes)) {
      const parsedBytes = Number(exactBytes);
      if (Number.isSafeInteger(parsedBytes) && parsedBytes >= 0) {
        torrentSizeBytes = parsedBytes;
      }
    }
  }

  // File tree from spoiler
  let fileList = null;
  postBody.querySelectorAll('.sp-wrap').forEach(wrap => {
    const headText = (wrap.querySelector('.sp-head, .sp-tit')?.textContent || '').toLowerCase();
    if (headText.includes('список файлов') || headText.includes('файлы в раздаче') || headText.includes('файлы')) {
      fileList = (wrap.querySelector('.sp-body')?.textContent || '').trim();
    }
  });

  // Textual metadata fields
  const keyMap = {
    releaseYear: ['год выпуска', 'год выхода', 'дата выпуска', 'дата выхода', 'год релиза', 'год'],
    genre: ['жанр'],
    developer: ['разработчик', 'разработчики'],
    publisher: ['издатель', 'издательство', 'издатель в россии'],
    imageFormat: ['формат образа', 'формат дампа', 'формат игры', 'формат файла', 'формат', 'тип файлов', 'тип образа', 'вид раздачи'],
    multiplayer: ['мультиплеер игры', 'мультиплейер игры', 'мультиплеер', 'мультиплейер', 'сетевой режим'],
    interfaceLanguage: ['язык интерфейса', 'язык интерфейса игры', 'язык интерфейса/титров', 'языки интерфейса', 'язык'],
    voiceLanguage: ['язык озвучки', 'озвучка', 'языки озвучки'],
    version: ['версия игры', 'версия', 'версия прошивки', 'патч / версия', 'патч'],
    region: ['регион', 'регион игры', 'region'],
    size: ['размер'],
  };

  const meta = {
    releaseYear: null,
    genre: null,
    developer: null,
    publisher: null,
    imageFormat: null,
    multiplayer: null,
    interfaceLanguage: null,
    voiceLanguage: null,
    version: null,
    region: null,
    size: null,
  };

  const keyNodes = postBody.querySelectorAll('.post-b, b');
  keyNodes.forEach(node => {
    const keyLabel = (node.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
    for (const [field, keywords] of Object.entries(keyMap)) {
      if (meta[field]) continue;
      if (keywords.includes(keyLabel)) {
        let valText = '';
        let curr = node.nextSibling;
        while (curr) {
          if (curr.nodeType === 1 && (curr.classList?.contains('post-b') || curr.tagName === 'B' || curr.tagName === 'BR' || curr.classList?.contains('post-br'))) {
            break;
          }
          valText += curr.textContent || '';
          curr = curr.nextSibling;
        }
        const cleaned = cleanText(valText);
        if (cleaned) meta[field] = cleaned;
      }
    }
  });

  const postText = postBody.textContent || '';
  if (!meta.releaseYear) {
    const m = postText.match(/(?:Год\s+выпуска|Год\s+выхода|Дата\s+выпуска|Дата\s+выхода|Год)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.releaseYear = cleanText(m[1]);
  }
  if (!meta.genre) {
    const m = postText.match(/Жанр\s*:\s*([^\n\r<]+)/i);
    if (m) meta.genre = cleanText(m[1]);
  }
  if (!meta.developer) {
    const m = postText.match(/Разработчик\s*:\s*([^\n\r<]+)/i);
    if (m) meta.developer = cleanText(m[1]);
  }
  if (!meta.publisher) {
    const m = postText.match(/(?:Издатель|Издательство)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.publisher = cleanText(m[1]);
  }
  if (!meta.imageFormat) {
    const m = postText.match(/(?:Формат\s+образа|Формат\s+дампа|Формат\s+игры|Формат)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.imageFormat = cleanText(m[1]);
  }
  if (!meta.multiplayer) {
    const m = postText.match(/(?:Мультипле[йя]р(?:\s+игры)?)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.multiplayer = cleanText(m[1]);
  }
  if (!meta.interfaceLanguage) {
    const m = postText.match(/(?:Язык\s+интерфейса|Язык)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.interfaceLanguage = cleanText(m[1]);
  }
  if (!meta.voiceLanguage) {
    const m = postText.match(/(?:Язык\s+озвучки|Озвучка)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.voiceLanguage = cleanText(m[1]);
  }
  if (!meta.version) {
    const m = postText.match(/(?:Версия\s+игры|Версия)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.version = cleanText(m[1]);
  }
  if (!meta.region) {
    const m = postText.match(/(?:Регион(?:\s+игры)?)\s*:\s*([^\n\r<]+)/i);
    if (m) meta.region = cleanText(m[1]);
  }
  if (!meta.size) {
    const m = postText.match(/Размер\s*:\s*([0-9\.,]+\s*(?:GB|MB|KB|ГБ|МБ|КБ))/i) || postText.match(/(\d+[\.,]\d+\s*(?:GB|MB|KB))/i);
    if (m) meta.size = cleanText(m[1]);
  }

  const normMeta = normalizeItemMetadata({
    title: topicTitle,
    topicTitle,
    canonicalTitle,
    genre: meta.genre,
    developer: meta.developer,
    publisher: meta.publisher,
    releaseYear: meta.releaseYear,
    version: meta.version,
    interfaceLanguage: meta.interfaceLanguage,
    voiceLanguage: meta.voiceLanguage,
    language: meta.interfaceLanguage,
    imageFormat: meta.imageFormat,
    multiplayer: meta.multiplayer,
    region: meta.region,
  });

  return {
    canonicalTitle,
    canonicalTitleRaw,
    normalizedTitle,
    releaseGroup,
    infoHash,
    cover,
    screenshots,
    magnet,
    fileList,
    size: torrentSize || meta.size,
    sizeBytes: torrentSizeBytes,
    ...meta,
    ...normMeta,
  };
}

module.exports = {
  parseCategoryHtml,
  parseTopicHtml,
  extractPaginationInfo,
  resolveRawImageUrl,
  isTrackerDecorationOrSmile,
};
