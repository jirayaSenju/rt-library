import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GlobalSyncStatus } from '@/components/layout/GlobalSyncStatus'
import { FirstRunScraperScreen } from '@/components/onboarding/FirstRunScraperScreen'
import { ItemGrid } from '@/components/library/ItemGrid'
import { ItemList } from '@/components/library/ItemList'
import { I18nProvider } from '@/i18n'
import { nativeLibraryService } from '@/services/nativeLibrary'
import { scraperService } from '@/services/scraperService'

// Mock nativeLibraryService
vi.mock('@/services/nativeLibrary', () => ({
  nativeLibraryService: {
    dismissOnboarding: vi.fn().mockResolvedValue(true),
    getReadiness: vi.fn().mockResolvedValue({ isReady: true, state: 'READY' }),
    getCategories: vi.fn().mockResolvedValue([]),
    getItems: vi.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  },
}))

// Mock scraperService
vi.mock('@/services/scraperService', () => {
  let stateListener: ((s: any) => void) | null = null
  let progressListener: ((p: any) => void) | null = null
  let pageCommittedListener: ((e: any) => void) | null = null

  return {
    scraperService: {
      getState: vi.fn().mockResolvedValue({
        state: 'running',
        isRunning: true,
        progress: {
          categoryName: 'Nintendo Switch',
          currentPage: 3,
          totalPages: 10,
          newItems: 42,
          processedItems: 50,
          topicsDiscovered: 60,
          detailsProcessed: 42,
          elapsedMs: 25000,
        },
        logs: [],
      }),
      onStateChanged: vi.fn((fn) => {
        stateListener = fn
        return () => { stateListener = null }
      }),
      onProgress: vi.fn((fn) => {
        progressListener = fn
        return () => { progressListener = null }
      }),
      onAccessChanged: vi.fn(() => () => {}),
      onLog: vi.fn(() => () => {}),
      onPageCommitted: vi.fn((fn) => {
        pageCommittedListener = fn
        return () => { pageCommittedListener = null }
      }),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      getCategories: vi.fn().mockResolvedValue([]),
      setCategoryEnabled: vi.fn().mockResolvedValue(undefined),
      getCompanionStatus: vi.fn().mockResolvedValue({
        port: 37829,
        token: 'test-token',
        connected: true,
      }),
      __emitState: (s: any) => stateListener?.(s),
      __emitProgress: (p: any) => progressListener?.(p),
      __emitPageCommitted: (e: any) => pageCommittedListener?.(e),
    },
  }
})

