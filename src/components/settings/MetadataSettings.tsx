import React, { useState, useEffect } from "react"
import { AppSettings } from "@/types"
import {
  torrentMetadataService,
  TorrentCollectionProgress,
} from "@/services/torrentMetadata"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  Play,
  Square,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Sparkles,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { SettingsSection } from "./SettingsSection"
import { SettingRow } from "./SettingRow"

interface MetadataSettingsProps {
  settings: AppSettings
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void
}

export const MetadataSettings: React.FC<MetadataSettingsProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t, formatNumber } = useI18n()
  const [scanMode, setScanMode] = useState<"missing" | "zero" | "all">("missing")
  const [progress, setProgress] = useState<TorrentCollectionProgress>({
    isCollecting: false,
    processed: 0,
    total: 0,
    complete: 0,
    failed: 0,
    percent: 0,
  })
  const [isStartingScan, setIsStartingScan] = useState(false)

  useEffect(() => {
    torrentMetadataService
      .getCollectionProgress()
      .then(setProgress)
      .catch(console.error)

    const unsubscribe = torrentMetadataService.onCollectionProgress(setProgress)
    return () => {
      unsubscribe()
    }
  }, [])

  const handleStartCollection = async (mode: "all" | "missing" | "zero" = scanMode) => {
    if (isStartingScan || progress.isCollecting) return
    setIsStartingScan(true)
    try {
      const res = await torrentMetadataService.startCollection(mode)
      if (res.success) {
        toast.success(t("settings.metadata.scanStartedToast"))
      } else {
        toast.error(res.message || res.error || t("settings.metadata.scanErrorToast"))
      }
    } catch (err: any) {
      console.error("Start collection failed:", err)
      toast.error(err.message || t("settings.metadata.scanErrorToast"))
    } finally {
      setIsStartingScan(false)
    }
  }

  const handleStopCollection = async () => {
    try {
      await torrentMetadataService.stopCollection()
      toast.info(t("settings.metadata.scanStoppedToast"))
    } catch (err: any) {
      console.error("Stop collection failed:", err)
      toast.error(t("settings.metadata.scanErrorToast"))
    }
  }

  const getStrategyLabel = (mode: "missing" | "zero" | "all") => {
    switch (mode) {
      case "missing":
        return t("settings.metadata.missingMetadataTitle")
      case "zero":
        return t("settings.metadata.zeroSeedsTitle")
      case "all":
        return t("settings.metadata.fullScanTitle")
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. AUTOMATIC COLLECTION & SCHEDULE */}
      <SettingsSection
        icon={Clock}
        title={t("settings.metadata.autoCollectionTitle")}
      >
        <SettingRow
          title={t("settings.metadata.autoCollectionToggle")}
          description={t("settings.metadata.autoCollectionDesc")}
        >
          <Switch
            checked={settings.autoFetchMetadata ?? true}
            onCheckedChange={(checked) =>
              onUpdateSettings((prev) => ({
                ...prev,
                autoFetchMetadata: checked,
              }))
            }
          />
        </SettingRow>

        <SettingRow
          title={t("settings.metadata.scheduleIntervalTitle")}
          description={t("settings.metadata.scheduleIntervalDesc")}
          divider
        >
          <select
            value={settings.metadataFetchIntervalDays ?? 7}
            onChange={(e) =>
              onUpdateSettings((prev) => ({
                ...prev,
                metadataFetchIntervalDays: Number(e.target.value),
              }))
            }
            className="bg-background/80 border border-border text-xs rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:border-primary font-medium"
          >
            <option value={1}>{t("settings.metadata.intervalDaily")}</option>
            <option value={7}>{t("settings.metadata.intervalWeekly")}</option>
            <option value={30}>{t("settings.metadata.intervalMonthly")}</option>
          </select>
        </SettingRow>
      </SettingsSection>

      {/* 2. SCAN STRATEGY SELECTION */}
      <SettingsSection
        icon={Search}
        title={t("settings.metadata.strategyTitle")}
        description={t("settings.metadata.strategyDesc")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {(["missing", "zero", "all"] as const).map((mode) => {
            const isSelected = scanMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setScanMode(mode)}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                    : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-foreground">
                    {getStrategyLabel(mode)}
                  </span>
                  {isSelected && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {mode === "missing" && t("settings.metadata.missingMetadataDesc")}
                  {mode === "zero" && t("settings.metadata.zeroSeedsDesc")}
                  {mode === "all" && t("settings.metadata.fullScanDesc")}
                </p>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      {/* 3. MANUAL EXECUTION & PROGRESS */}
      <SettingsSection
        icon={Activity}
        title={t("settings.metadata.manualExecutionTitle")}
        description={t("settings.metadata.manualExecutionDesc", {
          strategy: getStrategyLabel(scanMode),
        })}
      >
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground">
              {progress.isCollecting
                ? t("settings.metadata.statusCollecting")
                : progress.total > 0
                ? t("settings.metadata.statusCompleted")
                : t("settings.metadata.statusIdle")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {progress.isCollecting ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopCollection}
                className="text-xs shrink-0 h-8 px-4"
              >
                <Square className="h-3 w-3 mr-1.5 fill-current" />
                {t("settings.metadata.stopScan")}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleStartCollection(scanMode)}
                disabled={isStartingScan}
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs shrink-0 h-8 px-4 font-semibold"
              >
                {isStartingScan ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {t("settings.metadata.starting")}
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    {t("settings.metadata.runScan")}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Real-time Progress Bar & Stats */}
        {(progress.isCollecting || progress.total > 0) && (
          <div className="p-3.5 bg-background/80 border border-border/80 rounded-xl space-y-3 mt-3 animate-in fade-in-0 duration-150">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">
                {progress.processed} / {progress.total}
              </span>
              <span className="text-primary font-bold">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className="h-1.5 bg-secondary" />

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-secondary/40 p-2 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground block">{t("settings.metadata.processed")}</span>
                <span className="text-xs font-bold text-foreground font-mono">
                  {formatNumber(progress.processed)}
                </span>
              </div>
              <div className="bg-secondary/40 p-2 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground block">{t("settings.metadata.updated")}</span>
                <span className="text-xs font-bold text-primary font-mono">
                  {formatNumber(progress.complete)}
                </span>
              </div>
              <div className="bg-secondary/40 p-2 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground block">{t("settings.metadata.failed")}</span>
                <span className="text-xs font-bold text-destructive font-mono">
                  {formatNumber(progress.failed)}
                </span>
              </div>
            </div>

            {progress.currentItemTitle && progress.isCollecting && (
              <p className="text-[10px] text-muted-foreground font-mono truncate pt-1">
                {t("settings.metadata.currentItem")} {progress.currentItemTitle}
              </p>
            )}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
