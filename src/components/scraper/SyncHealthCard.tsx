import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  History,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { scraperService, SyncHealthSummary, SyncHealthCategory } from '@/services/scraperService';

interface SyncHealthCardProps {
  onNavigateToHistory?: () => void;
  onSyncCategory?: (categoryId: string) => void;
  isSyncing?: boolean;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

function formatDateTime(iso: string | null | undefined, localeStr: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(localeStr, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export const SyncHealthCard: React.FC<SyncHealthCardProps> = ({
  onNavigateToHistory,
  onSyncCategory,
  isSyncing = false,
}) => {
  const { t, locale } = useI18n();
  const [health, setHealth] = useState<SyncHealthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchHealth = async () => {
    try {
      const data = await scraperService.getSyncHealth();
      setHealth(data);
    } catch (err) {
      console.warn('Failed to load sync health:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // Refresh when sync completes
  useEffect(() => {
    if (!isSyncing) {
      fetchHealth();
    }
  }, [isSyncing]);

  if (isLoading && !health) {
    return null;
  }

  const lastSuccess = health?.lastSuccessfulSync;
  const lastRun = health?.lastRun;
  const categories = health?.categories || [];
  const healthyCount = health?.healthyCategoriesCount || 0;
  const attentionCount = health?.needingAttentionCount || 0;
  const totalCategories = categories.length;

  const renderStatusBadge = (status: SyncHealthCategory['status']) => {
    switch (status) {
      case 'UP_TO_DATE':
        return (
          <Badge variant="outline" className="text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 py-0.5">
            <CheckCircle2 className="h-3 w-3" />
            {t('settings.scraper.statusUpToDate')}
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge variant="outline" className="text-[11px] font-medium bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            {t('settings.scraper.statusWarning')}
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="text-[11px] font-medium bg-destructive/10 text-destructive border-destructive/20 gap-1 py-0.5">
            <XCircle className="h-3 w-3" />
            {t('settings.scraper.statusFailed')}
          </Badge>
        );
      case 'NEVER_SYNCED':
      default:
        return (
          <Badge variant="outline" className="text-[11px] font-medium bg-muted text-muted-foreground border-border gap-1 py-0.5">
            <Clock className="h-3 w-3" />
            {t('settings.scraper.statusNeverSynced')}
          </Badge>
        );
    }
  };

  const renderRunStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1 py-0.5">
            <CheckCircle2 className="h-3 w-3" />
            {t('settings.scraper.statusCompleted')}
          </Badge>
        );
      case 'COMPLETED_WITH_WARNINGS':
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            {t('settings.scraper.statusCompletedWithWarnings')}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-muted text-muted-foreground border-border gap-1 py-0.5">
            <Clock className="h-3 w-3" />
            {t('settings.scraper.statusCancelled')}
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-destructive/10 text-destructive border-destructive/20 gap-1 py-0.5">
            <XCircle className="h-3 w-3" />
            {t('settings.scraper.statusFailed')}
          </Badge>
        );
      case 'INTERRUPTED':
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            {t('settings.scraper.statusInterrupted')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20 gap-1 py-0.5">
            <Activity className="h-3 w-3" />
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs">
      {/* Header with Title and Action CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground tracking-tight">
              {t('settings.scraper.syncHealthTitle')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('settings.scraper.syncHealthDesc')}
            </p>
          </div>
        </div>

        {onNavigateToHistory && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNavigateToHistory}
            className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <History className="h-3.5 w-3.5" />
            <span>{t('settings.scraper.viewSyncHistory')}</span>
          </Button>
        )}
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Last Successful Sync */}
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.scraper.lastSuccessfulSyncLabel')}
          </div>
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            {lastSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>{formatDateTime(lastSuccess.finishedAt, locale)}</span>
              </>
            ) : (
              <span className="text-muted-foreground font-normal">{t('settings.scraper.lastSyncNever')}</span>
            )}
          </div>
          {lastSuccess && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span className="text-emerald-500 font-mono">+{lastSuccess.newItems}</span>
              <span>·</span>
              <span>{formatDuration(lastSuccess.durationMs)}</span>
            </div>
          )}
        </div>

        {/* Card 2: Last Run */}
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.scraper.lastRunLabel')}
          </div>
          <div className="flex items-center gap-2">
            {lastRun ? (
              <>
                {renderRunStatusBadge(lastRun.status)}
                <span className="text-xs text-muted-foreground font-mono">
                  {formatDateTime(lastRun.startedAt, locale)}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          {lastRun?.errorSummary && (
            <p className="text-[11px] text-destructive truncate" title={lastRun.errorSummary}>
              {lastRun.errorSummary}
            </p>
          )}
        </div>

        {/* Card 3: Categories Health Summary */}
        <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.scraper.categoriesSummaryTitle')}
          </div>
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            {attentionCount === 0 && healthyCount > 0 ? (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            )}
            <span>
              {t('settings.scraper.categoriesHealthySummary', {
                healthy: healthyCount,
                total: totalCategories,
              })}
            </span>
          </div>
          {attentionCount > 0 && (
            <div className="text-[11px] text-amber-500 font-medium">
              {t('settings.scraper.categoriesAttentionSummary', { count: attentionCount })}
            </div>
          )}
        </div>
      </div>

      {/* Expandable Per-Category Breakdown */}
      {categories.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/40">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground py-1 transition-colors select-none"
          >
            <span>{t('settings.scraper.categoryStatusListTitle')} ({categories.length})</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {isExpanded && (
            <div className="space-y-1.5 pt-1 animate-in fade-in-0 duration-150">
              {categories.map((cat) => (
                <div
                  key={cat.categoryId}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-border/40 transition-colors text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-semibold text-foreground truncate">{cat.categoryName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {cat.lastSuccessfulSyncAt
                        ? `${t('settings.scraper.lastSyncLabel')}: ${formatDateTime(cat.lastSuccessfulSyncAt, locale)}`
                        : t('settings.scraper.lastSyncNever')}
                    </div>
                    {cat.lastError && (
                      <div className="text-[10px] text-destructive truncate" title={cat.lastError}>
                        {cat.lastError}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderStatusBadge(cat.status)}
                    {onSyncCategory && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSyncing}
                        onClick={() => onSyncCategory(cat.categoryId)}
                        className="h-7 px-2 text-[11px] gap-1 hover:bg-secondary"
                        title={t('settings.scraper.syncCategoryAction')}
                      >
                        <RotateCw className="h-3 w-3" />
                        <span className="hidden sm:inline">{t('settings.scraper.syncCategoryAction')}</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

