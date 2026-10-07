/**
 * Items Repository for Native SQLite
 * Manages item listing, pagination, sorting, search, and batch ingestion.
 * Preserves user favorites during catalog re-indexing.
 * Includes Canonical Title & Deduplication support (V3-05).
 */

const detailsRepo = require('./detailsRepo.cjs');
const { normalizeCanonicalGameTitle, normalizeTitleForDedupe, extractBTIH, classifyDuplicates } = require('../../scraper/titleExtractor.cjs');

const SORT_COLUMNS = {
  title: 'COALESCE(items.canonical_title, items.title_sort, items.clean_title, items.title)',
  discoveredAt: 'items.discovered_at',
  releaseYear: 'items.release_year',
  sizeBytes: 'items.size_bytes',
  seeds: 'tm.seeds',
  leechers: 'tm.leechers',
};

function escapeLike(str) {
  if (!str) return '';
  return str.replace(/[%_\\]/g, '\\$&');
}

function getById(db, id) {
  if (!id) return null;
  const stmt = db.prepare(`
    SELECT
      items.id, items.category_id, items.source, items.topic_id,
      items.title, items.topic_title, items.canonical_title, items.normalized_title,
      items.clean_title, items.title_sort, items.info_hash, items.url,
      items.genre, items.developer, items.publisher, items.release_year, items.version, items.language, items.interface_language,
      items.voice_language, items.image_format, items.multiplayer, items.region, items.cover_url, items.size_str, items.size_bytes,
      items.has_cover, items.has_screenshots, items.has_magnet, items.is_favorite, items.discovered_at, items.scraped_at, items.updated_at,
      item_details.magnet AS magnet,
      tm.seeds, tm.leechers, tm.peers, tm.swarm_status, tm.swarm_source, tm.swarm_fetched_at
    FROM items
    LEFT JOIN item_details ON item_details.item_id = items.id
    LEFT JOIN torrent_metadata tm ON tm.item_id = items.id
    WHERE items.id = ?
  `);
  const row = stmt.get(id);
  if (!row) return null;
  return normalizeRow(row);
}

function normalizeRow(row) {
  const rawTitle = row.title || 'Untitled';
  const topicTitle = row.topic_title || rawTitle;
  const canonicalTitle = row.canonical_title || row.clean_title || rawTitle;
  const normalizedTitle = row.normalized_title || normalizeTitleForDedupe(canonicalTitle);

  return {
    id: row.id,
    categoryId: row.category_id,
    source: row.source,
    topicId: row.topic_id,
    title: rawTitle,
    topicTitle,
    canonicalTitle,
    normalizedTitle,
    cleanTitle: canonicalTitle,
    titleSort: row.title_sort || normalizedTitle,
    infoHash: row.info_hash || null,
    url: row.url,
    genre: row.genre,
    developer: row.developer,
    publisher: row.publisher,
    releaseYear: row.release_year,
    version: row.version || null,
    language: row.language,
    interfaceLanguage: row.interface_language,
    voiceLanguage: row.voice_language,
    imageFormat: row.image_format,
    multiplayer: row.multiplayer,
    region: row.region || null,
    coverUrl: row.cover_url,
    sizeStr: row.size_str,
    sizeBytes: row.size_bytes,
    hasCover: Boolean(row.has_cover),
    hasScreenshots: Boolean(row.has_screenshots),
    hasMagnet: Boolean(row.has_magnet),
    magnet: row.magnet || null,
    magnetLink: row.magnet || null,
    isFavorite: Boolean(row.is_favorite),
    discoveredAt: row.discovered_at,
    scrapedAt: row.scraped_at,
    updatedAt: row.updated_at,
    seeds: row.seeds ?? null,
    leechers: row.leechers ?? null,
    peers: row.peers ?? null,
    swarmStatus: row.swarm_status ?? null,
    swarmSource: row.swarm_source ?? null,
    swarmFetchedAt: row.swarm_fetched_at ?? null,
  };
}

