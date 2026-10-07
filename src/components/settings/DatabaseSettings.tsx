import React, { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { 
  Database, Download, RefreshCw, ShieldCheck, Table2, Wrench, 
  FolderOpen, Copy, Check, Clock, AlertTriangle, CheckCircle2, 
  XCircle, FileCode, Play, Terminal, Trash2, RotateCcw, 
  Sparkles, ExternalLink, HardDrive, ListFilter, ArrowUpDown, 
  Layers, Search, FileSpreadsheet, Eye
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SettingsSection } from "./SettingsSection"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"

type TableInfo = {
  name: string
  rows: number
  columns: Array<{ name: string; type: string; nullable: boolean; primaryKey: boolean; defaultValue: unknown }>
  indexes: Array<{ name: string; unique: boolean; columns: string[] }>
  sql: string | null
}

type Overview = {
  path: string
  schemaVersion: number
  expectedSchemaVersion: number
  sqliteVersion: string
  journalMode: string
  health: string
  lastIntegrityCheck: string | null
  size: number
  walSize: number
  tableCount: number
  indexCount: number
  triggerCount: number
  viewCount: number
  itemCount: number | null
  tables: string[]
  largestTables: Array<{ name: string; rowCount: number }>
  scheduleStatus: any
  recentOperations: any[]
}

type Tab = "overview" | "tables" | "query" | "backup" | "maintenance"

const api = () => window.rtLibrary?.database

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const formatRelativeTime = (isoString: string | null, t: (key: string, vars?: any) => string) => {
  if (!isoString) return t("itemDetail.timeNever")
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t("itemDetail.timeJustNow")
  if (mins < 60) return t("itemDetail.timeMinutesAgo", { minutes: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("itemDetail.timeHoursAgo", { hours })
  const days = Math.floor(hours / 24)
  return t("itemDetail.timeDaysAgo", { days })
}

const QUERY_PRESETS = [
  { key: "summary", labelKey: "presetDatabaseSummary", sql: "SELECT type, COUNT(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' GROUP BY type ORDER BY type" },
  { key: "noCovers", labelKey: "presetItemsWithoutCovers", sql: "SELECT id, category_id, title FROM items WHERE cover_url IS NULL OR cover_url = '' LIMIT 50" },
  { key: "noScreenshots", labelKey: "presetItemsWithoutScreenshots", sql: "SELECT i.id, i.title FROM items i LEFT JOIN item_details d ON i.id = d.id WHERE d.screenshots_json IS NULL OR d.screenshots_json = '[]' LIMIT 50" },
  { key: "noMagnet", labelKey: "presetItemsWithoutMagnet", sql: "SELECT id, title, category_id FROM items WHERE magnet_url IS NULL OR magnet_url = '' LIMIT 50" },
  { key: "noInfoHash", labelKey: "presetItemsWithoutInfoHash", sql: "SELECT id, title, category_id FROM items WHERE info_hash IS NULL OR info_hash = '' LIMIT 50" },
  { key: "dupInfoHash", labelKey: "presetDuplicateInfoHash", sql: "SELECT info_hash, COUNT(*) AS copies FROM items WHERE info_hash IS NOT NULL AND info_hash != '' GROUP BY info_hash HAVING COUNT(*) > 1 ORDER BY copies DESC LIMIT 50" },
  { key: "largestItems", labelKey: "presetLargestItems", sql: "SELECT id, title, size_bytes, ROUND(size_bytes / 1073741824.0, 2) AS size_gb FROM items WHERE size_bytes IS NOT NULL ORDER BY size_bytes DESC LIMIT 50" },
  { key: "perCategory", labelKey: "presetItemsPerCategory", sql: "SELECT c.id, c.name, COUNT(i.id) AS total_items FROM categories c LEFT JOIN items i ON c.id = i.category_id GROUP BY c.id ORDER BY total_items DESC" },
  { key: "recentItems", labelKey: "presetRecentItems", sql: "SELECT id, title, created_at FROM items ORDER BY created_at DESC LIMIT 50" },
  { key: "missingSwarm", labelKey: "presetMissingTorrentMetadata", sql: "SELECT i.id, i.title FROM items i LEFT JOIN torrent_metadata m ON i.id = m.id WHERE m.id IS NULL AND i.magnet_url IS NOT NULL LIMIT 50" },
]

export const DatabaseSettings: React.FC = () => {
  const { t, formatNumber } = useI18n()
  const [tab, setTab] = useState<Tab>("overview")
  const [overview, setOverview] = useState<Overview | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [tableFilter, setTableFilter] = useState("")
  const [selected, setSelected] = useState("")
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<50 | 100 | 200>(50)
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [orderBy, setOrderBy] = useState("")
  const [descending, setDescending] = useState(false)
  const [searchColumn, setSearchColumn] = useState("")
  const [searchValue, setSearchValue] = useState("")
  const [selectedRowDetail, setSelectedRowDetail] = useState<any | null>(null)

  // Query Console State
  const [sql, setSql] = useState("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY type, name LIMIT 50")
  const [queryResult, setQueryResult] = useState<any>(null)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [isExplaining, setIsExplaining] = useState(false)

  // Backup & Restore State
  const [scheduleConfig, setScheduleConfig] = useState<any>(null)
  const [backupHistory, setBackupHistory] = useState<any[]>([])
  const [restorePhrase, setRestorePhrase] = useState("")
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<any | null>(null)

  // Maintenance & General Status
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState("")
  const [checkResult, setCheckResult] = useState<any>(null)
  const [cleanupReport, setCleanupReport] = useState<any>(null)

  const loadSummary = async () => {
    const bridge = api()
    if (!bridge) return
    try {
      const [nextOverview, nextTables, nextSchedule, nextHistory] = await Promise.all([
        bridge.getOverview(),
        bridge.getTables(),
        bridge.getBackupSchedule?.() || null,
        bridge.getBackupHistory?.() || [],
      ])
      setOverview(nextOverview)
      setTables(nextTables)
      setScheduleConfig(nextSchedule)
      setBackupHistory(nextHistory)
      setSelected((current) => current && nextTables.some((t: TableInfo) => t.name === current) ? current : nextTables[0]?.name || "")
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  const filteredTables = useMemo(() => {
    if (!tableFilter.trim()) return tables
    return tables.filter((t) => t.name.toLowerCase().includes(tableFilter.toLowerCase()))
  }, [tables, tableFilter])

  const table = useMemo(() => tables.find((item) => item.name === selected), [tables, selected])

  const loadTableRows = () => {
    if (!selected || !api()) return
    api()!.getRows({
      table: selected,
      limit: pageSize,
      offset: page * pageSize,
      orderBy,
      order: descending ? "desc" : "asc",
      searchColumn: searchColumn || undefined,
      searchValue: searchValue || undefined,
    })
      .then((result) => {
        setRows(result.rows)
        setTotal(result.total)
      })
      .catch((error) => toast.error(error.message))
  }

  useEffect(() => {
    loadTableRows()
  }, [selected, page, pageSize, orderBy, descending, searchColumn, searchValue])

  // Overview Actions
  const runCheck = async (full: boolean) => {
    setBusy(true)
    setBusyMessage(full ? t("settings.database.fullCheck") : t("settings.database.quickCheck"))
    try {
      const result = await api()?.integrityCheck(full)
      setCheckResult(result)
      toast.success(t("settings.database.checkDone"))
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
      setBusyMessage("")
    }
  }

  const handleCopyPath = () => {
    if (!overview?.path) return
    navigator.clipboard.writeText(overview.path)
    toast.success(t("settings.database.pathCopied"))
  }

  const handleOpenFolder = async (targetPath?: string) => {
    try {
      await api()?.openFolder(targetPath)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const runRecommendedMaintenance = async () => {
    setBusy(true)
    setBusyMessage(t("settings.database.maintenanceRunning"))
    try {
      const opt = await api()?.optimize()
      const chk = await api()?.checkpoint()
      toast.success(t("settings.database.optimizeDone", { duration: opt?.durationMs || 0 }))
      if (chk) {
        toast.info(t("settings.database.checkpointDone", { before: formatBytes(chk.before || 0), after: formatBytes(chk.after || 0) }))
      }
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
      setBusyMessage("")
    }
  }

  // Table Export
  const handleExportTable = async (format: "csv" | "json") => {
    if (!selected || !api()) return
    setBusy(true)
    try {
      const res = await api()?.exportTable({ table: selected, format })
      if (res && !res.canceled) {
        toast.success(t("settings.database.exportSuccess", { count: formatNumber(res.totalRows || 0) }))
      }
    } catch (error: any) {
      toast.error(t("settings.database.exportError", { error: error.message }))
    } finally {
      setBusy(false)
    }
  }

  // Query Console Actions
  const runQuery = async (explain = false) => {
    if (!sql.trim()) return
    setBusy(true)
    setIsExplaining(explain)
    try {
      const result = await (explain ? api()?.explainQuery(sql) : api()?.executeReadQuery(sql))
      setQueryResult(result)
      if (!queryHistory.includes(sql)) {
        setQueryHistory((prev) => [sql, ...prev].slice(0, 20))
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleCopyResults = () => {
    if (!queryResult?.rows) return
    navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2))
    toast.success(t("settings.database.resultsCopied"))
  }

  const handleExportResultsCsv = () => {
    if (!queryResult?.rows || !queryResult?.columns) return
    const columns = queryResult.columns
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return ""
      const str = typeof val === "object" ? JSON.stringify(val) : String(val)
      if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
      return str
    }
    const lines = [columns.map(escapeCsv).join(",")]
    for (const row of queryResult.rows) {
      lines.push(columns.map((c: string) => escapeCsv(row[c])).join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Backup & Schedule Actions
  const handleSaveSchedule = async (partialConfig: any) => {
    try {
      const updated = await api()?.saveBackupSchedule(partialConfig)
      setScheduleConfig(updated)
      toast.success(t("settings.database.scheduleSaved"))
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleSelectBackupDirectory = async () => {
    try {
      const res = await api()?.selectBackupDirectory()
      if (res && !res.canceled && res.directory) {
        await handleSaveSchedule({ destinationDir: res.directory })
      }
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const createBackup = async (useSaveDialog = false) => {
    setBusy(true)
    try {
      const result = await api()?.createBackup({ useSaveDialog })
      if (result && !result.canceled) {
        toast.success(t("settings.database.backupDone", { size: formatBytes(result.size || 0) }))
        await loadSummary()
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyBackup = async (filePath: string) => {
    setBusy(true)
    try {
      const res = await api()?.verifyBackup(filePath)
      if (res?.valid) {
        toast.success(t("settings.database.verifySuccess", { version: res.schemaVersion, items: formatNumber(res.itemCount || 0) }))
      } else {
        toast.error(t("settings.database.verifyFailed", { error: JSON.stringify(res?.integrityCheck || "Integrity error") }))
      }
    } catch (error: any) {
      toast.error(t("settings.database.verifyFailed", { error: error.message }))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteBackup = async (filePath: string) => {
    if (!window.confirm(t("settings.database.deleteBackupConfirm"))) return
    setBusy(true)
    try {
      await api()?.deleteBackup(filePath)
      toast.success(t("settings.database.deleteSuccess"))
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const restoreBackup = async (filePath?: string) => {
    setBusy(true)
    try {
      const result = await api()?.restoreBackup(filePath)
      if (result?.success) {
        toast.success(t("settings.database.restoreDone"))
        setRestorePhrase("")
        setSelectedBackupForRestore(null)
        await loadSummary()
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  // Maintenance Actions
  const handleMaintenance = async (action: "checkpoint" | "optimize" | "vacuum") => {
    setBusy(true)
    try {
      if (action === "checkpoint") {
        const result = await api()?.checkpoint()
        toast.success(t("settings.database.checkpointDone", { before: formatBytes(result?.before || 0), after: formatBytes(result?.after || 0) }))
      } else if (action === "optimize") {
        const result = await api()?.optimize()
        toast.success(t("settings.database.optimizeDone", { duration: result?.durationMs || 0 }))
      } else if (action === "vacuum") {
        const result = await api()?.runVacuum()
        toast.success(t("settings.database.vacuumSuccess", { duration: result?.durationMs || 0 }))
      }
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleScanCleanup = async () => {
    setBusy(true)
    try {
      const report = await api()?.runDataCleanup({ execute: false })
      setCleanupReport(report)
      if (report?.totalProblems === 0) {
        toast.success(t("settings.database.noProblemsFound"))
      } else {
        toast.warning(t("settings.database.problemsFound", { count: report.totalProblems, details: report.orphanDetails, metadata: report.orphanMetadata, favorites: report.invalidFavorites }))
      }
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleExecuteCleanup = async () => {
    setBusy(true)
    try {
      const result = await api()?.runDataCleanup({ execute: true })
      setCleanupReport(null)
      toast.success(t("settings.database.cleanupSuccess", { count: result.totalDeleted || 0 }))
      await loadSummary()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  const tabs: Array<[Tab, string, any]> = [
    ["overview", t("settings.database.overview"), Database],
    ["tables", t("settings.database.tables"), Table2],
    ["query", t("settings.database.query"), Terminal],
    ["backup", t("settings.database.backup"), Download],
    ["maintenance", t("settings.database.maintenance"), Wrench],
  ]

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Top Tab Strip */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2.5" role="tablist" aria-label={t("settings.database.title")}>
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              tab === key
                ? "bg-secondary text-primary font-semibold shadow-xs border border-border/70"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* TAB 1: OVERVIEW */}
      {/* ============================================================ */}
      {tab === "overview" && (
        <div className="space-y-4">
          <SettingsSection
            icon={Database}
            title={t("settings.database.title")}
            action={
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => loadSummary()} disabled={busy}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1", busy && "animate-spin")} />
                  {t("settings.database.refresh")}
                </Button>
              </div>
            }
          >
            {overview ? (
              <div className="space-y-4 pt-1">
                {/* 1. Top Metrics Strip (4 Balanced Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Metric 1: Health */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 flex flex-col justify-between space-y-2 shadow-xs">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      {t("settings.database.health")}
                    </span>
                    <div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider",
                          overview.health === "Healthy"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : overview.health === "Warning"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-destructive/10 text-destructive border border-destructive/20"
                        )}
                      >
                        {t(({
                          Healthy: "settings.database.healthHealthy",
                          Warning: "settings.database.healthWarning",
                          Corrupted: "settings.database.healthCorrupted",
                          "Read-only": "settings.database.healthReadOnly"
                        } as any)[overview.health] || "settings.database.healthHealthy")}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-1 font-mono">
                        v{overview.schemaVersion} · SQLite {overview.sqliteVersion}
                      </span>
                    </div>
                  </div>

                  {/* Metric 2: Total Storage */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 flex flex-col justify-between space-y-2 shadow-xs">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                      <HardDrive className="h-3.5 w-3.5 text-primary" />
                      {t("settings.database.totalSize")}
                    </span>
                    <div>
                      <span className="text-base font-bold font-mono text-foreground block">
                        {formatBytes(overview.size + overview.walSize)}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5 font-mono">
                        {formatBytes(overview.size)} DB · {formatBytes(overview.walSize)} WAL
                      </span>
                    </div>
                  </div>

                  {/* Metric 3: Items & Tables */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 flex flex-col justify-between space-y-2 shadow-xs">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                      <Database className="h-3.5 w-3.5 text-primary" />
                      {t("settings.database.items")}
                    </span>
                    <div>
                      <span className="text-base font-bold font-mono text-emerald-400 block">
                        {formatNumber(overview.itemCount || 0)}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5 font-mono">
                        {overview.tableCount} {t("settings.database.tableCount").toLowerCase()} · {overview.indexCount} {t("settings.database.indexCount").toLowerCase()}
                      </span>
                    </div>
                  </div>

                  {/* Metric 4: Backup Status */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 flex flex-col justify-between space-y-2 shadow-xs">
                    <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                      <Download className="h-3.5 w-3.5 text-primary" />
                      {t("settings.database.backup")}
                    </span>
                    <div>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                          overview.scheduleStatus?.enabled
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-secondary text-muted-foreground border border-border/60"
                        )}
                      >
                        {overview.scheduleStatus?.enabled ? t("settings.database.typeScheduled") : t("settings.database.manual")}
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-1 font-mono truncate">
                        {t("settings.database.lastBackup")} {formatRelativeTime(overview.scheduleStatus?.lastRun, t)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Main 2-Column Action Panels */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Left Panel: Health Diagnostics & Quick Maintenance */}
                  <div className="p-4 rounded-xl border border-border/80 bg-background/60 space-y-3.5 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-border/60">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {t("settings.database.healthCardTitle")}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {overview.journalMode.toUpperCase()} Mode
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.schema")}</span>
                        <span className="font-semibold text-foreground">v{overview.schemaVersion}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.sqlite")}</span>
                        <span className="font-semibold text-foreground">{overview.sqliteVersion}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.journal")}</span>
                        <span className="font-semibold text-primary">{overview.journalMode.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.lastCheck")}</span>
                        <span className="font-medium text-foreground truncate block">
                          {formatRelativeTime(overview.lastIntegrityCheck, t)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs flex-1 gap-1" disabled={busy} onClick={() => runCheck(false)}>
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          {t("settings.database.quickCheck")}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs flex-1 gap-1" disabled={busy} onClick={() => runCheck(true)}>
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          {t("settings.database.fullCheck")}
                        </Button>
                      </div>
                      <Button size="sm" variant="secondary" className="w-full h-8 text-xs gap-1.5 border border-border/60" disabled={busy} onClick={runRecommendedMaintenance}>
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {t("settings.database.recommendedMaintenance")}
                      </Button>
                    </div>
                  </div>

                  {/* Right Panel: Backup & Protection Overview */}
                  <div className="p-4 rounded-xl border border-border/80 bg-background/60 space-y-3.5 shadow-xs">
                    <div className="flex items-center justify-between pb-1 border-b border-border/60">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Download className="h-4 w-4 text-primary" />
                        {t("settings.database.backupCardTitle")}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {overview.scheduleStatus?.enabled ? t("settings.database.typeScheduled") : t("settings.database.manual")}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.lastBackup")}</span>
                        <span className="font-medium text-foreground truncate block">
                          {formatRelativeTime(overview.scheduleStatus?.lastRun, t)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.nextRunLabel")}</span>
                        <span className="font-medium text-foreground truncate block">
                          {overview.scheduleStatus?.enabled && overview.scheduleStatus?.nextRun
                            ? new Date(overview.scheduleStatus.nextRun).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t("settings.database.retentionTitle")}</span>
                        <span className="text-xs text-foreground font-semibold">
                          {t("settings.database.keepBackups", { count: overview.scheduleStatus?.retentionCount || 7 })}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" className="h-8 text-xs flex-1 gap-1.5 shadow-xs" disabled={busy} onClick={() => createBackup(false)}>
                          <Download className="h-3.5 w-3.5" />
                          {t("settings.database.createBackup")}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs flex-1 gap-1" onClick={() => setTab("backup")}>
                          <FolderOpen className="h-3.5 w-3.5" />
                          {t("settings.database.viewBackups")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Database Path Bar */}
                <div className="flex flex-wrap items-center justify-between p-3.5 rounded-xl border border-border/80 bg-card/60 gap-3 shadow-xs">
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-muted-foreground block font-semibold uppercase tracking-wider">
                      {t("settings.database.path")}
                    </span>
                    <span className="text-xs font-mono text-foreground break-all select-all">
                      {overview.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleCopyPath}>
                      <Copy className="h-3.5 w-3.5" />
                      {t("settings.database.copyPath")}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => handleOpenFolder(overview.path)}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t("settings.database.openFolder")}
                    </Button>
                  </div>
                </div>

                {/* 4. Largest Tables & Recent Operations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Largest Tables */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2.5 shadow-xs">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>{t("settings.database.largestTables")}</span>
                      <span className="text-[10px] font-mono text-muted-foreground font-normal">
                        {overview.largestTables.length} {t("settings.database.tables").toLowerCase()}
                      </span>
                    </span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {overview.largestTables.map((tbl) => (
                        <div key={tbl.name} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-card/60 border border-border/50 font-mono">
                          <span className="font-semibold text-foreground truncate">{tbl.name}</span>
                          <span className="text-muted-foreground shrink-0 ml-2 text-[11px] bg-secondary px-2 py-0.5 rounded border border-border/50">
                            {formatNumber(tbl.rowCount)} {t("settings.database.rows")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Operations */}
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2.5 shadow-xs">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>{t("settings.database.recentOperations")}</span>
                      <span className="text-[10px] font-mono text-muted-foreground font-normal">
                        {overview.recentOperations?.length || 0}
                      </span>
                    </span>
                    {overview.recentOperations && overview.recentOperations.length > 0 ? (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {overview.recentOperations.map((op: any) => (
                          <div key={op.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-card/60 border border-border/50 font-mono">
                            <div className="truncate">
                              <span className="font-semibold uppercase text-primary text-[10px] mr-1.5 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                                {op.type}
                              </span>
                              <span className="text-foreground text-[11px]">{op.status || "done"}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {formatRelativeTime(op.timestamp, t)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-6 text-center font-mono">
                        {t("settings.database.noRecentOperations")}
                      </p>
                    )}
                  </div>
                </div>

                {/* 5. Check Results Display */}
                {checkResult && (
                  <div className="p-3.5 rounded-xl border border-border bg-background space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        {t("settings.database.integrity")}: {checkResult.check}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setCheckResult(null)}>
                        ✕
                      </Button>
                    </div>
                    <pre className="text-[11px] font-mono p-2.5 rounded-lg bg-secondary/60 max-h-36 overflow-auto custom-scrollbar">
                      {JSON.stringify(checkResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6">{t("settings.database.loading")}</p>
            )}
          </SettingsSection>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: TABLES */}
      {/* ============================================================ */}
      {tab === "tables" && (
        <SettingsSection icon={Table2} title={t("settings.database.tables")}>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 pt-1">
            {/* Table Selector Sidebar */}
            <div className="space-y-2 border-r border-border pr-3">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder={t("settings.database.searchTables")}
                  className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-border bg-background text-xs"
                />
              </div>

              <div className="max-h-[480px] overflow-y-auto space-y-1 custom-scrollbar">
                {filteredTables.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => {
                      setSelected(item.name)
                      setPage(0)
                      setOrderBy("")
                      setSearchColumn("")
                      setSearchValue("")
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-all",
                      selected === item.name
                        ? "bg-secondary text-primary font-semibold shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <span className="font-mono truncate">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5 font-mono bg-secondary px-1.5 py-0.5 rounded border border-border/60">
                      {formatNumber(item.rows)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Table Content Area */}
            <div className="min-w-0 space-y-3">
              {table && (
                <>
                  {/* Table Stats & Actions Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-border/80 bg-card/60">
                    <div className="text-xs font-mono text-muted-foreground">
                      <span className="font-bold text-foreground text-sm mr-2">{table.name}</span>
                      <span>{formatNumber(table.rows)} {t("settings.database.rows")}</span> ·{" "}
                      <span>{table.columns.length} {t("settings.database.columns")}</span> ·{" "}
                      <span>{table.indexes.length} {t("settings.database.indexes")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleExportTable("csv")}>
                        <FileSpreadsheet className="h-3 w-3" />
                        {t("settings.database.exportCsv")}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleExportTable("json")}>
                        <FileCode className="h-3 w-3" />
                        {t("settings.database.exportJson")}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={loadTableRows}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* In-Table Search Bar */}
                  <div className="flex items-center gap-2">
                    <select
                      value={searchColumn}
                      onChange={(e) => {
                        setSearchColumn(e.target.value)
                        setPage(0)
                      }}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-mono"
                    >
                      <option value="">{t("settings.database.allColumns")}</option>
                      {table.columns.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => {
                        setSearchValue(e.target.value)
                        setPage(0)
                      }}
                      placeholder={t("settings.database.searchInTable")}
                      className="h-8 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs font-mono"
                    />
                    {searchValue && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSearchValue("")}>
                        Clear
                      </Button>
                    )}
                  </div>

                  {/* Schema Columns Pill Bar */}
                  <div className="p-2 rounded-lg border border-border bg-background/50 text-[11px] font-mono flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {table.columns.map((col) => (
                      <span key={col.name} className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border/60 text-foreground">
                        {col.name} <span className="text-muted-foreground">{col.type || "TEXT"}{col.primaryKey ? " [PK]" : ""}</span>
                      </span>
                    ))}
                  </div>

                  {/* Data Grid Table */}
                  <div className="overflow-x-auto rounded-xl border border-border/80 bg-background max-h-[380px] custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-secondary/90 backdrop-blur z-10 border-b border-border">
                        <tr>
                          {table.columns.map((col) => (
                            <th key={col.name} className="whitespace-nowrap px-3 py-2 font-mono">
                              <button
                                onClick={() => {
                                  setOrderBy(col.name)
                                  setDescending(orderBy === col.name ? !descending : false)
                                  setPage(0)
                                }}
                                className="flex items-center gap-1 font-semibold hover:text-primary transition-colors"
                              >
                                {col.name}
                                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                                {orderBy === col.name && (descending ? " ↓" : " ↑")}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length > 0 ? (
                          rows.map((row, idx) => (
                            <tr
                              key={idx}
                              onClick={() => setSelectedRowDetail(row)}
                              className="border-t border-border/50 hover:bg-secondary/40 cursor-pointer transition-colors"
                            >
                              {table.columns.map((col) => {
                                const val = row[col.name]
                                const isNull = val === null || val === undefined
                                const text = isNull ? "NULL" : typeof val === "object" ? JSON.stringify(val) : String(val)
                                return (
                                  <td
                                    key={col.name}
                                    title={text}
                                    className="max-w-64 truncate px-3 py-1.5 font-mono"
                                  >
                                    {isNull ? (
                                      <span className="px-1 py-0.2 rounded bg-muted/60 text-[10px] text-muted-foreground">
                                        NULL
                                      </span>
                                    ) : (
                                      text
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={table.columns.length} className="text-center py-6 text-muted-foreground">
                              {t("settings.database.noRowsFound")}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="flex items-center justify-between text-xs font-mono pt-1">
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={t("settings.database.pageSize")}
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value) as 50 | 100 | 200)
                          setPage(0)
                        }}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={200}>200 / page</option>
                      </select>
                      <span className="text-muted-foreground">
                        {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {formatNumber(total)}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
                        {t("settings.database.previous")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((v) => v + 1)}>
                        {t("settings.database.next")}
                      </Button>
                    </div>
                  </div>

                  {/* Collapsible Schema SQL */}
                  <details className="text-xs pt-1">
                    <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                      {t("settings.database.schemaSql")}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-background border border-border p-3 font-mono text-[11px] max-h-48 overflow-auto">
                      {table.sql}
                    </pre>
                  </details>
                </>
              )}
            </div>
          </div>

          {/* Row Detail Dialog / Drawer */}
          {selectedRowDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h3 className="text-sm font-bold text-foreground font-mono flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    {t("settings.database.rowDetail")} ({selected})
                  </h3>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedRowDetail(null)}>
                    ✕
                  </Button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 custom-scrollbar">
                  {Object.entries(selectedRowDetail).map(([k, v]) => {
                    const strVal = v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)
                    return (
                      <div key={k} className="p-2.5 rounded-lg border border-border/60 bg-background/60 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-primary font-mono">{k}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1 px-2"
                            onClick={() => {
                              navigator.clipboard.writeText(strVal)
                              toast.success(t("settings.database.cellCopied"))
                            }}
                          >
                            <Copy className="h-2.5 w-2.5" />
                            {t("settings.database.copyCell")}
                          </Button>
                        </div>
                        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all max-h-36 overflow-auto">
                          {strVal}
                        </pre>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </SettingsSection>
      )}

      {/* ============================================================ */}
      {/* TAB 3: QUERY CONSOLE */}
      {/* ============================================================ */}
      {tab === "query" && (
        <SettingsSection
          icon={Terminal}
          title={t("settings.database.query")}
          description={t("settings.database.querySafeNote")}
        >
          <div className="space-y-3 pt-1">
            {/* Presets & History Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                  {t("settings.database.presets")}
                </span>
                <select
                  onChange={(e) => {
                    const found = QUERY_PRESETS.find((p) => p.key === e.target.value)
                    if (found) setSql(found.sql)
                  }}
                  className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono"
                  defaultValue=""
                >
                  <option value="" disabled>{t("settings.database.selectPreset")}</option>
                  {QUERY_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{t(`settings.database.${p.labelKey}`)}</option>
                  ))}
                </select>
              </div>
              {queryHistory.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                    {t("settings.database.queryHistory")}
                  </span>
                  <select
                    onChange={(e) => setSql(e.target.value)}
                    className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono truncate"
                    defaultValue=""
                  >
                    <option value="" disabled>{t("settings.database.queryHistory")} ({queryHistory.length})</option>
                    {queryHistory.map((q, idx) => (
                      <option key={idx} value={q}>{q.slice(0, 60)}…</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* SQL Textarea */}
            <div className="space-y-1">
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    if (e.shiftKey) runQuery(true)
                    else runQuery(false)
                  }
                }}
                aria-label={t("settings.database.query")}
                rows={4}
                className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs focus:outline-none focus:border-primary"
              />
              <span className="text-[10px] text-muted-foreground font-mono block text-right">
                {t("settings.database.runShortcutHint")}
              </span>
            </div>

            {/* Execution Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => runQuery(false)} className="gap-1.5 shadow-xs">
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {t("settings.database.runQuery")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runQuery(true)}>
                  {t("settings.database.explain")}
                </Button>
              </div>

              {queryResult?.rows && queryResult.rows.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleCopyResults}>
                    <Copy className="h-3 w-3" />
                    {t("settings.database.copyResults")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportResultsCsv}>
                    <FileSpreadsheet className="h-3 w-3" />
                    {t("settings.database.exportResultsCsv")}
                  </Button>
                </div>
              )}
            </div>

            {/* Query Results */}
            {queryResult && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-card/60 border border-border">
                  <span className="font-semibold text-foreground">
                    {isExplaining ? t("settings.database.queryPlan") : t("settings.database.queryStats", { rows: queryResult.rowCount, time: queryResult.executionTimeMs })}
                  </span>
                  {queryResult.truncated && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-semibold">
                      Max 500 rows limit reached
                    </span>
                  )}
                </div>

                <div className="max-h-80 overflow-auto rounded-xl border border-border bg-background custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-secondary border-b border-border font-mono">
                      <tr>
                        {queryResult.columns.map((column: string) => (
                          <th className="px-3 py-2 whitespace-nowrap" key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row: any, index: number) => (
                        <tr className="border-t border-border/50 hover:bg-secondary/30" key={index}>
                          {queryResult.columns.map((column: string) => {
                            const val = row[column]
                            const text = val === null || val === undefined ? "NULL" : typeof val === "object" ? JSON.stringify(val) : String(val)
                            return (
                              <td className="max-w-64 truncate px-3 py-1.5 font-mono" key={column} title={text}>
                                {val === null ? <span className="text-muted-foreground">NULL</span> : text}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </SettingsSection>
      )}

      {/* ============================================================ */}
      {/* TAB 4: BACKUP & RESTORE */}
      {/* ============================================================ */}
      {tab === "backup" && (
        <div className="space-y-4">
          {/* Automatic Scheduled Backup Card */}
          <SettingsSection
            icon={Clock}
            title={t("settings.database.autoBackups")}
            description={t("settings.database.autoBackupsDesc")}
          >
            <div className="space-y-3 pt-1">
              {/* Enable Switch */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-background/60">
                <div>
                  <span className="text-xs font-semibold text-foreground block">
                    {t("settings.database.autoBackups")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {scheduleConfig?.timezone ? `${t("settings.database.timezoneLabel")} ${scheduleConfig.timezone}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{scheduleConfig?.enabled ? "ON" : "OFF"}</span>
                  <Switch
                    checked={Boolean(scheduleConfig?.enabled)}
                    onCheckedChange={(enabled) => handleSaveSchedule({ enabled })}
                  />
                </div>
              </div>

              {scheduleConfig?.enabled && (
                <div className="space-y-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5">
                  {/* Preset Selector */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-foreground block">
                      {t("settings.database.schedulePreset")}
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5">
                      {[
                        { key: "6h", label: t("settings.database.preset6h") },
                        { key: "12h", label: t("settings.database.preset12h") },
                        { key: "daily", label: t("settings.database.presetDaily") },
                        { key: "weekly", label: t("settings.database.presetWeekly") },
                        { key: "monthly", label: t("settings.database.presetMonthly") },
                        { key: "custom", label: "Custom Cron" },
                      ].map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => handleSaveSchedule({ scheduleType: p.key })}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-center",
                            scheduleConfig.scheduleType === p.key
                              ? "bg-card text-foreground font-semibold shadow-xs border border-border/60"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Cron Input */}
                  {scheduleConfig.scheduleType === "custom" && (
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-muted-foreground block">
                        {t("settings.database.cronExpression")}
                      </span>
                      <input
                        type="text"
                        value={scheduleConfig.cronExpression || "0 3 * * *"}
                        onChange={(e) => setScheduleConfig({ ...scheduleConfig, cronExpression: e.target.value })}
                        onBlur={() => handleSaveSchedule({ cronExpression: scheduleConfig.cronExpression })}
                        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-mono"
                      />
                    </div>
                  )}

                  {/* Retention and Next Run */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-xs font-semibold text-foreground block mb-1">
                        {t("settings.database.retentionTitle")}
                      </span>
                      <select
                        value={scheduleConfig.retentionCount || 7}
                        onChange={(e) => handleSaveSchedule({ retentionCount: Number(e.target.value) })}
                        className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-mono w-full"
                      >
                        {[3, 5, 7, 10, 14, 20, 30].map((n) => (
                          <option key={n} value={n}>{t("settings.database.keepBackups", { count: n })}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-foreground block mb-1">
                        {t("settings.database.nextRunLabel")}
                      </span>
                      <div className="h-8 rounded-lg border border-border bg-card/60 px-3 flex items-center text-xs font-mono font-medium text-foreground">
                        {scheduleConfig.nextRun ? new Date(scheduleConfig.nextRun).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Missed backup on launch switch */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs font-medium text-foreground block">
                        {t("settings.database.runMissedOnLaunch")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {t("settings.database.runMissedOnLaunchDesc")}
                      </span>
                    </div>
                    <Switch
                      checked={Boolean(scheduleConfig.runMissedOnLaunch)}
                      onCheckedChange={(runMissedOnLaunch) => handleSaveSchedule({ runMissedOnLaunch })}
                    />
                  </div>

                  {/* Backup Destination Location */}
                  <div className="flex flex-wrap items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                        {t("settings.database.backupLocation")}
                      </span>
                      <span className="text-xs font-mono text-foreground break-all">
                        {scheduleConfig.destinationDir || scheduleConfig.defaultDestinationDir}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSelectBackupDirectory}>
                        {t("settings.database.changeFolder")}
                      </Button>
                      {scheduleConfig.destinationDir && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSaveSchedule({ destinationDir: null })}>
                          {t("settings.database.resetDefault")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SettingsSection>

          {/* Manual Backup Action */}
          <SettingsSection
            icon={Download}
            title={t("settings.database.createBackupNow")}
            description={t("settings.database.backupDescription")}
          >
            <div className="flex flex-wrap gap-2 pt-1">
              <Button disabled={busy} onClick={() => createBackup(false)} className="gap-1.5 shadow-xs">
                <Download className="h-4 w-4" />
                {t("settings.database.createBackup")}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => createBackup(true)}>
                Save As…
              </Button>
            </div>
          </SettingsSection>

          {/* Backup History Table */}
          <SettingsSection
            icon={HardDrive}
            title={t("settings.database.backupHistoryTitle")}
          >
            <div className="pt-1">
              {backupHistory.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border bg-background custom-scrollbar">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-secondary/80 border-b border-border">
                      <tr>
                        <th className="px-3 py-2">{t("settings.database.historyFileName")}</th>
                        <th className="px-3 py-2">{t("settings.database.historyDate")}</th>
                        <th className="px-3 py-2">{t("settings.database.historyType")}</th>
                        <th className="px-3 py-2">{t("settings.database.historySize")}</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupHistory.map((item) => (
                        <tr key={item.fileName} className="border-t border-border/50 hover:bg-secondary/30">
                          <td className="px-3 py-2 font-medium text-foreground max-w-56 truncate" title={item.filePath}>
                            {item.fileName}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(item.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                                item.type === "scheduled"
                                  ? "bg-primary/10 text-primary border border-primary/20"
                                  : item.type === "pre-restore"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-secondary text-foreground"
                              )}
                            >
                              {item.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatBytes(item.size)}
                          </td>
                          <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleVerifyBackup(item.filePath)}>
                              {t("settings.database.verifyBackup")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary" onClick={() => setSelectedBackupForRestore(item)}>
                              {t("settings.database.restoreThisBackup")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteBackup(item.filePath)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No backup files found in destination directory.
                </p>
              )}
            </div>
          </SettingsSection>

          {/* Restore Section */}
          <SettingsSection
            icon={RotateCcw}
            title={t("settings.database.restore")}
            description={t("settings.database.restoreDescription")}
            variant="danger"
          >
            <div className="space-y-3 pt-1">
              {selectedBackupForRestore ? (
                <div className="p-3 rounded-xl border border-destructive/40 bg-destructive/5 space-y-2">
                  <span className="text-xs font-bold text-foreground block">
                    Target Backup: <span className="font-mono text-primary">{selectedBackupForRestore.fileName}</span> ({formatBytes(selectedBackupForRestore.size)})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={restorePhrase}
                      onChange={(e) => setRestorePhrase(e.target.value)}
                      placeholder={t("settings.database.confirmWord")}
                      aria-label={t("settings.database.confirmRestore")}
                      className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy || restorePhrase !== "RESTORE"}
                      onClick={() => restoreBackup(selectedBackupForRestore.filePath)}
                    >
                      {t("settings.database.restore")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedBackupForRestore(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={restorePhrase}
                    onChange={(e) => setRestorePhrase(e.target.value)}
                    placeholder={t("settings.database.confirmWord")}
                    aria-label={t("settings.database.confirmRestore")}
                    className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy || restorePhrase !== "RESTORE"}
                    onClick={() => restoreBackup()}
                  >
                    Select File &amp; Restore
                  </Button>
                </div>
              )}
            </div>
          </SettingsSection>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 5: MAINTENANCE */}
      {/* ============================================================ */}
      {tab === "maintenance" && (
        <div className="space-y-4">
          <SettingsSection icon={Wrench} title={t("settings.database.maintenance")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Card 1: Optimize */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {t("settings.database.optimizeTitle")}
                  </span>
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.database.optimizeDesc")}
                </p>
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="w-full text-xs" disabled={busy} onClick={() => handleMaintenance("optimize")}>
                    {t("settings.database.optimize")}
                  </Button>
                </div>
              </div>

              {/* Card 2: Checkpoint WAL */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {t("settings.database.checkpointTitle")}
                  </span>
                  <HardDrive className="h-4 w-4 text-primary" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("settings.database.checkpointDesc")} (Current: {formatBytes(overview?.walSize || 0)})
                </p>
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="w-full text-xs" disabled={busy} onClick={() => handleMaintenance("checkpoint")}>
                    {t("settings.database.checkpoint")}
                  </Button>
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Card 3: Data Cleanup */}
          <SettingsSection icon={ShieldCheck} title={t("settings.database.dataCleanupTitle")} description={t("settings.database.dataCleanupDesc")}>
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={handleScanCleanup}>
                  {t("settings.database.scanProblems")}
                </Button>
                {cleanupReport && cleanupReport.totalProblems > 0 && (
                  <Button variant="destructive" size="sm" disabled={busy} onClick={handleExecuteCleanup}>
                    {t("settings.database.cleanProblems")}
                  </Button>
                )}
              </div>

              {cleanupReport && (
                <div className="p-3 rounded-xl border border-border bg-background/80 text-xs font-mono space-y-1">
                  <div>Orphan Details: {cleanupReport.orphanDetails}</div>
                  <div>Orphan Swarm Metadata: {cleanupReport.orphanMetadata}</div>
                  <div>Invalid Favorites: {cleanupReport.invalidFavorites}</div>
                  <div className="font-bold pt-1 text-foreground">Total Inconsistencies: {cleanupReport.totalProblems}</div>
                </div>
              )}
            </div>
          </SettingsSection>

          {/* Card 4: Advanced VACUUM */}
          <SettingsSection icon={AlertTriangle} title={t("settings.database.vacuumTitle")} description={t("settings.database.vacuumDesc")} variant="danger">
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-muted-foreground">
                {t("settings.database.vacuumWarning")}
              </p>
              <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => handleMaintenance("vacuum")}>
                {t("settings.database.runVacuum")}
              </Button>
            </div>
          </SettingsSection>
        </div>
      )}
    </div>
  )
}