describe('V3-74 - Progressive Library Experience During Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GlobalSyncStatus component', () => {
    it('renders sync indicator when running and shows metrics in popover', async () => {
      const handleOpenSettings = vi.fn()

      render(
        <I18nProvider>
          <GlobalSyncStatus onOpenSettings={handleOpenSettings} />
        </I18nProvider>
      )

      // The pill should be visible with syncing status
      await waitFor(() => {
        expect(screen.getByText(/Syncing|Sincronizando/i)).toBeInTheDocument()
      })

      // Click the pill to open the popover
      const pill = screen.getByRole('button', { name: /Sync Status|Status da Sincronização/i })
      fireEvent.click(pill)

      // Popover should display category name and details
      expect(screen.getByText('Nintendo Switch')).toBeInTheDocument()
      expect(screen.getByText(/3 \/ 10/)).toBeInTheDocument()
      expect(screen.getByText(/Synchronization will continue in the background|A sincronização continuará/i)).toBeInTheDocument()

      // Pause button should be available
      const pauseBtn = screen.getByRole('button', { name: /Pause|Pausar/i })
      expect(pauseBtn).toBeInTheDocument()
      fireEvent.click(pauseBtn)
      expect(scraperService.pause).toHaveBeenCalled()
    })
  })

  describe('FirstRunScraperScreen Step 5 secondary action', () => {
    it('displays [ Browse Library ] button and dismisses onboarding on click', async () => {
      const onComplete = vi.fn()

      render(
        <I18nProvider>
          <FirstRunScraperScreen onComplete={onComplete} initialStep="SYNC" />
        </I18nProvider>
      )

      await waitFor(() => {
        expect(screen.getByText(/Browse Library|Navegar na Biblioteca/i)).toBeInTheDocument()
      })

      // Notice should be present
      expect(screen.getByText(/Synchronization will continue in the background while RT-Library remains open/i)).toBeInTheDocument()

      // Click Browse Library
      const browseBtn = screen.getByRole('button', { name: /Browse Library|Navegar na Biblioteca/i })
      fireEvent.click(browseBtn)

      await waitFor(() => {
        expect(nativeLibraryService.dismissOnboarding).toHaveBeenCalledTimes(1)
        expect(onComplete).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('ItemGrid progressive empty state & viewport stability', () => {
    it('renders "Building your library..." when empty and isSyncing is true', () => {
      const onViewSync = vi.fn()

      render(
        <I18nProvider>
          <ItemGrid
            items={[]}
            isLoading={false}
            favorites={new Set()}
            onToggleFavorite={vi.fn()}
            onSelectItem={vi.fn()}
            isLibraryEmpty={true}
            isSyncing={true}
            onViewSync={onViewSync}
          />
        </I18nProvider>
      )

      expect(screen.getByText(/Building your library|Construindo sua biblioteca/i)).toBeInTheDocument()
      const syncBtn = screen.getByRole('button', { name: /View synchronization|Ver sincronização/i })
      expect(syncBtn).toBeInTheDocument()
      fireEvent.click(syncBtn)
      expect(onViewSync).toHaveBeenCalled()
    })

    it('renders floating new items banner when pendingNewItemsCount > 0', () => {
      const onShowNewItems = vi.fn()

      render(
        <I18nProvider>
          <ItemGrid
            items={[
              {
                id: '1',
                title: 'Item 1',
                categoryId: 'nintendo-switch',
                categoryName: 'Nintendo Switch',
                hasMagnet: true,
                hasScreenshots: true,
                isFavorite: false,
              },
            ]}
            isLoading={false}
            favorites={new Set()}
            onToggleFavorite={vi.fn()}
            onSelectItem={vi.fn()}
            pendingNewItemsCount={5}
            onShowNewItems={onShowNewItems}
          />
        </I18nProvider>
      )

      expect(screen.getByText(/5 new items available|5 novos itens/i)).toBeInTheDocument()
      const showBtn = screen.getByRole('button', { name: /Show|Exibir/i })
      expect(showBtn).toBeInTheDocument()
      fireEvent.click(showBtn)
      expect(onShowNewItems).toHaveBeenCalled()
    })
  })

  describe('ItemList progressive empty state & viewport stability', () => {
    it('renders "Building your library..." when empty and isSyncing is true', () => {
      const onViewSync = vi.fn()

      render(
        <I18nProvider>
          <ItemList
            items={[]}
            isLoading={false}
            favorites={new Set()}
            onToggleFavorite={vi.fn()}
            onSelectItem={vi.fn()}
            isLibraryEmpty={true}
            isSyncing={true}
            onViewSync={onViewSync}
          />
        </I18nProvider>
      )

      expect(screen.getByText(/Building your library|Construindo sua biblioteca/i)).toBeInTheDocument()
      const syncBtn = screen.getByRole('button', { name: /View synchronization|Ver sincronização/i })
      expect(syncBtn).toBeInTheDocument()
      fireEvent.click(syncBtn)
      expect(onViewSync).toHaveBeenCalled()
    })

    it('renders floating new items banner when pendingNewItemsCount > 0', () => {
      const onShowNewItems = vi.fn()

      render(
        <I18nProvider>
          <ItemList
            items={[
              {
                id: '1',
                title: 'Item 1',
                categoryId: 'nintendo-switch',
                categoryName: 'Nintendo Switch',
                hasMagnet: true,
                hasScreenshots: true,
                isFavorite: false,
              },
            ]}
            isLoading={false}
            favorites={new Set()}
            onToggleFavorite={vi.fn()}
            onSelectItem={vi.fn()}
            pendingNewItemsCount={3}
            onShowNewItems={onShowNewItems}
          />
        </I18nProvider>
      )

      expect(screen.getByText(/3 new items available|3 novos itens/i)).toBeInTheDocument()
      const showBtn = screen.getByRole('button', { name: /Show|Exibir/i })
      expect(showBtn).toBeInTheDocument()
      fireEvent.click(showBtn)
      expect(onShowNewItems).toHaveBeenCalled()
    })
  })
})
