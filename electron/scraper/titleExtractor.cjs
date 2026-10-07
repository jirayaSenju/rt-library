/**
 * Canonical Title Extraction, Title Normalization & Duplicate Classification
 * RT-Library V3-05
 */

/**
 * Release qualifier dictionary and regex patterns
 */
const KNOWN_PLATFORMS = [
  'nintendo switch', 'switch', 'ns',
  'playstation 1', 'playstation 2', 'playstation 3', 'playstation 4', 'playstation 5',
  'ps1', 'psx', 'ps2', 'ps3', 'ps4', 'ps5', 'psp', 'ps vita', 'psvita', 'psv',
  'xbox 360', 'xbox360', 'x360', 'original xbox', 'xbox',
  'nintendo wii u', 'nintendo wii', 'wii u', 'wiiu', 'wii',
  'nintendo gamecube', 'gamecube', 'ngc', 'gc',
  'nintendo 3ds', 'nintendo ds', '3ds', 'nds', 'ds',
  'sega dreamcast', 'dreamcast', 'dc',
  'pc', 'windows',
];

const KNOWN_FORMATS = [
  'nsz', 'nsp', 'xci', 'iso', 'wbfs', 'god', 'pkg', 'cia', 'cso', 'gcm',
  'cdi', 'gdi', 'rom', 'vpk', 'freeboot', 'jtag', 'cfi', 'eboot', 'chd',
  'cuesheet', 'bin/cue', 'rvz', 'wua', 'nkit', 'cxi',
];

const KNOWN_LANGUAGES = [
  'russound', 'rus/eng', 'eng/rus', 'rus', 'eng', 'jap', 'kor', 'por', 'spa',
  'ger', 'fra', 'ita', 'multi', 'sound', 'text', 'subs', 'rus/sound', 'rus/text',
];

const METADATA_LABELS = [
  'год выпуска', 'год', 'дата выпуска', 'дата выхода', 'год релиза',
  'жанр', 'разработчик', 'издатель', 'издательство', 'издатель в россии',
  'формат', 'формат образа', 'формат дампа', 'формат игры', 'формат файла', 'тип образа', 'вид раздачи',
  'мультиплеер', 'мультиплеер игры', 'мультиплейер игры', 'сетевой режим',
  'язык интерфейса', 'язык интерфейса игры', 'язык', 'языки интерфейса',
  'язык озвучки', 'озвучка', 'версия', 'версия игры', 'версия прошивки',
  'размер', 'описание', 'типы изданий', 'тип издания', 'таблетка',
  'системные требования', 'требуемая версия прошивки', 'работоспособность проверена',
  'код диска', 'регион', 'прошивка', 'платформа',
];

/**
 * Checks if a string inside brackets/parentheses is a technical release qualifier
 * @param {string} token
 * @returns {boolean}
 */
function isReleaseQualifierToken(token) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim().toLowerCase().replace(/^\[|\]$|^\(|\)$/g, '').trim();
  if (!clean) return false;

  // Multi-language patterns like MULTI5, MULTi7, MULTI12
  if (/^multi\d*$/i.test(clean)) return true;

  // Language combinations like RUS+ENG, RUS/ENG, RUS/ENG/MULTI
  if (/^(?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi)(?:[\/+& -](?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi|multi\d*))+$/i.test(clean)) {
    return true;
  }

  // Version numbers like v1.0, v1.0.4, update 1.2
  if (/^(?:v\d+[\d.]*|update\s*\d+[\d.]*|patch\s*\d+[\d.]*)$/i.test(clean)) {
    return true;
  }

  // Edition qualifiers like Repack, Rip, Scene, GOTY, Deluxe Edition, Complete Edition
  if (/^(?:repack|rip|scene|eshop|uncompressed|dlc|dlcs|fixed|proper|mod|undub|uncensored|beta|demo|remastered|hd|gold|goty|full)$/i.test(clean)) {
    return true;
  }

  // Known platforms
  if (KNOWN_PLATFORMS.includes(clean)) return true;

  // Known formats
  if (KNOWN_FORMATS.includes(clean)) return true;

  // Known language tags
  if (KNOWN_LANGUAGES.includes(clean)) return true;

  // Release group pattern like "Релиз от R.G. ..." or "Release by ..."
  if (/^(?:релиз|release|repack|сборка|rip)\s+(?:от|by)/i.test(clean)) return true;

  // License / Dump tags like [L], [P], [D], [F], [RUS], [ENG]
  if (/^[lpdf]$/i.test(clean)) return true;

  return false;
}

