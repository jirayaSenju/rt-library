import { useEffect } from 'react'
import { useScreenshot } from '@/hooks/useScreenshot'
import { ScreenshotStatus } from '@/services/screenshotLoader'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'

export function ScreenshotThumbnail({ url, itemId, index, onClick, onStatus }: {
  url: string; itemId: string; index: number; onClick: () => void;
  onStatus?: (url: string, status: ScreenshotStatus) => void
}) {
  const { t, formatNumber } = useI18n()
  const image = useScreenshot(url, itemId, 'thumbnail')
  useEffect(() => { onStatus?.(url, image.status) }, [url, image.status, onStatus])
  return (
    <div className="aspect-video bg-muted/40 border border-border/80 rounded-xl overflow-hidden relative">
      {image.status === 'failed' ? (
        <div className="h-full flex flex-col items-center justify-center gap-1 p-2" role="status">
          <span className="text-xs text-muted-foreground">{t('itemDetail.imageUnavailable')}</span>
          <button type="button" onClick={image.retry} className="text-xs text-primary px-3 py-2 rounded focus-visible:outline focus-visible:outline-primary">{t('common.retry')}</button>
        </div>
      ) : (
        <button type="button" onClick={onClick} aria-label={`${t('itemDetail.screenshotsTab')} ${formatNumber(index + 1)}`} className="w-full h-full focus-visible:outline focus-visible:outline-primary">
          {image.status === 'loaded' && image.src ? (
            <img src={image.src} alt={`${t('itemDetail.screenshotsTab')} ${formatNumber(index + 1)}`} onError={image.onError} className="w-full h-full object-cover" />
          ) : <Skeleton className="w-full h-full motion-reduce:animate-none" aria-label={t('itemDetail.loadingScreenshots')} />}
        </button>
      )}
    </div>
  )
}
