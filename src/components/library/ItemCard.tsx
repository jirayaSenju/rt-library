import React, { useState, useEffect } from "react"
import { LibraryItem } from "@/types"
import { resolveImageUrl } from "@/utils/imageResolver"
import { imageCacheService } from "@/services/imageCache"
import { openMagnetLink } from "@/services/magnetLauncher"
import { Star, Magnet, Gamepad2, HardDrive, ArrowUp, ArrowDown, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

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

  const handleMagnetClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const targetMagnet = item.magnetLink || item.magnet
    if (targetMagnet) {
      openMagnetLink(targetMagnet, item.cleanTitle || item.title)
    }
  }

  const displaySize = item.size || formatBytes(item.sizeBytes) || (item.torrent?.totalSize ? formatBytes(item.torrent.totalSize) : null)
  const seeds = item.seeders ?? item.torrent?.seeders ?? null
  const leechers = item.leechers ?? item.torrent?.leechers ?? null
  const hasSwarm = seeds !== null || leechers !== null
  const hasMetadata = displaySize !== null || hasSwarm

  const isCompact = density === "compact"
  const fullTitle = item.canonicalTitle || item.cleanTitle || item.title || ""
  const originalTitle = item.title && item.title !== fullTitle ? item.title : null

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onToggleSelect) {
      onToggleSelect(e)
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
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
            aria-label={t("catalog.viewDetailsAria", { title: item.cleanTitle || item.title })}
            data-item-card="true"
            className={cn(
              "group relative w-full h-full bg-card border transition-[border-color,box-shadow] duration-200 cursor-pointer select-none flex flex-col rounded-xl overflow-hidden shadow-sm",
              isSelected
                ? "border-primary ring-2 ring-primary/50 shadow-md shadow-primary/10"
                : "border-border hover:border-primary/60 hover:shadow-md hover:shadow-primary/10",
              "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            )}
          >
            {/* 1. Cover Image Section (Fills space cleanly with object-contain to never crop artwork) */}
            <div className="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-card">
              {imgSrc && !imgError ? (
                <img
                  src={imgSrc}
                  alt={item.cleanTitle || item.title}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-muted/40 text-muted-foreground group-hover:text-primary transition-colors">
                  <Gamepad2 className={cn(isCompact ? "h-10 w-10 mb-1" : "h-14 w-14 mb-2", "stroke-[1.2]")} />
                  <span className="text-[10px] text-center font-mono opacity-80 uppercase tracking-widest truncate max-w-[90%]">
                    {item.categoryName || item.categoryId}
                  </span>
                </div>
              )}

              {/* 2. Top Overlay: Selection Checkbox & Platform Badge (Left) & Favorite Button (Right) */}
              <div className={cn(
                "absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-1 pointer-events-auto",
                isCompact ? "p-1.5" : "p-2"
              )}>
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
                        : "bg-card/90 text-transparent hover:text-foreground hover:bg-accent border-border/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                    aria-label={
                      isSelected
                        ? t("catalog.selection.deselectItemAria", { title: item.cleanTitle || item.title })
                        : t("catalog.selection.selectItemAria", { title: item.cleanTitle || item.title })
                    }
                  >
                    <Check className={cn(isCompact ? "h-2.5 w-2.5 stroke-[3]" : "h-3.5 w-3.5 stroke-[3]", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-40")} />
                  </button>

                  <Badge
                    variant="secondary"
                    className={cn(
                      "bg-card/90 backdrop-blur-md text-foreground border border-border/80 uppercase font-bold tracking-wider shadow-sm truncate",
                      isCompact ? "text-[8.5px] px-1.5 py-0" : "text-[9.5px] px-2 py-0.5"
                    )}
                  >
                    {item.categoryId}
                  </Badge>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(e)
                  }}
                  className={cn(
                    "rounded-full backdrop-blur-md transition-all shrink-0 flex items-center justify-center border shadow-sm",
                    isCompact ? "p-1" : "p-1.5",
                    isFavorite
                      ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                      : "bg-card/90 text-muted-foreground hover:text-amber-500 hover:bg-accent border-border/80"
                  )}
                  aria-label={isFavorite ? t("catalog.removeFromFavoritesAria") : t("catalog.addToFavoritesAria")}
                >
                  <Star className={cn(
                    isCompact ? "h-3 w-3" : "h-3.5 w-3.5",
                    isFavorite ? "fill-amber-500 text-amber-500" : ""
                  )} />
                </button>
              </div>

              {/* 3. Floating Metadata Badges (Over cover image, styled like Category Badge) */}
              {(hasMetadata || item.releaseYear) && (
                <div className={cn(
                  "absolute bottom-0 inset-x-0 z-10 flex items-center justify-between gap-1 px-2 pb-1.5 pointer-events-none",
                  isCompact && "px-1.5 pb-1"
                )}>
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    {displaySize && (
                      <span className={cn(
                        "inline-flex items-center gap-1 font-mono font-medium rounded-md bg-card/90 backdrop-blur-md text-foreground border border-border/80 shadow-sm px-1.5 py-0.5",
                        isCompact ? "text-[8px]" : "text-[9px]"
                      )}>
                        <HardDrive className={cn("text-muted-foreground", isCompact ? "h-2 w-2" : "h-2.5 w-2.5")} />
                        <span>{displaySize}</span>
                      </span>
                    )}

                    {hasSwarm && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-mono font-bold rounded-md bg-card/90 backdrop-blur-md text-foreground border border-border/80 shadow-sm px-1.5 py-0.5",
                          isCompact ? "text-[8px]" : "text-[9px]"
                        )}
                        title={`Seeds: ${seeds ?? 0}, Leechers: ${leechers ?? 0}`}
                      >
                        <span className="flex items-center text-emerald-500 gap-0.5">
                          <ArrowUp className={cn("stroke-[2.5]", isCompact ? "h-2 w-2" : "h-2.5 w-2.5")} />
                          <span>{seeds ?? 0}</span>
                        </span>
                        <span className="text-[8px] text-muted-foreground">•</span>
                        <span className="flex items-center text-sky-500 gap-0.5">
                          <ArrowDown className={cn("stroke-[2.5]", isCompact ? "h-2 w-2" : "h-2.5 w-2.5")} />
                          <span>{leechers ?? 0}</span>
                        </span>
                      </span>
                    )}
                  </div>

                  {item.releaseYear && (
                    <span className={cn(
                      "font-semibold rounded-md font-mono bg-card/90 backdrop-blur-md text-primary border border-border/80 shadow-sm shrink-0",
                      isCompact ? "text-[8.5px] px-1.5 py-0.5" : "text-[9.5px] px-2 py-0.5"
                    )}>
                      {item.releaseYear}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 4. Bottom Section: Compact Title Footer */}
            <div className={cn(
              "relative z-10 shrink-0 flex flex-col justify-center bg-card/95 backdrop-blur-md border-t border-border/80",
              isCompact ? "p-1.5 px-2 min-h-[30px]" : "p-2 px-2.5 min-h-[36px]"
            )}>
              <h3
                className={cn(
                  "font-semibold line-clamp-1 leading-tight text-foreground group-hover:text-primary transition-colors",
                  isCompact ? "text-[10.5px]" : "text-xs"
                )}
              >
                {fullTitle}
              </h3>
            </div>

            {/* 5. Compact Magnet Link Action on Hover */}
            {(item.magnetLink || item.magnet) && (
              <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
                <Button
                  size="sm"
                  onClick={handleMagnetClick}
                  className={cn(
                    "pointer-events-auto bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 rounded-lg translate-y-1 group-hover:translate-y-0 transition-transform duration-200 gap-1.5",
                    isCompact ? "h-7 px-2.5 text-[10px]" : "h-8 px-3 text-xs"
                  )}
                  aria-label={t("catalog.magnetAria", { title: item.canonicalTitle || item.cleanTitle || item.title })}
                >
                  <Magnet className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
                  <span>{t("catalog.magnetButton")}</span>
                </Button>
              </div>
            )}
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

