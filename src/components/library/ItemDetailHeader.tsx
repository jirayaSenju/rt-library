import React from "react"
import { LibraryItem } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Star,
  Magnet,
  Copy,
  ExternalLink,
  Gamepad2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { openExternal } from "@/platform/shell"

export function getForumTopicUrl(item: LibraryItem): string | null {
  if (item.url && /^https?:\/\//i.test(item.url)) return item.url
  if (item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) return item.sourceUrl
  if (item.baseUrl && /^https?:\/\//i.test(item.baseUrl)) return item.baseUrl
  if (item.url && item.url.includes("viewtopic.php")) {
    return `https://rutracker.org/forum/${item.url.replace(/^\/?(forum\/)?/, "")}`
  }
  const rawTopicId =
    item.topicId ||
    (item.id && /^(?:rutracker_)?(\d+)$/i.test(item.id)
      ? item.id.replace(/^rutracker_/i, "")
      : null)
  if (rawTopicId && /^\d+$/.test(rawTopicId)) {
    return `https://rutracker.org/forum/viewtopic.php?t=${rawTopicId}`
  }
  return item.url || item.sourceUrl || item.baseUrl || null
}

interface ItemDetailHeaderProps {
  item: LibraryItem
  coverUrl: string | null
  isFavorite: boolean
  onToggleFavorite: () => void
  onLaunchMagnet: () => void
  onCopyMagnet: () => void
}

export const ItemDetailHeader: React.FC<ItemDetailHeaderProps> = ({
  item,
  coverUrl,
  isFavorite,
  onToggleFavorite,
  onLaunchMagnet,
  onCopyMagnet,
}) => {
  const { t, locale } = useI18n()
  const targetMagnet = item.magnetLink || item.magnet
  const forumUrl = getForumTopicUrl(item)

  const displayTitle = item.canonicalTitle || item.cleanTitle || item.title
  const rawForumTitle = item.topicTitle || item.title
  const hasAltTitle = rawForumTitle && rawForumTitle !== displayTitle

  // Build secondary metadata line: Platform · Year · Developer
  const metaParts: string[] = []
  if (item.categoryId) metaParts.push(item.categoryId.toUpperCase())
  if (item.releaseYear) metaParts.push(item.releaseYear)
  if (item.developer) metaParts.push(item.developer)
  if (item.releaseGroup) metaParts.push(`Release: ${item.releaseGroup}`)
  const secondaryMeta = metaParts.join(" · ")

  return (
    <div className="p-5 md:p-6 border-b border-border bg-card shrink-0">
      <div className="flex gap-4 md:gap-5 items-start">
        {/* Cover Art (Compact 110-130px) */}
        <div className="w-24 sm:w-28 md:w-32 aspect-[3/4] bg-muted/40 rounded-xl overflow-hidden border border-border shrink-0 shadow-xl relative group">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-muted-foreground">
              <Gamepad2 className="h-8 w-8 mb-1.5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">{item.categoryId}</span>
            </div>
          )}
          <Badge
            variant="secondary"
            className="absolute top-1.5 left-1.5 bg-card/90 backdrop-blur-md text-primary border border-primary/30 text-[9px] uppercase font-bold px-1.5 py-0"
          >
            {item.categoryId}
          </Badge>
        </div>

        {/* Title & Actions */}
        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
          <div className="pr-8 sm:pr-10">
            {/* Title */}
            <h2
              className="text-lg sm:text-xl md:text-2xl font-bold leading-snug text-foreground line-clamp-2"
              title={displayTitle}
            >
              {displayTitle}
            </h2>

            {/* Secondary Metadata Subtitle */}
            {secondaryMeta && (
              <p className="text-xs text-muted-foreground font-medium mt-1 truncate">
                {secondaryMeta}
              </p>
            )}

            {/* Original Forum Title (if distinct) */}
            {hasAltTitle && (
              <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5 line-clamp-1" title={rawForumTitle}>
                RuTracker Topic: {rawForumTitle}
              </p>
            )}
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-wrap items-center gap-2 pt-3 mt-auto">
            {targetMagnet && (
              <Button
                onClick={onLaunchMagnet}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-8 sm:h-9 px-4 rounded-xl shadow-md shadow-primary/20"
              >
                <Magnet className="h-3.5 w-3.5 mr-1.5" />
                {t("itemDetail.openMagnet")}
              </Button>
            )}

            {targetMagnet && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCopyMagnet}
                className="border-border bg-secondary text-foreground hover:bg-muted text-xs h-8 sm:h-9 px-3 rounded-xl"
                title={t("itemDetail.copyMagnet")}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {t("itemDetail.copyMagnet")}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFavorite}
              className={cn(
                "border-border bg-secondary text-foreground hover:bg-muted text-xs h-8 sm:h-9 px-3 rounded-xl transition-colors",
                isFavorite
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  : "text-muted-foreground hover:text-amber-400"
              )}
              aria-label={isFavorite ? t("itemDetail.removeFromFavoritesAria") : t("itemDetail.addToFavoritesAria")}
              title={isFavorite ? t("itemDetail.removeFromFavoritesAria") : t("itemDetail.addToFavoritesAria")}
            >
              <Star className={cn("h-3.5 w-3.5 mr-1.5", isFavorite ? "fill-amber-400 text-amber-400" : "")} />
              <span>
                {isFavorite
                  ? (locale === "pt-BR" ? "Favorito" : locale === "ru-RU" ? "В избранном" : "Favorited")
                  : (locale === "pt-BR" ? "Favoritar" : locale === "ru-RU" ? "В избранное" : "Favorite")}
              </span>
            </Button>

            {forumUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openExternal(forumUrl)}
                className="border-border bg-secondary text-foreground hover:bg-muted text-xs h-8 sm:h-9 px-3 rounded-xl transition-colors"
                title={t("itemDetail.openForum")}
                aria-label={t("itemDetail.openForum")}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                {t("itemDetail.openForum")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
