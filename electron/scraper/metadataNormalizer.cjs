/**
 * Catalog Data Quality & Metadata Enrichment (RT-Library V3-06)
 * Central metadata normalizer for RuTracker topics and catalog items.
 */

/**
 * Central dictionary mapping normalized field names to recognized Russian / English labels.
 */
const FIELD_LABELS = {
  releaseYear: [
    'год выпуска',
    'год выхода',
    'дата выпуска',
    'дата выхода',
    'год релиза',
    'год',
  ],
  genre: [
    'жанр',
  ],
  developer: [
    'разработчик',
    'разработчики',
  ],
  publisher: [
    'издатель',
    'издательство',
    'издатель в россии',
  ],
  version: [
    'версия игры',
    'версия',
    'версия прошивки',
    'патч / версия',
    'патч',
  ],
  interfaceLanguage: [
    'язык интерфейса',
    'язык интерфейса игры',
    'язык интерфейса/титров',
    'языки интерфейса',
    'язык',
  ],
  voiceLanguage: [
    'язык озвучки',
    'озвучка',
    'языки озвучки',
  ],
  imageFormat: [
    'формат образа',
    'формат дампа',
    'формат игры',
    'формат файла',
    'формат',
    'тип файлов',
    'тип образа',
    'вид раздачи',
  ],
  multiplayer: [
    'мультиплеер игры',
    'мультиплейер игры',
    'мультиплеер',
    'мультиплейер',
    'сетевой режим',
  ],
  region: [
    'регион',
    'регион игры',
    'region',
  ],
};

/**
 * Clean and collapse arbitrary raw text strings.
 * @param {string | any} raw
 * @returns {string | null}
 */
function cleanText(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') raw = String(raw);

  let val = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  val = val.replace(/^[:\s\-\=\[\]\(\)]+/, '').replace(/[:\s\-\=\[\]\(\)]+$/, '').trim();
  return val.length > 0 ? val : null;
}

/**
 * Normalizes release year into a 4-digit integer between 1970 and currentYear + 10.
 * @param {number | string | any} raw
 * @returns {number | null}
 */
function normalizeReleaseYear(raw) {
  if (raw === null || raw === undefined) return null;

  const currentMaxYear = new Date().getFullYear() + 10;
  const minYear = 1970;

  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw >= minYear && raw <= currentMaxYear) return raw;
    return null;
  }

  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\s*г\.?$/i, '').trim();
    if (/^\d{4}$/.test(cleaned)) {
      const parsed = parseInt(cleaned, 10);
      if (parsed >= minYear && parsed <= currentMaxYear) return parsed;
    }
    // Search for first 4-digit year match
    const match = cleaned.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= minYear && parsed <= currentMaxYear) return parsed;
    }
  }

  return null;
}

/**
 * Normalizes developer name(s).
 * @param {string | any} raw
 * @returns {{ raw: string | null, developer: string | null, developers: string[] }}
 */
function normalizeDeveloper(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, developer: null, developers: [] };
  }

  const developers = cleaned
    .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return {
    raw: cleaned,
    developer: cleaned,
    developers: developers.length > 0 ? developers : [cleaned],
  };
}

/**
 * Normalizes publisher name(s).
 * @param {string | any} raw
 * @returns {{ raw: string | null, publisher: string | null, publishers: string[] }}
 */
function normalizePublisher(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, publisher: null, publishers: [] };
  }

  const publishers = cleaned
    .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return {
    raw: cleaned,
    publisher: cleaned,
    publishers: publishers.length > 0 ? publishers : [cleaned],
  };
}

/**
 * Normalizes genre string and list without imposing artificial taxonomy.
 * @param {string | any} raw
 * @returns {{ raw: string | null, genre: string | null, genres: string[] }}
 */
function normalizeGenre(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, genre: null, genres: [] };
  }

  const genres = cleaned
    .split(/[,;/|]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Deduplicate genres case-insensitively while preserving original casing
  const uniqueGenres = [];
  const seen = new Set();
  for (const g of genres) {
    const key = g.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueGenres.push(g);
    }
  }

  return {
    raw: cleaned,
    genre: uniqueGenres.join(', '),
    genres: uniqueGenres,
  };
}

/**
 * Normalizes version string while preserving raw version.
 * @param {string | any} raw
 * @returns {{ raw: string | null, version: string | null }}
 */
function normalizeVersion(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, version: null };
  }

  // If prefixed with "v", "ver", "v." without extra letters, keep clean
  let norm = cleaned;
  const prefixMatch = norm.match(/^(?:v(?:er(?:sion)?)?\.?\s*)(\d+.*)$/i);
  if (prefixMatch) {
    norm = prefixMatch[1].trim();
  }

  return {
    raw: cleaned,
    version: norm || cleaned,
  };
}

