import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncHealthCard } from '@/components/scraper/SyncHealthCard';
import { SyncHistoryView } from '@/components/scraper/SyncHistoryView';
import { I18nProvider } from '@/i18n/I18nContext';
import { scraperService } from '@/services/scraperService';
import type { SyncHealthSummary, SyncRun, SyncRunDetails } from '@/services/scraperService';

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

const mockHealthData: SyncHealthSummary = {
  lastSuccessfulSync: {
    id: 'run_123',
    finishedAt: '2026-10-10T12:00:00.000Z',
    newItems: 42,
    updatedItems: 5,
    durationMs: 75000,
  },
  lastRun: {
    id: 'run_123',
    finishedAt: '2026-10-10T12:00:00.000Z',
    status: 'COMPLETED',
    newItems: 42,
    updatedItems: 5,
    durationMs: 75000,
    errorSummary: null,
  },
  healthyCategoriesCount: 2,
  needingAttentionCount: 1,
  categories: [
    {
      categoryId: 'switch',
      categoryName: 'Nintendo Switch',
      status: 'UP_TO_DATE',
      lastSuccessfulSyncAt: '2026-10-10T12:00:00.000Z',
      lastAttemptAt: '2026-10-10T12:00:00.000Z',
      lastError: null,
    },
    {
      categoryId: 'ps4',
      categoryName: 'PlayStation 4',
      status: 'UP_TO_DATE',
      lastSuccessfulSyncAt: '2026-10-10T11:30:00.000Z',
      lastAttemptAt: '2026-10-10T11:30:00.000Z',
      lastError: null,
    },
    {
      categoryId: 'xbox',
      categoryName: 'Xbox One',
      status: 'FAILED',
      lastSuccessfulSyncAt: null,
      lastAttemptAt: '2026-10-10T11:45:00.000Z',
      lastError: 'Companion tab closed unexpectedly',
    },
  ],
};

const mockRuns: SyncRun[] = [
  {
    id: 'run_1',
    startedAt: '2026-10-10T12:00:00.000Z',
    finishedAt: '2026-10-10T12:05:00.000Z',
    status: 'COMPLETED',
    mode: 'FULL_SCAN',
    transport: 'BROWSER_COMPANION',
    scopeType: 'ALL_CATEGORIES',
    scopeCategoryId: null,
    triggerType: 'MANUAL_USER',
    categoriesTotal: 2,
    categoriesCompleted: 2,
    topicsFound: 100,
    newItems: 25,
    updatedItems: 5,
    knownItems: 70,
    savedItems: 30,
    failedItems: 0,
    durationMs: 300000,
    cancelledByUser: false,
    verificationRequired: false,
    errorCode: null,
    errorSummary: null,
  },
  {
    id: 'run_2',
    startedAt: '2026-10-10T10:00:00.000Z',
    finishedAt: '2026-10-10T10:01:00.000Z',
    status: 'CANCELLED',
    mode: 'INCREMENTAL',
    transport: 'BROWSER_COMPANION',
    scopeType: 'SINGLE_CATEGORY',
    scopeCategoryId: 'switch',
    triggerType: 'MANUAL_USER',
    categoriesTotal: 1,
    categoriesCompleted: 0,
    topicsFound: 50,
    newItems: 0,
    updatedItems: 0,
    knownItems: 50,
    savedItems: 0,
    failedItems: 0,
    durationMs: 60000,
    cancelledByUser: true,
    verificationRequired: false,
    errorCode: null,
    errorSummary: 'Cancelled by user',
  },
];

const mockRunDetails: SyncRunDetails = {
  ...mockRuns[0],
  categories: [
    {
      id: 'run_1_switch',
      syncRunId: 'run_1',
      categoryId: 'switch',
      categoryNameSnapshot: 'Nintendo Switch',
      startedAt: '2026-10-10T12:00:00.000Z',
      finishedAt: '2026-10-10T12:03:00.000Z',
      status: 'COMPLETED',
      pagesProcessed: 5,
      totalPages: 5,
      topicsFound: 60,
      newItems: 15,
      updatedItems: 3,
      knownItems: 42,
      savedItems: 18,
      durationMs: 180000,
      errorCode: null,
      errorSummary: null,
    },
  ],
};

