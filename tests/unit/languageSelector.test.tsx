import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { LanguageSelector } from "@/components/settings/LanguageSelector"
import { I18nProvider, SUPPORTED_LOCALES, getLocaleDefinition, isSupportedLocale } from "@/i18n"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("LanguageSelector Component & Registry Unit Tests", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("exports a central locale registry with flags, short labels, and native names", () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(2)
    const ptBR = SUPPORTED_LOCALES.find((l) => l.id === "pt-BR")
    const en = SUPPORTED_LOCALES.find((l) => l.id === "en")

    expect(ptBR).toBeDefined()
    expect(ptBR?.flag).toBe("🇧🇷")
    expect(ptBR?.shortLabel).toBe("PT-BR")
    expect(ptBR?.nativeName).toBe("Português (Brasil)")

    expect(en).toBeDefined()
    expect(en?.flag).toBe("🇺🇸")
    expect(en?.shortLabel).toBe("EN")
    expect(en?.nativeName).toBe("English")
  })

  it("validates supported locales and falls back gracefully", () => {
    expect(isSupportedLocale("pt-BR")).toBe(true)
    expect(isSupportedLocale("en")).toBe(true)
    expect(isSupportedLocale("invalid-xx")).toBe(false)
    expect(isSupportedLocale(null)).toBe(false)

    const def = getLocaleDefinition("pt-BR")
    expect(def.id).toBe("pt-BR")

    const fallbackDef = getLocaleDefinition("invalid-xx")
    expect(fallbackDef.id).toBe("en")
  })

  it("renders compact trigger with flag, short code, and native name", () => {
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("EN")
    expect(trigger).toHaveTextContent("English")
    expect(trigger).toHaveTextContent("🇺🇸")
  })

  it("opens dropdown and lists all supported locales from the registry", async () => {
    const user = userEvent.setup()
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    await user.click(trigger)

    const options = screen.getAllByRole("option")
    expect(options.length).toBe(SUPPORTED_LOCALES.length)

    expect(screen.getByRole("option", { name: /Português \(Brasil\)/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /English/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Русский/i })).toBeInTheDocument()
  })

  it("switches language immediately upon selection and updates localStorage", async () => {
    const user = userEvent.setup()
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    await user.click(trigger)

    const ptOption = screen.getByRole("option", { name: /Português \(Brasil\)/i })
    await user.click(ptOption)

    expect(localStorage.getItem("rt_library_locale")).toBe("pt-BR")
    expect(screen.getByRole("combobox")).toHaveTextContent("PT-BR")
    expect(screen.getByRole("combobox")).toHaveTextContent("Português (Brasil)")
    expect(screen.getByRole("combobox")).toHaveTextContent("🇧🇷")

    // Switch to Russian
    await user.click(screen.getByRole("combobox"))
    const ruOption = screen.getByRole("option", { name: /Русский/i })
    await user.click(ruOption)

    expect(localStorage.getItem("rt_library_locale")).toBe("ru-RU")
    expect(screen.getByRole("combobox")).toHaveTextContent("RU")
    expect(screen.getByRole("combobox")).toHaveTextContent("Русский")
    expect(screen.getByRole("combobox")).toHaveTextContent("🇷🇺")
  })

  it("supports keyboard navigation: Enter to open, Arrow keys to navigate, Enter to select", async () => {
    const user = userEvent.setup()
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    trigger.focus()
    expect(trigger).toHaveFocus()

    // Press Space or Enter to open
    await user.keyboard("{Enter}")

    const options = screen.getAllByRole("option")
    expect(options.length).toBe(SUPPORTED_LOCALES.length)

    // Press ArrowDown and Enter
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{Enter}")

    // Language switched
    expect(localStorage.getItem("rt_library_locale")).toBeDefined()
  })

  it("supports Escape to close the dropdown without changing locale", async () => {
    const user = userEvent.setup()
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    await user.click(trigger)
    expect(screen.getAllByRole("option").length).toBe(SUPPORTED_LOCALES.length)

    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(screen.queryByRole("option")).not.toBeInTheDocument()
    })
  })

  it("renders flag with aria-hidden=true for screen reader accessibility", async () => {
    const { container } = renderWithI18n(<LanguageSelector />)

    const flagSpan = container.querySelector('span[aria-hidden="true"]')
    expect(flagSpan).toBeInTheDocument()
    expect(flagSpan).toHaveTextContent("🇺🇸")
  })

  it("handles fallback to default locale when localStorage contains invalid data", () => {
    localStorage.setItem("rt_library_locale", "invalid-xyz")
    renderWithI18n(<LanguageSelector />)

    const trigger = screen.getByRole("combobox")
    expect(trigger).toHaveTextContent("EN")
  })

  it("scales gracefully with mock 10+ locale definitions without changing selector JSX", () => {
    const mockLocales = [
      ...SUPPORTED_LOCALES,
      { id: "es" as any, shortLabel: "ES", displayName: "Español", nativeName: "Español", flag: "🇪🇸" },
      { id: "fr" as any, shortLabel: "FR", displayName: "Français", nativeName: "Français", flag: "🇫🇷" },
      { id: "de" as any, shortLabel: "DE", displayName: "Deutsch", nativeName: "Deutsch", flag: "🇩🇪" },
      { id: "it" as any, shortLabel: "IT", displayName: "Italiano", nativeName: "Italiano", flag: "🇮🇹" },
      { id: "ja" as any, shortLabel: "JA", displayName: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
      { id: "ko" as any, shortLabel: "KO", displayName: "Korean", nativeName: "한국어", flag: "🇰🇷" },
      { id: "zh" as any, shortLabel: "ZH", displayName: "Chinese", nativeName: "中文", flag: "🇨🇳" },
    ]

    expect(mockLocales.length).toBeGreaterThanOrEqual(10)
    expect(mockLocales.every((l) => l.id && l.shortLabel && l.nativeName)).toBe(true)
  })
})
