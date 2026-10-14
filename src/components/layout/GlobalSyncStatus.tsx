import React, { useState, useEffect } from "react"
import { 
  Loader2, 
  Pause, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  X, 
  Settings,
  RefreshCw,
  Info,
  History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { useScraper } from "@/hooks/useScraper"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

interface GlobalSyncStatusProps {
  onOpenSettings?: (section?: any, subview?: string | null) => void
}

export const GlobalSyncStatus: React.FC<GlobalSyncStatusProps> = ({ onOpenSettings }) => {
  const { t } = useI18n()
  const { 
    state, 
    progress, 
    isRunning, 
    isPaused, 
    error, 
    pauseScraper, 
    resumeScraper, 
    cancelScraper 
  } = useScraper()

  const [isOpen, setIsOpen] = useState(false)
  const [isActionPending, setIsActionPending] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  // Reset dismissal when new sync job starts
  useEffect(() => {
    if (isRunning || state === "starting" || state === "preflight" || state === "verifying") {
      setIsDismissed(false)
    }
  }, [isRunning, state])

  // Auto-hide completed or failed pill after 45 seconds TTL (V3-76)
  useEffect(() => {
    if (state === "completed" || state === "failed") {
      const timer = setTimeout(() => {
        setIsDismissed(true)
      }, 45000)
      return () => clearTimeout(timer)
    }
  }, [state])

  // Only render if actively doing something, paused, errored, or recently finished and not dismissed
  if (state === "idle" || isDismissed) {
    return null
  }

  const isVerifying = state === "verifying" || state === "reprobing" || state === "session_required" || state === "interaction_required" || state === "auth_required"
  const isCancelling = state === "cancelling"
  const isCompleted = state === "completed"
  const isFailed = state === "failed"

  let statusBadgeColor = "bg-primary/10 text-primary border-primary/20"
  let dotColor = "bg-primary"
  let statusLabel = t("settings.scraper.statusSyncing")
  let StatusIcon = RefreshCw

  if (isPaused) {
    statusBadgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/20"
    dotColor = "bg-amber-500"
    statusLabel = t("settings.scraper.statusPaused")
    StatusIcon = Pause
  } else if (isVerifying) {
    statusBadgeColor = "bg-orange-500/10 text-orange-500 border-orange-500/20"
    dotColor = "bg-orange-500"
    statusLabel = t("settings.scraper.statusVerificationRequired")
    StatusIcon = AlertTriangle
  } else if (isCancelling) {
    statusBadgeColor = "bg-muted text-muted-foreground border-border"
    dotColor = "bg-muted-foreground"
    statusLabel = t("activityBar.cancelling")
    StatusIcon = Loader2
  } else if (isCompleted) {
    statusBadgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
    dotColor = "bg-emerald-500"
    statusLabel = t("settings.scraper.statusCompleted")
    StatusIcon = CheckCircle2
  } else if (isFailed) {
    statusBadgeColor = "bg-destructive/10 text-destructive border-destructive/20"
    dotColor = "bg-destructive"
    statusLabel = t("settings.scraper.statusFailed")
    StatusIcon = AlertCircle
  }

  const handlePauseResume = async () => {
    setIsActionPending(true)
    try {
      if (isPaused) {
        await resumeScraper()
      } else {
        await pauseScraper()
      }
    } finally {
      setIsActionPending(false)
    }
  }

  const handleCancel = async () => {
    setIsActionPending(true)
    try {
      await cancelScraper()
    } finally {
      setIsActionPending(false)
    }
  }

  const progressPercent = 
    progress?.totalPages && progress.totalPages > 0 && progress.currentPage != null
      ? Math.min(100, Math.round((progress.currentPage / progress.totalPages) * 100))
      : 0

  const itemsSaved = progress?.newItems ?? progress?.processedItems ?? 0
  const elapsedSec = progress?.elapsedMs ? Math.round(progress.elapsedMs / 1000) : 0
  const itemsSpeed = 
    elapsedSec > 10 && itemsSaved > 0
      ? Math.round((itemsSaved / (elapsedSec / 60)))
      : null

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shadow-sm cursor-pointer select-none",
            statusBadgeColor,
            "hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary/20"
          )}
          title={t("settings.scraper.syncStatusTitle")}
          aria-label={t("settings.scraper.syncStatusTitle")}
        >
          <span className="relative flex h-2 w-2">
            {isRunning && !isPaused && (
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", dotColor)} />
            )}
            <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColor)} />
          </span>

          <StatusIcon className={cn("h-3 w-3", isRunning && !isPaused && !isVerifying && "animate-spin")} />

          <span className="truncate max-w-[140px] font-semibold">{statusLabel}</span>

          {itemsSaved > 0 && (
            <span className="text-[10px] opacity-75 font-mono">
              ({itemsSaved})
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-80 p-4 space-y-3.5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", dotColor)} />
            <h4 className="font-semibold text-sm text-foreground">
              {t("settings.scraper.syncStatusTitle")}
            </h4>
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium border", statusBadgeColor)}>
            {statusLabel}
          </span>
        </div>

        {/* Progress bar & details if running or paused */}
        {(isRunning || isPaused || isCompleted) && progress && (
          <div className="space-y-2 text-xs">
            {progress.categoryName && (
              <div className="flex justify-between text-muted-foreground">
                <span className="truncate font-medium text-foreground">
                  {progress.categoryName}
                </span>
                {progress.currentPage != null && progress.totalPages != null && (
                  <span className="shrink-0 font-mono text-[11px]">
                    {progress.currentPage} / {progress.totalPages}
                  </span>
                )}
              </div>
            )}

            {progress.totalPages != null && progress.totalPages > 0 && (
              <Progress value={progressPercent} className="h-1.5" />
            )}

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-muted-foreground border-t border-border/50">
              <div>
                <span>{t("settings.scraper.topicsFound")}: </span>
                <strong className="text-foreground font-mono">{progress.topicsDiscovered ?? progress.newTopics ?? 0}</strong>
              </div>
              <div>
                <span>{t("settings.scraper.itemsSavedCount")}: </span>
                <strong className="text-foreground font-mono">{itemsSaved}</strong>
              </div>
              <div>
                <span>{t("settings.scraper.detailsProcessed")}: </span>
                <strong className="text-foreground font-mono">{progress.detailsProcessed ?? 0}</strong>
              </div>
              {itemsSpeed != null && (
                <div>
                  <span>{t("settings.scraper.currentSpeedLabel")}: </span>
                  <strong className="text-foreground font-mono">~{itemsSpeed}/min</strong>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error message if failed */}
        {isFailed && error && (
          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs break-words">
            {error}
          </div>
        )}

        {/* Completion summary with View Summary link (V3-75) */}
        {isCompleted && (
          <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <span className="font-semibold">
              +{progress?.newItems ?? progress?.processedItems ?? 0} {t("settings.scraper.newItemsLabel").toLowerCase()}
            </span>
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/20"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings("scraper", "scraper/history");
                }}
              >
                <History className="h-3 w-3" />
                <span>{t("settings.scraper.viewSummary")}</span>
              </Button>
            )}
          </div>
        )}

        {/* Informative notice */}
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/40">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span>{t("settings.scraper.backgroundScanContinuesNotice")}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          {(isRunning || isPaused) && (
            <>
              <Button
                variant={isPaused ? "default" : "outline"}
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                disabled={isActionPending || isCancelling}
                onClick={handlePauseResume}
              >
                {isPaused ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    {t("settings.scraper.resumeJob")}
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    {t("settings.scraper.pauseJob")}
                  </>
                )}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs px-2.5"
                disabled={isActionPending || isCancelling}
                onClick={handleCancel}
                title={t("activityBar.cancel")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-8 text-xs gap-1", (!isRunning && !isPaused) && "w-full")}
              onClick={() => {
                setIsOpen(false)
                onOpenSettings("scraper")
              }}
            >
              <Settings className="h-3.5 w-3.5" />
              {t("settings.scraper.viewSettings")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
