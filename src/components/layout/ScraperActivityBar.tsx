import React, { useState, useEffect } from "react"
import { ScraperState, ScraperProgress } from "@/services/scraperService"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n"
import { useProgressTheme } from "@/hooks/useProgressTheme"
import { ProgressThemeId, getProgressTheme } from "@/theme/progressThemes"
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Square,
  ExternalLink,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ProgressMascot } from "./ProgressMascot"

export interface ScraperActivityBarProps {
  state: ScraperState
  progress: ScraperProgress | null
  error?: string | null
  progressThemeId?: ProgressThemeId
  onOpenDetails: () => void
  onCancel: () => void
  onRenewSession?: () => void
}

export const ScraperActivityBar: React.FC<ScraperActivityBarProps> = ({
  state,
  progress,
  error,
  progressThemeId,
  onOpenDetails,
  onCancel,
  onRenewSession,
}) => {
  const { t, formatNumber } = useI18n()
  const { progressTheme: hookTheme } = useProgressTheme()
  const progressTheme = progressThemeId ? getProgressTheme(progressThemeId) : hookTheme
  const [isDismissed, setIsDismissed] = useState(false)
  const [lastNonIdleState, setLastNonIdleState] = useState<ScraperState>(state)

  // Track state changes to reset dismissal
  useEffect(() => {
    if (state !== "idle") {
      setIsDismissed(false)
      setLastNonIdleState(state)
    }
  }, [state])

  // Auto-hide after 4 seconds when completed
  useEffect(() => {
    if (state === "completed") {
      const timer = setTimeout(() => {
        setIsDismissed(true)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [state])

  // Zero reserved space when idle or dismissed
  if (state === "idle" || isDismissed) {
    return null
  }

  const isRunning = state === "running" || state === "starting"
  const isCancelling = state === "cancelling"
  const isCompleted = state === "completed"
  const isFailed = state === "failed"
  const isSessionRequired = state === "session_required" || state === "interaction_required"

  // Calculate percentage if available
  const hasTotalPages = !!(progress?.totalPages && progress.totalPages > 0)
  const percent = hasTotalPages && progress?.currentPage
    ? Math.min(100, Math.max(0, Math.round((progress.currentPage / progress.totalPages!) * 100)))
    : null

  // Format mode label
  const getModeLabel = () => {
    const mode = (progress as any)?.mode
    const refresh = (progress as any)?.refresh
    if (mode === "full") return t("activityBar.fullScan")
    if (mode === "refresh" && refresh) {
      if (refresh.images && !refresh.size && !refresh.files) return t("activityBar.refreshImages")
      if (refresh.size && !refresh.images && !refresh.files) return t("activityBar.refreshSizes")
      if (refresh.files && !refresh.images && !refresh.size) return t("activityBar.refreshFiles")
      return t("activityBar.combinedRefresh")
    }
    if (mode === "incremental") return t("activityBar.incrementalScan")
    return t("activityBar.updatingLibrary")
  }

  return (
    <aside
      aria-label={t("activityBar.updatingLibrary")}
      role="status"
      aria-live="polite"
      data-progress-theme={progressTheme.id}
      className={cn(
        "w-full px-4 sm:px-6 py-2.5 border-b border-border transition-colors flex items-center justify-between gap-3 text-xs shrink-0 select-none z-10",
        isRunning || isCancelling
          ? "bg-card/95 backdrop-blur-xs text-foreground"
          : isCompleted
          ? "bg-primary/10 text-foreground border-primary/20"
          : isFailed
          ? "bg-destructive/10 text-foreground border-destructive/20"
          : isSessionRequired
          ? "bg-amber-500/10 text-foreground border-amber-500/20"
          : "bg-card text-foreground"
      )}
    >
      {/* Left side: Status Icon + Mode/Category/Page Info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
        {/* Status Indicator Icon */}
        {isRunning && <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />}
        {isCancelling && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
        {isCompleted && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
        {isFailed && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
        {isSessionRequired && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}

        {/* Text Content */}
        <div className="flex items-center gap-2 min-w-0 truncate">
          {/* Main Title / Mode */}
          <span className="font-semibold text-foreground shrink-0">
            {isCompleted
              ? t("activityBar.completed")
              : isFailed
              ? t("activityBar.failed")
              : isSessionRequired
              ? t("activityBar.interactionRequired")
              : isCancelling
              ? t("activityBar.cancelling")
              : getModeLabel()}
          </span>

          {/* Details during run */}
          {(isRunning || isCancelling) && (
            <>
              {/* Category Name */}
              {progress?.categoryName && progress.categoryName !== "ALL" && (
                <span className="text-muted-foreground truncate hidden sm:inline">
                  • {progress.categoryName}
                </span>
              )}

              {/* Page Progress */}
              <span className="text-muted-foreground font-mono shrink-0">
                •{" "}
                {hasTotalPages
                  ? t("activityBar.pageOf", {
                      current: formatNumber(progress?.currentPage || 0),
                      total: formatNumber(progress?.totalPages || 0),
                    })
                  : progress?.currentPage && progress.currentPage > 0
                  ? `Pág. ${formatNumber(progress.currentPage)}`
                  : t("activityBar.discoveringPages")}
              </span>

              {/* Items Counter */}
              {progress?.newItems !== undefined && progress.newItems > 0 && (
                <span className="text-primary font-mono font-medium shrink-0 hidden md:inline">
                  +{formatNumber(progress.newItems)}
                </span>
              )}
            </>
          )}

          {/* Summary on complete */}
          {isCompleted && progress?.newItems !== undefined && progress.newItems > 0 && (
            <span className="text-primary font-mono font-medium shrink-0">
              (+{formatNumber(progress.newItems)} {t("common.items")})
            </span>
          )}

          {/* Error message preview */}
          {isFailed && error && (
            <span className="text-destructive text-[11px] truncate max-w-xs md:max-w-md">
              • {error}
            </span>
          )}
        </div>
      </div>

      {/* Center / Right: Progress Bar (when running or starting) */}
      {(isRunning || isCancelling) && (
        <div className="hidden sm:flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center w-28 sm:w-36 md:w-44 py-1">
            <div
              role="progressbar"
              aria-valuenow={percent !== null ? percent : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("activityBar.updatingLibrary")}
              className="w-full h-3 rounded-full overflow-hidden relative border border-border/50 shadow-xs"
              style={{
                backgroundColor: progressTheme.isDefault ? undefined : progressTheme.trackBg,
                borderColor: progressTheme.isDefault ? undefined : progressTheme.trackBorder,
              }}
            >
              {percent !== null ? (
                <div
                  className={cn(
                    "h-full transition-all duration-300 rounded-full",
                    progressTheme.isDefault && "bg-primary",
                    progressTheme.hasAnimation && progressTheme.animationClass
                  )}
                  style={{
                    width: `${percent}%`,
                    background: progressTheme.isDefault ? undefined : progressTheme.fillBackground,
                    backgroundSize: progressTheme.fillBackgroundSize,
                    boxShadow: progressTheme.isDefault ? undefined : progressTheme.glow,
                  }}
                />
              ) : (
                <div
                  className={cn(
                    "h-full rounded-full w-full",
                    progressTheme.isDefault ? "bg-primary/70 animate-pulse" : "animate-progress-indeterminate",
                    progressTheme.hasAnimation && progressTheme.animationClass
                  )}
                  style={{
                    background: progressTheme.isDefault ? undefined : progressTheme.fillBackground,
                    backgroundSize: progressTheme.fillBackgroundSize,
                    boxShadow: progressTheme.isDefault ? undefined : progressTheme.glow,
                  }}
                />
              )}
            </div>

            {/* Mascot & Motion Component (Overlay) */}
            <div className="absolute inset-x-0 inset-y-0 pointer-events-none flex items-center overflow-visible">
              <ProgressMascot
                theme={progressTheme}
                percent={percent}
                state={state}
                size="lg"
                isIndeterminate={percent === null}
              />
            </div>
          </div>
          {percent !== null ? (
            <span
              className={cn(
                "text-[11px] font-mono font-bold w-9 text-right",
                progressTheme.isDefault ? "text-foreground" : ""
              )}
              style={{
                color: !progressTheme.isDefault && progressTheme.textColor !== "inherit" ? progressTheme.textColor : undefined,
              }}
            >
              {percent}%
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground animate-pulse">...</span>
          )}
        </div>
      )}

      {/* Right side: Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Details / Open Settings Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDetails}
          className="h-7 px-2.5 text-xs font-medium gap-1 text-foreground hover:text-primary"
          aria-label={t("activityBar.details")}
        >
          <span>
            {isFailed
              ? t("activityBar.viewLogs")
              : isSessionRequired
              ? t("activityBar.openSettings")
              : t("activityBar.details")}
          </span>
          <ExternalLink className="h-3 w-3 opacity-70" />
        </Button>

        {/* Cancel Button (when active) */}
        {(isRunning || isCancelling) && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onCancel}
            disabled={isCancelling}
            className="h-7 px-2.5 text-xs font-medium gap-1"
            aria-label={t("activityBar.cancel")}
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            <span>{isCancelling ? t("activityBar.cancelling") : t("activityBar.cancel")}</span>
          </Button>
        )}

        {/* Dismiss / Close Button (when completed or failed) */}
        {(isCompleted || isFailed || isSessionRequired) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDismissed(true)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={t("activityBar.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </aside>
  )
}

