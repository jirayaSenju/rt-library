import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AboutUpdatesSettings } from '@/components/settings/AboutUpdatesSettings';
import { ChangelogModal, formatChangelogContent } from '@/components/settings/ChangelogModal';
import { I18nProvider } from '@/i18n/I18nContext';
import * as useUpdaterModule from '@/hooks/useUpdater';

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>);
};

describe('ChangelogModal and formatChangelogContent unit tests', () => {
  it('formats raw HTML notes into clean text with links preserved', () => {
    const rawHtml = '<p><strong>Full Changelog</strong>: <a class="commit-link" href="https://github.com/jirayaSenju/rt-library/compare/v1.1.0...v1.1.1"><tt>v1.1.0...v1.1.1</tt></a></p>';
    const cleaned = formatChangelogContent(rawHtml);
    expect(cleaned).toContain('Full Changelog: v1.1.0...v1.1.1 (https://github.com/jirayaSenju/rt-library/compare/v1.1.0...v1.1.1)');
    expect(cleaned).not.toContain('<p>');
    expect(cleaned).not.toContain('<strong>');
    expect(cleaned).not.toContain('<a');
    expect(cleaned).not.toContain('<tt>');
  });

  it('renders ChangelogModal with version, title and formatted notes when open', () => {
    const onClose = vi.fn();
    renderWithI18n(
      <ChangelogModal
        isOpen={true}
        onClose={onClose}
        version="1.1.1"
        releaseDate="2026-10-14T10:00:00Z"
        releaseNotes='<p><strong>Fixes</strong>: <ul><li>Resolved jsdom error</li><li>Fixed latest.yml</li></ul></p>'
      />
    );

    expect(screen.getByText(/notas de atualização & changelog|release notes & changelog/i)).toBeInTheDocument();
    expect(screen.getByText('v1.1.1')).toBeInTheDocument();
    expect(screen.getByText(/Resolved jsdom error/)).toBeInTheDocument();
    expect(screen.getByText(/Fixed latest\.yml/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ver no github$|^view on github$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^fechar$|^close$/i })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked in ChangelogModal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithI18n(
      <ChangelogModal
        isOpen={true}
        onClose={onClose}
        version="1.1.1"
        releaseNotes="Update notes"
      />
    );

    const closeBtn = screen.getByRole('button', { name: /^fechar$|^close$/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AboutUpdatesSettings with ChangelogModal integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens ChangelogModal when user clicks View Full Changelog button in update card', async () => {
    const user = userEvent.setup();

    vi.spyOn(useUpdaterModule, 'useUpdater').mockReturnValue({
      status: {
        state: 'UPDATE_AVAILABLE',
        currentVersion: '1.1.0',
        availableVersion: '1.1.1',
        releaseDate: '2026-10-14T12:00:00Z',
        releaseNotes: '<p><strong>Full Changelog</strong>: <a href="https://github.com/jirayaSenju/rt-library/compare/v1.1.0...v1.1.1">v1.1.0...v1.1.1</a></p>',
        downloadUrl: 'https://github.com/jirayaSenju/rt-library/releases/download/v1.1.1/RT-Library-1.1.1-linux-x86_64.AppImage',
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        errorCode: null,
        errorMessage: null,
        lastCheckedAt: '2026-10-14T11:23:12Z',
        isSupported: true,
        channel: 'stable',
      },
      isLoading: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
    });

    renderWithI18n(<AboutUpdatesSettings />);

    // Check that button to view full changelog exists
    const viewChangelogBtn = screen.getByRole('button', { name: /ver changelog completo|view full changelog/i });
    expect(viewChangelogBtn).toBeInTheDocument();

    // Click to open modal
    await user.click(viewChangelogBtn);

    // Modal dialog should now be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/notas de atualização & changelog|release notes & changelog/i)).toBeInTheDocument();
    expect(screen.getByText('v1.1.1')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /^fechar$|^close$/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
