/**
 * Canonical Title Extraction, Title Normalization & Duplicate Classification
 * RT-Library V3-05 (TypeScript Frontend Port)
 */

export const KNOWN_PLATFORMS = [
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

export const KNOWN_FORMATS = [
  'nsz', 'nsp', 'xci', 'iso', 'wbfs', 'god', 'pkg', 'cia', 'cso', 'gcm',
  'cdi', 'gdi', 'rom', 'vpk', 'freeboot', 'jtag', 'cfi', 'eboot', 'chd',
  'cuesheet', 'bin/cue', 'rvz', 'wua', 'nkit', 'cxi',
];

export const KNOWN_LANGUAGES = [
  'russound', 'rus/eng', 'eng/rus', 'rus', 'eng', 'jap', 'kor', 'por', 'spa',
  'ger', 'fra', 'ita', 'multi', 'sound', 'text', 'subs', 'rus/sound', 'rus/text',
];

export const METADATA_LABELS = [
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

export function isReleaseQualifierToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim().toLowerCase().replace(/^\[|\]$|^\(|\)$/g, '').trim();
  if (!clean) return false;

  if (/^multi\d*$/i.test(clean)) return true;

  if (/^(?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi)(?:[\/+& -](?:rus|eng|jap|ger|fra|ita|spa|por|kor|chi|multi\d*))+$/i.test(clean)) {
    return true;
  }

  if (/^(?:v\d+[\d.]*|update\s*\d+[\d.]*|patch\s*\d+[\d.]*)$/i.test(clean)) {
    return true;
  }

  if (/^(?:repack|rip|scene|eshop|uncompressed|dlc|dlcs|fixed|proper|mod|undub|uncensored|beta|demo|remastered|hd|gold|goty|full)$/i.test(clean)) {
    return true;
  }

  if (KNOWN_PLATFORMS.includes(clean)) return true;
  if (KNOWN_FORMATS.includes(clean)) return true;
  if (KNOWN_LANGUAGES.includes(clean)) return true;

  if (/^(?:релиз|release|repack|сборка|rip)\s+(?:от|by)/i.test(clean)) return true;
  if (/^[lpdf]$/i.test(clean)) return true;

  return false;
}

export function normalizeCanonicalGameTitle(rawTitle: string, topicTitle: string = ''): {
  canonicalTitle: string;
  canonicalTitleRaw: string;
  releaseGroup: string | null;
  qualifiers: string[];
} {
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
  let releaseGroup: string | null = null;
  const qualifiers: string[] = [];

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

  if (!releaseGroup && topicTitle) {
    for (const regex of rgRegexes) {
      const match = topicTitle.match(regex);
      if (match) {
        releaseGroup = match[1].trim();
        break;
      }
    }
  }

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

  const words = title.split(/\s+/);
  const filteredWords: string[] = [];
  for (const word of words) {
    const cleanWord = word.replace(/^[\[\(]|[\)\]]$/g, '').trim();
    if (isReleaseQualifierToken(cleanWord) && (KNOWN_FORMATS.includes(cleanWord.toLowerCase()) || KNOWN_LANGUAGES.includes(cleanWord.toLowerCase()))) {
      qualifiers.push(cleanWord);
      continue;
    }
    filteredWords.push(word);
  }
  title = filteredWords.join(' ');

  title = title
    .replace(/^[:\s\-\=\/\|\+]+/, '')
    .replace(/[:\s\-\=\/\|\+]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

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

export function normalizeTitleForDedupe(str?: string | null): string {
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

export function extractBTIH(magnetUrl?: string | null): string | null {
  if (!magnetUrl || typeof magnetUrl !== 'string') return null;
  const match = magnetUrl.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (!match) return null;
  return match[1].toUpperCase();
}

export function extractCanonicalTitleFromDOM(docOrElement: any, topicTitle: string = ''): {
  canonicalTitle: string;
  canonicalTitleRaw: string;
  method: string;
  releaseGroup: string | null;
} {
  if (!docOrElement) {
    const norm = normalizeCanonicalGameTitle(topicTitle, topicTitle);
    return {
      canonicalTitle: norm.canonicalTitle,
      canonicalTitleRaw: topicTitle,
      method: 'TITLE_CANONICAL_FALLBACK',
      releaseGroup: norm.releaseGroup,
    };
  }

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

  const releaseYearMarkers = ['год выпуска', 'год', 'дата выпуска', 'дата выхода', 'год релиза'];
  const keyNodes = Array.from((postBody.querySelectorAll ? postBody.querySelectorAll('.post-b, b, strong, span') : []) as HTMLElement[]);
  let yearMarkerNode: HTMLElement | null = null;

  for (const node of keyNodes) {
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

  let extractedRawTitle: string | null = null;
  let method = 'before_release_year';

  if (yearMarkerNode) {
    const getCleanNodeText = (node: any) => {
      if (!node) return '';
      if (node.nodeType === 1) {
        const el = node as HTMLElement;
        if (el.classList && (el.classList.contains('sp-wrap') || el.classList.contains('q-wrap') || el.classList.contains('attach') || el.classList.contains('signature'))) {
          return '';
        }
        if (['IMG', 'BR', 'HR', 'SCRIPT', 'STYLE'].includes(el.tagName)) {
          return '';
        }
        const elText = (el.textContent || '').trim().toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
        if (METADATA_LABELS.includes(elText)) {
          return '';
        }
        return (el.textContent || '').trim();
      } else if (node.nodeType === 3) {
        return (node.textContent || '').trim();
      }
      return '';
    };

    const allPreceding: Array<{ node: any; text: string; isStyledHeading: boolean }> = [];
    const docContext = postBody.ownerDocument || docOrElement.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const treeWalker = docContext?.createTreeWalker
      ? docContext.createTreeWalker(postBody, 5, null, false)
      : null;

    if (treeWalker) {
      let currentNode = treeWalker.nextNode();
      while (currentNode) {
        if (currentNode === yearMarkerNode) break;
        if (currentNode.contains && currentNode.contains(yearMarkerNode)) {
          currentNode = treeWalker.nextNode();
          continue;
        }
        const text = getCleanNodeText(currentNode);
        if (text && text.length > 1) {
          const lower = text.toLowerCase().replace(/^[:\s]+|[:\s]+$/g, '');
          if (!METADATA_LABELS.some(lbl => lower === lbl || lower.startsWith(lbl + ':') || lower.startsWith(lbl + ' :'))) {
            let isStyledHeading = false;
            if (currentNode.nodeType === 1) {
              const el = currentNode as HTMLElement;
              const style = el.getAttribute ? (el.getAttribute('style') || '') : '';
              if (/font-size:\s*(?:2[0-9]|1[8-9]|[3-9][0-9])px/i.test(style) || ['H1', 'H2', 'H3', 'H4'].includes(el.tagName)) {
                isStyledHeading = true;
              }
            }
            allPreceding.push({ node: currentNode, text, isStyledHeading });
          }
        }
        currentNode = treeWalker.nextNode();
      }
    } else {
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

    const styledHeading = allPreceding.find(c => c.isStyledHeading);
    if (styledHeading && styledHeading.text) {
      extractedRawTitle = styledHeading.text;
      method = 'before_release_year_styled';
    } else if (allPreceding.length > 0) {
      const validCandidates = allPreceding.filter(c => c.text.length >= 2);
      if (validCandidates.length > 0) {
        extractedRawTitle = validCandidates[0].text;
        method = 'before_release_year';
      }
    }
  }

  if (!extractedRawTitle) {
    extractedRawTitle = topicTitle || 'Untitled';
    method = 'TITLE_CANONICAL_FALLBACK';
  }

  const firstLine = extractedRawTitle.split(/[\r\n]+/)[0].trim();
  const normalizedResult = normalizeCanonicalGameTitle(firstLine || extractedRawTitle, topicTitle);

  return {
    canonicalTitle: normalizedResult.canonicalTitle,
    canonicalTitleRaw: extractedRawTitle,
    method,
    releaseGroup: normalizedResult.releaseGroup,
  };
}

export function classifyDuplicates(
  a: { topicId?: string | null; source?: string | null; infoHash?: string | null; canonicalTitle?: string | null; normalizedTitle?: string | null; categoryId?: string | null; releaseGroup?: string | null; version?: string | null; sizeBytes?: number | null },
  b: { topicId?: string | null; source?: string | null; infoHash?: string | null; canonicalTitle?: string | null; normalizedTitle?: string | null; categoryId?: string | null; releaseGroup?: string | null; version?: string | null; sizeBytes?: number | null }
): 'EXACT_TOPIC' | 'EXACT_PAYLOAD' | 'SAME_RELEASE' | 'SAME_GAME_VARIANT' | 'DIFFERENT_GAME' {
  if (!a || !b) return 'DIFFERENT_GAME';

  const aTopic = a.topicId ? String(a.topicId) : null;
  const bTopic = b.topicId ? String(b.topicId) : null;
  const aSource = a.source || 'rutracker';
  const bSource = b.source || 'rutracker';

  if (aTopic && bTopic && aTopic === bTopic && aSource === bSource) {
    return 'EXACT_TOPIC';
  }

  const aHash = a.infoHash ? String(a.infoHash).toUpperCase() : null;
  const bHash = b.infoHash ? String(b.infoHash).toUpperCase() : null;

  if (aHash && bHash && aHash === bHash) {
    return 'EXACT_PAYLOAD';
  }

  const normA = a.normalizedTitle || normalizeTitleForDedupe(a.canonicalTitle || '');
  const normB = b.normalizedTitle || normalizeTitleForDedupe(b.canonicalTitle || '');

  if (!normA || !normB || normA !== normB) {
    return 'DIFFERENT_GAME';
  }

  const catA = a.categoryId ? String(a.categoryId).toLowerCase() : null;
  const catB = b.categoryId ? String(b.categoryId).toLowerCase() : null;

  if (catA && catB && catA !== catB) {
    return 'SAME_GAME_VARIANT';
  }

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
