import { describe, it, expect } from "vitest"
import {
  extractImageProvider,
  shouldTriggerCleanup,
  calculateCacheHealth,
  getCleanupTargetBytes,
  selectEvictionCandidates,
  formatBytes,
  DEFAULT_IMAGE_CACHE_POLICY,
  ImageCachePolicyConfig,
  FAILURE_TTLS_MS,
  calculateSizeDelta,
  isSingleImageTooLarge,
} from "@/services/imageCachePolicy"

describe("imageCachePolicy unit tests (V3-16)", () => {
  describe("Provider Extraction", () => {
    it("identifies FastPic URLs correctly", () => {
      expect(extractImageProvider("https://i128.fastpic.org/big/2026/1001/9b/abc.jpeg")).toBe("FastPic")
      expect(extractImageProvider("https://fastpic.ru/view/1/2/3/x.jpg.html")).toBe("FastPic")
    })

    it("identifies ImageBan URLs correctly", () => {
      expect(extractImageProvider("https://i4.imageban.ru/out/2026/09/28/fc9753b4.jpg")).toBe("ImageBan")
    })

    it("identifies ImageBam URLs correctly", () => {
      expect(extractImageProvider("https://images4.imagebam.com/88/18/a8/ME1BKPS4.jpg")).toBe("ImageBam")
    })

    it("identifies PostImg URLs correctly", () => {
      expect(extractImageProvider("https://i.postimg.cc/image/abc12345/.jpg")).toBe("PostImg")
    })

    it("identifies RuTracker URLs correctly", () => {
      expect(extractImageProvider("https://static.rutracker.org/covers/123.jpg")).toBe("RuTracker")
    })

    it("falls back to domain name or Other for arbitrary URLs", () => {
      expect(extractImageProvider("https://imgur.com/gallery/123.png")).toBe("Imgur")
      expect(extractImageProvider("")).toBe("other")
      expect(extractImageProvider(undefined)).toBe("other")
    })
  })

  describe("Cache Health Calculation", () => {
    const policy: ImageCachePolicyConfig = {
      maxSizeBytes: 100 * 1024 * 1024, // 100 MB
      cleanupThresholdPercent: 90, // 90 MB
      cleanupTargetPercent: 75, // 75 MB
      maxSingleImageBytes: 15 * 1024 * 1024,
      autoCleanup: true,
      expirationDays: 0,
    }

    it("returns 'healthy' when utilization is below 80%", () => {
      expect(calculateCacheHealth(50 * 1024 * 1024, policy)).toBe("healthy")
      expect(calculateCacheHealth(79 * 1024 * 1024, policy)).toBe("healthy")
    })

    it("returns 'near_limit' when utilization is between 80% and threshold (90%)", () => {
      expect(calculateCacheHealth(80 * 1024 * 1024, policy)).toBe("near_limit")
      expect(calculateCacheHealth(89 * 1024 * 1024, policy)).toBe("near_limit")
    })

    it("returns 'cleanup_recommended' when utilization reaches or exceeds threshold", () => {
      expect(calculateCacheHealth(90 * 1024 * 1024, policy)).toBe("cleanup_recommended")
      expect(calculateCacheHealth(99 * 1024 * 1024, policy)).toBe("cleanup_recommended")
    })

    it("returns 'cleaning' when isCleaning is true", () => {
      expect(calculateCacheHealth(50 * 1024 * 1024, policy, true)).toBe("cleaning")
    })
  })

  describe("Cleanup Trigger & Target Calculation", () => {
    it("triggers cleanup only when total exceeds threshold and autoCleanup is on", () => {
      const policy = { ...DEFAULT_IMAGE_CACHE_POLICY, maxSizeBytes: 500 * 1024 * 1024, cleanupThresholdPercent: 90 }
      expect(shouldTriggerCleanup(449 * 1024 * 1024, policy)).toBe(false)
      expect(shouldTriggerCleanup(450 * 1024 * 1024, policy)).toBe(true)
      expect(shouldTriggerCleanup(451 * 1024 * 1024, policy)).toBe(true)

      const disabledPolicy = { ...policy, autoCleanup: false }
      expect(shouldTriggerCleanup(499 * 1024 * 1024, disabledPolicy)).toBe(false)
    })

    it("computes cleanup target bytes accurately", () => {
      const policy = { ...DEFAULT_IMAGE_CACHE_POLICY, maxSizeBytes: 500 * 1024 * 1024, cleanupTargetPercent: 75 }
      expect(getCleanupTargetBytes(policy)).toBe(375 * 1024 * 1024)
    })
  })

  describe("LRU Eviction Candidate Selection", () => {
    it("selects oldest items first until remaining size is under target", () => {
      const entries = [
        { url: "img1", sizeBytes: 10 * 1024 * 1024, lastAccessedAt: 1000 },
        { url: "img2", sizeBytes: 20 * 1024 * 1024, lastAccessedAt: 2000 },
        { url: "img3", sizeBytes: 30 * 1024 * 1024, lastAccessedAt: 3000 },
        { url: "img4", sizeBytes: 40 * 1024 * 1024, lastAccessedAt: 4000 },
      ]
      const totalBytes = 100 * 1024 * 1024 // 100 MB
      const targetBytes = 60 * 1024 * 1024 // 60 MB

      const { candidates, expectedFreedBytes, expectedFinalSize } = selectEvictionCandidates(
        entries,
        totalBytes,
        targetBytes
      )

      // Needs to evict 40 MB: img1 (10MB) + img2 (20MB) + img3 (30MB) = 60MB evicted, remaining 40MB <= 60MB
      expect(candidates.map((c) => c.url)).toEqual(["img1", "img2", "img3"])
      expect(expectedFreedBytes).toBe(60 * 1024 * 1024)
      expect(expectedFinalSize).toBe(40 * 1024 * 1024)
    })

    it("returns empty candidates when already below target", () => {
      const entries = [{ url: "img1", sizeBytes: 10 * 1024 * 1024, lastAccessedAt: 1000 }]
      const { candidates } = selectEvictionCandidates(entries, 10 * 1024 * 1024, 50 * 1024 * 1024)
      expect(candidates).toHaveLength(0)
    })
  })

  describe("Failure TTLs & Single Image Bounds", () => {
    it("defines proper failure TTL durations", () => {
      expect(FAILURE_TTLS_MS.HTTP_404).toBe(24 * 60 * 60 * 1000)
      expect(FAILURE_TTLS_MS.HTTP_403).toBe(6 * 60 * 60 * 1000)
      expect(FAILURE_TTLS_MS.TIMEOUT).toBe(30 * 60 * 1000)
      expect(FAILURE_TTLS_MS.INVALID_MIME).toBe(24 * 60 * 60 * 1000)
    })

    it("evaluates single image limit and size deltas", () => {
      expect(isSingleImageTooLarge(16 * 1024 * 1024, 15 * 1024 * 1024)).toBe(true)
      expect(isSingleImageTooLarge(10 * 1024 * 1024, 15 * 1024 * 1024)).toBe(false)

      expect(calculateSizeDelta(100, 150)).toBe(50)
      expect(calculateSizeDelta(null, 150)).toBe(150)
    })

    it("formats bytes into human readable format", () => {
      expect(formatBytes(0)).toBe("0 B")
      expect(formatBytes(1024)).toBe("1 KB")
      expect(formatBytes(1024 * 1024 * 428)).toBe("428 MB")
      expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe("1.5 GB")
    })
  })
})

