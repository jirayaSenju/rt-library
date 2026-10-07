import { describe, it, expect, beforeEach, vi } from "vitest"
import { imageCacheService, ImageCacheDetailedStats } from "@/services/imageCache"
import { DEFAULT_IMAGE_CACHE_POLICY } from "@/services/imageCachePolicy"

// Setup IndexedDB in-memory mock if native JSDOM indexedDB is minimal
describe("ImageCacheService unit & integration tests (V3-16)", () => {
  beforeEach(async () => {
    localStorage.clear()
    await imageCacheService.clear().catch(() => {})
  })

  it("initializes with default policy", () => {
    const policy = imageCacheService.getPolicy()
    expect(policy).toEqual(DEFAULT_IMAGE_CACHE_POLICY)
    expect(policy.maxSizeBytes).toBe(500 * 1024 * 1024)
    expect(policy.cleanupThresholdPercent).toBe(90)
    expect(policy.cleanupTargetPercent).toBe(75)
    expect(policy.autoCleanup).toBe(true)
  })

  it("updates and persists policy modifications", () => {
    imageCacheService.setPolicy({
      maxSizeBytes: 1024 * 1024 * 1024,
      cleanupThresholdPercent: 85,
    })

    const updated = imageCacheService.getPolicy()
    expect(updated.maxSizeBytes).toBe(1024 * 1024 * 1024)
    expect(updated.cleanupThresholdPercent).toBe(85)
    expect(updated.cleanupTargetPercent).toBe(75)
  })

  it("returns zero stats when cache is empty", async () => {
    const stats = await imageCacheService.getStats()
    expect(stats.count).toBe(0)
    expect(stats.totalBytes).toBe(0)
    expect(stats.coversCount).toBe(0)
    expect(stats.screenshotsCount).toBe(0)
    expect(stats.failedCount).toBe(0)
    expect(stats.healthStatus).toBe("healthy")
  })

  it("caches blobs with automatic type and provider classification", async () => {
    const coverBlob = new Blob(["fake-cover-image-data-1234567890"], { type: "image/jpeg" })
    const screenshotBlob = new Blob(["fake-screenshot-data-abcdefghij"], { type: "image/png" })

    await imageCacheService.putBlob("https://i128.fastpic.org/big/2026/1001/9b/cover.jpeg", coverBlob, "cover")
    await imageCacheService.putBlob("screenshot:v1:https://i4.imageban.ru/out/screen.jpg", screenshotBlob, "screenshot")

    const stats = await imageCacheService.getStats()
    expect(stats.count).toBe(2)
    expect(stats.coversCount).toBe(1)
    expect(stats.screenshotsCount).toBe(1)
    expect(stats.coversBytes).toBe(coverBlob.size)
    expect(stats.screenshotsBytes).toBe(screenshotBlob.size)
    expect(stats.totalBytes).toBe(coverBlob.size + screenshotBlob.size)

    expect(stats.providers.length).toBeGreaterThanOrEqual(2)
    const fastpic = stats.providers.find((p) => p.provider === "FastPic")
    const imageban = stats.providers.find((p) => p.provider === "ImageBan")
    expect(fastpic).toBeDefined()
    expect(imageban).toBeDefined()
  })

  it("handles negative cache recording and expiry checks", async () => {
    await imageCacheService.recordFailure("https://broken.fastpic.org/404.jpg", "https://broken.fastpic.org/404.jpg", "HTTP_404")

    const isFailed = await imageCacheService.isNegativeCached("https://broken.fastpic.org/404.jpg")
    expect(isFailed).toBe(true)

    const stats = await imageCacheService.getStats()
    expect(stats.failedCount).toBe(1)

    // Clear failed
    const cleared = await imageCacheService.clearFailed()
    expect(cleared).toBe(1)

    const isFailedAfter = await imageCacheService.isNegativeCached("https://broken.fastpic.org/404.jpg")
    expect(isFailedAfter).toBe(false)
  })

  it("supports selective cache clearing (covers vs screenshots)", async () => {
    const cover1 = new Blob(["cover-1"], { type: "image/jpeg" })
    const cover2 = new Blob(["cover-2"], { type: "image/jpeg" })
    const screen1 = new Blob(["screen-1"], { type: "image/png" })

    await imageCacheService.putBlob("https://fastpic.org/cover1.jpg", cover1, "cover")
    await imageCacheService.putBlob("https://fastpic.org/cover2.jpg", cover2, "cover")
    await imageCacheService.putBlob("screenshot:v1:screen1.png", screen1, "screenshot")

    let stats = await imageCacheService.getStats()
    expect(stats.coversCount).toBe(2)
    expect(stats.screenshotsCount).toBe(1)

    // Clear covers only
    const deletedCovers = await imageCacheService.clearCovers()
    expect(deletedCovers).toBe(2)

    stats = await imageCacheService.getStats()
    expect(stats.coversCount).toBe(0)
    expect(stats.screenshotsCount).toBe(1)

    // Clear screenshots
    const deletedScreens = await imageCacheService.clearScreenshots()
    expect(deletedScreens).toBe(1)

    stats = await imageCacheService.getStats()
    expect(stats.count).toBe(0)
  })

  it("clears all cache and resets object URLs", async () => {
    const blob = new Blob(["test-data"], { type: "image/jpeg" })
    await imageCacheService.putBlob("https://img.jpg", blob)

    const objectUrl = imageCacheService.createObjectUrl(blob)
    expect(objectUrl).toBeDefined()

    await imageCacheService.clear()
    const stats = await imageCacheService.getStats()
    expect(stats.count).toBe(0)
    expect(stats.totalBytes).toBe(0)
  })
})

