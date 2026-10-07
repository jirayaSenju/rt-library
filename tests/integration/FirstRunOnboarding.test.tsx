import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirstRunScraperScreen } from '@/components/onboarding/FirstRunScraperScreen';
import { I18nProvider } from '@/i18n/I18nContext';
import { mockElectronBridge } from '../setup';

const renderFirstRunScreen = (onComplete = vi.fn()) => {
  return render(
    <I18nProvider>
      <FirstRunScraperScreen onComplete={onComplete} />
    </I18nProvider>
  );
};

describe('FirstRunScraperScreen Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders onboarding welcome, session check, and start button', () => {
    renderFirstRunScreen();

    expect(screen.getByText('RT Library')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Sua biblioteca ainda está vazia|Your library is currently empty/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Sessão RuTracker|RuTracker Session/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Categorias|Categories/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /iniciar sincronização inicial|start initial scan/i })
    ).toBeInTheDocument();
  });

  it('opens category configuration modal when clicking configure button', async () => {
    renderFirstRunScreen();

    const configBtn = screen.getByRole('button', { name: /configurar categorias|configure categories/i });
    fireEvent.click(configBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Gerenciamento de Categorias|Category Management/i).length).toBeGreaterThan(0);
    });
  });

  it('triggers scraper start on clicking Iniciar Sincronização Inicial', async () => {
    const onComplete = vi.fn();
    renderFirstRunScreen(onComplete);

    const startBtn = screen.getByRole('button', { name: /iniciar sincronização inicial|start initial scan/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockElectronBridge.scraper.start).toHaveBeenCalledWith({ full: false, headless: true });
    });
  });
});
