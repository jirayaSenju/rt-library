import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useProgressTheme, PROGRESS_THEME_STORAGE_KEY } from "@/hooks/useProgressTheme"
import { STORAGE_KEY as GLOBAL_THEME_STORAGE_KEY } from "@/hooks/useTheme"

describe("useProgressTheme hook tests", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("initializes with 'nyan-cat' theme when localStorage is empty", () => {
    const { result } = renderHook(() => useProgressTheme())
    expect(result.current.progressThemeId).toBe("nyan-cat")
    expect(result.current.progressTheme.id).toBe("nyan-cat")
  })

  it("loads stored theme from localStorage on initial render", () => {
    localStorage.setItem(PROGRESS_THEME_STORAGE_KEY, "matrix-rain")
    const { result } = renderHook(() => useProgressTheme())
    expect(result.current.progressThemeId).toBe("matrix-rain")
    expect(result.current.progressTheme.id).toBe("matrix-rain")
  })

  it("resolves legacy theme aliases from localStorage correctly", () => {
    localStorage.setItem(PROGRESS_THEME_STORAGE_KEY, "matrix")
    const { result } = renderHook(() => useProgressTheme())
    expect(result.current.progressThemeId).toBe("matrix-rain")
    expect(result.current.progressTheme.id).toBe("matrix-rain")
  })

  it("falls back to 'nyan-cat' when localStorage has an invalid value", () => {
    localStorage.setItem(PROGRESS_THEME_STORAGE_KEY, "banana-invalid-theme")
    const { result } = renderHook(() => useProgressTheme())
    expect(result.current.progressThemeId).toBe("nyan-cat")
    expect(result.current.progressTheme.id).toBe("nyan-cat")
  })

  it("updates state and persists to localStorage when setProgressTheme is called", () => {
    const { result } = renderHook(() => useProgressTheme())

    act(() => {
      result.current.setProgressTheme("claude-code")
    })

    expect(result.current.progressThemeId).toBe("claude-code")
    expect(result.current.progressTheme.id).toBe("claude-code")
    expect(localStorage.getItem(PROGRESS_THEME_STORAGE_KEY)).toBe("claude-code")
  })

  it("maintains strict independence from the global app theme", () => {
    localStorage.setItem(GLOBAL_THEME_STORAGE_KEY, "eco-green")
    localStorage.setItem(PROGRESS_THEME_STORAGE_KEY, "synthwave")

    const { result } = renderHook(() => useProgressTheme())

    expect(result.current.progressThemeId).toBe("synthwave")
    expect(localStorage.getItem(GLOBAL_THEME_STORAGE_KEY)).toBe("eco-green")

    // Change progress theme
    act(() => {
      result.current.setProgressTheme("ocean-wave")
    })

    expect(result.current.progressThemeId).toBe("ocean-wave")
    // Global theme must remain untouched
    expect(localStorage.getItem(GLOBAL_THEME_STORAGE_KEY)).toBe("eco-green")
  })
})
