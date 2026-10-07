import { resolveImageUrl } from "../utils/imageResolver"
import {
  ImageCachePolicyConfig,
  DEFAULT_IMAGE_CACHE_POLICY,
  CacheHealthStatus,
  FailureType,
  FAILURE_TTLS_MS,
  extractImageProvider,
  shouldTriggerCleanup,
  getCleanupTargetBytes,
  calculateCacheHealth,
  isSingleImageTooLarge,
  shouldUpdateLastAccessedAt,
  calculateSizeDelta,
  selectEvictionCandidates,
  formatBytes,
} from "./imageCachePolicy"

const DB_NAME = "RTLibraryImageCache"
const STORE_NAME = "cached_images"
const FAILURES_STORE_NAME = "cache_failures"
const DB_VERSION = 3
const POLICY_STORAGE_KEY = "rt_library_image_cache_policy"
const LAST_CLEANUP_STORAGE_KEY = "rt_library_image_cache_last_cleanup"

export interface CacheEntryRecord {
  url: string
  blob: Blob
  sizeBytes: number
  createdAt: number
  lastAccessedAt: number
  type: "cover" | "screenshot" | "other"
  provider: string
  expiresAt?: number
}

export interface CacheFailureRecord {
  key: string
  url: string
  provider: string
  failureType: FailureType
  lastFailure: number
  expiresAt: number
  attempts: number
}

export interface ProviderStorageStat {
  provider: string
  count: number
  bytes: number
  sizeFormatted: string
  percent: number
}

export interface ImageCacheDetailedStats {
  count: number
  totalBytes: number
  maxBytes: number
  utilizationPercent: number
  totalSizeFormatted: string
  coversCount: number
  coversBytes: number
  coversSizeFormatted: string
  screenshotsCount: number
  screenshotsBytes: number
  screenshotsSizeFormatted: string
  otherCount: number
  otherBytes: number
  otherSizeFormatted: string
  failedCount: number
  expiredCount: number
  healthStatus: CacheHealthStatus
  providers: ProviderStorageStat[]
  lastCleanupAt: number | null
  quota?: { usage?: number; quota?: number; usageFormatted?: string; quotaFormatted?: string }
}

export interface CleanupResult {
  deletedCount: number
  freedBytes: number
  durationMs: number
}

class ImageCacheService {
  private db: IDBDatabase | null = null
  private dbInitPromise: Promise<IDBDatabase | null> | null = null
  private cachedTotalBytes: number | null = null
  private inFlightRequests = new Map<string, Promise<Blob | undefined>>()
  private cleanupPromise: Promise<CleanupResult> | null = null
  private activeObjectUrls = new Set<string>()
  private isCleaning = false

  // In-memory fallback stores when IndexedDB is unavailable or throws
  private memoryEntries = new Map<string, CacheEntryRecord>()
  private memoryFailures = new Map<string, CacheFailureRecord>()
  private useMemoryFallback = false

