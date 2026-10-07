import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { Locale, TranslationParams, Translations } from "./types"
import { ptBR } from "./translations/pt-BR"
import { en } from "./translations/en"
import { ruRU } from "./translations/ru-RU"
import { DEFAULT_LOCALE, isSupportedLocale } from "./locales"

const STORAGE_KEY = "rt_library_locale"

const dictionaries: Record<Locale, Translations> = {
  "pt-BR": ptBR,
  en: en,
  "ru-RU": ruRU,
}

export interface PluralForms {
  one: string
  few?: string
  many?: string
  other: string
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (path: string, params?: TranslationParams) => string
  formatNumber: (value: number) => string
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
  formatPlural: (count: number, forms: PluralForms) => string
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || !path) return undefined
  const parts = path.split(".")
  let current = obj
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined
    }
    current = current[part]
  }
  return typeof current === "string" ? current : undefined
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (key in params) {
      return String(params[key])
    }
    return match
  })
}

function validateLocale(val: string | null): Locale {
  if (isSupportedLocale(val)) {
    return val
  }
  return DEFAULT_LOCALE
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY)
      return validateLocale(saved)
    }
    return DEFAULT_LOCALE
  })

  const setLocale = useCallback((newLocale: Locale) => {
    const validated = validateLocale(newLocale)
    setLocaleState(validated)
    try {
      localStorage.setItem(STORAGE_KEY, validated)
    } catch (e) {
      console.warn("[i18n] Failed to persist locale to localStorage:", e)
    }
  }, [])

  const t = useCallback(
    (path: string, params?: TranslationParams): string => {
      const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE]
      let value = getNestedValue(dict, path)

      // Fallback to default dictionary if missing in active locale
      if (value === undefined && locale !== DEFAULT_LOCALE) {
        value = getNestedValue(dictionaries[DEFAULT_LOCALE], path)
      }

      // Fallback to English dictionary if still missing
      if (value === undefined && locale !== "en") {
        value = getNestedValue(dictionaries.en, path)
      }

      if (value === undefined) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[i18n] Missing translation key: "${path}" for locale: "${locale}"`)
        }
        return path
      }

      return interpolate(value, params)
    },
    [locale]
  )

  const formatNumber = useCallback(
    (value: number): string => {
      try {
        return new Intl.NumberFormat(locale).format(value)
      } catch {
        return String(value)
      }
    },
    [locale]
  )

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
      try {
        const d = typeof date === "object" ? date : new Date(date)
        return new Intl.DateTimeFormat(locale, options).format(d)
      } catch {
        return String(date)
      }
    },
    [locale]
  )

  const formatPlural = useCallback(
    (count: number, forms: PluralForms): string => {
      try {
        const pr = new Intl.PluralRules(locale)
        const rule = pr.select(count)
        const template = forms[rule as keyof PluralForms] || forms.other || forms.one
        return interpolate(template, { count: formatNumber(count) })
      } catch {
        return forms.other || forms.one
      }
    },
    [locale, formatNumber]
  )

  const formatRelativeTime = useCallback(
    (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string => {
      try {
        return new Intl.RelativeTimeFormat(locale, options || { numeric: "auto" }).format(value, unit)
      } catch {
        return `${value} ${unit}`
      }
    },
    [locale]
  )

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatNumber,
      formatDate,
      formatPlural,
      formatRelativeTime,
    }),
    [locale, setLocale, t, formatNumber, formatDate, formatPlural, formatRelativeTime]
  )

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider")
  }
  return context
}
