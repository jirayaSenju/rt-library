import React, { useState, useEffect } from "react"
import { LibraryItem } from "@/types"
import { resolveImageUrl } from "@/utils/imageResolver"
import { imageCacheService } from "@/services/imageCache"
import { Star, Gamepad2, ArrowUp, ArrowDown, HardDrive } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || isNaN(bytes) || bytes <= 0) return null
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

interface ItemListRowProps {
  item: LibraryItem
  isFavorite: boolean
  onToggleFavorite: (e: React.MouseEvent) => void
  onClick: () => void
  isSelected?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
}

export const ItemListRow = React.memo<ItemListRowProps>(({
  item,
  isFavorite,
  onToggleFavorite,
  onClick,
  isSelected = false,
  onToggleSelect,
}) => {
  const { t } = useI18n()
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    let isMounted = true
    let currentBlobUrl: string | null = null
    const rawUrl = item.coverImage || item.cover || (item.screenshots && item.screenshots[0])

    if (!rawUrl) {
      return
    }

    const resolvedUrl = resolveImageUrl(rawUrl)

    imageCacheService
      .getImage(resolvedUrl)
      .then((blobUrl) => {
        if (isMounted) {
          currentBlobUrl = blobUrl
          setImgSrc(blobUrl)
        } else if (blobUrl && blobUrl.startsWith("blob:")) {
          imageCacheService.revokeObjectUrl(blobUrl)
        }
      })
      .catch(() => {
        if (isMounted) {
          setImgSrc(resolvedUrl || null)
        }
      })

    return () => {
      isMounted = false
      if (currentBlobUrl && currentBlobUrl.startsWith("blob:")) {
        imageCacheService.revokeObjectUrl(currentBlobUrl)
      }
    }
  }, [item.coverImage, item.cover, item.screenshots])

  const displayTitle = item.canonicalTitle || item.cleanTitle || item.title
  const displaySize = item.size || formatBytes(item.sizeBytes) || (item.torrent?.totalSize ? formatBytes(item.torrent.totalSize) : null) || "—"
  const seeds = item.seeders ?? item.torrent?.seeders ?? null
  const leechers = item.leechers ?? item.torrent?.leechers ?? null
  const displayYear = item.releaseYear || "—"

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleSelect?.(e as unknown as React.MouseEvent)
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={t("catalog.viewDetailsAria", { title: displayTitle })}
      className={cn(
        "group flex items-center gap-3 px-4 py-2.5 border-b transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isSelected
          ? "bg-primary/15 hover:bg-primary/20 border-primary/30"
          : "bg-card hover:bg-secondary/60 border-border/70"
      )}
    >
      {/* 0. Selection Checkbox */}
      <div 
        className="w-6 shrink-0 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          aria-label={
            isSelected
              ? t("catalog.selection.deselectItemAria", { title: displayTitle })
              : t("catalog.selection.selectItemAria", { title: displayTitle })
          }
          className="h-4 w-4 rounded border-border bg-secondary text-primary focus:ring-ring/30 accent-primary cursor-pointer"
        />
      </div>

      {/* 1. Cover Art Thumbnail (Compact 38x50) */}
      <div className="w-10 h-13 aspect-[3/4] bg-card rounded-md overflow-hidden border border-border shrink-0 relative flex items-center justify-center shadow-sm">
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt={displayTitle}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground group-hover:text-primary">
            <Gamepad2 className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* 2. Title & Secondary Info */}
      <div className="flex-1 min-w-0 pr-2">
        <span
          className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate block"
          title={displayTitle}
        >
          {displayTitle}
        </span>
        {item.developer && (
          <span className="text-[10px] text-muted-foreground truncate block font-medium">
            {item.developer}
          </span>
        )}
      </div>

      {/* 3. Platform Badge */}
      <div className="w-20 shrink-0 text-center">
        <Badge
          variant="secondary"
          className="bg-secondary text-secondary-foreground border border-border text-[10px] uppercase font-bold px-2 py-0.5 tracking-wider truncate max-w-full shadow-none"
        >
          {item.categoryId}
        </Badge>
      </div>

      {/* 4. Release Year (Hidden on very narrow screens) */}
      <div className="w-14 shrink-0 text-center hidden md:block">
        <span className="text-xs font-mono text-muted-foreground">
          {displayYear}
        </span>
      </div>

      {/* 5. Size */}
      <div className="w-20 shrink-0 text-right">
        <span className="text-xs font-mono text-foreground font-medium">
          {displaySize}
        </span>
      </div>

      {/* 6. Seeds (Swarm) */}
      <div className="w-16 shrink-0 text-right">
        {seeds !== null ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-mono font-bold text-emerald-500">
            <ArrowUp className="h-3 w-3 stroke-[2.5]" />
            <span>{seeds}</span>
          </span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">—</span>
        )}
      </div>

      {/* 7. Leechers (Swarm, Hidden on small screens) */}
      <div className="w-16 shrink-0 text-right hidden lg:block">
        {leechers !== null ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-mono font-bold text-sky-500">
            <ArrowDown className="h-3 w-3 stroke-[2.5]" />
            <span>{leechers}</span>
          </span>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">—</span>
        )}
      </div>

      {/* 8. Favorite Toggle */}
      <div className="w-10 shrink-0 flex justify-end">
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "p-1.5 rounded-lg border transition-all",
            isFavorite
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              : "bg-secondary/60 border-border text-muted-foreground hover:text-amber-400 hover:bg-accent"
          )}
          aria-label={isFavorite ? t("catalog.removeFromFavoritesAria") : t("catalog.addToFavoritesAria")}
          title={isFavorite ? t("catalog.removeFromFavoritesAria") : t("catalog.addToFavoritesAria")}
        >
          <Star className={cn("h-3.5 w-3.5", isFavorite ? "fill-amber-400" : "")} />
        </button>
      </div>
    </div>
  )
})

