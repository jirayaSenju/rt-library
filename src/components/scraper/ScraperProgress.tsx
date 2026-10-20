import { getCategoryProgress } from "@/utils/categoryProgress"
import React, { useState } from 'react';
import { 
  ScraperCategoryAccess, 
  ScraperState, 
  ScraperProgress as ScraperProgressData, 
  CategoryProgressStatus 
} from '../../services/scraperService';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Layers, 
  Square,
  Pause,
  Play,
  ShieldAlert,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Database,
  Check,
  FileCheck2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface ScraperProgressProps {
  state: ScraperState;
  progress: ScraperProgressData | null;
  error?: string | null;
  accessIssue?: ScraperCategoryAccess | null;
  onCancel?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onRenewSession?: () => void;
  onOpenBrowser?: () => void;
  onCheckAccess?: () => void;
  onReconnect?: () => void;
  onVerifyEmbedded?: () => void;
  activeTransport?: string;
  isStarting?: boolean;
  isPausing?: boolean;
  isResuming?: boolean;
}

export const ScraperProgress: React.FC<ScraperProgressProps> = ({ 
  state, 
  progress, 
  error,
  accessIssue,
  onCancel,
  onPause,
  onResume,
  onRenewSession,
  onOpenBrowser,
  onCheckAccess,
  onReconnect,
  onVerifyEmbedded,
  activeTransport,
  isStarting = false,
  isPausing: propIsPausing = false,
  isResuming: propIsResuming = false,
}) => {
  const { t, formatNumber } = useI18n();
  const [showCategoryList, setShowCategoryList] = useState(false);

  const isCancelling = state === 'cancelling';
  const isPausing = propIsPausing || state === 'pausing';
  const isResuming = propIsResuming || state === 'resuming';
  const isUserPaused = state === 'paused';
  const isVerificationRequired = state === 'session_required' || state === 'interaction_required' || state === 'auth_required';
  const isDisconnectedMidScan = Boolean(error && /companion.*disconnect|disconnect.*companion|session.*lost|session.*expired/i.test(error));
  const isRunning = (state === 'running' || state === 'starting' || state === 'preflight' || state === 'verifying' || state === 'reprobing' || isPausing || isResuming) && !isUserPaused;

  const formatElapsed = (ms?: number) => {
    if (!ms) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine if total pages is known
  const categoryPercent = getCategoryProgress(progress);
  const hasKnownTotal = categoryPercent !== null;
  const percent = categoryPercent === null ? 0 : Math.round(categoryPercent);

  // Sanitize raw error string into standard error category (Requirements 10 & 11)
  const resolveStandardizedError = (rawError?: string | null): { category: string; message: string } => {
    if (!rawError) return { category: 'Unknown', message: t('settings.scraper.defaultError') };

    const lower = rawError.toLowerCase();
    if (lower.includes('cloudflare') || lower.includes('challenge') || lower.includes('interaction_required') || lower.includes('403') || lower.includes('auth_required')) {
      return { category: 'Access', message: t('settings.scraper.errorAccess') };
    }
    if (lower.includes('companion') || lower.includes('token') || lower.includes('bearer') || lower.includes('bridge') || lower.includes('401')) {
      return { category: 'Connection', message: t('settings.scraper.errorConnection') };
    }
    if (lower.includes('econnrefused') || lower.includes('network') || lower.includes('enotfound') || lower.includes('etimedout') || lower.includes('fetch failed')) {
      return { category: 'Network', message: t('settings.scraper.errorNetwork') };
    }
    if (lower.includes('parse') || lower.includes('jsdom') || lower.includes('html')) {
      return { category: 'Parser', message: t('settings.scraper.errorParser') };
    }
    if (lower.includes('import') || lower.includes('invalid_html') || lower.includes('too large')) {
      return { category: 'Import', message: t('settings.scraper.errorImport') };
    }
    if (lower.includes('sqlite') || lower.includes('database') || lower.includes('constraint')) {
      return { category: 'Database', message: t('settings.scraper.errorDatabase') };
    }
    return { category: 'Unknown', message: t('settings.scraper.errorUnknown') };
  };

  // Render category status badge for category list (Requirement 16)
  const renderCategoryBadge = (catStatus: CategoryProgressStatus) => {
    switch (catStatus.status) {
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>{t('settings.scraper.statusCompleted')}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>{t('settings.scraper.statusInProgress')}</span>
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            <span>{t('settings.scraper.statusPaused')}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-rose-400">
            <XCircle className="h-3 w-3" />
            <span>{t('settings.scraper.statusFailed')}</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{t('settings.scraper.statusPending')}</span>
          </span>
        );
    }
  };

  // =========================================================================
  // 1. RUNNING OR CANCELLING (Requirements 1, 2, 3, 4, 8)
  // =========================================================================
  if (isRunning || isCancelling) {
    const isMultiCategory = Boolean(progress?.totalCategories && progress.totalCategories > 1);

    return (
      <div 
        role="status" 
        aria-live="polite"
        className="bg-card rounded-xl border border-border p-5 space-y-4 shadow-sm select-none"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <RefreshCw className={cn("w-4 h-4 text-emerald-400", (!isCancelling && !isPausing) && "animate-spin")} />
            <div>
              <span className="text-xs font-semibold text-foreground block">
                {isCancelling 
                  ? t('settings.scraper.cancellingTitle') 
                  : isPausing 
                  ? t('settings.scraper.pausingTitle')
                  : isResuming
                  ? t('settings.scraper.resumingTitle')
                  : state === 'preflight'
                  ? (t('settings.scraper.preflightTitle') || 'Initializing preflight checks...')
                  : state === 'verifying'
                  ? (t('settings.scraper.verifyingTitle') || 'Verifying RuTracker session...')
                  : state === 'reprobing'
                  ? (t('settings.scraper.reprobingTitle') || 'Checking RuTracker connectivity...')
                  : t('settings.scraper.progressTitle')}
              </span>
              {isMultiCategory && (
                <span className="text-[11px] text-muted-foreground">
                  {t('settings.scraper.categoryProgress', {
                    current: progress?.categoryIndex || 1,
                    total: progress?.totalCategories || 1,
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onPause && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                disabled={isCancelling || isPausing || isResuming}
                className="h-7 px-3 text-xs font-semibold shrink-0 cursor-pointer"
                aria-label={isPausing ? t('settings.scraper.pausing') : t('settings.scraper.pauseJob')}
              >
                <Pause className="w-3 h-3 mr-1.5" />
                {isPausing ? t('settings.scraper.pausing') : t('settings.scraper.pauseJob')}
              </Button>
            )}

            {onCancel && (
              <Button
                variant="destructive"
                size="sm"
                onClick={onCancel}
                disabled={isCancelling}
                className="h-7 px-3 text-xs font-semibold shrink-0 cursor-pointer"
                aria-label={t('settings.scraper.cancelJob')}
              >
                <Square className="w-3 h-3 mr-1.5 fill-current" />
                {isCancelling ? `${t('settings.scraper.stopping')}...` : t('settings.scraper.cancelJob')}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Metrics Grid (Requirement 1 & 2) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.currentCategory')}
            </span>
            <span className="text-xs font-semibold text-foreground truncate block mt-1" title={progress?.categoryName || progress?.category}>
              {progress?.categoryName || progress?.category || '...'}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.pageTotal')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatNumber(progress?.currentPage ?? 0)} / {hasKnownTotal ? formatNumber(progress!.totalPages!) : '—'}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.newProcessed')}
            </span>
            <span className="text-xs font-semibold text-emerald-400 block mt-1 font-mono">
              +{formatNumber(progress?.newItems || 0)} <span className="text-muted-foreground font-normal">({formatNumber(progress?.processedItems || 0)})</span>
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 uppercase tracking-wider">
              <Clock className="w-3 h-3 text-muted-foreground" /> {t('settings.scraper.elapsed')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatElapsed(progress?.elapsedMs)}
            </span>
          </div>
        </div>

        {/* Detailed Topic & Ingestion Breakdown (Requirement 2) */}
        {(progress?.topicsDiscovered !== undefined || progress?.detailsProcessed !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 border border-border/50">
            {progress?.topicsDiscovered !== undefined && (
              <span>
                {t('settings.scraper.topicsFound')}: <strong className="text-foreground font-mono">{formatNumber(progress.topicsDiscovered)}</strong>
              </span>
            )}
            {progress?.newTopics !== undefined && (
              <span>
                {t('settings.scraper.newTopics')}: <strong className="text-emerald-400 font-mono">+{formatNumber(progress.newTopics)}</strong>
              </span>
            )}
            {progress?.knownTopics !== undefined && (
              <span>
                {t('settings.scraper.knownTopics')}: <strong className="text-muted-foreground font-mono">{formatNumber(progress.knownTopics)}</strong>
              </span>
            )}
            {progress?.detailsProcessed !== undefined && (
              <span>
                {t('settings.scraper.detailsProcessed')}: <strong className="text-foreground font-mono">{formatNumber(progress.detailsProcessed)} / {progress.detailsTotal ? formatNumber(progress.detailsTotal) : '—'}</strong>
              </span>
            )}
          </div>
        )}

        {/* Progress Bar (Requirement 4: Indeterminate if total unknown, percent if known) */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>{t('settings.scraper.progressLabel')}</span>
            <span className="text-emerald-400 font-bold font-mono">
              {hasKnownTotal
                ? `${percent}%`
                : (progress?.status === 'enriching' ? (t('settings.scraper.enrichingLabel') || 'Obtendo detalhes...') : t('settings.scraper.scanningLabel'))}
            </span>
          </div>
          {hasKnownTotal ? (
            <Progress 
              value={percent} 
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 bg-background border border-border/50" 
            />
          ) : (
            <div 
              role="progressbar" 
              aria-label={t('settings.scraper.scanningLabel')}
              className="h-2 w-full bg-background rounded-full overflow-hidden border border-border/50 relative"
            >
              <div className="h-full w-2/5 bg-emerald-500 rounded-full animate-pulse transition-all duration-300" />
            </div>
          )}
        </div>

        {/* Category Status List Toggle (Requirement 16) */}
        {progress?.categoryStatuses && progress.categoryStatuses.length > 1 && (
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowCategoryList(prev => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-expanded={showCategoryList}
            >
              {showCategoryList ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>{t('settings.scraper.categoryStatusListTitle')} ({progress.categoryStatuses.length})</span>
            </button>

            {showCategoryList && (
              <div className="mt-2.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {progress.categoryStatuses.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border text-xs">
                    <span className="font-medium text-foreground truncate pr-2">{cat.name}</span>
                    {renderCategoryBadge(cat)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 2. USER PAUSED STATE (Requirements 5, 8, 9, 17, 19)
  // =========================================================================
  if (isUserPaused) {
    const isMultiCategory = Boolean(progress?.totalCategories && progress.totalCategories > 1);

    return (
      <div 
        role="status" 
        aria-live="polite"
        className="bg-card rounded-xl border border-amber-500/40 p-5 space-y-4 shadow-sm select-none text-foreground"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <Pause className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-xs font-semibold text-foreground block">
                {t('settings.scraper.userPausedTitle')}
              </span>
              <span className="text-[11px] text-muted-foreground block">
                {t('settings.scraper.userPausedDesc')}
              </span>
              {isMultiCategory && (
                <span className="text-[11px] text-muted-foreground">
                  {t('settings.scraper.categoryProgress', {
                    current: progress?.categoryIndex || 1,
                    total: progress?.totalCategories || 1,
                  })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onResume && (
              <Button
                variant="default"
                size="sm"
                onClick={onResume}
                disabled={isCancelling || isResuming}
                className="h-7 px-3 text-xs font-semibold shrink-0 cursor-pointer gap-1.5"
                aria-label={isResuming ? `${t('settings.scraper.resuming')}...` : t('settings.scraper.resumeJob')}
              >
                <Play className={cn("w-3 h-3 fill-current", isResuming && "animate-spin")} />
                {isResuming ? `${t('settings.scraper.resuming')}...` : t('settings.scraper.resumeJob')}
              </Button>
            )}

            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={isCancelling}
                className="h-7 px-3 text-xs font-semibold shrink-0 cursor-pointer text-destructive hover:bg-destructive/10 border-destructive/30"
                aria-label={t('settings.scraper.cancelJob')}
              >
                <Square className="w-3 h-3 mr-1.5 fill-current" />
                {isCancelling ? `${t('settings.scraper.stopping')}...` : t('settings.scraper.cancelJob')}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.currentCategory')}
            </span>
            <span className="text-xs font-semibold text-foreground truncate block mt-1" title={progress?.categoryName || progress?.category}>
              {progress?.categoryName || progress?.category || '...'}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.pageTotal')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatNumber(progress?.currentPage ?? 0)} / {hasKnownTotal ? formatNumber(progress!.totalPages!) : '—'}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.newProcessed')}
            </span>
            <span className="text-xs font-semibold text-emerald-400 block mt-1 font-mono">
              +{formatNumber(progress?.newItems || 0)} <span className="text-muted-foreground font-normal">({formatNumber(progress?.processedItems || 0)})</span>
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 uppercase tracking-wider">
              <Clock className="w-3 h-3 text-muted-foreground" /> {t('settings.scraper.elapsed')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatElapsed(progress?.elapsedMs)}
            </span>
          </div>
        </div>

        {/* Detailed Topic Breakdown */}
        {(progress?.topicsDiscovered !== undefined || progress?.detailsProcessed !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2 border border-border/50">
            {progress?.topicsDiscovered !== undefined && (
              <span>
                {t('settings.scraper.topicsFound')}: <strong className="text-foreground font-mono">{formatNumber(progress.topicsDiscovered)}</strong>
              </span>
            )}
            {progress?.newTopics !== undefined && (
              <span>
                {t('settings.scraper.newTopics')}: <strong className="text-emerald-400 font-mono">+{formatNumber(progress.newTopics)}</strong>
              </span>
            )}
            {progress?.knownTopics !== undefined && (
              <span>
                {t('settings.scraper.knownTopics')}: <strong className="text-muted-foreground font-mono">{formatNumber(progress.knownTopics)}</strong>
              </span>
            )}
            {progress?.detailsProcessed !== undefined && (
              <span>
                {t('settings.scraper.detailsProcessed')}: <strong className="text-foreground font-mono">{formatNumber(progress.detailsProcessed)} / {progress.detailsTotal ? formatNumber(progress.detailsTotal) : '—'}</strong>
              </span>
            )}
          </div>
        )}

        {/* Informative Notice (Requirements 8, 9, 10) */}
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-200/90 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium text-amber-300">
              {t('settings.scraper.progressKeptInMemory')}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t('settings.scraper.pauseVsCancelNote')}
            </p>
          </div>
        </div>

        {/* Category Status List Toggle (Requirement 16) */}
        {progress?.categoryStatuses && progress.categoryStatuses.length > 1 && (
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowCategoryList(prev => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-expanded={showCategoryList}
            >
              {showCategoryList ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>{t('settings.scraper.categoryStatusListTitle')} ({progress.categoryStatuses.length})</span>
            </button>

            {showCategoryList && (
              <div className="mt-2.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {progress.categoryStatuses.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border text-xs">
                    <span className="font-medium text-foreground truncate pr-2">{cat.name}</span>
                    {renderCategoryBadge(cat)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 3. PAUSED STATE (VERIFICATION REQUIRED) (Requirements 6, 27, 28, 29)
  // =========================================================================
  if (isVerificationRequired) {
    const isEmbedded = activeTransport === 'EMBEDDED_ELECTRON' || accessIssue?.transport === 'EMBEDDED_ELECTRON';
    const isLoop = accessIssue?.status === 'VERIFICATION_LOOP' || (accessIssue as any)?.verificationOutcome === 'VERIFICATION_LOOP';

    return (
      <div 
        role="alert" 
        className={cn(
          "rounded-xl border p-5 space-y-3.5 shadow-sm text-foreground",
          isLoop ? "bg-rose-500/10 border-rose-500/30" : "bg-amber-500/10 border-amber-500/30"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            {isLoop ? (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <h4 className={cn("text-xs font-bold", isLoop ? "text-rose-300" : "text-amber-300")}>
                {isLoop
                  ? 'Built-in verification could not be completed'
                  : isEmbedded
                  ? (t('settings.scraper.embeddedVerificationBannerTitle') || 'RuTracker verification required')
                  : t('settings.scraper.verificationPausedTitle')}
              </h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isLoop
                  ? 'Cloudflare security verification repeatedly requested the checkbox in the embedded browser. You can retry, use Browser Companion in your regular browser, or cancel.'
                  : isEmbedded
                  ? (t('settings.scraper.builtInNotice') || 'Complete human verification in the built-in window to continue.')
                  : t('settings.scraper.verificationPausedDesc')}
              </p>
              {accessIssue && (
                <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
                  {accessIssue.categoryName} · {accessIssue.message || accessIssue.status}
                </p>
              )}
              {progress && ((progress.totalItems || 0) > 0 || (progress.currentPage || 0) > 0) && (
                <p className="text-[11px] text-muted-foreground pt-1">
                  {t('onboarding.itemsSaved')}: <strong className="text-foreground font-mono">{formatNumber(progress.totalItems || 0)}</strong> · {t('onboarding.lastPage')}: <strong className="text-foreground font-mono">{formatNumber(progress.currentPage || 0)}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isEmbedded ? (
              <>
                {onCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                    className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground gap-1.5 cursor-pointer"
                  >
                    <span>{t('common.cancel') || 'Cancel'}</span>
                  </Button>
                )}

                {isLoop && onOpenBrowser && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenBrowser}
                    className="h-8 text-xs border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 gap-1.5 cursor-pointer font-semibold"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Use Browser Companion</span>
                  </Button>
                )}

                {onVerifyEmbedded && (
                  <Button
                    size="sm"
                    onClick={onVerifyEmbedded}
                    disabled={isStarting}
                    className={cn(
                      "text-xs font-bold h-8 px-3.5 rounded-lg shadow-sm cursor-pointer",
                      isLoop ? "bg-rose-500 hover:bg-rose-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-black"
                    )}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    <span>{isLoop ? 'Try Again' : (t('settings.scraper.verifyNow') || 'Verify Now')}</span>
                  </Button>
                )}
              </>
            ) : (
              <>
                {onOpenBrowser && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenBrowser}
                    className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    <span>{t('settings.scraper.companionOpenBrowser')}</span>
                  </Button>
                )}

                {onCheckAccess && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCheckAccess}
                    className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>{t('settings.scraper.checkAgainButton')}</span>
                  </Button>
                )}

                {onRenewSession && (
                  <Button
                    size="sm"
                    onClick={onRenewSession}
                    disabled={isStarting}
                    className="bg-amber-600 hover:bg-amber-500 text-neutral-950 text-xs font-bold h-8 px-3.5 rounded-lg shadow-sm cursor-pointer"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isStarting && 'animate-spin')} />
                    <span>{t('settings.scraper.resumeSync')}</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. DISCONNECTED MID-SCAN (Requirement 7)
  // =========================================================================
  if (isDisconnectedMidScan) {
    return (
      <div 
        role="alert" 
        className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-5 space-y-3 shadow-sm text-foreground"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-300">
                {t('settings.scraper.companionDisconnectedMidScan')}
              </h4>
              {progress && (progress.totalItems || 0) > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {t('onboarding.itemsSaved')}: <strong className="text-foreground font-mono">{formatNumber(progress.totalItems || 0)}</strong>
                </p>
              )}
            </div>
          </div>

          {onReconnect && (
            <Button
              size="sm"
              onClick={onReconnect}
              className="h-8 px-3.5 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('settings.scraper.reconnectButton')}</span>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 4. COMPLETED STATE (Requirements 5, 14, 15)
  // =========================================================================
  if (state === 'completed') {
    const isUpToDate = (progress?.newItems || 0) === 0 && (progress?.updatedItems || 0) === 0;
    const hasWarnings = progress?.categoryStatuses?.some(c => c.status === 'paused' || c.status === 'failed');

    return (
      <div 
        role="status" 
        aria-live="polite"
        className={cn(
          "rounded-xl border p-5 space-y-4 shadow-sm select-none",
          hasWarnings 
            ? "bg-amber-500/10 border-amber-500/30" 
            : "bg-emerald-500/10 border-emerald-500/30"
        )}
      >
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {hasWarnings ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span className={hasWarnings ? "text-amber-300" : "text-emerald-400"}>
              {hasWarnings 
                ? t('settings.scraper.syncCompletedWithWarnings') 
                : isUpToDate 
                ? t('settings.scraper.libraryUpToDate') 
                : t('settings.scraper.updateCompleted')}
            </span>
          </div>

          {isUpToDate && !hasWarnings && (
            <span className="text-[11px] text-muted-foreground">
              {t('settings.scraper.libraryUpToDateDesc')}
            </span>
          )}
        </div>

        {/* Execution Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.selectCategory')}
            </span>
            <span className="text-xs font-semibold text-foreground truncate block mt-1">
              {progress?.categoryName || progress?.category || t('settings.scraper.allCategories')}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.pagesVisited')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatNumber(progress?.currentPage || progress?.totalPages || 1)}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.newItemsSaved')}
            </span>
            <span className="text-xs font-semibold text-emerald-400 block mt-1 font-mono">
              +{formatNumber(progress?.newItems || 0)}
              {(progress?.updatedItems || 0) > 0 && (
                <span className="text-muted-foreground font-normal"> (+{formatNumber(progress!.updatedItems!)} {t('onboarding.updated')})</span>
              )}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-lg border border-border">
            <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">
              {t('settings.scraper.duration')}
            </span>
            <span className="text-xs font-semibold text-foreground block mt-1 font-mono">
              {formatElapsed(progress?.elapsedMs)}
            </span>
          </div>
        </div>

        {/* Category Breakdown if Warnings Present (Requirement 15) */}
        {hasWarnings && progress?.categoryStatuses && (
          <div className="pt-2 space-y-1.5 border-t border-border/50">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('settings.scraper.categoryStatusListTitle')}
            </span>
            <div className="space-y-1">
              {progress.categoryStatuses.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border text-xs">
                  <span className="text-foreground font-medium truncate pr-2">{cat.name}</span>
                  {renderCategoryBadge(cat)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 5. ERROR STATE (STANDARDIZED, NO RAW ERRORS) (Requirements 10 & 11)
  // =========================================================================
  if (state === 'failed' || error) {
    const stdError = resolveStandardizedError(error);

    return (
      <div 
        role="alert" 
        className="bg-rose-500/10 rounded-xl border border-rose-500/30 p-4 space-y-3 shadow-sm select-none"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{t('settings.scraper.errorTitle')} ({stdError.category})</span>
          </div>

          {onRenewSession && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRenewSession}
              disabled={isStarting}
              className="h-7 text-xs border-rose-500/30 text-rose-200 hover:bg-rose-500/20 cursor-pointer"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1.5', isStarting && 'animate-spin')} />
              <span>{t('settings.scraper.resumeSync')}</span>
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed pl-6">
          {stdError.message}
        </p>
      </div>
    );
  }

  // Idle state: Clean layout
  return null;
};
