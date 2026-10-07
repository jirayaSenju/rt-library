import React from "react"
import { ScreenshotThumbnail } from "./ScreenshotThumbnail"
import { ScreenshotStatus } from "@/services/screenshotLoader"
import { Button } from "@/components/ui/button"
import { ImageIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { useI18n } from "@/i18n"

const SCREENSHOTS_PER_PAGE = 8

interface ItemScreenshotsTabProps {
  itemId: string
  screenshots: string[]
  screenshotsLoading: boolean
  screenshotStates: Record<string, ScreenshotStatus>
  screenshotPage: number
  onPageChange: (page: number) => void
  onSelectScreenshot: (index: number) => void
  onScreenshotStatus: (url: string, status: ScreenshotStatus) => void
}

export const ItemScreenshotsTab: React.FC<ItemScreenshotsTabProps> = ({
  itemId,
  screenshots,
  screenshotsLoading,
  screenshotStates,
  screenshotPage,
  onPageChange,
  onSelectScreenshot,
  onScreenshotStatus,
}) => {
  const { t, formatNumber } = useI18n()
  const allScreenshotsFailed =
    screenshots.length > 0 &&
    screenshots.every((url) => screenshotStates[url] === "failed")

  const totalPages = Math.max(1, Math.ceil(screenshots.length / SCREENSHOTS_PER_PAGE))
  const currentPage = Math.min(screenshotPage, totalPages)

  const pageScreenshots = screenshots.slice(
    (currentPage - 1) * SCREENSHOTS_PER_PAGE,
    currentPage * SCREENSHOTS_PER_PAGE
  )

  if (screenshotsLoading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
        <ImageIcon className="h-8 w-8 text-muted-foreground animate-pulse" />
        <p className="text-xs text-muted-foreground font-medium">{t("itemDetail.loadingScreenshots")}</p>
      </div>
    )
  }

  if (screenshots.length === 0) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-xs text-muted-foreground font-medium">{t("itemDetail.noScreenshots")}</p>
      </div>
    )
  }

  if (allScreenshotsFailed) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
        <ImageIcon className="h-8 w-8 text-destructive/70" />
        <p className="text-xs text-muted-foreground font-medium">{t("itemDetail.screenshotsUnavailable")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header with count and pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            {t("itemDetail.screenshotsTab")} ({formatNumber(screenshots.length)})
          </h4>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {t("itemDetail.pageOf", { current: formatNumber(currentPage), total: formatNumber(totalPages) })}
            </span>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage === 1}
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className="h-7 w-7 border-border bg-secondary text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30"
                title={t("itemDetail.previousPage")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className="h-7 w-7 border-border bg-secondary text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30"
                title={t("itemDetail.nextPage")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Screenshots Grid (horizontal 16:9 aspect-video) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {pageScreenshots.map((imgUrl, idx) => {
          const globalIndex = (currentPage - 1) * SCREENSHOTS_PER_PAGE + idx
          return (
            <ScreenshotThumbnail
              key={`${itemId}_${imgUrl}_${globalIndex}`}
              url={imgUrl}
              itemId={itemId}
              index={globalIndex}
              onClick={() => onSelectScreenshot(globalIndex)}
              onStatus={onScreenshotStatus}
            />
          )
        })}
      </div>
    </div>
  )
}
