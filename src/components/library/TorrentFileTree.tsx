import React, { useState, useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FileText, Folder, HardDrive, Search, ArrowDownWideNarrow, ArrowUpNarrowWide, ArrowDownAZ } from "lucide-react"
import { useI18n } from "@/i18n"

interface TorrentFileTreeProps {
  files?: Array<{ name?: string; path: string; length?: number; size?: number | string; sizeBytes?: number }> | null
  totalSizeFormatted?: string
  status?: string
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) return "0 B"
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function extractDirName(pathStr: string, nameStr: string): string | null {
  if (!pathStr || !pathStr.includes("/")) return null
  const parts = pathStr.split("/")
  parts.pop()
  const dir = parts.join("/")
  if (!dir || dir === nameStr) return null
  return dir + "/"
}

function extractFileExtension(filename: string): string {
  if (!filename || !filename.includes(".")) return "FILE"
  const ext = filename.split(".").pop() || "FILE"
  if (ext.length > 8 || /\s/.test(ext)) return "FILE"
  return ext.toUpperCase()
}

type SortOption = "size_desc" | "size_asc" | "name_asc"

export const TorrentFileTree: React.FC<TorrentFileTreeProps> = ({
  files,
  totalSizeFormatted,
  status,
}) => {
  const { t, formatNumber } = useI18n()
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<SortOption>("size_desc")
  const parentRef = useRef<HTMLDivElement>(null)

  const isPending = status === "fetching" || status === "pending"

  const processedFiles = useMemo(() => {
    if (!files || !Array.isArray(files)) return []
    return files.map((file) => {
      const pathStr = file.path || file.name || ""
      const nameStr = file.name || pathStr.split("/").pop() || pathStr
      const dirPath = extractDirName(pathStr, nameStr)
      const rawLen = file.length ?? file.sizeBytes ?? (typeof file.size === "number" ? file.size : undefined)
      const fileLen = typeof rawLen === "number" && rawLen >= 0 ? rawLen : 0
      const displaySizeStr = typeof file.size === "string" && file.size ? file.size : formatBytes(fileLen)
      const extension = extractFileExtension(nameStr)

      return {
        path: pathStr,
        name: nameStr,
        dirPath,
        length: fileLen,
        displaySizeStr,
        extension,
      }
    })
  }, [files])

  const filteredAndSortedFiles = useMemo(() => {
    let result = processedFiles

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === "size_desc") {
        return b.length - a.length
      } else if (sortBy === "size_asc") {
        return a.length - b.length
      } else {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      }
    })
  }, [processedFiles, searchQuery, sortBy])

  const count = filteredAndSortedFiles.length
  const totalCount = processedFiles.length
  const useVirtualization = count > 100

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
    enabled: useVirtualization,
  })

  if (!files || files.length === 0) {
    return (
      <div className="border border-border rounded-2xl bg-card overflow-hidden text-xs shadow-lg">
        <div className="px-4 py-3 bg-secondary/50 border-b border-border flex items-center justify-between text-muted-foreground font-medium">
          <div className="flex items-center space-x-2">
            <Folder className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground uppercase tracking-wider text-xs">
              {t("itemDetail.torrentFilesTitle")}
            </span>
          </div>
        </div>
        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
          {isPending ? t("itemDetail.statusFetching") : t("itemDetail.noFilesAvailable")}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-2xl bg-card overflow-hidden text-xs shadow-lg">
      <div className="px-4 py-3 bg-secondary/50 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-muted-foreground font-medium">
        <div className="flex items-center space-x-2">
          <Folder className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground uppercase tracking-wider text-xs">
            {t("itemDetail.torrentFilesTitle")}
          </span>
          <span className="bg-secondary text-secondary-foreground text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
            {formatNumber(totalCount)} {totalCount === 1 ? t("common.item") : t("common.items")}
          </span>
        </div>

        {totalSizeFormatted && totalSizeFormatted !== "—" && (
          <div className="flex items-center space-x-1.5 text-foreground font-mono text-xs">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-primary">{totalSizeFormatted}</span>
          </div>
        )}
      </div>

      <div className="p-3 bg-secondary/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("itemDetail.searchFilesPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => setSortBy("size_desc")}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center space-x-1 transition-colors ${
              sortBy === "size_desc"
                ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
            title={t("itemDetail.sortSizeDesc")}
          >
            <ArrowDownWideNarrow className="h-3.5 w-3.5 mr-1" />
            {t("itemDetail.sortSizeDesc")}
          </button>
          <button
            onClick={() => setSortBy("size_asc")}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono flex items-center space-x-1 transition-colors ${
              sortBy === "size_asc"
                ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
            title={t("itemDetail.sortSizeAsc")}
          >
            <ArrowUpNarrowWide className="h-3.5 w-3.5 mr-1" />
            {t("itemDetail.sortSizeAsc")}
          </button>
          <button
            onClick={() => setSortBy("name_asc")}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-mono flex items-center space-x-1 transition-colors ${
              sortBy === "name_asc"
                ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
            title={t("itemDetail.sortNameAsc")}
          >
            <ArrowDownAZ className="h-3.5 w-3.5 mr-1" />
            {t("itemDetail.sortNameAsc")}
          </button>
        </div>
      </div>

      {searchQuery.trim() && (
        <div className="px-3 py-1.5 bg-secondary/20 border-b border-border/40 text-[11px] font-mono text-muted-foreground">
          {t("itemDetail.showingFilesFilter", { count: formatNumber(count), total: formatNumber(totalCount), query: searchQuery })}
        </div>
      )}

      {useVirtualization ? (
        <div
          ref={parentRef}
          className="max-h-[380px] overflow-y-auto custom-scrollbar"
          style={{ contain: "strict" }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const file = filteredAndSortedFiles[virtualRow.index]
      if (!file) return null
      return (
        <div
          key={virtualRow.index}
          className="px-3 py-2 flex items-center justify-between hover:bg-secondary/60 transition-colors border-b border-border/40 absolute left-0 top-0 w-full"
          style={{
            transform: `translateY(${virtualRow.start}px)`,
            height: `${virtualRow.size}px`,
          }}
        >
          <div className="flex items-start space-x-2 truncate pr-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="truncate min-w-0">
              <div className="flex items-center space-x-1.5 truncate">
                <span className="truncate text-foreground font-mono text-[11px]" title={file.path || ""}>
                  {file.name}
                </span>
                <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-secondary text-muted-foreground shrink-0">
                  {file.extension}
                </span>
              </div>
              {file.dirPath && (
                <div className="truncate text-muted-foreground/70 font-mono text-[10px]" title={file.dirPath}>
                  {file.dirPath}
                </div>
              )}
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
            {file.displaySizeStr}
          </span>
        </div>
      )
    })}
  </div>
</div>
) : (
<div className="max-h-[380px] overflow-y-auto divide-y divide-border/40 custom-scrollbar">
  {filteredAndSortedFiles.map((file, idx) => {
    if (!file) return null
    return (
      <div
        key={idx}
        className="px-3 py-2 flex items-center justify-between hover:bg-secondary/60 transition-colors"
      >
        <div className="flex items-start space-x-2 truncate pr-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="truncate min-w-0">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="truncate text-foreground font-mono text-[11px]" title={file.path || ""}>
                {file.name}
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-secondary text-muted-foreground shrink-0">
                {file.extension}
              </span>
            </div>
            {file.dirPath && (
              <div className="truncate text-muted-foreground/70 font-mono text-[10px]" title={file.dirPath}>
                {file.dirPath}
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
          {file.displaySizeStr}
        </span>
      </div>
    )
  })}
</div>
      )}
    </div>
  )
}
