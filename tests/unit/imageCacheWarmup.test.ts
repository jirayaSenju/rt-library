import { describe, it, expect, vi, beforeEach } from "vitest"
import { imageCacheWarmupService } from "@/services/imageCacheWarmup"
import { imageCacheService } from "@/services/imageCache"
import { nativeLibraryService } from "@/services/nativeLibrary"

describe("ImageCacheWarmupService unit tests", () => {
  beforeEach(async () => {
    localStorage.clear()
    await imageCacheService.clear().catch(() => {})
    imageCacheWarmupService.reset()
    vi.restoreAllMocks()
  })

  it("handles empty library gracefully", async () => {
    vi.spyOn(nativeLibraryService, "getAllImageUrls").mockResolvedValueOnce({
      items: [],
      totalCovers: 0,
      totalScreenshots: 0,
    })

    await imageCacheWarmupService.start({ target: "all" })
    const progress = imageCacheWarmupService.getProgress()

    expect(progress.status).toBe("completed")
    expect(progress.totalImages).toBe(0)
    expect(progress.percent).toBe(100)
  })

  it("extracts covers and screenshots from catalog and skips existing blobs", async () => {
    const mockItems = [
      {
        id: "item_1",
        title: "Super Mario Odyssey",
        coverUrl: "https://i.fastpic.org/big/2026/0101/mario.jpg",
        screenshots: [
          "https://i.fastpic.org/big/2026/0101/mario_screen1.jpg",
          "https://i.fastpic.org/big/2026/0101/mario_screen2.jpg",
        ],
      },
      {
        id: "item_2",
        title: "Metroid Dread",
        coverUrl: "https://i.fastpic.org/big/2026/0101/metroid.jpg",
        screenshots: [],
      },
    ]

    vi.spyOn(nativeLibraryService, "getAllImageUrls").mockResolvedValueOnce({
      items: mockItems,
      totalCovers: 2,
      totalScreenshots: 2,
    })

    // Pre-cache one image
    const preCachedBlob = new Blob(["mock-image-bytes"], { type: "image/jpeg" })
    await imageCacheService.putBlob("https://i.fastpic.org/big/2026/0101/mario.jpg", preCachedBlob)

    // Mock fetchBlob for missing images
    vi.spyOn(imageCacheService, "fetchBlob").mockImplementation(async (url) => {
      return new Blob([`bytes-for-${url}`], { type: "image/jpeg" })
    })

    await imageCacheWarmupService.start({ target: "all", skipExisting: true })
    const progress = imageCacheWarmupService.getProgress()

    expect(progress.status).toBe("completed")
    expect(progress.totalImages).toBe(4) // 2 covers + 2 screenshots
    expect(progress.alreadyCached).toBe(1) // mario cover
    expect(progress.cachedSuccess).toBe(3) // 2 screenshots + 1 metroid cover
    expect(progress.processedImages).toBe(4)
    expect(progress.percent).toBe(100)
    expect(progress.bytesAdded).toBeGreaterThan(0)
  })

  it("filters scope when target is covers only or screenshots only", async () => {
    const mockItems = [
      {
        id: "item_1",
        title: "Zelda Tears of the Kingdom",
        coverUrl: "https://i.fastpic.org/big/2026/0101/zelda.jpg",
        screenshots: [
          "https://i.fastpic.org/big/2026/0101/zelda_screen1.jpg",
        ],
      },
    ]

    vi.spyOn(nativeLibraryService, "getAllImageUrls").mockResolvedValue({
      items: mockItems,
      totalCovers: 1,
      totalScreenshots: 1,
    })

    vi.spyOn(imageCacheService, "fetchBlob").mockImplementation(async () => {
      return new Blob(["image-content"], { type: "image/jpeg" })
    })

    // 1. Covers only
    imageCacheWarmupService.reset()
    await imageCacheWarmupService.start({ target: "covers" })
    expect(imageCacheWarmupService.getProgress().totalImages).toBe(1)

    // 2. Screenshots only
    imageCacheWarmupService.reset()
    await imageCacheWarmupService.start({ target: "screenshots" })
    expect(imageCacheWarmupService.getProgress().totalImages).toBe(1)
  })

  it("supports pause, resume, and cancel controls", async () => {
    const mockItems = Array.from({ length: 50 }, (_, i) => ({
      id: `item_${i}`,
      title: `Game ${i}`,
      coverUrl: `https://i.fastpic.org/big/2026/0101/game_${i}.jpg`,
      screenshots: [],
    }))

    vi.spyOn(nativeLibraryService, "getAllImageUrls").mockResolvedValueOnce({
      items: mockItems,
      totalCovers: 50,
      totalScreenshots: 0,
    })

    vi.spyOn(imageCacheService, "fetchBlob").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return new Blob(["blob"], { type: "image/jpeg" })
    })

    const runPromise = imageCacheWarmupService.start({ target: "all", concurrency: 2 })

    // Pause
    imageCacheWarmupService.pause()
    expect(imageCacheWarmupService.getProgress().status).toBe("paused")

    // Resume
    imageCacheWarmupService.resume()
    expect(imageCacheWarmupService.getProgress().status).toBe("running")

    // Cancel
    imageCacheWarmupService.cancel()
    expect(imageCacheWarmupService.getProgress().status).toBe("cancelled")

    await runPromise
  })
})

