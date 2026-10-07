/**
 * Native JSON Catalog Normalizer (Main Process Indexer)
 * Includes Canonical Title & Normalization (V3-05)
 */

const { normalizeCanonicalGameTitle, normalizeTitleForDedupe, extractBTIH } = require('../scraper/titleExtractor.cjs');
const {
  normalizeReleaseYear,
  normalizeDeveloper,
  normalizePublisher,
  normalizeGenre,
  normalizeVersion,
  normalizeLanguages,
  normalizeAudio,
  normalizeImageFormat,
  normalizeMultiplayer,
  normalizeRegion,
} = require('../scraper/metadataNormalizer.cjs');

function parseCategoryHeader(filename, jsonContent) {
  const fallbackId = filename.replace(/\.json$/i, "").toLowerCase();
  const fallbackName = fallbackId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (jsonContent && typeof jsonContent === "object" && !Array.isArray(jsonContent)) {
    const catObj = jsonContent.category;
    if (catObj && (catObj.id || catObj.name)) {
      return {
        id: catObj.id || fallbackId,
        name: catObj.name || fallbackName,
        forumId: catObj.forumId || catObj.forum_id || null,
        baseUrl: catObj.baseUrl || catObj.base_url || null,
        titleSearch: catObj.titleSearch || catObj.title_search || null,
      };
    }
  }

  return {
    id: fallbackId,
    name: fallbackName,
    forumId: null,
    baseUrl: null,
    titleSearch: null,
  };
}

function extractItemsList(jsonContent) {
  if (Array.isArray(jsonContent)) {
    return jsonContent;
  }
  if (jsonContent && typeof jsonContent === "object" && Array.isArray(jsonContent.items)) {
    return jsonContent.items;
  }
  return [];
}

function normalizeReleaseYearInt(year) {
  return normalizeReleaseYear(year);
}

function normalizeLanguage(lang) {
  const res = normalizeLanguages(lang);
  return res.display || res.raw || null;
}

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

function resolveDirectImageUrl(url) {
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

  return clean;
}

function normalizeCoverUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  if (!clean || isTrackerDecorationOrSmile(clean)) return null;
  return resolveDirectImageUrl(clean);
}

function detectProvider(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const u = url.toLowerCase();
  if (u.includes('fastpic')) return 'fastpic';
  if (u.includes('imageban')) return 'imageban';
  if (u.includes('postimg')) return 'postimg';
  if (u.includes('imagebam')) return 'imagebam';
  if (u.includes('radikal')) return 'radikal';
  if (u.includes('vfl.ru') || u.includes('vfl')) return 'vfl';
  return 'unknown';
}

function isViewerPage(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();

  if (u.endsWith('.html') || u.endsWith('.htm') || u.endsWith('.php')) return true;
  if (u.includes('fastpic') && (u.includes('/view/') || u.includes('/fullview/'))) return true;
  if (u.includes('imageban') && u.includes('/show/')) return true;
  if (u.includes('postimg') && !u.includes('i.postimg.cc') && (u.includes('/image/') || u.includes('/view/'))) return true;
  if (u.includes('imagebam') && (u.includes('/view/') || u.includes('/image/'))) return true;

  const hasImgExt = /\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(u);
  const isKnownDirectDomain = u.includes('i1.imageban') || u.includes('i2.imageban') || u.includes('i3.imageban') || u.includes('i4.imageban') || u.includes('i5.imageban') || u.includes('i.postimg.cc') || u.includes('i.fastpic') || /i\d+\.fastpic/.test(u);

  if (!hasImgExt && !isKnownDirectDomain) {
    return true;
  }

  return false;
}

function isDirectImageUrl(url) {
  return !isViewerPage(url);
}

function extractImageIdentity(url) {
  if (!url || typeof url !== 'string') return null;
  const provider = detectProvider(url);
  const cleanUrl = url.split('?')[0].split('#')[0];

  if (provider === 'fastpic') {
    const filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
    const hash = filename.replace(/\.(html?|jpe?g|webp|png|gif)$/gi, '').replace(/\.(html?|jpe?g|webp|png|gif)$/gi, '');
    if (hash) return `fastpic:${hash}`;
  }

  if (provider === 'imageban') {
    const parts = cleanUrl.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].replace(/\.(html?|jpe?g|webp|png|gif)$/gi, '');
      if (/^[a-f0-9]{20,40}$/i.test(part)) {
        return `imageban:${part}`;
      }
    }
    const filename = parts[parts.length - 1].replace(/\.(html?|jpe?g|webp|png|gif)$/gi, '');
    if (filename) return `imageban:${filename}`;
  }

  if (provider === 'postimg') {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return `postimg:${parsed.href}`;
    } catch {
      return `postimg:${url}`;
    }
  }

  if (provider === 'imagebam') {
    const filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
    const hash = filename.replace(/_t\.(jpe?g|png|webp)$/i, '').replace(/\.(html?|jpe?g|webp|png|gif)$/gi, '');
    if (hash) return `imagebam:${hash}`;
  }

  return `${provider}:${cleanUrl}`;
}

