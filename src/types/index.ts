export type LibrarySort = 'title' | 'discoveredAt' | 'releaseYear' | 'size' | 'sizeBytes' | 'seeders' | 'seeds' | 'leechers' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface LibraryItem {
  id: string;
  topicId?: string;
  title: string;
  topicTitle?: string;
  canonicalTitle?: string;
  canonicalTitleRaw?: string;
  normalizedTitle?: string;
  cleanTitle?: string;
  titleSort?: string;
  releaseGroup?: string;
  categoryId: string;
  categoryName: string;
  sourceUrl?: string;
  url?: string;
  baseUrl?: string;
  genre?: string;
  version?: string;
  gameVersion?: string;
  language?: string;
  interfaceLanguage?: string;
  voiceLanguage?: string;
  developer?: string;
  publisher?: string;
  imageFormat?: string;
  multiplayer?: string;
  region?: string;
  releaseYear?: string;
  fileList?: string;
  cover?: string;
  coverImage?: string;
  screenshots?: string[];
  magnet?: string;
  magnetLink?: string;
  size?: string;
  sizeBytes?: number;
  fileCount?: number;
  fileListTotalSizeBytes?: number;
  fileListSource?: string;
  seeders?: number;
  leechers?: number;
  scrapedAt?: string;
  discoveredAt?: string;
  infoHash?: string;
  hasCover?: boolean;
  hasScreenshots?: boolean;
  hasMagnet?: boolean;
  torrent?: TorrentMetadata;
}

export interface RawItem {
  id?: string;
  topicId?: string;
  title?: string;
  topicTitle?: string;
  canonicalTitle?: string;
  canonicalTitleRaw?: string;
  normalizedTitle?: string;
  releaseGroup?: string;
  infoHash?: string;
  url?: string;
  category?: string;
  genre?: string;
  version?: string;
  language?: string;
  interfaceLanguage?: string;
  voiceLanguage?: string;
  developer?: string;
  publisher?: string;
  imageFormat?: string;
  multiplayer?: string;
  region?: string;
  releaseYear?: string;
  fileList?: any;
  scrapedAt?: string;
  discoveredAt?: string;
  scraping?: {
    discoveredAt?: string;
    scrapedAt?: string;
  };
  cover?: string;
  screenshots?: string[];
  magnet?: string;
  size?: string;
  sizeBytes?: number;
  fileListTotalSizeBytes?: number;
  content?: {
    cover?: string | null;
    screenshots?: string[] | null;
    magnet?: string | null;
    size?: string | null;
    sizeBytes?: number | null;
    fileList?: string | null;
    discoveredAt?: string | null;
    scrapedAt?: string | null;
  };
  source?: {
    category?: string;
    categoryName?: string;
    forumId?: string;
    pageUrl?: string;
  };
}

export interface RawCategoryFile {
  id?: string;
  schemaVersion?: number;
  category?: {
    id?: string;
    name?: string;
    forumId?: string;
    url?: string;
  };
  items?: RawItem[];
}

export interface Category {
  id: string;
  name: string;
  forumId?: string;
  filePath: string;
  itemCount: number;
  count: number;
  fileMtime: number;
  fileSize: number;
  contentHash: string;
  lastIndexedAt: string;
}

export interface TorrentMetadata {
  infoHash: string;
  name?: string;
  totalSize?: number;
  totalSizeFormatted?: string;
  fileCount?: number;
  files: TorrentFile[];
  seeders?: number | null;
  leechers?: number | null;
  trackers: string[];
  metadataUpdatedAt?: string;
  peerStatsUpdatedAt?: string;
  status: 'pending' | 'fetching' | 'available' | 'unavailable' | 'error';
  lastError?: string;
}

export interface TorrentFile {
  path: string;
  size: number;
  length: number;
  fileIndex: number;
}

export interface AppSettings {
  libraryPath: string | null;
  theme: 'system' | 'light' | 'dark';
  torrentClient: 'system' | 'custom';
  useSystemDefaultTorrentClient?: boolean;
  customClientPath?: string;
  torrentClientPath?: string;
  autoUpdateMetadata?: boolean;
  metadataIntervalDays?: number;
  peerStatsIntervalHours?: number;
  maxConcurrentRequests?: number;
  metadataFetchIntervalDays?: number;
  autoFetchMetadata?: boolean;
}

export interface LibraryFilters {
  minSeeds?: number | null;
  maxSeeds?: number | null;
  minLeechers?: number | null;
  maxLeechers?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  minSizeBytes?: number | null;
  maxSizeBytes?: number | null;
  hasMagnet?: boolean | null;
  hasScreenshots?: boolean | null;
  discoveredPreset?: 'all' | '7d' | '30d' | '90d' | null;
  developers?: string[] | null;
  publishers?: string[] | null;
  genres?: string[] | null;
  languages?: string[] | null;
  imageFormats?: string[] | null;
  multiplayer?: 'any' | 'yes' | 'no' | null;
  regions?: string[] | null;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  minSeeds: null,
  maxSeeds: null,
  minLeechers: null,
  maxLeechers: null,
  yearFrom: null,
  yearTo: null,
  minSizeBytes: null,
  maxSizeBytes: null,
  hasMagnet: null,
  hasScreenshots: null,
  discoveredPreset: null,
  developers: [],
  publishers: [],
  genres: [],
  languages: [],
  imageFormats: [],
  multiplayer: 'any',
  regions: [],
};

export interface FilterOptions extends LibraryFilters {
  searchQuery?: string;
  categoryId?: string | null;
  onlyFavorites?: boolean;
  genre?: string | null;
  hasCover?: boolean | null;
  hasSeeds?: boolean | null;
  hasLeechers?: boolean | null;
  sortBy?: LibrarySort | 'title_asc' | 'title_desc' | 'seeds_desc' | 'size_desc' | 'indexed_desc';
  sortOrder?: SortDirection;
  offset?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface LibraryStats {
  totalItems: number;
  totalCategories: number;
  totalFavorites: number;
  metadataAvailable: number;
  metadataPending: number;
}

export * from './scraper';

