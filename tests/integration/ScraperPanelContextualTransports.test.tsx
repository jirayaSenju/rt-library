import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScraperPanel } from '@/components/scraper/ScraperPanel';
import { I18nProvider } from '@/i18n/I18nContext';
import { scraperService } from '@/services/scraperService';

const mocks = vi.hoisted(() => ({
  mockPreference: 'AUTOMATIC',
  mockActiveTransport: 'EMBEDDED_ELECTRON',
}));

vi.mock('@/services/scraperService', () => ({
  scraperService: {
    getCategories: vi.fn().mockResolvedValue([
      { id: 'switch', name: 'Nintendo Switch', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605', titleSearch: ['[Nintendo Switch]'] },
      { id: 'ps2', name: 'Playstation 2', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=357', titleSearch: ['[PS2]'] },
    ]),
    startScraper: vi.fn().mockResolvedValue({ success: true }),
    cancelScraper: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue({ state: 'idle', isRunning: false, progress: null, logs: [] }),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
    onProgress: vi.fn().mockReturnValue(() => {}),
    onAccessChanged: vi.fn().mockReturnValue(() => {}),
    onLog: vi.fn().mockReturnValue(() => {}),
    getTransportPreference: vi.fn().mockImplementation(() =>
      Promise.resolve({ preference: mocks.mockPreference, activeTransport: mocks.mockActiveTransport, isPromoted: true })
    ),
    setTransportPreference: vi.fn().mockImplementation((pref: string) => {
      mocks.mockPreference = pref;
      mocks.mockActiveTransport = pref === 'AUTOMATIC' ? 'EMBEDDED_ELECTRON' : pref;
      return Promise.resolve({ success: true, preference: mocks.mockPreference, activeTransport: mocks.mockActiveTransport });
    }),
    getActiveTransport: vi.fn().mockImplementation(() => Promise.resolve(mocks.mockActiveTransport)),
    embeddedProbe: vi.fn().mockResolvedValue({ status: 'FORUM_READY', forumDetected: true, topicCount: 42 }),
    embeddedVerify: vi.fn().mockResolvedValue({ success: true }),
    embeddedResetSession: vi.fn().mockResolvedValue({ success: true }),
    importRuTrackerHtml: vi.fn().mockResolvedValue({ status: 'IMPORT_SUCCESS', imported: 5 }),
    getSchedulerStatus: vi.fn().mockResolvedValue({
      enabled: false,
      scheduleType: '6h',
      intervalMinutes: 360,
      scope: 'ALL_ENABLED',
      categoryIds: [],
      nextRunAt: null,
      lastAttemptAt: null,
      lastStartedAt: null,
      lastSkipReason: null,
      activeTransport: mocks.mockActiveTransport,
      isCompanionReady: false,
    }),
    updateSchedulerConfig: vi.fn().mockImplementation((cfg) => Promise.resolve({ ...cfg })),
    runSchedulerDueCheck: vi.fn().mockResolvedValue({ executed: false, skipped: true }),
    onSchedulerStatusChanged: vi.fn().mockReturnValue(() => {}),
    getSyncHealth: vi.fn().mockResolvedValue([]),
    getSyncRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
  },
  importFailureTranslationKey: vi.fn().mockReturnValue('onboarding.importFailed'),
}));

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

describe('ScraperPanel Contextual Transports Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPreference = 'AUTOMATIC';
    mocks.mockActiveTransport = 'EMBEDDED_ELECTRON';
  });

  it('renders Built-in Scraper controls and hides Browser Companion when EMBEDDED_ELECTRON is selected', async () => {
    mocks.mockPreference = 'EMBEDDED_ELECTRON';
    mocks.mockActiveTransport = 'EMBEDDED_ELECTRON';
    const user = userEvent.setup();

    renderWithI18n(<ScraperPanel />);

    // 1. Built-in Scraper session badge & controls should be present
    await waitFor(() => {
      expect(screen.getByText(/persist:rutracker-v1/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /test access|testar acesso|проверить доступ/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset session|redefinir sessão|сбросить сессию/i })).toBeInTheDocument();

    // 2. Browser Companion section (e.g. extension installed / session connected) must NOT be rendered
    expect(screen.queryByText(/extension installed|extensão instalada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session connected|sessão conectada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/temporary connection|conexão temporária/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /setup instructions|instruções de configuração/i })).not.toBeInTheDocument();

    // 3. Sync method display indicates Built-in Scraper
    expect(screen.getAllByText(/built-in scraper|scraper integrado|встроенный скрапер/i).length).toBeGreaterThan(0);
  });

  it('renders full Browser Companion section and hides Built-in Scraper strip when BROWSER_COMPANION is selected', async () => {
    mocks.mockPreference = 'BROWSER_COMPANION';
    mocks.mockActiveTransport = 'BROWSER_COMPANION';

    renderWithI18n(<ScraperPanel />);

    await waitFor(() => {
      expect(screen.getByText(/extension installed|extensão instalada/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/session connected|sessão conectada/i)).toBeInTheDocument();
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /setup instructions|instruções de configuração/i })).toBeInTheDocument();

    // Built-in scraper session indicator should NOT be rendered
    expect(screen.queryByText(/persist:rutracker-v1/i)).not.toBeInTheDocument();
  });

  it('renders Direct Scraper (Playwright) section and hides Companion and Built-in when PLAYWRIGHT is selected', async () => {
    mocks.mockPreference = 'PLAYWRIGHT';
    mocks.mockActiveTransport = 'PLAYWRIGHT';

    renderWithI18n(<ScraperPanel />);

    await waitFor(() => {
      expect(screen.getByText(/~\/\.config\/rt-library\/scraper-profile/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /check access|verificar acesso|проверить доступ/i })).toBeInTheDocument();

    // Companion and Built-in must NOT be rendered
    expect(screen.queryByText(/extension installed|extensão instalada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/persist:rutracker-v1/i)).not.toBeInTheDocument();
  });

  it('keeps fallback transports collapsed by default in AUTOMATIC mode and expands on click', async () => {
    mocks.mockPreference = 'AUTOMATIC';
    mocks.mockActiveTransport = 'EMBEDDED_ELECTRON';
    const user = userEvent.setup();

    renderWithI18n(<ScraperPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /manage fallback transports|gerenciar transportes de fallback/i })).toBeInTheDocument();
    });

    // Companion card is NOT rendered in the main view
    expect(screen.queryByText(/extension installed|extensão instalada/i)).not.toBeInTheDocument();

    // Click to expand fallback transports
    const fallbackToggle = screen.getByRole('button', { name: /manage fallback transports|gerenciar transportes de fallback/i });
    await user.click(fallbackToggle);

    // Fallback options are now displayed inside the collapsible
    expect(screen.getByText(/configure secondary transports|configure transportes secundários/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /reconnect|reconectar/i }).length).toBeGreaterThan(0);
  });

  it('displays resolved sync method indicator clearly above the Update Library button', async () => {
    mocks.mockPreference = 'AUTOMATIC';
    mocks.mockActiveTransport = 'EMBEDDED_ELECTRON';

    renderWithI18n(<ScraperPanel />);

    await waitFor(() => {
      // Expect "Sync method: Automatic → Built-in Scraper" or similar
      expect(screen.getAllByText(/sync method|método de sincronização/i).length).toBeGreaterThan(0);
    });
  });
});