function computeItemTitles(item) {
  const rawTitle = (item.title && typeof item.title === 'string') ? item.title.trim() : 'Untitled';
  const topicTitle = item.topicTitle || item.sourceTitle || rawTitle;

  let canonicalTitle = item.canonicalTitle;
  let canonicalTitleRaw = item.canonicalTitleRaw || rawTitle;
  let releaseGroup = item.releaseGroup || null;

  if (!canonicalTitle) {
    const norm = normalizeCanonicalGameTitle(item.cleanTitle || canonicalTitleRaw, topicTitle);
    canonicalTitle = norm.canonicalTitle;
    if (!releaseGroup) releaseGroup = norm.releaseGroup;
  }

  const normalizedTitle = item.normalizedTitle || normalizeTitleForDedupe(canonicalTitle);
  const cleanTitle = canonicalTitle;
  const titleSort = normalizedTitle || canonicalTitle.toLowerCase();

  const magnet = item.magnet || item.magnetLink || (item.details && item.details.magnet) || null;
  const infoHash = item.infoHash || extractBTIH(magnet) || null;

  return {
    rawTitle,
    topicTitle,
    canonicalTitle,
    canonicalTitleRaw,
    normalizedTitle,
    cleanTitle,
    titleSort,
    infoHash,
    releaseGroup,
  };
}

