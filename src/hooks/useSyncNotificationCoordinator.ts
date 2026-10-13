import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { scraperService } from '@/services/scraperService';
import type { SyncRunFinalizedEvent, ScraperState, ScraperAccessStatus } from '@/services/scraperService';
import { useI18n } from '@/i18n';
import type { SyncActionBannerState, SyncActionBannerType } from '@/components/layout/SyncActionBanner';

export interface UseSyncNotificationCoordinatorOptions {
  onOpenSettings: (section?: any, subview?: string | null) => void;
  onRefreshLibrary?: () => void;
  enableBackgroundNotifications?: boolean;
}

export function useSyncNotificationCoordinator({
  onOpenSettings,
  onRefreshLibrary,
  enableBackgroundNotifications = true,
}: UseSyncNotificationCoordinatorOptions) {
  const { t } = useI18n();

  const [actionBanner, setActionBanner] = useState<SyncActionBannerState | null>(null);
  const dismissedBannerTypeRef = useRef<SyncActionBannerType | null>(null);
  const lastNotifiedRunIdRef = useRef<string | null>(null);
  const hasCheckedStartupInterruptedRef = useRef(false);

  // Helper to send native desktop notification if window is blurred/minimized
  const notifyNativeIfBackground = useCallback(async (title: string, body: string) => {
    if (!enableBackgroundNotifications) return;
    try {
      if (typeof window !== 'undefined' && window.rtLibrary?.system?.isWindowFocused) {
        const isFocused = await window.rtLibrary.system.isWindowFocused();
        if (!isFocused && window.rtLibrary.system.showNotification) {
          await window.rtLibrary.system.showNotification({
            title,
            body,
            silent: false,
          });
        }
      }
    } catch (err) {
      console.warn('[Coordinator] Failed to show desktop notification:', err);
    }
  }, [enableBackgroundNotifications]);

  // Handle finalization of a run
  const handleRunFinalized = useCallback(async (event: SyncRunFinalizedEvent) => {
    if (!event || !event.runId) return;

    // Deduplication check: only one notification per runId
    if (lastNotifiedRunIdRef.current === event.runId) {
      return;
    }
    lastNotifiedRunIdRef.current = event.runId;

    // Refresh catalog data
    onRefreshLibrary?.();

    // Clear active action banner if run succeeded
    if (event.status === 'COMPLETED' || event.status === 'COMPLETED_WITH_WARNINGS') {
      setActionBanner(null);
      dismissedBannerTypeRef.current = null;
    }

    // Check window focus state to determine whether to fire toast or native notification
    let isFocused = true;
    try {
      if (typeof window !== 'undefined' && window.rtLibrary?.system?.isWindowFocused) {
        isFocused = await window.rtLibrary.system.isWindowFocused();
      }
    } catch (_) {}

    if (event.status === 'COMPLETED') {
      const hasNew = event.newItems > 0;
      const title = hasNew
        ? t('settings.scraper.syncCompletedToastTitle')
        : t('settings.scraper.syncUpToDateToastTitle');

      const desc = hasNew
        ? (event.newItems === 1
          ? t('settings.scraper.syncCompletedOneItemDesc')
          : t('settings.scraper.syncCompletedToastDesc', { count: event.newItems }))
        : t('settings.scraper.syncUpToDateToastDesc');

      if (!isFocused) {
        await notifyNativeIfBackground(title, desc);
      } else {
        toast.success(title, {
          description: desc,
          action: {
            label: t('settings.scraper.viewSummary'),
            onClick: () => onOpenSettings('scraper', `scraper/history:${event.runId}`),
          },
        });
      }
    } else if (event.status === 'COMPLETED_WITH_WARNINGS') {
      const title = t('settings.scraper.syncCompletedWarningsToastTitle');
      const uncompletedCount = Math.max(1, (event.categoriesTotal || 1) - (event.categoriesCompleted || 0));
      const desc = uncompletedCount === 1
        ? t('settings.scraper.syncCompletedWarningsOneDesc')
        : t('settings.scraper.syncCompletedWarningsToastDesc', { count: uncompletedCount });

      if (!isFocused) {
        await notifyNativeIfBackground(title, desc);
      } else {
        toast.warning(title, {
          description: desc,
          action: {
            label: t('settings.scraper.reviewIssues'),
            onClick: () => onOpenSettings('scraper', `scraper/history:${event.runId}`),
          },
        });
      }
    } else if (event.status === 'FAILED') {
      const title = t('settings.scraper.syncFailedToastTitle');
      const desc = event.errorSummary || t('settings.scraper.syncFailedToastDesc');

      if (!isFocused) {
        await notifyNativeIfBackground(title, desc);
      } else {
        toast.error(title, {
          description: desc,
          action: {
            label: t('settings.scraper.viewDetails'),
            onClick: () => onOpenSettings('scraper', `scraper/history:${event.runId}`),
          },
        });
      }

      // Display actionable banner for failed run
      if (dismissedBannerTypeRef.current !== 'FAILED') {
        setActionBanner({
          type: 'FAILED',
          message: desc,
          runId: event.runId,
        });
      }
    } else if (event.status === 'CANCELLED') {
      // User-initiated cancel: neutral, gentle toast, never treated as error
      toast.info(t('settings.scraper.syncCancelledToastTitle'));
    }
  }, [t, onOpenSettings, onRefreshLibrary, notifyNativeIfBackground]);

  // Subscribe to scraper run finalization
  useEffect(() => {
    const unsub = scraperService.onRunFinalized((event) => {
      handleRunFinalized(event);
    });
    return () => unsub();
  }, [handleRunFinalized]);

  // Handle active action banner updates based on scraper state & access probes
  useEffect(() => {
    const unsubState = scraperService.onStateChanged((data) => {
      const state = data?.state;

      if (state === 'running' || state === 'completed' || state === 'idle') {
        // Clear banner when back to normal running, completed, or idle
        setActionBanner(null);
        dismissedBannerTypeRef.current = null;
      } else if (state === 'interaction_required' || state === 'session_required' || state === 'verifying') {
        const transport = data?.details?.transport || data?.transport;
        const msg = transport === 'EMBEDDED_ELECTRON'
          ? t('settings.scraper.embeddedVerificationBannerTitle')
          : t('settings.scraper.actionBannerVerificationTitle');

        if (dismissedBannerTypeRef.current !== 'VERIFICATION_REQUIRED') {
          setActionBanner({
            type: 'VERIFICATION_REQUIRED',
            message: msg,
            categoryId: data?.details?.categoryId,
            transport,
          });
        }
        notifyNativeIfBackground(msg, t('settings.scraper.verifyNow'));
      } else if (data?.error && (/companion/i.test(data.error) && /disconnect/i.test(data.error))) {
        if (dismissedBannerTypeRef.current !== 'COMPANION_DISCONNECTED') {
          setActionBanner({
            type: 'COMPANION_DISCONNECTED',
            message: t('settings.scraper.actionBannerDisconnectedTitle'),
          });
        }
      }
    });

    const unsubAccess = scraperService.onAccessChanged((access: ScraperAccessStatus) => {
      if (!access) return;

      const hasChallenge = access.results?.some((r) =>
        r.status === 'INTERACTION_REQUIRED' || r.challengeDetected
      );
      const isDisconnected = (access.status as string) === 'DISCONNECTED' || access.results?.some((r) =>
        r.reason === 'COMPANION_DISCONNECTED' || r.reason === 'DISCONNECTED' || /disconnect/i.test(r.message || '')
      );
      const isNoTab = access.results?.some((r) => r.reason === 'NO_RUTRACKER_TAB' || r.status === 'UNKNOWN');

      if (hasChallenge) {
        if (dismissedBannerTypeRef.current !== 'VERIFICATION_REQUIRED') {
          setActionBanner({
            type: 'VERIFICATION_REQUIRED',
            message: t('settings.scraper.actionBannerVerificationTitle'),
          });
        }
      } else if (isDisconnected) {
        if (dismissedBannerTypeRef.current !== 'COMPANION_DISCONNECTED') {
          setActionBanner({
            type: 'COMPANION_DISCONNECTED',
            message: t('settings.scraper.actionBannerDisconnectedTitle'),
          });
        }
      } else if (isNoTab && access.status === 'ERROR') {
        if (dismissedBannerTypeRef.current !== 'NO_RUTRACKER_TAB') {
          setActionBanner({
            type: 'NO_RUTRACKER_TAB',
            message: t('settings.scraper.actionBannerNoTabTitle'),
          });
        }
      }
    });

    return () => {
      unsubState();
      unsubAccess();
    };
  }, [t]);

  // Check for interrupted previous runs at startup (once per app session)
  useEffect(() => {
    if (hasCheckedStartupInterruptedRef.current) return;
    hasCheckedStartupInterruptedRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const history = await scraperService.getSyncHistory({ limit: 1 });
        const latestRun = history?.runs?.[0];

        if (latestRun && latestRun.status === 'INTERRUPTED') {
          const notifiedKey = `rt_library_interrupted_${latestRun.id}`;
          if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(notifiedKey)) {
            return;
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(notifiedKey, 'true');
          }

          toast.info(t('settings.scraper.syncInterruptedStartupTitle'), {
            description: t('settings.scraper.syncInterruptedStartupDesc'),
            action: {
              label: t('settings.scraper.viewSummary'),
              onClick: () => onOpenSettings('scraper', `scraper/history:${latestRun.id}`),
            },
          });
        }
      } catch (err) {
        // Startup check failure non-critical
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [t, onOpenSettings]);

  const dismissActionBanner = useCallback(() => {
    if (actionBanner) {
      dismissedBannerTypeRef.current = actionBanner.type;
    }
    setActionBanner(null);
  }, [actionBanner]);

  const handleBannerAction = useCallback(async (actionType: 'open_rutracker' | 'check_again' | 'reconnect' | 'view_details' | 'verify_embedded', payload?: any) => {
    if (actionType === 'verify_embedded') {
      try {
        await scraperService.embeddedVerify({ categoryId: payload?.categoryId });
        setActionBanner(null);
        dismissedBannerTypeRef.current = null;
      } catch (err: any) {
        console.warn('[Coordinator] Embedded verification ended:', err?.message);
      }
    } else if (actionType === 'open_rutracker') {
      try {
        await scraperService.openCompanionRuTracker(payload?.categoryId);
      } catch (err) {
        console.warn('[Coordinator] Failed to open RuTracker:', err);
      }
    } else if (actionType === 'check_again') {
      try {
        await scraperService.probeAccess({ category: payload?.categoryId || 'all' });
        // If checking again succeeds, resume if possible
        await scraperService.resume().catch(() => {});
      } catch (err) {
        console.warn('[Coordinator] Failed to check access again:', err);
      }
    } else if (actionType === 'reconnect') {
      try {
        await scraperService.reconnectCompanion();
        setActionBanner(null);
        dismissedBannerTypeRef.current = null;
      } catch (err) {
        console.warn('[Coordinator] Reconnect failed:', err);
      }
    } else if (actionType === 'view_details') {
      onOpenSettings('scraper', payload?.runId ? `scraper/history:${payload.runId}` : 'scraper/history');
      setActionBanner(null);
    }
  }, [onOpenSettings]);

  return {
    actionBanner,
    dismissActionBanner,
    handleBannerAction,
    setActionBanner,
  };
}
