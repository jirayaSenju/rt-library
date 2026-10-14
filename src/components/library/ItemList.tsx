import React, { useRef, useEffect } from "react"
import { LibraryItem } from "@/types"
import { ItemListRow } from "@/components/library/ItemListRow"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchX, Database, RefreshCw, FileText, Star, Library } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"

interface ItemListProps {
  items: LibraryItem[]
  isLoading: boolean
  favorites: Set<string>
  onToggleFavorite: (itemId: string, title?: string) => void
  onSelectItem: (item: LibraryItem) => void
  savedScrollPosition?: number
  onSaveScrollPosition?: (pos: number) => void
  selectedIds?: Set<string>
  onToggleSelect?: (itemId: string) => void
  onSelectAllPage?: () => void
  onClearSelection?: () => void
  isLibraryEmpty?: boolean
  isFavorites?: boolean
  hasSearchQuery?: boolean
  onBrowseAll?: () => void
  onOpenSettings?: (tab?: any) => void
  onImportHtml?: () => void
  isSyncing?: boolean
  onViewSync?: () => void
  pendingNewItemsCount?: number
  onShowNewItems?: () => void
}

export const ItemList: React.FC<ItemListProps> = ({
  items,
  isLoading,
  favorites,
  onToggleFavorite,
  onSelectItem,
  savedScrollPosition = 0,
  onSaveScrollPosition,
  selectedIds,
  onToggleSelect,
  onSelectAllPage,
  onClearSelection,
  isLibraryEmpty = false,
  isFavorites = false,
  hasSearchQuery = false,
  onBrowseAll,
  onOpenSettings,
  onImportHtml,
  isSyncing = false,
  onViewSync,
  pendingNewItemsCount = 0,
  onShowNewItems,
}) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const isAllSelected = items.length > 0 && items.every((item) => selectedIds?.has(item.id))
  const isPartiallySelected =
    items.length > 0 && items.some((item) => selectedIds?.has(item.id)) && !isAllSelected

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isPartiallySelected
    }
  }, [isPartiallySelected])

  const handleToggleHeaderCheckbox = () => {
    if (isAllSelected) {
      onClearSelection?.()
    } else {
      onSelectAllPage?.()
    }
  }

  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore scroll position on category switch or reset on page change
  useEffect(() => {
    if (containerRef.current) {
      if (containerRef.current.scrollTop > 40) {
        return
      }
      containerRef.current.scrollTop = savedScrollPosition || 0
    }
  }, [items])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    if (onSaveScrollPosition) {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
      scrollDebounceRef.current = setTimeout(() => {
        onSaveScrollPosition(scrollTop)
      }, 150)
    }
  }

  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
    }
  }, [])

  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-6 custom-scrollbar space-y-1">
        {/* Header Skeleton */}
        <div className="h-9 w-full bg-muted/60 rounded-lg mb-2" />
        {/* Row Skeletons */}
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={`list-skeleton-${i}`}
            className="flex items-center gap-3.5 px-4 py-2.5 bg-card border-b border-border/70 rounded-md"
          >
            <Skeleton className="w-10 h-13 rounded-md shrink-0 bg-muted" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/5 bg-muted" />
              <Skeleton className="h-2.5 w-1/4 bg-muted" />
            </div>
            <Skeleton className="w-16 h-5 rounded bg-muted shrink-0" />
            <Skeleton className="w-12 h-3.5 bg-muted shrink-0 hidden md:block" />
            <Skeleton className="w-16 h-3.5 bg-muted shrink-0" />
            <Skeleton className="w-12 h-3.5 bg-muted shrink-0" />
            <Skeleton className="w-8 h-8 rounded bg-muted shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  // 2. Empty State
  if (items.length === 0) {
    if (isFavorites) {
      if (hasSearchQuery) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none">
            <div className="h-16 w-16 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-muted-foreground mb-4 shadow-xl">
              <SearchX className="h-8 w-8 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-semibold text-foreground">{t("catalog.emptyTitle")}</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {t("catalog.emptyDescription")}
            </p>
          </div>
        )
      }

      return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none animate-in fade-in-50 duration-200">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
            <Star className="h-8 w-8 fill-amber-400/20 stroke-[1.5]" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t("catalog.emptyFavoritesTitle")}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
            {t("catalog.emptyFavoritesDesc")}
          </p>
          {onBrowseAll && (
            <div className="flex items-center justify-center mt-5">
              <Button
                size="sm"
                onClick={onBrowseAll}
                className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
              >
                <Library className="h-3.5 w-3.5" />
                <span>{t("catalog.browseAllGames")}</span>
              </Button>
            </div>
          )}
        </div>
      )
    }

    if (isLibraryEmpty) {
      if (isSyncing) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none animate-in fade-in-50 duration-200">
            <div className="h-16 w-16 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-primary mb-4 shadow-xl">
              <RefreshCw className="h-8 w-8 animate-spin stroke-[1.5]" />
            </div>
            <h3 className="text-base font-semibold text-foreground">{t("catalog.buildingLibraryTitle")}</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
              {t("catalog.buildingLibraryDesc")}
            </p>
            {onViewSync && (
              <div className="flex items-center justify-center mt-5">
                <Button
                  size="sm"
                  onClick={onViewSync}
                  className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{t("catalog.viewSynchronization")}</span>
                </Button>
              </div>
            )}
          </div>
        )
      }

      return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none animate-in fade-in-50 duration-200">
          <div className="h-16 w-16 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-primary mb-4 shadow-xl">
            <Database className="h-8 w-8 stroke-[1.5]" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{t("catalog.emptyLibraryTitle")}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1.5 leading-relaxed">
            {t("catalog.emptyLibraryDesc")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
            {onOpenSettings && (
              <Button
                size="sm"
                onClick={() => onOpenSettings("scraper")}
                className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{t("catalog.emptyLibrarySetupSync")}</span>
              </Button>
            )}
            {onImportHtml && (
              <Button
                variant="outline"
                size="sm"
                onClick={onImportHtml}
                className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground gap-1.5 cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>{t("catalog.emptyLibraryImportPage")}</span>
              </Button>
            )}
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenSettings("display")}
                className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span>{t("catalog.emptyLibraryExploreSettings")}</span>
              </Button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none">
        <div className="h-16 w-16 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-muted-foreground mb-4 shadow-xl">
          <SearchX className="h-8 w-8 stroke-[1.5]" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{t("catalog.emptyTitle")}</h3>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          {t("catalog.emptyDescription")}
        </p>
      </div>
    )
  }

  // 3. Render Table / List View
  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ scrollbarGutter: "stable" }}
      className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-3 pb-6 custom-scrollbar relative"
    >
      {pendingNewItemsCount > 0 && (
        <div className="sticky top-2 z-30 flex justify-center w-full pointer-events-none mb-3">
          <div className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground shadow-lg text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>
              {pendingNewItemsCount === 1
                ? t("catalog.newItemsAvailableSingle", { count: pendingNewItemsCount })
                : t("catalog.newItemsAvailablePlural", { count: pendingNewItemsCount })}
            </span>
            <button
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  containerRef.current.scrollTo({ top: 0, behavior: "smooth" })
                }
                onShowNewItems?.()
              }}
              className="ml-1 px-2.5 py-0.5 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 font-semibold transition-colors cursor-pointer"
            >
              {t("catalog.showNewItems")}
            </button>
          </div>
        </div>
      )}

      <div className="w-full border border-border rounded-xl overflow-hidden bg-card shadow-md">
        {/* Sticky Table Header */}
        <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-secondary/95 backdrop-blur-md border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">
          <div className="w-6 shrink-0 flex items-center justify-center">
            <input
              type="checkbox"
              ref={headerCheckboxRef}
              checked={isAllSelected}
              onChange={handleToggleHeaderCheckbox}
              aria-label={
                isAllSelected
                  ? t("catalog.selection.deselectAllAria")
                  : t("catalog.selection.selectAllAria")
              }
              className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-ring/30 accent-primary cursor-pointer"
            />
          </div>
          <div className="w-10 shrink-0 text-center">{t("catalog.columns.cover")}</div>
          <div className="flex-1 min-w-0 pr-2">{t("catalog.columns.title")}</div>
          <div className="w-20 shrink-0 text-center">{t("catalog.columns.platform")}</div>
          <div className="w-14 shrink-0 text-center hidden md:block">{t("catalog.columns.year")}</div>
          <div className="w-20 shrink-0 text-right">{t("catalog.columns.size")}</div>
          <div className="w-16 shrink-0 text-right">{t("catalog.columns.seeds")}</div>
          <div className="w-16 shrink-0 text-right hidden lg:block">{t("catalog.columns.leechers")}</div>
          <div className="w-10 shrink-0 text-right">{t("catalog.columns.fav")}</div>
        </div>

        {/* Rows List */}
        <div className="divide-y divide-border/60">
          {items.map((item) => (
            <ItemListRow
              key={item.id}
              item={item}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={(e) => {
                e.stopPropagation()
                onToggleFavorite(item.id, item.cleanTitle || item.title)
              }}
              onClick={() => onSelectItem(item)}
              isSelected={selectedIds ? selectedIds.has(item.id) : false}
              onToggleSelect={() => onToggleSelect?.(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
