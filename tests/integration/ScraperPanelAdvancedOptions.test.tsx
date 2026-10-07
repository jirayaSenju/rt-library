import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScraperPanel } from '@/components/scraper/ScraperPanel';
import { I18nProvider } from '@/i18n/I18nContext';

vi.mock('@/services/scraperService', () => ({
  scraperService: {
    getCategories: vi.fn().mockResolvedValue([
      { id: 'switch', name: 'Nintendo Switch', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605', titleSearch: ['[Nintendo Switch]'] },
      { id: 'ps2', name: 'Playstation 2', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=357', titleSearch: ['[PS2]'] },
    ]),
    startScraper: vi.fn().mockResolvedValue(undefined),
    cancelScraper: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue({ state: 'idle', isRunning: false, progress: null, logs: [] }),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
    onProgress: vi.fn().mockReturnValue(() => {}),
    onLog: vi.fn().mockReturnValue(() => {}),
  },
}));

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

describe('ScraperPanel Advanced Options UI Integration (V3-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles advanced options panel and displays descriptive copy and cost notice', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ScraperPanel />);

    // Click to expand Advanced Options
    const advToggle = screen.getByRole('button', { name: /opções avançadas|advanced options/i });
    expect(advToggle).toBeInTheDocument();
    await user.click(advToggle);

    expect(screen.getByText(/varredura completa|full scan/i)).toBeInTheDocument();
    expect(screen.getByText(/atualizar screenshots|refresh screenshots/i)).toBeInTheDocument();
    expect(screen.getByText(/atualizar tamanhos|refresh item sizes/i)).toBeInTheDocument();
    expect(screen.getByText(/atualizar lista de arquivos|refresh file lists/i)).toBeInTheDocument();

    // Cost notice
    expect(
      screen.getByText(/as atualizações percorrem todas as páginas|refresh operations scan every page/i)
    ).toBeInTheDocument()
  });

  it('locks all three refresh switches when Full Scan is enabled and restores previous state when disabled', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ScraperPanel />);

    // Expand Advanced Options
    await user.click(screen.getByRole('button', { name: /opções avançadas|advanced options/i }));

    const switches = screen.getAllByRole('switch');
    // switches: [0: Full Scan, 1: Screenshots, 2: Sizes, 3: Files]
    const fullScanSwitch = switches[0];
    const screenshotsSwitch = switches[1];
    const sizesSwitch = switches[2];
    const filesSwitch = switches[3];

    // 1. Initially all unchecked and enabled
    expect(fullScanSwitch).not.toBeChecked();
    expect(screenshotsSwitch).not.toBeChecked();
    expect(sizesSwitch).not.toBeChecked();
    expect(filesSwitch).not.toBeChecked();

    // 2. User checks screenshots and files (leaving size unchecked)
    await user.click(screenshotsSwitch);
    await user.click(filesSwitch);

    expect(screenshotsSwitch).toBeChecked();
    expect(sizesSwitch).not.toBeChecked();
    expect(filesSwitch).toBeChecked();

    // 3. User checks Full Scan
    await user.click(fullScanSwitch);
    expect(fullScanSwitch).toBeChecked();

    // In Full Scan: all three refresh switches must be checked and disabled
    expect(screenshotsSwitch).toBeChecked();
    expect(screenshotsSwitch).toBeDisabled();
    expect(sizesSwitch).toBeChecked();
    expect(sizesSwitch).toBeDisabled();
    expect(filesSwitch).toBeChecked();
    expect(filesSwitch).toBeDisabled();

    // 4. User unchecks Full Scan
    await user.click(fullScanSwitch);
    expect(fullScanSwitch).not.toBeChecked();

    // State restoration: prior state (screenshots=true, sizes=false, files=true) must be restored and enabled
    expect(screenshotsSwitch).toBeChecked();
    expect(screenshotsSwitch).not.toBeDisabled();
    expect(sizesSwitch).not.toBeChecked();
    expect(sizesSwitch).not.toBeDisabled();
    expect(filesSwitch).toBeChecked();
    expect(filesSwitch).not.toBeDisabled();
  });
});
