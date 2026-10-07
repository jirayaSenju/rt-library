import { describe, it, expect, beforeEach } from "vitest"
import {
  ThemeId,
  THEMES,
  DEFAULT_THEME_ID,
  resolveThemeId,
  applyTheme,
  ThemeColors,
} from "@/theme/themes"

describe("Theme System (V3-10) Unit Tests", () => {
  beforeEach(() => {
    document.documentElement.className = ""
    document.documentElement.removeAttribute("data-theme")
  })

  describe("THEMES Registry", () => {
    it("contains all 14 supported themes", () => {
      const themeIds = Object.keys(THEMES) as ThemeId[]
      expect(themeIds).toEqual([
        "rt-dark",
        "rt-light",
        "dracula",
        "nord",
        "gruvbox-dark",
        "catppuccin-mocha",
        "tokyo-night",
        "eco-green",
        "eco-red",
        "pride",
        "trans-pride",
        "bi-pride",
        "lesbian-pride",
        "nonbinary-pride",
      ])
      expect(themeIds.length).toBe(14)
    })

    it("has valid structure, group categorization, and required fields for every theme", () => {
      const requiredColorKeys: (keyof ThemeColors)[] = [
        "background",
        "foreground",
        "card",
        "cardForeground",
        "popover",
        "popoverForeground",
        "primary",
        "primaryForeground",
        "secondary",
        "secondaryForeground",
        "muted",
        "mutedForeground",
        "accent",
        "accentForeground",
        "destructive",
        "destructiveForeground",
        "border",
        "input",
        "ring",
        "scrollbarTrack",
        "scrollbarThumb",
        "scrollbarThumbHover",
      ]

      const requiredCssVars = [
        "--background",
        "--foreground",
        "--card",
        "--card-foreground",
        "--popover",
        "--popover-foreground",
        "--primary",
        "--primary-foreground",
        "--secondary",
        "--secondary-foreground",
        "--muted",
        "--muted-foreground",
        "--accent",
        "--accent-foreground",
        "--destructive",
        "--destructive-foreground",
        "--border",
        "--input",
        "--ring",
        "--scrollbar-track",
        "--scrollbar-thumb",
        "--scrollbar-thumb-hover",
      ]

      for (const [id, theme] of Object.entries(THEMES)) {
        expect(theme.id).toBe(id)
        expect(theme.name).toBeDefined()
        expect(["dark", "light"]).toContain(theme.type)
        expect(["builtin", "terminal", "community"]).toContain(theme.group)

        // Preview swatches
        expect(theme.preview.bg).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(theme.preview.surface).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(theme.preview.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
        expect(theme.preview.text).toMatch(/^#[0-9a-fA-F]{6}$/)

        // Token parity across all 22 colors keys
        for (const colorKey of requiredColorKeys) {
          expect(theme.colors[colorKey], `Theme ${id} missing color ${colorKey}`).toBeDefined()
        }

        // Token parity across all 22 CSS variables
        for (const varKey of requiredCssVars) {
          expect(theme.cssVars[varKey], `Theme ${id} missing cssVar ${varKey}`).toBeDefined()
        }
      }
    })

    it("assigns themes to correct visual groups", () => {
      const builtin = Object.values(THEMES).filter((t) => t.group === "builtin").map((t) => t.id)
      const terminal = Object.values(THEMES).filter((t) => t.group === "terminal").map((t) => t.id)
      const community = Object.values(THEMES).filter((t) => t.group === "community").map((t) => t.id)

      expect(builtin).toEqual(["rt-dark", "rt-light"])
      expect(terminal).toEqual([
        "dracula",
        "nord",
        "gruvbox-dark",
        "catppuccin-mocha",
        "tokyo-night",
        "eco-green",
        "eco-red",
      ])
      expect(community).toEqual([
        "pride",
        "trans-pride",
        "bi-pride",
        "lesbian-pride",
        "nonbinary-pride",
      ])
    })
  })

  describe("resolveThemeId", () => {
    it("returns DEFAULT_THEME_ID when value is null or undefined or empty", () => {
      expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID)
      expect(resolveThemeId(undefined)).toBe(DEFAULT_THEME_ID)
      expect(resolveThemeId("")).toBe(DEFAULT_THEME_ID)
    })

    it("migrates legacy 'dark' to 'rt-dark'", () => {
      expect(resolveThemeId("dark")).toBe("rt-dark")
    })

    it("migrates legacy 'light' to 'rt-light'", () => {
      expect(resolveThemeId("light")).toBe("rt-light")
    })

    it("returns valid registered theme IDs without modification", () => {
      const allIds = Object.keys(THEMES) as ThemeId[]
      for (const id of allIds) {
        expect(resolveThemeId(id)).toBe(id)
      }
    })

    it("falls back to DEFAULT_THEME_ID for unrecognized theme strings", () => {
      expect(resolveThemeId("unknown-theme")).toBe(DEFAULT_THEME_ID)
      expect(resolveThemeId("random123")).toBe(DEFAULT_THEME_ID)
    })
  })

  describe("applyTheme", () => {
    it("sets data-theme attribute and dark class for dark terminal themes", () => {
      const theme = applyTheme("dracula")
      expect(theme.id).toBe("dracula")
      expect(document.documentElement.getAttribute("data-theme")).toBe("dracula")
      expect(document.documentElement.classList.contains("dark")).toBe(true)
      expect(document.documentElement.classList.contains("light")).toBe(false)
      expect(document.documentElement.style.getPropertyValue("--background")).toBe("231 15% 18%")
    })

    it("sets data-theme attribute and light class for light themes", () => {
      const theme = applyTheme("rt-light")
      expect(theme.id).toBe("rt-light")
      expect(document.documentElement.getAttribute("data-theme")).toBe("rt-light")
      expect(document.documentElement.classList.contains("light")).toBe(true)
      expect(document.documentElement.classList.contains("dark")).toBe(false)
      expect(document.documentElement.style.getPropertyValue("--background")).toBe("0 0% 100%")
    })

    it("applies new environmental and community themes accurately", () => {
      applyTheme("eco-green")
      expect(document.documentElement.getAttribute("data-theme")).toBe("eco-green")
      expect(document.documentElement.style.getPropertyValue("--primary")).toBe(THEMES["eco-green"].cssVars["--primary"])

      applyTheme("pride")
      expect(document.documentElement.getAttribute("data-theme")).toBe("pride")
      expect(document.documentElement.style.getPropertyValue("--primary")).toBe(THEMES["pride"].cssVars["--primary"])

      applyTheme("trans-pride")
      expect(document.documentElement.getAttribute("data-theme")).toBe("trans-pride")
      expect(document.documentElement.style.getPropertyValue("--primary")).toBe(THEMES["trans-pride"].cssVars["--primary"])
    })
  })
})