/**
 * Language dictionary mapping known tokens to ISO-639-1 language codes.
 */
const LANGUAGE_TOKEN_MAP = [
  { code: 'en', patterns: [/\beng\b/i, /\benglish\b/i, /английский/i, /английская/i, /английском/i, /\bангл\b/i, /\ben\b/i] },
  { code: 'ru', patterns: [/\brus\b/i, /\brussian\b/i, /русский/i, /русская/i, /русском/i, /\bрус\b/i, /\bru\b/i, /russound/i] },
  { code: 'ja', patterns: [/\bjpn\b/i, /\bjap\b/i, /\bjapanese\b/i, /японский/i, /японская/i, /японском/i, /\bяп\b/i, /\bja\b/i] },
  { code: 'de', patterns: [/\bger\b/i, /\bdeu\b/i, /\bgerman\b/i, /немецкий/i, /немецкая/i, /немецком/i, /\bнем\b/i, /\bde\b/i] },
  { code: 'fr', patterns: [/\bfre\b/i, /\bfra\b/i, /\bfrench\b/i, /французский/i, /французская/i, /французском/i, /\bфр\b/i, /\bfr\b/i] },
  { code: 'es', patterns: [/\bspa\b/i, /\bspanish\b/i, /испанский/i, /испанская/i, /испанском/i, /\bисп\b/i, /\bes\b/i] },
  { code: 'it', patterns: [/\bita\b/i, /\bitalian\b/i, /итальянский/i, /итальянская/i, /итальянском/i, /\bит\b/i, /\bit\b/i] },
  { code: 'pt', patterns: [/\bpor\b/i, /\bportuguese\b/i, /португальский/i, /португальская/i, /португальском/i, /\bпорт\b/i, /\bpt\b/i, /pt-br/i, /\bbr\b/i] },
  { code: 'zh', patterns: [/\bchi\b/i, /\bzho\b/i, /\bchinese\b/i, /китайский/i, /китайская/i, /китайском/i, /\bкит\b/i, /\bzh\b/i] },
  { code: 'ko', patterns: [/\bkor\b/i, /\bkorean\b/i, /корейский/i, /корейская/i, /корейском/i, /\bкор\b/i, /\bko\b/i] },
  { code: 'pl', patterns: [/\bpol\b/i, /\bpolish\b/i, /польский/i, /польская/i, /польском/i, /\bpl\b/i] },
  { code: 'uk', patterns: [/\bukr\b/i, /\bukrainian\b/i, /украинский/i, /украинская/i, /украинском/i, /\buk\b/i] },
];

/**
 * Normalizes interface / subtitle languages into structured codes and raw text.
 * @param {string | any} raw
 * @returns {{ raw: string | null, codes: string[], display: string | null, unknown: string[] }}
 */
function normalizeLanguages(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, codes: [], display: null, unknown: [] };
  }

  const detectedCodes = [];
  const unknownTokens = [];

  // Match codes from the dictionary
  for (const entry of LANGUAGE_TOKEN_MAP) {
    if (entry.patterns.some(pat => pat.test(cleaned))) {
      if (!detectedCodes.includes(entry.code)) {
        detectedCodes.push(entry.code);
      }
    }
  }

  // Check for multi-language tokens without specific language breakdown (e.g. MULTI5, Multi, etc.)
  if (/multi\d*/i.test(cleaned) && detectedCodes.length === 0) {
    const multiMatch = cleaned.match(/multi\d*/i);
    if (multiMatch) {
      unknownTokens.push(multiMatch[0].toUpperCase());
    }
  }

  return {
    raw: cleaned,
    codes: detectedCodes,
    display: detectedCodes.length > 0 ? detectedCodes.join(', ') : cleaned,
    unknown: unknownTokens,
  };
}

/**
 * Normalizes voice / audio languages.
 * @param {string | any} raw
 * @returns {{ raw: string | null, codes: string[], display: string | null, unknown: string[] }}
 */
function normalizeAudio(raw) {
  return normalizeLanguages(raw);
}

/**
 * Normalizes image format (e.g. .NSZ -> NSZ, nsp -> NSP, ISO -> ISO).
 * @param {string | any} raw
 * @returns {string | null}
 */
function normalizeImageFormat(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;

  let norm = cleaned.replace(/^\.+/, '').trim().toUpperCase();

  // If multiple formats like "NSP, XCI", normalize each
  const parts = norm.split(/[,/ ]+/).map(p => p.replace(/^\.+/, '').trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.join(', ');
  }

  return norm.length > 0 ? norm : null;
}