function upsert(db, item) {
  if (!item || !item.id || !item.categoryId) return;
  const now = new Date().toISOString();
  const source = item.source || 'rutracker';
  const topicId = item.topicId ? String(item.topicId) : null;
  const titles = computeItemTitles(item);

  const stmt = db.prepare(`
    INSERT INTO items (
      id, category_id, source, topic_id,
      title, topic_title, canonical_title, normalized_title, clean_title, title_sort, info_hash, url,
      genre, developer, publisher, release_year, version, language, interface_language,
      voice_language, image_format, multiplayer, region, cover_url, size_str, size_bytes,
      has_cover, has_screenshots, has_magnet, is_favorite, discovered_at, scraped_at, updated_at
    ) VALUES (
      @id, @categoryId, @source, @topicId,
      @title, @topicTitle, @canonicalTitle, @normalizedTitle, @cleanTitle, @titleSort, @infoHash, @url,
      @genre, @developer, @publisher, @releaseYear, @version, @language, @interfaceLanguage,
      @voiceLanguage, @imageFormat, @multiplayer, @region, @coverUrl, @sizeStr, @sizeBytes,
      @hasCover, @hasScreenshots, @hasMagnet, @isFavorite, @discoveredAt, @scrapedAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      source = excluded.source,
      topic_id = COALESCE(excluded.topic_id, items.topic_id),
      title = excluded.title,
      topic_title = COALESCE(excluded.topic_title, items.topic_title),
      canonical_title = excluded.canonical_title,
      normalized_title = excluded.normalized_title,
      clean_title = excluded.clean_title,
      title_sort = excluded.title_sort,
      info_hash = COALESCE(excluded.info_hash, items.info_hash),
      url = COALESCE(excluded.url, items.url),
      genre = COALESCE(excluded.genre, items.genre),
      developer = COALESCE(excluded.developer, items.developer),
      publisher = COALESCE(excluded.publisher, items.publisher),
      release_year = COALESCE(excluded.release_year, items.release_year),
      version = COALESCE(excluded.version, items.version),
      language = COALESCE(excluded.language, items.language),
      interface_language = COALESCE(excluded.interface_language, items.interface_language),
      voice_language = COALESCE(excluded.voice_language, items.voice_language),
      image_format = COALESCE(excluded.image_format, items.image_format),
      multiplayer = COALESCE(excluded.multiplayer, items.multiplayer),
      region = COALESCE(excluded.region, items.region),
      cover_url = COALESCE(excluded.cover_url, items.cover_url),
      size_str = COALESCE(excluded.size_str, items.size_str),
      size_bytes = COALESCE(excluded.size_bytes, items.size_bytes),
      has_cover = excluded.has_cover,
      has_screenshots = excluded.has_screenshots,
      has_magnet = excluded.has_magnet,
      discovered_at = COALESCE(excluded.discovered_at, items.discovered_at),
      scraped_at = COALESCE(excluded.scraped_at, items.scraped_at),
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id: item.id,
    categoryId: item.categoryId,
    source,
    topicId,
    title: titles.rawTitle,
    topicTitle: titles.topicTitle,
    canonicalTitle: titles.canonicalTitle,
    normalizedTitle: titles.normalizedTitle,
    cleanTitle: titles.cleanTitle,
    titleSort: titles.titleSort,
    infoHash: titles.infoHash,
    url: item.url || item.sourceUrl || null,
    genre: item.genre || null,
    developer: item.developer || null,
    publisher: item.publisher || null,
    releaseYear: item.releaseYear || item.release_year || null,
    version: item.version || item.gameVersion || null,
    language: item.language || null,
    interfaceLanguage: item.interfaceLanguage || item.interface_language || null,
    voiceLanguage: item.voiceLanguage || item.voice_language || null,
    imageFormat: item.imageFormat || item.image_format || null,
    multiplayer: item.multiplayer || null,
    region: item.region || null,
    coverUrl: item.coverUrl || item.cover || (item.details && item.details.cover) || null,
    sizeStr: item.sizeStr || item.size || null,
    sizeBytes: item.sizeBytes || item.size_bytes || null,
    hasCover: (item.coverUrl || item.cover || (item.details && item.details.cover)) ? 1 : 0,
    hasScreenshots: (item.hasScreenshots || (item.screenshots && item.screenshots.length > 0) || (item.details && item.details.screenshots && item.details.screenshots.length > 0)) ? 1 : 0,
    hasMagnet: (item.hasMagnet || item.magnet || (item.details && item.details.magnet)) ? 1 : 0,
    isFavorite: item.isFavorite ? 1 : 0,
    discoveredAt: item.discoveredAt || item.discovered_at || now,
    scrapedAt: item.scrapedAt || item.scraped_at || now,
    updatedAt: now,
  });

  if (item.details || item.magnet || item.fileList || item.screenshots) {
    detailsRepo.upsert(db, item.id, item.details || item);
  }
}

function upsertBatch(db, items) {
  if (!items || !Array.isArray(items) || items.length === 0) return 0;

  const now = new Date().toISOString();
  const itemStmt = db.prepare(`
    INSERT INTO items (
      id, category_id, source, topic_id,
      title, topic_title, canonical_title, normalized_title, clean_title, title_sort, info_hash, url,
      genre, developer, publisher, release_year, version, language, interface_language,
      voice_language, image_format, multiplayer, region, cover_url, size_str, size_bytes,
      has_cover, has_screenshots, has_magnet, is_favorite, discovered_at, scraped_at, updated_at
    ) VALUES (
      @id, @categoryId, @source, @topicId,
      @title, @topicTitle, @canonicalTitle, @normalizedTitle, @cleanTitle, @titleSort, @infoHash, @url,
      @genre, @developer, @publisher, @releaseYear, @version, @language, @interfaceLanguage,
      @voiceLanguage, @imageFormat, @multiplayer, @region, @coverUrl, @sizeStr, @sizeBytes,
      @hasCover, @hasScreenshots, @hasMagnet, @isFavorite, @discoveredAt, @scrapedAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      source = excluded.source,
      topic_id = COALESCE(excluded.topic_id, items.topic_id),
      title = excluded.title,
      topic_title = COALESCE(excluded.topic_title, items.topic_title),
      canonical_title = excluded.canonical_title,
      normalized_title = excluded.normalized_title,
      clean_title = excluded.clean_title,
      title_sort = excluded.title_sort,
      info_hash = COALESCE(excluded.info_hash, items.info_hash),
      url = COALESCE(excluded.url, items.url),
      genre = COALESCE(excluded.genre, items.genre),
      developer = COALESCE(excluded.developer, items.developer),
      publisher = COALESCE(excluded.publisher, items.publisher),
      release_year = COALESCE(excluded.release_year, items.release_year),
      version = COALESCE(excluded.version, items.version),
      language = COALESCE(excluded.language, items.language),
      interface_language = COALESCE(excluded.interface_language, items.interface_language),
      voice_language = COALESCE(excluded.voice_language, items.voice_language),
      image_format = COALESCE(excluded.image_format, items.image_format),
      multiplayer = COALESCE(excluded.multiplayer, items.multiplayer),
      region = COALESCE(excluded.region, items.region),
      cover_url = COALESCE(excluded.cover_url, items.cover_url),
      size_str = COALESCE(excluded.size_str, items.size_str),
      size_bytes = COALESCE(excluded.size_bytes, items.size_bytes),
      has_cover = excluded.has_cover,
      has_screenshots = excluded.has_screenshots,
      has_magnet = excluded.has_magnet,
      discovered_at = COALESCE(excluded.discovered_at, items.discovered_at),
      scraped_at = COALESCE(excluded.scraped_at, items.scraped_at),
      updated_at = excluded.updated_at
  `);

  const detailsStmt = db.prepare(`
    INSERT INTO item_details (
      item_id, magnet, file_list_json, screenshots_json, source_json, scraping_json
    ) VALUES (
      @itemId, @magnet, @fileListJson, @screenshotsJson, @sourceJson, @scrapingJson
    )
    ON CONFLICT(item_id) DO UPDATE SET
      magnet = COALESCE(excluded.magnet, item_details.magnet),
      file_list_json = COALESCE(excluded.file_list_json, item_details.file_list_json),
      screenshots_json = COALESCE(excluded.screenshots_json, item_details.screenshots_json),
      source_json = COALESCE(excluded.source_json, item_details.source_json),
      scraping_json = COALESCE(excluded.scraping_json, item_details.scraping_json)
  `);

  const runTx = db.transaction((itemsList) => {
    let count = 0;
    for (const item of itemsList) {
      if (!item.id || !item.categoryId) continue;
      const source = item.source || 'rutracker';
      const topicId = item.topicId ? String(item.topicId) : null;
      const coverUrl = item.coverUrl || item.cover || null;
      const magnet = item.magnet || item.magnetLink || null;
      const screenshots = item.screenshots || (item.details && item.details.screenshots) || [];
      const fileList = item.fileList || (item.details && item.details.fileList) || null;
      const titles = computeItemTitles(item);

      itemStmt.run({
        id: item.id,
        categoryId: item.categoryId,
        source,
        topicId,
        title: titles.rawTitle,
        topicTitle: titles.topicTitle,
        canonicalTitle: titles.canonicalTitle,
        normalizedTitle: titles.normalizedTitle,
        cleanTitle: titles.cleanTitle,
        titleSort: titles.titleSort,
        infoHash: titles.infoHash,
        url: item.url || item.sourceUrl || null,
        genre: item.genre || null,
        developer: item.developer || null,
        publisher: item.publisher || null,
        releaseYear: item.releaseYear || item.release_year || null,
        version: item.version || item.gameVersion || null,
        language: item.language || null,
        interfaceLanguage: item.interfaceLanguage || item.interface_language || null,
        voiceLanguage: item.voiceLanguage || item.voice_language || null,
        imageFormat: item.imageFormat || item.image_format || null,
        multiplayer: item.multiplayer || null,
        region: item.region || null,
        coverUrl,
        sizeStr: item.sizeStr || item.size || null,
        sizeBytes: item.sizeBytes || item.size_bytes || item.fileListTotalSizeBytes || null,
        hasCover: coverUrl ? 1 : 0,
        hasScreenshots: screenshots.length > 0 ? 1 : 0,
        hasMagnet: magnet ? 1 : 0,
        isFavorite: item.isFavorite ? 1 : 0,
        discoveredAt: item.discoveredAt || item.discovered_at || now,
        scrapedAt: item.scrapedAt || item.scraped_at || now,
        updatedAt: now,
      });

      const details = item.details || {};
      detailsStmt.run({
        itemId: item.id,
        magnet: magnet || details.magnet || null,
        fileListJson: Array.isArray(fileList) ? JSON.stringify(fileList) : null,
        screenshotsJson: Array.isArray(screenshots) ? JSON.stringify(screenshots) : null,
        sourceJson: details.source ? JSON.stringify(details.source) : null,
        scrapingJson: details.scraping ? JSON.stringify(details.scraping) : null,
      });

      count++;
    }
    return count;
  });

  return runTx(items);
}

function deleteByCategory(db, categoryId) {
  if (!categoryId) return 0;
  const stmt = db.prepare('DELETE FROM items WHERE category_id = ?');
  const res = stmt.run(categoryId);
  return res.changes;
}

function countByCategory(db, categoryId) {
  if (!categoryId || categoryId === 'all') {
    const stmt = db.prepare('SELECT COUNT(*) as total FROM items');
    return stmt.get().total;
  }
  if (categoryId === 'favorites') {
    const stmt = db.prepare('SELECT COUNT(*) as total FROM items WHERE is_favorite = 1');
    return stmt.get().total;
  }
  const stmt = db.prepare('SELECT COUNT(*) as total FROM items WHERE category_id = ?');
  return stmt.get(categoryId).total;
}

function getPaginated(db, options = {}) {
  const isFavoritesCategory = options.categoryId === 'favorites' || Boolean(options.favoritesOnly);
  const categoryId = (options.categoryId === 'all' || options.categoryId === 'favorites') ? undefined : options.categoryId;
  const search = options.search ? options.search.trim() : null;
  const favoritesOnly = isFavoritesCategory;

  const minSeeds = Number.isFinite(options.minSeeds) ? Math.max(0, Math.floor(options.minSeeds)) : null;
  const maxSeeds = Number.isFinite(options.maxSeeds) ? Math.max(0, Math.floor(options.maxSeeds)) : null;
  const minLeechers = Number.isFinite(options.minLeechers) ? Math.max(0, Math.floor(options.minLeechers)) : null;
  const maxLeechers = Number.isFinite(options.maxLeechers) ? Math.max(0, Math.floor(options.maxLeechers)) : null;
  const hasSeeds = options.hasSeeds === true;
  const hasLeechers = options.hasLeechers === true;

  const yearFrom = Number.isFinite(options.yearFrom) ? Math.floor(options.yearFrom) : null;
  const yearTo = Number.isFinite(options.yearTo) ? Math.floor(options.yearTo) : null;
  const minSizeBytes = Number.isFinite(options.minSizeBytes) ? Math.max(0, Math.floor(options.minSizeBytes)) : null;
  const maxSizeBytes = Number.isFinite(options.maxSizeBytes) ? Math.max(0, Math.floor(options.maxSizeBytes)) : null;
  const hasMagnet = typeof options.hasMagnet === 'boolean' ? options.hasMagnet : null;
  const hasScreenshots = typeof options.hasScreenshots === 'boolean' ? options.hasScreenshots : null;
  const discoveredPreset = typeof options.discoveredPreset === 'string' ? options.discoveredPreset : null;

  const limitRaw = typeof options.limit === 'number' ? options.limit : 100;
  const limit = Math.min(Math.max(1, limitRaw), 500);
  const offset = typeof options.offset === 'number' && options.offset >= 0 ? options.offset : 0;

  const whereConditions = [];
  const params = [];

  if (categoryId) {
    whereConditions.push('category_id = ?');
    params.push(categoryId);
  }

  if (favoritesOnly) {
    whereConditions.push('is_favorite = 1');
  }

  if (search) {
    const escaped = escapeLike(search);
    const searchPattern = `%${escaped}%`;
    whereConditions.push(`(
      items.canonical_title LIKE ? ESCAPE '\\' OR
      items.topic_title LIKE ? ESCAPE '\\' OR
      items.title LIKE ? ESCAPE '\\' OR
      items.clean_title LIKE ? ESCAPE '\\' OR
      items.genre LIKE ? ESCAPE '\\' OR
      items.developer LIKE ? ESCAPE '\\' OR
      items.publisher LIKE ? ESCAPE '\\'
    )`);
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (hasSeeds) whereConditions.push('tm.seeds > 0');
  if (hasLeechers) whereConditions.push('tm.leechers > 0');
  if (minSeeds !== null) { whereConditions.push('tm.seeds >= ?'); params.push(minSeeds); }
  if (maxSeeds !== null) { whereConditions.push('tm.seeds <= ?'); params.push(maxSeeds); }
  if (minLeechers !== null) { whereConditions.push('tm.leechers >= ?'); params.push(minLeechers); }
  if (maxLeechers !== null) { whereConditions.push('tm.leechers <= ?'); params.push(maxLeechers); }

  if (yearFrom !== null) { whereConditions.push('items.release_year >= ?'); params.push(yearFrom); }
  if (yearTo !== null) { whereConditions.push('items.release_year <= ?'); params.push(yearTo); }
  if (minSizeBytes !== null) { whereConditions.push('items.size_bytes >= ?'); params.push(minSizeBytes); }
  if (maxSizeBytes !== null) { whereConditions.push('items.size_bytes <= ?'); params.push(maxSizeBytes); }
  if (hasMagnet !== null) { whereConditions.push('items.has_magnet = ?'); params.push(hasMagnet ? 1 : 0); }
  if (hasScreenshots !== null) { whereConditions.push('items.has_screenshots = ?'); params.push(hasScreenshots ? 1 : 0); }
  if (discoveredPreset && discoveredPreset !== 'all') {
    let days = null;
    if (discoveredPreset === '7d') days = 7;
    else if (discoveredPreset === '30d') days = 30;
    else if (discoveredPreset === '90d') days = 90;
    if (days !== null) {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      whereConditions.push('items.discovered_at >= ?');
      params.push(sinceDate);
    }
  }

  // V3-07 Metadata Facets (OR within facet, AND across facets)
  if (Array.isArray(options.developers) && options.developers.length > 0) {
    const devConditions = [];
    for (const dev of options.developers) {
      if (dev && typeof dev === 'string' && dev.trim()) {
        devConditions.push(`items.developer LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(dev.trim())}%`);
      }
    }
    if (devConditions.length > 0) {
      whereConditions.push(`(${devConditions.join(' OR ')})`);
    }
  }

  if (Array.isArray(options.publishers) && options.publishers.length > 0) {
    const pubConditions = [];
    for (const pub of options.publishers) {
      if (pub && typeof pub === 'string' && pub.trim()) {
        pubConditions.push(`items.publisher LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(pub.trim())}%`);
      }
    }
    if (pubConditions.length > 0) {
      whereConditions.push(`(${pubConditions.join(' OR ')})`);
    }
  }

  if (Array.isArray(options.genres) && options.genres.length > 0) {
    const genreConditions = [];
    for (const g of options.genres) {
      if (g && typeof g === 'string' && g.trim()) {
        genreConditions.push(`items.genre LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(g.trim())}%`);
      }
    }
    if (genreConditions.length > 0) {
      whereConditions.push(`(${genreConditions.join(' OR ')})`);
    }
  }

  if (Array.isArray(options.languages) && options.languages.length > 0) {
    const langConditions = [];
    for (const lang of options.languages) {
      if (lang && typeof lang === 'string' && lang.trim()) {
        langConditions.push(`(items.interface_language LIKE ? ESCAPE '\\' OR items.language LIKE ? ESCAPE '\\')`);
        const p = `%${escapeLike(lang.trim())}%`;
        params.push(p, p);
      }
    }
    if (langConditions.length > 0) {
      whereConditions.push(`(${langConditions.join(' OR ')})`);
    }
  }

  if (Array.isArray(options.imageFormats) && options.imageFormats.length > 0) {
    const fmtConditions = [];
    for (const fmt of options.imageFormats) {
      if (fmt && typeof fmt === 'string' && fmt.trim()) {
        fmtConditions.push(`items.image_format LIKE ? ESCAPE '\\'`);
        params.push(`%${escapeLike(fmt.trim().toUpperCase())}%`);
      }
    }
    if (fmtConditions.length > 0) {
      whereConditions.push(`(${fmtConditions.join(' OR ')})`);
    }
  }

  if (options.multiplayer === 'yes') {
    whereConditions.push(`(items.multiplayer = 'Yes' OR items.multiplayer = '1' OR items.multiplayer = 'true' OR items.multiplayer = 'да' OR (items.multiplayer IS NOT NULL AND LOWER(items.multiplayer) NOT IN ('no', '0', 'false', 'нет', 'none', 'отсутствует') AND (LOWER(items.multiplayer) LIKE '%yes%' OR LOWER(items.multiplayer) LIKE '%да%' OR LOWER(items.multiplayer) LIKE '%player%' OR LOWER(items.multiplayer) LIKE '%сетев%' OR LOWER(items.multiplayer) LIKE '%онлайн%' OR LOWER(items.multiplayer) LIKE '%coop%')))`);
  } else if (options.multiplayer === 'no') {
    whereConditions.push(`(items.multiplayer = 'No' OR items.multiplayer = '0' OR items.multiplayer = 'false' OR LOWER(items.multiplayer) IN ('no', '0', 'false', 'нет', 'none', 'отсутствует') OR LOWER(items.multiplayer) LIKE 'нет %')`);
  }

  if (Array.isArray(options.regions) && options.regions.length > 0) {
    const regConditions = [];
    for (const reg of options.regions) {
      if (reg && typeof reg === 'string' && reg.trim()) {
        regConditions.push(`(items.region = ? OR items.region LIKE ? ESCAPE '\\')`);
        params.push(reg.trim().toUpperCase(), `%${escapeLike(reg.trim().toUpperCase())}%`);
      }
    }
    if (regConditions.length > 0) {
      whereConditions.push(`(${regConditions.join(' OR ')})`);
    }
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Count total matching items
  const countSql = `SELECT COUNT(*) as total FROM items LEFT JOIN torrent_metadata tm ON tm.item_id = items.id ${whereSql}`;
  const countStmt = db.prepare(countSql);
  const total = countStmt.get(params).total;

  // Sorting
  const sortByKey = options.sortBy && SORT_COLUMNS[options.sortBy] ? options.sortBy : 'discoveredAt';
  const sortCol = SORT_COLUMNS[sortByKey];
  const sortOrder = options.sortOrder ? (options.sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC') : 'DESC';

  let orderSql = '';
  if (sortByKey === 'discoveredAt' || sortByKey === 'releaseYear' || sortByKey === 'sizeBytes' || sortByKey === 'seeds' || sortByKey === 'leechers') {
    // NULL handling: NULLs sorted last deterministically
    orderSql = `ORDER BY (${sortCol} IS NULL), ${sortCol} ${sortOrder}, COALESCE(items.canonical_title, items.title_sort) ASC, items.id ASC`;
  } else {
    orderSql = `ORDER BY ${sortCol} ${sortOrder}, items.id ASC`;
  }

  const itemsSql = `
    SELECT
      items.id, items.category_id, items.source, items.topic_id,
      items.title, items.topic_title, items.canonical_title, items.normalized_title,
      items.clean_title, items.title_sort, items.info_hash, items.url,
      items.genre, items.developer, items.publisher, items.release_year, items.language, items.interface_language,
      items.voice_language, items.image_format, items.multiplayer, items.cover_url, items.size_str, items.size_bytes,
      items.has_cover, items.has_screenshots, items.has_magnet, items.is_favorite, items.discovered_at, items.scraped_at, items.updated_at,
      item_details.magnet AS magnet,
      tm.seeds, tm.leechers, tm.peers, tm.swarm_status, tm.swarm_source, tm.swarm_fetched_at
    FROM items
    LEFT JOIN item_details ON item_details.item_id = items.id
    LEFT JOIN torrent_metadata tm ON tm.item_id = items.id
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;

  const itemsStmt = db.prepare(itemsSql);
  const rows = itemsStmt.all([...params, limit, offset]);
  const items = rows.map(normalizeRow);

  return {
    items,
    total,
    hasMore: offset + items.length < total,
    limit,
    offset,
  };
}

