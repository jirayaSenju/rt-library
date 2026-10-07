export interface CategorySummary {
  id: string
  name: string
  itemCount: number
  lastScrapedAt?: string | null
}

export interface ItemSummary {
  id: string
  topicId?: string | null
  categoryId: string
  title: string
  topicTitle?: string | null
  canonicalTitle?: string | null
  canonicalTitleRaw?: string | null
  normalizedTitle?: string | null
  cleanTitle?: string | null
  releaseGroup?: string | null
  infoHash?: string | null
  genre?: string | null
  developer?: string | null
  publisher?: string | null
  version?: string | null
  region?: string | null
  releaseYear?: string | null
  coverUrl?: string | null
  sizeStr?: string | null
  sizeBytes?: number | null
  hasMagnet: boolean
  magnet?: string | null
  magnetLink?: string | null
  hasScreenshots: boolean
  isFavorite: boolean
  discoveredAt?: string | null
  seeds?: number | null
  leechers?: number | null
  peers?: number | null
  swarmStatus?: string | null
  swarmSource?: string | null
  swarmFetchedAt?: string | null
}

export interface ItemDetail extends ItemSummary {
  magnet?: string | null
  fileList?: Array<{ path: string; size: number; fileIndex: number }> | string | null
  screenshots?: string[] | null
  source?: Record<string, any> | null
  scraping?: Record<string, any> | null
  publisher?: string | null
  imageFormat?: string | null
  multiplayer?: string | null
  region?: string | null
  interfaceLanguage?: string | null
  voiceLanguage?: string | null
}

export interface GetItemsOptions {
  categoryId?: string
  search?: string
  favoritesOnly?: boolean
  sortBy?: 'title' | 'discoveredAt' | 'releaseYear' | 'sizeBytes' | 'seeds' | 'leechers'
  sortOrder?: 'asc' | 'desc'
  hasSeeds?: boolean
  maxSeeds?: number
  minSeeds?: number
  hasLeechers?: boolean
  maxLeechers?: number
  minLeechers?: number
  yearFrom?: number
  yearTo?: number
  minSizeBytes?: number
  maxSizeBytes?: number
  hasMagnet?: boolean
  hasScreenshots?: boolean
  discoveredPreset?: 'all' | '7d' | '30d' | '90d'
  developers?: string[]
  publishers?: string[]
  genres?: string[]
  languages?: string[]
  imageFormats?: string[]
  multiplayer?: 'any' | 'yes' | 'no'
  regions?: string[]
  limit?: number
  offset?: number
}

export interface FacetOption {
  value: string
  count: number
}

export interface FilterFacetsResponse {
  developers: FacetOption[]
  publishers: FacetOption[]
  genres: FacetOption[]
  languages: FacetOption[]
  imageFormats: FacetOption[]
  regions: FacetOption[]
  multiplayer: { yes: number; no: number }
}

export interface GetItemsResponse {
  items: ItemSummary[]
  total: number
  hasMore: boolean
  limit: number
  offset: number
}

export type LibraryReadinessState = 'LOADING' | 'MIGRATING' | 'SCRAPER_REQUIRED' | 'READY' | 'ERROR'

export interface LibraryReadiness {
  state: LibraryReadinessState
  isReady: boolean
  itemCount: number
  categoriesCount: number
  initialScanCompleted: boolean
  legacyFilesCount?: number
  error?: string
}

export interface MigrationResult {
  status: 'completed' | 'already_migrated' | 'no_legacy_json' | 'error' | 'pending'
  migratedFiles?: number
  migratedItems?: number
  backupPath?: string | null
  error?: string
}

export interface NativeCapabilities {
  enableNativeDb: boolean
  isReady: boolean
  itemCount: number
  state?: LibraryReadinessState
  categoriesCount?: number
  initialScanCompleted?: boolean
}

export interface IndexProgressEvent {
  status: 'scanning' | 'indexing' | 'complete' | 'failed'
  categoryId?: string
  currentFile?: string
  processed?: number
  total?: number
  percent?: number
  totalItems?: number
  changedCategories?: string[]
  durationMs?: number
  error?: string
}

export interface IndexStatus {
  isIndexing: boolean
  currentCategory: string | null
  currentFile: string | null
  processed: number
  total: number
  percent: number
  startedAt: number | null
  status: 'idle' | 'scanning' | 'indexing' | 'completed' | 'failed'
  lastError: string | null
}
