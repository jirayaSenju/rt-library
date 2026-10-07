import React from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TorrentFileTree } from "@/components/library/TorrentFileTree"
import { Folder, HardDrive } from "lucide-react"

interface TorrentFilesModalProps {
  isOpen: boolean
  onClose: () => void
  files?: Array<{ name?: string; path: string; length?: number; size?: number | string; sizeBytes?: number }> | null
  totalSizeFormatted?: string
  itemTitle?: string
  status?: string
}

export const TorrentFilesModal: React.FC<TorrentFilesModalProps> = ({
  isOpen,
  onClose,
  files,
  totalSizeFormatted,
  itemTitle,
  status,
}) => {
  const fileCount = files && Array.isArray(files) ? files.length : 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-6 border-border bg-card text-foreground rounded-2xl shadow-2xl flex flex-col custom-scrollbar">
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div className="space-y-1 pr-6 min-w-0">
            <div className="flex items-center space-x-2">
              <Folder className="h-5 w-5 text-primary shrink-0" />
              <DialogTitle className="text-lg font-bold text-foreground truncate">
                Torrent Files
              </DialogTitle>
            </div>
            {itemTitle && (
              <DialogDescription className="text-xs text-muted-foreground font-medium truncate">
                {itemTitle}
              </DialogDescription>
            )}
          </div>
        </div>

        <div className="pt-4 flex-1 overflow-hidden">
          <TorrentFileTree
            files={files}
            totalSizeFormatted={totalSizeFormatted}
            status={status}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