function getKnownTopicIds(db, source = 'rutracker', categoryId = null) {
  if (categoryId && categoryId !== 'all') {
    const stmt = db.prepare('SELECT topic_id FROM items WHERE source = ? AND category_id = ? AND topic_id IS NOT NULL');
    return stmt.all(source, categoryId).map(r => String(r.topic_id));
  }
  const stmt = db.prepare('SELECT topic_id FROM items WHERE source = ? AND topic_id IS NOT NULL');
  return stmt.all(source).map(r => String(r.topic_id));
}

function getTotalItemCount(db) {
  const stmt = db.prepare('SELECT COUNT(*) as total FROM items');
  return stmt.get().total;
}

/**
 * Find duplicate items for a candidate item
 * @param {import('better-sqlite3').Database} db
 * @param {object} item
 * @returns {Array<{ item: object, type: string }>}
 */
function findDuplicates(db, item) {
  if (!item) return [];
  const results = [];
  const titles = computeItemTitles(item);

  // 1. Check exact payload by infoHash (BTIH)
  if (titles.infoHash) {
    const stmt = db.prepare(`
      SELECT items.*, tm.seeds, tm.leechers
      FROM items
      LEFT JOIN torrent_metadata tm ON tm.item_id = items.id
      WHERE (items.info_hash = ? OR tm.info_hash = ?) AND items.id != ?
    `);
    const rows = stmt.all(titles.infoHash, titles.infoHash, item.id || '');
    for (const row of rows) {
      results.push({ item: normalizeRow(row), type: 'EXACT_PAYLOAD' });
    }
  }

  // 2. Check by normalized title + category
  if (titles.normalizedTitle) {
    const stmt = db.prepare(`
      SELECT items.*, tm.seeds, tm.leechers
      FROM items
      LEFT JOIN torrent_metadata tm ON tm.item_id = items.id
      WHERE items.normalized_title = ? AND items.id != ?
    `);
    const rows = stmt.all(titles.normalizedTitle, item.id || '');
    for (const row of rows) {
      const existing = normalizeRow(row);
      // Don't re-add if already found as EXACT_PAYLOAD
      if (!results.some(r => r.item.id === existing.id)) {
        const dupType = classifyDuplicates(item, existing);
        if (dupType !== 'DIFFERENT_GAME') {
          results.push({ item: existing, type: dupType });
        }
      }
    }
  }

  return results;
}

