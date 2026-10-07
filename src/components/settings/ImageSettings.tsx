import React, { useState, useEffect } from "react"
import { imageCacheService, ImageCacheDetailedStats } from "@/services/imageCache"
import {
  formatBytes,
  ImageCachePolicyConfig,
  DEFAULT_IMAGE_CACHE_POLICY,
} from "@/services/imageCachePolicy"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useImageCacheWarmup } from "@/hooks/useImageCacheWarmup"
import { CacheWarmupTarget } from "@/services/imageCacheWarmup"
import {
  Database,
  Trash2,
  RefreshCw,
  ImageIcon,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Layers,
  Image as SingleImageIcon,
  XCircle,
  Clock,
  Download,
  Play,
  Pause,
  Square,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { SettingsSection } from "./SettingsSection"
import { SettingRow } from "./SettingRow"

export const ImageSettings: React.FC = () => {
  const { t, formatNumber } = useI18n()
  const [cacheStats, setCacheStats] = useState<ImageCacheDetailedStats>({
    count: 0,
    totalBytes: 0,
    maxBytes: DEFAULT_IMAGE_CACHE_POLICY.maxSizeBytes,
    utilizationPercent: 0,
    totalSizeFormatted: "0 B",
    coversCount: 0,
    coversBytes: 0,
    coversSizeFormatted: "0 B",
    screenshotsCount: 0,
    screenshotsBytes: 0,
    screenshotsSizeFormatted: "0 B",
    otherCount: 0,
    otherBytes: 0,
    otherSizeFormatted: "0 B",
    failedCount: 0,
    expiredCount: 0,
    healthStatus: "healthy",
    providers: [],
    lastCleanupAt: null,
  })

  const [policy, setPolicyState] = useState<ImageCachePolicyConfig>(() => imageCacheService.getPolicy())
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)

  // Cache warmup state
  const warmup = useImageCacheWarmup()
  const [warmupTarget, setWarmupTarget] = useState<CacheWarmupTarget>("all")
  const [warmupSkipExisting, setWarmupSkipExisting] = useState(true)

  // Dialog states for selective and all clearing
  const [confirmModalType, setConfirmModalType] = useState<"all" | "covers" | "screenshots" | null>(null)

  const loadStats = async () => {
    setIsLoadingStats(true)
    try {
      const stats = await imageCacheService.getStats()
      setCacheStats(stats)
      setPolicyState(imageCacheService.getPolicy())
    } catch (err) {
      console.warn("Failed to load image cache stats:", err)
    } finally {
      setIsLoadingStats(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  // Refresh stats whenever warmup completes
  useEffect(() => {
    const handleWarmupCompleted = () => {
      loadStats()
    }
    if (typeof window !== "undefined") {
      window.addEventListener("rt-library-image-cache-warmup-completed", handleWarmupCompleted)
      return () => {
        window.removeEventListener("rt-library-image-cache-warmup-completed", handleWarmupCompleted)
      }
    }
  }, [])

  const handleStartWarmup = async () => {
    try {
      await warmup.start({
        target: warmupTarget,
        skipExisting: warmupSkipExisting,
      })
      await loadStats()
      toast.success(
        t("settings.images.generateSuccessToast", {
          cached: formatNumber(warmup.cachedSuccess),
          size: warmup.bytesAddedFormatted,
        })
      )
    } catch (err: any) {
      toast.error(t("settings.images.generateErrorToast", { error: err.message || "Failed" }))
    }
  }

  const updatePolicy = (delta: Partial<ImageCachePolicyConfig>) => {
    const updated = { ...policy, ...delta }
    setPolicyState(updated)
    imageCacheService.setPolicy(updated)
    // Recalculate stats with updated policy max/thresholds
    imageCacheService.getStats().then((s) => setCacheStats(s)).catch(() => {})
  }

  // --- Handlers for Actions ---

  const handleClearAll = async () => {
    setIsPerformingAction(true)
    try {
      await imageCacheService.clear()
      const updated = await imageCacheService.getStats()
      setCacheStats(updated)
      toast.success(t("settings.images.clearSuccess"))
    } catch (err: any) {
      toast.error(err.message || t("settings.images.clearError"))
    } finally {
      setIsPerformingAction(false)
      setConfirmModalType(null)
    }
  }

  const handleClearCovers = async () => {
    setIsPerformingAction(true)
    try {
      const deletedCount = await imageCacheService.clearCovers()
      const updated = await imageCacheService.getStats()
      setCacheStats(updated)
      toast.success(
        t("settings.images.clearCoversSuccess", {
          count: formatNumber(deletedCount),
          size: formatBytes(cacheStats.coversBytes),
        })
      )
    } catch (err: any) {
      toast.error(err.message || t("settings.images.clearError"))
    } finally {
      setIsPerformingAction(false)
      setConfirmModalType(null)
    }
  }

  const handleClearScreenshots = async () => {
    setIsPerformingAction(true)
    try {
      const deletedCount = await imageCacheService.clearScreenshots()
      const updated = await imageCacheService.getStats()
      setCacheStats(updated)
      toast.success(
        t("settings.images.clearScreenshotsSuccess", {
          count: formatNumber(deletedCount),
          size: formatBytes(cacheStats.screenshotsBytes),
        })
      )
    } catch (err: any) {
      toast.error(err.message || t("settings.images.clearError"))
    } finally {
      setIsPerformingAction(false)
      setConfirmModalType(null)
    }
  }

  const handleClearFailed = async () => {
    setIsPerformingAction(true)
    try {
      const deletedCount = await imageCacheService.clearFailed()
      const updated = await imageCacheService.getStats()
      setCacheStats(updated)
      toast.success(t("settings.images.clearFailedSuccess", { count: formatNumber(deletedCount) }))
    } catch (err: any) {
      toast.error(err.message || t("settings.images.clearError"))
    } finally {
      setIsPerformingAction(false)
    }
  }

  const handleRunCleanupNow = async () => {
    setIsPerformingAction(true)
    try {
      const result = await imageCacheService.cleanup()
      const updated = await imageCacheService.getStats()
      setCacheStats(updated)
      if (result.deletedCount > 0) {
        toast.success(
          t("settings.images.cleanupSuccess", {
            count: formatNumber(result.deletedCount),
            size: formatBytes(result.freedBytes),
            duration: (result.durationMs / 1000).toFixed(1),
          })
        )
      } else {
        toast.info(t("settings.images.cleanupNoOp", { size: cacheStats.totalSizeFormatted }))
      }
    } catch (err: any) {
      toast.error(err.message || t("settings.images.clearError"))
    } finally {
      setIsPerformingAction(false)
    }
  }

  // Format relative last cleanup
  const formatLastCleanup = (ts: number | null) => {
    if (!ts) return t("settings.images.never")
    const diffSec = Math.floor((Date.now() - ts) / 1000)
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const thresholdBytes = (policy.maxSizeBytes * policy.cleanupThresholdPercent) / 100
  const targetBytes = (policy.maxSizeBytes * policy.cleanupTargetPercent) / 100

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. CACHE OVERVIEW */}
      <SettingsSection
        icon={ImageIcon}
        title={t("settings.images.usageTitle")}
        description={t("settings.images.usageDescription")}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStats}
            disabled={isLoadingStats || isPerformingAction}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            title={t("settings.images.refresh")}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1.5", isLoadingStats && "animate-spin text-primary")} />
            {t("settings.images.refresh")}
          </Button>
        }
      >
        <div className="space-y-3 pt-1">
          {/* Top Metric Strip: Count & Size & Health Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border/80 bg-background/80">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-foreground font-mono">
                    {formatNumber(cacheStats.count)}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {t("settings.images.cachedImages").toLowerCase()}
                  </span>
                  <span className="text-muted-foreground text-xs">•</span>
                  <span className="text-base font-bold text-primary font-mono">
                    {cacheStats.totalSizeFormatted}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {cacheStats.totalSizeFormatted} / {formatBytes(policy.maxSizeBytes)} ({cacheStats.utilizationPercent}%)
                </div>
              </div>
            </div>

            {/* Health Badge */}
            <div className="flex items-center gap-1.5 self-start sm:self-center">
              {cacheStats.healthStatus === "healthy" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("settings.images.healthHealthy")}
                </span>
              )}
              {cacheStats.healthStatus === "near_limit" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("settings.images.healthNearLimit")}
                </span>
              )}
              {cacheStats.healthStatus === "cleanup_recommended" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t("settings.images.healthCleanupRecommended")}
                </span>
              )}
              {cacheStats.healthStatus === "cleaning" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 animate-pulse">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {t("settings.images.healthCleaning")}
                </span>
              )}
            </div>
          </div>

          {/* Storage Progress Bar */}
          <div className="space-y-1.5">
            <div
              role="progressbar"
              aria-valuenow={cacheStats.utilizationPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("settings.images.storageUsed")}
              className="w-full h-2.5 rounded-full bg-secondary/80 overflow-hidden relative border border-border/60"
            >
              <div
                className={cn(
                  "h-full transition-all duration-300 rounded-full",
                  cacheStats.healthStatus === "cleanup_recommended"
                    ? "bg-destructive"
                    : cacheStats.healthStatus === "near_limit"
                    ? "bg-amber-500"
                    : "bg-primary"
                )}
                style={{ width: `${Math.min(100, Math.max(1, cacheStats.utilizationPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
              <span>0 B</span>
              <span>
                {policy.cleanupThresholdPercent}% ({formatBytes(thresholdBytes)})
              </span>
              <span>{formatBytes(policy.maxSizeBytes)}</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 2. STORAGE BREAKDOWN */}
      <SettingsSection
        icon={Layers}
        title={t("settings.images.storageBreakdown")}
        description={t("settings.images.usageDescription")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {/* Covers */}
          <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t("settings.images.covers")}
              </span>
              <SingleImageIcon className="h-3.5 w-3.5 text-primary opacity-80" />
            </div>
            <div className="mt-1">
              <span className="text-sm font-bold text-foreground font-mono block">
                {formatNumber(cacheStats.coversCount)}
              </span>
              <span className="text-[11px] text-primary font-mono font-medium">
                {cacheStats.coversSizeFormatted}
              </span>
            </div>
          </div>

          {/* Screenshots */}
          <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t("settings.images.screenshots")}
              </span>
              <Layers className="h-3.5 w-3.5 text-primary opacity-80" />
            </div>
            <div className="mt-1">
              <span className="text-sm font-bold text-foreground font-mono block">
                {formatNumber(cacheStats.screenshotsCount)}
              </span>
              <span className="text-[11px] text-primary font-mono font-medium">
                {cacheStats.screenshotsSizeFormatted}
              </span>
            </div>
          </div>

          {/* Failed Entries */}
          <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t("settings.images.failedEntries")}
              </span>
              <XCircle className="h-3.5 w-3.5 text-destructive opacity-80" />
            </div>
            <div className="mt-1">
              <span className="text-sm font-bold text-foreground font-mono block">
                {formatNumber(cacheStats.failedCount)}
              </span>
              <span className="text-[10px] text-muted-foreground">Negative Cache</span>
            </div>
          </div>

          {/* Expired Entries */}
          <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase">
                {t("settings.images.expiredEntries")}
              </span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground opacity-80" />
            </div>
            <div className="mt-1">
              <span className="text-sm font-bold text-foreground font-mono block">
                {formatNumber(cacheStats.expiredCount)}
              </span>
              <span className="text-[10px] text-muted-foreground">TTL Policy</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 3. CACHE POLICY */}
      <SettingsSection
        icon={ShieldCheck}
        title={t("settings.images.policyTitle")}
        description={t("settings.images.policyDesc")}
      >
        <div className="space-y-3 pt-1">
          {/* Max Size Selector */}
          <SettingRow
            title={t("settings.images.maxSize")}
            description="High watermark ceiling before cache cleanup activates."
          >
            <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
              {[
                { label: "250 MB", bytes: 250 * 1024 * 1024 },
                { label: "500 MB", bytes: 500 * 1024 * 1024 },
                { label: "1 GB", bytes: 1024 * 1024 * 1024 },
                { label: "2 GB", bytes: 2048 * 1024 * 1024 },
              ].map((opt) => (
                <button
                  key={opt.bytes}
                  type="button"
                  onClick={() => updatePolicy({ maxSizeBytes: opt.bytes })}
                  className={cn(
                    "px-2.5 py-1 text-xs font-mono rounded-md transition-all",
                    policy.maxSizeBytes === opt.bytes
                      ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>

          {/* Auto Cleanup Toggle */}
          <SettingRow
            title={t("settings.images.autoCleanup")}
            description={t("settings.images.autoCleanupDesc")}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                {policy.autoCleanup ? "ON" : "OFF"}
              </span>
              <Switch
                checked={policy.autoCleanup}
                onCheckedChange={(checked) => updatePolicy({ autoCleanup: checked })}
                aria-label={t("settings.images.autoCleanup")}
              />
            </div>
          </SettingRow>

          {/* Cleanup Threshold & Target Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("settings.images.cleanupThreshold")}
              </span>
              <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
                {[80, 85, 90, 95].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updatePolicy({ cleanupThresholdPercent: pct })}
                    className={cn(
                      "flex-1 py-0.5 text-xs font-mono rounded-md transition-all text-center",
                      policy.cleanupThresholdPercent === pct
                        ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("settings.images.cleanupTarget")}
              </span>
              <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
                {[70, 75, 80, 85].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => updatePolicy({ cleanupTargetPercent: pct })}
                    className={cn(
                      "flex-1 py-0.5 text-xs font-mono rounded-md transition-all text-center",
                      policy.cleanupTargetPercent === pct
                        ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Single Image Limit & Expiration Policy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("settings.images.singleImageLimit")}
              </span>
              <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
                {[10, 15, 25, 50].map((mb) => (
                  <button
                    key={mb}
                    type="button"
                    onClick={() => updatePolicy({ maxSingleImageBytes: mb * 1024 * 1024 })}
                    className={cn(
                      "flex-1 py-0.5 text-xs font-mono rounded-md transition-all text-center",
                      policy.maxSingleImageBytes === mb * 1024 * 1024
                        ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mb} MB
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-background/80 p-2.5 rounded-xl border border-border/80 flex flex-col justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                {t("settings.images.expirationPolicy")}
              </span>
              <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
                {[
                  { label: t("settings.images.expirationNever"), days: 0 },
                  { label: "15d", days: 15 },
                  { label: "30d", days: 30 },
                  { label: "60d", days: 60 },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => updatePolicy({ expirationDays: opt.days })}
                    className={cn(
                      "flex-1 py-0.5 text-xs font-mono rounded-md transition-all text-center",
                      policy.expirationDays === opt.days
                        ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Informational Eviction Strategy & Dynamic Preview */}
          <div className="p-3 rounded-xl border border-border/80 bg-background/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-semibold uppercase text-[10px]">
                {t("settings.images.evictionStrategy")}:
              </span>
              <span className="font-medium text-primary font-mono text-xs">
                {t("settings.images.evictionStrategyLru")}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {t("settings.images.policyPreview", {
                threshold: formatBytes(thresholdBytes),
                target: formatBytes(targetBytes),
              })}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 4. GENERATE IMAGE CACHE */}
      <SettingsSection
        icon={Download}
        title={t("settings.images.generateTitle")}
        description={t("settings.images.generateDescription")}
      >
        <div className="space-y-3 pt-1">
          {warmup.isIdle ? (
            <div className="space-y-3">
              {/* Scope Selector */}
              <SettingRow
                title={t("settings.images.generateScope")}
                description={
                  warmupTarget === "all"
                    ? t("settings.images.generateScopeAll")
                    : warmupTarget === "covers"
                    ? t("settings.images.generateScopeCovers")
                    : t("settings.images.generateScopeScreenshots")
                }
              >
                <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/70">
                  {(
                    [
                      { key: "all", label: "All" },
                      { key: "covers", label: "Covers" },
                      { key: "screenshots", label: "Screenshots" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setWarmupTarget(opt.key)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                        warmupTarget === opt.key
                          ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Skip Existing Switch */}
              <SettingRow
                title={t("settings.images.generateSkipExisting")}
                description={t("settings.images.generateSkipExistingDesc")}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {warmupSkipExisting ? "ON" : "OFF"}
                  </span>
                  <Switch
                    checked={warmupSkipExisting}
                    onCheckedChange={setWarmupSkipExisting}
                    aria-label={t("settings.images.generateSkipExisting")}
                  />
                </div>
              </SettingRow>

              {/* Start Button Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-primary/30 bg-primary/5 gap-3">
                <div className="text-xs text-muted-foreground">
                  {warmupTarget === "all"
                    ? t("settings.images.generateScopeAll")
                    : warmupTarget === "covers"
                    ? t("settings.images.generateScopeCovers")
                    : t("settings.images.generateScopeScreenshots")}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleStartWarmup}
                  disabled={isPerformingAction}
                  className="text-xs shrink-0 h-8 px-3.5 gap-1.5 font-medium shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("settings.images.startGeneration")}
                </Button>
              </div>
            </div>
          ) : (
            /* Active Progress Box (Running / Paused / Completed / Cancelled) */
            <div className="p-3.5 rounded-xl border border-border/80 bg-background/80 space-y-3">
              {/* Header: Title + Status Badge + Actions */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {warmup.isRunning ? (
                    <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : warmup.isPaused ? (
                    <Pause className="h-4 w-4 text-amber-400 shrink-0" />
                  ) : warmup.isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="truncate">
                    <span className="text-xs font-semibold text-foreground block truncate">
                      {warmup.isRunning
                        ? t("settings.images.statusGenerating")
                        : warmup.isPaused
                        ? t("settings.images.statusPaused")
                        : warmup.isCompleted
                        ? t("settings.images.statusCompleted")
                        : t("settings.images.statusCancelled")}
                    </span>
                    {warmup.currentImageTitle && (
                      <span className="text-[11px] text-muted-foreground truncate block font-mono">
                        [{warmup.currentType || "image"}] {warmup.currentImageTitle}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {warmup.isRunning && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={warmup.pause}
                      className="h-7 px-2 text-xs"
                      title={t("settings.images.pauseGeneration")}
                    >
                      <Pause className="h-3 w-3 mr-1" />
                      {t("settings.images.pauseGeneration")}
                    </Button>
                  )}
                  {warmup.isPaused && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={warmup.resume}
                      className="h-7 px-2 text-xs border-primary/50 text-primary"
                      title={t("settings.images.resumeGeneration")}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {t("settings.images.resumeGeneration")}
                    </Button>
                  )}
                  {(warmup.isRunning || warmup.isPaused) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        warmup.cancel()
                        toast.info(t("settings.images.generateCancelledToast"))
                      }}
                      className="h-7 px-2 text-xs"
                      title={t("settings.images.cancelGeneration")}
                    >
                      <Square className="h-3 w-3 mr-1 fill-current" />
                      {t("settings.images.cancelGeneration")}
                    </Button>
                  )}
                  {(warmup.isCompleted || warmup.isCancelled) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={warmup.reset}
                      className="h-7 px-2.5 text-xs"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t("settings.images.refresh")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div
                  role="progressbar"
                  aria-valuenow={warmup.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t("settings.images.generateTitle")}
                  className="w-full h-2.5 rounded-full bg-secondary/80 overflow-hidden relative border border-border/60"
                >
                  <div
                    className={cn(
                      "h-full transition-all duration-300 rounded-full",
                      warmup.isCompleted
                        ? "bg-emerald-500"
                        : warmup.isPaused
                        ? "bg-amber-500"
                        : "bg-primary"
                    )}
                    style={{ width: `${Math.min(100, Math.max(1, warmup.percent))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground px-0.5">
                  <span>
                    {formatNumber(warmup.processedImages)} / {formatNumber(warmup.totalImages)} ({warmup.percent}%)
                  </span>
                  {warmup.bytesAdded > 0 && (
                    <span className="text-primary font-semibold">+{warmup.bytesAddedFormatted}</span>
                  )}
                  {warmup.speedImagesPerSec > 0 && warmup.isRunning && (
                    <span>{warmup.speedImagesPerSec} img/s</span>
                  )}
                </div>
              </div>

              {/* Progress Counters Badge Strip */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-0.5">
                <div className="p-1.5 rounded-lg bg-card/60 border border-border/70">
                  <span className="text-[10px] text-muted-foreground block">Downloaded</span>
                  <span className="font-bold text-emerald-400">{formatNumber(warmup.cachedSuccess)}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-card/60 border border-border/70">
                  <span className="text-[10px] text-muted-foreground block">Already in Cache</span>
                  <span className="font-bold text-foreground">{formatNumber(warmup.alreadyCached)}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-card/60 border border-border/70">
                  <span className="text-[10px] text-muted-foreground block">Failed / Skipped</span>
                  <span className="font-bold text-destructive">{formatNumber(warmup.failedCount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* 5. MAINTENANCE & SELECTIVE ACTIONS */}
      <SettingsSection
        icon={Database}
        title={t("settings.images.maintenanceTitle")}
        description="Selective cache purging and manual eviction execution."
      >
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* Clear Covers */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmModalType("covers")}
              disabled={isPerformingAction || cacheStats.coversCount === 0}
              className="text-xs h-8 justify-center border-border hover:bg-secondary"
            >
              <SingleImageIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {t("settings.images.clearCovers")}
            </Button>

            {/* Clear Screenshots */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmModalType("screenshots")}
              disabled={isPerformingAction || cacheStats.screenshotsCount === 0}
              className="text-xs h-8 justify-center border-border hover:bg-secondary"
            >
              <Layers className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {t("settings.images.clearScreenshots")}
            </Button>

            {/* Clear Failed */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFailed}
              disabled={isPerformingAction || cacheStats.failedCount === 0}
              className="text-xs h-8 justify-center border-border hover:bg-secondary"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
              {t("settings.images.clearFailed")}
            </Button>

            {/* Run Cleanup Now */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunCleanupNow}
              disabled={isPerformingAction || cacheStats.count === 0}
              className="text-xs h-8 justify-center border-border hover:bg-secondary"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {t("settings.images.runCleanupNow")}
            </Button>
          </div>

          {/* Clear All Cache Bar */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-destructive/30 bg-destructive/5 gap-3">
            <div>
              <div className="text-xs font-semibold text-foreground">
                {t("settings.images.clearArtworkTitle")}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("settings.images.clearArtworkDesc")}
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmModalType("all")}
              disabled={isPerformingAction}
              className="text-xs shrink-0 h-8 px-3"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {t("settings.images.clearAll")}
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* 5. DIAGNOSTICS (COLLAPSIBLE) */}
      <div className="border border-border/80 rounded-xl overflow-hidden bg-card/60">
        <button
          type="button"
          onClick={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              {t("settings.images.diagnosticsTitle")}
            </span>
          </div>
          {isDiagnosticsOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {isDiagnosticsOpen && (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/60 text-xs">
            {/* Metadata Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              <div className="p-2 rounded-lg bg-background/80 border border-border/70">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {t("settings.images.indexedDbStatus")}
                </span>
                <span className="font-mono text-xs text-emerald-400 font-semibold mt-0.5 block">
                  {t("settings.images.statusConnected")}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-background/80 border border-border/70">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {t("settings.images.schemaVersion")}
                </span>
                <span className="font-mono text-xs text-foreground font-semibold mt-0.5 block">
                  v3
                </span>
              </div>

              <div className="p-2 rounded-lg bg-background/80 border border-border/70">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  {t("settings.images.lastCleanup")}
                </span>
                <span className="font-mono text-xs text-foreground font-semibold mt-0.5 block">
                  {formatLastCleanup(cacheStats.lastCleanupAt)}
                </span>
              </div>
            </div>

            {/* Provider Table (Top 5 + Other) */}
            {cacheStats.providers.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  {t("settings.images.storageByProvider")}
                </span>
                <div className="rounded-lg border border-border/80 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/70 border-b border-border/70 text-[10px] font-semibold text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-1.5">{t("settings.images.provider")}</th>
                        <th className="px-3 py-1.5 text-right">{t("settings.images.imagesCount")}</th>
                        <th className="px-3 py-1.5 text-right">{t("settings.images.storage")}</th>
                        <th className="px-3 py-1.5 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                      {cacheStats.providers.map((p) => (
                        <tr key={p.provider} className="hover:bg-secondary/30">
                          <td className="px-3 py-1.5 font-sans font-medium text-foreground">{p.provider}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{formatNumber(p.count)}</td>
                          <td className="px-3 py-1.5 text-right text-primary font-bold">{p.sizeFormatted}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{p.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Browser Storage Quota */}
            {cacheStats.quota?.quotaFormatted && (
              <div className="p-2.5 rounded-lg bg-background/60 border border-border/70 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground font-medium">
                  {t("settings.images.browserStorageQuota")}:
                </span>
                <span className="font-mono text-foreground font-semibold">
                  {cacheStats.quota.usageFormatted || "0 B"} / {cacheStats.quota.quotaFormatted}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <Dialog open={confirmModalType !== null} onOpenChange={(open) => !open && setConfirmModalType(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {confirmModalType === "all"
                ? t("settings.images.dialogClearAllTitle")
                : confirmModalType === "covers"
                ? t("settings.images.dialogClearCoversTitle")
                : t("settings.images.dialogClearScreenshotsTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {confirmModalType === "all"
                ? t("settings.images.dialogClearAllDesc")
                : confirmModalType === "covers"
                ? t("settings.images.dialogClearCoversDesc", {
                    count: formatNumber(cacheStats.coversCount),
                    size: cacheStats.coversSizeFormatted,
                  })
                : t("settings.images.dialogClearScreenshotsDesc", {
                    count: formatNumber(cacheStats.screenshotsCount),
                    size: cacheStats.screenshotsSizeFormatted,
                  })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmModalType(null)}
              disabled={isPerformingAction}
              className="text-xs border-border bg-card text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmModalType === "all") handleClearAll()
                else if (confirmModalType === "covers") handleClearCovers()
                else if (confirmModalType === "screenshots") handleClearScreenshots()
              }}
              disabled={isPerformingAction}
              className="text-xs"
            >
              {isPerformingAction ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t("settings.images.clearing")}
                </>
              ) : (
                t("settings.images.dialogConfirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
