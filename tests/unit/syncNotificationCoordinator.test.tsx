import React from 'react';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import { I18nProvider } from '@/i18n/I18nContext';
import { SyncActionBanner } from '@/components/layout/SyncActionBanner';
import { useSyncNotificationCoordinator } from '@/hooks/useSyncNotificationCoordinator';
import { scraperService } from '@/services/scraperService';
import type { SyncRunFinalizedEvent, ScraperAccessStatus } from '@/services/scraperService';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('SyncActionBanner Component', () => {
  const renderBanner = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

  it('renders null when banner state is null', () => {
    const { container } = renderBanner(
      <SyncActionBanner banner={null} onDismiss={vi.fn()} onAction={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders VERIFICATION_REQUIRED banner with Open RuTracker and Check Again buttons', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();

    renderBanner(
      <SyncActionBanner
        banner={{ type: 'VERIFICATION_REQUIRED', categoryId: 'switch' }}
        onDismiss={onDismiss}
        onAction={onAction}
      />
    );

    const openBtn = screen.getByRole('button', { name: /open rutracker/i });
    const checkBtn = screen.getByRole('button', { name: /check again/i });
    expect(openBtn).toBeInTheDocument();
    expect(checkBtn).toBeInTheDocument();

    fireEvent.click(openBtn);
    expect(onAction).toHaveBeenCalledWith('open_rutracker', { categoryId: 'switch' });

    fireEvent.click(checkBtn);
    expect(onAction).toHaveBeenCalledWith('check_again', { categoryId: 'switch' });

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders COMPANION_DISCONNECTED banner with Reconnect button', () => {
    const onAction = vi.fn();
    renderBanner(
      <SyncActionBanner
        banner={{ type: 'COMPANION_DISCONNECTED' }}
        onDismiss={vi.fn()}
        onAction={onAction}
      />
    );

    const reconnectBtn = screen.getByRole('button', { name: /reconnect/i });
    expect(reconnectBtn).toBeInTheDocument();
    fireEvent.click(reconnectBtn);
    expect(onAction).toHaveBeenCalledWith('reconnect');
  });

  it('renders NO_RUTRACKER_TAB banner with Open RuTracker button', () => {
    const onAction = vi.fn();
    renderBanner(
      <SyncActionBanner
        banner={{ type: 'NO_RUTRACKER_TAB' }}
        onDismiss={vi.fn()}
        onAction={onAction}
      />
    );

    const openBtn = screen.getByRole('button', { name: /open rutracker/i });
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);
    expect(onAction).toHaveBeenCalledWith('open_rutracker', { categoryId: undefined });
  });

  it('renders FAILED banner with View Details button', () => {
    const onAction = vi.fn();
    renderBanner(
      <SyncActionBanner
        banner={{ type: 'FAILED', runId: 'run_999', message: 'Fatal bridge crash' }}
        onDismiss={vi.fn()}
        onAction={onAction}
      />
    );

    expect(screen.getByText('Fatal bridge crash')).toBeInTheDocument();
    const detailsBtn = screen.getByRole('button', { name: /view details/i });
    expect(detailsBtn).toBeInTheDocument();
    fireEvent.click(detailsBtn);
    expect(onAction).toHaveBeenCalledWith('view_details', { runId: 'run_999' });
  });
});

describe('useSyncNotificationCoordinator Hook', () => {
  let runFinalizedListeners: ((event: SyncRunFinalizedEvent) => void)[] = [];
  let stateListeners: ((data: { state: any; error?: string }) => void)[] = [];
  let accessListeners: ((access: ScraperAccessStatus) => void)[] = [];

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider>{children}</I18nProvider>
  );

  beforeEach(() => {
    runFinalizedListeners = [];
    stateListeners = [];
    accessListeners = [];

    vi.spyOn(scraperService, 'onRunFinalized').mockImplementation((cb) => {
      runFinalizedListeners.push(cb);
      return () => {
        runFinalizedListeners = runFinalizedListeners.filter((l) => l !== cb);
      };
    });

    vi.spyOn(scraperService, 'onStateChanged').mockImplementation((cb) => {
      stateListeners.push(cb);
      return () => {
        stateListeners = stateListeners.filter((l) => l !== cb);
      };
    });

    vi.spyOn(scraperService, 'onAccessChanged').mockImplementation((cb) => {
      accessListeners.push(cb);
      return () => {
        accessListeners = accessListeners.filter((l) => l !== cb);
      };
    });

    vi.spyOn(scraperService, 'getSyncHistory').mockResolvedValue({ runs: [], total: 0 });

    if (window.rtLibrary?.system?.isWindowFocused) {
      vi.mocked(window.rtLibrary.system.isWindowFocused).mockResolvedValue(true);
    }
    if (window.rtLibrary?.system?.showNotification) {
      vi.mocked(window.rtLibrary.system.showNotification).mockResolvedValue(true);
    }

    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notifies success with item count and action button when run completes with new items', async () => {
    const onOpenSettings = vi.fn();
    const onRefreshLibrary = vi.fn();

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings,
          onRefreshLibrary,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_success_1',
      status: 'COMPLETED',
      newItems: 12,
      updatedItems: 2,
      savedItems: 14,
      categoriesCompleted: 3,
      categoriesTotal: 3,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(onRefreshLibrary).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.success).mock.calls[0];
    expect(title).toMatch(/complete/i);
    expect(options?.description).toMatch(/12/);
    expect(options?.action?.label).toMatch(/view summary/i);

    // Clicking action opens history for this specific run
    options?.action?.onClick?.();
    expect(onOpenSettings).toHaveBeenCalledWith('scraper', 'scraper/history:run_success_1');
  });

  it('notifies up to date positive copy when run completes with 0 new items', async () => {
    const onOpenSettings = vi.fn();

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_uptodate_1',
      status: 'COMPLETED',
      newItems: 0,
      updatedItems: 0,
      savedItems: 0,
      categoriesCompleted: 2,
      categoriesTotal: 2,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.success).mock.calls[0];
    expect(title).toMatch(/up to date/i);
    expect(options?.description).toMatch(/up to date/i);
  });

  it('notifies warning with review action when run completes with warnings', async () => {
    const onOpenSettings = vi.fn();

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_warn_1',
      status: 'COMPLETED_WITH_WARNINGS',
      newItems: 5,
      updatedItems: 0,
      savedItems: 5,
      categoriesCompleted: 2,
      categoriesTotal: 3,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.warning).mock.calls[0];
    expect(title).toMatch(/warnings/i);
    expect(options?.action?.label).toMatch(/review issues/i);

    options?.action?.onClick?.();
    expect(onOpenSettings).toHaveBeenCalledWith('scraper', 'scraper/history:run_warn_1');
  });

  it('notifies error and opens banner when run fails', async () => {
    const onOpenSettings = vi.fn();

    const { result } = renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_fail_1',
      status: 'FAILED',
      newItems: 0,
      updatedItems: 0,
      savedItems: 0,
      categoriesCompleted: 0,
      categoriesTotal: 2,
      errorCode: 'ERR_CRASH',
      errorSummary: 'RuTracker connection lost',
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(result.current.actionBanner).toEqual({
      type: 'FAILED',
      message: 'RuTracker connection lost',
      runId: 'run_fail_1',
    });
  });

  it('notifies neutral info when run is cancelled by user', async () => {
    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_cancel_1',
      status: 'CANCELLED',
      newItems: 0,
      updatedItems: 0,
      savedItems: 0,
      categoriesCompleted: 0,
      categoriesTotal: 2,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: true,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('deduplicates run finalization notifications for the same runId', async () => {
    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_dedup_1',
      status: 'COMPLETED',
      newItems: 3,
      updatedItems: 0,
      savedItems: 3,
      categoriesCompleted: 1,
      categoriesTotal: 1,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
      // Re-emit same event (e.g. duplicate event emission)
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('routes to desktop notification when window is not focused and background notifications enabled', async () => {
    if (window.rtLibrary?.system?.isWindowFocused) {
      vi.mocked(window.rtLibrary.system.isWindowFocused).mockResolvedValue(false);
    }

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
          enableBackgroundNotifications: true,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_bg_1',
      status: 'COMPLETED',
      newItems: 8,
      updatedItems: 0,
      savedItems: 8,
      categoriesCompleted: 1,
      categoriesTotal: 1,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(window.rtLibrary?.system?.showNotification).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('suppresses desktop notification when background notifications are disabled', async () => {
    if (window.rtLibrary?.system?.isWindowFocused) {
      vi.mocked(window.rtLibrary.system.isWindowFocused).mockResolvedValue(false);
    }

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
          enableBackgroundNotifications: false,
        }),
      { wrapper }
    );

    const event: SyncRunFinalizedEvent = {
      runId: 'run_bg_disabled',
      status: 'COMPLETED',
      newItems: 8,
      updatedItems: 0,
      savedItems: 8,
      categoriesCompleted: 1,
      categoriesTotal: 1,
      errorCode: null,
      errorSummary: null,
      cancelledByUser: false,
    };

    await act(async () => {
      runFinalizedListeners.forEach((listener) => listener(event));
    });

    expect(window.rtLibrary?.system?.showNotification).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('triggers startup interrupted run notification at most once per session', async () => {
    vi.spyOn(scraperService, 'getSyncHistory').mockResolvedValue({
      runs: [
        {
          id: 'run_interrupted_prior',
          startedAt: '2026-10-10T10:00:00.000Z',
          finishedAt: null,
          status: 'INTERRUPTED',
          mode: 'FULL',
          transport: 'COMPANION',
          scopeType: null,
          scopeCategoryId: null,
          triggerType: 'MANUAL',
          categoriesTotal: 4,
          categoriesCompleted: 2,
          topicsFound: 100,
          newItems: 40,
          updatedItems: 0,
          knownItems: 60,
          savedItems: 40,
          failedItems: 0,
          durationMs: 50000,
          cancelledByUser: 0,
          verificationRequired: 0,
          errorCode: null,
          errorSummary: null,
        },
      ],
      total: 1,
    });

    renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(
      () => {
        expect(toast.info).toHaveBeenCalledWith(
          expect.stringMatching(/interrupted/i),
          expect.objectContaining({
            description: expect.stringMatching(/safe|resumed|committed/i),
          })
        );
      },
      { timeout: 2500 }
    );

    expect(sessionStorage.getItem('rt_library_interrupted_run_interrupted_prior')).toBe('true');
  });

  it('updates and clears action banner based on scraper state and access checks', async () => {
    const { result } = renderHook(
      () =>
        useSyncNotificationCoordinator({
          onOpenSettings: vi.fn(),
        }),
      { wrapper }
    );

    // 1. Scraper state requires verification
    await act(async () => {
      stateListeners.forEach((l) => l({ state: 'verifying' }));
    });
    expect(result.current.actionBanner?.type).toBe('VERIFICATION_REQUIRED');

    // 2. Scraper state transitions to running -> banner clears
    await act(async () => {
      stateListeners.forEach((l) => l({ state: 'running' }));
    });
    expect(result.current.actionBanner).toBeNull();

    // 3. Companion disconnects
    await act(async () => {
      stateListeners.forEach((l) => l({ state: 'error', error: 'Companion disconnected unexpectedly' }));
    });
    expect(result.current.actionBanner?.type).toBe('COMPANION_DISCONNECTED');

    // 4. Access check shows missing tab
    await act(async () => {
      accessListeners.forEach((l) =>
        l({
          status: 'ERROR',
          results: [{ categoryId: 'ps4', status: 'UNKNOWN', reason: 'NO_RUTRACKER_TAB' }],
        })
      );
    });
    expect(result.current.actionBanner?.type).toBe('NO_RUTRACKER_TAB');

    // 5. Verification required has higher priority over NO_RUTRACKER_TAB
    await act(async () => {
      accessListeners.forEach((l) =>
        l({
          status: 'ERROR',
          results: [
            { categoryId: 'ps4', status: 'INTERACTION_REQUIRED', challengeDetected: true },
            { categoryId: 'switch', status: 'UNKNOWN', reason: 'NO_RUTRACKER_TAB' },
          ],
        })
      );
    });
    expect(result.current.actionBanner?.type).toBe('VERIFICATION_REQUIRED');

    // 6. Dismissing banner clears it
    act(() => {
      result.current.dismissActionBanner();
    });
    expect(result.current.actionBanner).toBeNull();
  });
});
