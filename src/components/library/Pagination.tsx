import React from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/i18n"

export const ALLOWED_PAGE_SIZES = [24, 48, 96, 100, 200] as const
export type PageSize = (typeof ALLOWED_PAGE_SIZES)[number]

export interface PaginationRange {
  startItem: number
  endItem: number
  totalPages: number
}

export function getPaginationRange(
  currentPage: number,
  pageSize: number,
  totalItems: number
): PaginationRange {
  const safePageSize = pageSize > 0 ? pageSize : 24
  const safeTotalItems = Math.max(0, totalItems)
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize))
  const safePage = Math.max(1, Math.min(currentPage, totalPages))

  if (safeTotalItems === 0) {
    return {
      startItem: 0,
      endItem: 0,
      totalPages: 1,
    }
  }

  const startItem = (safePage - 1) * safePageSize + 1
  const endItem = Math.min(safePage * safePageSize, safeTotalItems)

  return {
    startItem,
    endItem,
    totalPages,
  }
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  isLoading?: boolean
  className?: string
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  className = "",
}) => {
  const { t, formatNumber } = useI18n()
  if (totalItems === 0) return null

  const { startItem, endItem, totalPages: calculatedTotalPages } = getPaginationRange(
    currentPage,
    pageSize,
    totalItems
  )
  const effectiveTotalPages = Math.max(1, totalPages || calculatedTotalPages)

  // Generate smart page numbers (e.g. 1 ... 4 5 6 ... 20)
  const getPageNumbers = (): (number | string)[] => {
    if (effectiveTotalPages <= 7) {
      return Array.from({ length: effectiveTotalPages }, (_, i) => i + 1)
    }

    const pages: (number | string)[] = []
    pages.push(1)

    const start = Math.max(2, currentPage - 1)
    const end = Math.min(effectiveTotalPages - 1, currentPage + 1)

    if (start > 2) {
      pages.push("...")
    }

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (end < effectiveTotalPages - 1) {
      pages.push("...")
    }

    pages.push(effectiveTotalPages)
    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <footer
      role="navigation"
      aria-label={t("pagination.pageAria", { page: currentPage })}
      className={`shrink-0 w-full border-t border-border/80 bg-card/85 backdrop-blur-md px-4 sm:px-6 py-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground select-none z-20 ${className}`}
    >
      {/* Left: Range Info */}
      <div className="flex items-center space-x-2 font-mono text-muted-foreground text-xs shrink-0">
        <span>
          {t("pagination.showingRange", {
            start: formatNumber(startItem),
            end: formatNumber(endItem),
            total: formatNumber(totalItems),
          })}
        </span>
      </div>

      {/* Center: Page Controls (Segmented Control) */}
      <div className="flex items-center rounded-xl border border-border/90 bg-muted/40 p-0.5 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1 || isLoading}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-25 rounded-lg"
          title={t("pagination.firstPage")}
          aria-label={t("pagination.firstPage")}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-25 rounded-lg"
          title={t("pagination.previousPage")}
          aria-label={t("pagination.previousPage")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page Numbers */}
        <div className="flex items-center space-x-0.5 px-0.5">
          {pageNumbers.map((p, idx) => {
            if (typeof p === "string") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-muted-foreground/60 font-mono text-xs">
                  ...
                </span>
              )
            }

            const isCurrent = p === currentPage
            return (
              <Button
                key={`page-${p}`}
                variant="ghost"
                size="sm"
                onClick={() => onPageChange(p)}
                disabled={isLoading}
                aria-label={t("pagination.pageAria", { page: p })}
                aria-current={isCurrent ? "page" : undefined}
                className={`h-8 min-w-8 px-2.5 font-mono text-xs rounded-lg transition-all ${
                  isCurrent
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-sm"
                    : "text-foreground/80 hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {p}
              </Button>
            )
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= effectiveTotalPages || isLoading}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-25 rounded-lg"
          title={t("pagination.nextPage")}
          aria-label={t("pagination.nextPage")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(effectiveTotalPages)}
          disabled={currentPage >= effectiveTotalPages || isLoading}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-25 rounded-lg"
          title={t("pagination.lastPage")}
          aria-label={t("pagination.lastPage")}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Items Per Page Selector */}
      <div className="flex items-center space-x-2 shrink-0">
        <span className="text-muted-foreground text-xs font-medium">{t("pagination.perPage")}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(val) => onPageSizeChange(Number(val))}
          disabled={isLoading}
        >
          <SelectTrigger 
            className="h-8 w-20 border-border/90 bg-muted/60 text-foreground text-xs font-mono rounded-xl focus:ring-ring/30 shadow-sm px-2.5"
            aria-label={t("pagination.selectPerPageAria")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground text-xs font-mono rounded-xl">
            {ALLOWED_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </footer>
  )
}
