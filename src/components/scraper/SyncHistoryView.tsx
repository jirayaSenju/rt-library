import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Trash2,
  History,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { useScraper } from '@/hooks/useScraper';
import { scraperService, SyncRun, SyncRunDetails, SyncRunStatus } from '@/services/scraperService';
import { toast } from 'sonner';

export interface SyncHistoryViewProps {
  onBack: () => void;
  onSyncCategory?: (categoryId: string) => void;
  initialRunId?: string | null;
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export const SyncHistoryView: React.FC<SyncHistoryViewProps> = ({ onBack, onSyncCategory, initialRunId }) => {
  const { t, locale } = useI18n();
  const { isRunning, isPaused, progress, state } = useScraper();

  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<'ALL' | 'COMPLETED' | 'WARNINGS' | 'FAILED' | 'CANCELLED'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(initialRunId || null);
  const [runDetailsMap, setRunDetailsMap] = useState<Record<string, SyncRunDetails>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    if (initialRunId) {
      setExpandedRunId(initialRunId);
      scraperService.getSyncRunDetails(initialRunId).then((details) => {
        if (details) {
          setRunDetailsMap((prev) => ({ ...prev, [initialRunId]: details }));
        }
      }).catch(() => {});
    }
  }, [initialRunId]);

  const loadRuns = async (resetOffset = false, currentFilter = filter) => {
    setIsLoading(true);
    try {
      const newOffset = resetOffset ? 0 : offset;
      const res = await scraperService.getSyncHistory({
        limit: LIMIT,
        offset: newOffset,
        statusFilter: currentFilter,
      });
      if (resetOffset) {
        setRuns(res.runs);
        setOffset(0);
      } else {
        setRuns((prev) => [...prev, ...res.runs]);
      }
      setTotalCount(res.total);
    } catch (err) {
      console.warn('Failed to load sync history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRuns(true, filter);
  }, [filter]);

  const handleFilterChange = (newFilter: 'ALL' | 'COMPLETED' | 'WARNINGS' | 'FAILED' | 'CANCELLED') => {
    setFilter(newFilter);
    setOffset(0);
  };

  const handleLoadMore = async () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    try {
      const res = await scraperService.getSyncHistory({
        limit: LIMIT,
        offset: nextOffset,
        statusFilter: filter,
      });
      setRuns((prev) => [...prev, ...res.runs]);
      setTotalCount(res.total);
    } catch (err) {
      console.warn('Failed to load more runs:', err);
    }
  };

  const toggleExpand = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!runDetailsMap[runId]) {
      setLoadingDetailsId(runId);
      try {
        const details = await scraperService.getSyncRunDetails(runId);
        if (details) {
          setRunDetailsMap((prev) => ({ ...prev, [runId]: details }));
        }
      } catch (err) {
        console.warn('Failed to load run details:', err);
      } finally {
        setLoadingDetailsId(null);
      }
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all past synchronization history?')) return;
    try {
      await scraperService.clearSyncHistory();
      toast.success(t('common.success') || 'History cleared');
      loadRuns(true, filter);
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear history');
    }
  };

  const renderStatusBadge = (status: SyncRunStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <Badge variant="outline" className="text-xs font-medium bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 py-0.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{t('settings.scraper.statusCompleted')}</span>
          </Badge>
        );
      case 'COMPLETED_WITH_WARNINGS':
        return (
          <Badge variant="outline" className="text-xs font-medium bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1.5 py-0.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{t('settings.scraper.statusCompletedWithWarnings')}</span>
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="text-xs font-medium bg-muted text-muted-foreground border-border gap-1.5 py-0.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{t('settings.scraper.statusCancelled')}</span>
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="text-xs font-medium bg-destructive/10 text-destructive border-destructive/20 gap-1.5 py-0.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{t('settings.scraper.statusFailed')}</span>
          </Badge>
        );
      case 'INTERRUPTED':
        return (
          <Badge variant="outline" className="text-xs font-medium bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1.5 py-0.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{t('settings.scraper.statusInterrupted')}</span>
          </Badge>
        );
      case 'RUNNING':
      default:
        return (
          <Badge variant="outline" className="text-xs font-medium bg-primary/10 text-primary border-primary/20 gap-1.5 py-0.5 animate-pulse">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>{t('activityBar.statusScraping')}</span>
          </Badge>
        );
    }
  };

  const renderCategoryStatusBadge = (catStatus: string) => {
    switch (catStatus) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            {t('settings.scraper.statusCompleted')}
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            {t('settings.scraper.statusWarning')}
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <XCircle className="h-3 w-3" />
            {t('settings.scraper.statusFailed')}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Clock className="h-3 w-3" />
            {t('settings.scraper.statusCancelled')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            {catStatus}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-4xl animate-in fade-in-0 duration-150">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('settings.scraper.backToScraperSettings')}</span>
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <h2 className="text-sm font-bold text-foreground">
            {t('settings.scraper.syncHistoryTitle')}
          </h2>
        </div>

        {runs.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearHistory}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-destructive gap-1.5 self-start sm:self-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('common.clear') || 'Clear'}</span>
          </Button>
        )}
      </div>

      {/* Live Run Banner if scraper is currently running */}
      {isRunning && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <strong className="text-xs font-semibold text-foreground">
                {isPaused ? t('settings.scraper.statusPaused') : t('settings.scraper.statusSyncing')}
              </strong>
              {progress?.categoryName && (
                <span className="text-xs text-muted-foreground font-mono">
                  · {progress.categoryName}
                </span>
              )}
            </div>
            <div className="text-xs text-primary font-mono font-medium">
              +{progress?.newItems || 0} {t('settings.scraper.newItemsLabel').toLowerCase()}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
            {progress?.currentPage != null && (
              <span>
                {t('settings.scraper.pageTotal')}: {progress.currentPage} / {progress.totalPages || 1}
              </span>
            )}
            {progress?.elapsedMs != null && (
              <span>· {formatDuration(progress.elapsedMs)}</span>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(['ALL', 'COMPLETED', 'WARNINGS', 'FAILED', 'CANCELLED'] as const).map((tab) => {
          const isActive = filter === tab;
          let label = t('settings.scraper.filterAll');
          if (tab === 'COMPLETED') label = t('settings.scraper.filterCompleted');
          if (tab === 'WARNINGS') label = t('settings.scraper.filterWarnings');
          if (tab === 'FAILED') label = t('settings.scraper.filterFailed');
          if (tab === 'CANCELLED') label = t('settings.scraper.filterCancelled');

          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleFilterChange(tab)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-secondary"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Runs List */}
      {runs.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
          <History className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
          <h4 className="text-xs font-semibold text-foreground">
            {t('settings.scraper.emptyHistoryTitle')}
          </h4>
          <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
            {t('settings.scraper.emptyHistoryDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const isExpanded = expandedRunId === run.id;
            const details = runDetailsMap[run.id];
            const isLoadingDetails = loadingDetailsId === run.id;

            const scopeText =
              run.scopeType === 'SINGLE_CATEGORY'
                ? run.scopeCategoryId || 'Single category'
                : `All categories (${run.categoriesTotal})`;

            const transportText =
              run.transport === 'BROWSER_COMPANION'
                ? 'Browser Companion'
                : run.transport === 'MANUAL_IMPORT'
                ? 'Manual Import'
                : 'Playwright';

            const modeText =
              run.mode === 'FULL_SCAN'
                ? 'Full Scan'
                : run.mode === 'HTML_IMPORT'
                ? 'HTML Import'
                : 'Incremental';

            const triggerText =
              run.triggerType === 'SCHEDULED'
                ? t('settings.scraper.triggerScheduled')
                : run.triggerType === 'FIRST_RUN'
                ? t('settings.scraper.triggerFirstRun')
                : null;

            return (
              <div
                key={run.id}
                className="rounded-xl border border-border bg-card transition-colors shadow-xs overflow-hidden"
              >
                {/* Clickable Header Row */}
                <button
                  type="button"
                  onClick={() => toggleExpand(run.id)}
                  className="w-full p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-secondary/20 transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {renderStatusBadge(run.status)}
                    <span className="text-xs font-semibold text-foreground">
                      {formatDateTime(run.startedAt, locale)}
                    </span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-xs text-muted-foreground">
                      {triggerText ? `${triggerText} · ` : ''}{modeText} · {scopeText}
                    </span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {transportText}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-emerald-500 font-semibold">+{run.newItems} new</span>
                      {run.updatedItems > 0 && (
                        <span className="text-muted-foreground">· {run.updatedItems} upd</span>
                      )}
                      <span className="text-muted-foreground">· {formatDuration(run.durationMs)}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-secondary/10 p-3.5 space-y-3 text-xs animate-in fade-in-0 duration-150">
                    {/* Error Summary if failed */}
                    {run.errorSummary && (
                      <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                        <strong>Error: </strong>
                        <span>{run.errorSummary}</span>
                      </div>
                    )}

                    {/* Operational Breakdown Data */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-card/60 p-2.5 rounded-lg border border-border/40">
                      <div>
                        <span className="text-muted-foreground">Started: </span>
                        <span className="text-foreground">{formatDateTime(run.startedAt, locale)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Finished: </span>
                        <span className="text-foreground">{formatDateTime(run.finishedAt, locale)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Duration: </span>
                        <span className="text-foreground">{formatDuration(run.durationMs)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Trigger: </span>
                        <span className="text-foreground">
                          {run.triggerType === 'SCHEDULED'
                            ? t('settings.scraper.triggerScheduled')
                            : run.triggerType === 'FIRST_RUN'
                            ? t('settings.scraper.triggerFirstRun')
                            : t('settings.scraper.triggerManual')}
                        </span>
                      </div>
                    </div>

                    {/* Category Breakdown Table */}
                    {isLoadingDetails ? (
                      <div className="flex items-center justify-center p-4 text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading details...</span>
                      </div>
                    ) : details?.categories && details.categories.length > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('settings.scraper.categoryStatusListTitle')}
                        </div>
                        <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/40">
                          {details.categories.map((cat) => (
                            <div
                              key={cat.id}
                              className="flex items-center justify-between p-2.5 bg-card/40 hover:bg-secondary/30 transition-colors text-xs gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-foreground truncate">
                                  {cat.categoryNameSnapshot || cat.categoryId}
                                </div>
                                {cat.errorSummary && (
                                  <div className="text-[10px] text-destructive truncate">
                                    {cat.errorSummary}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  +{cat.newItems} new
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {formatDuration(cat.durationMs)}
                                </span>
                                {renderCategoryStatusBadge(cat.status)}
                                {onSyncCategory && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onSyncCategory(cat.categoryId)}
                                    className="h-6 px-1.5 text-[10px] gap-1 hover:bg-secondary"
                                    title={t('settings.scraper.syncCategoryAction')}
                                  >
                                    <RotateCw className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Load More */}
      {runs.length < totalCount && (
        <div className="flex flex-col items-center justify-center pt-2 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoading}
            className="text-xs h-8 px-4"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {t('settings.scraper.loadMoreHistory')}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            {t('settings.scraper.showingRunsCount', {
              count: runs.length,
              total: totalCount,
            })}
          </span>
        </div>
      )}
    </div>
  );
};