function getScreenshotPriority(url) {
  if (!url || typeof url !== 'string') return -1;
  const u = url.toLowerCase();

  if (isViewerPage(url)) {
    return 0;
  }

  const provider = detectProvider(url);

  if (provider === 'fastpic') {
    if (u.includes('/big/')) return 100;
    if (u.includes('/thumb/')) return 60;
    return 80;
  }

  if (provider === 'imageban') {
    if (u.includes('/out/')) return 100;
    if (u.includes('/thumbs/')) return 60;
    return 80;
  }

  if (provider === 'postimg') {
    if (u.includes('i.postimg.cc')) return 100;
    return 80;
  }

  if (provider === 'imagebam') {
    if (!u.includes('_t.')) return 90;
    if (u.includes('_t.')) return 60;
    return 80;
  }

  if (/\.(png|jpe?g|webp)$/i.test(u)) {
    if (u.includes('thumb')) return 60;
    return 85;
  }

  return 50;
}

function normalizeScreenshots(rawScreenshots) {
  if (!Array.isArray(rawScreenshots)) return [];

  const urls = rawScreenshots
    .filter(s => typeof s === 'string' && s.trim().length > 0)
    .map(s => resolveDirectImageUrl(s) || s.trim())
    .filter(s => s && !isTrackerDecorationOrSmile(s));

  if (urls.length === 0) return [];

  const uniqueUrls = Array.from(new Set(urls));
  const identityOrder = [];
  const groups = new Map();

  for (const url of uniqueUrls) {
    const identity = extractImageIdentity(url);
    if (!groups.has(identity)) {
      groups.set(identity, []);
      identityOrder.push(identity);
    }
    groups.get(identity).push(url);
  }

  const result = [];

  for (const identity of identityOrder) {
    const group = groups.get(identity);
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      let bestUrl = group[0];
      let bestScore = getScreenshotPriority(bestUrl);

      for (let i = 1; i < group.length; i++) {
        const currentUrl = group[i];
        const score = getScreenshotPriority(currentUrl);
        if (score > bestScore) {
          bestUrl = currentUrl;
          bestScore = score;
        }
      }
      result.push(bestUrl);
    }
  }

  return result;
}

