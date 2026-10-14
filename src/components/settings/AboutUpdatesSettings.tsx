import React, { useState } from 'react';
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
  FileText,
} from 'lucide-react';
import { ChangelogModal, formatChangelogContent } from '@/components/settings/ChangelogModal';

export const AboutUpdatesSettings: React.FC = () => {
  const { t } = useI18n();
  const { status, isLoading, checkForUpdates, downloadUpdate, installUpdate } = useUpdater();
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

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
          <div className="p-4 rounded-xl border border-border bg-secondary/50 text-foreground text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{t('updater.unsupported')}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pl-6">
              {status.errorMessage || t('updater.unsupportedDev')}
            </p>
          </div>
        )}

        {/* Up to date */}
        {status.state === 'UP_TO_DATE' && (
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 text-foreground text-xs flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">{t('updater.upToDate')}</span>
          </div>
        )}

        {/* Update Available */}
        {status.state === 'UPDATE_AVAILABLE' && status.availableVersion && (
          <div className="p-4 rounded-xl border border-primary/40 bg-primary/10 text-foreground text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-primary text-sm">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                  <span>{t('updater.updateAvailable')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('updater.updateAvailableDesc', { version: status.availableVersion })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => downloadUpdate()}
                disabled={isLoading}
                className="text-xs h-8 gap-1.5 shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {t('updater.downloadUpdate')}
              </Button>
            </div>

            {status.releaseNotes && (
              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground/90">
                    {t('updater.releaseNotes')}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsChangelogOpen(true)}
                    className="h-6 px-2 text-[11px] text-primary hover:text-primary hover:bg-primary/15 gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    {t('updater.viewFullChangelog')}
                  </Button>
                </div>
                <div
                  onClick={() => setIsChangelogOpen(true)}
                  className="group relative cursor-pointer p-2.5 rounded-lg bg-card/80 border border-border hover:border-primary/50 text-[11px] font-sans leading-relaxed text-foreground/90 max-h-24 overflow-hidden select-text transition-colors"
                >
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {formatChangelogContent(status.releaseNotes)}
                  </p>
                  <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card to-transparent flex items-end justify-center pb-0.5">
                    <span className="text-[10px] text-primary font-medium group-hover:underline">
                      {t('updater.viewFullChangelog')} →
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Downloading Progress */}
        {status.state === 'DOWNLOADING' && (
          <div className="p-4 rounded-xl border border-primary/40 bg-primary/10 text-foreground text-xs space-y-2.5">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                {t('updater.downloading')} ({status.progress}%)
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {formatBytes(status.transferred)} / {formatBytes(status.total)} {status.bytesPerSecond > 0 && `• ${formatSpeed(status.bytesPerSecond)}`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden border border-border">
              <div
                className="bg-primary h-2 transition-all duration-200 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
              />
            </div>
          </div>
        )}

        {/* Update Downloaded (Ready to Install) */}
        {status.state === 'DOWNLOADED' && (
          <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-foreground text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-emerald-400 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{t('updater.downloaded')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
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
          <div className="p-4 rounded-xl border border-primary/40 bg-primary/10 text-foreground text-xs flex items-center gap-2.5">
            <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />
            <span className="font-medium">{t('updater.installing')}</span>
          </div>
        )}

        {/* Error */}
        {status.state === 'ERROR' && status.errorMessage && (
          <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-foreground text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span>{status.errorMessage}</span>
            </div>
            <div className="pt-1 pl-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => checkForUpdates()}
                className="text-xs h-7 border-destructive/40 text-foreground hover:bg-destructive/15"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('common.retry')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Full Changelog Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        version={status.availableVersion}
        releaseDate={status.releaseDate}
        releaseNotes={status.releaseNotes}
      />
    </div>
  );
};
