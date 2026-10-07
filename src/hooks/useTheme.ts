import { useState, useEffect, useCallback } from "react"
import { ThemeId, AppTheme, THEMES, DEFAULT_THEME_ID, resolveThemeId, applyTheme } from "@/theme/themes"

export const STORAGE_KEY = "rt_library_theme"

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID
    const stored = localStorage.getItem(STORAGE_KEY)
    const resolved = resolveThemeId(stored)
    // Migrate legacy values immediately
    if (stored === "dark" || stored === "light") {
      localStorage.setItem(STORAGE_KEY, resolved)
    }
    return resolved
  })

  const [theme, setThemeState] = useState<AppTheme>(() => {
    return THEMES[themeId] || THEMES[DEFAULT_THEME_ID]
  })

  const setTheme = useCallback((newThemeId: ThemeId) => {
    const resolved = resolveThemeId(newThemeId)
    setThemeIdState(resolved)
    const applied = applyTheme(resolved)
    setThemeState(applied)
    try {
      localStorage.setItem(STORAGE_KEY, resolved)
    } catch (_) {}
  }, [])

  useEffect(() => {
    const applied = applyTheme(themeId)
    setThemeState(applied)
  }, [themeId])

  return {
    themeId,
    theme,
    setTheme,
    themes: THEMES,
  }
}
