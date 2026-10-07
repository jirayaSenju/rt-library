import { describe, it, expect } from "vitest"
import {
  PROGRESS_THEMES,
  PROGRESS_THEME_IDS,
  DEFAULT_PROGRESS_THEME_ID,
  resolveProgressThemeId,
  getProgressTheme,
  ProgressThemeId,
} from "@/theme/progressThemes"

describe("progressThemes registry tests", () => {
  const expectedThemeIds: ProgressThemeId[] = [
    "nyan-cat",
    "claude-code",
    "matrix-rain",
    "synthwave",
    "arcade-pixel",
    "lava-lamp",
    "rainbow-pop",
    "ocean-wave",
    "candy-rush",
    "cosmic-nebula",
    "soviet",
  ]

  it("contains all 11 defined progress themes with unique IDs", () => {
    expect(PROGRESS_THEME_IDS).toHaveLength(11)
    expect(PROGRESS_THEME_IDS).toEqual(expect.arrayContaining(expectedThemeIds))
  })

  it("ensures every theme has required attributes (id, name, description, trackBg, fillBackground, mascot, motion)", () => {
    expectedThemeIds.forEach((id) => {
      const theme = PROGRESS_THEMES[id]
      expect(theme).toBeDefined()
      expect(theme.id).toBe(id)
      expect(typeof theme.name).toBe("string")
      expect(theme.name.length).toBeGreaterThan(0)
      expect(typeof theme.description).toBe("string")
      expect(typeof theme.trackBg).toBe("string")
      expect(typeof theme.fillBackground).toBe("string")

      // Mascot definition
      expect(theme.mascot).toBeDefined()
      expect(["emoji", "glyph", "css-shape", "icon"]).toContain(theme.mascot.type)
      expect(typeof theme.mascot.value).toBe("string")
      expect(theme.mascot.value.length).toBeGreaterThan(0)
      expect(typeof theme.mascot.name).toBe("string")
      expect(theme.mascot.name.length).toBeGreaterThan(0)

      // Motion definition
      expect(theme.motion).toBeDefined()
      expect(["float", "bounce", "pulse", "wave", "scan", "glide", "step", "none"]).toContain(theme.motion.type)
      expect(typeof theme.motion.animationClass).toBe("string")
    })
  })

  it("defaults to 'nyan-cat' theme", () => {
    expect(DEFAULT_PROGRESS_THEME_ID).toBe("nyan-cat")
    expect(PROGRESS_THEMES["nyan-cat"].isDefault).toBe(true)
  })

  it("resolves valid IDs accurately", () => {
    expectedThemeIds.forEach((id) => {
      expect(resolveProgressThemeId(id)).toBe(id)
      expect(getProgressTheme(id).id).toBe(id)
    })
  })

  it("resolves aliases correctly to target new themes", () => {
    expect(resolveProgressThemeId("matrix")).toBe("matrix-rain")
    expect(resolveProgressThemeId("cyberpunk")).toBe("synthwave")
    expect(resolveProgressThemeId("retro-crt")).toBe("arcade-pixel")
    expect(resolveProgressThemeId("lava")).toBe("lava-lamp")
    expect(resolveProgressThemeId("rainbow")).toBe("rainbow-pop")
    expect(resolveProgressThemeId("ocean")).toBe("ocean-wave")
  })

  it("safely falls back to 'nyan-cat' on invalid or null/undefined IDs", () => {
    expect(resolveProgressThemeId(null)).toBe("nyan-cat")
    expect(resolveProgressThemeId(undefined)).toBe("nyan-cat")
    expect(resolveProgressThemeId("")).toBe("nyan-cat")
    expect(resolveProgressThemeId("invalid-theme")).toBe("nyan-cat")
    expect(resolveProgressThemeId("banana")).toBe("nyan-cat")

    expect(getProgressTheme("invalid-theme").id).toBe("nyan-cat")
  })

  it("configures nyan-cat with rainbow gradient, animation, cat mascot and rainbow trail", () => {
    const nyan = PROGRESS_THEMES["nyan-cat"]
    expect(nyan.mascot.value).toBe("🐱")
    expect(nyan.mascot.type).toBe("emoji")
    expect(nyan.mascot.trail).toBe("rainbow")
    expect(nyan.mascot.backplate).toBe(true)
    expect(nyan.motion.type).toBe("bounce")
    expect(nyan.hasAnimation).toBe(true)
    expect(nyan.animationClass).toBe("animate-progress-rainbow")
    expect(nyan.fillBackground).toContain("linear-gradient")
  })

  it("configures claude-code with warm terminal prompt mascot and blink motion", () => {
    const claude = PROGRESS_THEMES["claude-code"]
    expect(claude.trackBg).toBe("#241f1a")
    expect(claude.fillBackground).toContain("#d97757")
    expect(claude.glow).toContain("rgba(217, 119, 87")
    expect(claude.mascot.value).toBe(">_")
    expect(claude.mascot.type).toBe("glyph")
    expect(claude.motion.type).toBe("pulse")
    expect(claude.motion.animationClass).toBe("animate-mascot-claude-blink")
  })

  it("configures matrix-rain with hacker green, digital bot mascot and pixel trail", () => {
    const matrix = PROGRESS_THEMES["matrix-rain"]
    expect(matrix.fillBackground).toContain("#00ff66")
    expect(matrix.glow).toContain("rgba(0, 255, 102")
    expect(matrix.mascot.value).toBe("▣")
    expect(matrix.mascot.type).toBe("glyph")
    expect(matrix.mascot.trail).toBe("pixel")
    expect(matrix.motion.type).toBe("scan")
  })

  it("configures synthwave with neon purple, vector mascot and tilt motion", () => {
    const synth = PROGRESS_THEMES["synthwave"]
    expect(synth.fillBackground).toContain("#ff007f")
    expect(synth.fillBackground).toContain("#00f0ff")
    expect(synth.mascot.value).toBe("▲")
    expect(synth.mascot.type).toBe("glyph")
    expect(synth.motion.type).toBe("glide")
    expect(synth.motion.animationClass).toBe("animate-mascot-synthwave-tilt")
  })

  it("configures arcade-pixel with pixel invader mascot and step motion", () => {
    const arcade = PROGRESS_THEMES["arcade-pixel"]
    expect(arcade.fillBackground).toContain("repeating-linear-gradient")
    expect(arcade.mascot.value).toBe("👾")
    expect(arcade.mascot.type).toBe("emoji")
    expect(arcade.motion.type).toBe("step")
  })

  it("configures lava-lamp with molten gradient and lava blob mascot", () => {
    const lava = PROGRESS_THEMES["lava-lamp"]
    expect(lava.fillBackground).toContain("#991b1b")
    expect(lava.fillBackground).toContain("#ea580c")
    expect(lava.mascot.value).toBe("🔥")
    expect(lava.mascot.type).toBe("emoji")
    expect(lava.motion.type).toBe("float")
    expect(lava.motion.animationClass).toBe("animate-mascot-lava-bob")
  })

  it("configures rainbow-pop with sparkle mascot, sparkle trail and float motion", () => {
    const rainbow = PROGRESS_THEMES["rainbow-pop"]
    expect(rainbow.hasAnimation).toBe(true)
    expect(rainbow.fillBackground).toContain("#f43f5e")
    expect(rainbow.mascot.value).toBe("✨")
    expect(rainbow.mascot.type).toBe("emoji")
    expect(rainbow.mascot.trail).toBe("spark")
    expect(rainbow.motion.type).toBe("float")
  })

  it("configures ocean-wave with calm aqua gradient, fish mascot and bubble trail", () => {
    const ocean = PROGRESS_THEMES["ocean-wave"]
    expect(ocean.fillBackground).toContain("#0369a1")
    expect(ocean.fillBackground).toContain("#2dd4bf")
    expect(ocean.mascot.value).toBe("🐟")
    expect(ocean.mascot.type).toBe("emoji")
    expect(ocean.mascot.trail).toBe("bubble")
    expect(ocean.motion.type).toBe("wave")
    expect(ocean.motion.animationClass).toBe("animate-mascot-swim")
  })

  it("configures candy-rush with sweet pink gradient and candy mascot", () => {
    const candy = PROGRESS_THEMES["candy-rush"]
    expect(candy.fillBackground).toContain("#ec4899")
    expect(candy.fillBackground).toContain("#38bdf8")
    expect(candy.mascot.value).toBe("🍬")
    expect(candy.mascot.type).toBe("emoji")
    expect(candy.motion.type).toBe("bounce")
  })

  it("configures cosmic-nebula with galactic blend, rocket mascot and star trail", () => {
    const cosmic = PROGRESS_THEMES["cosmic-nebula"]
    expect(cosmic.fillBackground).toContain("#6366f1")
    expect(cosmic.fillBackground).toContain("#06b6d4")
    expect(cosmic.mascot.value).toBe("🚀")
    expect(cosmic.mascot.type).toBe("emoji")
    expect(cosmic.mascot.trail).toBe("star")
    expect(cosmic.motion.type).toBe("glide")
    expect(cosmic.motion.animationClass).toBe("animate-mascot-rocket-glide")
  })

  it("configures soviet with revolutionary crimson/gold and hammer and sickle mascot", () => {
    const soviet = PROGRESS_THEMES["soviet"]
    expect(soviet.fillBackground).toContain("#dc2626")
    expect(soviet.fillBackground).toContain("#eab308")
    expect(soviet.mascot.value).toBe("☭")
    expect(soviet.mascot.type).toBe("glyph")
    expect(soviet.motion.type).toBe("pulse")
    expect(soviet.motion.animationClass).toBe("animate-mascot-soviet-pulse")
    expect(resolveProgressThemeId("communist")).toBe("soviet")
    expect(resolveProgressThemeId("ussr")).toBe("soviet")
  })
})
