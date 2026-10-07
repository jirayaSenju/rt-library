import React, { useState } from "react"
import { CheckSquare, X, Check, Copy, Download, Star, StarOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LibraryItem } from "@/types"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { toast } from "sonner"
import { useI18n } from "@/i18n"

interface SelectionBarProps {
  selectedCount: number
  selectedItems: LibraryItem[]
  totalPageItems: number
  onSelectAll: () => void
  onClearSelection: () => void
  isAllSelected: boolean
  onFavoriteSelected: (itemIds: string[]) => Promise<void>
  onUnfavoriteSelected: (itemIds: string[]) => Promise<void>
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  selectedCount,
  selectedItems,
  totalPageItems,
  onSelectAll,
  onClearSelection,
  isAllSelected,
  onFavoriteSelected,
  onUnfavoriteSelected,
}) => {
  const { t } = useI18n()
  const [isExporting, setIsExporting] = useState(false)
  const [isFavoriting, setIsFavoriting] = useState(false)
  const [isUnfavoriting, setIsUnfavoriting] = useState(false)

  if (selectedCount <= 0) return null

  const isBusy = isExporting || isFavoriting || isUnfavoriting

  const selectedLabel =
    selectedCount === 1
      ? t("catalog.selection.selectedCountSingle", { count: selectedCount })
      : t("catalog.selection.selectedCountPlural", { count: selectedCount })

  // Extract and validate unique magnets in visual page order
  const getValidMagnets = () => {
    const itemsWithMagnet = selectedItems.filter(
      (item) =>
        typeof (item.magnetLink || item.magnet) === "string" &&
        (item.magnetLink || item.magnet)!.trim().startsWith("magnet:?")
    )
    const rawMagnets = itemsWithMagnet.map(
      (item) => (item.magnetLink || item.magnet)!.trim()
    )
    return Array.from(new Set(rawMagnets))
  }

  const handleCopyMagnets = async () => {
    const uniqueMagnets = getValidMagnets()
    if (uniqueMagnets.length === 0) {
      toast.warning(t("catalog.batch.noMagnetsWarning"))
      return
    }

    try {
      await navigator.clipboard.writeText(uniqueMagnets.join("\n"))
      const skipped = selectedItems.length - uniqueMagnets.length
      if (skipped > 0) {
        toast.success(
          t("catalog.batch.copySuccessWithSkipped", {
            count: uniqueMagnets.length,
            skipped,
          })
        )
      } else {
        toast.success(
          t("catalog.batch.copySuccess", {
            count: uniqueMagnets.length,
          })
        )
      }
    } catch (err) {
      console.error("Failed to copy magnets to clipboard:", err)
      toast.error(t("catalog.batch.exportError"))
    }
  }

  const handleExportMagnets = async () => {
    const uniqueMagnets = getValidMagnets()
    if (uniqueMagnets.length === 0) {
      toast.warning(t("catalog.batch.noMagnetsWarning"))
      return
    }

    setIsExporting(true)
    try {
      const res = await nativeLibraryService.exportMagnets(uniqueMagnets)
      if (res.canceled) {
        return
      }

      if (!res.success) {
        toast.error(t("catalog.batch.exportError"))
        return
      }

      const skipped = selectedItems.length - uniqueMagnets.length
      if (skipped > 0) {
        toast.success(
          t("catalog.batch.exportSuccessWithSkipped", {
            count: uniqueMagnets.length,
            skipped,
          })
        )
      } else {
        toast.success(
          t("catalog.batch.exportSuccess", {
            count: uniqueMagnets.length,
          })
        )
      }
    } catch (err) {
      console.error("Failed to export magnets:", err)
      toast.error(t("catalog.batch.exportError"))
    } finally {
      setIsExporting(false)
    }
  }

  const handleFavorite = async () => {
    const ids = selectedItems.map((i) => i.id)
    if (ids.length === 0) return

    setIsFavoriting(true)
    try {
      await onFavoriteSelected(ids)
      toast.success(t("catalog.batch.favoriteSuccess", { count: ids.length }))
    } catch (err) {
      console.error("Failed to favorite items:", err)
      toast.error(t("catalog.batch.favoriteError"))
    } finally {
      setIsFavoriting(false)
    }
  }

  const handleUnfavorite = async () => {
    const ids = selectedItems.map((i) => i.id)
    if (ids.length === 0) return

    setIsUnfavoriting(true)
    try {
      await onUnfavoriteSelected(ids)
      toast.info(t("catalog.batch.unfavoriteSuccess", { count: ids.length }))
    } catch (err) {
      console.error("Failed to unfavorite items:", err)
      toast.error(t("catalog.batch.favoriteError"))
    } finally {
      setIsUnfavoriting(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Selection Actions"
      className="bg-card/95 border-b border-primary/30 px-4 md:px-6 py-2 flex flex-wrap md:flex-nowrap items-center justify-between gap-3 text-xs text-foreground backdrop-blur-md shadow-md animate-in fade-in slide-in-from-top-1 duration-150 shrink-0 select-none z-10"
    >
      {/* Left: Count Badge & Label */}
      <div className="flex items-center gap-2.5">
        <Badge
          variant="secondary"
          className="bg-primary/20 text-primary border border-primary/40 font-mono font-bold px-2 py-0.5"
        >
          <CheckSquare className="h-3.5 w-3.5 mr-1 text-primary inline" />
          {selectedCount}
        </Badge>
        <span className="font-medium text-foreground/80">
          {selectedLabel}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center flex-wrap gap-1.5 md:gap-2">
        {!isAllSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={isBusy}
            className="h-7 px-2.5 text-xs bg-card/60 border-border hover:border-primary/50 hover:bg-secondary text-foreground hover:text-primary gap-1.5 transition-colors"
            aria-label={t("catalog.selection.selectAllAria")}
          >
            <Check className="h-3.5 w-3.5" />
            <span>{t("catalog.selection.selectAll", { count: totalPageItems })}</span>
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyMagnets}
          disabled={isBusy}
          className="h-7 px-2.5 text-xs bg-card/60 border-border hover:border-border/80 hover:bg-secondary text-foreground gap-1.5 transition-colors"
          aria-label={t("catalog.batch.copyMagnets")}
          title={t("catalog.batch.copyMagnets")}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>{t("catalog.batch.copyMagnets")}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportMagnets}
          disabled={isBusy}
          className="h-7 px-2.5 text-xs bg-card/60 border-border hover:border-border/80 hover:bg-secondary text-foreground gap-1.5 transition-colors"
          aria-label={t("catalog.batch.exportMagnets")}
          title={t("catalog.batch.exportMagnets")}
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>{t("catalog.batch.exportMagnets")}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleFavorite}
          disabled={isBusy}
          className="h-7 px-2.5 text-xs bg-card/60 border-border hover:border-amber-500/50 hover:bg-secondary text-foreground hover:text-amber-400 gap-1.5 transition-colors"
          aria-label={t("catalog.batch.favoriteSelected")}
          title={t("catalog.batch.favoriteSelected")}
        >
          {isFavoriting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          ) : (
            <Star className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span>{t("catalog.batch.favoriteSelected")}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleUnfavorite}
          disabled={isBusy}
          className="h-7 px-2.5 text-xs bg-card/60 border-border hover:border-border/80 hover:bg-secondary text-muted-foreground gap-1.5 transition-colors"
          aria-label={t("catalog.batch.unfavoriteSelected")}
          title={t("catalog.batch.unfavoriteSelected")}
        >
          {isUnfavoriting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span>{t("catalog.batch.unfavoriteSelected")}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isBusy}
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 transition-colors"
          aria-label={t("catalog.selection.clearSelection")}
        >
          <X className="h-3.5 w-3.5" />
          <span>{t("catalog.selection.clearSelection")}</span>
        </Button>
      </div>
    </div>
  )
}
