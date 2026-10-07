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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { CategoryManagement } from './CategoryManagement';
import { ScraperCategory } from '@/types/scraper';
import { scraperService } from '@/services/scraperService';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingRow } from '@/components/settings/SettingRow';

interface ScraperPanelProps {
  onNavigateToCategories?: () => void;
}

export const ScraperPanel: React.FC<ScraperPanelProps> = ({ onNavigateToCategories }) => {
  const { t } = useI18n();
  const [categoriesList, setCategoriesList] = useState<ScraperCategory[]>([]);
  const {
    state,
    progress,
    logs,
    totalLogEntries,
    isRunning,
    error,
    startScraper,
    renewSession,
    cancelScraper,
    clearLogs,
    getCurrentLog,
    exportLog,
    openLogsFolder,
  } = useScraper();

  // Scraper options state
  const [category, setCategory] = useState('all');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [refreshScreenshots, setRefreshScreenshots] = useState(false);
  const [refreshSizes, setRefreshSizes] = useState(false);
  const [refreshFiles, setRefreshFiles] = useState(false);
  const [savedRefreshState, setSavedRefreshState] = useState({
    screenshots: false,
    sizes: false,
    files: false,
  });

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

  useEffect(() => {
    scraperService.getCategories().then((cats) => {
      setCategoriesList(cats);
    }).catch((err) => {
      console.error('Failed to load categories for scraper panel:', err);
    });
  }, []);

  // Status feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    if (isStarting || isRunning) return;
    setIsStarting(true);
    setActionError(null);
    try {
      await startScraper({
        full,
        category: category === 'all' ? null : category,
        refreshScreenshots,
        refreshSizes,
        refreshFiles,
      });
    } catch (err: any) {
      if (!err.message?.includes('SCRAPER_ALREADY_RUNNING')) {
        setActionError(err.message || t('settings.scraper.error'));
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleLoginSession = async () => {
    if (isStarting || isRunning) return;
    setIsStarting(true);
    setActionError(null);
    try {
      await renewSession({
        category: category === 'all' ? undefined : category,
      });
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

  const getStatusBadge = () => {
    switch (state) {
      case 'starting':
        return (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs font-semibold gap-1.5 py-0.5">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t('settings.scraper.starting')}
          </Badge>
        );
      case 'running':
        return (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs font-semibold gap-1.5 py-0.5 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t('settings.scraper.running')}
          </Badge>
        );
      case 'cancelling':
        return (
          <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-400 text-xs font-semibold gap-1.5 py-0.5">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t('settings.scraper.stopping')}
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs font-semibold gap-1.5 py-0.5">
            <CheckCircle2 className="w-3 h-3" />
            {t('settings.scraper.completed')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-rose-500/10 border-rose-500/30 text-rose-400 text-xs font-semibold gap-1.5 py-0.5">
            <XCircle className="w-3 h-3" />
            {t('settings.scraper.error')}
          </Badge>
        );
      case 'session_required':
      case 'interaction_required':
        return (
          <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-400 text-xs font-semibold gap-1.5 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            {t('settings.scraper.sessionRequired')}
          </Badge>
        );
      case 'idle':
      default:
        return (
          <Badge variant="outline" className="bg-secondary border-border text-muted-foreground text-xs font-semibold py-0.5">
            {t('settings.scraper.idle')}
          </Badge>
        );
    }
  };

  const isSessionRequired = state === 'session_required' || state === 'interaction_required';
  const enabledCategoriesCount = categoriesList.filter((c) => c.enabled).length;
  const totalCategoriesCount = categoriesList.length;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. STATUS & SESSION */}
      <SettingsSection
        icon={Layers}
        title={t('settings.scraper.statusTitle')}
        description={t('settings.scraper.statusDescription')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoginSession}
            disabled={isStarting || isRunning}
            className={cn(
              "text-xs font-medium h-8 px-3 border transition-colors",
              isSessionRequired
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-border bg-card text-foreground hover:bg-secondary"
            )}
            title={isSessionRequired ? t('settings.scraper.renewSession') : t('settings.scraper.verifySession')}
          >
            {isSessionRequired ? (
              <ShieldAlert className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-primary" />
            )}
            <span>{isSessionRequired ? t('settings.scraper.renewSession') : t('settings.scraper.verifySession')}</span>
          </Button>
        }
      >
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground">{t('settings.scraper.statusTitle')}</span>
          {getStatusBadge()}
        </div>
      </SettingsSection>

      {/* 2. UPDATE LIBRARY CONTROLS */}
      <SettingsSection
        icon={Play}
        title={t('settings.scraper.updateLibrary')}
      >
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

          <div className="flex items-center gap-2 shrink-0">
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

        {/* ADVANCED OPTIONS (COLLAPSIBLE) */}
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
              {/* Full Scan */}
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

              {/* Refresh Screenshots */}
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

              {/* Refresh Sizes */}
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

              {/* Refresh File Lists */}
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

              {/* Cost Notice Warning */}
              <div className="mt-2 text-[11px] text-muted-foreground bg-secondary/40 border border-border/50 rounded-lg p-2.5 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>{t('settings.scraper.refreshCostNotice')}</span>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* 3. CATEGORY MANAGEMENT SUMMARY CARD */}
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
              className="h-8 px-3 text-xs border-border bg-card text-foreground hover:bg-secondary font-medium"
            >
              <Settings2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {t('categories.managementTitle')}
              <ChevronRight className="h-3.5 w-3.5 ml-1 text-muted-foreground" />
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground font-mono">{enabledCategoriesCount}</span> / <span className="font-mono">{totalCategoriesCount}</span> {t('categories.fields.enabled').toLowerCase()}
          </div>
          {!onNavigateToCategories && (
            <div className="pt-2">
              <CategoryManagement />
            </div>
          )}
        </div>
      </SettingsSection>

      {/* 4. PROGRESS & RESULTS AREA */}
      <ScraperProgress
        state={state}
        progress={progress}
        error={error || actionError}
        onCancel={handleCancel}
        onRenewSession={handleLoginSession}
        isStarting={isStarting}
      />

      {/* 5. EXECUTION LOGS AREA */}
      <ScraperLogs
        logs={logs}
        totalLogEntries={totalLogEntries}
        onClearLogs={clearLogs}
        onCopyAll={getCurrentLog}
        onExportLog={exportLog}
        onOpenLogsFolder={openLogsFolder}
      />
    </div>
  );
};
