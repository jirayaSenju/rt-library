import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { scraperService, SyncRun } from '@/services/scraperService';
import type { ScraperCategory } from '@/types/scraper';
import type { ScraperSchedulerStatus } from '@/platform/types';

interface AutomaticSyncCardProps {
  categories: ScraperCategory[];
  isCompanionConnected?: boolean;
  onOpenRuTracker?: () => void;
  onReconnectCompanion?: () => void;
}

const PRESETS = [
  { key: '1h', minutes: 60, labelKey: 'settings.scraper.autoSyncPreset1h' },
  { key: '3h', minutes: 180, labelKey: 'settings.scraper.autoSyncPreset3h' },
  { key: '6h', minutes: 360, labelKey: 'settings.scraper.autoSyncPreset6h' },
  { key: '12h', minutes: 720, labelKey: 'settings.scraper.autoSyncPreset12h' },
  { key: '24h', minutes: 1440, labelKey: 'settings.scraper.autoSyncPreset24h' },
];

function formatDateTime(iso: string | null | undefined, localeStr: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = new Intl.DateTimeFormat(localeStr, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);

    if (isToday) {
      return `${timeStr}`;
    }

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

export const AutomaticSyncCard: React.FC<AutomaticSyncCardProps> = ({
  categories,
  isCompanionConnected = false,
  onOpenRuTracker,
  onReconnectCompanion,
}) => {
  const { t, locale } = useI18n();

  const [status, setStatus] = useState<ScraperSchedulerStatus>({
    enabled: false,
    scheduleType: '6h',
    intervalMinutes: 360,
    scope: 'ALL_ENABLED',
    categoryIds: [],
    lastAttemptAt: null,
    lastStartedAt: null,
    nextRunAt: null,
    lastSkipReason: null,
    isCompanionConnected: false,
    isScraperBusy: false,
  });

  const [lastScheduledRun, setLastScheduledRun] = useState<SyncRun | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCategorySelector, setShowCategorySelector] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await scraperService.getSchedulerStatus();
      if (data) {
        setStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch scheduler status:', err);
    }
  }, []);

  const fetchLastScheduledRun = useCallback(async () => {
    try {
      const history = await scraperService.getSyncHistory({ limit: 10 });
      const found = history.runs?.find((r) => r.triggerType === 'SCHEDULED');
      if (found) {
        setLastScheduledRun(found);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchLastScheduledRun();

    const unsub = scraperService.onSchedulerStatusChanged((newStatus) => {
      setStatus(newStatus);
    });

    return () => unsub();
  }, [fetchStatus, fetchLastScheduledRun]);

  const handleToggleEnabled = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      const updated = await scraperService.updateSchedulerConfig({ enabled: checked });
      setStatus(updated);
    } catch (err) {
      console.error('Failed to toggle automatic sync:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSelectPreset = async (presetKey: string, minutes: number) => {
    setIsUpdating(true);
    try {
      const updated = await scraperService.updateSchedulerConfig({
        scheduleType: presetKey,
        intervalMinutes: minutes,
      });
      setStatus(updated);
    } catch (err) {
      console.error('Failed to change schedule frequency:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleScope = async (scope: 'ALL_ENABLED' | 'SELECTED') => {
    setIsUpdating(true);
    try {
      const updated = await scraperService.updateSchedulerConfig({ scope });
      setStatus(updated);
    } catch (err) {
      console.error('Failed to change schedule scope:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleCategory = async (catId: string) => {
    const current = status.categoryIds || [];
    const next = current.includes(catId)
      ? current.filter((id) => id !== catId)
      : [...current, catId];

    try {
      const updated = await scraperService.updateSchedulerConfig({ categoryIds: next });
      setStatus(updated);
    } catch (err) {
      console.error('Failed to update scheduled categories:', err);
    }
  };

  // Determine operational status badge
  let badgeLabel = t('settings.scraper.autoSyncStatusOff');
  let badgeColor = 'border-neutral-700 text-neutral-400 bg-neutral-800/20';

  const effectiveConnected = status.isCompanionConnected || isCompanionConnected;

  if (status.enabled) {
    if (status.lastSkipReason === 'VERIFICATION_REQUIRED') {
      badgeLabel = t('settings.scraper.autoSyncStatusVerification');
      badgeColor = 'border-amber-500/40 text-amber-400 bg-amber-500/10';
    } else if (status.lastSkipReason === 'NO_RUTRACKER_TAB') {
      badgeLabel = t('settings.scraper.autoSyncStatusWaitingTab');
      badgeColor = 'border-amber-500/40 text-amber-400 bg-amber-500/10';
    } else if (!effectiveConnected) {
      badgeLabel = t('settings.scraper.autoSyncStatusWaitingCompanion');
      badgeColor = 'border-amber-500/40 text-amber-400 bg-amber-500/10';
    } else if (status.isScraperBusy) {
      badgeLabel = t('settings.scraper.autoSyncStatusBusy');
      badgeColor = 'border-blue-500/40 text-blue-400 bg-blue-500/10';
    } else {
      badgeLabel = t('settings.scraper.autoSyncStatusActive');
      badgeColor = 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10';
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs">
      {/* Header with Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Clock className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {t('settings.scraper.autoSyncTitle')}
              </h3>
              <Badge variant="outline" className={cn('text-[10px] font-mono uppercase tracking-wider', badgeColor)}>
                {badgeLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.scraper.autoSyncDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Switch
            checked={status.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={isUpdating}
            aria-label={t('settings.scraper.autoSyncEnabled')}
          />
        </div>
      </div>

      {/* Explicit App-Open Explanation Notice (Requirement 13) */}
      <div className="text-[11px] text-muted-foreground bg-secondary/30 border border-border/40 rounded-lg p-2.5 flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <span>
          {status.scheduledTransport === 'EMBEDDED_ELECTRON'
            ? t('settings.scraper.autoSyncNoticeEmbedded')
            : t('settings.scraper.autoSyncNotice')}
        </span>
      </div>

      {/* Actionable Skip Warning Banner (at due time) */}
      {status.enabled && status.lastSkipReason && (
        <div className="text-xs rounded-lg p-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in-0 duration-150 bg-amber-500/10 border-amber-500/20 text-amber-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              {status.lastSkipReason === 'COMPANION_DISCONNECTED' && t('settings.scraper.autoSyncSkipCompanionDesc')}
              {status.lastSkipReason === 'NO_RUTRACKER_TAB' && t('settings.scraper.autoSyncSkipNoTabDesc')}
              {status.lastSkipReason === 'VERIFICATION_REQUIRED' && t('settings.scraper.autoSyncSkipVerificationDesc')}
              {status.lastSkipReason === 'SCRAPER_BUSY' && t('settings.scraper.autoSyncStatusBusy')}
              {status.lastSkipReason === 'NO_ENABLED_CATEGORIES' && t('settings.scraper.noCategoriesSelected')}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {status.lastSkipReason === 'COMPANION_DISCONNECTED' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReconnectCompanion}
                className="h-7 px-2.5 text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t('settings.scraper.reconnect')}</span>
              </Button>
            )}

            {status.lastSkipReason === 'VERIFICATION_REQUIRED' && status.scheduledTransport === 'EMBEDDED_ELECTRON' && (
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  try {
                    await scraperService.embeddedVerify();
                  } catch (_) {}
                }}
                className="h-7 px-2.5 text-xs gap-1 bg-amber-500 hover:bg-amber-600 text-white font-medium"
              >
                <ShieldCheck className="h-3 w-3" />
                <span>{t('settings.scraper.verifyNow')}</span>
              </Button>
            )}

            {(status.lastSkipReason === 'NO_RUTRACKER_TAB' || (status.lastSkipReason === 'VERIFICATION_REQUIRED' && status.scheduledTransport !== 'EMBEDDED_ELECTRON')) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenRuTracker}
                className="h-7 px-2.5 text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              >
                <ExternalLink className="h-3 w-3" />
                <span>{t('settings.scraper.openRuTracker')}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {status.enabled && (
        <div className="space-y-4 pt-1 border-t border-border/40">
          {/* Frequency Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              {t('settings.scraper.autoSyncFrequency')}
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESETS.map((p) => {
                const isActive = status.scheduleType === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handleSelectPreset(p.key, p.minutes)}
                    disabled={isUpdating}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none',
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    {t(p.labelKey as any)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              {t('settings.scraper.autoSyncScope')}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleToggleScope('ALL_ENABLED')}
                disabled={isUpdating}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none',
                  status.scope === 'ALL_ENABLED'
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-secondary'
                )}
              >
                {t('settings.scraper.autoSyncScopeAll')}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleToggleScope('SELECTED');
                  setShowCategorySelector(true);
                }}
                disabled={isUpdating}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none flex items-center gap-1',
                  status.scope === 'SELECTED'
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground hover:bg-secondary'
                )}
              >
                <span>{t('settings.scraper.autoSyncScopeSelected')}</span>
                {status.scope === 'SELECTED' && status.categoryIds.length > 0 && (
                  <span className="font-mono text-[10px] px-1 rounded-full bg-primary-foreground/20">
                    {status.categoryIds.length}
                  </span>
                )}
              </button>
            </div>

            {/* Expandable Category Checkboxes if scope is SELECTED */}
            {status.scope === 'SELECTED' && showCategorySelector && (
              <div className="p-3 bg-secondary/20 border border-border/50 rounded-lg space-y-2 max-h-48 overflow-y-auto mt-2">
                <div className="text-[11px] text-muted-foreground font-medium">
                  {t('settings.scraper.selectCategory')}:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {categories.map((cat) => {
                    const isSelected = status.categoryIds.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={cn(
                          'flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer select-none border transition-colors',
                          isSelected
                            ? 'bg-primary/10 border-primary/30 text-foreground'
                            : 'bg-card/40 border-border/40 text-muted-foreground hover:bg-secondary/30'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleCategory(cat.id)}
                          className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <span className="truncate">{cat.name || cat.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Metrics Grid: Next Run & Last Automatic Run */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/40">
              <span className="text-[11px] text-muted-foreground block">
                {t('settings.scraper.autoSyncNextRun')}
              </span>
              <span className="text-xs font-semibold font-mono text-foreground mt-0.5 block">
                {status.nextRunAt ? formatDateTime(status.nextRunAt, locale) : '—'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/40">
              <span className="text-[11px] text-muted-foreground block">
                {t('settings.scraper.autoSyncLastRun')}
              </span>
              <span className="text-xs font-mono text-foreground mt-0.5 block truncate">
                {lastScheduledRun ? (
                  <>
                    <span className="text-emerald-500 font-semibold">
                      +{lastScheduledRun.newItems} new
                    </span>{' '}
                    · {formatDateTime(lastScheduledRun.finishedAt || lastScheduledRun.startedAt, locale)}
                  </>
                ) : status.lastStartedAt ? (
                  formatDateTime(status.lastStartedAt, locale)
                ) : (
                  '—'
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