/**
 * Normalizes raw canonical game title by stripping technical release qualifiers,
 * while preserving valid game subtitles, colons, slashes and internal punctuation.
 * @param {string} rawTitle
 * @param {string} [topicTitle]
 * @returns {{ canonicalTitle: string, canonicalTitleRaw: string, releaseGroup: string | null, qualifiers: string[] }}
 */
function normalizeCanonicalGameTitle(rawTitle, topicTitle = '') {
  const canonicalTitleRaw = (rawTitle && typeof rawTitle === 'string' ? rawTitle : (topicTitle || '')).trim();
  if (!canonicalTitleRaw) {
    return {
      canonicalTitle: 'Untitled',
      canonicalTitleRaw: '',
      releaseGroup: null,
      qualifiers: [],
    };
  }

  let title = canonicalTitleRaw;
  let releaseGroup = null;
  const qualifiers = [];

  // 1. Extract and remove Release Group patterns like "(Релиз от R.G.DShock)", "[Release by FLT]", "Релиз от XXX"
  const rgRegexes = [
    /\((?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([^)]+)\)/i,
    /\[(?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([^\]]+)\]/i,
    /(?:релиз|release|repack|сборка|rip)\s+(?:от|by)\s+([A-Za-z0-9._-]+)/i,
  ];

  for (const regex of rgRegexes) {
    const match = title.match(regex);
    if (match) {
      releaseGroup = match[1].trim();
      title = title.replace(match[0], ' ');
      qualifiers.push(match[0].trim());
      break;
    }
  }

  // Also check topicTitle for release group if not found in rawTitle
  if (!releaseGroup && topicTitle) {
    for (const regex of rgRegexes) {
      const match = topicTitle.match(regex);
      if (match) {
        releaseGroup = match[1].trim();
        break;
      }
    }
  }

  // 2. Strip bracketed / parenthesized tokens that are recognized release qualifiers
  // Match [token] or (token)
  title = title.replace(/\[([^\]]+)\]/g, (fullMatch, content) => {
    if (isReleaseQualifierToken(content)) {
      qualifiers.push(content.trim());
      return ' ';
    }
    return fullMatch;
  });

  title = title.replace(/\(([^)]+)\)/g, (fullMatch, content) => {
    if (isReleaseQualifierToken(content)) {
      qualifiers.push(content.trim());
      return ' ';
    }
    return fullMatch;
  });

  // 3. Strip leading platform / release prefixes like "FREEBOOT", "JTAG", "GOD" if standing alone
  const words = title.split(/\s+/);
  const filteredWords = [];
  for (const word of words) {
    const cleanWord = word.replace(/^[\[\(]|[\)\]]$/g, '').trim();
    if (isReleaseQualifierToken(cleanWord) && (KNOWN_FORMATS.includes(cleanWord.toLowerCase()) || KNOWN_LANGUAGES.includes(cleanWord.toLowerCase()))) {
      qualifiers.push(cleanWord);
      continue;
    }
    filteredWords.push(word);
  }
  title = filteredWords.join(' ');

  // 4. Clean trailing / leading noise and separators (colons, dashes, slashes at boundaries)
  title = title
    .replace(/^[:\s\-\=\/\|\+]+/, '')
    .replace(/[:\s\-\=\/\|\+]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If over-cleaned to empty, fallback to raw title without outer brackets
  if (!title) {
    title = canonicalTitleRaw.replace(/^\[[^\]]+\]\s*/, '').trim() || canonicalTitleRaw;
  }

  return {
    canonicalTitle: title,
    canonicalTitleRaw,
    releaseGroup,
    qualifiers,
  };
}

