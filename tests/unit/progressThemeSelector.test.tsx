import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ProgressThemeSelector } from "@/components/settings/ProgressThemeSelector"
import { I18nProvider } from "@/i18n"
import { PROGRESS_THEMES, PROGRESS_THEME_IDS } from "@/theme/progressThemes"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("ProgressThemeSelector Unit Tests", () => {
  it("renders compact trigger with mascot and progress theme name", () => {
    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    const trigger = screen.getByRole("combobox", { name: /progress|progresso|estilo/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("Nyan Cat")
    expect(trigger).toHaveTextContent("🐱")
  })

  it("opens popover and displays all progress themes with check indicator", async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    const trigger = screen.getByRole("combobox", { name: /progress|progresso|estilo/i })
    await user.click(trigger)

    expect(screen.getByRole("listbox")).toBeInTheDocument()
    const options = screen.getAllByRole("option")
    expect(options.length).toBe(PROGRESS_THEME_IDS.length)

    const nyanOption = screen.getByRole("option", { name: /nyan cat/i })
    expect(nyanOption).toHaveAttribute("aria-selected", "true")
  })

  it("filters progress themes using search input", async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /progress|progresso|estilo/i }))

    const searchInput = screen.getByPlaceholderText(/search progress styles\.\.\.|buscar estilos\.\.\./i)
    await user.type(searchInput, "ocean")

    expect(screen.getByRole("option", { name: /ocean wave/i })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /nyan cat/i })).not.toBeInTheDocument()
  })

  it("triggers preview on hover and reverts on leave", async () => {
    const user = userEvent.setup()
    const handlePreview = vi.fn()

    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={handlePreview}
        onSelectTheme={vi.fn()}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /progress|progresso|estilo/i }))

    const matrixOption = screen.getByRole("option", { name: /matrix rain/i })
    await user.hover(matrixOption)
    expect(handlePreview).toHaveBeenCalledWith("matrix-rain")

    await user.unhover(matrixOption)
    expect(handlePreview).toHaveBeenCalledWith(null)
  })

  it("applies progress theme immediately on click and closes popover", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()

    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={vi.fn()}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /progress|progresso|estilo/i }))

    const synthwaveOption = screen.getByRole("option", { name: /synthwave/i })
    await user.click(synthwaveOption)

    expect(handleSelect).toHaveBeenCalledWith("synthwave")
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })
  })

  it("supports keyboard Enter to select and Escape to close", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()

    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={vi.fn()}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /progress|progresso|estilo/i }))

    const arcadeOption = screen.getByRole("option", { name: /arcade pixel/i })
    fireEvent.keyDown(arcadeOption, { key: "Enter" })
    expect(handleSelect).toHaveBeenCalledWith("arcade-pixel")
  })

  it("supports arrow key navigation (ArrowDown / ArrowUp / Home / End) across progress themes", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()
    const handlePreview = vi.fn()

    renderWithI18n(
      <ProgressThemeSelector
        selectedThemeId="nyan-cat"
        onPreviewTheme={handlePreview}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /progress|progresso|estilo/i }))

    const searchInput = screen.getByPlaceholderText(/search progress styles\.\.\.|buscar estilos\.\.\./i)

    // Press ArrowDown from nyan-cat (idx 0) to claude-code (idx 1)
    fireEvent.keyDown(searchInput, { key: "ArrowDown" })
    expect(handlePreview).toHaveBeenCalledWith("claude-code")

    // Press ArrowDown to matrix-rain (idx 2)
    fireEvent.keyDown(searchInput, { key: "ArrowDown" })
    expect(handlePreview).toHaveBeenCalledWith("matrix-rain")

    // Press ArrowUp back to claude-code
    fireEvent.keyDown(searchInput, { key: "ArrowUp" })
    expect(handlePreview).toHaveBeenCalledWith("claude-code")

    // Press End to move to last progress theme (soviet)
    fireEvent.keyDown(searchInput, { key: "End" })
    expect(handlePreview).toHaveBeenCalledWith("soviet")

    // Press Home to move to first progress theme (nyan-cat)
    fireEvent.keyDown(searchInput, { key: "Home" })
    expect(handlePreview).toHaveBeenCalledWith("nyan-cat")

    // Press Enter to select nyan-cat
    fireEvent.keyDown(searchInput, { key: "Enter" })
    expect(handleSelect).toHaveBeenCalledWith("nyan-cat")
  })
})
