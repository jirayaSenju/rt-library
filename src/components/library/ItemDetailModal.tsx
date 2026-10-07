import React, { useState, useEffect, useCallback, useMemo } from "react"
import { LibraryItem, TorrentMetadata } from "@/types"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { resolveImageUrl } from "@/utils/imageResolver"
import { uniqueScreenshotUrls, resolveScreenshotCandidates } from "@/services/screenshotResolver"
import { ScreenshotStatus, getScreenshotDiagnostics } from "@/services/screenshotLoader"
import { imageCacheService } from "@/services/imageCache"
import { openMagnetLink } from "@/services/magnetLauncher"
import { torrentMetadataService, TorrentMetadataRecord } from "@/services/torrentMetadata"
import { resolveTorrentDisplayData, formatBytes } from "@/utils/torrentSourceResolver"
import { ScreenshotLightbox } from "@/components/library/ScreenshotLightbox"
import { ItemDetailHeader } from "@/components/library/ItemDetailHeader"
import { ItemOverviewTab } from "@/components/library/ItemOverviewTab"
import { ItemScreenshotsTab } from "@/components/library/ItemScreenshotsTab"
import { ItemFilesTab } from "@/components/library/ItemFilesTab"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  LayoutList,
  ImageIcon,
  Folder,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

