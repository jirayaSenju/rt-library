import React from 'react';
import { ScraperState, ScraperProgress as ScraperProgressData } from '../../services/scraperService';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Layers, 
  Square,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/i18n';

interface ScraperProgressProps {
  state: ScraperState;
  progress: ScraperProgressData | null;
  error?: string | null;
  onCancel?: () => void;
  onRenewSession?: () => void;
  isStarting?: boolean;
}

export const ScraperProgress: React.FC<ScraperProgressProps> = ({ 
  state, 
  progress, 
  error,
  onCancel,
  onRenewSession,
  isStarting = false,
}) => {
  const { t, formatNumber } = useI18n();
  const isRunning = state === 'running' || state === 'starting';
  const isCancelling = state === 'cancelling';

  const formatElapsed = (ms?: number) => {
    if (!ms) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const percent = progress && progress.totalPages && progress.totalPages > 0
    ? Math.min(100, Math.round(((progress.currentPage || 0) / progress.totalPages) * 100))
    : 0;

  // 1. When Running or Starting: Render Active Progress Card
  if (isRunning || isCancelling) {
    return (
      <div className="bg-neutral-900/60 rounded-xl border border-neutral-800/80 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
            <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
            <span>{isCancelling ? t('settings.scraper.cancellingTitle') : t('settings.scraper.progressTitle')}</span>
          </div>

          {onCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
              className="h-7 px-3 text-xs font-semibold shrink-0"
              aria-label={t('settings.scraper.cancelJob')}
            >
              <Square className="w-3 h-3 mr-1.5 fill-current" />
              {isCancelling ? `${t('settings.scraper.stopping')}...` : t('settings.scraper.cancelJob')}
            </Button>
          )}
        </div>

        {/* Progress Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.currentCategory')}</span>
            <span className="text-xs font-semibold text-neutral-100 truncate block mt-1">
              {progress?.categoryName || progress?.category || '...'}
            </span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.pageTotal')}</span>
            <span className="text-xs font-semibold text-neutral-100 block mt-1 font-mono">
              {progress?.currentPage ? formatNumber(progress.currentPage) : 0} / {progress?.totalPages ? formatNumber(progress.totalPages) : '—'}
            </span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.newProcessed')}</span>
            <span className="text-xs font-semibold text-emerald-400 block mt-1 font-mono">
              +{formatNumber(progress?.newItems || 0)} <span className="text-neutral-500 font-normal">({formatNumber(progress?.processedItems || 0)})</span>
            </span>
          </div>

          <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium flex items-center gap-1 uppercase tracking-wider">
              <Clock className="w-3 h-3 text-neutral-500" /> {t('settings.scraper.elapsed')}
            </span>
            <span className="text-xs font-semibold text-neutral-200 block mt-1 font-mono">
              {formatElapsed(progress?.elapsedMs)}
            </span>
          </div>
        </div>

        {/* Real Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-neutral-400 font-medium">
            <span>{t('settings.scraper.progressLabel')}</span>
            <span className="text-emerald-400 font-bold font-mono">{percent > 0 ? `${percent}%` : t('settings.scraper.scanningLabel')}</span>
          </div>
          <Progress value={percent > 0 ? percent : 100} className={`h-2 bg-neutral-950 ${percent === 0 ? 'animate-pulse' : ''}`} />
        </div>
      </div>
    );
  }

  // 2. When Completed: Render Execution Summary
  if (state === 'completed') {
    return (
      <div className="bg-emerald-950/20 rounded-xl border border-emerald-500/30 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 border-b border-emerald-500/20 pb-3">
          <CheckCircle2 className="w-4 h-4" />
          <span>{t('settings.scraper.updateCompleted')}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.selectCategory')}</span>
            <span className="text-xs font-semibold text-neutral-100 truncate block mt-1">
              {progress?.categoryName || progress?.category || t('settings.scraper.allCategories')}
            </span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.pagesVisited')}</span>
            <span className="text-xs font-semibold text-neutral-100 block mt-1 font-mono">
              {formatNumber(progress?.currentPage || progress?.totalPages || 0)}
            </span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.newItemsSaved')}</span>
            <span className="text-xs font-semibold text-emerald-400 block mt-1 font-mono">
              +{formatNumber(progress?.newItems || 0)}
            </span>
          </div>

          <div className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 font-medium block uppercase tracking-wider">{t('settings.scraper.duration')}</span>
            <span className="text-xs font-semibold text-neutral-200 block mt-1 font-mono">
              {formatElapsed(progress?.elapsedMs)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 3. When Session Required / Interaction Required
  if (state === 'session_required' || state === 'interaction_required' || (error && error.includes('SESSION'))) {
    return (
      <div className="bg-amber-950/20 rounded-xl border border-amber-500/30 p-5 space-y-3 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-300">{t('settings.scraper.sessionRequiredTitle')}</h4>
              <p className="text-[11px] text-neutral-300 leading-relaxed">
                {t('settings.scraper.sessionRequiredDesc')}
              </p>
            </div>
          </div>

          {onRenewSession && (
            <Button
              size="sm"
              onClick={onRenewSession}
              disabled={isStarting}
              className="bg-amber-600 hover:bg-amber-500 text-neutral-950 text-xs font-bold h-8 px-3.5 rounded-lg shrink-0 shadow-sm"
              aria-label={t('settings.scraper.renewSession')}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isStarting ? 'animate-spin' : ''}`} />
              {t('settings.scraper.renewSession')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 4. When Failed / Error
  if (state === 'failed' || error) {
    return (
      <div className="bg-rose-950/20 rounded-xl border border-rose-500/30 p-4 space-y-2.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{t('settings.scraper.errorTitle')}</span>
        </div>
        <p className="text-[11px] text-neutral-300 leading-relaxed pl-6">
          {error || t('settings.scraper.defaultError')}
        </p>
      </div>
    );
  }

  // 5. Idle state: Return null (clean layout)
  return null;
};
