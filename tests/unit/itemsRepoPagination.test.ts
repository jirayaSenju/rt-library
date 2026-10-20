import { describe, it, expect, vi, beforeEach } from "vitest"
const itemsRepo = require("../../electron/database/repositories/itemsRepo.cjs")

describe("itemsRepo pagination metadata and offset conversion (V3-PAGINATION)", () => {
  let mockDb: any

  beforeEach(() => {
    // Generate 120 sample item rows
    const mockRows = Array.from({ length: 120 }, (_, idx) => ({
      id: `item-${idx + 1}`,
      category_id: "ps2",
      source: "rutracker",
      topic_id: `${1000 + idx}`,
      title: `Game ${idx + 1}`,
      topic_title: `[PS2] Game ${idx + 1}`,
      canonical_title: `Game ${idx + 1}`,
      normalized_title: `game ${idx + 1}`,
      clean_title: `Game ${idx + 1}`,
      title_sort: `game ${String(idx + 1).padStart(4, "0")}`,
      info_hash: `hash-${idx + 1}`,
      url: `https://rutracker.org/forum/viewtopic.php?t=${1000 + idx}`,
      genre: "Action",
      developer: "Dev",
      publisher: "Pub",
      release_year: 2005,
      language: "en",
      interface_language: "en",
      voice_language: "en",
      image_format: "iso",
      multiplayer: "no",
      cover_url: null,
      size_str: "1.5 GB",
      size_bytes: 1500000000,
      has_cover: 0,
      has_screenshots: 0,
      has_magnet: 1,
      is_favorite: 0,
      discovered_at: new Date(Date.now() - idx * 60000).toISOString(),
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      magnet: `magnet:?xt=urn:btih:hash-${idx + 1}`,
      seeds: 10,
      leechers: 2,
      peers: 12,
      swarm_status: "active",
      swarm_source: "tracker",
      swarm_fetched_at: new Date().toISOString(),
    }))

    mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT COUNT(*) as total")) {
          return {
            get: vi.fn(() => ({ total: mockRows.length })),
          }
        }
        if (sql.includes("LIMIT ? OFFSET ?")) {
          return {
            all: vi.fn((params: any[]) => {
              const offset = params[params.length - 1]
              const limit = params[params.length - 2]
              return mockRows.slice(offset, offset + limit)
            }),
          }
        }
        return {
          get: vi.fn(() => ({ total: 0 })),
          all: vi.fn(() => []),
        }
      }),
    }
  })

  it("returns accurate page, pageSize, and totalPages metadata for page 1", () => {
    const result = itemsRepo.getPaginated(mockDb, { limit: 24, offset: 0 })

    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(24)
    expect(result.totalPages).toBe(5) // 120 / 24 = 5
    expect(result.items).toHaveLength(24)
    expect(result.items[0].id).toBe("item-1")
    expect(result.hasMore).toBe(true)
  })

  it("returns accurate page, pageSize, and totalPages metadata for page 5", () => {
    const result = itemsRepo.getPaginated(mockDb, { limit: 24, offset: 96 })

    expect(result.page).toBe(5)
    expect(result.pageSize).toBe(24)
    expect(result.totalPages).toBe(5)
    expect(result.items).toHaveLength(24)
    expect(result.items[0].id).toBe("item-97")
    expect(result.hasMore).toBe(false)
  })

  it("returns distinct non-overlapping data between page 1 and page 5", () => {
    const page1 = itemsRepo.getPaginated(mockDb, { limit: 24, offset: 0 })
    const page5 = itemsRepo.getPaginated(mockDb, { limit: 24, offset: 96 })

    const page1Ids = new Set(page1.items.map((i: any) => i.id))
    const page5Ids = new Set(page5.items.map((i: any) => i.id))

    // Disjoint set
    const overlap = [...page1Ids].filter((id) => page5Ids.has(id))
    expect(overlap).toHaveLength(0)
    expect(page1.page).toBe(1)
    expect(page5.page).toBe(5)
  })
})

