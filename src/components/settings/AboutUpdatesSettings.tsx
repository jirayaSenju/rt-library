import React from 'react';
import { useUpdater } from '@/hooks/useUpdater';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Info,
  Clock,
  Layers,
} from 'lucide-react';

export const AboutUpdatesSettings: React.FC = () => {
  const { t } = useI18n();
  const { status, isLoading, checkForUpdates, downloadUpdate, installUpdate } = useUpdater();

  const handleOpenGitHub = () => {
    const url = 'https://github.com/jirayaSenju/rt-library/releases';
    if (window.rtLibrary?.shell?.openExternal) {
      window.rtLibrary.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatSpeed = (bps: number) => {
    if (!bps || bps === 0) return '';
    return `${formatBytes(bps)}/s`;
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return t('updater.neverChecked');
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start justify-between border-b border-border/60 pb-5">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('updater.title')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('updater.description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenGitHub}
          className="text-xs h-8 gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          {t('updater.viewOnGitHub')}
        </Button>
      </div>

      {/* Version & Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card/50 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>{t('updater.currentVersion')}</span>
          </div>
          <div className="text-xl font-bold font-mono tracking-tight text-foreground">
            v{status.currentVersion}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
            <Layers className="h-3 w-3" />
            <span>{t('updater.channel')}: <strong className="text-foreground capitalize">{status.channel}</strong></span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card/50 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{t('updater.lastChecked')}</span>
          </div>
          <div className="text-sm font-medium text-foreground">
            {formatDate(status.lastCheckedAt)}
          </div>
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading || status.state === 'CHECKING' || status.state === 'DOWNLOADING'}
              onClick={() => checkForUpdates()}
              className="text-xs h-7 gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${status.state === 'CHECKING' || isLoading ? 'animate-spin' : ''}`} />
              {status.state === 'CHECKING' ? t('updater.checking') : t('updater.checkForUpdates')}
            </Button>
          </div>
        </div>
      </div>

      {/* Status Messages & Action Banners */}
      <div aria-live="polite" className="space-y-4">
        {/* Unsupported Environment */}
        {status.state === 'UNSUPPORTED' && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{t('updater.unsupported')}</span>
            </div>
            <p className="text-[11px] text-amber-200/80 pl-6">
              {status.errorMessage || t('updater.unsupportedDev')}
            </p>
          </div>
        )}

        {/* Up to date */}
        {status.state === 'UP_TO_DATE' && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{t('updater.upToDate')}</span>
          </div>
        )}

        {/* Update Available */}
        {status.state === 'UPDATE_AVAILABLE' && status.availableVersion && (
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-blue-300 text-sm">
                  <Sparkles className="h-4 w-4 shrink-0 text-blue-400" />
                  <span>{t('updater.updateAvailable')}</span>
                </div>
                <p className="text-xs text-blue-200/90">
                  {t('updater.updateAvailableDesc', { version: status.availableVersion })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => downloadUpdate()}
                disabled={isLoading}
                className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {t('updater.downloadUpdate')}
              </Button>
            </div>

            {status.releaseNotes && (
              <div className="pt-2 border-t border-blue-500/20">
                <div className="text-[11px] font-semibold text-blue-300 mb-1">{t('updater.releaseNotes')}:</div>
                <pre className="p-2.5 rounded-lg bg-neutral-950/60 border border-blue-500/20 text-[11px] font-mono text-neutral-300 max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                  {status.releaseNotes}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Downloading Progress */}
        {status.state === 'DOWNLOADING' && (
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-xs space-y-2.5">
            <div className="flex items-center justify-between font-semibold text-blue-300">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                {t('updater.downloading')} ({status.progress}%)
              </span>
              <span className="font-mono text-[11px] text-blue-300/80">
                {formatBytes(status.transferred)} / {formatBytes(status.total)} {status.bytesPerSecond > 0 && `• ${formatSpeed(status.bytesPerSecond)}`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-blue-950/60 rounded-full h-2 overflow-hidden border border-blue-500/30">
              <div
                className="bg-blue-500 h-2 transition-all duration-200 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Update Downloaded (Ready to Install) */}
        {status.state === 'DOWNLOADED' && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-emerald-300 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{t('updater.downloaded')}</span>
                </div>
                <p className="text-xs text-emerald-200/90">
                  {t('updater.downloadedDesc', { version: status.availableVersion || '' })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => installUpdate()}
                disabled={isLoading}
                className="text-xs h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('updater.restartAndUpdate')}
              </Button>
            </div>
          </div>
        )}

        {/* Installing */}
        {status.state === 'INSTALLING' && (
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs flex items-center gap-2.5">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
            <span className="font-medium">{t('updater.installing')}</span>
          </div>
        )}

        {/* Error */}
        {status.state === 'ERROR' && status.errorMessage && (
          <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{status.errorMessage}</span>
            </div>
            <div className="pt-1 pl-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => checkForUpdates()}
                className="text-xs h-7 border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('common.retry')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
