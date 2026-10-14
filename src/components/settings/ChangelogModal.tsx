import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, ExternalLink, X, FileText } from 'lucide-react';
import { useI18n } from '@/i18n';
import { openExternal } from '@/platform/shell';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: string | null;
  releaseDate?: string | null;
  releaseNotes: string | null;
}

/**
 * Parses release notes text or HTML into clean, human-readable sections.
 * Handles HTML tags emitted by GitHub / electron-updater (like <p>, <strong>, <a>, <tt>, <ul>, <li>).
 */
export function formatChangelogContent(raw: string | null): string {
  if (!raw) return '';

  let cleaned = raw
    // Replace <br> and variants with newline
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace </p>, </div>, </h1>, </h2>, </h3>, </h4> with double newline
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    // Replace <li> with bullet
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    // Extract text from links while retaining URL if distinct
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, href, text) => {
      const trimmedText = text.replace(/<[^>]+>/g, '').trim();
      if (!trimmedText || trimmedText === href) return href;
      return `${trimmedText} (${href})`;
    })
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  version,
  releaseDate,
  releaseNotes,
}) => {
  const { t } = useI18n();

  const formattedNotes = formatChangelogContent(releaseNotes);

  const githubReleaseUrl = version
    ? `https://github.com/jirayaSenju/rt-library/releases/tag/v${version.replace(/^v/, '')}`
    : 'https://github.com/jirayaSenju/rt-library/releases';

  const handleOpenReleasePage = () => {
    openExternal(githubReleaseUrl);
  };

  const formattedDate = releaseDate
    ? (() => {
        try {
          return new Date(releaseDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        } catch {
          return releaseDate;
        }
      })()
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-2xl max-h-[85vh] p-0 border-border bg-card text-foreground rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-border/80 bg-muted/20">
          <div className="space-y-1.5 pr-6 min-w-0">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>{t('updater.changelogTitle')}</span>
                {version && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                    v{version.replace(/^v/, '')}
                  </span>
                )}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              {formattedDate && <span>{formattedDate}</span>}
              {formattedDate && <span>•</span>}
              <span>GitHub Releases</span>
            </DialogDescription>
          </div>

          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Close changelog modal"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 max-h-[55vh] custom-scrollbar">
          {formattedNotes ? (
            <div className="rounded-xl border border-border/70 bg-background/50 p-4 font-sans text-xs leading-relaxed text-foreground select-text whitespace-pre-wrap">
              {formattedNotes}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-xs flex flex-col items-center justify-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground/40 stroke-1" />
              <p>{t('updater.releaseNotes')}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 px-6 border-t border-border/80 bg-muted/20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenReleasePage}
            className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('updater.viewOnGitHub')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onClose}
            className="text-xs h-8 px-4"
          >
            {t('updater.closeChangelog')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
