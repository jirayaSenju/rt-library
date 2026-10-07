import React, { useRef, useEffect, useState, useMemo, useCallback } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LibraryItem } from "@/types"
import { ItemCard } from "@/components/library/ItemCard"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchX } from "lucide-react"
import { perfTelemetry } from "@/utils/performanceTelemetry"
import { useI18n } from "@/i18n"

export type GridDensity = "comfortable" | "compact"

export interface GridDimensions {
  columnCount: number
  cardWidth: number
  estimatedCardHeight: number
  estimatedRowHeight: number
}

export const DENSITY_CONFIG = {
  comfortable: {
    MIN_CARD_WIDTH: 180,
    MAX_CARD_WIDTH: 260,
    PREFERRED_CARD_WIDTH: 215,
    GAP: 16,
  },
  compact: {
    MIN_CARD_WIDTH: 135,
    MAX_CARD_WIDTH: 195,
    PREFERRED_CARD_WIDTH: 160,
    GAP: 12,
  },
}

export function calculateGridDimensions(
  containerWidth: number,
  density: GridDensity = "comfortable"
): GridDimensions {
  const config = DENSITY_CONFIG[density] || DENSITY_CONFIG.comfortable
  const gap = config.GAP
  const padding = density === "compact" ? 32 : (containerWidth >= 768 ? 48 : 32)
  const preferredWidth = config.PREFERRED_CARD_WIDTH
  const minWidth = config.MIN_CARD_WIDTH
  const maxWidth = config.MAX_CARD_WIDTH
  const minColumns = 1
  const maxColumns = 16

  if (containerWidth <= 0) {
    const defaultCols = density === "compact" ? 6 : 5
    const defaultCardHeight = Math.round(preferredWidth * (4 / 3))
    return {
      columnCount: defaultCols,
      cardWidth: preferredWidth,
      estimatedCardHeight: defaultCardHeight,
      estimatedRowHeight: defaultCardHeight + gap,
    }
  }

  const usableWidth = Math.max(0, containerWidth - padding)

  // Maximum columns that fit without dropping below minWidth
  const maxPossibleCols = Math.max(minColumns, Math.floor((usableWidth + gap) / (minWidth + gap)))
  // Minimum columns required to not exceed maxWidth
  const minRequiredCols = Math.max(minColumns, Math.ceil((usableWidth + gap) / (maxWidth + gap)))
  // Ideal columns based on preferred card width
  const idealCols = Math.round((usableWidth + gap) / (preferredWidth + gap))

  let cols = Math.max(minRequiredCols, Math.min(maxPossibleCols, Math.max(minColumns, idealCols)))
  cols = Math.min(maxColumns, cols)

  const actualCardWidth = Math.max(
    minWidth,
    (usableWidth - Math.max(0, cols - 1) * gap) / cols
  )
  const estimatedCardHeight = Math.round(actualCardWidth * (4 / 3))
  const estimatedRowHeight = estimatedCardHeight + gap

  return {
    columnCount: cols,
    cardWidth: actualCardWidth,
    estimatedCardHeight,
    estimatedRowHeight,
  }
}

interface ItemGridProps {
  items: LibraryItem[]
  isLoading: boolean
  favorites: Set<string>
  onToggleFavorite: (itemId: string, title?: string) => void
  onSelectItem: (item: LibraryItem) => void
  savedScrollPosition?: number
  onSaveScrollPosition?: (pos: number) => void
  density?: GridDensity
  selectedIds?: Set<string>
  onToggleSelect?: (itemId: string) => void
}