/**
 * Normalizes title string for unicode comparisons and deduplication
 * @param {string} str
 * @returns {string}
 */
function normalizeTitleForDedupe(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"’`]/g, '')
    .replace(/[^a-z0-9\u0400-\u04FF]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts BTIH (info hash) from magnet link
 * @param {string} [magnetUrl]
 * @returns {string | null}
 */
function extractBTIH(magnetUrl) {
  if (!magnetUrl || typeof magnetUrl !== 'string') return null;
  const match = magnetUrl.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (!match) return null;
  return match[1].toUpperCase();
}

/**
 * Robust DOM extraction of canonical game title from RuTracker topic page DOM.
 * Primary rule: The canonical game title is extracted from the first post_body content
 * immediately preceding the first "Год выпуска" (release year) field.
 *
 * @param {Document | Element} docOrElement
 * @param {string} [topicTitle]
 * @returns {{ canonicalTitle: string, canonicalTitleRaw: string, method: string, releaseGroup: string | null }}
 */
function extractCanonicalTitleFromDOM(docOrElement, topicTitle = '') {
  if (!docOrElement) {
    const norm = normalizeCanonicalGameTitle(topicTitle, topicTitle);
    return {
      canonicalTitle: norm.canonicalTitle,
      canonicalTitleRaw: topicTitle,
      method: 'TITLE_CANONICAL_FALLBACK',
      releaseGroup: norm.releaseGroup,
    };
  }

  // 1. Locate the main topic's post_body
  const postBody = docOrElement.querySelector ? (docOrElement.querySelector('.post_body') || docOrElement) : docOrElement;
  if (!postBody) {
    const norm = normalizeCanonicalGameTitle(topicTitle, topicTitle);
    return {
      canonicalTitle: norm.canonicalTitle,
      canonicalTitleRaw: topicTitle,
      method: 'TITLE_CANONICAL_FALLBACK',
      releaseGroup: norm.releaseGroup,
    };
  }

  // Clone postBody or filter out quotes and spoilers
  // Note: in browser DOM we can query excluding .sp-wrap and .q-wrap
  const releaseYearMarkers = ['год выпуска', 'год', 'дата выпуска', 'дата выхода', 'год релиза'];

  // Locate candidate elements matching release year marker
  const keyNodes = Array.from(postBody.querySelectorAll('.post-b, b, strong, span'));
  let yearMarkerNode = null;

  for (const node of keyNodes) {
    // Skip if inside a spoiler (.sp-wrap), quote (.q-wrap) or signature
    if (node.closest && (node.closest('.sp-wrap') || node.closest('.q-wrap') || node.closest('.signature'))) {
      continue;
    }
    const text = (node.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
    if (releaseYearMarkers.includes(text)) {
      yearMarkerNode = node;
      break;
    }
  }

  if (!yearMarkerNode) {
    // Fallback: search by textContent containing 'Год выпуска'
    for (const node of keyNodes) {
      if (node.closest && (node.closest('.sp-wrap') || node.closest('.q-wrap') || node.closest('.signature'))) {
        continue;
      }
      const text = (node.textContent || '').trim().toLowerCase();
      if (text.startsWith('год выпуска') || text.startsWith('дата выпуска') || text.startsWith('дата выхода')) {
        yearMarkerNode = node;
        break;
      }
    }
  }

  let extractedRawTitle = null;
  let method = 'before_release_year';

  if (yearMarkerNode) {
    // Collect all child nodes / elements of postBody that appear before yearMarkerNode in DOM order
    // Strategy: traverse backwards from yearMarkerNode or inspect previous siblings
    let candidateTexts = [];

    // Helper to extract clean text from a node
    const getCleanNodeText = (node) => {
      if (!node) return '';
      // Ignore spoilers, quotes, images, breaks
      if (node.nodeType === 1) { // Element
        const el = node;
        if (el.classList && (el.classList.contains('sp-wrap') || el.classList.contains('q-wrap') || el.classList.contains('attach') || el.classList.contains('signature'))) {
          return '';
        }
        if (['IMG', 'BR', 'HR', 'SCRIPT', 'STYLE'].includes(el.tagName)) {
          return '';
        }
        // Check if element is another metadata label like Жанр, Разработчик
        const elText = (el.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
        if (METADATA_LABELS.includes(elText)) {
          return '';
        }
        return (el.textContent || '').trim();
      } else if (node.nodeType === 3) { // Text node
        return (node.textContent || '').trim();
      }
      return '';
    };

    // 1. Look for styled title elements before year marker (e.g. font-size: 24px, 18px, h1-h4)
    const allPreceding = [];
    const treeWalker = (postBody.ownerDocument || docOrElement.ownerDocument || (typeof document !== 'undefined' ? document : null))?.createTreeWalker
      ? (postBody.ownerDocument || docOrElement.ownerDocument || document).createTreeWalker(postBody, 5 /* NodeFilter.SHOW_ELEMENT | SHOW_TEXT */, null, false)
      : null;

    if (treeWalker) {
      let currentNode = treeWalker.nextNode();
      while (currentNode) {
        if (currentNode === yearMarkerNode) break;
        // Check if yearMarkerNode is inside currentNode
        if (currentNode.contains && currentNode.contains(yearMarkerNode)) {
          currentNode = treeWalker.nextNode();
          continue;
        }

        const text = getCleanNodeText(currentNode);
        if (text && text.length > 1) {
          // Check if it's not a metadata keyword
          const lower = text.toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
          if (!METADATA_LABELS.some(lbl => lower === lbl || lower.startsWith(lbl + ':') || lower.startsWith(lbl + ' :'))) {
            // Check for large font / heading styling
            let isStyledHeading = false;
            if (currentNode.nodeType === 1) {
              const style = currentNode.getAttribute ? (currentNode.getAttribute('style') || '') : '';
              if (/font-size:\s*(?:2[0-9]|1[8-9]|[3-9][0-9])px/i.test(style) || ['H1', 'H2', 'H3', 'H4'].includes(currentNode.tagName)) {
                isStyledHeading = true;
              }
            }
            allPreceding.push({ node: currentNode, text, isStyledHeading });
          }
        }
        currentNode = treeWalker.nextNode();
      }
    } else {
      // Fallback for simple DOM tree: inspect siblings and children
      let curr = yearMarkerNode.previousSibling;
      while (curr) {
        const text = getCleanNodeText(curr);
        if (text && text.length > 1) {
          const lower = text.toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
          if (!METADATA_LABELS.some(lbl => lower === lbl || lower.startsWith(lbl + ':'))) {
            allPreceding.unshift({ node: curr, text, isStyledHeading: false });
          }
        }
        curr = curr.previousSibling;
      }
    }

    // Priority 1: Styled heading element found before year marker
    const styledHeading = allPreceding.find(c => c.isStyledHeading);
    if (styledHeading && styledHeading.text) {
      extractedRawTitle = styledHeading.text;
      method = 'before_release_year_styled';
    } else if (allPreceding.length > 0) {
      // Priority 2: Take the first prominent or closest preceding text block
      // Filter candidates with substantial text (not single letters/punctuation)
      const validCandidates = allPreceding.filter(c => c.text.length >= 2);
      if (validCandidates.length > 0) {
        // Look for the first element/text in the post body before images/metadata
        extractedRawTitle = validCandidates[0].text;
        method = 'before_release_year';
      }
    }
  }

  if (!extractedRawTitle) {
    // Fallback: clean topicTitle
    extractedRawTitle = topicTitle || 'Untitled';
    method = 'TITLE_CANONICAL_FALLBACK';
  }

  // Clean lines within extracted title (in case multi-line string was captured)
  const firstLine = extractedRawTitle.split(/[\r\n]+/)[0].trim();
  const normalizedResult = normalizeCanonicalGameTitle(firstLine || extractedRawTitle, topicTitle);

  return {
    canonicalTitle: normalizedResult.canonicalTitle,
    canonicalTitleRaw: extractedRawTitle,
    method,
    releaseGroup: normalizedResult.releaseGroup,
  };
}

/**
 * Duplicate Classification
 * Classifies the relationship between two catalog items
 *
 * @param {{ topicId?: string, source?: string, infoHash?: string, canonicalTitle?: string, normalizedTitle?: string, categoryId?: string, releaseGroup?: string, version?: string, sizeBytes?: number }} a
 * @param {{ topicId?: string, source?: string, infoHash?: string, canonicalTitle?: string, normalizedTitle?: string, categoryId?: string, releaseGroup?: string, version?: string, sizeBytes?: number }} b
 * @returns {'EXACT_TOPIC' | 'EXACT_PAYLOAD' | 'SAME_RELEASE' | 'SAME_GAME_VARIANT' | 'DIFFERENT_GAME'}
 */
function classifyDuplicates(a, b) {
  if (!a || !b) return 'DIFFERENT_GAME';

  // 1. EXACT_TOPIC: same source + same topicId
  const aTopic = a.topicId ? String(a.topicId) : null;
  const bTopic = b.topicId ? String(b.topicId) : null;
  const aSource = a.source || 'rutracker';
  const bSource = b.source || 'rutracker';

  if (aTopic && bTopic && aTopic === bTopic && aSource === bSource) {
    return 'EXACT_TOPIC';
  }

  // 2. EXACT_PAYLOAD: different topicId + identical BTIH infoHash
  const aHash = a.infoHash ? String(a.infoHash).toUpperCase() : null;
  const bHash = b.infoHash ? String(b.infoHash).toUpperCase() : null;

  if (aHash && bHash && aHash === bHash) {
    return 'EXACT_PAYLOAD';
  }

  // Compare normalized titles
  const normA = a.normalizedTitle || normalizeTitleForDedupe(a.canonicalTitle || '');
  const normB = b.normalizedTitle || normalizeTitleForDedupe(b.canonicalTitle || '');

  if (!normA || !normB || normA !== normB) {
    return 'DIFFERENT_GAME';
  }

  // Same normalized title - check platform / category
  const catA = a.categoryId ? String(a.categoryId).toLowerCase() : null;
  const catB = b.categoryId ? String(b.categoryId).toLowerCase() : null;

  if (catA && catB && catA !== catB) {
    return 'SAME_GAME_VARIANT'; // Same game on different platform (e.g. PS2 vs Xbox)
  }

  // Check version / release group / edition
  const verA = a.version ? String(a.version).trim().toLowerCase() : null;
  const verB = b.version ? String(b.version).trim().toLowerCase() : null;
  const rgA = a.releaseGroup ? String(a.releaseGroup).trim().toLowerCase() : null;
  const rgB = b.releaseGroup ? String(b.releaseGroup).trim().toLowerCase() : null;

  const sizeA = typeof a.sizeBytes === 'number' && a.sizeBytes > 0 ? a.sizeBytes : null;
  const sizeB = typeof b.sizeBytes === 'number' && b.sizeBytes > 0 ? b.sizeBytes : null;
  const isSizeNear = sizeA && sizeB ? Math.abs(sizeA - sizeB) / Math.max(sizeA, sizeB) < 0.05 : false;

  if (verA === verB && rgA === rgB && (isSizeNear || (!sizeA && !sizeB))) {
    return 'SAME_RELEASE';
  }

  return 'SAME_GAME_VARIANT';
}

module.exports = {
  KNOWN_PLATFORMS,
  KNOWN_FORMATS,
  KNOWN_LANGUAGES,
  METADATA_LABELS,
  isReleaseQualifierToken,
  normalizeCanonicalGameTitle,
  normalizeTitleForDedupe,
  extractBTIH,
  extractCanonicalTitleFromDOM,
  classifyDuplicates,
};
