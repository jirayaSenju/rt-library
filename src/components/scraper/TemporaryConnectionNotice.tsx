import React from 'react'
import { Info, Clock } from 'lucide-react'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface TemporaryConnectionNoticeProps {
  className?: string
  compact?: boolean
}

export const TemporaryConnectionNotice: React.FC<TemporaryConnectionNoticeProps> = ({
  className,
  compact = false,
}) => {
  const { t } = useI18n()

  if (compact) {
    return (
      <div
        role="note"
        aria-label={t('onboarding.temporaryConnectionTitle')}
        className={cn(
          'flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-200/90 text-[11px] leading-relaxed',
          className
        )}
      >
        <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {t('settings.scraper.temporaryConnectionNotice')}
        </span>
      </div>
    )
  }

  return (
    <div
      role="note"
      aria-label={t('onboarding.temporaryConnectionTitle')}
      className={cn(
        'p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-neutral-200 text-left space-y-1',
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
        <Clock className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
        <span>{t('onboarding.temporaryConnectionTitle')}</span>
      </div>
      <p className="text-xs text-neutral-300/90 leading-relaxed pl-6">
        {t('onboarding.temporaryConnectionDesc')}
      </p>
    </div>
  )
}
