import React, { useState, useEffect } from "react"
import { LibraryItem } from "@/types"
import { resolveImageUrl } from "@/utils/imageResolver"
import { imageCacheService } from "@/services/imageCache"
import { Star, Gamepad2, HardDrive, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { getLibraryCategoryLabel } from "@/utils/libraryCategoryLabel"

function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || isNaN(bytes) || bytes <= 0) return null
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

interface ItemCardProps {
  item: LibraryItem
  isFavorite: boolean
  onToggleFavorite: (e: React.MouseEvent) => void
  onClick: () => void
  density?: "comfortable" | "compact"
  isSelected?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
  tooltipSide?: "top" | "bottom"
}

export const ItemCard = React.memo<ItemCardProps>(({
  item,
  isFavorite,
  onToggleFavorite,
  onClick,
  density = "comfortable",
  isSelected = false,
  onToggleSelect,
  tooltipSide = "top",
}) => {
  const { t } = useI18n()
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const [, setIsLoadingImg] = useState(true)

  useEffect(() => {
    let isMounted = true
    let currentBlobUrl: string | null = null
    const rawUrl = item.coverImage || item.cover || (item.screenshots && item.screenshots[0])

    if (!rawUrl) {
      setIsLoadingImg(false)
      return
    }

    const resolvedUrl = resolveImageUrl(rawUrl)

    imageCacheService
      .getImage(resolvedUrl)
      .then((blobUrl) => {
        if (isMounted) {
          currentBlobUrl = blobUrl
          setImgSrc(blobUrl)
          setIsLoadingImg(false)
        } else if (blobUrl && blobUrl.startsWith("blob:")) {
          imageCacheService.revokeObjectUrl(blobUrl)
        }
      })
      .catch(() => {
        if (isMounted) {
          setImgSrc(resolvedUrl || null)
          setIsLoadingImg(false)
        }
      })

    return () => {
      isMounted = false
      if (currentBlobUrl && currentBlobUrl.startsWith("blob:")) {
        imageCacheService.revokeObjectUrl(currentBlobUrl)
      }
    }
  }, [item.coverImage, item.cover, item.screenshots])

  const displaySize = item.size || formatBytes(item.sizeBytes) || (item.torrent?.totalSize ? formatBytes(item.torrent.totalSize) : null)
  const isCompact = density === "compact"
  const fullTitle = item.canonicalTitle || item.cleanTitle || item.title || ""
  const originalTitle = item.title && item.title !== fullTitle ? item.title : null
  const categoryLabel = getLibraryCategoryLabel(item)

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onToggleSelect) {
      onToggleSelect(e)
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
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
            aria-label={t("catalog.viewDetailsAria", { title: fullTitle })}
            data-item-card="true"
            className={cn(
              "group relative w-full h-full bg-card/40 border transition-[border-color,box-shadow,transform] duration-200 cursor-pointer select-none rounded-xl overflow-hidden shadow-sm",
              isCompact ? "p-1" : "p-1.5",
              isSelected
                ? "border-primary ring-2 ring-primary/50 shadow-md shadow-primary/10"
                : "border-border/70 hover:border-primary/60 hover:shadow-lg hover:shadow-black/25",
              "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            )}
          >
            {/* 1. Tightened Cover Image Section */}
            <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-card/60 rounded-[8px]">
              {imgSrc && !imgError ? (
                <img
                  src={imgSrc}
                  alt={fullTitle}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-300 ease-out"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-muted/30 text-muted-foreground group-hover:text-primary transition-colors">
                  <Gamepad2 className={cn(isCompact ? "h-10 w-10 mb-1" : "h-14 w-14 mb-2", "stroke-[1.2]")} />
                  <span className="text-[10px] text-center font-mono opacity-80 uppercase tracking-widest truncate max-w-[90%]">
                    {item.categoryName || item.categoryId}
                  </span>
                </div>
              )}

              {/* 2. Top Controls: Platform Badge & Selection Checkbox (Left) + Favorite Star (Right) */}
              <div
                className={cn(
                  "absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-1 pointer-events-auto",
                  isCompact ? "p-1" : "p-1.5"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 max-w-[75%]">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={handleSelectClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation()
                      }
                    }}
                    className={cn(
                      "rounded backdrop-blur-md transition-all shrink-0 flex items-center justify-center border shadow-sm",
                      isCompact ? "h-4 w-4" : "h-5 w-5",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary opacity-100"
                        : "bg-black/60 text-transparent hover:text-white hover:bg-black/80 border-white/10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    )}
                    aria-label={
                      isSelected
                        ? t("catalog.selection.deselectItemAria", { title: fullTitle })
                        : t("catalog.selection.selectItemAria", { title: fullTitle })
                    }
                  >
                    <Check
                      className={cn(
                        isCompact ? "h-2.5 w-2.5 stroke-[3]" : "h-3.5 w-3.5 stroke-[3]",
                        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                      )}
                    />
                  </button>

                  <Badge
                    variant="secondary"
                    className={cn(
                      "bg-black/65 backdrop-blur-md text-white/95 border border-white/10 uppercase font-bold tracking-wider shadow-sm truncate",
                      isCompact ? "text-[8.5px] px-1.5 py-0" : "text-[9.5px] px-2 py-0.5"
                    )}
                  >
                    {categoryLabel}
                  </Badge>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(e)
                  }}
                  className={cn(
                    "rounded-full backdrop-blur-md transition-all shrink-0 flex items-center justify-center border shadow-sm",
                    isCompact ? "p-1" : "p-1.5",
                    isFavorite
                      ? "bg-amber-500/25 text-amber-400 border-amber-500/50"
                      : "bg-black/65 text-white/70 hover:text-amber-400 hover:bg-black/80 border-white/10"
                  )}
                  aria-label={isFavorite ? t("catalog.removeFromFavoritesAria") : t("catalog.addToFavoritesAria")}
                >
                  <Star
                    className={cn(
                      isCompact ? "h-3 w-3" : "h-3.5 w-3.5",
                      isFavorite ? "fill-amber-400 text-amber-400" : ""
                    )}
                  />
                </button>
              </div>

              {/* 3. Bottom Size Badge (Always visible in normal resting state) */}
              {displaySize && (
                <div
                  className={cn(
                    "absolute bottom-0 left-0 z-10 pointer-events-none transition-opacity duration-150 ease-out group-hover:opacity-0 group-focus-within:opacity-0 group-focus-visible:opacity-0",
                    isCompact ? "p-1" : "p-1.5"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-mono font-medium rounded-md bg-black/65 backdrop-blur-md text-white/90 border border-white/10 shadow-sm",
                      isCompact ? "text-[8px] px-1 py-0.5" : "text-[9px] px-1.5 py-0.5"
                    )}
                  >
                    <HardDrive className={cn("text-white/60", isCompact ? "h-2 w-2" : "h-2.5 w-2.5")} />
                    <span>{displaySize}</span>
                  </span>
                </div>
              )}

              {/* 4. Bottom Title + Size Overlay (Appears on Hover / Keyboard Focus) */}
              <div
                data-testid="item-card-title-overlay"
                className={cn(
                  "absolute bottom-0 inset-x-0 z-20 pointer-events-none bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col justify-end transition-all duration-150 ease-out opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0",
                  isCompact ? "pt-7 pb-1.5 px-1.5 gap-1" : "pt-9 pb-2 px-2 gap-1.5"
                )}
              >
                {displaySize && (
                  <div className="flex items-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-mono font-medium rounded-md bg-white/10 backdrop-blur-md text-white/90 border border-white/10 shadow-sm",
                        isCompact ? "text-[8px] px-1 py-0.5" : "text-[8.5px] px-1.5 py-0.5"
                      )}
                    >
                      <HardDrive className={cn("text-white/60", isCompact ? "h-2 w-2" : "h-2.5 w-2.5")} />
                      <span>{displaySize}</span>
                    </span>
                  </div>
                )}

                <h3
                  className={cn(
                    "font-semibold text-white leading-snug line-clamp-2 drop-shadow-md",
                    isCompact ? "text-[11px]" : "text-[12.5px]"
                  )}
                >
                  {fullTitle}
                </h3>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={tooltipSide}
          sideOffset={8}
          className="max-w-xs break-words text-center px-2.5 py-1.5 shadow-xl bg-popover text-popover-foreground border border-border text-xs z-50 pointer-events-none"
        >
          <p className="font-semibold leading-snug">{fullTitle}</p>
          {originalTitle && (
            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 font-mono break-all leading-tight opacity-90">
              {originalTitle}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
