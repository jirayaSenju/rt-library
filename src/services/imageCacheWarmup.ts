import { imageCacheService } from "./imageCache"
import { nativeLibraryService } from "./nativeLibrary"
import { resolveImageUrl } from "../utils/imageResolver"
import { formatBytes } from "./imageCachePolicy"

export type CacheWarmupTarget = "all" | "covers" | "screenshots"

export type CacheWarmupStatus = "idle" | "running" | "paused" | "completed" | "cancelled" | "error"

export interface CacheWarmupProgress {
  status: CacheWarmupStatus
  target: CacheWarmupTarget
  totalImages: number
  processedImages: number
  cachedSuccess: number
  alreadyCached: number
  failedCount: number
  currentImageTitle?: string
  currentImageUrl?: string
  currentType?: "cover" | "screenshot"
  percent: number
  bytesAdded: number
  bytesAddedFormatted: string
  startTime: number | null
  elapsedMs: number
  estimatedRemainingMs: number | null
  speedImagesPerSec: number
  error?: string
}

export interface StartCacheWarmupOptions {
  target?: CacheWarmupTarget
  skipExisting?: boolean
  concurrency?: number
}

interface QueueItem {
  itemId: string
  title: string
  url: string
  type: "cover" | "screenshot"
}

type ProgressListener = (progress: CacheWarmupProgress) => void

export class ImageCacheWarmupService {
  private status: CacheWarmupStatus = "idle"
  private target: CacheWarmupTarget = "all"
  private totalImages = 0
  private processedImages = 0
  private cachedSuccess = 0
  private alreadyCached = 0
  private failedCount = 0
  private bytesAdded = 0
  private currentImageTitle?: string
  private currentImageUrl?: string
  private currentType?: "cover" | "screenshot"
  private startTime: number | null = null
  private elapsedMs = 0
  private estimatedRemainingMs: number | null = null
  private speedImagesPerSec = 0
  private errorMsg?: string

  private queue: QueueItem[] = []
  private currentIndex = 0
  private isCancelled = false
  private isPaused = false
  private resumeResolve: (() => void) | null = null
  private listeners = new Set<ProgressListener>()
  private lastEmitTime = 0
  private activeRunPromise: Promise<void> | null = null

  getProgress(): CacheWarmupProgress {
    const percent = this.totalImages > 0
      ? Math.min(100, Math.max(0, Math.round((this.processedImages / this.totalImages) * 100)))
      : this.status === "completed"
      ? 100
      : 0

    return {
      status: this.status,
      target: this.target,
      totalImages: this.totalImages,
      processedImages: this.processedImages,
      cachedSuccess: this.cachedSuccess,
      alreadyCached: this.alreadyCached,
      failedCount: this.failedCount,
      currentImageTitle: this.currentImageTitle,
      currentImageUrl: this.currentImageUrl,
      currentType: this.currentType,
      percent,
      bytesAdded: this.bytesAdded,
      bytesAddedFormatted: formatBytes(this.bytesAdded),
      startTime: this.startTime,
      elapsedMs: this.elapsedMs,
      estimatedRemainingMs: this.estimatedRemainingMs,
      speedImagesPerSec: this.speedImagesPerSec,
      error: this.errorMsg,
    }
  }

  subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    listener(this.getProgress())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(force = false): void {
    const now = performance.now()
    if (!force && now - this.lastEmitTime < 80) {
      return
    }
    this.lastEmitTime = now
    const snapshot = this.getProgress()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (err) {
        console.warn("[IMAGE_CACHE_WARMUP][WARN] Error in progress listener:", err)
      }
    }
  }

  async start(options: StartCacheWarmupOptions = {}): Promise<void> {
    if (this.status === "running") {
      return this.activeRunPromise || Promise.resolve()
    }

    if (this.status === "paused") {
      this.resume()
      return this.activeRunPromise || Promise.resolve()
    }

    const target = options.target || "all"
    const skipExisting = options.skipExisting !== false
    const concurrency = Math.min(8, Math.max(1, options.concurrency || 4))

    this.target = target
    this.status = "running"
    this.isCancelled = false
    this.isPaused = false
    this.errorMsg = undefined
    this.processedImages = 0
    this.cachedSuccess = 0
    this.alreadyCached = 0
    this.failedCount = 0
    this.bytesAdded = 0
    this.currentIndex = 0
    this.currentImageTitle = undefined
    this.currentImageUrl = undefined
    this.currentType = undefined
    this.startTime = Date.now()
    this.elapsedMs = 0
    this.estimatedRemainingMs = null
    this.speedImagesPerSec = 0
    this.notifyListeners(true)

    this.activeRunPromise = (async () => {
      try {
        // 1. Fetch library image targets
        const libraryData = await nativeLibraryService.getAllImageUrls()
        const rawQueue: QueueItem[] = []

        for (const item of libraryData.items) {
          if ((target === "all" || target === "covers") && item.coverUrl) {
            rawQueue.push({
              itemId: item.id,
              title: item.title,
              url: item.coverUrl,
              type: "cover",
            })
          }
          if ((target === "all" || target === "screenshots") && Array.isArray(item.screenshots)) {
            for (const sUrl of item.screenshots) {
              if (sUrl && typeof sUrl === "string") {
                rawQueue.push({
                  itemId: item.id,
                  title: item.title,
                  url: sUrl,
                  type: "screenshot",
                })
              }
            }
          }
        }

        // Deduplicate URLs while preserving title info
        const seenUrls = new Set<string>()
        this.queue = []
        for (const qItem of rawQueue) {
          const resolved = resolveImageUrl(qItem.url)
          if (resolved && !seenUrls.has(resolved)) {
            seenUrls.add(resolved)
            this.queue.push({
              ...qItem,
              url: resolved,
            })
          }
        }

        this.totalImages = this.queue.length
        this.notifyListeners(true)

        if (this.totalImages === 0) {
          this.status = "completed"
          this.notifyListeners(true)
          return
        }

        // 2. Concurrency Pool
        const workers = Array.from({ length: concurrency }, () => this.runWorker(skipExisting))
        await Promise.all(workers)

        if (this.isCancelled) {
          this.status = "cancelled"
        } else {
          this.status = "completed"
          await imageCacheService.recalculateSize().catch(() => {})
        }
      } catch (err: any) {
        this.status = "error"
        this.errorMsg = err?.message || "Failed to generate image cache"
      } finally {
        this.elapsedMs = this.startTime ? Date.now() - this.startTime : 0
        this.notifyListeners(true)
        this.activeRunPromise = null
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("rt-library-image-cache-warmup-completed", {
              detail: this.getProgress(),
            })
          )
        }
      }
    })()

    return this.activeRunPromise
  }

  private async runWorker(skipExisting: boolean): Promise<void> {
    while (this.currentIndex < this.queue.length) {
      if (this.isCancelled) {
        break
      }

      if (this.isPaused) {
        await new Promise<void>((resolve) => {
          this.resumeResolve = resolve
        })
      }

      if (this.isCancelled) {
        break
      }

      const item = this.queue[this.currentIndex++]
      if (!item) break

      this.currentImageTitle = item.title
      this.currentImageUrl = item.url
      this.currentType = item.type

      const resolvedUrl = resolveImageUrl(item.url)
      if (!resolvedUrl) {
        this.failedCount++
        this.processedImages++
        this.updateSpeedAndNotify()
        continue
      }

      // Check if already cached
      if (skipExisting) {
        try {
          const existingBlob = await imageCacheService.getBlob(resolvedUrl)
          if (existingBlob && existingBlob.size > 0) {
            this.alreadyCached++
            this.processedImages++
            this.updateSpeedAndNotify()
            continue
          }
        } catch {}
      }

      // Fetch and store blob in cache
      try {
        const blob = await imageCacheService.fetchBlob(resolvedUrl, item.type)
        if (blob && blob.size > 0) {
          this.cachedSuccess++
          this.bytesAdded += blob.size
        } else {
          this.failedCount++
        }
      } catch {
        this.failedCount++
      }

      this.processedImages++
      this.updateSpeedAndNotify()
    }
  }

  private updateSpeedAndNotify(): void {
    const now = Date.now()
    if (this.startTime) {
      this.elapsedMs = now - this.startTime
      const elapsedSec = Math.max(0.1, this.elapsedMs / 1000)
      this.speedImagesPerSec = parseFloat((this.processedImages / elapsedSec).toFixed(1))
      const remainingImages = Math.max(0, this.totalImages - this.processedImages)
      this.estimatedRemainingMs =
        this.speedImagesPerSec > 0 ? Math.round((remainingImages / this.speedImagesPerSec) * 1000) : null
    }
    this.notifyListeners(false)
  }

  pause(): void {
    if (this.status === "running") {
      this.isPaused = true
      this.status = "paused"
      this.notifyListeners(true)
    }
  }

  resume(): void {
    if (this.status === "paused") {
      this.isPaused = false
      this.status = "running"
      if (this.resumeResolve) {
        const resolve = this.resumeResolve
        this.resumeResolve = null
        resolve()
      }
      this.notifyListeners(true)
    }
  }

  cancel(): void {
    if (this.status === "running" || this.status === "paused") {
      this.isCancelled = true
      this.isPaused = false
      this.status = "cancelled"
      if (this.resumeResolve) {
        const resolve = this.resumeResolve
        this.resumeResolve = null
        resolve()
      }
      this.notifyListeners(true)
    }
  }

  reset(): void {
    if (this.status === "running" || this.status === "paused") {
      this.cancel()
    }
    this.status = "idle"
    this.totalImages = 0
    this.processedImages = 0
    this.cachedSuccess = 0
    this.alreadyCached = 0
    this.failedCount = 0
    this.bytesAdded = 0
    this.currentImageTitle = undefined
    this.currentImageUrl = undefined
    this.currentType = undefined
    this.startTime = null
    this.elapsedMs = 0
    this.estimatedRemainingMs = null
    this.speedImagesPerSec = 0
    this.errorMsg = undefined
    this.notifyListeners(true)
  }
}

export const imageCacheWarmupService = new ImageCacheWarmupService()

