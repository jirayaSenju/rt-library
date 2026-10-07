import React from "react"
import { 
  Search, 
  X, 
  RotateCcw, 
  LayoutGrid, 
  Grid2X2, 
  List, 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FilterOptions, LibraryFilters } from "@/types"
import { FilterPopover } from "@/components/layout/FilterPopover"
import { useI18n } from "@/i18n"

interface TopbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onOpenCommandPalette: () => void
  sortBy: FilterOptions["sortBy"]
  sortOrder: FilterOptions["sortOrder"]
  onSortChange: (sortBy: FilterOptions["sortBy"], sortOrder: FilterOptions["sortOrder"]) => void
  filters: FilterOptions
  onApplyFilters: (filters: LibraryFilters) => void
  onClearFilters: () => void
  onRemoveFilter: (field: keyof LibraryFilters | (keyof LibraryFilters)[]) => void
  density?: "comfortable" | "compact"
  onToggleDensity?: () => void
  viewMode?: "grid" | "list"
  onViewModeChange?: (mode: "grid" | "list") => void
}

const BYTES_IN_GB = 1024 * 1024 * 1024
const BYTES_IN_MB = 1024 * 1024

function formatByteSize(bytes: number): string {
  if (bytes >= BYTES_IN_GB) {
    const gb = bytes / BYTES_IN_GB
    return `${Number.isInteger(gb) ? gb : Number(gb.toFixed(1))} GB`
  }
  const mb = bytes / BYTES_IN_MB
  return `${Number.isInteger(mb) ? mb : Number(mb.toFixed(0))} MB`
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenCommandPalette,
  sortBy = "discoveredAt",
  sortOrder = "desc",
  onSortChange,
  filters,
  onApplyFilters,
  onClearFilters,
  onRemoveFilter,
  density = "comfortable",
  onToggleDensity,
  viewMode = "grid",
  onViewModeChange,
}) => {
  const { t } = useI18n()

  const hasActiveFilters =
    filters.minSeeds != null ||
    filters.minLeechers != null ||
    filters.yearFrom != null ||
    filters.yearTo != null ||
    filters.minSizeBytes != null ||
    filters.maxSizeBytes != null ||
    filters.hasMagnet != null ||
    filters.hasScreenshots != null ||
    (filters.discoveredPreset != null && filters.discoveredPreset !== "all") ||
    (filters.developers && filters.developers.length > 0) ||
    (filters.publishers && filters.publishers.length > 0) ||
    (filters.genres && filters.genres.length > 0) ||
    (filters.languages && filters.languages.length > 0) ||
    (filters.imageFormats && filters.imageFormats.length > 0) ||
    (filters.multiplayer && filters.multiplayer !== "any") ||
    (filters.regions && filters.regions.length > 0)

  return (
    <TooltipProvider delayDuration={150}>
      <header className="flex flex-col border-b border-border bg-background/90 backdrop-blur shrink-0">
        {/* Main Toolbar Row */}
        <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left Slot (Balances the layout so search is visually centered) */}
          <div className="flex-1 min-w-0 hidden md:block" />

          {/* Centered Search Box */}
          <div className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl relative min-w-0 mx-auto">
            <div 
              onClick={onOpenCommandPalette}
              className="relative cursor-pointer group"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onOpenCommandPalette()
                }
              }}
              aria-label={t("topbar.searchAria")}
            >
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <input
                type="text"
                readOnly
                value={searchQuery}
                placeholder={t("topbar.searchPlaceholder")}
                className="w-full h-10 pl-10 pr-14 bg-card border border-border hover:border-border/80 focus:border-primary/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors cursor-pointer truncate shadow-sm leading-normal"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground bg-secondary border border-border rounded shadow-sm select-none">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Right Slot: Grouped Controls */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2.5 shrink-0">
            {/* Filter Popover (includes Sorting section inside) */}
            <FilterPopover
              filters={filters}
              onApplyFilters={onApplyFilters}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
              categoryId={filters.categoryId || undefined}
            />

            {/* Subtle Divider */}
            <div className="h-5 w-[1px] bg-border hidden sm:block" />

            {/* View Mode & Density Group */}
            <div className="flex items-center rounded-xl border border-border bg-card/60 p-0.5 shadow-sm">
              {onViewModeChange && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 rounded-lg"
                      onClick={() => onViewModeChange(viewMode === "grid" ? "list" : "grid")}
                      aria-label={viewMode === "grid" ? t("topbar.viewModeListTooltip") : t("topbar.viewModeGridTooltip")}
                    >
                      {viewMode === "grid" ? (
                        <List className="h-4 w-4" />
                      ) : (
                        <LayoutGrid className="h-4 w-4 text-primary" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {viewMode === "grid" ? t("topbar.viewModeListTooltip") : t("topbar.viewModeGridTooltip")}
                  </TooltipContent>
                </Tooltip>
              )}

              {viewMode === "grid" && onToggleDensity && (
                <>
                  <div className="h-4 w-[1px] bg-border" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 rounded-lg"
                        onClick={onToggleDensity}
                        aria-label={density === "compact" ? t("topbar.densityComfortableTooltip") : t("topbar.densityCompactTooltip")}
                      >
                        {density === "compact" ? (
                          <Grid2X2 className="h-4 w-4 text-primary" />
                        ) : (
                          <LayoutGrid className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {density === "compact" ? t("topbar.densityCompactTooltip") : t("topbar.densityComfortableTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {hasActiveFilters && (
          <div className="h-9 px-5 border-t border-border/80 bg-card/40 flex items-center gap-2 text-xs overflow-x-auto custom-scrollbar">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
              {t("topbar.activeFiltersLabel")}
            </span>

            {/* Seeds Chip */}
            {filters.minSeeds != null && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>{t("topbar.seedsFilterChip", { minSeeds: filters.minSeeds })}</span>
                <button
                  onClick={() => onRemoveFilter("minSeeds")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeSeedsFilterAria")}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Leechers Chip */}
            {filters.minLeechers != null && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>{t("topbar.leechersFilterChip", { minLeechers: filters.minLeechers })}</span>
                <button
                  onClick={() => onRemoveFilter("minLeechers")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeLeechersFilterAria")}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Release Year Chip */}
            {(filters.yearFrom != null || filters.yearTo != null) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {filters.yearFrom != null && filters.yearTo != null
                    ? t("topbar.yearRangeFilterChip", {
                        yearFrom: filters.yearFrom,
                        yearTo: filters.yearTo,
                      })
                    : filters.yearFrom != null
                    ? t("topbar.yearFromFilterChip", { yearFrom: filters.yearFrom })
                    : t("topbar.yearToFilterChip", { yearTo: filters.yearTo! })}
                </span>
                <button
                  onClick={() => onRemoveFilter(["yearFrom", "yearTo"])}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.releaseYear") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Size Range Chip */}
            {(filters.minSizeBytes != null || filters.maxSizeBytes != null) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {filters.minSizeBytes != null && filters.maxSizeBytes != null
                    ? t("topbar.sizeRangeFilterChip", {
                        minSize: formatByteSize(filters.minSizeBytes),
                        maxSize: formatByteSize(filters.maxSizeBytes),
                      })
                    : filters.minSizeBytes != null
                    ? t("topbar.sizeMinFilterChip", {
                        minSize: formatByteSize(filters.minSizeBytes),
                      })
                    : t("topbar.sizeMaxFilterChip", {
                        maxSize: formatByteSize(filters.maxSizeBytes!),
                      })}
                </span>
                <button
                  onClick={() => onRemoveFilter(["minSizeBytes", "maxSizeBytes"])}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.sizeRange") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Has Magnet Chip */}
            {filters.hasMagnet != null && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {filters.hasMagnet
                    ? t("topbar.hasMagnetFilterChip")
                    : t("topbar.noMagnetFilterChip")}
                </span>
                <button
                  onClick={() => onRemoveFilter("hasMagnet")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.hasMagnet") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Has Screenshots Chip */}
            {filters.hasScreenshots != null && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {filters.hasScreenshots
                    ? t("topbar.hasScreenshotsFilterChip")
                    : t("topbar.noScreenshotsFilterChip")}
                </span>
                <button
                  onClick={() => onRemoveFilter("hasScreenshots")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.hasScreenshots") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Discovered Preset Chip */}
            {filters.discoveredPreset != null && filters.discoveredPreset !== "all" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.discoveredFilterChip", {
                    preset:
                      filters.discoveredPreset === "7d"
                        ? t("filters.discoveredPresets.7d")
                        : filters.discoveredPreset === "30d"
                        ? t("filters.discoveredPresets.30d")
                        : t("filters.discoveredPresets.90d"),
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("discoveredPreset")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.discovered") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Developers Chip */}
            {filters.developers && filters.developers.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.developerFilterChip", {
                    value:
                      filters.developers.length === 1
                        ? filters.developers[0]
                        : `${filters.developers[0]} (+${filters.developers.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("developers")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.developer") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Publishers Chip */}
            {filters.publishers && filters.publishers.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.publisherFilterChip", {
                    value:
                      filters.publishers.length === 1
                        ? filters.publishers[0]
                        : `${filters.publishers[0]} (+${filters.publishers.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("publishers")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.publisher") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Genres Chip */}
            {filters.genres && filters.genres.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.genreFilterChip", {
                    value:
                      filters.genres.length === 1
                        ? filters.genres[0]
                        : `${filters.genres[0]} (+${filters.genres.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("genres")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.genre") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Languages Chip */}
            {filters.languages && filters.languages.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.languageFilterChip", {
                    value:
                      filters.languages.length === 1
                        ? filters.languages[0].toUpperCase()
                        : `${filters.languages[0].toUpperCase()} (+${filters.languages.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("languages")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.language") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Image Formats Chip */}
            {filters.imageFormats && filters.imageFormats.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.imageFormatFilterChip", {
                    value:
                      filters.imageFormats.length === 1
                        ? filters.imageFormats[0]
                        : `${filters.imageFormats[0]} (+${filters.imageFormats.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("imageFormats")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.imageFormat") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Multiplayer Chip */}
            {filters.multiplayer && filters.multiplayer !== "any" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.multiplayerFilterChip", {
                    value:
                      filters.multiplayer === "yes"
                        ? t("filters.triState.yes")
                        : t("filters.triState.no"),
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("multiplayer")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.multiplayer") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Regions Chip */}
            {filters.regions && filters.regions.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium shrink-0 animate-in fade-in">
                <span>
                  {t("topbar.regionFilterChip", {
                    value:
                      filters.regions.length === 1
                        ? filters.regions[0]
                        : `${filters.regions[0]} (+${filters.regions.length - 1})`,
                  })}
                </span>
                <button
                  onClick={() => onRemoveFilter("regions")}
                  className="h-3.5 w-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center text-primary/80 hover:text-primary"
                  aria-label={t("topbar.removeFilterAria", { filter: t("filters.region") })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}

            {/* Clear All Button */}
            <button
              onClick={onClearFilters}
              className="text-[11px] text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 shrink-0 px-2 py-0.5 rounded hover:bg-secondary transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t("topbar.clearAllFilters")}</span>
            </button>
          </div>
        )}
      </header>
    </TooltipProvider>
  )
}
