import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategorySelector } from '@/components/scraper/CategorySelector';
import { TemporaryConnectionNotice } from '@/components/scraper/TemporaryConnectionNotice';
import { I18nProvider } from '@/i18n/I18nContext';
import { ScraperCategory } from '@/types/scraper';

const mockCategories: ScraperCategory[] = [
  {
    id: 'switch',
    name: 'Nintendo Switch',
    group: 'nintendo',
    baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605',
    titleSearch: ['[NSW]'],
    enabled: true,
    builtIn: true,
  },
  {
    id: 'wii',
    name: 'Nintendo Wii',
    group: 'nintendo',
    baseUrl: 'https://rutracker.org/forum/viewforum.php?f=773',
    titleSearch: ['[Wii]'],
    enabled: true,
    builtIn: true,
  },
  {
    id: 'ps2',
    name: 'Playstation 2',
    group: 'playstation',
    baseUrl: 'https://rutracker.org/forum/viewforum.php?f=357',
    titleSearch: ['[PS2]'],
    enabled: false,
    builtIn: true,
  },
  {
    id: 'xbox360',
    name: 'Xbox 360',
    group: 'xbox',
    baseUrl: 'https://rutracker.org/forum/viewforum.php?f=510',
    titleSearch: ['[X360]'],
    enabled: true,
    builtIn: true,
  },
];

describe('CategorySelector & TemporaryConnectionNotice Unit Tests', () => {
  it('renders TemporaryConnectionNotice in full and compact modes', () => {
    const { rerender } = render(
      <I18nProvider>
        <TemporaryConnectionNotice />
      </I18nProvider>
    );

    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/Temporary connection|Conexão temporária/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /(Browser Companion connections? (are|is) temporary and valid only for the current RT-Library session)|(A conexão do Browser Companion é temporária e válida apenas para a sessão atual)/i
      )
    ).toBeInTheDocument();

    rerender(
      <I18nProvider>
        <TemporaryConnectionNotice compact />
      </I18nProvider>
    );

    expect(
      screen.getByText(
        /(Browser Companion connections? (are|is) temporary and valid only for the current RT-Library session)|(As conexões do Browser Companion são temporárias e válidas apenas para a sessão atual)/i
      )
    ).toBeInTheDocument();
  });

  it('renders CategorySelector grouped by platform and handles selection callbacks', () => {
    const onToggle = vi.fn();
    const onSelectAll = vi.fn();
    const onClearAll = vi.fn();
    const selectedIds = new Set(['switch', 'wii']);

    render(
      <I18nProvider>
        <CategorySelector
          categories={mockCategories}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onSelectAll={onSelectAll}
          onClearAll={onClearAll}
        />
      </I18nProvider>
    );

    // Platform headers
    expect(screen.getByText('Nintendo')).toBeInTheDocument();
    expect(screen.getByText('PlayStation')).toBeInTheDocument();
    expect(screen.getByText('Xbox')).toBeInTheDocument();

    // Counter badge: 2 categories selected
    expect(screen.getByText(/2 categories selected|2 categorias selecionadas/i)).toBeInTheDocument();

    // Check items
    const switchCheckbox = screen.getByRole('checkbox', { name: 'Nintendo Switch' });
    expect(switchCheckbox).toHaveAttribute('aria-checked', 'true');

    const ps2Checkbox = screen.getByRole('checkbox', { name: 'Playstation 2' });
    expect(ps2Checkbox).toHaveAttribute('aria-checked', 'false');

    // Click toggle
    fireEvent.click(ps2Checkbox);
    expect(onToggle).toHaveBeenCalledWith('ps2');

    // Keyboard navigation (Enter / Space)
    fireEvent.keyDown(switchCheckbox, { key: ' ' });
    expect(onToggle).toHaveBeenCalledWith('switch');

    // Select All & Clear buttons
    const selectAllBtn = screen.getByRole('button', { name: /select all|selecionar todas/i });
    fireEvent.click(selectAllBtn);
    expect(onSelectAll).toHaveBeenCalled();

    const clearBtn = screen.getByRole('button', { name: /clear selection|limpar seleção/i });
    fireEvent.click(clearBtn);
    expect(onClearAll).toHaveBeenCalled();
  });

  it('shows warning when zero categories are selected in CategorySelector', () => {
    render(
      <I18nProvider>
        <CategorySelector
          categories={mockCategories}
          selectedIds={new Set()}
          onToggle={vi.fn()}
          onSelectAll={vi.fn()}
          onClearAll={vi.fn()}
        />
      </I18nProvider>
    );

    expect(screen.getByText(/0 categories selected|0 categorias selecionadas/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Select at least one category to continue|Selecione ao menos uma categoria para prosseguir/i
      )
    ).toBeInTheDocument();
  });
});
