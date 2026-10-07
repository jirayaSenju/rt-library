import "@testing-library/jest-dom"
import { vi, beforeEach } from "vitest"
import {
  mockCategories,
  mockItemSummaries,
  mockItemDetails,
} from "./fixtures/libraryItems"
import {
  GetItemsOptions,
  GetItemsResponse,
  ItemSummary,
} from "@/types/libraryIPC"

// In-memory mutable item dataset for deterministic test queries
let inMemoryItems: ItemSummary[] = JSON.parse(JSON.stringify(mockItemSummaries))
let clipboardStorage = ""

export function resetMockDb() {
  inMemoryItems = JSON.parse(JSON.stringify(mockItemSummaries))
  clipboardStorage = ""
}

export function getMockDbItems(): ItemSummary[] {
  return inMemoryItems
}

// 1. Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// 2. Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
window.ResizeObserver = ResizeObserverMock

// 3. Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
window.IntersectionObserver = IntersectionObserverMock as any

// 4. Mock navigator.clipboard
Object.defineProperty(navigator, "clipboard", {
  writable: true,
  configurable: true,
  value: {
    writeText: vi.fn(async (text: string) => {
      clipboardStorage = text
      return Promise.resolve()
    }),
    readText: vi.fn(async () => Promise.resolve(clipboardStorage)),
  },
})

// 5. Mock Element scrollIntoView, scrollTo, pointer capture, and dimensions for virtual scrolling
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()
Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
Element.prototype.setPointerCapture = vi.fn()
Element.prototype.releasePointerCapture = vi.fn()
HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
HTMLElement.prototype.setPointerCapture = vi.fn()
HTMLElement.prototype.releasePointerCapture = vi.fn()
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return 1000
  },
})
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return 1200
  },
})
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return 1000
  },
})
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    return 1200
  },
})
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    top: 0,
    left: 0,
    right: 1200,
    bottom: 1000,
    width: 1200,
    height: 1000,
    x: 0,
    y: 0,
    toJSON: () => {},
  }
}

// 6. In-Memory Mock Implementation for Library Queries
function filterAndSortMockItems(options: GetItemsOptions = {}): GetItemsResponse {
  let result = [...inMemoryItems]

  // Category filter
  if (options.categoryId && options.categoryId !== "all" && options.categoryId !== "favorites") {
    result = result.filter((item) => item.categoryId === options.categoryId)
  }

  // Favorites filter
  if (options.favoritesOnly || options.categoryId === "favorites") {
    result = result.filter((item) => item.isFavorite)
  }

  // Search filter
  if (options.search && options.search.trim() !== "") {
    const q = options.search.toLowerCase().trim()
    result = result.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.cleanTitle && item.cleanTitle.toLowerCase().includes(q)) ||
        (item.developer && item.developer.toLowerCase().includes(q))
    )
  }

  // Seeds filter
  if (options.minSeeds !== undefined && options.minSeeds !== null) {
    result = result.filter((item) => (item.seeds ?? 0) >= options.minSeeds!)
  }
  if (options.maxSeeds !== undefined && options.maxSeeds !== null) {
    result = result.filter((item) => (item.seeds ?? 0) <= options.maxSeeds!)
  }

  // Leechers filter
  if (options.minLeechers !== undefined && options.minLeechers !== null) {
    result = result.filter((item) => (item.leechers ?? 0) >= options.minLeechers!)
  }
  if (options.maxLeechers !== undefined && options.maxLeechers !== null) {
    result = result.filter((item) => (item.leechers ?? 0) <= options.maxLeechers!)
  }

  // Release Year filter
  if (options.yearFrom !== undefined && options.yearFrom !== null) {
    result = result.filter((item) => {
      const year = item.releaseYear ? parseInt(item.releaseYear, 10) : 0
      return year >= options.yearFrom!
    })
  }
  if (options.yearTo !== undefined && options.yearTo !== null) {
    result = result.filter((item) => {
      const year = item.releaseYear ? parseInt(item.releaseYear, 10) : 9999
      return year <= options.yearTo!
    })
  }

  // Size Bytes filter
  if (options.minSizeBytes !== undefined && options.minSizeBytes !== null) {
    result = result.filter((item) => (item.sizeBytes ?? 0) >= options.minSizeBytes!)
  }
  if (options.maxSizeBytes !== undefined && options.maxSizeBytes !== null) {
    result = result.filter((item) => (item.sizeBytes ?? 0) <= options.maxSizeBytes!)
  }

  // Magnet filter
  if (options.hasMagnet !== undefined && options.hasMagnet !== null) {
    result = result.filter((item) => item.hasMagnet === options.hasMagnet)
  }

  // Screenshots filter
  if (options.hasScreenshots !== undefined && options.hasScreenshots !== null) {
    result = result.filter((item) => item.hasScreenshots === options.hasScreenshots)
  }

  // Sorting
  const sortBy = options.sortBy || "discoveredAt"
  const sortOrder = options.sortOrder || "desc"
  const dir = sortOrder === "desc" ? -1 : 1

  result.sort((a, b) => {
    let valA: any = a[sortBy as keyof ItemSummary]
    let valB: any = b[sortBy as keyof ItemSummary]

    // NULL handling: NULLs sorted last deterministically
    const isANull = valA === undefined || valA === null
    const isBNull = valB === undefined || valB === null
    if (isANull && !isBNull) return 1
    if (!isANull && isBNull) return -1
    if (isANull && isBNull) return (a.id || "").localeCompare(b.id || "")

    if (typeof valA === "string") valA = valA.toLowerCase()
    if (typeof valB === "string") valB = valB.toLowerCase()

    if (valA < valB) return -1 * dir
    if (valA > valB) return 1 * dir

    // Tie-breaker: title ASC, id ASC
    const titleA = (a.canonicalTitle || a.title || "").toLowerCase()
    const titleB = (b.canonicalTitle || b.title || "").toLowerCase()
    if (titleA < titleB) return -1
    if (titleA > titleB) return 1
    return (a.id || "").localeCompare(b.id || "")
  })

  const total = result.length
  const offset = options.offset || 0
  const limit = options.limit || 48
  const pagedItems = result.slice(offset, offset + limit)

  return {
    items: pagedItems,
    total,
    hasMore: offset + limit < total,
    limit,
    offset,
  }
}

