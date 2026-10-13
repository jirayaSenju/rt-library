import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirstRunScraperScreen } from '@/components/onboarding/FirstRunScraperScreen';
import { I18nProvider } from '@/i18n/I18nContext';
import { mockElectronBridge } from '../setup';
import appIcon from '@/assets/app-icon.png';

const renderFirstRunScreen = (onComplete = vi.fn(), initialStep?: any) => {
  return render(
    <I18nProvider>
      <FirstRunScraperScreen onComplete={onComplete} initialStep={initialStep} />
    </I18nProvider>
  );
};

describe('FirstRunScraperScreen Redesign Integration Tests (V3-63)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Step 1 (Welcome): renders welcome title, journey steps, and Get Started CTA', () => {
    const onComplete = vi.fn();
    const { container } = renderFirstRunScreen(onComplete);

    expect(screen.getByText(/Welcome to RT[- ]?Library|Bem-vindo ao RT Library/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Build your library by choosing the platforms you want to follow|Monte sua biblioteca escolhendo as plataformas/i
      )
    ).toBeInTheDocument();
    expect(container.querySelector('img[aria-hidden="true"]')).toHaveAttribute('src', appIcon);

    // 3 Visual steps
    expect(screen.getByText(/1\. Choose categories|1\. Escolha as categorias/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Connect browser|2\. Conecte o navegador/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Build library|3\. Construa sua biblioteca/i)).toBeInTheDocument();

    // CTAs
    expect(screen.getByRole('button', { name: /get started|começar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue without sync|continuar sem sincronizar/i })).toBeInTheDocument();
  });

  it('allows user to continue without sync from Welcome screen', () => {
    const onComplete = vi.fn();
    renderFirstRunScreen(onComplete);

    const skipBtn = screen.getByRole('button', { name: /continue without sync|continuar sem sincronizar/i });
    fireEvent.click(skipBtn);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Step 1 (Welcome): allows user to restore SQLite database backup and continue scraping with existing data', async () => {
    const onComplete = vi.fn();
    mockElectronBridge.database.restoreBackup.mockResolvedValueOnce({
      canceled: false,
      success: true,
      automaticBackupPath: '/mock/pre-restore.sqlite',
    });
    mockElectronBridge.library.getReadiness.mockResolvedValueOnce({
      state: 'READY',
      itemCount: 1500,
      categoriesCount: 8,
      hasLegacyJson: false,
      initialScanCompleted: true,
      legacyJsonCount: 0,
    });

    renderFirstRunScreen(onComplete);

    const restoreBtn = screen.getByRole('button', { name: /restore sqlite database|restaurar banco de dados sqlite/i });
    expect(restoreBtn).toBeInTheDocument();

    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(mockElectronBridge.database.restoreBackup).toHaveBeenCalled();
    });

    // Check celebration card appears
    await waitFor(() => {
      expect(screen.getByText(/Database Restored Successfully|Banco de Dados Restaurado com Sucesso/i)).toBeInTheDocument();
      expect(screen.getByText(/1500.*8/i)).toBeInTheDocument();
    });

    // User chooses to continue scraping with restored data
    const continueScrapingBtn = screen.getByRole('button', { name: /continue scraping|continuar sincronização/i });
    fireEvent.click(continueScrapingBtn);

    // Advances to Step 2 (Categories)
    await waitFor(() => {
      expect(screen.getByText(/Choose Categories|Escolha as Categorias/i)).toBeInTheDocument();
    });
  });

  it('Step 1 (Welcome): allows user to restore SQLite backup and open library directly', async () => {
    const onComplete = vi.fn();
    mockElectronBridge.database.restoreBackup.mockResolvedValueOnce({
      canceled: false,
      success: true,
      automaticBackupPath: '/mock/pre-restore.sqlite',
    });
    mockElectronBridge.library.getReadiness.mockResolvedValueOnce({
      state: 'READY',
      itemCount: 3200,
      categoriesCount: 12,
      hasLegacyJson: false,
      initialScanCompleted: true,
      legacyJsonCount: 0,
    });

    renderFirstRunScreen(onComplete);

    const restoreBtn = screen.getByRole('button', { name: /restore sqlite database|restaurar banco de dados sqlite/i });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(screen.getByText(/Database Restored Successfully|Banco de Dados Restaurado com Sucesso/i)).toBeInTheDocument();
    });

    // User chooses to open library directly
    const openLibBtn = screen.getByRole('button', { name: /open library directly|abrir biblioteca diretamente/i });
    fireEvent.click(openLibBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Step 2 (Categories): progresses to category selection, supports Select All / Clear, and blocks continuing with 0 selected', async () => {
    renderFirstRunScreen();

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /get started|começar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Choose Categories|Escolha as Categorias/i)).toBeInTheDocument();
    });

    // Check categories rendered
    expect(screen.getByText('Nintendo Switch')).toBeInTheDocument();
    expect(screen.getByText('Playstation 2')).toBeInTheDocument();

    // Clear selection
    const clearBtn = screen.getByRole('button', { name: /clear selection|limpar seleção/i });
    fireEvent.click(clearBtn);

    // Continue button must be disabled when 0 categories selected
    const continueBtn = screen.getByRole('button', { name: /continue to browser setup|continuar para configuração do navegador/i });
    expect(continueBtn).toBeDisabled();
    expect(screen.getByText(/Select at least one category to continue|Selecione ao menos uma categoria para prosseguir/i)).toBeInTheDocument();

    // Select All
    const selectAllBtn = screen.getByRole('button', { name: /select all|selecionar todas/i });
    fireEvent.click(selectAllBtn);
    expect(continueBtn).not.toBeDisabled();
  });

  it('Step 3 (Companion): displays temporary connection notice, distinguishes installed vs connected, and shows connection code when disconnected', async () => {
    mockElectronBridge.companion.status.mockResolvedValueOnce({
      port: 45231,
      token: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      connected: false,
    });

    renderFirstRunScreen(vi.fn(), 'COMPANION');

    await waitFor(() => {
      expect(screen.getByText(/Connect Browser|Conectar Navegador/i)).toBeInTheDocument();
    });

    // Temporary connection notice
    expect(
      screen.getByText(
        /Browser Companion connections are temporary and valid only for the current RT-Library session|The Browser Companion connection is temporary and valid only for the current RT-Library session|A conexão do Browser Companion é temporária e válida apenas para a sessão atual/i
      )
    ).toBeInTheDocument();

    // Installed vs Connected distinction
    expect(screen.getAllByText(/Extension|Extensão/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Current session|Sessão atual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/DISCONNECTED/i).length).toBeGreaterThan(0);

    // Connection code box with Port and Token
    expect(screen.getByText(/45231/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy All|Copiar Tudo/i)).toBeInTheDocument();
  });

  it('Step 4 (Access): displays human-friendly access status and summary before starting sync', async () => {
    mockElectronBridge.companion.status.mockResolvedValue({
      port: 45231,
      token: 'mocktoken',
      connected: true,
    });
    mockElectronBridge.companion.checkAccess.mockResolvedValueOnce({
      status: 'FORUM_READY',
      httpStatus: 200,
      bytes: 12000,
      forumDetected: true,
      cfMitigated: false,
      topicCount: 48,
      categoryId: 'switch',
      categoryName: 'Nintendo Switch',
      url: 'https://rutracker.org/forum/viewforum.php?f=1605',
    });

    renderFirstRunScreen(vi.fn(), 'ACCESS');

    // Check Open RuTracker button
    const openBtn = screen.getByRole('button', { name: /open rutracker|abrir rutracker/i });
    fireEvent.click(openBtn);
    expect(mockElectronBridge.companion.openRuTracker).toHaveBeenCalled();

    // Check Access button
    const checkBtn = screen.getByRole('button', { name: /check access|verificar acesso/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText(/RuTracker is accessible|O RuTracker está acessível/i)).toBeInTheDocument();
    });

    // Summary checklist and Start CTA
    expect(screen.getByRole('button', { name: /start initial sync|iniciar sincronização inicial/i })).toBeInTheDocument();
  });

  it('Step 4 (Access): displays human-friendly warning when verification is required or no tab is open', async () => {
    mockElectronBridge.companion.status.mockResolvedValue({
      port: 45231,
      token: 'mocktoken',
      connected: true,
    });
    mockElectronBridge.companion.checkAccess.mockResolvedValueOnce({
      status: 'NO_RUTRACKER_TAB',
      httpStatus: 0,
      bytes: 0,
      forumDetected: false,
      cfMitigated: false,
      categoryId: 'switch',
      categoryName: 'Nintendo Switch',
      url: '',
    });

    renderFirstRunScreen(vi.fn(), 'ACCESS');

    const checkBtn = screen.getByRole('button', { name: /check access|verificar acesso/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText(/Open RuTracker in your browser first|Abra o RuTracker no navegador primeiro/i)).toBeInTheDocument();
    });
  });

  it('Step 5 (Sync): triggers scraper start on clicking Start Initial Sync, tracks progress, and can be cancelled', async () => {
    mockElectronBridge.scraper.getState.mockResolvedValue({
      state: 'running',
      isRunning: true,
      progress: { categoryName: 'Nintendo Switch', currentPage: 1, totalPages: 10, totalItems: 25 },
      logs: [],
    });

    renderFirstRunScreen(vi.fn(), 'ACCESS');

    const startBtn = screen.getByRole('button', { name: /start initial sync|iniciar sincronização inicial/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockElectronBridge.scraper.start).toHaveBeenCalledWith({ full: false, headless: true });
      expect(screen.getByText(/Building your library|Construindo sua biblioteca/i)).toBeInTheDocument();
    });

    // Cancel scan
    const cancelBtn = screen.getByRole('button', { name: /cancel|cancelar/i });
    fireEvent.click(cancelBtn);
    expect(mockElectronBridge.scraper.cancel).toHaveBeenCalled();
  });

  it('Step 6 (Ready): shows completion card and opens library on completion CTA', async () => {
    const onComplete = vi.fn();
    renderFirstRunScreen(onComplete, 'READY');

    expect(screen.getByText(/Your library is ready|Sua biblioteca está pronta/i)).toBeInTheDocument();

    const openLibBtn = screen.getByRole('button', { name: /open library|abrir biblioteca/i });
    fireEvent.click(openLibBtn);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
