import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { JSDOM } from "jsdom"
import { resolveImageUrl } from "@/utils/imageResolver"
import { normalizeScreenshotUrl, screenshotProvider, uniqueScreenshotUrls } from "@/services/screenshotResolver"

const fixturesDir = path.resolve(__dirname, "../fixtures/rutracker-images")

describe("RuTracker Image Extraction & Normalization Unit Tests (V3-11)", () => {
  it("extracts and normalizes cover image while ignoring tracker smileys", () => {
    const html = fs.readFileSync(path.join(fixturesDir, "cover-fastpic.html"), "utf8")
    const dom = new JSDOM(html)
    const postBody = dom.window.document.querySelector(".post_body")

    expect(postBody).toBeTruthy()

    // 1. Should ignore smiles/icons
    const smile = postBody?.querySelector("img.postImg[src*='smiles']")
    expect(smile).toBeTruthy()
    const smileResolved = resolveImageUrl(smile?.getAttribute("src") || "")
    expect(smileResolved).toBeUndefined()

    // 2. Aligned cover image resolution
    const coverImg = postBody?.querySelector("img.postImgAligned")
    expect(coverImg).toBeTruthy()
    const rawSrc = coverImg?.getAttribute("src") || ""
    const resolved = resolveImageUrl(rawSrc)

    expect(resolved).toBe("https://i128.fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.jpeg")
  })

  it("extracts screenshot references from collapsed DOM with lazy <var> tags", () => {
    const html = fs.readFileSync(path.join(fixturesDir, "screenshots-collapsed.html"), "utf8")
    const dom = new JSDOM(html)
    const spBody = dom.window.document.querySelector(".sp-body")

    expect(spBody).toBeTruthy()
    const varElements = Array.from(spBody?.querySelectorAll("var.postImg") || [])
    expect(varElements.length).toBe(3)

    const titles = varElements.map(el => el.getAttribute("title") || "")
    expect(titles[0]).toBe("https://thumbs4.imagebam.com/88/18/a8/ME1BKPS4_t.jpg")

    const resolved = titles.map(t => resolveImageUrl(t))
    expect(resolved[0]).toBe("https://images4.imagebam.com/88/18/a8/ME1BKPS4.jpg")
  })

  it("extracts screenshot references from expanded DOM after JS execution", () => {
    const html = fs.readFileSync(path.join(fixturesDir, "screenshots-expanded.html"), "utf8")
    const dom = new JSDOM(html)
    const spWrap = dom.window.document.querySelector(".sp-wrap")

    expect(spWrap?.classList.contains("sp-opened")).toBe(true)

    const images = Array.from(dom.window.document.querySelectorAll(".sp-body img.postImg"))
    expect(images.length).toBe(3)
    expect(images[0].getAttribute("src")).toBe("https://thumbs4.imagebam.com/88/18/a8/ME1BKPS4_t.jpg")
  })

  it("normalizes FastPic intermediate viewer URLs to direct CDN images", () => {
    const viewUrl = "https://fastpic.org/view/128/2026/0929/_786ce37312f5db1807e65b45a4ae3a6d.webp.html"
    const fullviewUrl = "https://fastpic.org/fullview/128/2026/1001/a1cdfbd11a82467fd92e089b5516499b.png.html"
    const thumbUrl = "http://i89.fastpic.org/thumb/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpeg"

    expect(resolveImageUrl(viewUrl)).toBe("https://i128.fastpic.org/big/2026/0929/6d/_786ce37312f5db1807e65b45a4ae3a6d.webp")
    expect(resolveImageUrl(fullviewUrl)).toBe("https://i128.fastpic.org/big/2026/1001/9b/a1cdfbd11a82467fd92e089b5516499b.png")
    expect(resolveImageUrl(thumbUrl)).toBe("https://i89.fastpic.org/big/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpeg")
  })

  it("normalizes ImageBan and PostImg URLs", () => {
    const imageBanViewer = "https://imageban.ru/show/2026/09/28/fc9753b4f16e6ed5c16b907b19991a04/jpg"
    const postImgViewer = "https://postimg.cc/image/abc12345/"

    expect(resolveImageUrl(imageBanViewer)).toBe("https://i4.imageban.ru/out/2026/09/28/fc9753b4f16e6ed5c16b907b19991a04.jpg")
    expect(resolveImageUrl(postImgViewer)).toBe("https://i.postimg.cc/image/abc12345/.jpg")
  })

  it("rejects non-image HTML and broken placeholder URLs", () => {
    expect(resolveImageUrl("https://static.rutracker.cc/smiles/tr_oops.gif")).toBeUndefined()
    expect(resolveImageUrl("https://static.rutracker.cc/templates/v1/images/broken_image_1.svg")).toBeUndefined()
    expect(resolveImageUrl("https://example.com/unsupported-viewer.php")).toBeUndefined()
  })

  it("deduplicates screenshot URLs while strictly preserving visual order", () => {
    const rawList = [
      "https://i89.fastpic.org/big/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpg",
      "http://i89.fastpic.org/thumb/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpeg",
      "https://i89.fastpic.org/big/2017/0812/30/302d1e240a4e99ab42293732dfdaaebb.jpg",
      "https://i89.fastpic.org/big/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpg"
    ]

    const unique = uniqueScreenshotUrls(rawList)
    expect(unique.length).toBe(2)
    expect(unique[0]).toBe("https://i89.fastpic.org/big/2017/0812/ec/6cbc515b6ccb28bbcc73f41e22b226ec.jpg")
    expect(unique[1]).toBe("https://i89.fastpic.org/big/2017/0812/30/302d1e240a4e99ab42293732dfdaaebb.jpg")
  })

  it("distinguishes main screenshot group from secondary group in multi-group fixture", () => {
    const html = fs.readFileSync(path.join(fixturesDir, "screenshots-multiple-groups.html"), "utf8")
    const dom = new JSDOM(html)
    const spoilers = Array.from(dom.window.document.querySelectorAll(".sp-wrap"))

    expect(spoilers.length).toBe(2)

    const mainHeader = spoilers[0].querySelector(".sp-head")?.textContent?.trim()
    const secondaryHeader = spoilers[1].querySelector(".sp-head")?.textContent?.trim()

    expect(mainHeader).toBe("Скриншоты")
    expect(secondaryHeader).toBe("Скриншоты опционального любительского перевода")

    const mainImgs = Array.from(spoilers[0].querySelectorAll("img")).map(img => img.getAttribute("src"))
    const secondaryImgs = Array.from(spoilers[1].querySelectorAll("img")).map(img => img.getAttribute("src"))

    expect(mainImgs.length).toBe(2)
    expect(secondaryImgs.length).toBe(1)
  })
})

