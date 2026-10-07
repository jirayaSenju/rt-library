import { describe, it, expect } from "vitest"
import { THEMES, ThemeId } from "@/theme/themes"

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ]
  }
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ]
}

function sRgbToLinear(c: number): number {
  const norm = c / 255
  return norm <= 0.03928 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const rLin = sRgbToLinear(r)
  const gLin = sRgbToLinear(g)
  const bLin = sRgbToLinear(b)
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin
}

function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hex1)
  const lum2 = relativeLuminance(hex2)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe("Theme Contrast & Accessibility (V3-25)", () => {
  const allThemeIds = Object.keys(THEMES) as ThemeId[]

  describe("WCAG AA Compliance (>= 4.5:1 for normal text)", () => {
    for (const themeId of allThemeIds) {
      const theme = THEMES[themeId]

      describe(`Theme: ${theme.name} (${themeId})`, () => {
        it("foreground on background meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.foreground, theme.colors.background)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("cardForeground on card meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.cardForeground, theme.colors.card)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("popoverForeground on popover meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.popoverForeground, theme.colors.popover)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("primaryForeground on primary meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.primaryForeground, theme.colors.primary)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("secondaryForeground on secondary meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.secondaryForeground, theme.colors.secondary)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("destructiveForeground on destructive meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.destructiveForeground, theme.colors.destructive)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("accentForeground on accent meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.accentForeground, theme.colors.accent)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("mutedForeground on background meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.mutedForeground, theme.colors.background)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })

        it("mutedForeground on card meets WCAG AA (>= 4.5:1)", () => {
          const ratio = contrastRatio(theme.colors.mutedForeground, theme.colors.card)
          expect(ratio).toBeGreaterThanOrEqual(4.5)
        })
      })
    }
  })

  describe("Specific Theme Readability Fixes", () => {
    it("Dracula mutedForeground (#b0c2e8) provides high contrast against background and card", () => {
      const dracula = THEMES["dracula"]
      const bgRatio = contrastRatio(dracula.colors.mutedForeground, dracula.colors.background)
      const cardRatio = contrastRatio(dracula.colors.mutedForeground, dracula.colors.card)
      expect(bgRatio).toBeGreaterThanOrEqual(7.0) // ~7.95:1
      expect(cardRatio).toBeGreaterThanOrEqual(8.0) // ~8.82:1
    })

    it("RT Light primary and mutedForeground meet strict readability contrast on light backgrounds", () => {
      const rtLight = THEMES["rt-light"]
      const primaryRatio = contrastRatio(rtLight.colors.primary, rtLight.colors.background)
      const mutedRatio = contrastRatio(rtLight.colors.mutedForeground, rtLight.colors.background)
      expect(primaryRatio).toBeGreaterThanOrEqual(4.5)
      expect(mutedRatio).toBeGreaterThanOrEqual(4.5)
    })
  })
})

