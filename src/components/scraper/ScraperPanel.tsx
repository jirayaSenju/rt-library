import React, { useState, useEffect } from 'react';
import { useScraper } from '../../hooks/useScraper';
import { ScraperProgress } from './ScraperProgress';
import { ScraperLogs } from './ScraperLogs';
import {
  Play,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings2,
  Info,
  Upload,
  Download,
  Copy,
  ExternalLink,
  Globe,
  Radio,
  Clock,
  Terminal,
  HelpCircle,
  RotateCcw,
  Cpu,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { CategoryManagement } from './CategoryManagement';
import { ScraperCategory } from '@/types/scraper';
import { scraperService } from '@/services/scraperService';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingRow } from '@/components/settings/SettingRow';
import { TemporaryConnectionNotice } from './TemporaryConnectionNotice';
import { useCompanionConnection } from '@/hooks/useCompanionConnection';
import { SyncHealthCard } from './SyncHealthCard';
import { AutomaticSyncCard } from './AutomaticSyncCard';
import { toast } from 'sonner';

interface ScraperPanelProps {
  onNavigateToCategories?: () => void;
  onNavigateToHistory?: () => void;
}

export const ScraperPanel: React.FC<ScraperPanelProps> = ({ onNavigateToCategories, onNavigateToHistory }) => {
  const { t } = useI18n();
  const [categoriesList, setCategoriesList] = useState<ScraperCategory[]>([]);
  const {
    state,
    access,
    progress,
    logs,
    totalLogEntries,
    isRunning,
    error,
    startScraper,
    renewSession,
    probeAccess,
    pauseScraper,
    resumeScraper,
    cancelScraper,
    clearLogs,
    getCurrentLog,
    exportLog,
    openLogsFolder,
  } = useScraper();

  // Scraper options state
  const [category, setCategory] = useState('all');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isFallbacksOpen, setIsFallbacksOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Switch states
  const [full, setFull] = useState(false);
  const [refreshScreenshots, setRefreshScreenshots] = useState(false);
  const [refreshSizes, setRefreshSizes] = useState(false);
  const [refreshFiles, setRefreshFiles] = useState(false);
  const [ignoreEarlyStop, setIgnoreEarlyStop] = useState(false);
  const [savedRefreshState, setSavedRefreshState] = useState({
    screenshots: false,
    sizes: false,
    files: false,
  });

  // Transport and connection states
  const [activeTransport, setActiveTransport] = useState<string>('BROWSER_COMPANION');
  const [transportPreference, setTransportPreferenceState] = useState<string>('AUTOMATIC');
  const [isEmbeddedPromoted, setIsEmbeddedPromotedState] = useState<boolean>(false);
  const [embeddedStatus, setEmbeddedStatus] = useState<'NOT_CHECKED' | 'CHECKING' | 'READY' | 'VERIFICATION_REQUIRED' | 'ERROR'>('NOT_CHECKED');
  const companion = useCompanionConnection();
  const [copiedField, setCopiedField] = useState<'port' | 'token' | 'all' | 'code' | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const [enableBackgroundNotifications, setEnableBackgroundNotifications] = useState<boolean>(() => {
    return localStorage.getItem('rt_library_bg_notifications') !== 'false';
  });

  const handleToggleBackgroundNotifications = (checked: boolean) => {
    setEnableBackgroundNotifications(checked);
    localStorage.setItem('rt_library_bg_notifications', String(checked));
  };

  const handleTransportChange = async (newPref: string) => {
    setTransportPreferenceState(newPref);
    try {
      await scraperService.setTransportPreference(newPref);
      const res = await scraperService.getTransportPreference();
      if (res?.activeTransport) setActiveTransport(res.activeTransport);
      toast.success(t('common.saved') || 'Saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update transport preference');
    }
  };

  // Status feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoringDb, setIsRestoringDb] = useState(false);

  const handleRestoreDatabase = async () => {
    try {
      setIsRestoringDb(true);
      const res = await window.rtLibrary?.database?.restoreBackup?.();
      if (res?.canceled) {
        return;
      }
      if (res?.success) {
        toast.success(t('settings.scraper.restoreDatabaseSuccess'));
        const cats = await scraperService.getCategories();
        setCategoriesList(cats);
        refreshSyncInfo();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Restore failed');
    } finally {
      setIsRestoringDb(false);
    }
  };

  const handleCopyText = (field: 'port' | 'token' | 'all' | 'code', text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(t('common.copied') || 'Copied');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFullChange = (checked: boolean) => {
    if (checked) {
      setSavedRefreshState({
        screenshots: refreshScreenshots,
        sizes: refreshSizes,
        files: refreshFiles,
      });
      setFull(true);
    } else {
      setFull(false);
      setRefreshScreenshots(savedRefreshState.screenshots);
      setRefreshSizes(savedRefreshState.sizes);
      setRefreshFiles(savedRefreshState.files);
    }
  };

  const refreshSyncInfo = () => {
    const stored = localStorage.getItem('rt_library_last_sync_time');
    if (stored) setLastSyncTime(stored);

    window.rtLibrary?.library?.getCategories?.().then((cats: any[]) => {
      if (Array.isArray(cats) && cats.length > 0) {
        const dates = cats.map((c) => c.lastScrapedAt).filter(Boolean).sort().reverse();
        if (dates[0]) setLastSyncTime(dates[0]);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    scraperService.getCategories().then((cats) => {
      setCategoriesList(cats);
    }).catch((err) => {
      console.error('Failed to load categories for scraper panel:', err);
    });

    scraperService.getTransportPreference?.()?.then((res) => {
      if (res?.preference) setTransportPreferenceState(res.preference);
      if (res?.activeTransport) setActiveTransport(res.activeTransport);
      if (res?.isPromoted !== undefined) setIsEmbeddedPromotedState(res.isPromoted);
    })?.catch(() => {});

    refreshSyncInfo();
  }, []);

  useEffect(() => {
    scraperService.getActiveTransport?.()?.then((tr) => {
      if (tr) setActiveTransport(tr);
    })?.catch(() => {});
  }, [companion.state]);



  const handleEmbeddedProbe = async () => {
    setEmbeddedStatus('CHECKING');
    try {
      toast.info(t('settings.scraper.checkingAccess'));
      const res = await scraperService.embeddedProbe();
      if (res?.status === 'FORUM_READY' || res?.forumDetected) {
        setEmbeddedStatus('READY');
        toast.success(t('settings.scraper.embeddedSessionReady', { count: res.topicCount || 0 }));
      } else if (res?.status === 'CHALLENGE_REQUIRED') {
        setEmbeddedStatus('VERIFICATION_REQUIRED');
        toast.warning(t('settings.scraper.embeddedVerificationRequired'));
      } else {
        setEmbeddedStatus('ERROR');
        toast.error(`${t('settings.scraper.status') || 'Status'}: ${res?.status || 'Unknown'}`);
      }
    } catch (err: any) {
      setEmbeddedStatus('ERROR');
      toast.error(err?.message || t('settings.scraper.accessCheckFailed'));
    }
  };

  const handleEmbeddedVerify = async () => {
    try {
      toast.info('Opening in-app verification window...');
      const res = await scraperService.embeddedVerify();
      if (res?.success) {
        setEmbeddedStatus('READY');
        toast.success('In-app verification completed successfully!');
      }
    } catch (err: any) {
      if (err?.code !== 'VERIFICATION_CANCELLED_BY_USER') {
        toast.error(err?.message || 'Verification failed');
      }
    }
  };

  const handleEmbeddedReset = async () => {
    try {
      await scraperService.embeddedResetSession();
      toast.success(t('settings.scraper.sessionResetSuccess'));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset session');
    }
  };

  const handleSetTransportPreference = async (val: string) => {
    setTransportPreferenceState(val);
    try {
      const res = await scraperService.setTransportPreference(val);
      if (res?.activeTransport) {
        setActiveTransport(res.activeTransport);
      } else {
        const prefRes = await scraperService.getTransportPreference();
        if (prefRes?.activeTransport) setActiveTransport(prefRes.activeTransport);
      }
      toast.success(t('settings.scraper.transportUpdated') || 'Transport updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update transport preference');
    }
  };

  const handleStart = async () => {
    if (isStarting || isRunning) return;

    const effectiveTransport = transportPreference !== 'AUTOMATIC' ? transportPreference : activeTransport;

    // Requirement 23: Intercept if companion is active transport and not READY
    if (effectiveTransport === 'BROWSER_COMPANION' && companion.state !== 'READY') {
      if (companion.state === 'DISCONNECTED') {
        toast.error(t('settings.scraper.recoveryPromptConnect'));
      } else if (companion.state === 'CONNECTING') {
        toast.warning(t('settings.scraper.recoveryPromptConnecting'));
      } else if (companion.state === 'CONNECTED') {
        toast.warning(t('settings.scraper.recoveryPromptCheckAccess'));
      } else if (companion.state === 'VERIFICATION_REQUIRED') {
        toast.error(t('settings.scraper.companionVerificationRequired'));
      } else if (companion.state === 'NO_RUTRACKER_TAB') {
        toast.error(t('settings.scraper.noRuTrackerTabMessage'));
      } else if (companion.state === 'TIMEOUT') {
        toast.error(t('settings.scraper.timeoutMessage'));
      } else if (companion.state === 'NOT_INSTALLED') {
        toast.error(t('settings.scraper.notInstalledMessage'));
      } else {
        toast.error(t('settings.scraper.recoveryPromptConnect'));
      }
      return;
    }

    // Requirement 13: Zero enabled categories guard
    if (category === 'all' && enabledCategoriesCount === 0) {
      toast.error(t('settings.scraper.noCategoriesSelected'));
      return;
    }

    setIsStarting(true);
    setActionError(null);
    try {
      const result = await startScraper({
        full,
        category: category === 'all' ? null : category,
        refreshScreenshots,
        refreshSizes,
        refreshFiles,
        ignoreEarlyStop: full || ignoreEarlyStop,
        transport: effectiveTransport !== 'NONE' ? effectiveTransport : undefined,
      });
      if (result && !result.success && result.blocked) {
        setActionError(t('settings.scraper.sessionRequired'));
      } else {
        const now = new Date().toISOString();
        localStorage.setItem('rt_library_last_sync_time', now);
        setLastSyncTime(now);
      }
    } catch (err: any) {
      if (!err.message?.includes('SCRAPER_ALREADY_RUNNING')) {
        setActionError(err.message || t('settings.scraper.error'));
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleCheckAccess = async () => {
    if (isStarting || isRunning) return;
    setIsStarting(true);
    setActionError(null);
    try {
      const effectiveTransport = transportPreference !== 'AUTOMATIC' ? transportPreference : activeTransport;
      if (effectiveTransport === 'EMBEDDED_ELECTRON') {
        const res = await scraperService.embeddedProbe({ categoryId: category === 'all' ? undefined : category });
        if (res && ['READY', 'ACCESSIBLE', 'FORUM_READY'].includes(res.status)) {
          setEmbeddedStatus('READY');
          toast.success(t('settings.scraper.builtInProbeReady') || 'Session accessible');
        } else {
          setEmbeddedStatus('VERIFICATION_REQUIRED');
          toast.warning(t('settings.scraper.builtInProbeBlocked') || 'Verification required');
        }
        return;
      }
      const blocked = access?.results.find((result) =>
        ['INTERACTION_REQUIRED', 'AUTH_REQUIRED'].includes(result.status)
        && (category === 'all' || result.categoryId === category)
      );
      if (blocked) await renewSession({ category: blocked.categoryId || undefined });
      else await probeAccess({ category: category === 'all' ? 'all' : category });
    } catch (err: any) {
      setActionError(err.message || t('settings.scraper.error'));
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelScraper();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  useEffect(() => {
    if (state === 'paused') {
      setIsPausing(false);
    } else if (state === 'running') {
      setIsResuming(false);
    } else if (['idle', 'completed', 'failed'].includes(state)) {
      setIsPausing(false);
      setIsResuming(false);
    }
  }, [state]);

  const handlePause = async () => {
    try {
      setIsPausing(true);
      await pauseScraper();
    } catch (err: any) {
      setActionError(err.message);
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    try {
      setIsResuming(true);
      await resumeScraper();
    } catch (err: any) {
      setActionError(err.message);
      setIsResuming(false);
    }
  };

  const enabledCategoriesCount = categoriesList.filter((c) => c.enabled).length;
  const totalCategoriesCount = categoriesList.length;

  const getTransportLabel = (type: string) => {
    switch (type) {
      case 'EMBEDDED_ELECTRON':
        return t('settings.scraper.transportBuiltIn');
      case 'BROWSER_COMPANION':
        return t('settings.scraper.transportCompanion');
      case 'PLAYWRIGHT':
        return t('settings.scraper.transportPlaywright');
      case 'AUTOMATIC':
        return t('settings.scraper.transportAutomatic').replace(/\s*\(.*\)/, '');
      default:
        return type;
    }
  };

  const effectiveTransport = transportPreference !== 'AUTOMATIC' ? transportPreference : activeTransport;

  // 3-Pillar status resolution (Requirement 2 & 5)
  const isInstalled = Boolean(
    companion.state === 'CONNECTED' ||
    companion.state === 'READY' ||
    companion.connection.extensionVersion ||
    (companion.connection.port && companion.connection.token)
  );
  const isConnected = Boolean(
    companion.state === 'CONNECTED' ||
    companion.state === 'READY' ||
    companion.state === 'CHECKING_ACCESS'
  );
  const isRuTrackerReady = companion.state === 'READY';
  const isVerificationNeeded = companion.state === 'VERIFICATION_REQUIRED';
  const isNoTab = companion.state === 'NO_RUTRACKER_TAB';
  const isTimeout = companion.state === 'TIMEOUT';
  const isCheckingAccess = companion.state === 'CHECKING_ACCESS';

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Synchronization Health Overview & Per-Category Status (V3-75) */}
      <SyncHealthCard
        onNavigateToHistory={onNavigateToHistory}
        onSyncCategory={(catId) => setCategory(catId)}
        isSyncing={isRunning}
      />

      {/* Automatic Scheduled Synchronization (V3-77) */}
      <AutomaticSyncCard
        categories={categoriesList}
        isCompanionConnected={isConnected}
        onOpenRuTracker={() => companion.openRuTracker(category !== 'all' ? category : undefined)}
        onReconnectCompanion={() => companion.connect()}
      />

      {/* ========================================================================= */}
      {/* SECTION A: SYNC STATUS CARD (DASHBOARD) */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Radio}
        title={t('settings.scraper.syncStatusCardTitle')}
        description={t('settings.scraper.statusDescription')}
        action={
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-mono uppercase tracking-wider',
              effectiveTransport === 'EMBEDDED_ELECTRON'
                ? embeddedStatus === 'READY'
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : embeddedStatus === 'VERIFICATION_REQUIRED'
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  : embeddedStatus === 'CHECKING'
                  ? 'border-primary/40 text-primary bg-primary/10'
                  : 'border-neutral-700 text-neutral-400 bg-neutral-800/20'
                : effectiveTransport === 'BROWSER_COMPANION'
                ? isConnected
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : companion.state === 'CONNECTING'
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  : 'border-neutral-700 text-neutral-400 bg-neutral-800/20'
                : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
            )}
          >
            {effectiveTransport === 'EMBEDDED_ELECTRON'
              ? embeddedStatus === 'READY'
                ? t('settings.scraper.rutrackerAccessible')
                : embeddedStatus === 'VERIFICATION_REQUIRED'
                ? t('settings.scraper.rutrackerVerificationRequired')
                : embeddedStatus === 'CHECKING'
                ? t('settings.scraper.checkingAccess')
                : t('settings.scraper.rutrackerUnknown')
              : effectiveTransport === 'BROWSER_COMPANION'
              ? isConnected
                ? t('settings.scraper.statusConnected')
                : companion.state === 'CONNECTING'
                ? t('settings.scraper.statusConnecting')
                : t('settings.scraper.statusDisconnected')
              : t('settings.scraper.statusReady')}
          </Badge>
        }
      >
        <div className="space-y-4 pt-1">
          {/* Status Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Transport Status */}
            <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {effectiveTransport === 'EMBEDDED_ELECTRON'
                  ? t('settings.scraper.transportBuiltIn')
                  : effectiveTransport === 'BROWSER_COMPANION'
                  ? 'Browser Companion'
                  : effectiveTransport === 'PLAYWRIGHT'
                  ? 'Playwright'
                  : 'Auto Transport'}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                {effectiveTransport === 'EMBEDDED_ELECTRON' ? (
                  <>
                    {embeddedStatus === 'CHECKING' ? (
                      <span className="h-2 w-2 rounded-full border border-primary border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          embeddedStatus === 'READY'
                            ? 'bg-emerald-400'
                            : embeddedStatus === 'VERIFICATION_REQUIRED'
                            ? 'bg-amber-400 animate-pulse'
                            : embeddedStatus === 'ERROR'
                            ? 'bg-rose-500'
                            : 'bg-neutral-500'
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        'text-xs font-semibold truncate',
                        embeddedStatus === 'READY'
                          ? 'text-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'text-amber-400'
                          : embeddedStatus === 'CHECKING'
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      )}
                    >
                      {embeddedStatus === 'READY'
                        ? t('settings.scraper.rutrackerAccessible')
                        : embeddedStatus === 'VERIFICATION_REQUIRED'
                        ? t('settings.scraper.rutrackerVerificationRequired')
                        : embeddedStatus === 'CHECKING'
                        ? t('settings.scraper.checkingAccess')
                        : t('settings.scraper.rutrackerUnknown')}
                    </span>
                  </>
                ) : effectiveTransport === 'BROWSER_COMPANION' ? (
                  <>
                    <span className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-emerald-400' : companion.state === 'CONNECTING' ? 'bg-amber-400 animate-pulse' : 'bg-neutral-500')} />
                    <span className={cn('text-xs font-semibold', isConnected ? 'text-emerald-400' : companion.state === 'CONNECTING' ? 'text-amber-400' : 'text-muted-foreground')}>
                      {isConnected
                        ? t('settings.scraper.statusConnected')
                        : companion.state === 'CONNECTING'
                        ? t('settings.scraper.statusConnecting')
                        : t('settings.scraper.statusDisconnected')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">Ready</span>
                  </>
                )}
              </div>
            </div>

            {/* RuTracker Access */}
            <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                RuTracker
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                {effectiveTransport === 'EMBEDDED_ELECTRON' ? (
                  <>
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        embeddedStatus === 'READY'
                          ? 'bg-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-neutral-500'
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-semibold truncate',
                        embeddedStatus === 'READY'
                          ? 'text-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {embeddedStatus === 'READY'
                        ? t('settings.scraper.rutrackerAccessible')
                        : embeddedStatus === 'VERIFICATION_REQUIRED'
                        ? t('settings.scraper.rutrackerVerificationRequired')
                        : embeddedStatus === 'CHECKING'
                        ? t('settings.scraper.checkingAccess')
                        : t('settings.scraper.rutrackerUnknown')}
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        isRuTrackerReady
                          ? 'bg-emerald-400'
                          : isVerificationNeeded || isNoTab || isTimeout
                          ? 'bg-amber-400'
                          : isCheckingAccess
                          ? 'bg-primary animate-pulse'
                          : 'bg-neutral-500'
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-semibold truncate',
                        isRuTrackerReady
                          ? 'text-emerald-400'
                          : isVerificationNeeded || isNoTab || isTimeout
                          ? 'text-amber-400'
                          : 'text-muted-foreground'
                      )}
                    >
                      {isRuTrackerReady
                        ? t('settings.scraper.rutrackerAccessible')
                        : isVerificationNeeded
                        ? t('settings.scraper.rutrackerVerificationRequired')
                        : isNoTab
                        ? t('settings.scraper.rutrackerNoTab')
                        : isTimeout
                        ? t('settings.scraper.timeoutMessage')
                        : isCheckingAccess
                        ? t('onboarding.checkingAccess')
                        : t('settings.scraper.rutrackerUnknown')}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Last Sync */}
            <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t('settings.scraper.lastSyncLabel')}
              </span>
              <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-foreground truncate">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">
                  {lastSyncTime ? new Date(lastSyncTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('settings.scraper.lastSyncNever')}
                </span>
              </div>
            </div>

            {/* Active Sync Method */}
            <div className="p-2.5 rounded-lg border border-border/70 bg-card/60 flex flex-col justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t('settings.scraper.activeSyncMethodLabel')}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs font-semibold text-foreground truncate">
                  {getTransportLabel(effectiveTransport)}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono">
                  {(isEmbeddedPromoted ? effectiveTransport === 'EMBEDDED_ELECTRON' : effectiveTransport === 'BROWSER_COMPANION')
                    ? t('settings.scraper.methodRecommended')
                    : t('settings.scraper.methodAlternative')}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION B: SCRAPER ENGINE & TRANSPORT */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Layers}
        title={t('settings.scraper.scraperTransportTitle')}
        description={t('settings.scraper.scraperTransportDesc')}
      >
        <div className="space-y-4 pt-1">
          {/* Engine Selection Radios / Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. AUTOMATIC */}
            <button
              type="button"
              onClick={() => handleSetTransportPreference('AUTOMATIC')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer min-h-[96px] group',
                transportPreference === 'AUTOMATIC'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                  : 'border-border/70 bg-card/50 hover:bg-card hover:border-border'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center transition-colors',
                      transportPreference === 'AUTOMATIC'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/70 text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none border-primary/30 text-primary bg-primary/10">
                    {t('settings.scraper.methodRecommended')}
                  </span>
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight block">
                  {t('settings.scraper.transportAutomatic').replace(/\s*\(.*\)/, '')}
                </span>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                  {isEmbeddedPromoted
                    ? t('settings.scraper.transportAutomaticDescEmbedded')
                    : t('settings.scraper.transportAutomaticDescCompanion')}
                </p>
              </div>
            </button>

            {/* 2. BUILT-IN SCRAPER (EMBEDDED) */}
            <button
              type="button"
              onClick={() => handleSetTransportPreference('EMBEDDED_ELECTRON')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer min-h-[96px] group',
                transportPreference === 'EMBEDDED_ELECTRON'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                  : 'border-border/70 bg-card/50 hover:bg-card hover:border-border'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center transition-colors',
                      transportPreference === 'EMBEDDED_ELECTRON'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/70 text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Cpu className="h-3.5 w-3.5" />
                  </div>
                  {isEmbeddedPromoted && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none border-primary/30 text-primary bg-primary/10">
                      {t('settings.scraper.methodRecommended')}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight block">
                  {t('settings.scraper.transportBuiltIn')}
                </span>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                  {t('settings.scraper.builtInNotice')}
                </p>
              </div>
            </button>

            {/* 3. BROWSER COMPANION */}
            <button
              type="button"
              onClick={() => handleSetTransportPreference('BROWSER_COMPANION')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer min-h-[96px] group',
                transportPreference === 'BROWSER_COMPANION'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                  : 'border-border/70 bg-card/50 hover:bg-card hover:border-border'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center transition-colors',
                      transportPreference === 'BROWSER_COMPANION'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/70 text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </div>
                  {!isEmbeddedPromoted && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none border-primary/30 text-primary bg-primary/10">
                      {t('settings.scraper.methodRecommended')}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight block">
                  {t('settings.scraper.transportCompanion')}
                </span>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                  {t('settings.scraper.transportCompanionDesc')}
                </p>
              </div>
            </button>

            {/* 4. PLAYWRIGHT */}
            <button
              type="button"
              onClick={() => handleSetTransportPreference('PLAYWRIGHT')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer min-h-[96px] group',
                transportPreference === 'PLAYWRIGHT'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                  : 'border-border/70 bg-card/50 hover:bg-card hover:border-border'
              )}
            >
              <div className="w-full">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center transition-colors',
                      transportPreference === 'PLAYWRIGHT'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/70 text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                  </div>
                </div>
                <span className="text-xs font-semibold text-foreground tracking-tight block">
                  Playwright
                </span>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                  {t('settings.scraper.transportPlaywrightDesc')}
                </p>
              </div>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* CONTEXTUAL VIEW 1: EMBEDDED_ELECTRON (Built-in Scraper) */}
          {/* ========================================================================= */}
          {transportPreference === 'EMBEDDED_ELECTRON' && (
            <div className="p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {embeddedStatus === 'CHECKING' ? (
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <span
                      className={cn(
                        'h-2.5 w-2.5 rounded-full shrink-0',
                        embeddedStatus === 'READY'
                          ? 'bg-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'bg-amber-400 animate-pulse'
                          : embeddedStatus === 'ERROR'
                          ? 'bg-rose-500'
                          : 'bg-neutral-500'
                      )}
                    />
                  )}
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>{t('settings.scraper.builtInScraperStatus')}:</span>
                      <span
                        className={cn(
                          embeddedStatus === 'READY'
                            ? 'text-emerald-400'
                            : embeddedStatus === 'VERIFICATION_REQUIRED'
                            ? 'text-amber-400'
                            : embeddedStatus === 'CHECKING'
                            ? 'text-primary'
                            : embeddedStatus === 'ERROR'
                            ? 'text-rose-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {embeddedStatus === 'READY'
                          ? t('settings.scraper.rutrackerAccessible')
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? t('settings.scraper.rutrackerVerificationRequired')
                          : embeddedStatus === 'CHECKING'
                          ? t('settings.scraper.checkingAccess')
                          : t('settings.scraper.rutrackerUnknown')}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Persistent Electron session (persist:rutracker-v1)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEmbeddedProbe}
                    disabled={embeddedStatus === 'CHECKING'}
                    className="h-7 text-xs border-border/80"
                  >
                    <RefreshCw className={cn('h-3 w-3 mr-1', embeddedStatus === 'CHECKING' && 'animate-spin')} />
                    <span>{t('settings.scraper.testAccess')}</span>
                  </Button>

                  {embeddedStatus === 'VERIFICATION_REQUIRED' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleEmbeddedVerify}
                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium"
                    >
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      <span>{t('settings.scraper.verifyNow')}</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleEmbeddedReset}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    <span>{t('settings.scraper.resetSession')}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CONTEXTUAL VIEW 2: PLAYWRIGHT (Direct Scraper) */}
          {/* ========================================================================= */}
          {transportPreference === 'PLAYWRIGHT' && (
            <div className="p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">
                      {t('settings.scraper.transportPlaywright')}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.scraper.playwrightDesc')}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {t('settings.scraper.directScraperProfileLabel')}: ~/.config/rt-library/scraper-profile
                  </p>
                </div>
                <div className="shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckAccess}
                    disabled={isStarting || isRunning}
                    className="h-8 text-xs font-medium"
                  >
                    <RefreshCw className={cn('h-3 w-3 mr-1.5', (isStarting || isRunning) && 'animate-spin')} />
                    <span>{t('onboarding.verifyAccess')}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}



          {/* ========================================================================= */}
          {/* CONTEXTUAL VIEW 4: AUTOMATIC */}
          {/* ========================================================================= */}
          {transportPreference === 'AUTOMATIC' && (
            <div className="space-y-3">
              {/* Active Resolved Transport Strip */}
              <div className="p-3 rounded-xl border border-border/70 bg-card/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full shrink-0',
                      activeTransport === 'EMBEDDED_ELECTRON'
                        ? embeddedStatus === 'READY'
                          ? 'bg-emerald-400'
                          : embeddedStatus === 'VERIFICATION_REQUIRED'
                          ? 'bg-amber-400 animate-pulse'
                          : embeddedStatus === 'CHECKING'
                          ? 'bg-primary'
                          : 'bg-neutral-500'
                        : isConnected
                        ? 'bg-emerald-400'
                        : companion.state === 'CONNECTING'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-neutral-500'
                    )}
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>{t('settings.scraper.activeSyncMethodLabel')}:</span>
                      <span className="text-primary font-bold">
                        {getTransportLabel(activeTransport)}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 font-mono">
                        {activeTransport === 'EMBEDDED_ELECTRON'
                          ? embeddedStatus === 'READY'
                            ? t('settings.scraper.rutrackerAccessible')
                            : embeddedStatus === 'VERIFICATION_REQUIRED'
                            ? t('settings.scraper.rutrackerVerificationRequired')
                            : t('settings.scraper.rutrackerUnknown')
                          : isConnected
                          ? t('settings.scraper.statusConnected')
                          : t('settings.scraper.statusDisconnected')}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {activeTransport === 'EMBEDDED_ELECTRON'
                        ? 'Persistent Electron session (persist:rutracker-v1)'
                        : 'Desktop Chrome/Brave tab via browser companion'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeTransport === 'EMBEDDED_ELECTRON' ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleEmbeddedProbe}
                        disabled={embeddedStatus === 'CHECKING'}
                        className="h-7 text-xs border-border/80"
                      >
                        <RefreshCw className={cn('h-3 w-3 mr-1', embeddedStatus === 'CHECKING' && 'animate-spin')} />
                        <span>{t('settings.scraper.testAccess')}</span>
                      </Button>
                      {embeddedStatus === 'VERIFICATION_REQUIRED' && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleEmbeddedVerify}
                          className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium"
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          <span>{t('settings.scraper.verifyNow')}</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleEmbeddedReset}
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        <span>{t('settings.scraper.resetSession')}</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        <span>{t('settings.scraper.testAccess')}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={companion.connect}
                        className="h-7 text-xs"
                      >
                        <span>{t('settings.scraper.reconnectButton')}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Collapsible Fallback Configuration */}
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsFallbacksOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-expanded={isFallbacksOpen}
                >
                  {isFallbacksOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>{t('settings.scraper.manageFallbacks')}</span>
                </button>

                {isFallbacksOpen && (
                  <div className="mt-3 p-3.5 bg-background/80 border border-border/80 rounded-xl space-y-3 animate-in fade-in-0 duration-150">
                    <p className="text-[11px] text-muted-foreground">
                      {t('settings.scraper.fallbackTransportsDesc')}
                    </p>

                    {/* Secondary Fallback 1: Browser Companion if active is Embedded */}
                    {activeTransport === 'EMBEDDED_ELECTRON' && (
                      <div className="space-y-2 p-3 rounded-lg border border-border/60 bg-card/30">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">
                            {t('settings.scraper.transportCompanion')}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {isConnected ? t('settings.scraper.statusConnected') : t('settings.scraper.statusDisconnected')}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={companion.connect}
                            className="h-7 text-xs"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            <span>{t('settings.scraper.reconnectButton')}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsInstallModalOpen(true)}
                            className="h-7 text-xs"
                          >
                            <HelpCircle className="h-3 w-3 mr-1" />
                            <span>{t('settings.scraper.showSetupInstructions')}</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Secondary Fallback 2: Direct Scraper (Playwright) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card/30">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-foreground">
                          {t('settings.scraper.playwrightTitle')}
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {t('settings.scraper.playwrightDesc')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCheckAccess}
                        disabled={isStarting || isRunning}
                        className="h-7 text-xs shrink-0"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        <span>{t('onboarding.verifyAccess')}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION B: BROWSER COMPANION CARD */}
      {/* ========================================================================= */}
      {transportPreference === 'BROWSER_COMPANION' && (
        <SettingsSection
          icon={Globe}
          title={t('settings.scraper.companionTitle')}
          description={t('settings.scraper.companionDescription')}
        >
        <div className="space-y-3.5 pt-1">
          {/* Temporary Connection Explanation (Requirement 3 & 4) */}
          <TemporaryConnectionNotice compact />

          {/* Installed vs Connected vs Ready 3-Pillar Grid (Requirement 2 & 5) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Extension Installed */}
            <div className="p-3 rounded-xl border border-border/70 bg-card/50 space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">
                {t('settings.scraper.extensionInstalledLabel')}
              </span>
              <div className="flex items-center gap-2">
                {isInstalled ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-bold text-foreground">
                  {isInstalled ? t('settings.scraper.statusInstalled') : t('settings.scraper.statusNotDetected')}
                </span>
              </div>
            </div>

            {/* 2. Session Connected */}
            <div className="p-3 rounded-xl border border-border/70 bg-card/50 space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">
                {t('settings.scraper.sessionConnectedLabel')}
              </span>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : companion.state === 'CONNECTING' ? (
                  <RefreshCw className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span className="text-xs font-bold text-foreground">
                  {isConnected
                    ? t('settings.scraper.statusConnected')
                    : companion.state === 'CONNECTING'
                    ? t('settings.scraper.statusConnecting')
                    : t('settings.scraper.statusDisconnected')}
                </span>
              </div>
            </div>

            {/* 3. RuTracker Ready */}
            <div className="p-3 rounded-xl border border-border/70 bg-card/50 space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground block">
                {t('settings.scraper.rutrackerReadyLabel')}
              </span>
              <div className="flex items-center gap-2">
                {isRuTrackerReady ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : isVerificationNeeded || isNoTab || isTimeout ? (
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                ) : isCheckingAccess ? (
                  <RefreshCw className="h-4 w-4 text-primary animate-spin shrink-0" />
                ) : (
                  <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-bold text-foreground truncate">
                  {isRuTrackerReady
                    ? t('settings.scraper.statusReady')
                    : isVerificationNeeded
                    ? t('settings.scraper.rutrackerVerificationRequired')
                    : isNoTab
                    ? t('settings.scraper.rutrackerNoTab')
                    : isTimeout
                    ? t('settings.scraper.timeoutMessage')
                    : isCheckingAccess
                    ? t('onboarding.checkingAccess')
                    : t('settings.scraper.statusNotChecked')}
                </span>
              </div>
            </div>
          </div>

          {/* Contextual Action & Recovery Area with aria-live */}
          <div aria-live="polite" className="space-y-2.5 pt-1">
            {/* DISCONNECTED State */}
            {companion.state === 'DISCONNECTED' && (
              <div className="space-y-2">
                {companion.isExpired && (
                  <div role="alert" className="flex items-center gap-2 text-xs text-amber-400 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t('settings.scraper.connectionExpiredMessage')}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={companion.connect}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{t('settings.scraper.reconnectButton')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsInstallModalOpen(true)}
                    className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground"
                  >
                    <HelpCircle className="h-3 w-3 mr-1.5 text-primary" />
                    <span>{t('settings.scraper.showSetupInstructions')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* NOT_INSTALLED State (Requirement 14) */}
            {companion.state === 'NOT_INSTALLED' && (
              <div className="space-y-2">
                <div role="alert" className="flex items-center gap-2 text-xs text-amber-400 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{t('settings.scraper.notInstalledMessage')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setIsInstallModalOpen(true)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <HelpCircle className="h-3 w-3" />
                    <span>{t('settings.scraper.showSetupInstructions')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckAccess}
                    className="h-8 text-xs"
                  >
                    <span>{t('onboarding.verifyAccess')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* CONNECTING State: Connection Code Display (Requirement 4 & 5) */}
            {companion.state === 'CONNECTING' && companion.connection.port && (
              <div className="rounded-xl border border-border p-3 text-xs space-y-2.5 select-text bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{t('settings.scraper.companionConnectionCode')}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopyText('all', `${companion.connection.port}:${companion.connection.token}`)}
                  >
                    {copiedField === 'all' ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">{t('common.copied')}</span>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>{t('common.copyAll')}</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-card border border-border gap-2">
                  <code className="select-all font-mono text-emerald-400 text-xs truncate">
                    {companion.connection.port}:{companion.connection.token}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => handleCopyText('all', `${companion.connection.port}:${companion.connection.token}`)}
                  >
                    {copiedField === 'all' ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">{t('common.copied')}</span>
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* CONNECTED State: Handshake active, code hidden, ready to check access */}
            {companion.state === 'CONNECTED' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                  className="h-8 text-xs font-semibold gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{t('settings.scraper.companionCheckAccess')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => companion.openRuTracker(category === 'all' ? undefined : category)}
                  className="h-8 text-xs border-border bg-card hover:bg-secondary text-foreground gap-1.5"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>{t('settings.scraper.companionOpenBrowser')}</span>
                </Button>
              </div>
            )}

            {/* CHECKING_ACCESS State: Spinner */}
            {companion.state === 'CHECKING_ACCESS' && (
              <div className="flex items-center gap-2 text-xs text-primary font-medium py-1">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{t('onboarding.checkingAccess')}</span>
              </div>
            )}

            {/* READY State: Confirmed access */}
            {companion.state === 'READY' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    {t('onboarding.statusForumReadyHuman')} ({companion.topicCount ?? 0} {t('settings.scraper.companionTopicCount')})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                    className="h-7 text-[11px] gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{t('settings.scraper.checkAgainButton')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => companion.openRuTracker(category === 'all' ? undefined : category)}
                    className="h-7 text-[11px] gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{t('settings.scraper.companionOpenBrowser')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* NO_RUTRACKER_TAB State (Requirement 11) */}
            {companion.state === 'NO_RUTRACKER_TAB' && (
              <div className="space-y-2">
                <div role="alert" className="flex items-start gap-2 text-xs text-amber-400 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t('settings.scraper.noRuTrackerTabMessage')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => companion.openRuTracker(category === 'all' ? undefined : category)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{t('settings.scraper.companionOpenBrowser')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                    className="h-8 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span>{t('settings.scraper.checkAgainButton')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* VERIFICATION_REQUIRED State (Requirement 12) */}
            {companion.state === 'VERIFICATION_REQUIRED' && (
              <div className="space-y-2">
                <div role="alert" className="flex items-start gap-2 text-xs text-amber-400 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t('settings.scraper.companionVerificationRequired')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => companion.openRuTracker(category === 'all' ? undefined : category)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>{t('settings.scraper.companionOpenBrowser')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                    className="h-8 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    <span>{t('settings.scraper.checkAgainButton')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* TIMEOUT State (Requirement 13) */}
            {companion.state === 'TIMEOUT' && (
              <div className="space-y-2">
                <div role="alert" className="flex items-start gap-2 text-xs text-rose-400 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{t('settings.scraper.timeoutMessage')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => companion.checkAccess(category === 'all' ? undefined : category)}
                    className="h-8 text-xs font-semibold gap-1.5"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>{t('settings.scraper.checkAgainButton')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={companion.reconnect}
                    className="h-8 text-xs"
                  >
                    <span>{t('settings.scraper.reconnectButton')}</span>
                  </Button>
                </div>
              </div>
            )}

            {/* ERROR State */}
            {companion.state === 'ERROR' && (
              <div className="space-y-2">
                <div role="alert" className="flex items-start gap-2 text-xs text-rose-400 p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/10">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{companion.errorMessage || t('settings.scraper.error')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={companion.reconnect}
                  className="h-8 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  <span>{t('settings.scraper.reconnectButton')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>
      )}

      {/* ========================================================================= */}
      {/* SECTION C: UPDATE LIBRARY & ADVANCED OPTIONS (WHERE & HOW) */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Play}
        title={t('settings.scraper.updateLibrary')}
      >
        <div className="space-y-4 pt-1">
          {/* Scope Selection (WHERE invariant preserved) */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5 flex-1 max-w-sm">
              <label className="text-xs font-semibold text-foreground">
                {t('settings.scraper.selectCategory')}
              </label>
              <Select
                value={category}
                onValueChange={setCategory}
                disabled={isRunning || isStarting}
              >
                <SelectTrigger className="h-9 text-xs bg-background/80 border-border text-foreground">
                  <SelectValue placeholder={t('settings.scraper.selectCategory')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground max-h-64">
                  <SelectItem value="all">
                    {t('settings.scraper.allCategories')}
                  </SelectItem>
                  {categoriesList
                    .filter((cat) => cat.enabled)
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                {category === 'all'
                  ? t('settings.scraper.allCategoriesHint')
                  : t('settings.scraper.singleCategoryHint')}
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{t('settings.scraper.syncMethodLabel')}:</span>
                <span className="font-semibold text-foreground">
                  {transportPreference === 'AUTOMATIC' ? (
                    <>
                      <span>{t('settings.scraper.transportAutomatic').replace(/\s*\(.*\)/, '')}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="text-primary font-bold">
                        {getTransportLabel(activeTransport)}
                      </span>
                    </>
                  ) : (
                    <span className="text-primary font-bold">
                      {getTransportLabel(transportPreference)}
                    </span>
                  )}
                </span>
              </div>
              <Button
                onClick={handleStart}
                disabled={isRunning || isStarting}
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold h-9 px-5 rounded-lg shadow-sm"
                aria-label={t('settings.scraper.updateLibrary')}
              >
                {isStarting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                    {t('settings.scraper.starting')}
                  </>
                ) : isRunning ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                    {t('settings.scraper.running')}
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-2 fill-current" />
                    {t('settings.scraper.updateLibrary')}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION E: ADVANCED OPTIONS (COLLAPSED BY DEFAULT) */}
          {/* Note: Switches must remain [0: Full Scan, 1: Screenshots, 2: Sizes, 3: Files] */}
          {/* ========================================================================= */}
          <div className="pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={isAdvancedOpen}
            >
              {isAdvancedOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>{t('settings.scraper.advancedOptions')}</span>
            </button>

            {isAdvancedOpen && (
              <div className="mt-3 p-3.5 bg-background/80 border border-border/80 rounded-xl space-y-3 animate-in fade-in-0 duration-150">
                {/* 0. Full Scan */}
                <SettingRow
                  title={t('settings.scraper.fullScanTitle')}
                  description={t('settings.scraper.fullScanDesc')}
                >
                  <Switch
                    checked={full}
                    onCheckedChange={handleFullChange}
                    disabled={isRunning || isStarting}
                  />
                </SettingRow>

                {/* 1. Refresh Screenshots */}
                <SettingRow
                  title={t('settings.scraper.screenshotsTitle')}
                  description={t('settings.scraper.screenshotsDesc')}
                  divider
                >
                  <Switch
                    checked={full || refreshScreenshots}
                    onCheckedChange={setRefreshScreenshots}
                    disabled={isRunning || isStarting || full}
                  />
                </SettingRow>

                {/* 2. Refresh Sizes */}
                <SettingRow
                  title={t('settings.scraper.sizesTitle')}
                  description={t('settings.scraper.sizesDesc')}
                  divider
                >
                  <Switch
                    checked={full || refreshSizes}
                    onCheckedChange={setRefreshSizes}
                    disabled={isRunning || isStarting || full}
                  />
                </SettingRow>

                {/* 3. Refresh File Lists */}
                <SettingRow
                  title={t('settings.scraper.filesTitle')}
                  description={t('settings.scraper.filesDesc')}
                  divider
                >
                  <Switch
                    checked={full || refreshFiles}
                    onCheckedChange={setRefreshFiles}
                    disabled={isRunning || isStarting || full}
                  />
                </SettingRow>

                {/* Deep Scan / Ignore Early Stop */}
                <SettingRow
                  title={t('settings.scraper.deepScanTitle')}
                  description={t('settings.scraper.deepScanDesc')}
                  divider
                >
                  <Switch
                    checked={full || ignoreEarlyStop}
                    onCheckedChange={setIgnoreEarlyStop}
                    disabled={isRunning || isStarting || full}
                  />
                </SettingRow>

                {/* Background Sync Notifications (V3-76) */}
                <SettingRow
                  title={t('settings.scraper.backgroundNotificationsSetting')}
                  description={t('settings.scraper.backgroundNotificationsSettingDesc')}
                  divider
                >
                  <Switch
                    checked={enableBackgroundNotifications}
                    onCheckedChange={handleToggleBackgroundNotifications}
                  />
                </SettingRow>

                {/* Cost Notice Warning */}
                <div className="mt-2 text-[11px] text-muted-foreground bg-secondary/40 border border-border/50 rounded-lg p-2.5 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{t('settings.scraper.refreshCostNotice')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION C: CATEGORIES SUMMARY CARD */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Settings2}
        title={t('categories.managementTitle')}
        description={t('categories.managementDescription')}
        action={
          onNavigateToCategories ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToCategories}
              aria-label={t('categories.managementTitle')}
              className="h-8 px-3 text-xs border-border bg-card text-foreground hover:bg-secondary font-medium gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <span>{t('settings.scraper.manageCategoriesButton')}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-0.5 text-muted-foreground" />
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {t('settings.scraper.categoriesSummaryCount', { enabled: enabledCategoriesCount, total: totalCategoriesCount })}
            </span>
          </div>
          {!onNavigateToCategories && (
            <div className="pt-2">
              <CategoryManagement />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION: RESTORE EXISTING SQLITE DATABASE */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Database}
        title={t('settings.scraper.restoreDatabaseTitle')}
        description={t('settings.scraper.restoreDatabaseDesc')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestoreDatabase}
            disabled={isRunning || isStarting || isRestoringDb}
            className="h-8 px-3 text-xs border-border bg-card text-foreground hover:bg-secondary font-medium gap-1.5 cursor-pointer"
          >
            {isRestoringDb ? (
              <RefreshCw className="h-3.5 w-3.5 text-primary animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{isRestoringDb ? t('settings.scraper.restoringDatabase') : t('settings.scraper.restoreDatabaseButton')}</span>
          </Button>
        }
      >
        <div className="text-xs text-muted-foreground pt-1">
          <p>{t('settings.scraper.restoreDatabaseHelp')}</p>
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION F: TECHNICAL DIAGNOSTICS */}
      {/* ========================================================================= */}
      <SettingsSection
        icon={Terminal}
        title={t('settings.scraper.diagnosticsTitle')}
        description={t('settings.scraper.diagnosticsDesc')}
      >
        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => setIsDiagnosticsOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={isDiagnosticsOpen}
          >
            {isDiagnosticsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span>{t('settings.scraper.diagnosticsTitle')}</span>
          </button>

          {isDiagnosticsOpen && (
            <div className="mt-3 p-3 bg-background/80 border border-border/80 rounded-xl space-y-2 text-xs font-mono text-muted-foreground animate-in fade-in-0 duration-150">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticSessionId')}:</span>
                <span className="font-semibold text-foreground">{companion.connection.maskedSessionId || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticBridgeStatus')}:</span>
                <span className="font-semibold text-foreground">{companion.connection.port ? t('settings.scraper.diagnosticStatusActive') : t('settings.scraper.diagnosticStatusIdle')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticBridgePort')}:</span>
                <span className="font-semibold text-emerald-400">{companion.connection.port || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticProtocolVersion')}:</span>
                <span className="font-semibold text-foreground">v1</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticExtensionVersion')}:</span>
                <span className="font-semibold text-foreground">{companion.connection.extensionVersion || '1.0.0'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticActiveTransport')}:</span>
                <span className="font-semibold text-foreground">{activeTransport}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>{t('settings.scraper.diagnosticLastCheck')}:</span>
                <span className="font-semibold text-foreground">{companion.connection.lastAccessCheck ? new Date(companion.connection.lastAccessCheck).toLocaleTimeString() : '—'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>{t('settings.scraper.diagnosticLastHeartbeat')}:</span>
                <span className="font-semibold text-foreground">{companion.connection.lastHeartbeat ? new Date(companion.connection.lastHeartbeat).toLocaleTimeString() : '—'}</span>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ========================================================================= */}
      {/* SECTION PROGRESS & EXECUTION LOGS */}
      {/* ========================================================================= */}
      <ScraperProgress
        state={state}
        progress={progress}
        error={error || actionError}
        accessIssue={access?.results.find((result) => !['ACCESSIBLE', 'ACCESSIBLE_EMPTY'].includes(result.status))}
        onCancel={handleCancel}
        onPause={handlePause}
        onResume={handleResume}
        isPausing={isPausing}
        isResuming={isResuming}
        onRenewSession={handleStart}
        onOpenBrowser={() => companion.openRuTracker(category === 'all' ? undefined : category)}
        onCheckAccess={handleCheckAccess}
        onReconnect={companion.connect}
        onVerifyEmbedded={handleEmbeddedVerify}
        activeTransport={activeTransport}
        isStarting={isStarting}
      />

      <ScraperLogs
        logs={logs}
        totalLogEntries={totalLogEntries}
        onClearLogs={clearLogs}
        onCopyAll={getCurrentLog}
        onExportLog={exportLog}
        onOpenLogsFolder={openLogsFolder}
      />

      {/* Extension Setup Instructions Modal (Requirement 6 & 21) */}
      <Dialog open={isInstallModalOpen} onOpenChange={setIsInstallModalOpen}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-400" />
              <span>{t('onboarding.installInstructionsTitle')}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5 text-xs text-muted-foreground pt-2 leading-relaxed">
            <p>{t('onboarding.installStep1')}</p>
            <p>{t('onboarding.installStep2')}</p>
            <p>{t('onboarding.installStep3')}</p>
            <p>{t('onboarding.installStep4')}</p>
            <p>{t('onboarding.installStep5')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
