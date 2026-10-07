import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ScraperLog } from '../../services/scraperService';
import {
  Terminal,
  Trash2,
  Info,
  AlertTriangle,
  AlertCircle,
  Copy,
  Download,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Search,
  Check,
  ArrowDownCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

interface ScraperLogsProps {
  logs: ScraperLog[];
  totalLogEntries?: number;
  onClearLogs?: () => void;
  onCopyAll?: () => Promise<string>;
  onExportLog?: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  onOpenLogsFolder?: () => Promise<{ success: boolean; path?: string; error?: string }>;
}

export const ScraperLogs: React.FC<ScraperLogsProps> = ({
  logs,
  totalLogEntries = 0,
  onClearLogs,
  onCopyAll,
  onExportLog,
  onOpenLogsFolder,
}) => {
  const { t, formatNumber } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [isCopied, setIsCopied] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // Filter logs based on search query and level filter
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (levelFilter !== 'all' && log.level !== levelFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return log.message.toLowerCase().includes(q);
      }
      return true;
    });
  }, [logs, levelFilter, searchQuery]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (isExpanded && isAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs, isExpanded, isAutoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    setIsAutoScroll(isAtBottom);
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAutoScroll(true);
    }
  };

  const handleCopyAll = async () => {
    try {
      let content = '';
      if (onCopyAll) {
        content = await onCopyAll();
      }
      if (!content && logs.length > 0) {
        content = logs.map((l) => `${l.timestamp} [${(l.level || 'INFO').toUpperCase()}] ${l.message}`).join('\n');
      }

      if (!content) {
        toast.info(t('settings.scraper.logsNoLogsToast'));
        return;
      }

      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      toast.success(t('settings.scraper.logsCopiedToast'));
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err: any) {
      console.error('Failed to copy logs:', err);
      toast.error(t('settings.scraper.logsCopyErrorToast'));
    }
  };

  const handleExport = async () => {
    try {
      if (onExportLog) {
        const res = await onExportLog();
        if (res.success && res.filePath) {
          toast.success(`${t('settings.scraper.logExportedToast')}: ${res.filePath}`);
        } else if (!res.canceled && res.error) {
          toast.error(`${t('settings.scraper.logExportErrorToast')}: ${res.error}`);
        }
      }
    } catch (err: any) {
      console.error('Export log error:', err);
      toast.error(t('settings.scraper.logExportErrorToast'));
    }
  };

  const handleOpenFolder = async () => {
    try {
      if (onOpenLogsFolder) {
        const res = await onOpenLogsFolder();
        if (res.error) {
          toast.error(`${t('settings.scraper.logOpenFolderErrorToast')}: ${res.error}`);
        }
      }
    } catch (err: any) {
      console.error('Open logs folder error:', err);
      toast.error(t('settings.scraper.logOpenFolderErrorToast'));
    }
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return '';
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />;
      case 'warn':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'info':
      default:
        return <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
    }
  };

  const lastLog = logs[logs.length - 1];
  const countDisplay = totalLogEntries > logs.length ? totalLogEntries : logs.length;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm transition-all duration-200">
      {/* Collapsed Header / Summary */}
      <div className="p-3.5 px-4 flex items-center justify-between gap-3 bg-secondary/40 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <Terminal className="w-4 h-4 text-primary shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-foreground shrink-0">
              {t('settings.scraper.executionLogs')}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 border-border bg-secondary text-muted-foreground shrink-0">
              {formatNumber(countDisplay)} {countDisplay === 1 ? t('settings.scraper.entry') : t('settings.scraper.entries')}
            </Badge>
            {!isExpanded && lastLog && (
              <span className="text-[11px] text-muted-foreground truncate hidden md:inline-block max-w-sm pl-2 border-l border-border font-mono">
                {lastLog.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary gap-1"
            aria-label={isExpanded ? t('settings.scraper.collapse') : t('settings.scraper.expandLogs')}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>{t('settings.scraper.collapse')}</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>{t('settings.scraper.expandLogs')}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Controls & Stream Body */}
      {isExpanded && (
        <div className="p-3.5 space-y-3 bg-card/40 animate-in fade-in-0 duration-150">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-0.5">
            {/* Search & Level Filters */}
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('settings.scraper.searchLogsPlaceholder')}
                  className="w-full h-7 pl-8 pr-3 bg-background border border-border rounded-md text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Level Filter Tabs */}
              <div className="flex items-center bg-background border border-border rounded-md p-0.5 text-[10px] font-medium">
                {(['all', 'info', 'warn', 'error'] as const).map((lvl) => {
                  const label =
                    lvl === 'all'
                      ? t('settings.scraper.allLevel')
                      : lvl === 'info'
                      ? t('settings.scraper.infoLevel')
                      : lvl === 'warn'
                      ? t('settings.scraper.warnLevel')
                      : t('settings.scraper.errorLevel');
                  return (
                    <button
                      key={lvl}
                      onClick={() => setLevelFilter(lvl)}
                      className={cn(
                        'px-2 py-0.5 rounded capitalize transition-colors',
                        levelFilter === lvl
                          ? 'bg-secondary text-foreground font-bold'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Copy All, Export, Open Folder, Clear View */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                disabled={logs.length === 0}
                className="h-7 px-2 text-[11px] border-border bg-secondary text-foreground hover:bg-muted"
                title={t('settings.scraper.copyAll')}
              >
                {isCopied ? <Check className="w-3 h-3 mr-1 text-primary" /> : <Copy className="w-3 h-3 mr-1" />}
                <span>{isCopied ? t('settings.scraper.copied') : t('settings.scraper.copyAll')}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={logs.length === 0}
                className="h-7 px-2 text-[11px] border-border bg-card text-foreground hover:bg-secondary"
                title={t('settings.scraper.export')}
              >
                <Download className="w-3 h-3 mr-1 text-primary" />
                <span>{t('settings.scraper.export')}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenFolder}
                className="h-7 px-2 text-[11px] border-border bg-card text-foreground hover:bg-secondary"
                title={t('settings.scraper.openFolder')}
              >
                <FolderOpen className="w-3 h-3 mr-1 text-primary" />
                <span>{t('settings.scraper.openFolder')}</span>
              </Button>

              {onClearLogs && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearLogs}
                  disabled={logs.length === 0}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive hover:bg-secondary"
                  title={t('settings.scraper.clearView')}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  <span>{t('settings.scraper.clearView')}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Log Stream Box */}
          <div className="relative">
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="bg-background font-mono text-[11px] leading-relaxed p-3 rounded-lg border border-border h-64 overflow-y-auto space-y-1.5 custom-scrollbar text-foreground select-text"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-muted-foreground text-center py-16 flex flex-col items-center justify-center gap-2">
                  <Terminal className="w-6 h-6 text-muted-foreground/60" />
                  <span>{logs.length === 0 ? t('settings.scraper.noLogs') : t('settings.scraper.noLogsMatch')}</span>
                </div>
              ) : (
                filteredLogs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2 border-b border-border/40 pb-1 last:border-0 last:pb-0">
                    <span className="text-muted-foreground shrink-0 font-sans text-[10px] select-none pt-0.5 font-mono">
                      {formatTime(log.timestamp)}
                    </span>
                    {getLogIcon(log.level)}
                    <span
                      className={cn(
                        'break-all',
                        log.level === 'error'
                          ? 'text-destructive font-semibold'
                          : log.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-foreground/90'
                      )}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Jump to latest button when user scrolled up */}
            {!isAutoScroll && filteredLogs.length > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-3 right-4 bg-popover/90 border border-border text-primary hover:text-primary/80 text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-lg backdrop-blur flex items-center gap-1 transition-transform animate-in fade-in"
              >
                <ArrowDownCircle className="w-3 h-3" />
                <span>{t('settings.scraper.jumpToLatest')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