export const ItemGrid: React.FC<ItemGridProps> = ({
  items,
  isLoading,
  favorites,
  onToggleFavorite,
  onSelectItem,
  savedScrollPosition = 0,
  onSaveScrollPosition,
  density = "comfortable",
  selectedIds,
  onToggleSelect,
}) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)
  const prevColumnCountRef = useRef<number>(4)
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Measure container width responsively using clientWidth (which accounts for scrollbar and padding consistently)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    setContainerWidth(Math.floor(el.clientWidth))

    let rafId: number | null = null
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!el) return
        const newWidth = Math.floor(el.clientWidth)
        if (newWidth > 0) {
          setContainerWidth((prev) => (Math.abs(prev - newWidth) >= 1 ? newWidth : prev))
        }
      })
    })

    observer.observe(el)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  // Calculate dynamic grid dimensions deterministically based on real available width and active density
  const { columnCount, estimatedCardHeight, estimatedRowHeight } = useMemo(() => {
    return calculateGridDimensions(containerWidth, density)
  }, [containerWidth, density])

  const gapSize = DENSITY_CONFIG[density].GAP

  // Total row count
  const rowCount = useMemo(() => {
    if (items.length === 0) return 0
    return Math.ceil(items.length / columnCount)
  }, [items.length, columnCount])

  // Configure row virtualizer with pure deterministic heights without dynamic DOM re-measurement loops
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => estimatedCardHeight, [estimatedCardHeight]),
    gap: gapSize,
    overscan: 4,
    getItemKey: useCallback((index: number) => index, []),
  })

  // Recalculate virtualizer when columnCount or card height changes
  useEffect(() => {
    if (rowVirtualizer) {
      rowVirtualizer.measure()
    }
  }, [columnCount, estimatedCardHeight, gapSize, rowVirtualizer])

  // Preserve relative scroll position when column count changes on window resize
  useEffect(() => {
    const prevCols = prevColumnCountRef.current
    const rowSpan = estimatedCardHeight + gapSize
    if (prevCols !== columnCount && containerRef.current && prevCols > 0 && rowSpan > 0) {
      const el = containerRef.current
      const currentScrollTop = el.scrollTop
      if (currentScrollTop > 50) {
        const approxPrevRow = Math.floor(currentScrollTop / rowSpan)
        const approxFirstItem = approxPrevRow * prevCols
        const newTargetRow = Math.floor(approxFirstItem / columnCount)
        el.scrollTop = newTargetRow * rowSpan
      }
      prevColumnCountRef.current = columnCount
    }
  }, [columnCount, estimatedCardHeight, gapSize])

  useEffect(() => {
    if (items.length > 0) {
      perfTelemetry.markFirstCard()
    }
  }, [items])

  // Restore scroll position per category or reset on page change
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      el.scrollTop = savedScrollPosition || 0
    }
  }, [items])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const scrollTop = target.scrollTop

    if (onSaveScrollPosition) {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
      scrollDebounceRef.current = setTimeout(() => {
        onSaveScrollPosition(scrollTop)
      }, 150)
    }

    if (perfTelemetry.isEnabled()) {
      perfTelemetry.startFPSMonitor(2000)
    }

    if (process.env.NODE_ENV === "development" && (window as any).__ENABLE_GRID_DEBUG__) {
      console.log(
        `[GRID][METRICS] scrollTop=${Math.round(scrollTop)} width=${containerWidth} columns=${columnCount} cardHeight=${estimatedCardHeight} rowHeight=${estimatedRowHeight} scrollHeight=${target.scrollHeight} clientHeight=${target.clientHeight}`
      )
    }
  }

  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) {
        clearTimeout(scrollDebounceRef.current)
      }
    }
  }, [])

  const containerPaddingClass = density === "compact" ? "p-4 pb-6" : "p-4 md:p-6 pb-6"

  const dynamicGridStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      gap: `${gapSize}px`,
      width: "100%",
      height: "100%",
    }),
    [columnCount, gapSize]
  )

  if (isLoading) {
    return (
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${containerPaddingClass} custom-scrollbar`}
        style={{ scrollbarGutter: "stable" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            gap: `${gapSize}px`,
          }}
        >
          {Array.from({ length: Math.max(18, columnCount * 3) }).map((_, i) => (
            <div key={i} className="flex flex-col space-y-2">
              <Skeleton className="aspect-[3/4] w-full rounded-xl bg-muted" />
              <Skeleton className="h-4 w-3/4 bg-muted" />
              <Skeleton className="h-3 w-1/2 bg-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-12 text-center select-none">
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

  const virtualRows = rowVirtualizer.getVirtualItems()

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ scrollbarGutter: "stable" }}
      className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden ${containerPaddingClass} custom-scrollbar relative`}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const rowIndex = virtualRow.index
          const startIndex = rowIndex * columnCount
          const rowItems = items.slice(startIndex, startIndex + columnCount)
          const tooltipSide = rowIndex === 0 ? "bottom" : "top"

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div style={dynamicGridStyle}>
                {rowItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    isFavorite={favorites.has(item.id)}
                    onToggleFavorite={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(item.id, item.cleanTitle || item.title)
                    }}
                    onClick={() => onSelectItem(item)}
                    density={density}
                    isSelected={selectedIds ? selectedIds.has(item.id) : false}
                    onToggleSelect={() => onToggleSelect?.(item.id)}
                    tooltipSide={tooltipSide}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