  /**
   * Retrieves active policy from local storage or returns defaults.
   */
  getPolicy(): ImageCachePolicyConfig {
    if (typeof localStorage === "undefined") return { ...DEFAULT_IMAGE_CACHE_POLICY }
    try {
      const stored = localStorage.getItem(POLICY_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          ...DEFAULT_IMAGE_CACHE_POLICY,
          ...parsed,
        }
      }
    } catch {}
    return { ...DEFAULT_IMAGE_CACHE_POLICY }
  }

  /**
   * Persists policy in local storage and dispatches change notification.
   */
  setPolicy(policy: Partial<ImageCachePolicyConfig>): void {
    if (typeof localStorage === "undefined") return
    try {
      const current = this.getPolicy()
      const updated = { ...current, ...policy }
      localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent("rt-library-image-cache-policy-changed", { detail: updated }))
    } catch {}
  }

  /**
   * Returns timestamp of last cleanup or null.
   */
  getLastCleanupTimestamp(): number | null {
    if (typeof localStorage === "undefined") return null
    try {
      const stored = localStorage.getItem(LAST_CLEANUP_STORAGE_KEY)
      if (stored) {
        const val = parseInt(stored, 10)
        return isNaN(val) ? null : val
      }
    } catch {}
    return null
  }

  /**
   * Sets timestamp of last cleanup.
   */
  private recordLastCleanupTimestamp(ts: number = Date.now()): void {
    if (typeof localStorage === "undefined") return
    try {
      localStorage.setItem(LAST_CLEANUP_STORAGE_KEY, ts.toString())
    } catch {}
  }

  private async init(): Promise<IDBDatabase | null> {
    if (this.useMemoryFallback) return null
    if (this.db) return this.db
    if (this.dbInitPromise) return this.dbInitPromise

    this.dbInitPromise = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === "undefined") {
        this.useMemoryFallback = true
        resolve(null)
        return
      }

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        let abandoned = false
        const fallback = () => {
          if (abandoned) return
          abandoned = true
          clearTimeout(timer)
          this.useMemoryFallback = true
          this.dbInitPromise = null
          resolve(null)
        }

        const timer = setTimeout(fallback, 1500)
        request.onblocked = fallback

        request.onupgradeneeded = (e) => {
          if (abandoned) {
            request.transaction?.abort()
            return
          }
          const db = (e.target as IDBOpenDBRequest).result
          const tx = (e.target as IDBOpenDBRequest).transaction!
          let store: IDBObjectStore

          // 1. Cached Images Store
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            store = db.createObjectStore(STORE_NAME, { keyPath: "url" })
          } else {
            store = tx.objectStore(STORE_NAME)
          }

          if (!store.indexNames.contains("by_lastAccessedAt")) {
            store.createIndex("by_lastAccessedAt", "lastAccessedAt", { unique: false })
          }
          if (!store.indexNames.contains("by_sizeBytes")) {
            store.createIndex("by_sizeBytes", "sizeBytes", { unique: false })
          }
          if (!store.indexNames.contains("by_type")) {
            store.createIndex("by_type", "type", { unique: false })
          }
          if (!store.indexNames.contains("by_provider")) {
            store.createIndex("by_provider", "provider", { unique: false })
          }
          if (!store.indexNames.contains("by_expiresAt")) {
            store.createIndex("by_expiresAt", "expiresAt", { unique: false })
          }

          // 2. Failures / Negative Cache Store
          let failureStore: IDBObjectStore
          if (!db.objectStoreNames.contains(FAILURES_STORE_NAME)) {
            failureStore = db.createObjectStore(FAILURES_STORE_NAME, { keyPath: "key" })
          } else {
            failureStore = tx.objectStore(FAILURES_STORE_NAME)
          }

          if (!failureStore.indexNames.contains("by_expiresAt")) {
            failureStore.createIndex("by_expiresAt", "expiresAt", { unique: false })
          }
          if (!failureStore.indexNames.contains("by_provider")) {
            failureStore.createIndex("by_provider", "provider", { unique: false })
          }
        }

        request.onsuccess = (e) => {
          clearTimeout(timer)
          if (abandoned) {
            request.result.close()
            return
          }
          this.db = (e.target as IDBOpenDBRequest).result
          this.recalculateSize()
            .then(() => resolve(this.db))
            .catch(() => resolve(this.db))
        }

        request.onerror = fallback
      } catch {
        this.useMemoryFallback = true
        resolve(null)
      }
    })

    return this.dbInitPromise
  }

  /**
   * Recalculates total size of all cached blobs.
   */
  async recalculateSize(): Promise<number> {
    try {
      const db = await this.init()
      if (!db) {
        let total = 0
        for (const item of this.memoryEntries.values()) {
          total += item.sizeBytes || item.blob?.size || 0
        }
        this.cachedTotalBytes = total
        return total
      }

      return new Promise<number>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly")
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()

        req.onsuccess = () => {
          const items: CacheEntryRecord[] = req.result || []
          let total = 0
          for (const item of items) {
            const size = item.sizeBytes || item.blob?.size || 0
            total += size
          }
          this.cachedTotalBytes = total
          resolve(total)
        }

        req.onerror = () => {
          this.cachedTotalBytes = this.cachedTotalBytes || 0
          resolve(this.cachedTotalBytes)
        }
      })
    } catch {
      this.cachedTotalBytes = this.cachedTotalBytes || 0
      return this.cachedTotalBytes
    }
  }

  getTotalBytes(): number {
    return this.cachedTotalBytes || 0
  }

  /**
   * Main entrypoint for getting a displayable image URL (with deduplication & negative cache bypass).
   */
  async getImage(originalUrl?: string): Promise<string> {
    const resolvedUrl = resolveImageUrl(originalUrl)
    if (!resolvedUrl) return originalUrl || ""

    // Check negative cache
    const isFailed = await this.isNegativeCached(resolvedUrl).catch(() => false)
    if (isFailed) return resolvedUrl

    let request = this.inFlightRequests.get(resolvedUrl)
    if (!request) {
      request = this.fetchAndCacheBlob(resolvedUrl).finally(() => this.inFlightRequests.delete(resolvedUrl))
      this.inFlightRequests.set(resolvedUrl, request)
    }
    const blob = await request
    return blob ? this.createObjectUrl(blob) : resolvedUrl
  }

  private async fetchAndCacheBlob(url: string): Promise<Blob | undefined> {
    const cached = await this.getBlob(url).catch(() => undefined)
    return cached || this.fetchBlob(url)
  }

  /**
   * Retrieves a cached image blob and returns a Blob URL if present.
   */
  async getCachedImage(originalUrl?: string): Promise<string | undefined> {
    const resolvedUrl = resolveImageUrl(originalUrl)
    if (!resolvedUrl) return undefined
    const blob = await this.getBlob(resolvedUrl).catch(() => undefined)
    return blob ? this.createObjectUrl(blob) : undefined
  }

  createObjectUrl(blob: Blob): string {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        const objectUrl = URL.createObjectURL(blob)
        this.activeObjectUrls.add(objectUrl)
        return objectUrl
      } catch {}
    }
    return ""
  }

  async getBlob(key: string): Promise<Blob | undefined> {
    const db = await this.init()
    let record: CacheEntryRecord | undefined

    if (!db) {
      record = this.memoryEntries.get(key)
    } else {
      record = await new Promise<CacheEntryRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly")
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }

    if (!record) return undefined

    // Check expiration
    if (record.expiresAt && record.expiresAt <= Date.now()) {
      await this.deleteCacheEntry(key).catch(() => {})
      return undefined
    }

    // Validate blob integrity
    if (
      !(record.blob instanceof Blob) ||
      record.blob.size === 0 ||
      !record.blob.type.toLowerCase().startsWith("image/") ||
      record.blob.type.toLowerCase().startsWith("image/svg+xml")
    ) {
      await this.deleteCacheEntry(key).catch(() => {})
      await this.recordFailure(key, key, "INVALID_MIME").catch(() => {})
      return undefined
    }

    const now = Date.now()
    if (shouldUpdateLastAccessedAt(record.lastAccessedAt, now)) {
      this.touchAccessTime(key, now, record).catch(() => {})
    }
    return record.blob
  }

  async deleteCacheEntry(key: string): Promise<void> {
    const db = await this.init()
    let removedBytes = 0

    if (!db) {
      const existing = this.memoryEntries.get(key)
      removedBytes = existing?.sizeBytes || existing?.blob?.size || 0
      this.memoryEntries.delete(key)
    } else {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        removedBytes = req.result?.sizeBytes || req.result?.blob?.size || 0
        store.delete(key)
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    }

    this.cachedTotalBytes = Math.max(0, (this.cachedTotalBytes || 0) - removedBytes)
  }

  private async touchAccessTime(url: string, now: number, existingRecord: CacheEntryRecord): Promise<void> {
    try {
      const updated: CacheEntryRecord = {
        ...existingRecord,
        sizeBytes: existingRecord.sizeBytes || existingRecord.blob?.size || 0,
        createdAt: existingRecord.createdAt || Date.now(),
        lastAccessedAt: now,
      }

      const db = await this.init()
      if (!db) {
        this.memoryEntries.set(url, updated)
      } else {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readwrite")
          const store = tx.objectStore(STORE_NAME)
          const req = store.put(updated)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })
      }
    } catch {}
  }

  /**
   * Fetches image from network and caches in store.
   */
  async cacheImage(originalUrl?: string, type?: "cover" | "screenshot" | "other"): Promise<string | undefined> {
    const resolvedUrl = resolveImageUrl(originalUrl)
    if (!resolvedUrl) return undefined
    const blob = await this.fetchBlob(resolvedUrl, type)
    return blob ? this.createObjectUrl(blob) : undefined
  }

  async fetchBlob(url: string, type?: "cover" | "screenshot" | "other"): Promise<Blob | undefined> {
    const bridge = typeof window !== "undefined" ? window.rtLibrary?.images : undefined
    if (bridge) {
      const requestId = crypto.randomUUID()
      try {
        const res = await bridge.fetch(url, requestId)
        if (res.ok && res.bytes && res.bytes.length > 0) {
          const imageBytes = new Uint8Array(res.bytes.length)
          imageBytes.set(res.bytes)
          const blob = new Blob([imageBytes.buffer], { type: res.contentType || "image/jpeg" })
          await this.putBlob(url, blob, type).catch(() => {})
          await this.removeFailure(url).catch(() => {})
          return blob
        } else {
          const fType: FailureType =
            res.status === "http_404"
              ? "HTTP_404"
              : res.status === "http_403"
              ? "HTTP_403"
              : res.status === "invalid_content_type" || res.status === "html_response"
              ? "INVALID_MIME"
              : res.status === "timeout"
              ? "TIMEOUT"
              : "NETWORK_ERROR"
          await this.recordFailure(url, url, fType).catch(() => {})
          return undefined
        }
      } catch {
        // Fall back to standard web fetch
      }
    }

    try {
      const response = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(10000) })
      const contentType = (response.headers.get("content-type") || "").toLowerCase()

      if (!response.ok) {
        const fType: FailureType =
          response.status === 404 ? "HTTP_404" : response.status === 403 ? "HTTP_403" : "NETWORK_ERROR"
        await this.recordFailure(url, url, fType).catch(() => {})
        return undefined
      }

      if (!contentType.startsWith("image/") || contentType.startsWith("image/svg+xml")) {
        await this.recordFailure(url, url, "INVALID_MIME").catch(() => {})
        return undefined
      }

      const blob = await response.blob()
      if (!blob.size) {
        await this.recordFailure(url, url, "DECODE_ERROR").catch(() => {})
        return undefined
      }

      await this.putBlob(url, blob, type).catch(() => {})
      // Remove any prior failure record for this URL on success
      await this.removeFailure(url).catch(() => {})
      return blob
    } catch (e: any) {
      const fType: FailureType = e?.name === "TimeoutError" || e?.message?.includes("timeout") ? "TIMEOUT" : "NETWORK_ERROR"
      await this.recordFailure(url, url, fType).catch(() => {})
      return undefined
    }
  }

  async putBlob(key: string, blob: Blob, explicitType?: "cover" | "screenshot" | "other"): Promise<void> {
    if (!blob.size || !blob.type.toLowerCase().startsWith("image/") || blob.type.toLowerCase().startsWith("image/svg+xml")) {
      return
    }

    const policy = this.getPolicy()
    if (isSingleImageTooLarge(blob.size, policy.maxSingleImageBytes)) return

    const inferredType: "cover" | "screenshot" | "other" =
      explicitType || (key.startsWith("screenshot:") || key.includes("screenshot") ? "screenshot" : "cover")
    const provider = extractImageProvider(key)
    const expiresAt = policy.expirationDays > 0 ? Date.now() + policy.expirationDays * 86400000 : undefined
    const now = Date.now()

    const db = await this.init()
    let delta = 0

    if (!db) {
      const existing = this.memoryEntries.get(key)
      delta = calculateSizeDelta(existing?.sizeBytes || existing?.blob?.size, blob.size)
      const record: CacheEntryRecord = {
        url: key,
        blob,
        sizeBytes: blob.size,
        createdAt: existing?.createdAt || now,
        lastAccessedAt: now,
        type: inferredType,
        provider,
        expiresAt,
      }
      this.memoryEntries.set(key, record)
    } else {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)

      req.onsuccess = () => {
        const existing: CacheEntryRecord | undefined = req.result
        delta = calculateSizeDelta(existing?.sizeBytes || existing?.blob?.size, blob.size)
        const record: CacheEntryRecord = {
          url: key,
          blob,
          sizeBytes: blob.size,
          createdAt: existing?.createdAt || now,
          lastAccessedAt: now,
          type: inferredType,
          provider,
          expiresAt,
        }
        store.put(record)
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    }

    this.cachedTotalBytes = (this.cachedTotalBytes || 0) + delta

    if (shouldTriggerCleanup(this.cachedTotalBytes, policy)) {
      this.triggerBackgroundCleanup()
    }
  }

  // --- Negative Caching / Failures ---

  async recordFailure(key: string, url: string, failureType: FailureType): Promise<void> {
    try {
      const now = Date.now()
      const ttl = FAILURE_TTLS_MS[failureType] || FAILURE_TTLS_MS.NETWORK_ERROR
      const expiresAt = now + ttl
      const provider = extractImageProvider(url || key)

      const db = await this.init()
      if (!db) {
        const existing = this.memoryFailures.get(key)
        this.memoryFailures.set(key, {
          key,
          url: url || key,
          provider,
          failureType,
          lastFailure: now,
          expiresAt,
          attempts: (existing?.attempts || 0) + 1,
        })
      } else {
        const tx = db.transaction(FAILURES_STORE_NAME, "readwrite")
        const store = tx.objectStore(FAILURES_STORE_NAME)
        const getReq = store.get(key)

        getReq.onsuccess = () => {
          const existing: CacheFailureRecord | undefined = getReq.result
          const attempts = (existing?.attempts || 0) + 1
          const record: CacheFailureRecord = {
            key,
            url: url || key,
            provider,
            failureType,
            lastFailure: now,
            expiresAt,
            attempts,
          }
          store.put(record)
        }

        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }
    } catch {}
  }

  async isNegativeCached(key: string): Promise<boolean> {
    try {
      const db = await this.init()
      if (!db) {
        const record = this.memoryFailures.get(key)
        return !!(record && record.expiresAt > Date.now())
      }

      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(FAILURES_STORE_NAME, "readonly")
        const store = tx.objectStore(FAILURES_STORE_NAME)
        const req = store.get(key)
        req.onsuccess = () => {
          const record: CacheFailureRecord | undefined = req.result
          if (record && record.expiresAt > Date.now()) {
            resolve(true)
          } else {
            resolve(false)
          }
        }
        req.onerror = () => resolve(false)
      })
    } catch {
      return false
    }
  }

  async removeFailure(key: string): Promise<void> {
    try {
      const db = await this.init()
      if (!db) {
        this.memoryFailures.delete(key)
      } else {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(FAILURES_STORE_NAME, "readwrite")
          const store = tx.objectStore(FAILURES_STORE_NAME)
          const req = store.delete(key)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })
      }
    } catch {}
  }

  async clearFailed(): Promise<number> {
    try {
      const db = await this.init()
      if (!db) {
        const count = this.memoryFailures.size
        this.memoryFailures.clear()
        return count
      }

      let count = 0
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FAILURES_STORE_NAME, "readwrite")
        const store = tx.objectStore(FAILURES_STORE_NAME)
        const countReq = store.count()
        countReq.onsuccess = () => {
          count = countReq.result || 0
          store.clear()
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return count
    } catch {
      return 0
    }
  }

  // --- Background & LRU Cleanup ---

  private triggerBackgroundCleanup(): void {
    if (this.isCleaning) return
    setTimeout(() => {
      this.cleanup().catch((err) => {
        console.warn("[IMAGE_CACHE][WARN] Background LRU cleanup error:", err)
      })
    }, 50)
  }

  async cleanup(customTargetBytes?: number): Promise<CleanupResult> {
    if (this.cleanupPromise) {
      return this.cleanupPromise
    }

    const policy = this.getPolicy()
    const targetBytes = typeof customTargetBytes === "number" ? customTargetBytes : getCleanupTargetBytes(policy)
    const startTime = performance.now()

    this.cleanupPromise = (async (): Promise<CleanupResult> => {
      this.isCleaning = true
      try {
        const currentSize = await this.recalculateSize()

        if (currentSize <= targetBytes) {
          return { deletedCount: 0, freedBytes: 0, durationMs: Math.round(performance.now() - startTime) }
        }

        const allRecords = await this.getAllRecordsInternal()
        const { candidates, expectedFreedBytes } = selectEvictionCandidates(allRecords, currentSize, targetBytes)

        if (candidates.length === 0) {
          return { deletedCount: 0, freedBytes: 0, durationMs: Math.round(performance.now() - startTime) }
        }

        const db = await this.init()
        if (!db) {
          for (const item of candidates) {
            this.memoryEntries.delete(item.url)
          }
        } else {
          // Chunked batch deletions to avoid long UI lockups
          const chunkSize = 100
          for (let i = 0; i < candidates.length; i += chunkSize) {
            const chunk = candidates.slice(i, i + chunkSize)
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(STORE_NAME, "readwrite")
              const store = tx.objectStore(STORE_NAME)
              let chunkCompleted = 0
              for (const item of chunk) {
                const req = store.delete(item.url)
                req.onsuccess = () => {
                  chunkCompleted++
                  if (chunkCompleted === chunk.length) resolve()
                }
                req.onerror = () => reject(req.error)
              }
            })
          }
        }

        await this.recalculateSize()
        this.recordLastCleanupTimestamp()
        const durationMs = Math.round(performance.now() - startTime)

        return { deletedCount: candidates.length, freedBytes: expectedFreedBytes, durationMs }
      } finally {
        this.isCleaning = false
        this.cleanupPromise = null
      }
    })()

    return this.cleanupPromise
  }

  private async getAllRecordsInternal(): Promise<CacheEntryRecord[]> {
    const db = await this.init()
    if (!db) {
      return Array.from(this.memoryEntries.values())
    }
    return new Promise<CacheEntryRecord[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  }

  // --- Selective Cache Clearing ---

  async clearCovers(): Promise<number> {
    try {
      const allRecords = await this.getAllRecordsInternal()
      const coverItems = allRecords.filter((r) => r.type === "cover" || (!r.type && !r.url.startsWith("screenshot:")))
      if (coverItems.length === 0) return 0

      const db = await this.init()
      if (!db) {
        for (const item of coverItems) {
          this.memoryEntries.delete(item.url)
        }
      } else {
        const chunkSize = 100
        for (let i = 0; i < coverItems.length; i += chunkSize) {
          const chunk = coverItems.slice(i, i + chunkSize)
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite")
            const store = tx.objectStore(STORE_NAME)
            let count = 0
            for (const item of chunk) {
              const req = store.delete(item.url)
              req.onsuccess = () => {
                count++
                if (count === chunk.length) resolve()
              }
              req.onerror = () => reject(req.error)
            }
          })
        }
      }

      await this.recalculateSize()
      this.recordLastCleanupTimestamp()
      return coverItems.length
    } catch {
      return 0
    }
  }

  async clearScreenshots(): Promise<number> {
    try {
      const allRecords = await this.getAllRecordsInternal()
      const screenshotItems = allRecords.filter((r) => r.type === "screenshot" || r.url.startsWith("screenshot:"))
      if (screenshotItems.length === 0) return 0

      const db = await this.init()
      if (!db) {
        for (const item of screenshotItems) {
          this.memoryEntries.delete(item.url)
        }
      } else {
        const chunkSize = 100
        for (let i = 0; i < screenshotItems.length; i += chunkSize) {
          const chunk = screenshotItems.slice(i, i + chunkSize)
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite")
            const store = tx.objectStore(STORE_NAME)
            let count = 0
            for (const item of chunk) {
              const req = store.delete(item.url)
              req.onsuccess = () => {
                count++
                if (count === chunk.length) resolve()
              }
              req.onerror = () => reject(req.error)
            }
          })
        }
      }

      await this.recalculateSize()
      this.recordLastCleanupTimestamp()
      return screenshotItems.length
    } catch {
      return 0
    }
  }

  async clearExpired(): Promise<number> {
    try {
      const now = Date.now()
      const allRecords = await this.getAllRecordsInternal()
      const expiredItems = allRecords.filter((r) => r.expiresAt && r.expiresAt <= now)
      if (expiredItems.length === 0) return 0

      for (const item of expiredItems) {
        await this.deleteCacheEntry(item.url).catch(() => {})
      }

      await this.recalculateSize()
      return expiredItems.length
    } catch {
      return 0
    }
  }

  async clearCache(): Promise<void> {
    try {
      this.memoryEntries.clear()
      this.memoryFailures.clear()
      const db = await this.init()
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_NAME, FAILURES_STORE_NAME], "readwrite")
          tx.objectStore(STORE_NAME).clear()
          tx.objectStore(FAILURES_STORE_NAME).clear()
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }

      this.cachedTotalBytes = 0
      this.revokeAllObjectUrls()
      this.recordLastCleanupTimestamp()
    } catch {}
  }

  async clear(): Promise<void> {
    return this.clearCache()
  }

  async remove(url: string): Promise<void> {
    const resolvedUrl = resolveImageUrl(url)
    if (!resolvedUrl) return
    await this.deleteCacheEntry(resolvedUrl).catch(() => {})
  }

  // --- Observability & Stats ---

  async getStats(): Promise<ImageCacheDetailedStats> {
    const policy = this.getPolicy()
    try {
      const allRecords = await this.getAllRecordsInternal()
      let allFailures: CacheFailureRecord[] = []

      const db = await this.init()
      if (!db) {
        allFailures = Array.from(this.memoryFailures.values())
      } else {
        allFailures = await new Promise<CacheFailureRecord[]>((resolve) => {
          const tx = db.transaction(FAILURES_STORE_NAME, "readonly")
          const store = tx.objectStore(FAILURES_STORE_NAME)
          const req = store.getAll()
          req.onsuccess = () => resolve(req.result || [])
          req.onerror = () => resolve([])
        })
      }

      const now = Date.now()
      let totalBytes = 0
      let coversCount = 0
      let coversBytes = 0
      let screenshotsCount = 0
      let screenshotsBytes = 0
      let otherCount = 0
      let otherBytes = 0
      let expiredCount = 0

      const providerMap = new Map<string, { count: number; bytes: number }>()

      for (const item of allRecords) {
        const size = item.sizeBytes || item.blob?.size || 0
        totalBytes += size

        const isExpired = item.expiresAt && item.expiresAt <= now
        if (isExpired) expiredCount++

        const type = item.type || (item.url.startsWith("screenshot:") ? "screenshot" : "cover")
        if (type === "cover") {
          coversCount++
          coversBytes += size
        } else if (type === "screenshot") {
          screenshotsCount++
          screenshotsBytes += size
        } else {
          otherCount++
          otherBytes += size
        }

        const provider = item.provider || extractImageProvider(item.url)
        const curr = providerMap.get(provider) || { count: 0, bytes: 0 }
        curr.count++
        curr.bytes += size
        providerMap.set(provider, curr)
      }

      this.cachedTotalBytes = totalBytes

      // Count active unexpired failures
      const activeFailures = allFailures.filter((f) => f.expiresAt > now)

      // Calculate provider breakdown (Top 5 + Other)
      const sortedProviders = Array.from(providerMap.entries()).sort((a, b) => b[1].bytes - a[1].bytes)
      const top5 = sortedProviders.slice(0, 5)
      const rest = sortedProviders.slice(5)

      const providerStats: ProviderStorageStat[] = top5.map(([provider, stat]) => ({
        provider,
        count: stat.count,
        bytes: stat.bytes,
        sizeFormatted: formatBytes(stat.bytes),
        percent: totalBytes > 0 ? parseFloat(((stat.bytes / totalBytes) * 100).toFixed(1)) : 0,
      }))

      if (rest.length > 0) {
        let restCount = 0
        let restBytes = 0
        for (const [, stat] of rest) {
          restCount += stat.count
          restBytes += stat.bytes
        }
        providerStats.push({
          provider: "Other",
          count: restCount,
          bytes: restBytes,
          sizeFormatted: formatBytes(restBytes),
          percent: totalBytes > 0 ? parseFloat(((restBytes / totalBytes) * 100).toFixed(1)) : 0,
        })
      }

      const utilization = parseFloat(((totalBytes / policy.maxSizeBytes) * 100).toFixed(1))
      const healthStatus = calculateCacheHealth(totalBytes, policy, this.isCleaning)
      const quota = await this.getStorageQuota()

      return {
        count: allRecords.length,
        totalBytes,
        maxBytes: policy.maxSizeBytes,
        utilizationPercent: utilization,
        totalSizeFormatted: formatBytes(totalBytes),
        coversCount,
        coversBytes,
        coversSizeFormatted: formatBytes(coversBytes),
        screenshotsCount,
        screenshotsBytes,
        screenshotsSizeFormatted: formatBytes(screenshotsBytes),
        otherCount,
        otherBytes,
        otherSizeFormatted: formatBytes(otherBytes),
        failedCount: activeFailures.length,
        expiredCount,
        healthStatus,
        providers: providerStats,
        lastCleanupAt: this.getLastCleanupTimestamp(),
        quota,
      }
    } catch {
      return {
        count: 0,
        totalBytes: 0,
        maxBytes: policy.maxSizeBytes,
        utilizationPercent: 0,
        totalSizeFormatted: "0 B",
        coversCount: 0,
        coversBytes: 0,
        coversSizeFormatted: "0 B",
        screenshotsCount: 0,
        screenshotsBytes: 0,
        screenshotsSizeFormatted: "0 B",
        otherCount: 0,
        otherBytes: 0,
        otherSizeFormatted: "0 B",
        failedCount: 0,
        expiredCount: 0,
        healthStatus: "healthy",
        providers: [],
        lastCleanupAt: this.getLastCleanupTimestamp(),
      }
    }
  }

  // --- Object URL Management ---

  revokeObjectUrl(objectUrl: string): void {
    if (objectUrl && objectUrl.startsWith("blob:")) {
      try {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(objectUrl)
        }
        this.activeObjectUrls.delete(objectUrl)
      } catch {}
    }
  }

  revokeAllObjectUrls(): void {
    for (const url of this.activeObjectUrls) {
      try {
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url)
        }
      } catch {}
    }
    this.activeObjectUrls.clear()
  }

  async getStorageQuota(): Promise<{ usage?: number; quota?: number; usageFormatted?: string; quotaFormatted?: string }> {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.estimate === "function") {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          usage: estimate.usage,
          quota: estimate.quota,
          usageFormatted: estimate.usage ? formatBytes(estimate.usage) : undefined,
          quotaFormatted: estimate.quota ? formatBytes(estimate.quota) : undefined,
        }
      } catch {}
    }
    return {}
  }
}

export const imageCache = new ImageCacheService()
export const imageCacheService = imageCache
