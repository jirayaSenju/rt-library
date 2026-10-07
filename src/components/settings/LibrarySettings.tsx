import React, { useState, useEffect } from "react"
import { AppSettings } from "@/types"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { scraperService } from "@/services/scraperService"
import { CategorySummary, NativeCapabilities, IndexProgressEvent } from "@/types/libraryIPC"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  RefreshCw,
  Database,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Info,
  HardDrive,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { SettingsSection } from "./SettingsSection"
import { SettingRow } from "./SettingRow"

interface LibrarySettingsProps {
  settings: AppSettings
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void
  onForceReindex: () => void
}

export const LibrarySettings: React.FC<LibrarySettingsProps> = ({
  settings,
  onUpdateSettings,
  onForceReindex,
}) => {
  const { t, formatNumber } = useI18n()
  const [capabilities, setCapabilities] = useState<NativeCapabilities | null>(null)
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [isReindexing, setIsReindexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState<IndexProgressEvent | null>(null)
  const [isDangerDialogOpen, setIsDangerDialogOpen] = useState(false)
  const [isClearingStorage, setIsClearingStorage] = useState(false)

  // Fetch real database status
  const fetchDbStatus = async () => {
    try {
      const [caps, cats] = await Promise.all([
        nativeLibraryService.getCapabilities(),
        nativeLibraryService.getCategories(),
      ])
      setCapabilities(caps)
      setCategories(cats)
    } catch (err) {
      console.warn("[LibrarySettings] Failed to fetch database status:", err)
    }
  }

  useEffect(() => {
    fetchDbStatus()

    const unsubscribe = nativeLibraryService.onIndexProgress((evt) => {
      setIndexProgress(evt)
      if (evt.status === "complete" || evt.status === "failed") {
        setIsReindexing(false)
        fetchDbStatus()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const handleReindex = async () => {
    if (isReindexing) return
    setIsReindexing(true)
    setIndexProgress({ status: "indexing", percent: 0 })
    try {
      onForceReindex()
      toast.info(t("settings.library.reindexStartedToast"))
    } catch (err: any) {
      setIsReindexing(false)
      toast.error(err.message || t("settings.library.reindexErrorToast"))
    }
  }

  const handleClearScraperStorage = async () => {
    setIsClearingStorage(true)
    try {
      const res = await scraperService.clearStorage()
      if (res.success) {
        toast.success(t("settings.library.clearStorageSuccess"))
      } else {
        toast.error(t("settings.library.clearStorageError"))
      }
    } catch (err: any) {
      toast.error(err.message || t("settings.library.clearStorageError"))
    } finally {
      setIsClearingStorage(false)
      setIsDangerDialogOpen(false)
    }
  }

  const totalIndexedItems = capabilities?.itemCount ?? categories.reduce((sum, c) => sum + c.itemCount, 0)
  const totalCategoriesCount = categories.length

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. DATABASE STATUS */}
      <SettingsSection
        icon={Database}
        title={t("settings.library.dbStatusTitle")}
        description={t("settings.library.sqliteNote")}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchDbStatus}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            title={t("settings.library.refresh")}
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            {t("settings.library.refresh")}
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="bg-background/80 p-3 rounded-xl border border-border/70">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {t("settings.library.indexedItems")}
            </span>
            <span className="text-base font-bold text-foreground font-mono mt-0.5 block">
              {totalIndexedItems > 0 ? formatNumber(totalIndexedItems) : "0"}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-xl border border-border/70">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {t("settings.library.categories")}
            </span>
            <span className="text-base font-bold text-foreground font-mono mt-0.5 block">
              {formatNumber(totalCategoriesCount)}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-xl border border-border/70">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {t("settings.library.dbStatusTitle")}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              {capabilities?.isReady || totalIndexedItems > 0 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-primary">{t("settings.library.statusReady")}</span>
                </>
              ) : isReindexing ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                  <span className="text-xs font-bold text-amber-500">{t("settings.library.statusIndexing")}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">{t("settings.library.statusEmpty")}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* 2. MAINTENANCE */}
      <SettingsSection
        icon={Layers}
        title={t("settings.library.maintenanceTitle")}
      >
        <SettingRow
          title={t("settings.library.reindexTitle")}
          description={t("settings.library.reindexDescription")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handleReindex}
            disabled={isReindexing}
            className="border-border bg-card text-foreground hover:bg-secondary text-xs shrink-0 h-8 px-4"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isReindexing && "animate-spin text-primary")} />
            {isReindexing ? t("settings.library.indexingButton") : t("settings.library.reindexButton")}
          </Button>
        </SettingRow>

        {/* Index Progress Bar if active */}
        {isReindexing && indexProgress && (
          <div className="p-3 bg-background/80 border border-border/80 rounded-xl space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground truncate max-w-xs">
                {indexProgress.currentFile
                  ? t("settings.library.indexingFile", { file: indexProgress.currentFile })
                  : t("settings.library.processingFiles")}
              </span>
              <span className="text-primary font-bold">{indexProgress.percent || 0}%</span>
            </div>
            <Progress value={indexProgress.percent || 0} className="h-1.5 bg-secondary" />
          </div>
        )}
      </SettingsSection>

      {/* 3. DANGER ZONE */}
      <SettingsSection
        icon={AlertTriangle}
        title={t("settings.library.dangerZoneTitle")}
        variant="danger"
      >
        <SettingRow
          title={t("settings.library.clearStorageTitle")}
          description={t("settings.library.clearStorageDescription")}
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDangerDialogOpen(true)}
            className="text-xs shrink-0 h-8 px-4"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("settings.library.clearStorageButton")}
          </Button>
        </SettingRow>
      </SettingsSection>

      {/* Confirmation Dialog for Danger Zone */}
      <Dialog open={isDangerDialogOpen} onOpenChange={setIsDangerDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {t("settings.library.clearStorageDialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {t("settings.library.clearStorageDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDangerDialogOpen(false)}
              disabled={isClearingStorage}
              className="text-xs border-border bg-card text-muted-foreground hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearScraperStorage}
              disabled={isClearingStorage}
              className="text-xs"
            >
              {isClearingStorage ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("settings.library.clearStorageConfirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