/**
 * Retrieve distinct metadata facets and aggregation counts for filtering.
 * Scoped to category if specified; otherwise global.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @returns {{
 *   developers: Array<{ value: string, count: number }>,
 *   publishers: Array<{ value: string, count: number }>,
 *   genres: Array<{ value: string, count: number }>,
 *   languages: Array<{ value: string, count: number }>,
 *   imageFormats: Array<{ value: string, count: number }>,
 *   regions: Array<{ value: string, count: number }>,
 *   multiplayer: { yes: number, no: number }
 * }}
 */
function getFilterFacets(db, options = {}) {
  const categoryId = options.categoryId === 'all' ? undefined : options.categoryId;
  const catClause = categoryId ? 'WHERE category_id = ?' : '';
  const catParams = categoryId ? [categoryId] : [];

  // Developers
  const devStmt = db.prepare(`
    SELECT developer, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} developer IS NOT NULL AND developer != ''
    GROUP BY developer
    ORDER BY count DESC, developer ASC
    LIMIT 200
  `);
  const devRows = devStmt.all(...catParams);
  const devMap = new Map();
  for (const r of devRows) {
    const parts = r.developer.split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) {
      devMap.set(r.developer, (devMap.get(r.developer) || 0) + r.count);
    } else {
      for (const p of parts) {
        devMap.set(p, (devMap.get(p) || 0) + r.count);
      }
    }
  }
  const developers = Array.from(devMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 100);

  // Publishers
  const pubStmt = db.prepare(`
    SELECT publisher, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} publisher IS NOT NULL AND publisher != ''
    GROUP BY publisher
    ORDER BY count DESC, publisher ASC
    LIMIT 200
  `);
  const pubRows = pubStmt.all(...catParams);
  const pubMap = new Map();
  for (const r of pubRows) {
    const parts = r.publisher.split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) {
      pubMap.set(r.publisher, (pubMap.get(r.publisher) || 0) + r.count);
    } else {
      for (const p of parts) {
        pubMap.set(p, (pubMap.get(p) || 0) + r.count);
      }
    }
  }
  const publishers = Array.from(pubMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 100);

  // Genres
  const genreStmt = db.prepare(`
    SELECT genre, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} genre IS NOT NULL AND genre != ''
    GROUP BY genre
    ORDER BY count DESC
    LIMIT 200
  `);
  const genreRows = genreStmt.all(...catParams);
  const genreMap = new Map();
  for (const r of genreRows) {
    const parts = r.genre.split(/[,;/|]+/).map(s => s.trim()).filter(Boolean);
    for (const g of parts) {
      genreMap.set(g, (genreMap.get(g) || 0) + r.count);
    }
  }
  const genres = Array.from(genreMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 100);

  // Languages
  const langStmt = db.prepare(`
    SELECT interface_language, language, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} (interface_language IS NOT NULL OR language IS NOT NULL)
    GROUP BY interface_language, language
    ORDER BY count DESC
    LIMIT 100
  `);
  const langRows = langStmt.all(...catParams);
  const langMap = new Map();
  for (const r of langRows) {
    const text = r.interface_language || r.language || '';
    const tokens = text.split(/[,;/| ]+/).map(s => s.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.length <= 10) {
        langMap.set(t, (langMap.get(t) || 0) + r.count);
      }
    }
  }
  const languages = Array.from(langMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 30);

  // Image Formats
  const fmtStmt = db.prepare(`
    SELECT image_format, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} image_format IS NOT NULL AND image_format != ''
    GROUP BY image_format
    ORDER BY count DESC
  `);
  const fmtRows = fmtStmt.all(...catParams);
  const fmtMap = new Map();
  for (const r of fmtRows) {
    const parts = r.image_format.split(/[,/ ]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    for (const f of parts) {
      fmtMap.set(f, (fmtMap.get(f) || 0) + r.count);
    }
  }
  const imageFormats = Array.from(fmtMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  // Regions
  const regStmt = db.prepare(`
    SELECT region, COUNT(*) as count
    FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} region IS NOT NULL AND region != ''
    GROUP BY region
    ORDER BY count DESC
  `);
  const regRows = regStmt.all(...catParams);
  const regMap = new Map();
  for (const r of regRows) {
    const parts = r.region.split(/[,/ ]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    for (const reg of parts) {
      regMap.set(reg, (regMap.get(reg) || 0) + r.count);
    }
  }
  const regions = Array.from(regMap.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  // Multiplayer
  const multiYesStmt = db.prepare(`
    SELECT COUNT(*) as total FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} (multiplayer = 'Yes' OR multiplayer = '1' OR multiplayer = 'true' OR multiplayer = 'да')
  `);
  const multiNoStmt = db.prepare(`
    SELECT COUNT(*) as total FROM items
    ${catClause ? catClause + ' AND' : 'WHERE'} (multiplayer = 'No' OR multiplayer = '0' OR multiplayer = 'false' OR multiplayer = 'нет')
  `);
  const multiplayer = {
    yes: multiYesStmt.get(...catParams).total,
    no: multiNoStmt.get(...catParams).total,
  };

  return {
    developers,
    publishers,
    genres,
    languages,
    imageFormats,
    regions,
    multiplayer,
  };
}

module.exports = {
  getById,
  upsert,
  upsertBatch,
  deleteByCategory,
  countByCategory,
  getPaginated,
  getFilterFacets,
  getKnownTopicIds,
  getTotalItemCount,
  findDuplicates,
  computeItemTitles,
};