interface ItemDetailModalProps {
  item: LibraryItem | null
  isOpen: boolean
  onClose: () => void
  isFavorite: boolean
  onToggleFavorite: () => void
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  isFavorite,
  onToggleFavorite,
}) => {
  const { t, formatNumber } = useI18n()
  const [activeTab, setActiveTab] = useState<string>("overview")
  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [screenshotIndex, setScreenshotIndex] = useState<number | null>(null)
  const [modalScreenshots, setModalScreenshots] = useState<string[]>([])
  const [screenshotOwner, setScreenshotOwner] = useState<string | null>(null)
  const [screenshotStates, setScreenshotStates] = useState<Record<string, ScreenshotStatus>>({})
  const [screenshotsLoading, setScreenshotsLoading] = useState(true)
  const [screenshotPage, setScreenshotPage] = useState(1)
  const [torrentRecord, setTorrentRecord] = useState<TorrentMetadataRecord | null>(null)
  const [isRefreshingTorrent, setIsRefreshingTorrent] = useState(false)
  const [parsedFileList, setParsedFileList] = useState<
    Array<{ name?: string; path: string; length?: number; size?: string }>
  >([])

  const handleScreenshotStatus = useCallback((url: string, status: ScreenshotStatus) => {
    setScreenshotStates((prev) => (prev[url] === status ? prev : { ...prev, [url]: status }))
  }, [])

  const validScreenshots = screenshotOwner === item?.id ? modalScreenshots : []

  useEffect(() => {
    if (!item || !isOpen) return

    let isMounted = true
    setActiveTab("overview")
    setDetailItem(null)
    setScreenshotPage(1)
    setModalScreenshots([])
    setScreenshotOwner(item.id)
    setScreenshotStates({})
    setScreenshotsLoading(true)
    setScreenshotIndex(null)
    setTorrentRecord(null)
    setIsRefreshingTorrent(false)
    setParsedFileList([])

    // Fetch live torrent metadata
    torrentMetadataService.getItemMetadata(item.id).then((rec) => {
      if (isMounted) setTorrentRecord(rec)
    })

    const unsubscribe = torrentMetadataService.onMetadataUpdated(({ itemId, record }) => {
      if (isMounted && itemId === item.id) {
        setTorrentRecord((prev) => {
          const files = record?.files && record.files.length > 0 ? record.files : prev?.files || []
          return {
            ...(prev || {}),
            ...(record || {}),
            files,
          } as TorrentMetadataRecord
        })
        setIsRefreshingTorrent(false)
        if (!record?.files || record.files.length === 0) {
          torrentMetadataService.getItemMetadata(item.id).then((fullRec) => {
            if (isMounted && fullRec) {
              setTorrentRecord(fullRec)
            }
          })
        }
      }
    })

    // Fetch full item details from SQLite
    nativeLibraryService.getItem(item.id).then((fullDetail) => {
      if (!isMounted) return
      if (!fullDetail) {
        setScreenshotsLoading(false)
        return
      }

      let parsedFiles: Array<{ name?: string; path: string; length?: number; size?: string }> = []
      let fileListStr: string | undefined = undefined

      if (typeof fullDetail.fileList === "string") {
        fileListStr = fullDetail.fileList
      } else if (Array.isArray(fullDetail.fileList)) {
        parsedFiles = fullDetail.fileList.map((f: any) => {
          if (typeof f === "string") {
            return { path: f, name: f.split("/").pop() || f }
          }
          const path = f.path || f.name || ""
          const name = f.name || path.split("/").pop() || path
          const len = f.length ?? f.sizeBytes ?? (typeof f.size === "number" ? f.size : undefined)
          const sizeStr = typeof f.size === "string" ? f.size : len ? formatBytes(len) : undefined
          return {
            path,
            name,
            length: len ? Math.floor(len) : undefined,
            size: sizeStr,
          }
        })
        fileListStr = fullDetail.fileList
          .map((f: any) =>
            typeof f === "string" ? f : `${f.path || f.name} (${f.size || f.sizeBytes || 0})`
          )
          .join("\n")
      }
      setParsedFileList(parsedFiles)

      const merged: LibraryItem = {
        ...item,
        title: fullDetail.title || item.title,
        cleanTitle: fullDetail.cleanTitle || item.cleanTitle || item.title,
        genre: fullDetail.genre || item.genre,
        developer: fullDetail.developer || item.developer,
        publisher: (fullDetail as any).publisher || item.publisher,
        imageFormat: (fullDetail as any).imageFormat || item.imageFormat,
        multiplayer: (fullDetail as any).multiplayer || item.multiplayer,
        version: (fullDetail as any).version || item.version,
        region: (fullDetail as any).region || item.region,
        interfaceLanguage: (fullDetail as any).interfaceLanguage || item.interfaceLanguage,
        voiceLanguage: (fullDetail as any).voiceLanguage || item.voiceLanguage,
        releaseYear: fullDetail.releaseYear || item.releaseYear,
        size: fullDetail.sizeStr || (fullDetail as any).size || item.size,
        sizeBytes: fullDetail.sizeBytes || (fullDetail as any).fileListTotalSizeBytes || item.sizeBytes,
        fileCount: (fullDetail as any).fileCount || item.fileCount,
        fileListTotalSizeBytes: (fullDetail as any).fileListTotalSizeBytes || item.fileListTotalSizeBytes,
        fileListSource: (fullDetail as any).fileListSource || item.fileListSource,
        magnet: fullDetail.magnet || item.magnet,
        magnetLink: fullDetail.magnet || item.magnetLink,
        fileList: fileListStr || item.fileList,
        screenshots:
          fullDetail.screenshots && fullDetail.screenshots.length > 0
            ? fullDetail.screenshots
            : item.screenshots,
        cover: fullDetail.coverUrl || item.cover,
        coverImage: fullDetail.coverUrl || item.coverImage,
      }
      setDetailItem(merged)

      setModalScreenshots(uniqueScreenshotUrls(fullDetail.screenshots))
      setScreenshotsLoading(false)
    })

    if (item.screenshots) {
      setModalScreenshots(uniqueScreenshotUrls(item.screenshots))
    }

    let coverObjectUrl: string | undefined
    const rawCover = item.coverImage || item.cover || (item.screenshots && item.screenshots[0])
    if (rawCover) {
      const resolved = resolveImageUrl(rawCover)
      imageCacheService
        .getImage(resolved)
        .then((blob) => {
          if (isMounted) {
            coverObjectUrl = blob
            setCoverUrl(blob)
          } else {
            imageCacheService.revokeObjectUrl(blob)
          }
        })
        .catch(() => isMounted && setCoverUrl(resolved || null))
    } else {
      setCoverUrl(null)
    }

    return () => {
      isMounted = false
      if (coverObjectUrl) imageCacheService.revokeObjectUrl(coverObjectUrl)
      unsubscribe()
    }
  }, [item, isOpen])

  const activeItem = detailItem || item

  const resolvedData = useMemo(() => {
    if (!activeItem) {
      return resolveTorrentDisplayData({ catalog: null, torrentMetadata: null })
    }
    const catalogData = {
      size: activeItem.size,
      sizeBytes: activeItem.sizeBytes,
      fileList:
        parsedFileList.length > 0
          ? parsedFileList
          : Array.isArray(activeItem.fileList)
          ? activeItem.fileList
          : null,
      fileCount: (activeItem as any).fileCount,
      fileListTotalSizeBytes: (activeItem as any).fileListTotalSizeBytes,
      fileListSource: (activeItem as any).fileListSource,
    }
    return resolveTorrentDisplayData({
      catalog: catalogData,
      torrentMetadata: torrentRecord,
    })
  }, [activeItem, parsedFileList, torrentRecord])

  if (!item || !activeItem) return null

  const targetMagnet = activeItem.magnetLink || activeItem.magnet

  const handleLaunchMagnet = () => {
    if (targetMagnet) {
      openMagnetLink(targetMagnet, item.cleanTitle || item.title)
    } else {
      toast.error(t("itemDetail.noMagnetError"))
    }
  }

  const handleCopyMagnet = () => {
    if (targetMagnet) {
      navigator.clipboard.writeText(targetMagnet)
      toast.success(t("itemDetail.copyMagnetSuccess"))
    }
  }

  const handleRefreshSwarm = async () => {
    if (isRefreshingTorrent) return
    setIsRefreshingTorrent(true)
    try {
      const success = await torrentMetadataService.refreshItemMetadata(
        activeItem.id,
        targetMagnet || undefined
      )
      if (!success) {
        setIsRefreshingTorrent(false)
        toast.error(t("itemDetail.refreshSwarmError"))
      } else {
        toast.info(t("itemDetail.refreshSwarmSuccess"))
      }
    } catch (_) {
      setIsRefreshingTorrent(false)
    }
  }

  const fileCountBadge =
    resolvedData.fileCount !== null
      ? resolvedData.fileCount
      : resolvedData.files && Array.isArray(resolvedData.files)
      ? resolvedData.files.length
      : 0

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="w-[min(1080px,94vw)] max-w-5xl h-[min(820px,90vh)] p-0 border-border bg-card text-foreground rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        >
          {/* 1. FIXED HEADER */}
          <ItemDetailHeader
            item={activeItem}
            coverUrl={coverUrl}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            onLaunchMagnet={handleLaunchMagnet}
            onCopyMagnet={handleCopyMagnet}
          />

          {/* 2. TABS CONTAINER */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full flex-1 flex flex-col overflow-hidden"
          >
            {/* Fixed Tabs List Bar */}
            <div className="px-6 border-b border-border bg-secondary/30 shrink-0">
              <TabsList className="bg-transparent h-11 p-0 space-x-1 border-b-0 overflow-x-auto custom-scrollbar flex">
                <TabsTrigger
                  value="overview"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground hover:text-foreground rounded-none text-xs font-semibold px-3.5 h-11 transition-colors"
                >
                  <LayoutList className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {t("itemDetail.overviewTab")}
                </TabsTrigger>

                <TabsTrigger
                  value="screenshots"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground hover:text-foreground rounded-none text-xs font-semibold px-3.5 h-11 transition-colors"
                >
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {t("itemDetail.screenshotsTab")} {validScreenshots.length > 0 && `(${formatNumber(validScreenshots.length)})`}
                </TabsTrigger>

                <TabsTrigger
                  value="files"
                  className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground hover:text-foreground rounded-none text-xs font-semibold px-3.5 h-11 transition-colors"
                >
                  <Folder className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  {t("itemDetail.filesTab")} {fileCountBadge > 0 && `(${formatNumber(fileCountBadge)})`}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Tab Content Container */}
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Tab 1: Overview */}
              <TabsContent value="overview" className="mt-0 w-full">
                <ItemOverviewTab
                  item={activeItem}
                  resolvedData={resolvedData}
                  isRefreshingTorrent={isRefreshingTorrent}
                  onRefreshTorrent={handleRefreshSwarm}
                  onNavigateToFiles={() => setActiveTab("files")}
                />
              </TabsContent>

              {/* Tab 2: Screenshots */}
              <TabsContent value="screenshots" className="mt-0 w-full">
                <ItemScreenshotsTab
                  itemId={item.id}
                  screenshots={validScreenshots}
                  screenshotsLoading={screenshotsLoading}
                  screenshotStates={screenshotStates}
                  screenshotPage={screenshotPage}
                  onPageChange={setScreenshotPage}
                  onSelectScreenshot={(idx) => setScreenshotIndex(idx)}
                  onScreenshotStatus={handleScreenshotStatus}
                />
              </TabsContent>

              {/* Tab 3: Files */}
              <TabsContent value="files" className="mt-0 w-full">
                <ItemFilesTab
                  files={resolvedData.files}
                  totalSizeFormatted={resolvedData.totalSizeFormatted}
                  status={resolvedData.metadataStatus || undefined}
                />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Lightbox for screenshots */}
      {screenshotIndex !== null && validScreenshots.length > 0 && (
        <ScreenshotLightbox
          key={item.id}
          itemId={item.id}
          images={validScreenshots}
          initialIndex={Math.min(screenshotIndex, validScreenshots.length - 1)}
          isOpen={screenshotIndex !== null}
          onClose={() => setScreenshotIndex(null)}
        />
      )}
    </>
  )
}
