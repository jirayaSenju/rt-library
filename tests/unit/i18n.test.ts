import React from "react"
import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, beforeEach } from "vitest"
import { I18nProvider, useI18n } from "@/i18n/I18nContext"
import { en } from "@/i18n/translations/en"
import { ptBR } from "@/i18n/translations/pt-BR"
import { ruRU } from "@/i18n/translations/ru-RU"

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  React.createElement(I18nProvider, null, children)
)

function getLeafKeys(obj: any, prefix = ""): string[] {
  let keys: string[] = []
  for (const k of Object.keys(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : k
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      keys = keys.concat(getLeafKeys(obj[k], nextKey))
    } else {
      keys.push(nextKey)
    }
  }
  return keys.sort()
}

describe("i18n Context and Hook unit tests", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("defaults to en locale when localStorage is empty", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.locale).toBe("en")
  })

  it("loads existing valid locale from localStorage", () => {
    localStorage.setItem("rt_library_locale", "pt-BR")
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.locale).toBe("pt-BR")
  })

  it("loads ru-RU locale from localStorage", () => {
    localStorage.setItem("rt_library_locale", "ru-RU")
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.locale).toBe("ru-RU")
  })

  it("falls back to en when localStorage has invalid locale", () => {
    localStorage.setItem("rt_library_locale", "fr-FR")
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.locale).toBe("en")
  })

  it("switches locale and persists to localStorage", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.locale).toBe("en")

    act(() => {
      result.current.setLocale("pt-BR")
    })

    expect(result.current.locale).toBe("pt-BR")
    expect(localStorage.getItem("rt_library_locale")).toBe("pt-BR")

    act(() => {
      result.current.setLocale("ru-RU")
    })

    expect(result.current.locale).toBe("ru-RU")
    expect(localStorage.getItem("rt_library_locale")).toBe("ru-RU")
  })

  it("maintains 100% exact key parity between en, pt-BR, and ru-RU dictionaries", () => {
    const enKeys = getLeafKeys(en)
    const ptKeys = getLeafKeys(ptBR)
    const ruKeys = getLeafKeys(ruRU)

    expect(ruKeys).toEqual(enKeys)
    expect(ruKeys).toEqual(ptKeys)
  })

  it("translates keys in en, pt-BR, and ru-RU with parameter interpolation", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    // en translations (default)
    expect(result.current.t("navigation.allGames")).toBe("All Games")
    expect(result.current.t("navigation.favorites")).toBe("Favorites")
    expect(result.current.t("topbar.searchPlaceholder")).toBe("Search games, consoles, metadata... (Ctrl+K)")
    expect(result.current.t("savedViews.menuTitle")).toBe("Saved Views")
    expect(result.current.t("savedViews.savedSuccessToast", { name: "Fast Action" })).toBe('View "Fast Action" saved successfully!')

    // Switch to pt-BR
    act(() => {
      result.current.setLocale("pt-BR")
    })

    expect(result.current.t("navigation.allGames")).toBe("Todos os Jogos")
    expect(result.current.t("navigation.favorites")).toBe("Favoritos")
    expect(result.current.t("topbar.searchPlaceholder")).toBe("Buscar jogos, consoles, metadados... (Ctrl+K)")
    expect(result.current.t("savedViews.menuTitle")).toBe("Visualizações Salvas")
    expect(result.current.t("savedViews.savedSuccessToast", { name: "Ação Rápida" })).toBe('Visualização "Ação Rápida" salva com sucesso!')

    // Switch to ru-RU
    act(() => {
      result.current.setLocale("ru-RU")
    })

    expect(result.current.t("navigation.allGames")).toBe("Все игры")
    expect(result.current.t("navigation.favorites")).toBe("Избранное")
    expect(result.current.t("topbar.searchPlaceholder")).toBe("Поиск игр, консолей, метаданных... (Ctrl+K)")
    expect(result.current.t("savedViews.menuTitle")).toBe("Сохранённые представления")
    expect(result.current.t("savedViews.savedSuccessToast", { name: "Быстрый вид" })).toBe('Представление "Быстрый вид" успешно сохранено!')
    expect(result.current.t("catalog.emptyTitle")).toBe("Ничего не найдено")
    expect(result.current.t("settings.database.healthHealthy")).toBe("Исправна")
  })

  it("formats numbers using active locale (en, pt-BR, ru-RU)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    // In en (default): 22103 -> 22,103
    const enFormatted = result.current.formatNumber(22103)
    expect(enFormatted).toBe("22,103")

    act(() => {
      result.current.setLocale("pt-BR")
    })

    // In pt-BR: 22103 -> 22.103
    const ptFormatted = result.current.formatNumber(22103)
    expect(ptFormatted).toBe("22.103")

    act(() => {
      result.current.setLocale("ru-RU")
    })

    // In ru-RU: 22103 -> 22 103 (with space/non-breaking space)
    const ruFormatted = result.current.formatNumber(22103)
    expect(ruFormatted.replace(/[\s\u00A0\u202F]/g, " ")).toBe("22 103")
  })

  it("handles plural rules correctly for Russian (1, 2, 5, 21 items)", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    act(() => {
      result.current.setLocale("ru-RU")
    })

    const forms = {
      one: "{count} элемент",
      few: "{count} элемента",
      many: "{count} элементов",
      other: "{count} элементов",
    }

    expect(result.current.formatPlural(1, forms)).toBe("1 элемент")
    expect(result.current.formatPlural(2, forms)).toBe("2 элемента")
    expect(result.current.formatPlural(5, forms)).toBe("5 элементов")
    expect(result.current.formatPlural(21, forms)).toBe("21 элемент")
    expect(result.current.formatPlural(24, forms)).toBe("24 элемента")
  })

  it("returns fallback key if translation path does not exist", () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.t("non.existent.path")).toBe("non.existent.path")
  })
})