describe('SyncHealthCard Component (V3-75)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(scraperService, 'getSyncHealth').mockResolvedValue(mockHealthData);
  });

  it('renders health summary metrics and counts accurately', async () => {
    renderWithI18n(
      <SyncHealthCard
        onNavigateToHistory={vi.fn()}
        onSyncCategory={vi.fn()}
      />
    );

    // Wait for health data to load
    await waitFor(() => {
      expect(scraperService.getSyncHealth).toHaveBeenCalled();
    });

    // Operational summary metrics
    expect(await screen.findByText('+42')).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 categories synchronized|2 de 3 categorias sincronizadas|2 из 3 категорий синхронизировано/i)).toBeInTheDocument();
    expect(screen.getByText(/1 category needs attention|1 categoria precisa de atenção|1 категория требует внимания/i)).toBeInTheDocument();
  });

  it('triggers onNavigateToHistory when View History button is clicked', async () => {
    const onNavigateToHistory = vi.fn();
    renderWithI18n(
      <SyncHealthCard
        onNavigateToHistory={onNavigateToHistory}
        onSyncCategory={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(scraperService.getSyncHealth).toHaveBeenCalled();
    });

    const historyBtn = await screen.findByRole('button', { name: /View Sync History|Histórico de Sincronização|История синхронизации/i });
    fireEvent.click(historyBtn);
    expect(onNavigateToHistory).toHaveBeenCalledTimes(1);
  });

  it('expands categories list and triggers onSyncCategory', async () => {
    const onSyncCategory = vi.fn();
    renderWithI18n(
      <SyncHealthCard
        onNavigateToHistory={vi.fn()}
        onSyncCategory={onSyncCategory}
      />
    );

    await waitFor(() => {
      expect(scraperService.getSyncHealth).toHaveBeenCalled();
    });

    // Expand toggle
    const toggleBtn = await screen.findByText(/Categories \(3\)|Categorias \(3\)|Категории \(3\)/i);
    fireEvent.click(toggleBtn);

    // Category names should appear
    expect(await screen.findByText('Nintendo Switch')).toBeInTheDocument();
    expect(screen.getByText('PlayStation 4')).toBeInTheDocument();
    expect(screen.getByText('Xbox One')).toBeInTheDocument();

    // Error summary for failed category should be visible
    expect(screen.getByText('Companion tab closed unexpectedly')).toBeInTheDocument();

    // Trigger per-category sync
    const syncButtons = screen.getAllByRole('button', { name: /^Sync Category$|^Sincronizar Categoria$|^Синхронизировать категорию$/i });
    expect(syncButtons.length).toBeGreaterThan(0);
    fireEvent.click(syncButtons[0]);
    expect(onSyncCategory).toHaveBeenCalledWith('switch');
  });
});

describe('SyncHistoryView Component (V3-75)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(scraperService, 'getSyncHistory').mockResolvedValue({
      runs: mockRuns,
      total: 2,
    });
    vi.spyOn(scraperService, 'getSyncRunDetails').mockResolvedValue(mockRunDetails);
  });

  it('renders history view with runs and filters', async () => {
    const onBack = vi.fn();
    renderWithI18n(<SyncHistoryView onBack={onBack} />);

    await waitFor(() => {
      expect(scraperService.getSyncHistory).toHaveBeenCalled();
    });

    // Header and Back button
    expect(screen.getByText(/Synchronization History|Histórico de Sincronização|История синхронизации/i)).toBeInTheDocument();
    const backBtn = screen.getByText(/Back to Scraper Settings|Back to Settings|Voltar às Configurações|Назад к настройкам/i);
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);

    // Mode and transport badges
    expect(screen.getByText(/Full Scan/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Browser Companion/i).length).toBeGreaterThan(0);
  });

  it('filters runs by status', async () => {
    renderWithI18n(<SyncHistoryView />);

    await waitFor(() => {
      expect(scraperService.getSyncHistory).toHaveBeenCalled();
    });

    // Click Failed filter
    const failedFilterBtn = screen.getByRole('button', { name: /Failed|Falhas|Ошибки/i });
    fireEvent.click(failedFilterBtn);

    await waitFor(() => {
      expect(scraperService.getSyncHistory).toHaveBeenCalledWith(
        expect.objectContaining({ statusFilter: 'FAILED' })
      );
    });
  });

  it('expands run to reveal per-category details', async () => {
    renderWithI18n(<SyncHistoryView />);

    await waitFor(() => {
      expect(scraperService.getSyncHistory).toHaveBeenCalled();
    });

    // Find and expand run 1 by clicking its button
    const run1Card = screen.getByText(/All categories \(2\)/i);
    const cardButton = run1Card.closest('button');
    expect(cardButton).not.toBeNull();
    fireEvent.click(cardButton!);

    await waitFor(() => {
      expect(scraperService.getSyncRunDetails).toHaveBeenCalledWith('run_1');
    });

    // Verify category snapshot rendered
    expect(await screen.findByText('Nintendo Switch')).toBeInTheDocument();
  });
});
