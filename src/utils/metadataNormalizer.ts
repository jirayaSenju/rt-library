/**
 * Catalog Data Quality & Metadata Enrichment (RT-Library V3-06)
 * Central metadata normalizer for RuTracker topics and catalog items (TypeScript).
 */

export const FIELD_LABELS = {
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
} as const;

export function cleanText(raw: any): string | null {
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

export function normalizeReleaseYear(raw: any): number | null {
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
    const match = cleaned.match(/\b(19[7-9]\d|20[0-3]\d)\b/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= minYear && parsed <= currentMaxYear) return parsed;
    }
  }

  return null;
}

export function normalizeDeveloper(raw: any): { raw: string | null; developer: string | null; developers: string[] } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, developer: null, developers: [] };
  }

  const developers = cleaned
    .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    raw: cleaned,
    developer: cleaned,
    developers: developers.length > 0 ? developers : [cleaned],
  };
}

export function normalizePublisher(raw: any): { raw: string | null; publisher: string | null; publishers: string[] } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, publisher: null, publishers: [] };
  }

  const publishers = cleaned
    .split(/[,;/](?!\s*(?:inc|llc|ltd|corp|co\.)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    raw: cleaned,
    publisher: cleaned,
    publishers: publishers.length > 0 ? publishers : [cleaned],
  };
}

export function normalizeGenre(raw: any): { raw: string | null; genre: string | null; genres: string[] } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, genre: null, genres: [] };
  }

  const genres = cleaned
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const uniqueGenres: string[] = [];
  const seen = new Set<string>();
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

export function normalizeVersion(raw: any): { raw: string | null; version: string | null } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, version: null };
  }

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

export function normalizeLanguages(raw: any): { raw: string | null; codes: string[]; display: string | null; unknown: string[] } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, codes: [], display: null, unknown: [] };
  }

  const detectedCodes: string[] = [];
  const unknownTokens: string[] = [];

  for (const entry of LANGUAGE_TOKEN_MAP) {
    if (entry.patterns.some((pat) => pat.test(cleaned))) {
      if (!detectedCodes.includes(entry.code)) {
        detectedCodes.push(entry.code);
      }
    }
  }

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

export function normalizeAudio(raw: any): { raw: string | null; codes: string[]; display: string | null; unknown: string[] } {
  return normalizeLanguages(raw);
}

export function normalizeImageFormat(raw: any): string | null {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;

  const norm = cleaned.replace(/^\.+/, '').trim().toUpperCase();
  const parts = norm.split(/[,/ ]+/).map((p) => p.replace(/^\.+/, '').trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.join(', ');
  }

  return norm.length > 0 ? norm : null;
}

export function normalizeMultiplayer(raw: any): { raw: string | null; multiplayer: boolean | null } {
  const cleaned = cleanText(raw);
  if (!cleaned) {
    return { raw: null, multiplayer: null };
  }

  const lower = cleaned.toLowerCase();

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

export function normalizeRegion(raw: any, topicTitle = ''): { raw: string | null; region: string | null } {
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

export function normalizeItemMetadata(item: Record<string, any> = {}): Record<string, any> {
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
