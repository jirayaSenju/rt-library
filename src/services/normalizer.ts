import { LibraryItem, RawItem, RawCategoryFile } from "../types";
import { normalizeCanonicalGameTitle, normalizeTitleForDedupe, extractBTIH } from "../utils/titleExtractor";

export function extractInfoHash(magnetUrl?: string): string | undefined {
  const hash = extractBTIH(magnetUrl);
  return hash || undefined;
}

export function parseCategoryHeader(
  filename: string,
  jsonContent: any
): { id: string; name: string; forumId?: string } {
  const fallbackId = filename.replace(/\.json$/i, "").toLowerCase();
  const fallbackName = fallbackId
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (
    jsonContent &&
    typeof jsonContent === "object" &&
    !Array.isArray(jsonContent)
  ) {
    const catObj = (jsonContent as RawCategoryFile).category;
    if (catObj && (catObj.id || catObj.name)) {
      return {
        id: catObj.id || fallbackId,
        name: catObj.name || fallbackName,
        forumId: catObj.forumId,
      };
    }
  }

  return {
    id: fallbackId,
    name: fallbackName,
  };
}

export function extractItemsList(jsonContent: any): RawItem[] {
  if (Array.isArray(jsonContent)) {
    return jsonContent;
  }
  if (
    jsonContent &&
    typeof jsonContent === "object" &&
    Array.isArray(jsonContent.items)
  ) {
    return jsonContent.items;
  }
  return [];
}

export function normalizeLanguage(lang?: string): string | undefined {
  if (!lang || typeof lang !== "string") return undefined;
  let str = lang.trim();
  const dict: Record<string, string> = {
    'русский': 'Russian',
    'русская': 'Russian',
    'английский': 'English',
    'английская': 'English',
    'японский': 'Japanese',
    'японская': 'Japanese',
    'немецкий': 'German',
    'немецкая': 'German',
    'французский': 'French',
    'французская': 'French',
    'испанский': 'Spanish',
    'испанская': 'Spanish',
    'итальянский': 'Italian',
    'итальянская': 'Italian',
    'корейский': 'Korean',
    'корейская': 'Korean',
    'китайский': 'Chinese',
    'китайская': 'Chinese',
    'португальский': 'Portuguese',
    'португальская': 'Portuguese',
    'польский': 'Polish',
    'польская': 'Polish',
    'голландский': 'Dutch',
    'голландская': 'Dutch',
    'арабский': 'Arabic',
    'арабская': 'Arabic'
  };

  for (const [ru, en] of Object.entries(dict)) {
    const reg = new RegExp(ru, 'gi');
    str = str.replace(reg, en);
  }
  return str;
}

export function normalizeMultiplayer(multi?: string): string | undefined {
  if (!multi || typeof multi !== "string") return undefined;
  const s = multi.trim().toLowerCase();
  if (s === 'да' || s === 'есть' || s.startsWith('да ') || s === 'yes') return 'Yes';
  if (s === 'нет' || s === 'no') return 'No';
  return multi.trim();
}

export function normalizeReleaseYear(year?: string | number): string | undefined {
  if (!year) return undefined;
  if (typeof year === 'number') return String(year);
  return year.replace(/\s*г\.?$/i, '').trim();
}

export function normalizeLibraryItem(
  raw: RawItem,
  fallbackCategoryId: string,
  fallbackCategoryName: string
): LibraryItem {
  const topicId =
    raw.topicId ||
    (raw.url ? raw.url.match(/t=(\d+)/)?.[1] : undefined);

  const id = raw.id || (topicId ? `topic_${topicId}` : `item_${Math.random().toString(36).substring(2)}`);

  const rawTitle = raw.title?.trim() || "Sem título";
  const topicTitle = (raw as any).topicTitle || (raw as any).sourceTitle || rawTitle;

  let canonicalTitle = (raw as any).canonicalTitle;
  let canonicalTitleRaw = (raw as any).canonicalTitleRaw || rawTitle;
  let releaseGroup = (raw as any).releaseGroup || undefined;

  if (!canonicalTitle) {
    const norm = normalizeCanonicalGameTitle((raw as any).cleanTitle || canonicalTitleRaw, topicTitle);
    canonicalTitle = norm.canonicalTitle;
    if (!releaseGroup && norm.releaseGroup) releaseGroup = norm.releaseGroup;
  }

  const normalizedTitle = (raw as any).normalizedTitle || normalizeTitleForDedupe(canonicalTitle);
  const cleanTitle = canonicalTitle;

  const cover =
    (raw.content?.cover && typeof raw.content.cover === "string")
      ? raw.content.cover
      : (typeof raw.cover === "string" ? raw.cover : undefined);

  const rawScreenshots = raw.content?.screenshots || raw.screenshots;
  const screenshots: string[] = Array.isArray(rawScreenshots)
    ? rawScreenshots.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const rawMagnet = raw.content?.magnet || raw.magnet;
  const magnet = typeof rawMagnet === "string" && rawMagnet.startsWith("magnet:") ? rawMagnet : undefined;

  const rawSize = raw.content?.size || raw.size;
  const size = (typeof rawSize === "string" && rawSize !== "N/A") ? rawSize : undefined;

  const infoHash = raw.infoHash || extractInfoHash(magnet);
  const sourceUrl = raw.url || undefined;
  const discoveredAt = raw.scraping?.discoveredAt || raw.content?.discoveredAt || raw.discoveredAt || raw.scrapedAt || raw.content?.scrapedAt || undefined;
  const titleSort = normalizedTitle || canonicalTitle.toLowerCase();

  const interfaceLang = normalizeLanguage(raw.interfaceLanguage || raw.language);
  const voiceLang = normalizeLanguage(raw.voiceLanguage);
  const releaseYear = normalizeReleaseYear(raw.releaseYear);
  const multiplayer = normalizeMultiplayer(raw.multiplayer);
  const fileList = raw.fileList || raw.content?.fileList || undefined;

  return {
    id,
    topicId,
    title: rawTitle,
    topicTitle,
    canonicalTitle,
    canonicalTitleRaw,
    normalizedTitle,
    cleanTitle,
    titleSort,
    releaseGroup,
    categoryId: fallbackCategoryId,
    categoryName: raw.source?.categoryName || (typeof raw.category === "string" ? raw.category : undefined) || fallbackCategoryName,
    sourceUrl,
    url: sourceUrl,
    baseUrl: sourceUrl,
    genre: raw.genre || undefined,
    version: raw.version || undefined,
    gameVersion: raw.version || undefined,
    language: interfaceLang,
    interfaceLanguage: interfaceLang,
    voiceLanguage: voiceLang,
    developer: raw.developer || undefined,
    publisher: raw.publisher || undefined,
    imageFormat: raw.imageFormat || undefined,
    multiplayer,
    releaseYear,
    fileList,
    cover: cover || undefined,
    coverImage: cover || undefined,
    screenshots,
    magnet,
    magnetLink: magnet,
    size,
    sizeBytes: (raw.sizeBytes ?? raw.content?.sizeBytes ?? (raw as any).fileListTotalSizeBytes) || undefined,
    scrapedAt: raw.scrapedAt || undefined,
    discoveredAt,
    infoHash,
    hasCover: Boolean(cover),
    hasScreenshots: screenshots.length > 0,
    hasMagnet: Boolean(magnet),
  };
}
