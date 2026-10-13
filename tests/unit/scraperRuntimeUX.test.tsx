import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScraperProgress } from '@/components/scraper/ScraperProgress';
import { I18nProvider } from '@/i18n/I18nContext';

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

describe('ScraperProgress Runtime UX (V3-66)', () => {
  it('renders human-friendly progress metrics for active scan', () => {
    renderWithI18n(
      <ScraperProgress
        state="running"
        progress={{
          category: 'switch',
          categoryName: 'Nintendo Switch',
          categoryIndex: 3,
          totalCategories: 12,
          currentPage: 3,
          totalPages: 12,
          topicsDiscovered: 142,
          newTopics: 8,
          knownTopics: 134,
          detailsProcessed: 5,
          detailsTotal: 8,
          newItems: 5,
          processedItems: 5,
          elapsedMs: 65000,
        }}
        onCancel={vi.fn()}
      />
    );

    // Human-friendly scope
    expect(screen.getByText(/Nintendo Switch/i)).toBeInTheDocument();
    expect(screen.getByText(/Category 3 of 12|Categoria 3 de 12|Категория 3 из 12/i)).toBeInTheDocument();

    // Page numbers
    expect(screen.getByText(/3 \/ 12/)).toBeInTheDocument();

    // Topic breakdown
    expect(screen.getByText(/142/)).toBeInTheDocument();
    expect(screen.getByText(/\+8/)).toBeInTheDocument();
    expect(screen.getByText(/134/)).toBeInTheDocument();
    expect(screen.getByText(/5 \/ 8/)).toBeInTheDocument();

    // Percentage
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders indeterminate progress without inventing percentage when total is unknown', () => {
    renderWithI18n(
      <ScraperProgress
        state="running"
        progress={{
          category: 'switch',
          categoryName: 'Nintendo Switch',
          currentPage: 1,
          totalPages: 1, // Unknown total before pagination parsed
          topicsDiscovered: 0,
        }}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/Scanning\.\.\.|Varrendo\.\.\.|Сканирование\.\.\./i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('renders multi-category status list and allows toggling view', () => {
    renderWithI18n(
      <ScraperProgress
        state="running"
        progress={{
          category: 'ps2',
          categoryName: 'PlayStation 2',
          categoryIndex: 2,
          totalCategories: 3,
          categoryStatuses: [
            { id: 'switch', name: 'Nintendo Switch', status: 'completed' },
            { id: 'ps2', name: 'PlayStation 2', status: 'in_progress' },
            { id: 'xbox', name: 'Xbox 360', status: 'pending' },
          ],
        }}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Categories|Categorias|Категории/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByText('Nintendo Switch')).toBeInTheDocument();
    expect(screen.getByText('Xbox 360')).toBeInTheDocument();
  });

  it('renders library already up to date cleanly when 0 new items discovered', () => {
    renderWithI18n(
      <ScraperProgress
        state="completed"
        progress={{
          categoryName: 'Nintendo Switch',
          currentPage: 3,
          totalPages: 3,
          newItems: 0,
          updatedItems: 0,
          elapsedMs: 12000,
        }}
      />
    );

    expect(
      screen.getByText(/Library is already up to date|Biblioteca já está atualizada|Библиотека уже обновлена/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
  });

  it('renders partial sync completion with warnings when some categories failed or paused', () => {
    renderWithI18n(
      <ScraperProgress
        state="completed"
        progress={{
          categoryName: 'All Categories',
          newItems: 10,
          categoryStatuses: [
            { id: 'switch', name: 'Nintendo Switch', status: 'completed' },
            { id: 'ps3', name: 'PlayStation 3', status: 'paused' },
          ],
        }}
      />
    );

    expect(
      screen.getByText(/Synchronization completed with warnings|Sincronização concluída com avisos|Синхронизация завершена с предупреждениями/i)
    ).toBeInTheDocument();
  });

  it('renders paused state with Open RuTracker, Check Access, and Resume actions', () => {
    const onOpen = vi.fn();
    const onCheck = vi.fn();
    const onResume = vi.fn();

    renderWithI18n(
      <ScraperProgress
        state="interaction_required"
        progress={{ categoryName: 'Nintendo Switch', totalItems: 12, currentPage: 2 }}
        onOpenBrowser={onOpen}
        onCheckAccess={onCheck}
        onRenewSession={onResume}
      />
    );

    expect(
      screen.getByText(/Browser verification required|Verificação do navegador necessária|Требуется проверка браузера/i)
    ).toBeInTheDocument();

    const openBtn = screen.getByRole('button', { name: /Open RuTracker|Abrir RuTracker|Открыть RuTracker/i });
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalled();

    const checkBtn = screen.getByRole('button', { name: /Check Again|Verificar Novamente|Проверить снова/i });
    fireEvent.click(checkBtn);
    expect(onCheck).toHaveBeenCalled();

    const resumeBtn = screen.getByRole('button', { name: /Resume|Retomar|Возобновить/i });
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalled();
  });

  it('renders disconnected mid-scan notice with Reconnect action', () => {
    const onReconnect = vi.fn();

    renderWithI18n(
      <ScraperProgress
        state="failed"
        error="Browser companion disconnected mid-flight"
        progress={{ totalItems: 45 }}
        onReconnect={onReconnect}
      />
    );

    expect(
      screen.getByText(/Browser Companion disconnected|Browser Companion desconectado|Browser Companion отключён/i)
    ).toBeInTheDocument();

    const reconnectBtn = screen.getByRole('button', { name: /Reconnect|Reconectar|Переподключиться/i });
    fireEvent.click(reconnectBtn);
    expect(onReconnect).toHaveBeenCalled();
  });

  it('standardizes raw errors into human friendly categories without exposing stack trace', () => {
    renderWithI18n(
      <ScraperProgress
        state="failed"
        error="Error: ECONNREFUSED 127.0.0.1:45231 at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1146:16)"
      />
    );

    // Category should be Network or Connection, and raw net.js stack trace is NOT displayed in user message
    expect(screen.getByText(/\(Network\)|\(Connection\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/TCPConnectWrap/i)).not.toBeInTheDocument();
  });

  describe('Pause / Resume Lifecycle UX (V3-73)', () => {
    it('renders Pause and Cancel buttons in running state and triggers onPause on click', () => {
      const onPause = vi.fn();
      const onCancel = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="running"
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
            topicsDiscovered: 50,
            newTopics: 10,
          }}
          onPause={onPause}
          onCancel={onCancel}
        />
      );

      const pauseBtn = screen.getByRole('button', { name: /Pause|Pausar|Приостановить/i });
      const cancelBtn = screen.getByRole('button', { name: /Cancel|Cancelar|Отмена/i });

      expect(pauseBtn).toBeInTheDocument();
      expect(cancelBtn).toBeInTheDocument();
      expect(pauseBtn).not.toBeDisabled();
      expect(cancelBtn).not.toBeDisabled();

      fireEvent.click(pauseBtn);
      expect(onPause).toHaveBeenCalledTimes(1);
    });

    it('disables pause button and shows pausing indicator when isPausing is true', () => {
      const onPause = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="running"
          isPausing={true}
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
          }}
          onPause={onPause}
        />
      );

      const pauseBtn = screen.getByRole('button', { name: /Pausing|Pausando|Приостановка/i });
      expect(pauseBtn).toBeInTheDocument();
      expect(pauseBtn).toBeDisabled();
    });

    it('renders user paused view with Resume and Cancel buttons and triggers actions', () => {
      const onResume = vi.fn();
      const onCancel = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="paused"
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
            newItems: 12,
            processedItems: 15,
            elapsedMs: 45000,
          }}
          onResume={onResume}
          onCancel={onCancel}
        />
      );

      // Verify User Paused Header & memory note
      expect(screen.getByText(/Synchronization paused|Sincronização pausada|Синхронизация приостановлена/i)).toBeInTheDocument();
      expect(screen.getAllByText(/progress is kept in memory|progresso é mantido em memória|прогресс сохраняется в памяти/i).length).toBeGreaterThan(0);

      const resumeBtn = screen.getByRole('button', { name: /Resume|Retomar|Возобновить/i });
      const cancelBtn = screen.getByRole('button', { name: /Cancel|Cancelar|Отмена/i });

      expect(resumeBtn).toBeInTheDocument();
      expect(cancelBtn).toBeInTheDocument();
      expect(resumeBtn).not.toBeDisabled();
      expect(cancelBtn).not.toBeDisabled();

      fireEvent.click(resumeBtn);
      expect(onResume).toHaveBeenCalledTimes(1);

      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('disables resume button and shows resuming indicator when isResuming is true', () => {
      const onResume = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="paused"
          isResuming={true}
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
          }}
          onResume={onResume}
        />
      );

      const resumeBtn = screen.getByRole('button', { name: /Resuming|Retomando|Возобновление/i });
      expect(resumeBtn).toBeInTheDocument();
      expect(resumeBtn).toBeDisabled();
    });

    it('distinguishes user-initiated pause from browser verification required state', () => {
      renderWithI18n(
        <ScraperProgress
          state="interaction_required"
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
          }}
        />
      );

      // Should show Browser verification required, NOT the user pause card
      expect(screen.getByText(/Browser verification required|Verificação do navegador necessária|Требуется проверка браузера/i)).toBeInTheDocument();
      expect(screen.queryByText(/Progress is kept in memory|O progresso é mantido em memória|Прогресс сохраняется в памяти/i)).not.toBeInTheDocument();
    });

    it('renders in-app verification controls (Verify Now, Cancel) when EMBEDDED_ELECTRON is active', () => {
      const onVerifyEmbedded = vi.fn();
      const onCancel = vi.fn();
      const onOpenBrowser = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="interaction_required"
          activeTransport="EMBEDDED_ELECTRON"
          onVerifyEmbedded={onVerifyEmbedded}
          onCancel={onCancel}
          onOpenBrowser={onOpenBrowser}
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
          }}
        />
      );

      // Verify Now button is rendered
      const verifyBtn = screen.getByRole('button', { name: /Verify Now|Verificar Agora|Пройти проверку/i });
      expect(verifyBtn).toBeInTheDocument();

      // Cancel button is rendered
      const cancelBtn = screen.getByRole('button', { name: /Cancel|Cancelar|Отмена/i });
      expect(cancelBtn).toBeInTheDocument();

      // Companion's Open RuTracker button must NOT be rendered
      expect(screen.queryByRole('button', { name: /Open RuTracker|Abrir RuTracker|Открыть RuTracker/i })).not.toBeInTheDocument();

      fireEvent.click(verifyBtn);
      expect(onVerifyEmbedded).toHaveBeenCalledTimes(1);

      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onOpenBrowser).not.toHaveBeenCalled();
    });

    it('renders companion controls (Open RuTracker, Check Again) when BROWSER_COMPANION is active', () => {
      const onOpenBrowser = vi.fn();
      const onCheckAccess = vi.fn();
      const onVerifyEmbedded = vi.fn();

      renderWithI18n(
        <ScraperProgress
          state="interaction_required"
          activeTransport="BROWSER_COMPANION"
          onOpenBrowser={onOpenBrowser}
          onCheckAccess={onCheckAccess}
          onVerifyEmbedded={onVerifyEmbedded}
          progress={{
            categoryName: 'Nintendo Switch',
            currentPage: 2,
            totalPages: 5,
          }}
        />
      );

      // Open RuTracker & Check Again are rendered
      expect(screen.getByRole('button', { name: /Open RuTracker|Abrir RuTracker|Открыть RuTracker/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Check Again|Verificar Novamente|Проверить снова/i })).toBeInTheDocument();

      // Verify Now button for embedded is NOT rendered
      expect(screen.queryByRole('button', { name: /Verify Now|Verificar Agora|Пройти проверку/i })).not.toBeInTheDocument();
    });
  });
});

