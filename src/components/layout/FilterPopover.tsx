import React, { useState, useEffect, useMemo } from "react"
import { Filter, SlidersHorizontal, Check, RotateCcw, ChevronDown, ChevronUp, AlertCircle, ArrowUp, ArrowDown, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { LibraryFilters, FilterOptions } from "@/types"
import { FilterFacetsResponse } from "@/types/libraryIPC"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { FacetMultiSelect, FacetOption } from "@/components/layout/FacetMultiSelect"

interface FilterPopoverProps {
  filters: LibraryFilters
  onApplyFilters: (filters: LibraryFilters) => void
  sortBy?: FilterOptions["sortBy"]
  sortOrder?: FilterOptions["sortOrder"]
  onSortChange?: (sortBy: FilterOptions["sortBy"], sortOrder: FilterOptions["sortOrder"]) => void
  categoryId?: string
}

const BYTES_IN_GB = 1024 * 1024 * 1024

function bytesToGbString(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return ""
  const gb = bytes / BYTES_IN_GB
  return Number.isInteger(gb) ? String(gb) : String(Number(gb.toFixed(2)))
}

function gbStringToBytes(gbStr: string): number | null {
  const val = parseFloat(gbStr.trim())
  if (!Number.isFinite(val) || val < 0) return null
  return Math.round(val * BYTES_IN_GB)
}

const ISO_LANGUAGE_NAMES: Record<string, { pt: string; en: string; ru: string }> = {
  en: { pt: "Inglês", en: "English", ru: "Английский" },
  ru: { pt: "Russo", en: "Russian", ru: "Русский" },
  ja: { pt: "Japonês", en: "Japanese", ru: "Японский" },
  de: { pt: "Alemão", en: "German", ru: "Немецкий" },
  fr: { pt: "Francês", en: "French", ru: "Французский" },
  es: { pt: "Espanhol", en: "Spanish", ru: "Испанский" },
  it: { pt: "Italiano", en: "Italian", ru: "Итальянский" },
  pt: { pt: "Português", en: "Portuguese", ru: "Португальский" },
  zh: { pt: "Chinês", en: "Chinese", ru: "Китайский" },
  ko: { pt: "Coreano", en: "Korean", ru: "Корейский" },
  pl: { pt: "Polonês", en: "Polish", ru: "Польский" },
  uk: { pt: "Ucraniano", en: "Ukrainian", ru: "Украинский" },
}

export const FilterPopover: React.FC<FilterPopoverProps> = ({
  filters,
  onApplyFilters,
  sortBy = "discoveredAt",
  sortOrder = "desc",
  onSortChange,
  categoryId,
}) => {
  const { t, locale } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false)
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false)

  // Facet Options State
  const [facets, setFacets] = useState<FilterFacetsResponse>({
    developers: [],
    publishers: [],
    genres: [],
    languages: [],
    imageFormats: [],
    regions: [],
    multiplayer: { yes: 0, no: 0 },
  })
  const [isLoadingFacets, setIsLoadingFacets] = useState(false)

  // Draft state (Basic & Advanced)
  const [draftSortBy, setDraftSortBy] = useState<FilterOptions["sortBy"]>(sortBy || "discoveredAt")
  const [draftSortOrder, setDraftSortOrder] = useState<FilterOptions["sortOrder"]>(sortOrder || "desc")
  const [draftSeeds, setDraftSeeds] = useState<number | null>(filters.minSeeds ?? null)
  const [draftLeechers, setDraftLeechers] = useState<number | null>(filters.minLeechers ?? null)
  const [draftYearFrom, setDraftYearFrom] = useState<string>(
    filters.yearFrom != null ? String(filters.yearFrom) : ""
  )
  const [draftYearTo, setDraftYearTo] = useState<string>(
    filters.yearTo != null ? String(filters.yearTo) : ""
  )
  const [draftMinSizeGB, setDraftMinSizeGB] = useState<string>(
    bytesToGbString(filters.minSizeBytes)
  )
  const [draftMaxSizeGB, setDraftMaxSizeGB] = useState<string>(
    bytesToGbString(filters.maxSizeBytes)
  )
  const [draftHasMagnet, setDraftHasMagnet] = useState<boolean | null>(
    filters.hasMagnet ?? null
  )
  const [draftHasScreenshots, setDraftHasScreenshots] = useState<boolean | null>(
    filters.hasScreenshots ?? null
  )
  const [draftDiscoveredPreset, setDraftDiscoveredPreset] = useState<
    "all" | "7d" | "30d" | "90d" | null
  >(filters.discoveredPreset ?? null)

  // Draft state (V3-07 Metadata Facets)
  const [draftDevelopers, setDraftDevelopers] = useState<string[]>(filters.developers || [])
  const [draftPublishers, setDraftPublishers] = useState<string[]>(filters.publishers || [])
  const [draftGenres, setDraftGenres] = useState<string[]>(filters.genres || [])
  const [draftLanguages, setDraftLanguages] = useState<string[]>(filters.languages || [])
  const [draftImageFormats, setDraftImageFormats] = useState<string[]>(filters.imageFormats || [])
  const [draftMultiplayer, setDraftMultiplayer] = useState<"any" | "yes" | "no">(
    filters.multiplayer || "any"
  )
  const [draftRegions, setDraftRegions] = useState<string[]>(filters.regions || [])

  // Fetch facets when popover opens
  useEffect(() => {
    if (isOpen) {
      setIsLoadingFacets(true)
      nativeLibraryService
        .getFilterFacets(categoryId)
        .then((res) => {
          if (res) {
            setFacets(res)
          }
        })
        .catch((err) => {
          console.warn("[FilterPopover] Failed to fetch filter facets:", err)
        })
        .finally(() => {
          setIsLoadingFacets(false)
        })
    }
  }, [isOpen, categoryId])

  // Count active applied filters
  const activeCount = useMemo(() => {
    let count = 0
    if (filters.minSeeds != null) count++
    if (filters.minLeechers != null) count++
    if (filters.yearFrom != null || filters.yearTo != null) count++
    if (filters.minSizeBytes != null || filters.maxSizeBytes != null) count++
    if (filters.hasMagnet != null) count++
    if (filters.hasScreenshots != null) count++
    if (filters.discoveredPreset && filters.discoveredPreset !== "all") count++
    if (filters.developers && filters.developers.length > 0) count++
    if (filters.publishers && filters.publishers.length > 0) count++
    if (filters.genres && filters.genres.length > 0) count++
    if (filters.languages && filters.languages.length > 0) count++
    if (filters.imageFormats && filters.imageFormats.length > 0) count++
    if (filters.multiplayer && filters.multiplayer !== "any") count++
    if (filters.regions && filters.regions.length > 0) count++
    return count
  }, [filters])

  // Count active advanced draft filters
  const draftAdvancedCount = useMemo(() => {
    let count = 0
    if (draftYearFrom.trim() !== "" || draftYearTo.trim() !== "") count++
    if (draftMinSizeGB.trim() !== "" || draftMaxSizeGB.trim() !== "") count++
    if (draftHasMagnet != null) count++
    if (draftHasScreenshots != null) count++
    if (draftDiscoveredPreset && draftDiscoveredPreset !== "all") count++
    return count
  }, [
    draftYearFrom,
    draftYearTo,
    draftMinSizeGB,
    draftMaxSizeGB,
    draftHasMagnet,
    draftHasScreenshots,
    draftDiscoveredPreset,
  ])

  // Count active metadata draft filters
  const draftMetadataCount = useMemo(() => {
    let count = 0
    if (draftDevelopers.length > 0) count++
    if (draftPublishers.length > 0) count++
    if (draftGenres.length > 0) count++
    if (draftLanguages.length > 0) count++
    if (draftImageFormats.length > 0) count++
    if (draftMultiplayer !== "any") count++
    if (draftRegions.length > 0) count++
    return count
  }, [
    draftDevelopers,
    draftPublishers,
    draftGenres,
    draftLanguages,
    draftImageFormats,
    draftMultiplayer,
    draftRegions,
  ])

  // Check if any draft filters are set
  const hasAnyDraftFilters = useMemo(() => {
    return (
      draftSeeds != null ||
      draftLeechers != null ||
      draftAdvancedCount > 0 ||
      draftMetadataCount > 0 ||
      draftSortBy !== "discoveredAt" ||
      draftSortOrder !== "desc"
    )
  }, [draftSeeds, draftLeechers, draftAdvancedCount, draftMetadataCount, draftSortBy, draftSortOrder])

  // Sync draft state with props whenever popover opens
  useEffect(() => {
    if (isOpen) {
      setDraftSortBy(sortBy || "discoveredAt")
      setDraftSortOrder(sortOrder || "desc")
      setDraftSeeds(filters.minSeeds ?? null)
      setDraftLeechers(filters.minLeechers ?? null)
      setDraftYearFrom(filters.yearFrom != null ? String(filters.yearFrom) : "")
      setDraftYearTo(filters.yearTo != null ? String(filters.yearTo) : "")
      setDraftMinSizeGB(bytesToGbString(filters.minSizeBytes))
      setDraftMaxSizeGB(bytesToGbString(filters.maxSizeBytes))
      setDraftHasMagnet(filters.hasMagnet ?? null)
      setDraftHasScreenshots(filters.hasScreenshots ?? null)
      setDraftDiscoveredPreset(filters.discoveredPreset ?? null)

      setDraftDevelopers(filters.developers || [])
      setDraftPublishers(filters.publishers || [])
      setDraftGenres(filters.genres || [])
      setDraftLanguages(filters.languages || [])
      setDraftImageFormats(filters.imageFormats || [])
      setDraftMultiplayer(filters.multiplayer || "any")
      setDraftRegions(filters.regions || [])

      // Auto expand advanced section if active
      const hasAppliedAdvanced =
        filters.yearFrom != null ||
        filters.yearTo != null ||
        filters.minSizeBytes != null ||
        filters.maxSizeBytes != null ||
        filters.hasMagnet != null ||
        filters.hasScreenshots != null ||
        (filters.discoveredPreset != null && filters.discoveredPreset !== "all")
      if (hasAppliedAdvanced) {
        setIsAdvancedExpanded(true)
      }

      // Auto expand metadata section if active
      const hasAppliedMetadata =
        (filters.developers && filters.developers.length > 0) ||
        (filters.publishers && filters.publishers.length > 0) ||
        (filters.genres && filters.genres.length > 0) ||
        (filters.languages && filters.languages.length > 0) ||
        (filters.imageFormats && filters.imageFormats.length > 0) ||
        (filters.multiplayer && filters.multiplayer !== "any") ||
        (filters.regions && filters.regions.length > 0)
      if (hasAppliedMetadata) {
        setIsMetadataExpanded(true)
      }
    }
  }, [isOpen, filters, sortBy, sortOrder])

  // Validations
  const yearFromNum = draftYearFrom.trim() !== "" ? parseInt(draftYearFrom.trim(), 10) : null
  const yearToNum = draftYearTo.trim() !== "" ? parseInt(draftYearTo.trim(), 10) : null
  const isYearRangeInvalid =
    yearFromNum !== null &&
    yearToNum !== null &&
    Number.isFinite(yearFromNum) &&
    Number.isFinite(yearToNum) &&
    yearFromNum > yearToNum

  const minSizeNum = draftMinSizeGB.trim() !== "" ? parseFloat(draftMinSizeGB.trim()) : null
  const maxSizeNum = draftMaxSizeGB.trim() !== "" ? parseFloat(draftMaxSizeGB.trim()) : null
  const isSizeRangeInvalid =
    minSizeNum !== null &&
    maxSizeNum !== null &&
    Number.isFinite(minSizeNum) &&
    Number.isFinite(maxSizeNum) &&
    minSizeNum > maxSizeNum

  const hasValidationError = isYearRangeInvalid || isSizeRangeInvalid

  const handleApply = () => {
    if (hasValidationError) return

    const parsedYearFrom =
      draftYearFrom.trim() !== "" && Number.isFinite(parseInt(draftYearFrom.trim(), 10))
        ? parseInt(draftYearFrom.trim(), 10)
        : null

    const parsedYearTo =
      draftYearTo.trim() !== "" && Number.isFinite(parseInt(draftYearTo.trim(), 10))
        ? parseInt(draftYearTo.trim(), 10)
        : null

    const parsedMinSizeBytes = gbStringToBytes(draftMinSizeGB)
    const parsedMaxSizeBytes = gbStringToBytes(draftMaxSizeGB)

    onApplyFilters({
      minSeeds: draftSeeds,
      maxSeeds: null,
      minLeechers: draftLeechers,
      maxLeechers: null,
      yearFrom: parsedYearFrom,
      yearTo: parsedYearTo,
      minSizeBytes: parsedMinSizeBytes,
      maxSizeBytes: parsedMaxSizeBytes,
      hasMagnet: draftHasMagnet,
      hasScreenshots: draftHasScreenshots,
      discoveredPreset: draftDiscoveredPreset === "all" ? null : draftDiscoveredPreset,
      developers: draftDevelopers,
      publishers: draftPublishers,
      genres: draftGenres,
      languages: draftLanguages,
      imageFormats: draftImageFormats,
      multiplayer: draftMultiplayer,
      regions: draftRegions,
    })

    if (onSortChange && (draftSortBy !== sortBy || draftSortOrder !== sortOrder)) {
      onSortChange(draftSortBy, draftSortOrder)
    }

    setIsOpen(false)
  }

  const handleClearAllDrafts = () => {
    setDraftSortBy("title")
    setDraftSortOrder("asc")
    setDraftSeeds(null)
    setDraftLeechers(null)
    setDraftYearFrom("")
    setDraftYearTo("")
    setDraftMinSizeGB("")
    setDraftMaxSizeGB("")
    setDraftHasMagnet(null)
    setDraftHasScreenshots(null)
    setDraftDiscoveredPreset(null)
    setDraftDevelopers([])
    setDraftPublishers([])
    setDraftGenres([])
    setDraftLanguages([])
    setDraftImageFormats([])
    setDraftMultiplayer("any")
    setDraftRegions([])
  }

  const currentDraftSortField = (
    draftSortBy === "size" ? "sizeBytes" :
    draftSortBy === "seeders" ? "seeds" :
    draftSortBy === "updatedAt" ? "discoveredAt" :
    draftSortBy || "discoveredAt"
  ) as string

  // Localized Language Facets mapping
  const languageFacetOptions: FacetOption[] = useMemo(() => {
    return facets.languages.map((l) => {
      const code = l.value.toLowerCase()
      const localized = ISO_LANGUAGE_NAMES[code]
      const label = localized ? (locale === "pt-BR" ? localized.pt : locale === "ru-RU" ? localized.ru : localized.en) : l.value
      return {
        value: l.value,
        label: `${label} (${l.value})`,
        count: l.count,
      }
    })
  }, [facets.languages, locale])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 px-3 border-border bg-card/60 text-xs font-medium transition-all gap-2 rounded-xl shadow-sm hover:bg-secondary hover:text-foreground",
            activeCount > 0
              ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
          aria-label={
            activeCount > 0
              ? t("topbar.filterButtonActive", { count: activeCount })
              : t("topbar.filterButton")
          }
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{t("topbar.filterButton")}</span>
          {activeCount > 0 && (
            <Badge
              variant="default"
              className="h-5 min-w-5 px-1 bg-primary text-primary-foreground font-bold text-[10px] rounded-full flex items-center justify-center ml-0.5"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[380px] sm:w-[420px] p-0 bg-popover border-border text-popover-foreground shadow-2xl overflow-hidden rounded-xl"
      >
        <div className="flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-border shrink-0">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-xs text-foreground uppercase tracking-wide">
                {t("filters.filterCatalog")}
              </h3>
            </div>
            {hasAnyDraftFilters && (
              <button
                onClick={handleClearAllDrafts}
                className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t("filters.reset")}</span>
              </button>
            )}
          </div>

          {/* Scrollable Form Body */}
          <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
            {/* SORTING Section */}
            <div className="space-y-2 pb-3 border-b border-border/80">
              <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
                {t("topbar.sortBy")}
              </span>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={currentDraftSortField}
                    onValueChange={(val) => setDraftSortBy(val as FilterOptions["sortBy"])}
                  >
                    <SelectTrigger 
                      className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring"
                      aria-label={t("topbar.sortFieldAria")}
                    >
                      <SelectValue placeholder={t("topbar.sortBy")} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground">
                      <SelectItem value="title">{t("topbar.sortFields.title")}</SelectItem>
                      <SelectItem value="discoveredAt">{t("topbar.sortFields.discoveredAt")}</SelectItem>
                      <SelectItem value="sizeBytes">{t("topbar.sortFields.sizeBytes")}</SelectItem>
                      <SelectItem value="seeds">{t("topbar.sortFields.seeds")}</SelectItem>
                      <SelectItem value="leechers">{t("topbar.sortFields.leechers")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 border-border bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary text-xs flex items-center gap-1.5 shrink-0"
                  onClick={() => setDraftSortOrder(draftSortOrder === "asc" ? "desc" : "asc")}
                  aria-label={t("topbar.sortDirectionAria", {
                    direction: draftSortOrder === "asc" ? t("topbar.sortAsc") : t("topbar.sortDesc"),
                  })}
                >
                  {draftSortOrder === "asc" ? (
                    <>
                      <ArrowUp className="h-3.5 w-3.5 text-primary" />
                      <span>{t("topbar.sortAsc")}</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="h-3.5 w-3.5 text-primary" />
                      <span>{t("topbar.sortDesc")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* 1. BASIC / SWARM Section */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
                {t("filters.swarmAndPeers")}
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    {t("filters.seedsMin")}
                  </label>
                  <Select
                    value={draftSeeds == null ? "any" : String(draftSeeds)}
                    onValueChange={(val) => setDraftSeeds(val === "any" ? null : Number(val))}
                  >
                    <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                      <SelectValue placeholder={t("filters.any")} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground">
                      <SelectItem value="any">{t("filters.any")}</SelectItem>
                      <SelectItem value="1">{t("filters.seedCount")}</SelectItem>
                      <SelectItem value="5">{t("filters.seedsCount", { count: 5 })}</SelectItem>
                      <SelectItem value="10">{t("filters.seedsCount", { count: 10 })}</SelectItem>
                      <SelectItem value="50">{t("filters.seedsCount", { count: 50 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    {t("filters.leechersMin")}
                  </label>
                  <Select
                    value={draftLeechers == null ? "any" : String(draftLeechers)}
                    onValueChange={(val) => setDraftLeechers(val === "any" ? null : Number(val))}
                  >
                    <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                      <SelectValue placeholder={t("filters.any")} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground">
                      <SelectItem value="any">{t("filters.any")}</SelectItem>
                      <SelectItem value="1">{t("filters.leecherCount")}</SelectItem>
                      <SelectItem value="5">{t("filters.leechersCount", { count: 5 })}</SelectItem>
                      <SelectItem value="10">{t("filters.leechersCount", { count: 10 })}</SelectItem>
                      <SelectItem value="50">{t("filters.leechersCount", { count: 50 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 2. ADVANCED FILTERS Section */}
            <div className="pt-2 border-t border-border/80">
              <button
                type="button"
                onClick={() => setIsAdvancedExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span>{t("filters.advanced")}</span>
                  {draftAdvancedCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 bg-primary/20 text-primary font-medium text-[9px] rounded-full"
                    >
                      {draftAdvancedCount}
                    </Badge>
                  )}
                </div>
                {isAdvancedExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                )}
              </button>

              {isAdvancedExpanded && (
                <div className="mt-3 space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Release Year Range */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      {t("filters.releaseYear")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder={t("filters.yearFromPlaceholder")}
                        value={draftYearFrom}
                        onChange={(e) => setDraftYearFrom(e.target.value)}
                        className={cn(
                          "h-8 text-xs bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring",
                          isYearRangeInvalid && "border-destructive/60 focus-visible:ring-destructive"
                        )}
                        min={1970}
                        max={2099}
                      />
                      <Input
                        type="number"
                        placeholder={t("filters.yearToPlaceholder")}
                        value={draftYearTo}
                        onChange={(e) => setDraftYearTo(e.target.value)}
                        className={cn(
                          "h-8 text-xs bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring",
                          isYearRangeInvalid && "border-destructive/60 focus-visible:ring-destructive"
                        )}
                        min={1970}
                        max={2099}
                      />
                    </div>
                    {isYearRangeInvalid && (
                      <div className="flex items-center gap-1 text-[10px] text-destructive mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>{t("filters.validation.yearRange")}</span>
                      </div>
                    )}
                  </div>

                  {/* Size Range (in GB) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      {t("filters.sizeRange")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="any"
                        placeholder={t("filters.minSizePlaceholder")}
                        value={draftMinSizeGB}
                        onChange={(e) => setDraftMinSizeGB(e.target.value)}
                        className={cn(
                          "h-8 text-xs bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring",
                          isSizeRangeInvalid && "border-destructive/60 focus-visible:ring-destructive"
                        )}
                        min={0}
                      />
                      <Input
                        type="number"
                        step="any"
                        placeholder={t("filters.maxSizePlaceholder")}
                        value={draftMaxSizeGB}
                        onChange={(e) => setDraftMaxSizeGB(e.target.value)}
                        className={cn(
                          "h-8 text-xs bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring",
                          isSizeRangeInvalid && "border-destructive/60 focus-visible:ring-destructive"
                        )}
                        min={0}
                      />
                    </div>
                    {isSizeRangeInvalid && (
                      <div className="flex items-center gap-1 text-[10px] text-destructive mt-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>{t("filters.validation.sizeRange")}</span>
                      </div>
                    )}
                  </div>

                  {/* Tri-state: Has Magnet & Has Screenshots */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-foreground">
                        {t("filters.hasMagnet")}
                      </label>
                      <Select
                        value={draftHasMagnet === null ? "any" : draftHasMagnet ? "yes" : "no"}
                        onValueChange={(val) =>
                          setDraftHasMagnet(val === "any" ? null : val === "yes")
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                          <SelectValue placeholder={t("filters.triStateWithWithout.any")} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                          <SelectItem value="any">{t("filters.triStateWithWithout.any")}</SelectItem>
                          <SelectItem value="yes">{t("filters.triStateWithWithout.withMagnet")}</SelectItem>
                          <SelectItem value="no">{t("filters.triStateWithWithout.withoutMagnet")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-foreground">
                        {t("filters.hasScreenshots")}
                      </label>
                      <Select
                        value={draftHasScreenshots === null ? "any" : draftHasScreenshots ? "yes" : "no"}
                        onValueChange={(val) =>
                          setDraftHasScreenshots(val === "any" ? null : val === "yes")
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                          <SelectValue placeholder={t("filters.triStateWithWithout.any")} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border text-popover-foreground">
                          <SelectItem value="any">{t("filters.triStateWithWithout.any")}</SelectItem>
                          <SelectItem value="yes">{t("filters.triStateWithWithout.withScreenshots")}</SelectItem>
                          <SelectItem value="no">{t("filters.triStateWithWithout.withoutScreenshots")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Discovered Date Preset */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      {t("filters.discovered")}
                    </label>
                    <Select
                      value={draftDiscoveredPreset || "all"}
                      onValueChange={(val) =>
                        setDraftDiscoveredPreset(val === "all" ? null : (val as "7d" | "30d" | "90d"))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                        <SelectValue placeholder={t("filters.discoveredPresets.all")} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-popover-foreground">
                        <SelectItem value="all">{t("filters.discoveredPresets.all")}</SelectItem>
                        <SelectItem value="7d">{t("filters.discoveredPresets.7d")}</SelectItem>
                        <SelectItem value="30d">{t("filters.discoveredPresets.30d")}</SelectItem>
                        <SelectItem value="90d">{t("filters.discoveredPresets.90d")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* 3. METADATA FACETS Section (V3-07) */}
            <div className="pt-2 border-t border-border/80">
              <button
                type="button"
                onClick={() => setIsMetadataExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between py-1.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>{t("filters.metadataSection")}</span>
                  {draftMetadataCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 bg-primary/20 text-primary font-medium text-[9px] rounded-full"
                    >
                      {draftMetadataCount}
                    </Badge>
                  )}
                </div>
                {isMetadataExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                )}
              </button>

              {isMetadataExpanded && (
                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  {/* Developer */}
                  <FacetMultiSelect
                    label={t("filters.developer")}
                    options={facets.developers}
                    selected={draftDevelopers}
                    onChange={setDraftDevelopers}
                    searchable={true}
                    isLoading={isLoadingFacets}
                    searchPlaceholder={t("filters.searchPlaceholder")}
                  />

                  {/* Publisher */}
                  <FacetMultiSelect
                    label={t("filters.publisher")}
                    options={facets.publishers}
                    selected={draftPublishers}
                    onChange={setDraftPublishers}
                    searchable={true}
                    isLoading={isLoadingFacets}
                    searchPlaceholder={t("filters.searchPlaceholder")}
                  />

                  {/* Genre */}
                  <FacetMultiSelect
                    label={t("filters.genre")}
                    options={facets.genres}
                    selected={draftGenres}
                    onChange={setDraftGenres}
                    searchable={true}
                    isLoading={isLoadingFacets}
                    searchPlaceholder={t("filters.searchPlaceholder")}
                  />

                  {/* Interface Language */}
                  <FacetMultiSelect
                    label={t("filters.language")}
                    options={languageFacetOptions}
                    selected={draftLanguages}
                    onChange={setDraftLanguages}
                    searchable={true}
                    isLoading={isLoadingFacets}
                    searchPlaceholder={t("filters.searchPlaceholder")}
                  />

                  {/* Image Format */}
                  <FacetMultiSelect
                    label={t("filters.imageFormat")}
                    options={facets.imageFormats}
                    selected={draftImageFormats}
                    onChange={setDraftImageFormats}
                    searchable={false}
                    isLoading={isLoadingFacets}
                  />

                  {/* Region */}
                  <FacetMultiSelect
                    label={t("filters.region")}
                    options={facets.regions}
                    selected={draftRegions}
                    onChange={setDraftRegions}
                    searchable={false}
                    isLoading={isLoadingFacets}
                  />

                  {/* Multiplayer Tri-state */}
                  <div className="space-y-1.5 p-2.5 border border-border bg-card/40 rounded-lg">
                    <label className="text-[11px] font-medium text-foreground block">
                      {t("filters.multiplayer")}
                    </label>
                    <Select
                      value={draftMultiplayer}
                      onValueChange={(val) => setDraftMultiplayer(val as "any" | "yes" | "no")}
                    >
                      <SelectTrigger className="h-8 text-xs bg-secondary/80 border-border text-foreground focus:ring-ring">
                        <SelectValue placeholder={t("filters.triStateMultiplayer.any")} />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-popover-foreground">
                        <SelectItem value="any">{t("filters.triStateMultiplayer.any")}</SelectItem>
                        <SelectItem value="yes">
                          {t("filters.triStateMultiplayer.yes")}
                          {facets.multiplayer.yes > 0 && ` (${facets.multiplayer.yes})`}
                        </SelectItem>
                        <SelectItem value="no">
                          {t("filters.triStateMultiplayer.no")}
                          {facets.multiplayer.no > 0 && ` (${facets.multiplayer.no})`}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-3 bg-secondary/40 border-t border-border flex items-center justify-between gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={hasValidationError}
              onClick={handleApply}
              className={cn(
                "h-8 px-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-all",
                hasValidationError && "opacity-50 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted"
              )}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t("filters.applyFilters")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
