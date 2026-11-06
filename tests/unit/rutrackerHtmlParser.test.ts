import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// CommonJS import for the pure parser
const {
  parseCategoryHtml,
  parseTopicHtml,
  extractFtreeFiles,
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

    it("extracts fileList and sizeBytes from #tor-filelist ftree (Nintendo Switch 2 / modern RuTracker format)", () => {
      const switch2Html = `
        <h1 class="maintitle">
          <a id="topic-title" href="https://rutracker.org/forum/viewtopic.php?t=6933053">[NSW2] The Legend of Zelda: Ocarina of Time (2026) [NUP][RUS/Multi16]</a>
        </h1>
        <div style="padding-top: 6px;">
          <input id="tor-filelist-btn" type="button" class="lite" value="Список файлов">
        </div>
        <span id="tor-size-humn" title="25020741061">23.3&nbsp;GB</span>
        <a href="magnet:?xt=urn:btih:6506209D75146BA74F4289A33A4ADEED12345678" class="magnet-link"></a>
        <div id="tor-fl-wrap">
          <div id="tor-filelist" class="med ftree-windowed">
            <ul class="ftree">
              <li class="dir">
                <div><b>./The Legend of Zelda Ocarina of Time [NUP]</b><s> 23.30 GB</s></div>
                <ul>
                  <li class="file">
                    <div><b>The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup</b><s> 23.30 GB </s><i>25020741061</i></div>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
        <div class="post_body" id="p-6933053">
          <span style="font-size: 24px; line-height: normal;">The Legend of Zelda: Ocarina of Time</span><br>
          <var class="postImg" title="https://i128.fastpic.org/big/2026/zelda_cover.jpg"></var><br>
          <span class="post-b">Год выпуска</span>: 2026<br>
          <span class="post-b">Жанр</span>: Action / Adventure<br>
          <span class="post-b">Разработчик</span>: Nintendo<br>
          <span class="post-b">Формат образа</span>: NUP<br>
        </div>
      `

      const result = parseTopicHtml(switch2Html, {
        topicTitle: "[NSW2] The Legend of Zelda: Ocarina of Time (2026) [NUP][RUS/Multi16]",
        topicUrl: "https://rutracker.org/forum/viewtopic.php?t=6933053",
      })

      expect(result.canonicalTitle).toBe("The Legend of Zelda: Ocarina of Time")
      expect(result.imageFormat).toBe("NUP")
      expect(result.releaseYear).toBe(2026)
      expect(result.sizeBytes).toBe(25020741061)
      expect(result.fileListTotalSizeBytes).toBe(25020741061)
      expect(result.fileList).toContain("The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup")
      expect(result.fileList).toContain("The Legend of Zelda Ocarina of Time [NUP]/The Legend of Zelda Ocarina of Time [0400486024DEC000][v131072].nup")
    })

    it("extractFtreeFiles extracts multi-file and multi-directory structures cleanly", () => {
      const { JSDOM } = require("jsdom")
      const dom = new JSDOM(`
        <div id="tor-filelist">
          <ul class="ftree">
            <li class="dir">
              <div><b>./Game</b><s> 10.00 GB</s></div>
              <ul>
                <li class="file"><div><b>base.nup</b><s> 8.00 GB </s><i>8589934592</i></div></li>
                <li class="file"><div><b>update.nup</b><s> 2.00 GB </s><i>2147483648</i></div></li>
              </ul>
            </li>
            <li class="file"><div><b>instructions.txt</b><s> 1.00 KB </s><i>1024</i></div></li>
          </ul>
        </div>
      `)
      const files = extractFtreeFiles(dom.window.document.querySelector("#tor-filelist"))
      expect(files).toHaveLength(3)
      expect(files[0].path).toBe("Game/base.nup")
      expect(files[0].sizeBytes).toBe(8589934592)
      expect(files[1].path).toBe("Game/update.nup")
      expect(files[1].sizeBytes).toBe(2147483648)
      expect(files[2].path).toBe("instructions.txt")
      expect(files[2].sizeBytes).toBe(1024)
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
