import { useState, useEffect, useCallback } from "react"
import {
  ProgressThemeId,
  ProgressTheme,
  PROGRESS_THEMES,
  DEFAULT_PROGRESS_THEME_ID,
  resolveProgressThemeId,
  getProgressTheme,
} from "@/theme/progressThemes"

export const PROGRESS_THEME_STORAGE_KEY = "rt_library_progress_theme"

export function useProgressTheme() {
  const [progressThemeId, setProgressThemeIdState] = useState<ProgressThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_PROGRESS_THEME_ID
    try {
      const stored = localStorage.getItem(PROGRESS_THEME_STORAGE_KEY)
      return resolveProgressThemeId(stored)
    } catch (_) {
      return DEFAULT_PROGRESS_THEME_ID
    }
  })

  const [progressTheme, setProgressThemeState] = useState<ProgressTheme>(() => {
    return getProgressTheme(progressThemeId)
  })

  const setProgressTheme = useCallback((newThemeId: ProgressThemeId | string) => {
    const resolved = resolveProgressThemeId(newThemeId)
    setProgressThemeIdState(resolved)
    setProgressThemeState(PROGRESS_THEMES[resolved])
    try {
      localStorage.setItem(PROGRESS_THEME_STORAGE_KEY, resolved)
      window.dispatchEvent(
        new CustomEvent("rt-library-progress-theme-changed", { detail: resolved })
      )
    } catch (_) {}
  }, [])

  useEffect(() => {
    const handleThemeChange = (e: CustomEvent<ProgressThemeId>) => {
      if (e.detail && e.detail in PROGRESS_THEMES) {
        setProgressThemeIdState(e.detail)
        setProgressThemeState(PROGRESS_THEMES[e.detail])
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === PROGRESS_THEME_STORAGE_KEY) {
        const resolved = resolveProgressThemeId(e.newValue)
        setProgressThemeIdState(resolved)
        setProgressThemeState(PROGRESS_THEMES[resolved])
      }
    }

    window.addEventListener(
      "rt-library-progress-theme-changed",
      handleThemeChange as EventListener
    )
    window.addEventListener("storage", handleStorage)

    return () => {
      window.removeEventListener(
        "rt-library-progress-theme-changed",
        handleThemeChange as EventListener
      )
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  return {
    progressThemeId,
    progressTheme,
    setProgressTheme,
    progressThemes: PROGRESS_THEMES,
  }
}

