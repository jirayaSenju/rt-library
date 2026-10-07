import { Locale } from "./types"

export interface LocaleDefinition {
  id: Locale
  shortLabel: string
  displayName: string
  nativeName: string
  flag?: string
}

export const SUPPORTED_LOCALES: LocaleDefinition[] = [
  {
    id: "pt-BR",
    shortLabel: "PT-BR",
    displayName: "Português (Brasil)",
    nativeName: "Português (Brasil)",
    flag: "🇧🇷",
  },
  {
    id: "en",
    shortLabel: "EN",
    displayName: "English",
    nativeName: "English",
    flag: "🇺🇸",
  },
  {
    id: "ru-RU",
    shortLabel: "RU",
    displayName: "Русский",
    nativeName: "Русский",
    flag: "🇷🇺",
  },
]

export const DEFAULT_LOCALE: Locale = "en"

export const getLocaleDefinition = (id: string): LocaleDefinition => {
  const found = SUPPORTED_LOCALES.find((l) => l.id === id)
  return (
    found ||
    SUPPORTED_LOCALES.find((l) => l.id === DEFAULT_LOCALE) ||
    SUPPORTED_LOCALES[0]
  )
}

export const isSupportedLocale = (val: unknown): val is Locale => {
  return typeof val === "string" && SUPPORTED_LOCALES.some((l) => l.id === val)
}

