import React, { useEffect, useState } from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ImageOff } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useScreenshot } from '@/hooks/useScreenshot'
import { ScreenshotThumbnail } from '@/components/library/ScreenshotThumbnail'
import { useI18n } from "@/i18n"

interface ScreenshotLightboxProps {
  itemId: string
  images: string[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
}

export const ScreenshotLightbox: React.FC<ScreenshotLightboxProps> = ({
  itemId,
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const { t, formatNumber } = useI18n()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isZoomed, setIsZoomed] = useState(false)
  useEffect(() => {
    setCurrentIndex(initialIndex)
    setIsZoomed(false)
  }, [initialIndex, isOpen])

  const currentRawUrl = images[currentIndex]

  const image = useScreenshot(currentRawUrl, itemId, 'full', isOpen && Boolean(currentRawUrl))
  const currentImgSrc = image.src
  const isLoading = image.status === 'loading' || image.status === 'idle'
  const hasError = image.status === 'failed'

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, images.length, onClose])

  if (!isOpen || images.length === 0) return null

  const handlePrev = () => {
    setIsZoomed(false)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = () => {
    setIsZoomed(false)
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 border-border bg-card/95 backdrop-blur-2xl text-foreground flex flex-col justify-between overflow-hidden shadow-2xl z-[9999]">
        <DialogTitle className="sr-only">
          {t("itemDetail.screenshotViewerTitle", { current: formatNumber(currentIndex + 1), total: formatNumber(images.length) })}
        </DialogTitle>
        <DialogDescription className="sr-only">{t("itemDetail.screenshotViewerDesc")}</DialogDescription>
        
        {/* Top Header Bar */}
        <div className="w-full flex items-center justify-between px-6 py-4 border-b border-border bg-card/60 shrink-0 z-20 select-none">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-semibold tracking-wide text-foreground">
              {t("itemDetail.screenshotCount", { current: formatNumber(currentIndex + 1), total: formatNumber(images.length) })}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsZoomed(!isZoomed)}
              className="border-border bg-secondary text-foreground hover:bg-muted text-xs h-9 px-3 rounded-lg"
              title={t("itemDetail.toggleZoom")}
            >
              {isZoomed ? <ZoomOut className="h-4 w-4 mr-1.5 text-primary" /> : <ZoomIn className="h-4 w-4 mr-1.5 text-muted-foreground" />}
              {isZoomed ? t("itemDetail.resetZoom") : t("itemDetail.zoom")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
              title={t("itemDetail.closeEsc")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden p-4 select-none">
          {images.length > 1 && (
            <button
              onClick={handlePrev}
              className="absolute left-6 z-30 p-3 rounded-full bg-card/90 border border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-xl backdrop-blur-md"
              title={t("itemDetail.previousPage")}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center space-y-3 text-muted-foreground">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
                <span className="text-xs font-mono">{t("itemDetail.loadingScreenshots")}</span>
              </div>
            ) : hasError || !currentImgSrc ? (
              <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground p-8 bg-muted/40 border border-border rounded-2xl">
                <ImageOff className="h-12 w-12 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">{t("itemDetail.imageUnavailable")}</span>
                <Button variant="outline" onClick={image.retry}>{t("common.retry")}</Button>
              </div>
            ) : (
              <img
                src={currentImgSrc}
                alt={`Screenshot ${currentIndex + 1}`}
                referrerPolicy="no-referrer"
                onError={image.onError}
                className={`max-h-full max-w-full object-contain rounded-xl transition-transform motion-reduce:transition-none duration-300 shadow-2xl ${
                  isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in hover:scale-[1.01]"
                }`}
                onClick={() => setIsZoomed(!isZoomed)}
              />
            )}
          </div>

          {images.length > 1 && (
            <button
              onClick={handleNext}
              className="absolute right-6 z-30 p-3 rounded-full bg-card/90 border border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-xl backdrop-blur-md"
              title={t("itemDetail.nextPage")}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Thumbnail Carousel Footer */}
        {images.length > 1 && (
          <div className="w-full px-6 py-3 bg-card/80 border-t border-border shrink-0 z-20">
            <div className="flex items-center justify-center space-x-2.5 overflow-x-auto custom-scrollbar max-w-5xl mx-auto py-1">
              {images.slice(Math.floor(currentIndex / 8) * 8, Math.floor(currentIndex / 8) * 8 + 8).map((img, localIndex) => {
                const idx = Math.floor(currentIndex / 8) * 8 + localIndex
                return (
                  <div key={itemId + img} className={`w-24 shrink-0 ${idx === currentIndex ? 'ring-2 ring-primary rounded-xl' : ''}`}>
                    <ScreenshotThumbnail url={img} itemId={itemId} index={idx} onClick={() => { setIsZoomed(false); setCurrentIndex(idx) }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
