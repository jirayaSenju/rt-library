import React from "react"
import { TorrentFileTree } from "./TorrentFileTree"
import { Folder, HardDrive } from "lucide-react"
import { useI18n } from "@/i18n"

interface ItemFilesTabProps {
  files?: Array<{ name?: string; path: string; length?: number; size?: number | string; sizeBytes?: number }> | null
  totalSizeFormatted?: string
  status?: string
}

export const ItemFilesTab: React.FC<ItemFilesTabProps> = ({
  files,
  totalSizeFormatted,
  status,
}) => {
  const { t, formatNumber } = useI18n()
  const hasFiles = files && Array.isArray(files) && files.length > 0

  if (!hasFiles && status !== "fetching" && status !== "pending") {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
        <Folder className="h-8 w-8 text-muted-foreground" />
        <p className="text-xs text-muted-foreground font-medium">
          {t("itemDetail.noFilesAvailable")}
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          {t("itemDetail.fileDetailsNote")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Folder className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
          {t("itemDetail.torrentFilesTitle")} {hasFiles ? `(${formatNumber(files.length)})` : ""}
        </h4>
      </div>

      <div className="border border-border rounded-xl bg-card/60 p-4">
        <TorrentFileTree
          files={files}
          totalSizeFormatted={totalSizeFormatted}
          status={status}
        />
      </div>
    </div>
  )
}