// 7. Mock Electron IPC Bridge
export const mockElectronBridge = {
  platform: "linux",
  dialogs: {
    selectFolder: vi.fn(async () => "/mock/library/folder"),
  },
  filesystem: {
    readDir: vi.fn(async () => []),
    readFile: vi.fn(async () => ""),
    readBinaryFile: vi.fn(async () => new Uint8Array()),
    statFile: vi.fn(async () => ({ size: 1024, mtime: Date.now() })),
    exists: vi.fn(async () => true),
    mkdir: vi.fn(async () => true),
  },
  shell: {
    openExternal: vi.fn(async () => true),
    openMagnet: vi.fn(async () => true),
  },
  system: {
    getConfigDir: vi.fn(async () => "/mock/config/dir"),
    loadAppConfig: vi.fn(async () => ({
      libraryPath: "/mock/library/folder",
    })),
    saveAppConfig: vi.fn(async () => true),
    loadSqliteDb: vi.fn(async () => null),
    saveSqliteDb: vi.fn(async () => true),
  },
  images: {
    fetch: vi.fn(async () => ({ status: "success", data: "data:image/jpeg;base64,mock" })),
    cancel: vi.fn(),
  },
  library: {
    getReadiness: vi.fn(async () => ({
      state: "READY",
      itemCount: inMemoryItems.length,
      hasLegacyJson: false,
      initialScanCompleted: true,
      legacyJsonCount: 0,
    })),
    runMigration: vi.fn(async () => ({
      success: true,
      itemsMigrated: inMemoryItems.length,
      categoriesMigrated: mockCategories.length,
      backupPath: null,
    })),
    getCapabilities: vi.fn(async () => ({
      enableNativeDb: true,
      isReady: true,
      itemCount: inMemoryItems.length,
    })),
    getCategories: vi.fn(async () => mockCategories),
    getItems: vi.fn(async (options: GetItemsOptions) => filterAndSortMockItems(options)),
    getItem: vi.fn(async (id: string) => mockItemDetails[id] || null),
    getScreenshots: vi.fn(async (id: string) => mockItemDetails[id]?.screenshots || []),
    setFavorite: vi.fn(async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const item = inMemoryItems.find((i) => i.id === id)
      if (item) item.isFavorite = isFavorite
      return true
    }),
    setFavorites: vi.fn(async ({ ids, isFavorite }: { ids: string[]; isFavorite: boolean }) => {
      ids.forEach((id) => {
        const item = inMemoryItems.find((i) => i.id === id)
        if (item) item.isFavorite = isFavorite
      })
      return true
    }),
    toggleFavorite: vi.fn(async (id: string) => {
      const item = inMemoryItems.find((i) => i.id === id)
      if (item) {
        item.isFavorite = !item.isFavorite
        return item.isFavorite
      }
      return false
    }),
    getFavoriteCount: vi.fn(async () => inMemoryItems.filter((i) => i.isFavorite).length),
    exportMagnets: vi.fn(async (arg: any) => {
      const magnets = Array.isArray(arg) ? arg : arg?.magnets || []
      return {
        success: true,
        filePath: "/mock/downloads/rt-library-magnets.txt",
        count: magnets.length,
      }
    }),
    ensureNativeImport: vi.fn(async () => true),
    refresh: vi.fn(async () => ({ status: "ok" })),
    getIndexStatus: vi.fn(async () => ({ isIndexing: false, currentCategory: null, currentFile: null })),
    onIndexProgress: vi.fn(() => () => {}),
  },
  torrent: {
    getMetadata: vi.fn(async (itemId: string) => ({
      itemId,
      seeds: 50,
      leechers: 10,
      fetchedAt: new Date().toISOString(),
      source: "mock-tracker",
    })),
    refreshMetadata: vi.fn(async (itemId: string) => ({
      itemId,
      seeds: 55,
      leechers: 12,
      fetchedAt: new Date().toISOString(),
      source: "mock-tracker",
    })),
    getQueueStatus: vi.fn(async () => ({ queued: 0, processing: 0 })),
    startCollection: vi.fn(async () => ({ status: "started" })),
    stopCollection: vi.fn(async () => ({ status: "stopped" })),
    getCollectionProgress: vi.fn(async () => ({ status: "idle", current: 0, total: 0 })),
    onCollectionProgress: vi.fn(() => () => {}),
    onMetadataUpdated: vi.fn(() => () => {}),
  },
  scraper: {
    start: vi.fn(async () => ({ status: "started" })),
    renewSession: vi.fn(async () => ({ status: "valid" })),
    cancel: vi.fn(async () => ({ status: "cancelled" })),
    getState: vi.fn(async () => ({ isRunning: false, category: null, progress: 0 })),
    clearStorage: vi.fn(async () => ({ status: "cleared" })),
    reindexLibrary: vi.fn(async () => ({ status: "done" })),
    getCurrentLog: vi.fn(async () => []),
    exportLog: vi.fn(async () => ({ success: true, filePath: "/mock/logs/scraper.log" })),
    openLogsFolder: vi.fn(async () => true),
    getCategories: vi.fn(async () => [
      {
        id: "switch",
        name: "Nintendo Switch",
        group: "nintendo",
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=1605",
        titleSearch: ["[Nintendo Switch]"],
        enabled: true,
        builtIn: true,
      },
      {
        id: "ps2",
        name: "Playstation 2",
        group: "playstation",
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=357",
        titleSearch: ["[PS2]"],
        enabled: true,
        builtIn: true,
      },
      {
        id: "custom-genesis",
        name: "Sega Genesis Custom",
        group: "sega",
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=999",
        titleSearch: ["[Genesis]"],
        enabled: true,
        builtIn: false,
      },
    ]),
    createCategory: vi.fn(async (cat: any) => ({
      ...cat,
      builtIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    updateCategory: vi.fn(async (id: string, updates: any) => ({
      id,
      ...updates,
      updatedAt: new Date().toISOString(),
    })),
    deleteCategory: vi.fn(async (_id: string) => true),
    setCategoryEnabled: vi.fn(async (id: string, enabled: boolean) => ({ id, enabled })),
    resetCategory: vi.fn(async (id: string) => ({ id, builtIn: true })),
    testCategory: vi.fn(async (params: any) => ({
      success: true,
      status: "OK",
      totalTopics: 50,
      matchedTopics: 5,
      sampleMatches: [
        "[PS2] Final Fantasy X [NTSC-U] (English)",
        "[PS2] Metal Gear Solid 3: Snake Eater [NTSC-U]",
      ],
    })),
    onStateChanged: vi.fn(() => () => {}),
    onProgress: vi.fn(() => () => {}),
    onLog: vi.fn(() => () => {}),
  },
}

// Attach mocks to global window
;(window as any).rtLibrary = mockElectronBridge
;(window as any).electronAPI = mockElectronBridge

// Reset test state before every test
beforeEach(() => {
  localStorage.clear()
  resetMockDb()
  vi.clearAllMocks()
})
