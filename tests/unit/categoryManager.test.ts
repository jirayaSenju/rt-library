import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "fs"
import path from "path"
import os from "os"

// Mock electron app before requiring categoryManager
let testConfigDir: string

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => testConfigDir),
  },
}))

describe("categoryManager unit tests", () => {
  let categoryManager: any

  beforeEach(async () => {
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "rt-categories-test-"))
    process.env.RT_LIBRARY_USER_DATA_DIR = testConfigDir
    vi.resetModules()
    const { CategoryManager } = await import("../../electron/scraper/categoryManager.cjs")
    CategoryManager.instance = null
    categoryManager = CategoryManager.getInstance()
  })

  afterEach(() => {
    delete process.env.RT_LIBRARY_USER_DATA_DIR
    try {
      if (fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true, force: true })
      }
    } catch (_) {}
  })

  it("resolves built-in default categories when no config file exists", () => {
    const categories = categoryManager.getResolvedCategories()
    expect(categories).toHaveLength(16)

    const expectedIds = [
      "switch",
      "psx",
      "ps2",
      "psp",
      "ps3",
      "ps4",
      "ps5",
      "psvita",
      "xbox",
      "xbox360",
      "wii",
      "gamecube",
      "wiiu",
      "ds",
      "3ds",
      "dreamcast",
    ]

    const actualIds = categories.map((c: any) => c.id)
    expect(actualIds).toEqual(expectedIds)

    // Verify dreamcast built-in
    const dreamcast = categories.find((c: any) => c.id === "dreamcast")
    expect(dreamcast).toBeDefined()
    expect(dreamcast.name).toBe("Sega Dreamcast")
    expect(dreamcast.group).toBe("sega")
    expect(dreamcast.baseUrl).toBe("https://rutracker.org/forum/viewforum.php?f=968")
    expect(dreamcast.titleSearch).toEqual(["[Dreamcast]"])
    expect(dreamcast.enabled).toBe(true)
    expect(dreamcast.builtIn).toBe(true)

    // Verify GBA is not built-in
    expect(actualIds.includes("gba")).toBe(false)
    expect(actualIds.includes("game-boy-advance")).toBe(false)

    // Verify every category has valid structure and NO priority
    for (const cat of categories) {
      expect(cat.priority).toBeUndefined()
      expect(Array.isArray(cat.titleSearch)).toBe(true)
      expect(cat.titleSearch.length).toBeGreaterThan(0)
      expect(["nintendo", "playstation", "xbox", "sega", "other"]).toContain(cat.group)
      expect(cat.baseUrl).toMatch(/^https:\/\/rutracker\.org\/forum\/viewforum\.php\?f=\d+$/)
      expect(cat.builtIn).toBe(true)
    }
  })

  it("enforces exact parity between electron defaultCategories.cjs and src defaultCategories.ts", async () => {
    const cjsDefaults = (await import("../../electron/scraper/defaultCategories.cjs")).DEFAULT_CATEGORIES
    const tsDefaults = (await import("../../src/scraper/defaultCategories")).DEFAULT_CATEGORIES

    expect(cjsDefaults).toHaveLength(16)
    expect(tsDefaults).toHaveLength(16)
    expect(cjsDefaults).toEqual(tsDefaults)
  })

  it("validates valid and invalid category IDs", () => {
    expect(categoryManager.validateId("ps2")).toBe("ps2")
    expect(categoryManager.validateId("sega-saturn")).toBe("sega-saturn")
    expect(categoryManager.validateId("nintendo-switch-oled")).toBe("nintendo-switch-oled")
    expect(categoryManager.validateId("n64")).toBe("n64")

    expect(() => categoryManager.validateId("")).toThrow(/Category ID is required/)
    expect(() => categoryManager.validateId("PS2!")).toThrow(/Category ID must contain only/)
    expect(() => categoryManager.validateId("sega_saturn")).toThrow(/Category ID must contain only/)
    expect(() => categoryManager.validateId("-ps2")).toThrow(/Category ID must contain only/)
    expect(() => categoryManager.validateId("ps2-")).toThrow(/Category ID must contain only/)
  })

  it("validates RuTracker forum URLs", () => {
    expect(categoryManager.validateUrl("https://rutracker.org/forum/viewforum.php?f=357")).toBe(
      "https://rutracker.org/forum/viewforum.php?f=357"
    )
    expect(categoryManager.validateUrl("https://rutracker.org/forum/viewforum.php?f=1605")).toBe(
      "https://rutracker.org/forum/viewforum.php?f=1605"
    )

    expect(() => categoryManager.validateUrl("")).toThrow(/RuTracker Forum URL is required/)
    expect(() => categoryManager.validateUrl("http://rutracker.org/forum/viewforum.php?f=357")).toThrow(/URL must use HTTPS/)
    expect(() => categoryManager.validateUrl("https://other-tracker.org/forum/viewforum.php?f=357")).toThrow(/URL must be from rutracker.org/)
    expect(() => categoryManager.validateUrl("https://rutracker.org/forum/viewtopic.php?t=123")).toThrow(/URL path must be \/forum\/viewforum.php/)
    expect(() => categoryManager.validateUrl("https://rutracker.org/forum/viewforum.php")).toThrow(/URL must have a valid positive integer "f" query parameter/)
    expect(() => categoryManager.validateUrl("https://rutracker.org/forum/viewforum.php?f=abc")).toThrow(/URL must have a valid positive integer "f" query parameter/)
  })

  it("creates a custom category and persists to scraper-categories.json", () => {
    const newCat = categoryManager.createCategory({
      id: "dreamcast-custom",
      name: "Sega Dreamcast Custom",
      group: "sega",
      baseUrl: "https://rutracker.org/forum/viewforum.php?f=510",
      titleSearch: ["[DC]", "Dreamcast"],
      enabled: true,
    })

    expect(newCat.id).toBe("dreamcast-custom")
    expect(newCat.builtIn).toBe(false)
    expect(newCat.group).toBe("sega")
    expect(newCat.titleSearch).toEqual(["[DC]", "Dreamcast"])

    // Check config file on disk
    const configFile = path.join(testConfigDir, "scraper-categories.json")
    expect(fs.existsSync(configFile)).toBe(true)
    const saved = JSON.parse(fs.readFileSync(configFile, "utf8"))
    expect(saved.version).toBe(1)
    expect(saved.custom.length).toBe(1)
    expect(saved.custom[0].id).toBe("dreamcast-custom")

    // Check resolved list
    const resolved = categoryManager.getResolvedCategories()
    const found = resolved.find((c: any) => c.id === "dreamcast-custom")
    expect(found).toBeDefined()
    expect(found.builtIn).toBe(false)
  })

  it("prevents duplicate category ID on creation", () => {
    expect(() => {
      categoryManager.createCategory({
        id: "ps2", // built-in ID
        name: "Playstation 2 Duplicate",
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=357",
        titleSearch: ["[PS2]"],
      })
    }).toThrow(/already exists/)

    categoryManager.createCategory({
      id: "my-retro",
      name: "Retro Games",
      baseUrl: "https://rutracker.org/forum/viewforum.php?f=100",
      titleSearch: ["[Retro]"],
    })

    expect(() => {
      categoryManager.createCategory({
        id: "my-retro", // custom ID duplicate
        name: "Retro Games Again",
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=100",
        titleSearch: ["[Retro]"],
      })
    }).toThrow(/already exists/)
  })

  it("updates built-in category as an override and restores default", () => {
    // 1. Update built-in category
    const updated = categoryManager.updateCategory("ps2", {
      name: "Sony PlayStation 2 Modified",
      baseUrl: "https://rutracker.org/forum/viewforum.php?f=357",
      titleSearch: ["[PS2]", "PlayStation 2", "[PS2]"], // with duplicate to test normalization
    })

    expect(updated.id).toBe("ps2")
    expect(updated.name).toBe("Sony PlayStation 2 Modified")
    expect(updated.builtIn).toBe(true)
    expect(updated.titleSearch).toEqual(["[PS2]", "PlayStation 2"]) // deduplicated

    // Check resolved list
    let resolved = categoryManager.getResolvedCategories()
    let ps2 = resolved.find((c: any) => c.id === "ps2")
    expect(ps2.name).toBe("Sony PlayStation 2 Modified")

    // 2. Reset built-in category
    categoryManager.resetCategory("ps2")

    resolved = categoryManager.getResolvedCategories()
    ps2 = resolved.find((c: any) => c.id === "ps2")
    expect(ps2.name).toBe("Playstation 2") // original restored
  })

  it("updates and deletes custom category", () => {
    categoryManager.createCategory({
      id: "wii-custom",
      name: "Nintendo Wii Custom",
      group: "nintendo",
      baseUrl: "https://rutracker.org/forum/viewforum.php?f=512",
      titleSearch: ["[Wii]"],
    })

    const updated = categoryManager.updateCategory("wii-custom", {
      name: "Nintendo Wii Plus",
      titleSearch: ["[Wii]", "[WiiWare]"],
    })
    expect(updated.name).toBe("Nintendo Wii Plus")
    expect(updated.titleSearch).toEqual(["[Wii]", "[WiiWare]"])

    // Delete custom category
    const deleted = categoryManager.deleteCategory("wii-custom")
    expect(deleted).toBe(true)

    const resolved = categoryManager.getResolvedCategories()
    expect(resolved.find((c: any) => c.id === "wii-custom")).toBeUndefined()
  })

  it("rejects deleting built-in category", () => {
    expect(() => {
      categoryManager.deleteCategory("ps2")
    }).toThrow(/Cannot delete built-in category|CANNOT_DELETE_BUILTIN/i)
  })

  it("enables and disables categories", () => {
    categoryManager.setCategoryEnabled("ps2", false)
    let ps2 = categoryManager.getResolvedCategories().find((c: any) => c.id === "ps2")
    expect(ps2.enabled).toBe(false)

    categoryManager.setCategoryEnabled("ps2", true)
    ps2 = categoryManager.getResolvedCategories().find((c: any) => c.id === "ps2")
    expect(ps2.enabled).toBe(true)
  })

  it("recovers gracefully and returns default categories if config file is corrupted", () => {
    const configFile = path.join(testConfigDir, "scraper-categories.json")
    fs.writeFileSync(configFile, "INVALID_JSON_CORRUPTED_DATA{{{", "utf8")

    const resolved = categoryManager.getResolvedCategories()
    expect(resolved).toHaveLength(16)
    const ps2 = resolved.find((c: any) => c.id === "ps2")
    expect(ps2).toBeDefined()
    expect(ps2.name).toBe("Playstation 2")
  })
})
