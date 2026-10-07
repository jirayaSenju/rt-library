import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { SettingsModal } from "@/components/settings/SettingsModal"
import { I18nProvider } from "@/i18n/I18nContext"
import { AppSettings } from "@/types"

const mockSettings: AppSettings = {
  libraryPath: "/mock/library/path",
  torrentClient: "default",
  customClientPath: "",
  autoFetchMetadata: false,
  metadataFetchInterval: "daily",
  metadataStrategy: "missing",
}

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("SettingsModal integration tests", () => {
  it("renders SettingsModal with desktop sidebar tabs: Biblioteca, Scraper, Torrent, Metadados, Imagens, Aparência", () => {
    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
      />
    )

    expect(screen.getByRole("tab", { name: /biblioteca|library/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /scraper/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /torrent/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /metadados|metadata/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /imagens|images/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /aparência|appearance/i })).toBeInTheDocument()
  })

  it("switches between sidebar sections smoothly", async () => {
    const user = userEvent.setup()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
      />
    )

    // Initially in Library section
    expect(screen.getAllByText(/status do banco de dados|database status/i).length).toBeGreaterThan(0)

    // Switch to Torrent section
    await user.click(screen.getByRole("tab", { name: /torrent/i }))
    expect(screen.getAllByText(/cliente padrão do sistema|system default/i).length).toBeGreaterThan(0)

    // Switch to Metadata section
    await user.click(screen.getByRole("tab", { name: /metadados|metadata/i }))
    expect(screen.getByText(/coleta automática|automatic collection/i)).toBeInTheDocument()

    // Switch to Images section
    await user.click(screen.getByRole("tab", { name: /imagens|images/i }))
    expect(screen.getByText(/uso do cache|cache overview/i)).toBeInTheDocument()
  })

  it("navigates to Category Management subview from Scraper section and returns back", async () => {
    const user = userEvent.setup()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
      />
    )

    // Switch to Scraper section
    await user.click(screen.getByRole("tab", { name: /scraper/i }))
    expect(screen.getByText(/crawler automatizado|automated/i)).toBeInTheDocument()

    // Click Category Management button
    const manageCatsBtn = screen.getByRole("button", { name: /gerenciamento de categorias|category management/i })
    await user.click(manageCatsBtn)

    // Should now display Category Management subview with Back button & New Category button
    expect(screen.getByRole("button", { name: /nova categoria|add category|new category/i })).toBeInTheDocument()
    const backBtn = screen.getByRole("button", { name: /scraper/i })
    expect(backBtn).toBeInTheDocument()

    // Click Back to return to Scraper main view
    await user.click(backBtn)
    expect(screen.getByText(/crawler automatizado|automated/i)).toBeInTheDocument()
  })

  it("switches to Appearance tab and displays theme, view mode, density, sidebar, and language options", async () => {
    const user = userEvent.setup()
    const handleSelectTheme = vi.fn()
    const handleToggleDensity = vi.fn()
    const handleViewModeChange = vi.fn()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
        onSelectTheme={handleSelectTheme}
        density="comfortable"
        onToggleDensity={handleToggleDensity}
        viewMode="grid"
        onViewModeChange={handleViewModeChange}
      />
    )

    const appearanceTab = screen.getByRole("tab", { name: /aparência|appearance/i })
    await user.click(appearanceTab)

    expect(screen.getByText(/esquema de cores & temas|color schemes & themes/i)).toBeInTheDocument()
    expect(screen.getByText(/modo de visualização do catálogo|catalog view mode/i)).toBeInTheDocument()
    expect(screen.getByText(/densidade do catálogo|catalog density/i)).toBeInTheDocument()
    expect(screen.getByText(/modo da barra lateral|sidebar mode/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^idioma$|^language$/i })).toBeInTheDocument()

    // Test clicking a terminal theme (e.g. Dracula) via compact combobox
    const themeTrigger = screen.getByRole("combobox", { name: /tema do aplicativo|application theme/i })
    await user.click(themeTrigger)
    const draculaBtn = screen.getByRole("option", { name: /dracula/i })
    await user.click(draculaBtn)
    expect(handleSelectTheme).toHaveBeenCalledWith("dracula")

    // Test clicking a community theme (e.g. Pride) via compact combobox
    await user.click(themeTrigger)
    const prideBtn = screen.getByRole("option", { name: /^Pride\b/i })
    await user.click(prideBtn)
    expect(handleSelectTheme).toHaveBeenCalledWith("pride")
  })

  it("switches language to English in Appearance tab and updates entire dialog labels immediately", async () => {
    const user = userEvent.setup()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
        density="comfortable"
        viewMode="grid"
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    const langTrigger = screen.getByRole("combobox", { name: /idioma|language/i })
    await user.click(langTrigger)
    const enOption = screen.getByRole("option", { name: /english/i })
    await user.click(enOption)

    // Verify labels updated to English immediately
    expect(screen.getByRole("tab", { name: /appearance/i })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /library/i })).toBeInTheDocument()
    expect(screen.getByText(/color schemes & themes/i)).toBeInTheDocument()
  })

  it("updates catalog view, density, and sidebar modes via compact segmented controls", async () => {
    const user = userEvent.setup()
    const handleToggleDensity = vi.fn()
    const handleViewModeChange = vi.fn()
    const handleToggleSidebarCollapse = vi.fn()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
        density="comfortable"
        onToggleDensity={handleToggleDensity}
        viewMode="grid"
        onViewModeChange={handleViewModeChange}
        isSidebarCollapsed={false}
        onToggleSidebarCollapse={handleToggleSidebarCollapse}
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    // Switch to List view
    const listRadio = screen.getByRole("radio", { name: /lista|list/i })
    await user.click(listRadio)
    expect(handleViewModeChange).toHaveBeenCalledWith("list")

    // Switch to Compact density
    const compactRadio = screen.getByRole("radio", { name: /compacto|compact/i })
    await user.click(compactRadio)
    expect(handleToggleDensity).toHaveBeenCalled()

    // Switch to Collapsed sidebar
    const collapsedRadio = screen.getByRole("radio", { name: /recolhida|collapsed/i })
    await user.click(collapsedRadio)
    expect(handleToggleSidebarCollapse).toHaveBeenCalled()
  })

  it("renders progress bar theme dropdown in Appearance tab and updates selection", async () => {
    const user = userEvent.setup()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    expect(screen.getByText(/estilo da barra de progresso|scraper progress theme/i)).toBeInTheDocument()
    const progressTrigger = screen.getByRole("combobox", { name: /estilo da barra de progresso|progress bar style/i })
    expect(progressTrigger).toBeInTheDocument()
    await user.click(progressTrigger)

    expect(screen.getByRole("option", { name: /Nyan Cat/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Claude Code/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Matrix Rain/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Synthwave/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Arcade Pixel/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Lava Lamp/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Rainbow Pop/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Ocean Wave/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Candy Rush/i })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Cosmic Nebula/i })).toBeInTheDocument()

    // Click on Synthwave progress theme
    const synthwaveOption = screen.getByRole("option", { name: /Synthwave/i })
    await user.click(synthwaveOption)
    expect(screen.getByRole("combobox", { name: /estilo da barra de progresso|progress bar style/i })).toHaveTextContent(/Synthwave/i)
  })

  it("updates live global theme preview on hover without premature global apply", async () => {
    const user = userEvent.setup()
    const handleSelectTheme = vi.fn()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
        onSelectTheme={handleSelectTheme}
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    // Initial preview reflects active theme (RT Dark • Applied / Aplicado)
    expect(screen.getByText(/Live Theme Preview|Prévia do Tema/i)).toBeInTheDocument()
    expect(screen.getByText(/RT Dark • (Applied|Aplicado)/i)).toBeInTheDocument()

    // Open theme dropdown
    const themeTrigger = screen.getByRole("combobox", { name: /tema do aplicativo|application theme/i })
    await user.click(themeTrigger)

    // Hover over Nord theme option
    const nordBtn = screen.getByRole("option", { name: /nord/i })
    await user.hover(nordBtn)
    expect(screen.getByText(/(Preview|Prévia): Nord/i)).toBeInTheDocument()
    expect(handleSelectTheme).not.toHaveBeenCalled()

    // Click applies theme
    await user.click(nordBtn)
    expect(handleSelectTheme).toHaveBeenCalledWith("nord")
  })

  it("supports keyboard Escape to cancel preview and close theme dropdown", async () => {
    const user = userEvent.setup()
    const handleSelectTheme = vi.fn()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
        onSelectTheme={handleSelectTheme}
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    const themeTrigger = screen.getByRole("combobox", { name: /tema do aplicativo|application theme/i })
    await user.click(themeTrigger)

    const draculaBtn = screen.getByRole("option", { name: /dracula/i })
    await user.hover(draculaBtn)
    expect(screen.getByText(/(Preview|Prévia): Dracula/i)).toBeInTheDocument()

    // Escape closes popover and resets preview
    fireEvent.keyDown(draculaBtn, { key: "Escape" })
    expect(screen.getByText(/RT Dark • (Applied|Aplicado)/i)).toBeInTheDocument()
    expect(handleSelectTheme).not.toHaveBeenCalled()
  })

  it("updates live scraper progress preview on hover over progress themes in dropdown", async () => {
    const user = userEvent.setup()

    renderWithI18n(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSaveSettings={vi.fn()}
        onForceReindex={vi.fn()}
        themeId="rt-dark"
      />
    )

    await user.click(screen.getByRole("tab", { name: /aparência|appearance/i }))

    expect(screen.getByText(/Scraper Progress Live Preview|Prévia da Barra de Progresso/i)).toBeInTheDocument()

    // Open progress dropdown
    const progressTrigger = screen.getByRole("combobox", { name: /estilo da barra de progresso|progress bar style/i })
    await user.click(progressTrigger)

    // Hover over Matrix Rain option
    const matrixBtn = screen.getByRole("option", { name: /Matrix Rain/i })
    await user.hover(matrixBtn)
    expect(screen.getAllByText(/Matrix Rain/i).length).toBeGreaterThan(0)
  })
})

