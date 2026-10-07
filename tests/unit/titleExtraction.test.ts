import { describe, it, expect } from "vitest"
import { JSDOM } from "jsdom"
import {
  extractCanonicalTitleFromDOM as extractCJS,
  normalizeCanonicalGameTitle as normalizeCJS,
  normalizeTitleForDedupe as dedupeCJS,
  extractBTIH as btihCJS,
  classifyDuplicates as classifyCJS,
  isReleaseQualifierToken,
} from "../../electron/scraper/titleExtractor.cjs"

import {
  extractCanonicalTitleFromDOM as extractTS,
  normalizeCanonicalGameTitle as normalizeTS,
  normalizeTitleForDedupe as dedupeTS,
  extractBTIH as btihTS,
  classifyDuplicates as classifyTS,
} from "../../src/utils/titleExtractor"

describe("Title Extraction & Normalization Unit Tests", () => {
  const parseHTML = (html: string) => {
    const dom = new JSDOM(html)
    return dom.window.document
  }

  describe("DOM Extraction: Primary Rule (Content before 'Год выпуска')", () => {
    it("extracts 'SiN: Reloaded' from post_body before 'Год выпуска' (Fixture 1)", () => {
      const html = `
        <div class="post_body">
          <span style="font-size: 24px; line-height: normal;">SiN: Reloaded</span>
          <br>
          <var class="postImg" title="https://example.com/cover.jpg"></var>
          <br>
          <span class="post-b">Год выпуска</span>: 2026
          <br>
          <span class="post-b">Жанр</span>: Action
        </div>
      `
      const doc = parseHTML(html)
      const topicTitle = "[Nintendo Switch] Sin Reloaded Gold + Wages of Sin [NSZ][ENG]"

      const result = extractCJS(doc, topicTitle)
      expect(result.canonicalTitle).toBe("SiN: Reloaded")
      expect(result.canonicalTitleRaw).toBe("SiN: Reloaded")
      expect(result.method).toBe("before_release_year_styled")

      const resultTS = extractTS(doc, topicTitle)
      expect(resultTS.canonicalTitle).toBe("SiN: Reloaded")
    })

    it("extracts 'Gears Of War' and release group 'R.G.DShock' (Fixture 2)", () => {
      const html = `
        <div class="post_body">
          <span style="font-size: 20px;">Gears Of War [RUSSOUND] (Релиз от R.G.DShock)</span>
          <br>
          <span class="post-b">Год выпуска</span>: 2006
          <br>
          <span class="post-b">Жанр</span>: Third-Person Shooter
        </div>
      `
      const doc = parseHTML(html)
      const topicTitle = "[XBOX360] Gears of War [RUSSOUND] (Релиз от R.G.DShock) [FREEBOOT]"

      const result = extractCJS(doc, topicTitle)
      expect(result.canonicalTitle).toBe("Gears Of War")
      expect(result.releaseGroup).toBe("R.G.DShock")
      expect(dedupeCJS(result.canonicalTitle)).toBe("gears of war")
    })

    it("extracts title when image and synopsis appear between title and 'Год выпуска'", () => {
      const html = `
        <div class="post_body">
          <h1>The Legend of Zelda: Tears of the Kingdom</h1>
          <img class="postImg" src="https://example.com/zelda.png" />
          <p>An epic adventure across the skies of Hyrule.</p>
          <span class="post-b">Год выпуска:</span> 2023
        </div>
      `
      const doc = parseHTML(html)
      const result = extractCJS(doc, "[Switch] Zelda Tears of the Kingdom [NSP]")
      expect(result.canonicalTitle).toBe("The Legend of Zelda: Tears of the Kingdom")
    })

    it("extracts title with multiple inline spans and br elements", () => {
      const html = `
        <div class="post_body">
          <span style="font-size: 18px;">Grand Theft Auto: San Andreas</span>
          <br><br>
          <span class="post-b">Год выпуска</span>: 2004
        </div>
      `
      const doc = parseHTML(html)
      const result = extractCJS(doc, "[PS2] GTA San Andreas [ISO]")
      expect(result.canonicalTitle).toBe("Grand Theft Auto: San Andreas")
    })

    it("falls back to cleaned topicTitle when 'Год выпуска' marker is absent", () => {
      const html = `<div class="post_body"><p>No release year here</p></div>`
      const doc = parseHTML(html)
      const topicTitle = "[Nintendo Switch] Metroid Prime Remastered [NSP][MULTI]"

      const result = extractCJS(doc, topicTitle)
      expect(result.canonicalTitle).toBe("Metroid Prime Remastered")
      expect(result.method).toBe("TITLE_CANONICAL_FALLBACK")
    })
  })

  describe("Punctuation & Character Preservation", () => {
    it("preserves colons, slashes, periods, and hyphens in game titles", () => {
      const titles = [
        { raw: ".hack//Fragment [PS2][ENG]", expected: ".hack//Fragment" },
        { raw: "NieR:Automata The End of YoRHa Edition [Switch]", expected: "NieR:Automata The End of YoRHa Edition" },
        { raw: "Half-Life 2: Episode Two [XBOX360]", expected: "Half-Life 2: Episode Two" },
        { raw: "S.T.A.L.K.E.R.: Shadow of Chernobyl", expected: "S.T.A.L.K.E.R.: Shadow of Chernobyl" },
        { raw: "Steins;Gate Elite [NSZ]", expected: "Steins;Gate Elite" },
      ]

      for (const { raw, expected } of titles) {
        const norm = normalizeCJS(raw)
        expect(norm.canonicalTitle).toBe(expected)
      }
    })

    it("identifies release qualifier tokens accurately", () => {
      expect(isReleaseQualifierToken("[Nintendo Switch]")).toBe(true)
      expect(isReleaseQualifierToken("[NSZ]")).toBe(true)
      expect(isReleaseQualifierToken("[ENG]")).toBe(true)
      expect(isReleaseQualifierToken("[RUS/ENG]")).toBe(true)
      expect(isReleaseQualifierToken("[MULTI12]")).toBe(true)
      expect(isReleaseQualifierToken("[v1.0.4]")).toBe(true)
      expect(isReleaseQualifierToken("[FREEBOOT]")).toBe(true)
      expect(isReleaseQualifierToken("[Repack]")).toBe(true)
      expect(isReleaseQualifierToken("Final Fantasy VII")).toBe(false)
      expect(isReleaseQualifierToken("Reloaded")).toBe(false)
    })
  })

  describe("BTIH Extraction", () => {
    it("extracts 40-char hex BTIH info_hash from magnet URI", () => {
      const magnet = "magnet:?xt=urn:btih:4ABC123DEF4567890ABCDEF1234567890ABCDEF1&dn=TestGame"
      expect(btihCJS(magnet)).toBe("4ABC123DEF4567890ABCDEF1234567890ABCDEF1")
      expect(btihTS(magnet)).toBe("4ABC123DEF4567890ABCDEF1234567890ABCDEF1")
    })

    it("extracts 32-char base32 BTIH info_hash from magnet URI", () => {
      const magnet = "magnet:?xt=urn:btih:MFRGGZDFMYZXIZLDN5SGK3BUMNWTS2LO&dn=Game"
      expect(btihCJS(magnet)).toBe("MFRGGZDFMYZXIZLDN5SGK3BUMNWTS2LO")
    })

    it("returns null for invalid or missing magnet links", () => {
      expect(btihCJS("")).toBe(null)
      expect(btihCJS(null as any)).toBe(null)
      expect(btihCJS("https://example.com")).toBe(null)
    })
  })

  describe("Normalized Title Comparison for Dedupe", () => {
    it("normalizes unicode, case, and accents identically across TS and CJS", () => {
      const testCases = [
        "Pokémon: Let's Go, Pikachu!",
        "SiN: Reloaded",
        "Gears Of War",
        "THE WITCHER 3: WILD HUNT",
      ]

      for (const tc of testCases) {
        expect(dedupeCJS(tc)).toBe(dedupeTS(tc))
      }

      expect(dedupeCJS("Pokémon: Let's Go, Pikachu!")).toBe("pokemon lets go pikachu")
      expect(dedupeCJS("SiN: Reloaded")).toBe("sin reloaded")
    })
  })

  describe("Duplicate Classification Hierarchy", () => {
    it("classifies EXACT_TOPIC when source and topicId match", () => {
      const a = { topicId: "12345", source: "rutracker", canonicalTitle: "Game A" }
      const b = { topicId: "12345", source: "rutracker", canonicalTitle: "Game A Different Scan" }
      expect(classifyCJS(a, b)).toBe("EXACT_TOPIC")
      expect(classifyTS(a, b)).toBe("EXACT_TOPIC")
    })

    it("classifies EXACT_PAYLOAD when topicId differs but infoHash is identical", () => {
      const a = { topicId: "1001", infoHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", canonicalTitle: "Game X" }
      const b = { topicId: "2002", infoHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", canonicalTitle: "Game X (Reupload)" }
      expect(classifyCJS(a, b)).toBe("EXACT_PAYLOAD")
      expect(classifyTS(a, b)).toBe("EXACT_PAYLOAD")
    })

    it("classifies SAME_GAME_VARIANT for same game on different platforms", () => {
      const a = { topicId: "1001", canonicalTitle: "Need for Speed: Underground 2", categoryId: "ps2" }
      const b = { topicId: "1002", canonicalTitle: "Need for Speed: Underground 2", categoryId: "xbox" }
      expect(classifyCJS(a, b)).toBe("SAME_GAME_VARIANT")
    })

    it("classifies SAME_GAME_VARIANT for different release groups or versions on same platform", () => {
      const a = { topicId: "1001", canonicalTitle: "SiN: Reloaded", categoryId: "switch", version: "1.0.0", releaseGroup: "GroupA" }
      const b = { topicId: "1002", canonicalTitle: "SiN: Reloaded", categoryId: "switch", version: "1.2.0", releaseGroup: "GroupB" }
      expect(classifyCJS(a, b)).toBe("SAME_GAME_VARIANT")
    })

    it("classifies SAME_RELEASE for identical version, releaseGroup, and size", () => {
      const a = { topicId: "1001", canonicalTitle: "Halo 2", categoryId: "xbox", version: "1.0", releaseGroup: "Complex", sizeBytes: 4500000000 }
      const b = { topicId: "1002", canonicalTitle: "Halo 2", categoryId: "xbox", version: "1.0", releaseGroup: "Complex", sizeBytes: 4500000000 }
      expect(classifyCJS(a, b)).toBe("SAME_RELEASE")
    })

    it("classifies DIFFERENT_GAME when normalized titles do not match", () => {
      const a = { topicId: "1001", canonicalTitle: "Halo Combat Evolved", categoryId: "xbox" }
      const b = { topicId: "1002", canonicalTitle: "Halo 2", categoryId: "xbox" }
      expect(classifyCJS(a, b)).toBe("DIFFERENT_GAME")
    })
  })

  describe("SQLite Schema Migration & ensureColumnsExist", () => {
    it("safely migrates pre-existing database schema lacking canonical_title without throwing", async () => {
      const execCalls: string[] = []
      const pragmaCalls: string[] = []
      const tables: Record<string, string[]> = {
        items: ['id', 'category_id', 'source', 'topic_id', 'title', 'clean_title', 'title_sort'],
      }

      const mockDb = {
        pragma: (cmd: string) => {
          pragmaCalls.push(cmd)
          if (cmd === 'user_version') return 3
          return null
        },
        exec: (sql: string) => {
          execCalls.push(sql)
          if (sql.includes('ADD COLUMN topic_title')) tables.items.push('topic_title')
          if (sql.includes('ADD COLUMN canonical_title')) tables.items.push('canonical_title')
          if (sql.includes('ADD COLUMN normalized_title')) tables.items.push('normalized_title')
          if (sql.includes('ADD COLUMN info_hash')) tables.items.push('info_hash')
        },
        prepare: (sql: string) => ({
          all: () => {
            if (sql.includes('PRAGMA table_info(items)')) {
              return tables.items.map((name) => ({ name }))
            }
            if (sql.includes('FROM items')) {
              return [
                {
                  id: 'item_1',
                  title: '[Nintendo Switch] Sin Reloaded Gold [NSZ]',
                  clean_title: 'Sin Reloaded Gold',
                  topic_title: null,
                  canonical_title: null,
                  normalized_title: null,
                },
              ]
            }
            return []
          },
          get: () => null,
          run: () => ({ changes: 1 }),
        }),
        transaction: (fn: Function) => (...args: any[]) => fn(...args),
      }

      const { initializeSchema } = await import("../../electron/database/schema.cjs")
      const result = initializeSchema(mockDb as any)
      expect(result.initialized).toBe(true)
      expect(tables.items).toContain('canonical_title')
      expect(tables.items).toContain('normalized_title')
      expect(tables.items).toContain('topic_title')
      expect(tables.items).toContain('info_hash')
    })
  })
})
