import {
  CategorySummary,
  ItemSummary,
  ItemDetail,
  GetItemsOptions,
  GetItemsResponse,
  NativeCapabilities,
  IndexProgressEvent,
  IndexStatus,
  FilterFacetsResponse,
} from "@/types/libraryIPC"

function getLibraryIPC() {
  if (window.rtLibrary?.library) return window.rtLibrary.library
  const api = (window as any).electronAPI
  if (api?.library) return api.library
  return null
}

export class NativeLibraryService {
  async getCapabilities(): Promise<NativeCapabilities> {
    const ipc = getLibraryIPC()
    if (ipc?.getCapabilities) {
      try {
        return await ipc.getCapabilities()
      } catch (err) {
        console.warn("[NativeLibraryService] getCapabilities error:", err)
      }
    }
    return { enableNativeDb: false, isReady: false, itemCount: 0 }
  }

  async getReadiness(): Promise<{
    state: 'LOADING' | 'MIGRATING' | 'SCRAPER_REQUIRED' | 'READY' | 'ERROR'
    isReady: boolean
    itemCount: number
    categoriesCount: number
    initialScanCompleted: boolean
    legacyFilesCount?: number
    error?: string
  }> {
    const ipc = getLibraryIPC()
    if (ipc?.getReadiness) {
      try {
        return await ipc.getReadiness()
      } catch (err) {
        console.warn("[NativeLibraryService] getReadiness error:", err)
        return {
          state: 'ERROR',
          isReady: false,
          itemCount: 0,
          categoriesCount: 0,
          initialScanCompleted: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    return {
      state: 'SCRAPER_REQUIRED',
      isReady: false,
      itemCount: 0,
      categoriesCount: 0,
      initialScanCompleted: false,
    }
  }

  async runMigration(): Promise<{
    status: 'completed' | 'already_migrated' | 'no_legacy_json' | 'error' | 'pending'
    migratedFiles?: number
    migratedItems?: number
    backupPath?: string | null
    error?: string
  }> {
    const ipc = getLibraryIPC()
    if (ipc?.runMigration) {
      try {
        return await ipc.runMigration()
      } catch (err) {
        console.error("[NativeLibraryService] runMigration error:", err)
        return {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    return { status: 'no_legacy_json' }
  }

  async getCategories(): Promise<CategorySummary[]> {
    const ipc = getLibraryIPC()
    if (ipc?.getCategories) {
      try {
        return await ipc.getCategories()
      } catch (err) {
        console.error("[NativeLibraryService] getCategories error:", err)
      }
    }
    return []
  }

  async getFilterFacets(categoryId?: string): Promise<FilterFacetsResponse> {
    const ipc = getLibraryIPC()
    if (ipc?.getFilterFacets) {
      try {
        return await ipc.getFilterFacets({ categoryId })
      } catch (err) {
        console.error("[NativeLibraryService] getFilterFacets error:", err)
      }
    }
    return {
      developers: [],
      publishers: [],
      genres: [],
      languages: [],
      imageFormats: [],
      regions: [],
      multiplayer: { yes: 0, no: 0 },
    }
  }

  async getItems(options: GetItemsOptions = {}): Promise<GetItemsResponse> {
    const ipc = getLibraryIPC()
    if (ipc?.getItems) {
      try {
        return await ipc.getItems(options)
      } catch (err) {
        console.error("[NativeLibraryService] getItems error:", err)
      }
    }
    return { items: [], total: 0, hasMore: false, limit: options.limit || 100, offset: options.offset || 0 }
  }

  async getItem(id: string): Promise<ItemDetail | null> {
    const ipc = getLibraryIPC()
    if (ipc?.getItem) {
      try {
        return await ipc.getItem(id)
      } catch (err) {
        console.error("[NativeLibraryService] getItem error:", err)
      }
    }
    return null
  }

  async getScreenshots(id: string): Promise<string[]> {
    const ipc = getLibraryIPC()
    if (ipc?.getScreenshots) {
      try {
        const res = await ipc.getScreenshots(id)
        return res?.screenshots || []
      } catch (err) {
        console.error("[NativeLibraryService] getScreenshots error:", err)
      }
    }
    return []
  }

  async setFavorite(id: string, isFavorite: boolean): Promise<boolean> {
    const ipc = getLibraryIPC()
    if (ipc?.setFavorite) {
      try {
        const res = await ipc.setFavorite(id, isFavorite)
        return Boolean(res?.success)
      } catch (err) {
        console.error("[NativeLibraryService] setFavorite error:", err)
      }
    }
    return false
  }

  async setFavorites(ids: string[], isFavorite: boolean): Promise<{ success: boolean; updatedCount?: number }> {
    const ipc = getLibraryIPC()
    if (ipc?.setFavorites) {
      try {
        const res = await ipc.setFavorites(ids, isFavorite)
        return { success: Boolean(res?.success), updatedCount: res?.updatedCount || 0 }
      } catch (err) {
        console.error("[NativeLibraryService] setFavorites error:", err)
      }
    }
    return { success: false, updatedCount: 0 }
  }

  async toggleFavorite(id: string): Promise<{ success: boolean; isFavorite: boolean }> {
    const ipc = getLibraryIPC()
    if (ipc?.toggleFavorite) {
      try {
        return await ipc.toggleFavorite(id)
      } catch (err) {
        console.error("[NativeLibraryService] toggleFavorite error:", err)
      }
    }
    return { success: false, isFavorite: false }
  }

  async getFavoriteCount(): Promise<number> {
    const ipc = getLibraryIPC()
    if (ipc?.getFavoriteCount) {
      try {
        const res = await ipc.getFavoriteCount()
        return res?.count || 0
      } catch (err) {
        console.error("[NativeLibraryService] getFavoriteCount error:", err)
      }
    }
    return 0
  }

  async exportMagnets(magnets: string[]): Promise<{ success: boolean; canceled?: boolean; filePath?: string; count?: number; error?: string }> {
    const ipc = getLibraryIPC()
    if (ipc?.exportMagnets) {
      try {
        return await ipc.exportMagnets(magnets)
      } catch (err) {
        console.error("[NativeLibraryService] exportMagnets error:", err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    return { success: false, error: "IPC unavailable" }
  }

  async ensureNativeImport(libraryPath: string, options?: { force?: boolean }): Promise<{ success: boolean; summary?: any; error?: string }> {
    const ipc = getLibraryIPC()
    if (ipc?.ensureNativeImport) {
      try {
        return await ipc.ensureNativeImport(libraryPath, options)
      } catch (err) {
        console.error("[NativeLibraryService] ensureNativeImport error:", err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    return { success: false, error: "IPC unavailable" }
  }

  async refresh(options: { libraryPath: string; force?: boolean }): Promise<{ status: string; error?: string }> {
    const ipc = getLibraryIPC()
    if (ipc?.refresh) {
      try {
        return await ipc.refresh(options)
      } catch (err) {
        console.error("[NativeLibraryService] refresh error:", err)
        return { status: 'error', error: err instanceof Error ? err.message : String(err) }
      }
    }
    return { status: 'error', error: "IPC unavailable" }
  }

  async getIndexStatus(): Promise<IndexStatus | null> {
    const ipc = getLibraryIPC()
    if (ipc?.getIndexStatus) {
      try {
        return await ipc.getIndexStatus()
      } catch (err) {
        console.error("[NativeLibraryService] getIndexStatus error:", err)
      }
    }
    return null
  }

  async getAllImageUrls(): Promise<{
    items: Array<{ id: string; title: string; coverUrl: string | null; screenshots: string[] }>
    totalCovers: number
    totalScreenshots: number
  }> {
    const ipc = getLibraryIPC()
    if (ipc?.getAllImageUrls) {
      try {
        const res = await ipc.getAllImageUrls()
        if (res?.success && Array.isArray(res.items)) {
          return {
            items: res.items,
            totalCovers: res.totalCovers || 0,
            totalScreenshots: res.totalScreenshots || 0,
          }
        }
      } catch (err) {
        console.error("[NativeLibraryService] getAllImageUrls error:", err)
      }
    }

    // Fallback in mock / browser environment
    try {
      const res = await this.getItems({ limit: 500 })
      const items = (res?.items || []).map((i: any) => ({
        id: i.id,
        title: i.title || "Untitled",
        coverUrl: i.coverUrl || i.coverImage || i.cover || null,
        screenshots: Array.isArray(i.screenshots) ? i.screenshots : [],
      }))
      const totalCovers = items.filter((i) => Boolean(i.coverUrl)).length
      let totalScreenshots = 0
      for (const it of items) totalScreenshots += it.screenshots.length
      return {
        items,
        totalCovers,
        totalScreenshots,
      }
    } catch {
      return { items: [], totalCovers: 0, totalScreenshots: 0 }
    }
  }

  onIndexProgress(callback: (event: IndexProgressEvent) => void): () => void {
    const ipc = getLibraryIPC()
    if (ipc?.onIndexProgress) {
      try {
        return ipc.onIndexProgress(callback)
      } catch (err) {
        console.error("[NativeLibraryService] onIndexProgress subscription error:", err)
      }
    }
    return () => {}
  }
}

export const nativeLibraryService = new NativeLibraryService()