function normalizeItem(raw, fallbackCategoryId, fallbackCategoryName) {
  if (!raw || typeof raw !== 'object') return null;

  const topicId = raw.topicId
    ? String(raw.topicId)
    : (raw.url ? raw.url.match(/t=(\d+)/)?.[1] : null);

  const id = raw.id || (topicId ? `topic_${topicId}` : `item_${Math.random().toString(36).substring(2)}`);
  const source = (raw.source && raw.source.site) ? raw.source.site : 'rutracker';

  const rawTitle = (raw.title && typeof raw.title === 'string') ? raw.title.trim() : "Untitled";
  const topicTitle = raw.topicTitle || raw.sourceTitle || rawTitle;

  let canonicalTitle = raw.canonicalTitle;
  let canonicalTitleRaw = raw.canonicalTitleRaw || rawTitle;
  let releaseGroup = raw.releaseGroup || null;

  if (!canonicalTitle) {
    const norm = normalizeCanonicalGameTitle(raw.cleanTitle || canonicalTitleRaw, topicTitle);
    canonicalTitle = norm.canonicalTitle;
    if (!releaseGroup) releaseGroup = norm.releaseGroup;
  }

  const normalizedTitle = raw.normalizedTitle || normalizeTitleForDedupe(canonicalTitle);
  const cleanTitle = canonicalTitle;
  const titleSort = normalizedTitle || canonicalTitle.toLowerCase();

  const rawCover = (raw.content?.cover && typeof raw.content.cover === 'string')
    ? raw.content.cover
    : (typeof raw.cover === 'string' ? raw.cover : null);
  const coverUrl = normalizeCoverUrl(rawCover);

  const rawScreenshots = raw.content?.screenshots ?? raw.screenshots;
  const screenshots = normalizeScreenshots(rawScreenshots);

  const rawMagnet = raw.content?.magnet ?? raw.magnet;
  const magnet = (typeof rawMagnet === 'string' && rawMagnet.startsWith('magnet:')) ? rawMagnet : null;
  const infoHash = raw.infoHash || extractBTIH(magnet) || null;

  const rawSize = raw.content?.size ?? raw.size;
  const sizeStr = (typeof rawSize === 'string' && rawSize !== 'N/A') ? rawSize : null;
  const sizeBytes = (raw.sizeBytes ?? raw.content?.sizeBytes ?? raw.content?.fileListTotalSizeBytes ?? raw.fileListTotalSizeBytes) || null;

  const rawFileList = raw.content?.fileList ?? raw.fileList;
  const fileList = Array.isArray(rawFileList) ? rawFileList : null;
  const fileCount = raw.content?.fileCount ?? raw.fileCount ?? (fileList ? fileList.length : null);
  const fileListTotalSizeBytes = raw.content?.fileListTotalSizeBytes ?? raw.fileListTotalSizeBytes ?? sizeBytes;
  const fileListSource = raw.content?.fileListSource ?? raw.fileListSource ?? null;

  const discoveredAt = raw.scraping?.discoveredAt || raw.content?.discoveredAt || raw.discoveredAt || raw.scrapedAt || raw.content?.scrapedAt || null;
  const scrapedAt = raw.scrapedAt || raw.scraping?.scrapedAt || null;

  const devNorm = normalizeDeveloper(raw.developer);
  const pubNorm = normalizePublisher(raw.publisher);
  const genreNorm = normalizeGenre(raw.genre);
  const verNorm = normalizeVersion(raw.version || raw.gameVersion || raw.game_version);
  const langNorm = normalizeLanguages(raw.interfaceLanguage || raw.language);
  const audioNorm = normalizeAudio(raw.voiceLanguage || raw.voice_language || raw.audio);
  const imageFormat = normalizeImageFormat(raw.imageFormat || raw.image_format);
  const multiNorm = normalizeMultiplayer(raw.multiplayer);
  const releaseYear = normalizeReleaseYear(raw.releaseYear || raw.release_year);
  const regionNorm = normalizeRegion(raw.region, topicTitle);

  return {
    id,
    categoryId: fallbackCategoryId,
    source,
    topicId,
    title: rawTitle,
    topicTitle,
    canonicalTitle,
    canonicalTitleRaw,
    normalizedTitle,
    cleanTitle,
    titleSort,
    infoHash,
    releaseGroup,
    url: raw.url || raw.sourceUrl || null,
    genre: genreNorm.genre,
    genreRaw: genreNorm.raw,
    genres: genreNorm.genres,
    developer: devNorm.developer,
    developerRaw: devNorm.raw,
    developers: devNorm.developers,
    publisher: pubNorm.publisher,
    publisherRaw: pubNorm.raw,
    publishers: pubNorm.publishers,
    version: verNorm.version,
    versionRaw: verNorm.raw,
    releaseYear,
    language: langNorm.display || langNorm.raw,
    interfaceLanguage: langNorm.display || langNorm.raw,
    languageCodes: langNorm.codes,
    voiceLanguage: audioNorm.display || audioNorm.raw,
    audioLanguageCodes: audioNorm.codes,
    imageFormat,
    multiplayer: multiNorm.raw || (multiNorm.multiplayer !== null ? (multiNorm.multiplayer ? 'Yes' : 'No') : null),
    multiplayerBoolean: multiNorm.multiplayer,
    region: regionNorm.region,
    regionRaw: regionNorm.raw,
    coverUrl,
    sizeStr,
    sizeBytes,
    discoveredAt,
    scrapedAt,
    details: {
      magnet,
      fileList,
      fileCount,
      fileListTotalSizeBytes,
      fileListSource,
      screenshots,
      source: raw.source || null,
      scraping: raw.scraping || null,
    },
  };
}

module.exports = {
  parseCategoryHeader,
  extractItemsList,
  normalizeReleaseYearInt,
  normalizeItem,
  detectProvider,
  isViewerPage,
  isDirectImageUrl,
  extractImageIdentity,
  getScreenshotPriority,
  normalizeScreenshots,
};
