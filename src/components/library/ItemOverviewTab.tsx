import React, { useState } from "react"
import { LibraryItem } from "@/types"
import { ResolvedTorrentDisplayData } from "@/utils/torrentSourceResolver"
import { Button } from "@/components/ui/button"
import {
  Magnet,
  RotateCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  HardDrive,
  Info,
  Server,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

interface ItemOverviewTabProps {
  item: LibraryItem
  resolvedData: ResolvedTorrentDisplayData
  isRefreshingTorrent: boolean
  onRefreshTorrent: () => void
  onNavigateToFiles?: () => void
}

import { Locale } from "@/i18n/types"

const LANGUAGE_NAMES: Record<string, { en: string; "pt-BR": string; "ru-RU": string }> = {
  en: { en: "English", "pt-BR": "Inglês", "ru-RU": "Английский" },
  ru: { en: "Russian", "pt-BR": "Russo", "ru-RU": "Русский" },
  ja: { en: "Japanese", "pt-BR": "Japonês", "ru-RU": "Японский" },
  de: { en: "German", "pt-BR": "Alemão", "ru-RU": "Немецкий" },
  fr: { en: "French", "pt-BR": "Francês", "ru-RU": "Французский" },
  es: { en: "Spanish", "pt-BR": "Espanhol", "ru-RU": "Испанский" },
  it: { en: "Italian", "pt-BR": "Italiano", "ru-RU": "Итальянский" },
  pt: { en: "Portuguese", "pt-BR": "Português", "ru-RU": "Португальский" },
  zh: { en: "Chinese", "pt-BR": "Chinês", "ru-RU": "Китайский" },
  ko: { en: "Korean", "pt-BR": "Coreano", "ru-RU": "Корейский" },
  pl: { en: "Polish", "pt-BR": "Polonês", "ru-RU": "Польский" },
  uk: { en: "Ukrainian", "pt-BR": "Ucraniano", "ru-RU": "Украинский" },
}

function formatDisplayLanguage(rawLang: string | null | undefined, locale: Locale): string | null {
  if (!rawLang || !rawLang.trim()) return null
  const tokens = rawLang.split(/[,/]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  const formatted = tokens.map((token) => {
    if (LANGUAGE_NAMES[token]) {
      return LANGUAGE_NAMES[token][locale] || LANGUAGE_NAMES[token].en
    }
    return token.charAt(0).toUpperCase() + token.slice(1)
  })
  return formatted.length > 0 ? formatted.join(", ") : rawLang
}

export const ItemOverviewTab: React.FC<ItemOverviewTabProps> = ({
  item,
  resolvedData,
  isRefreshingTorrent,
  onRefreshTorrent,
  onNavigateToFiles,
}) => {
  const { t, formatNumber, locale } = useI18n()
  const [isNfoExpanded, setIsNfoExpanded] = useState(false)

  const formatRelativeTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return t("itemDetail.timeNever")
    const diffMs = Date.now() - new Date(dateStr).getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return t("itemDetail.timeJustNow")
    if (diffMin < 60) return t("itemDetail.timeMinutesAgo", { count: diffMin })
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return t("itemDetail.timeHoursAgo", { count: diffHours })
    const diffDays = Math.floor(diffHours / 24)
    return t("itemDetail.timeDaysAgo", { count: diffDays })
  }

  // Extract description/NFO from various sources if present
  const descriptionText =
    (item as any).description ||
    (item as any).nfo ||
    (item as any).source?.description ||
    (item as any).scraping?.description ||
    null

  const formattedInterfaceLang = formatDisplayLanguage(item.interfaceLanguage || item.language, locale)
  const formattedVoiceLang = formatDisplayLanguage(item.voiceLanguage, locale)

  let formattedMultiplayer = item.multiplayer
  if (formattedMultiplayer === "Yes" || formattedMultiplayer === "yes") {
    formattedMultiplayer = locale === "pt-BR" ? "Sim" : locale === "ru-RU" ? "Да" : "Yes"
  } else if (formattedMultiplayer === "No" || formattedMultiplayer === "no") {
    formattedMultiplayer = locale === "pt-BR" ? "Não" : locale === "ru-RU" ? "Нет" : "No"
  }

  // Define metadata fields with non-empty checks
  const metadataFields = [
    { label: "Release Group", value: item.releaseGroup },
    { label: t("itemDetail.developer"), value: item.developer },
    { label: t("itemDetail.publisher"), value: item.publisher },
    { label: t("itemDetail.genre"), value: item.genre },
    { label: t("itemDetail.releaseYear"), value: item.releaseYear },
    { label: t("itemDetail.imageFormat"), value: item.imageFormat, highlight: true },
    { label: t("itemDetail.gameVersion"), value: item.gameVersion || item.version },
    { label: t("itemDetail.interfaceLanguage"), value: formattedInterfaceLang },
    { label: t("itemDetail.audioVoice"), value: formattedVoiceLang },
    { label: t("itemDetail.multiplayer"), value: formattedMultiplayer },
    { label: t("itemDetail.region"), value: item.region },
  ].filter((f) => Boolean(f.value && String(f.value).trim()))

  const hasMagnet = Boolean(item.magnetLink || item.magnet)

  return (
    <div className="space-y-5 max-w-4xl">
      {/* 1. TORRENT SUMMARY CARD (if item has torrent data) */}
      {hasMagnet && (
        <div className="bg-card/60 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Magnet className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                {t("itemDetail.torrentAndSwarm")}
              </h4>
            </div>

            <Button
              variant="ghost"
              size="sm"
              disabled={isRefreshingTorrent}
              onClick={onRefreshTorrent}
              className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg"
              title={t("itemDetail.refreshSwarm")}
            >
              <RotateCw
                className={cn(
                  "h-3 w-3 mr-1.5",
                  isRefreshingTorrent && "animate-spin text-primary"
                )}
              />
              {isRefreshingTorrent ? t("itemDetail.refreshingSwarm") : t("itemDetail.refreshSwarm")}
            </Button>
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Total Size */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                {t("itemDetail.totalSize")}
              </span>
              <div className="mt-1">
                <span className="text-sm font-bold text-foreground font-mono block">
                  {resolvedData.totalSizeFormatted}
                </span>
                {resolvedData.totalSizeSource && (
                  <span className="text-[9px] font-mono text-muted-foreground/70 block uppercase">
                    {resolvedData.totalSizeSource === "torrent" ? "BitTorrent" : "RuTracker"}
                  </span>
                )}
              </div>
            </div>

            {/* Files (clickable -> navigates to Files tab) */}
            <button
              type="button"
              onClick={onNavigateToFiles}
              className="bg-muted/40 border border-border/80 hover:border-primary/50 hover:bg-secondary rounded-xl p-3 text-left transition-all group flex flex-col justify-between"
              title="Click to view full files tree"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] text-muted-foreground group-hover:text-primary font-semibold uppercase tracking-wider transition-colors block">
                  {t("itemDetail.filesCount")}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-1">
                <span className="text-sm font-bold text-foreground font-mono group-hover:text-primary transition-colors block">
                  {resolvedData.fileCount !== null ? formatNumber(resolvedData.fileCount) : "—"}
                </span>
                {resolvedData.filesSource && (
                  <span className="text-[9px] font-mono text-muted-foreground/70 block uppercase">
                    {resolvedData.filesSource === "torrent" ? "BitTorrent" : "RuTracker"}
                  </span>
                )}
              </div>
            </button>

            {/* Seeds */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                {t("itemDetail.seeds")}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <ArrowUp className="h-3 w-3 text-emerald-500 self-center stroke-[2.5]" />
                <span className="text-sm font-bold text-emerald-500 font-mono">
                  {resolvedData.seeds !== null ? formatNumber(resolvedData.seeds) : "—"}
                </span>
              </div>
            </div>

            {/* Leechers */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                {t("itemDetail.leechers")}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <ArrowDown className="h-3 w-3 text-sky-500 self-center stroke-[2.5]" />
                <span className="text-sm font-bold text-sky-500 font-mono">
                  {resolvedData.leechers !== null ? formatNumber(resolvedData.leechers) : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Timestamp footer */}
          <div className="text-[11px] font-mono text-muted-foreground pt-1 flex items-center justify-between">
            <span>
              {t("itemDetail.swarmVerified")}{" "}
              <span className="text-foreground/90 font-medium">
                {resolvedData.swarmUpdatedAt
                  ? formatRelativeTime(resolvedData.swarmUpdatedAt)
                  : resolvedData.swarmStatus === "fetching" || isRefreshingTorrent
                  ? t("itemDetail.statusFetching")
                  : t("itemDetail.statusPending")}
                {resolvedData.swarmStatus === "stale" && ` · ${t("itemDetail.statusStale")}`}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 2. GAME METADATA GRID */}
      {metadataFields.length > 0 && (
        <div className="bg-card/60 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("itemDetail.gameInformation")}
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            {metadataFields.map((field) => (
              <div
                key={field.label}
                className="bg-muted/40 border border-border/80 p-2.5 rounded-xl flex flex-col justify-start"
              >
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {field.label}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium break-words leading-snug mt-1",
                    field.highlight ? "text-primary font-mono font-semibold" : "text-foreground"
                  )}
                  title={String(field.value)}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. DESCRIPTION / NFO (COLLAPSIBLE) */}
      {descriptionText && (
        <div className="bg-card/60 border border-border rounded-xl p-4 space-y-3">
          <button
            type="button"
            onClick={() => setIsNfoExpanded((prev) => !prev)}
            className="flex items-center justify-between w-full text-left"
            aria-expanded={isNfoExpanded}
          >
            <div className="flex items-center gap-2 text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                {t("itemDetail.descriptionNfo")}
              </h4>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <span>{isNfoExpanded ? t("itemDetail.collapse") : t("itemDetail.expand")}</span>
              {isNfoExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </button>

          {isNfoExpanded && (
            <div className="p-3.5 bg-background border border-border rounded-xl max-h-72 overflow-y-auto custom-scrollbar animate-in fade-in-0 duration-150">
              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed select-text">
                {descriptionText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
