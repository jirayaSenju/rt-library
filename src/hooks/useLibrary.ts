import { useState, useEffect, useCallback, useRef } from "react"
import { Category, LibraryItem, FilterOptions, AppSettings, PaginatedResult } from "@/types"
import { GetItemsOptions, LibraryReadinessState } from "@/types/libraryIPC"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { configService } from "@/services/configService"
import { toast } from "sonner"
import { perfTelemetry } from "@/utils/performanceTelemetry"

export const ALLOWED_PAGE_SIZES = [24, 48, 96, 100, 200] as const
export type PageSize = (typeof ALLOWED_PAGE_SIZES)[number]

export function getStoredPageSize(): number {
  if (typeof window === "undefined") return 48
  try {
    const raw = localStorage.getItem("rt_library_page_size")
    if (raw === null) return 48
    const parsed = parseInt(raw, 10)
    if ((ALLOWED_PAGE_SIZES as readonly number[]).includes(parsed)) {
      return parsed
    }
    return 24
  } catch {
    return 24
  }
}

const DEFAULT_PAGE_SIZE = 48
const queryCache = new Map<string, PaginatedResult<LibraryItem>>()

export function useLibrary() {
  const [bootState, setBootState] = useState<LibraryReadinessState>("LOADING")
  const [migrationProgress, setMigrationProgress] = useState<string>("")
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [items, setItems] = useState<LibraryItem[]>([])
  const [totalItems, setTotalItems] = useState<number>(0)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSizeState] = useState<number>(getStoredPageSize)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isIndexing, setIsIndexing] = useState<boolean>(false)
  const [indexingProgress, setIndexingProgress] = useState<string>("")
  const [categoryScrollPositions, setCategoryScrollPositions] = useState<Record<string, number>>({})

  const [settings, setSettings] = useState<AppSettings>({
    libraryPath: null,
    torrentClient: "system",
    torrentClientPath: undefined,
    useSystemDefaultTorrentClient: true,
    theme: "dark",
    metadataFetchIntervalDays: 7,
    autoFetchMetadata: true,
  })

  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: "",
    categoryId: "all",
    onlyFavorites: false,
    sortBy: "discoveredAt",
    sortOrder: "desc",
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
    multiplayer: "any",
    regions: [],
  })

  const [debouncedSearch, setDebouncedSearch] = useState<string>("")
  const requestIdRef = useRef<number>(0)
  const isInitialMount = useRef(true)

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(filters.searchQuery || "")
    }, 200)
    return () => clearTimeout(handler)
  }, [filters.searchQuery])

  const loadCategories = useCallback(async () => {
    try {
      const rawCats = await nativeLibraryService.getCategories()
      const mappedCats: Category[] = rawCats.map((c) => ({
        id: c.id,
        name: c.name,
        filePath: "",
        itemCount: c.itemCount,
        count: c.itemCount,
        fileMtime: 0,
        fileSize: 0,
        contentHash: "",
        lastIndexedAt: c.lastScrapedAt || "",
      }))
      setCategories(mappedCats)
      return mappedCats
    } catch (err) {
      console.error("[useLibrary] Failed to load categories:", err)
      return []
    }
  }, [])

  const checkReadinessAndBootstrap = useCallback(async () => {
    try {
      setIsLoading(true)
      const readiness = await nativeLibraryService.getReadiness()
      console.log("[useLibrary] Library readiness state:", readiness)

      if (readiness.state === "MIGRATING") {
        setBootState("MIGRATING")
        setMigrationProgress("Migrating existing library to SQLite...")
        const migResult = await nativeLibraryService.runMigration()
        if (migResult.status === "completed" || migResult.status === "already_migrated") {
          const nextReadiness = await nativeLibraryService.getReadiness()
          if (nextReadiness.isReady) {
            setBootState("READY")
            await loadCategories()
            return
          }
        } else if (migResult.status === "error") {
          setBootState("ERROR")
          toast.error(`Migration failed: ${migResult.error}`)
          return
        }
      }

      if (readiness.state === "READY") {
        setBootState("READY")
        await loadCategories()
      } else if (readiness.state === "SCRAPER_REQUIRED") {
        setBootState("SCRAPER_REQUIRED")
      } else if (readiness.state === "ERROR") {
        setBootState("ERROR")
      } else {
        setBootState(readiness.state)
      }
    } catch (err) {
      console.error("[useLibrary] Bootstrap error:", err)
      setBootState("ERROR")
    } finally {
      setIsLoading(false)
    }
  }, [loadCategories])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      checkReadinessAndBootstrap()
    }
  }, [checkReadinessAndBootstrap])

  const fetchPage = useCallback(async (targetPage: number, targetSize: number) => {
    const currentReqId = ++requestIdRef.current
    const t0 = performance.now()

    const mapSortBy = (sort?: string): GetItemsOptions['sortBy'] => {
      switch (sort) {
        case 'title':
        case 'title_asc':
        case 'title_desc':
          return 'title'
        case 'releaseYear':
        case 'year':
          return 'releaseYear'
        case 'size':
        case 'sizeBytes':
        case 'size_desc':
          return 'sizeBytes'
        case 'seeds':
        case 'seeds_desc':
          return 'seeds'
        case 'leechers':
          return 'leechers'
        case 'discoveredAt':
        case 'indexed_desc':
          return 'discoveredAt'
        default:
          return 'discoveredAt'
      }
    }

    const isFavoritesCategory = selectedCategory === "favorites"
    const options: GetItemsOptions = {
      categoryId: (selectedCategory === "all" || isFavoritesCategory) ? undefined : selectedCategory,
      search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
      favoritesOnly: Boolean(filters.onlyFavorites || isFavoritesCategory),
      sortBy: mapSortBy(filters.sortBy),
      sortOrder: filters.sortOrder || "desc",
      minSeeds: filters.minSeeds ?? undefined,
      maxSeeds: filters.maxSeeds ?? undefined,
      minLeechers: filters.minLeechers ?? undefined,
      maxLeechers: filters.maxLeechers ?? undefined,
      yearFrom: filters.yearFrom ?? undefined,
      yearTo: filters.yearTo ?? undefined,
      minSizeBytes: filters.minSizeBytes ?? undefined,
      maxSizeBytes: filters.maxSizeBytes ?? undefined,
      hasMagnet: filters.hasMagnet ?? undefined,
      hasScreenshots: filters.hasScreenshots ?? undefined,
      discoveredPreset: filters.discoveredPreset ?? undefined,
      developers: filters.developers && filters.developers.length > 0 ? filters.developers : undefined,
      publishers: filters.publishers && filters.publishers.length > 0 ? filters.publishers : undefined,
      genres: filters.genres && filters.genres.length > 0 ? filters.genres : undefined,
      languages: filters.languages && filters.languages.length > 0 ? filters.languages : undefined,
      imageFormats: filters.imageFormats && filters.imageFormats.length > 0 ? filters.imageFormats : undefined,
      multiplayer: filters.multiplayer === "yes" || filters.multiplayer === "no" ? filters.multiplayer : undefined,
      regions: filters.regions && filters.regions.length > 0 ? filters.regions : undefined,
      limit: targetSize,
      offset: (targetPage - 1) * targetSize,
    }

    const cacheKey = JSON.stringify(options)
    if (queryCache.has(cacheKey)) {
      const cached = queryCache.get(cacheKey)!
      if (currentReqId === requestIdRef.current) {
        setItems(cached.items)
        setTotalItems(cached.total)
        setHasMore(cached.hasMore)
        return
      }
    }

    try {
      const response = await nativeLibraryService.getItems(options)
      if (currentReqId !== requestIdRef.current) return

      const mappedItems: LibraryItem[] = response.items.map((i) => ({
        id: i.id,
        topicId: i.topicId || undefined,
        categoryId: i.categoryId,
        categoryName: i.categoryId,
        title: (i as any).canonicalTitle || i.cleanTitle || i.title,
        canonicalTitle: (i as any).canonicalTitle || i.cleanTitle || i.title,
        canonicalTitleRaw: (i as any).canonicalTitleRaw || i.title,
        topicTitle: (i as any).topicTitle || i.title,
        normalizedTitle: (i as any).normalizedTitle,
        releaseGroup: (i as any).releaseGroup,
        cleanTitle: i.cleanTitle || i.title,
        genre: i.genre || undefined,
        developer: i.developer || undefined,
        releaseYear: i.releaseYear ? String(i.releaseYear) : undefined,
        coverUrl: i.coverUrl || undefined,
        coverImage: i.coverUrl || undefined,
        size: i.sizeStr || undefined,
        sizeBytes: i.sizeBytes || undefined,
        hasMagnet: i.hasMagnet,
        magnet: i.magnet || undefined,
        magnetLink: i.magnetLink || i.magnet || undefined,
        hasScreenshots: i.hasScreenshots,
        isFavorite: i.isFavorite,
        discoveredAt: i.discoveredAt || undefined,
        seeders: i.seeds ?? undefined,
        leechers: i.leechers ?? undefined,
        infoHash: (i as any).infoHash,
        torrent: {
          infoHash: (i as any).infoHash || '',
          files: [],
          trackers: [],
          status: 'available',
          seeders: i.seeds ?? undefined,
          leechers: i.leechers ?? undefined,
          totalSize: i.sizeBytes ?? undefined,
        },
      }))

      queryCache.set(cacheKey, {
        items: mappedItems,
        total: response.total,
        hasMore: response.hasMore,
        offset: (targetPage - 1) * targetSize,
        limit: targetSize,
      })

      setItems(mappedItems)
      setTotalItems(response.total)
      setHasMore(response.hasMore)

      if (perfTelemetry.isEnabled()) {
        const queryDuration = performance.now() - t0
        perfTelemetry.measure("SEARCH", "Query Duration", queryDuration, { count: response.items.length })
      }
    } catch (err) {
      if (currentReqId === requestIdRef.current) {
        console.error("[useLibrary] Failed to fetch page:", err)
        toast.error("Failed to load catalog page")
      }
    }
  }, [debouncedSearch, filters, selectedCategory])

  const loadInitialItems = useCallback(async () => {
    setIsLoading(true)
    await fetchPage(1, pageSize)
    setCurrentPage(1)
    setIsLoading(false)
  }, [fetchPage, pageSize])

  useEffect(() => {
    const unsubscribe = window.rtLibrary?.database?.onRestored(() => {
      queryCache.clear()
      setCurrentPage(1)
      loadCategories()
      loadInitialItems()
    })
    return unsubscribe
  }, [loadCategories, loadInitialItems])

  // Reload items on filter/category changes when ready
  useEffect(() => {
    if (bootState === "READY") {
      loadInitialItems()
    }
  }, [bootState, selectedCategory, debouncedSearch, filters, loadInitialItems])

  const goToPage = async (page: number) => {
    if (page < 1 || page === currentPage) return
    setIsLoading(true)
    await fetchPage(page, pageSize)
    setCurrentPage(page)
    setIsLoading(false)
  }

  const changePageSize = async (newSize: number) => {
    const validSize = (ALLOWED_PAGE_SIZES as readonly number[]).includes(newSize) ? newSize : 24
    if (validSize === pageSize) return
    try {
      localStorage.setItem("rt_library_page_size", String(validSize))
    } catch {
      // ignore
    }
    setPageSizeState(validSize)
    setIsLoading(true)
    await fetchPage(1, validSize)
    setCurrentPage(1)
    setIsLoading(false)
  }

  const updateFilters = (newFilters: Partial<FilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  const refreshLibrary = async () => {
    queryCache.clear()
    await loadCategories()
    await loadInitialItems()
  }

  const unlockLibrary = async () => {
    setBootState("READY")
    await loadCategories()
    await loadInitialItems()
  }

  const saveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings)
    await configService.saveConfig(newSettings)
    toast.success("Settings saved successfully")
  }

  const saveScrollPosition = (catId: string, pos: number) => {
    setCategoryScrollPositions((prev) => ({ ...prev, [catId]: pos }))
  }

  const applyCatalogState = useCallback(
    (state: {
      selectedCategory?: string
      pageSize?: number
      filters?: Partial<FilterOptions>
    }) => {
      if (state.selectedCategory !== undefined) {
        setSelectedCategory(state.selectedCategory)
      }
      if (state.pageSize !== undefined) {
        const validSize = (ALLOWED_PAGE_SIZES as readonly number[]).includes(state.pageSize) ? state.pageSize : 24
        setPageSizeState(validSize)
        try {
          localStorage.setItem("rt_library_page_size", String(validSize))
        } catch {
          // ignore
        }
      }
      if (state.filters !== undefined) {
        setFilters((prev) => ({
          ...prev,
          ...state.filters,
          ...(state.selectedCategory !== undefined ? { categoryId: state.selectedCategory } : {}),
        }))
      }
      setCurrentPage(1)
    },
    []
  )

  return {
    bootState,
    migrationProgress,
    unlockLibrary,
    retryBootstrap: checkReadinessAndBootstrap,
    categories,
    selectedCategory,
    setSelectedCategory: (catId: string) => {
      setSelectedCategory(catId)
      updateFilters({ categoryId: catId })
    },
    items,
    totalItems,
    hasMore,
    currentPage,
    pageSize,
    totalPages: Math.ceil(totalItems / (pageSize > 0 ? pageSize : 24)) || 1,
    goToPage,
    setPageSize: changePageSize,
    filters,
    updateFilters,
    applyCatalogState,
    isLoading,
    isIndexing,
    indexingProgress,
    refreshLibrary,
    settings,
    saveSettings,
    reloadItems: loadInitialItems,
    categoryScrollPositions,
    saveScrollPosition,
    isNativeMode: true,
  }
}