/**
 * Normalizes multiplayer field into boolean | null.
 * @param {string | any} raw
 * @returns {{ raw: string | null, multiplayer: boolean | null }}
 */
function normalizeMultiplayer(raw) {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, multiplayer: null };
  }

  const lower = cleaned.toLowerCase();

  // Negative markers
  if (
    lower === 'нет' ||
    lower === 'no' ||
    lower === 'none' ||
    lower === 'отсутствует' ||
    lower === 'false' ||
    lower.startsWith('нет ')
  ) {
    return { raw: cleaned, multiplayer: false };
  }

  // Positive markers
  if (
    lower === 'да' ||
    lower === 'yes' ||
    lower === 'true' ||
    lower.includes('игрок') ||
    lower.includes('player') ||
    lower.includes('online') ||
    lower.includes('онлайн') ||
    lower.includes('сетев') ||
    lower.includes('локальн') ||
    lower.includes('coop') ||
    lower.includes('кооп') ||
    /\b\d+\s*[-x]\s*\d+\b/.test(lower) ||
    /\b\d+\b/.test(lower)
  ) {
    return { raw: cleaned, multiplayer: true };
  }

  return { raw: cleaned, multiplayer: null };
}

/**
 * Normalizes region (EUR, USA, JPN, etc.) from metadata or topic title.
 * Does not guess region from language.
 * @param {string | any} raw
 * @param {string} [topicTitle]
 * @returns {{ raw: string | null, region: string | null }}
 */
function normalizeRegion(raw, topicTitle = '') {
  const cleaned = cleanText(raw);
  const combined = [cleaned, topicTitle].filter(Boolean).join(' ');

  const KNOWN_REGIONS = [
    { name: 'EUR', pattern: /\b(?:eur|europe|европа|pal)\b/i },
    { name: 'USA', pattern: /\b(?:usa|us|ntsc-u|ntsc-us|ntsc)\b/i },
    { name: 'JPN', pattern: /\b(?:jpn|jap|japan|япония|ntsc-j)\b/i },
    { name: 'ASIA', pattern: /\b(?:asia|азия)\b/i },
    { name: 'WORLD', pattern: /\b(?:region\s*free|free|world|global)\b/i },
    { name: 'KOR', pattern: /\b(?:kor|korea|корея)\b/i },
  ];

  for (const r of KNOWN_REGIONS) {
    if (r.pattern.test(combined)) {
      return { raw: cleaned || r.name, region: r.name };
    }
  }

  return { raw: cleaned, region: cleaned ? cleaned.toUpperCase() : null };
}

/**
 * Comprehensive item metadata normalizer.
 * Normalizes all fields, preserving raw inputs and fail-soft semantics.
 * @param {Record<string, any>} item
 * @returns {Record<string, any>}
 */
function normalizeItemMetadata(item = {}) {
  const releaseYear = normalizeReleaseYear(item.releaseYear || item.release_year);
  const devNorm = normalizeDeveloper(item.developer);
  const pubNorm = normalizePublisher(item.publisher);
  const genreNorm = normalizeGenre(item.genre);
  const verNorm = normalizeVersion(item.version || item.gameVersion || item.game_version);
  const langNorm = normalizeLanguages(item.interfaceLanguage || item.interface_language || item.language);
  const audioNorm = normalizeAudio(item.voiceLanguage || item.voice_language || item.audio);
  const imageFormat = normalizeImageFormat(item.imageFormat || item.image_format);
  const multiNorm = normalizeMultiplayer(item.multiplayer);
  const regionNorm = normalizeRegion(item.region, item.topicTitle || item.title);

  return {
    releaseYear,
    developer: devNorm.developer,
    developerRaw: devNorm.raw,
    developers: devNorm.developers,
    publisher: pubNorm.publisher,
    publisherRaw: pubNorm.raw,
    publishers: pubNorm.publishers,
    genre: genreNorm.genre,
    genreRaw: genreNorm.raw,
    genres: genreNorm.genres,
    version: verNorm.version,
    versionRaw: verNorm.raw,
    language: langNorm.display || langNorm.raw,
    interfaceLanguage: langNorm.display || langNorm.raw,
    languageCodes: langNorm.codes,
    voiceLanguage: audioNorm.display || audioNorm.raw,
    audioLanguageCodes: audioNorm.codes,
    imageFormat,
    multiplayer: multiNorm.multiplayer !== null ? (multiNorm.multiplayer ? 'Yes' : 'No') : multiNorm.raw,
    multiplayerBoolean: multiNorm.multiplayer,
    multiplayerRaw: multiNorm.raw,
    region: regionNorm.region,
    regionRaw: regionNorm.raw,
  };
}

module.exports = {
  FIELD_LABELS,
  cleanText,
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
  normalizeItemMetadata,
};
