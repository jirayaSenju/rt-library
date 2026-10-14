import React from 'react';
import { AlertTriangle, AlertCircle, ExternalLink, RefreshCw, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export type SyncActionBannerType =
  | 'VERIFICATION_REQUIRED'
  | 'COMPANION_DISCONNECTED'
  | 'NO_RUTRACKER_TAB'
  | 'FAILED';

export interface SyncActionBannerState {
  type: SyncActionBannerType;
  message?: string;
  runId?: string | null;
  categoryId?: string | null;
  transport?: string;
}

export interface SyncActionBannerProps {
  banner: SyncActionBannerState | null;
  onDismiss: () => void;
  onAction: (actionType: 'open_rutracker' | 'check_again' | 'reconnect' | 'view_details' | 'verify_embedded', payload?: any) => void;
}

export const SyncActionBanner: React.FC<SyncActionBannerProps> = ({
  banner,
  onDismiss,
  onAction,
}) => {
  const { t } = useI18n();

  if (!banner) return null;

  const isWarning = banner.type === 'VERIFICATION_REQUIRED' || banner.type === 'NO_RUTRACKER_TAB';
  const isDestructive = banner.type === 'COMPANION_DISCONNECTED' || banner.type === 'FAILED';

  let title = banner.message;
  if (!title) {
    if (banner.type === 'VERIFICATION_REQUIRED') {
      title = banner.transport === 'EMBEDDED_ELECTRON'
        ? t('settings.scraper.embeddedVerificationBannerTitle')
        : t('settings.scraper.actionBannerVerificationTitle');
    } else if (banner.type === 'COMPANION_DISCONNECTED') {
      title = t('settings.scraper.actionBannerDisconnectedTitle');
    } else if (banner.type === 'NO_RUTRACKER_TAB') {
      title = t('settings.scraper.actionBannerNoTabTitle');
    } else {
      title = t('settings.scraper.actionBannerFailedTitle');
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "w-full px-4 py-2 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs select-none transition-colors animate-in fade-in-0 duration-150 z-20 shrink-0",
        isWarning && "bg-amber-500/10 border-amber-500/20 text-amber-500",
        isDestructive && "bg-destructive/10 border-destructive/20 text-destructive"
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {isWarning ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        )}
        <span className="font-medium text-foreground truncate">{title}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {banner.type === 'VERIFICATION_REQUIRED' && (
          banner.transport === 'EMBEDDED_ELECTRON' ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => onAction('verify_embedded', { categoryId: banner.categoryId })}
              className="h-7 px-2.5 text-xs gap-1 bg-amber-500 text-black hover:bg-amber-600 font-semibold"
            >
              <ExternalLink className="h-3 w-3" />
              <span>{t('settings.scraper.verifyNow')}</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAction('open_rutracker', { categoryId: banner.categoryId })}
                className="h-7 px-2.5 text-xs gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
              >
                <ExternalLink className="h-3 w-3" />
                <span>{t('settings.scraper.openRuTracker')}</span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onAction('check_again', { categoryId: banner.categoryId })}
                className="h-7 px-2.5 text-xs gap-1 bg-amber-500 text-black hover:bg-amber-600 font-semibold"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t('settings.scraper.checkAgain')}</span>
              </Button>
            </>
          )
        )}

        {banner.type === 'COMPANION_DISCONNECTED' && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onAction('reconnect')}
            className="h-7 px-2.5 text-xs gap-1 font-semibold"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{t('settings.scraper.reconnect')}</span>
          </Button>
        )}

        {banner.type === 'NO_RUTRACKER_TAB' && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onAction('open_rutracker', { categoryId: banner.categoryId })}
            className="h-7 px-2.5 text-xs gap-1 bg-amber-500 text-black hover:bg-amber-600 font-semibold"
          >
            <ExternalLink className="h-3 w-3" />
            <span>{t('settings.scraper.openRuTracker')}</span>
          </Button>
        )}

        {banner.type === 'FAILED' && banner.runId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAction('view_details', { runId: banner.runId })}
            className="h-7 px-2.5 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <span>{t('settings.scraper.viewDetails')}</span>
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          aria-label={t('common.close') || 'Close'}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

