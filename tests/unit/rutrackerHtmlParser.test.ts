import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// CommonJS import for the pure parser
const {
  parseCategoryHtml,
  parseTopicHtml,
  extractPaginationInfo,
  resolveRawImageUrl,
  isTrackerDecorationOrSmile,
} = require("../../scraper/parsers/rutrackerHtmlParser.cjs")

const fixturesDir = path.resolve(__dirname, "../fixtures/rutracker-html")

describe("Pure RuTracker HTML Parser (V3-56 Phase 1)", () => {
  describe("Category HTML Parsing (parseCategoryHtml)", () => {
    const categoryHtml = fs.readFileSync(path.join(fixturesDir, "category-xbox.html"), "utf8")

    it("extracts all topics with complete metadata from category listing", () => {
      const result = parseCategoryHtml(categoryHtml, {
        categoryId: "887",
        categoryName: "Xbox 360",
        categoryBaseUrl: "https://rutracker.org/forum/viewforum.php?f=887",
        pageNum: 1,
      })

      expect(result.topics).toBeDefined()
      expect(result.topics.length).toBe(3)

      const halo = result.topics[0]
      expect(halo.id).toBe("topic_6001001")
      expect(halo.topicId).toBe("6001001")
      expect(halo.title).toBe("[Xbox 360] Halo 3: ODST [Region Free] [ENG / Sound ENG] (GOD)")
      expect(halo.url).toBe("https://rutracker.org/forum/viewtopic.php?t=6001001")
      expect(halo.sizeStr).toBe("7.32 GB")
      expect(halo.seeds).toBe(42)
      expect(halo.leechers).toBe(5)
      expect(halo.category).toBe("887")
      expect(halo.source).toEqual({
        site: "rutracker",
        forumId: "887",
        forumName: "Xbox 360",
        category: "887",
        categoryName: "Xbox 360",
        categoryUrl: "https://rutracker.org/forum/viewforum.php?f=887",
        page: 1,
        pageOffset: 0,
        pageUrl: "https://rutracker.org/forum/viewforum.php?f=887",
      })

      const gow = result.topics[1]
      expect(gow.topicId).toBe("6001002")
      expect(gow.seeds).toBe(18)
      expect(gow.leechers).toBe(1)
      expect(gow.sizeStr).toBe("6.85 GB")

      const forza = result.topics[2]
      expect(forza.topicId).toBe("6001003")
      expect(forza.seeds).toBe(8)
      expect(forza.leechers).toBe(0)
    })

    it("extracts pagination information accurately", () => {
      const result = parseCategoryHtml(categoryHtml, { categoryId: "887" })
      expect(result.pagination).toBeDefined()
      expect(result.pagination.maxStart).toBe(150)
      expect(result.pagination.totalPages).toBe(4) // Math.floor(150 / 50) + 1
    })

    it("filters topics when titleSearch string is supplied", () => {
      const result = parseCategoryHtml(categoryHtml, {
        categoryId: "887",
        titleSearch: "Halo",
      })
      expect(result.topics.length).toBe(1)
      expect(result.topics[0].topicId).toBe("6001001")
    })

    it("filters topics when titleSearch array is supplied", () => {
      const result = parseCategoryHtml(categoryHtml, {
        categoryId: "887",
        titleSearch: ["Gears", "Forza"],
      })
      expect(result.topics.length).toBe(2)
      expect(result.topics.map((t: any) => t.topicId)).toEqual(["6001002", "6001003"])
    })

    it("keeps Switch Ports in the physical Nintendo Switch forum scan", () => {
      const html = `
        <table>
          <tr><td><a class="torTopic" href="viewtopic.php?t=7001">[Nintendo Switch] Ported Game порт</a></td></tr>
          <tr><td><a class="torTopic" href="viewtopic.php?t=7002">[Nintendo Switch] Native Game</a></td></tr>
        </table>`
      const switchGames = parseCategoryHtml(html, { categoryId: "switch", titleSearch: ["[Nintendo Switch]"] })
      expect(switchGames.topics.map((topic: any) => topic.topicId)).toEqual(["7001", "7002"])
    })

    it("handles empty page gracefully without throwing", () => {
      const emptyHtml = fs.readFileSync(path.join(fixturesDir, "empty-page.html"), "utf8")
      const result = parseCategoryHtml(emptyHtml, { categoryId: "887" })
      expect(result.topics).toEqual([])
      expect(result.pagination.totalPages).toBe(1)
      expect(result.pagination.maxStart).toBe(0)
    })

    it("handles null, undefined or empty string input gracefully", () => {
      expect(parseCategoryHtml(null)).toEqual({ topics: [], pagination: { totalPages: 1, maxStart: 0 } })
      expect(parseCategoryHtml(undefined)).toEqual({ topics: [], pagination: { totalPages: 1, maxStart: 0 } })
      expect(parseCategoryHtml("")).toEqual({ topics: [], pagination: { totalPages: 1, maxStart: 0 } })
    })

    it("resiliently parses malformed HTML without crashing", () => {
      const malformedHtml = fs.readFileSync(path.join(fixturesDir, "malformed-page.html"), "utf8")
      const result = parseCategoryHtml(malformedHtml, { categoryId: "887" })
      // Topic with invalid query should be ignored because no t=(\d+)
      // Topic 888888 has valid t=888888 even with malformed unclosed tag
      expect(result.topics.length).toBe(1)
      expect(result.topics[0].topicId).toBe("888888")
    })
  })

  describe("Topic Detail HTML Parsing (parseTopicHtml)", () => {
    const topicHtml = fs.readFileSync(path.join(fixturesDir, "topic-detail.html"), "utf8")

    it("extracts canonical title, metadata fields, magnet, cover, and screenshots", () => {
      const result = parseTopicHtml(topicHtml, {
        topicTitle: "[Xbox 360] Halo 3: ODST [Region Free] [ENG / Sound ENG] (GOD)",
      })

      // Canonical title & normalization
      expect(result.canonicalTitle).toBe("Halo 3: ODST")
      expect(result.normalizedTitle).toBe("halo 3 odst")

      // Metadata extraction
      expect(result.releaseYear).toBe(2009)
      expect(result.genre).toBe("First-Person Shooter")
      expect(result.developer).toBe("Bungie")
      expect(result.publisher).toBe("Microsoft Game Studios")
      expect(result.imageFormat).toBe("GOD")
      expect(result.multiplayer).toBe("Yes")
      expect(result.multiplayerRaw).toBe("Кооператив (до 4 игроков")
      expect(result.interfaceLanguage).toBe("en, ru")
      expect(result.languageCodes).toEqual(["en", "ru"])
      expect(result.voiceLanguage).toBe("en")
      expect(result.audioLanguageCodes).toEqual(["en"])
      expect(result.version).toBe("1.0")
      expect(result.region).toBe("WORLD")
      expect(result.regionRaw).toBe("Region Free")
      expect(result.size).toBe("7.32 GB")

      // Magnet link and infoHash
      expect(result.magnet).toContain("magnet:?xt=urn:btih:35B4C470295DF3D48FE6C6CFDB36E4D0BB5521E2")
      expect(result.infoHash).toBe("35B4C470295DF3D48FE6C6CFDB36E4D0BB5521E2")

      // Cover image
      expect(result.cover).toBe("https://i128.fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.jpeg")

      // Screenshots
      expect(result.screenshots).toHaveLength(2)
      expect(result.screenshots[0]).toBe("https://images4.imagebam.com/88/18/a8/ME1BKPS4.jpg")
      expect(result.screenshots[1]).toBe("https://images4.imagebam.com/88/18/a8/ME1BKPS5.jpg")

      // File list
      expect(result.fileList).toContain("default.xex")
      expect(result.fileList).toContain("halo3_odst.iso")
    })

    it("returns empty object when post_body is absent", () => {
      const emptyHtml = fs.readFileSync(path.join(fixturesDir, "empty-page.html"), "utf8")
      const result = parseTopicHtml(emptyHtml)
      expect(result).toEqual({})
    })

    it("handles null, undefined or empty string topic HTML gracefully", () => {
      expect(parseTopicHtml(null)).toEqual({})
      expect(parseTopicHtml(undefined)).toEqual({})
      expect(parseTopicHtml("")).toEqual({})
    })
  })

  describe("Helper Functions", () => {
    it("resolves FastPic viewer URLs to direct images", () => {
      const viewerUrl = "https://fastpic.org/view/128/2026/1001/a1cdfbd11a82467fd92e089b5516499b.jpeg.html"
      const resolved = resolveRawImageUrl(viewerUrl)
      expect(resolved).toBe("https://i128.fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.jpeg")
    })

    it("resolves FastPic thumbnail URLs to big images", () => {
      const thumbUrl = "https://fastpic.org/thumb/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b_thumb.jpg"
      const resolved = resolveRawImageUrl(thumbUrl)
      expect(resolved).toBe("https://fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.jpg")
    })

    it("resolves ImageBam thumbnail URLs to full image URLs", () => {
      const thumbUrl = "https://thumbs4.imagebam.com/88/18/a8/ME1BKPS4_t.jpg"
      const resolved = resolveRawImageUrl(thumbUrl)
      expect(resolved).toBe("https://images4.imagebam.com/88/18/a8/ME1BKPS4.jpg")
    })

    it("filters tracker decoration and smiles", () => {
      expect(isTrackerDecorationOrSmile("https://rutracker.org/forum/images/smiles/icon_smile.gif")).toBe(true)
      expect(isTrackerDecorationOrSmile("https://static.rutracker.cc/tr_oops.gif")).toBe(true)
      expect(isTrackerDecorationOrSmile("https://i128.fastpic.org/big/2026/1001/image.jpg")).toBe(false)
      expect(resolveRawImageUrl("https://rutracker.org/forum/images/smiles/icon_smile.gif")).toBeNull()
    })
  })
})
