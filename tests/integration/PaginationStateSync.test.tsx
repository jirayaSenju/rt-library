import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useLibrary, clearQueryCache } from "@/hooks/useLibrary"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { scraperService, ScraperPageCommittedEvent } from "@/services/scraperService"
import { ItemSummary } from "@/types/libraryIPC"

// Helper to create mock items for specific pages
function createMockItems(page: number, pageSize: number, total: number): ItemSummary[] {
  const start = (page - 1) * pageSize
  const count = Math.max(0, Math.min(pageSize, total - start))
  return Array.from({ length: count }, (_, idx) => {
    const itemNum = start + idx + 1
    return {
      id: `game-${itemNum}`,
      categoryId: "ps2",
      title: `PS2 Game ${itemNum}`,
      cleanTitle: `PS2 Game ${itemNum}`,
      releaseYear: "2004",
      sizeStr: "1.2 GB",
      sizeBytes: 1200000000,
      hasMagnet: true,
      hasScreenshots: false,
      isFavorite: false,
      discoveredAt: new Date(Date.now() - itemNum * 1000).toISOString(),
      seeds: 15,
      leechers: 3,
    }
  })
}

describe("Pagination State Synchronization & Desync Prevention (V3-PAGINATION)", () => {
  let committedListener: ((event: ScraperPageCommittedEvent) => void) | null = null

  beforeEach(() => {
    localStorage.clear()
    clearQueryCache()
    vi.clearAllMocks()

    // Mock nativeLibraryService
    vi.spyOn(nativeLibraryService, "getReadiness").mockResolvedValue({
      state: "READY",
      isReady: true,
      itemCount: 200,
      categoriesCount: 1,
      initialScanCompleted: true,
    })

    vi.spyOn(nativeLibraryService, "getCategories").mockResolvedValue([
      { id: "ps2", name: "PlayStation 2", itemCount: 200 },
    ])

    // Default mock getItems implementation
    vi.spyOn(nativeLibraryService, "getItems").mockImplementation(async (options) => {
      const limit = options.limit || 48
      const offset = options.offset || 0
      const page = Math.floor(offset / limit) + 1
      const total = 200
      const items = createMockItems(page, limit, total)
      return {
        items,
        total,
        hasMore: offset + limit < total,
        limit,
        offset,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      }
    })

    // Mock scraperService.onPageCommitted
    committedListener = null
    vi.spyOn(scraperService, "onPageCommitted").mockImplementation((cb) => {
      committedListener = cb
      return () => {
        committedListener = null
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    clearQueryCache()
    vi.restoreAllMocks()
  })

  it("1. DEFINIR OS 3 ESTADOS: selectedPage, requestedPage, and renderedDataPage are aligned on page 5", async () => {
    const { result } = renderHook(() => useLibrary())

    // Wait for bootstrap
    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    // Initial state: page 1
    expect(result.current.currentPage).toBe(1)
    expect(result.current.renderedDataPage).toBe(1)
    expect(result.current.items[0].id).toBe("game-1")

    // Navigate to page 5
    await act(async () => {
      await result.current.goToPage(5)
    })

    // All 3 states must match 5
    expect(result.current.currentPage).toBe(5)
    expect(result.current.renderedDataPage).toBe(5)
    // Page 5 with pageSize 48: items 193 to 200 (start index 192)
    expect(result.current.items[0].id).toBe("game-193")
  })

  it("2. PROVAR FIX DO SYNC: scraper:pageCommitted event during page 5 preserves page 5 and does NOT revert to page 1", async () => {
    const { result } = renderHook(() => useLibrary())

    // Wait for bootstrap and initial items
    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    // Navigate to page 5
    await act(async () => {
      await result.current.goToPage(5)
    })

    expect(result.current.currentPage).toBe(5)
    expect(result.current.renderedDataPage).toBe(5)
    expect(result.current.items[0].id).toBe("game-193")

    // Track getItems calls during sync
    const getItemsSpy = vi.spyOn(nativeLibraryService, "getItems")
    getItemsSpy.mockClear()

    // Background sync emits page committed
    expect(committedListener).toBeDefined()
    await act(async () => {
      committedListener!({
        categoryId: "ps2",
        categoryName: "PlayStation 2",
        page: 1,
        inserted: 5,
        updated: 0,
        totalSaved: 205,
      })
    })

    // Wait for 200ms debounce
    await waitFor(
      () => {
        expect(getItemsSpy).toHaveBeenCalled()
      },
      { timeout: 1000 }
    )

    // Check what getItems was called with: MUST BE targetPage=5 (offset=192), NOT targetPage=1 (offset=0)!
    const lastCall = getItemsSpy.mock.calls[getItemsSpy.mock.calls.length - 1][0]
    expect(lastCall.offset).toBe((5 - 1) * result.current.pageSize) // offset for page 5!

    // Central verification: Page 5 is STILL selected and items are STILL page 5!
    expect(result.current.currentPage).toBe(5)
    expect(result.current.renderedDataPage).toBe(5)
    expect(result.current.items[0].id).toBe("game-193")
  })

  it("3. RACE CONDITION TEST: delayed slow page 1 response is discarded when fast page 5 finishes first", async () => {
    const { result } = renderHook(() => useLibrary())

    // Wait for bootstrap and initial page 1 load
    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    clearQueryCache()

    let resolveSlowPage1: (() => void) | null = null

    vi.spyOn(nativeLibraryService, "getItems").mockImplementation(async (options) => {
      const limit = options.limit || 48
      const offset = options.offset || 0
      const page = Math.floor(offset / limit) + 1

      // If page 1: simulate delayed slow response
      if (page === 1) {
        return new Promise((resolve) => {
          resolveSlowPage1 = () => {
            resolve({
              items: createMockItems(1, limit, 200),
              total: 200,
              hasMore: true,
              limit,
              offset: 0,
              page: 1,
              pageSize: limit,
              totalPages: 5,
            })
          }
        })
      }

      // If page 5: fast response
      return {
        items: createMockItems(5, limit, 200),
        total: 200,
        hasMore: false,
        limit,
        offset: (5 - 1) * limit,
        page: 5,
        pageSize: limit,
        totalPages: 5,
      }
    })

    // Trigger slow refresh on page 1
    let slowRefreshPromise: Promise<void>
    act(() => {
      slowRefreshPromise = result.current.refreshLibrary()
    })

    // While slow refresh for page 1 is in-flight, user navigates to page 5
    await act(async () => {
      await result.current.goToPage(5)
    })

    // Verify page 5 is rendered first
    expect(result.current.currentPage).toBe(5)
    expect(result.current.renderedDataPage).toBe(5)
    expect(result.current.items[0].id).toBe("game-193")

    // Now slow page 1 finally resolves
    await act(async () => {
      resolveSlowPage1?.()
      await slowRefreshPromise
    })

    // Invariant: page 5 must NOT be overwritten by the stale page 1 response!
    expect(result.current.currentPage).toBe(5)
    expect(result.current.renderedDataPage).toBe(5)
    expect(result.current.items[0].id).toBe("game-193")
  })

  it("4. REFRESH PRESERVES PAGE: refreshLibrary / refreshCurrentQuery on page 5 reloads page 5", async () => {
    const { result } = renderHook(() => useLibrary())

    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    // Navigate to page 3
    await act(async () => {
      await result.current.goToPage(3)
    })
    expect(result.current.currentPage).toBe(3)
    expect(result.current.renderedDataPage).toBe(3)

    const getItemsSpy = vi.spyOn(nativeLibraryService, "getItems")
    getItemsSpy.mockClear()

    // Trigger refreshLibrary
    await act(async () => {
      await result.current.refreshLibrary()
    })

    // Verified: queried page 3 (offset 96) and stayed on page 3
    expect(getItemsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 96,
      })
    )
    expect(result.current.currentPage).toBe(3)
    expect(result.current.renderedDataPage).toBe(3)
  })

  it("5. LEGITIMATE RESET: changing category or filters resets to page 1", async () => {
    const { result } = renderHook(() => useLibrary())

    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    // Navigate to page 4
    await act(async () => {
      await result.current.goToPage(4)
    })
    expect(result.current.currentPage).toBe(4)

    // Changing category should reset to page 1
    await act(async () => {
      result.current.setSelectedCategory("switch")
    })
    expect(result.current.currentPage).toBe(1)
    expect(result.current.renderedDataPage).toBe(1)
  })

  it("6. BOUNDARY FALLBACK: when total count drops, currentPage clamps safely without desync", async () => {
    const { result } = renderHook(() => useLibrary())

    await waitFor(() => {
      expect(result.current.bootState).toBe("READY")
      expect(result.current.items.length).toBeGreaterThan(0)
    })

    // User is on page 5
    await act(async () => {
      await result.current.goToPage(5)
    })
    expect(result.current.currentPage).toBe(5)

    // Simulate database update where total items shrinks to 60 (max 2 pages of 48)
    vi.spyOn(nativeLibraryService, "getItems").mockImplementation(async (options) => {
      const limit = options.limit || 48
      const offset = options.offset || 0
      const page = Math.floor(offset / limit) + 1
      const total = 60
      return {
        items: createMockItems(page, limit, total),
        total,
        hasMore: false,
        limit,
        offset,
        page,
        pageSize: limit,
        totalPages: 2,
      }
    })

    // Refresh query
    await act(async () => {
      await result.current.refreshLibrary()
    })

    // Page must clamp to 2, not silently stay 5 or desync to 1
    expect(result.current.currentPage).toBe(2)
    expect(result.current.renderedDataPage).toBe(2)
    expect(result.current.totalPages).toBe(2)
  })
})
