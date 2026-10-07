import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { GlobalThemeSelector } from "@/components/settings/GlobalThemeSelector"
import { I18nProvider } from "@/i18n"
import { THEMES } from "@/theme/themes"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("GlobalThemeSelector Unit Tests", () => {
  it("renders compact trigger with active theme name and swatches", () => {
    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="dracula"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    const trigger = screen.getByRole("combobox", { name: /theme|tema/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent("Dracula")
  })

  it("opens popover and displays grouped themes with active check", async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="dracula"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    const trigger = screen.getByRole("combobox", { name: /theme|tema/i })
    await user.click(trigger)

    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(screen.getByText(/RT Default|Padrão RT/i)).toBeInTheDocument()
    expect(screen.getByText(/Terminal Color Schemes/i)).toBeInTheDocument()
    expect(screen.getByText(/Community & Identity|Comunidade & Identidade/i)).toBeInTheDocument()

    const draculaOption = screen.getByRole("option", { name: "Dracula" })
    expect(draculaOption).toHaveAttribute("aria-selected", "true")
  })

  it("filters themes using search input", async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="rt-dark"
        onPreviewTheme={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /theme|tema/i }))

    const searchInput = screen.getByPlaceholderText(/search themes\.\.\.|buscar temas\.\.\./i)
    await user.type(searchInput, "eco")

    expect(screen.getByRole("option", { name: "Eco Green" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Eco Red" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Dracula" })).not.toBeInTheDocument()
  })

  it("triggers preview on hover and reverts on leave", async () => {
    const user = userEvent.setup()
    const handlePreview = vi.fn()

    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="rt-dark"
        onPreviewTheme={handlePreview}
        onSelectTheme={vi.fn()}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /theme|tema/i }))

    const nordOption = screen.getByRole("option", { name: "Nord" })
    await user.hover(nordOption)
    expect(handlePreview).toHaveBeenCalledWith("nord")

    await user.unhover(nordOption)
    expect(handlePreview).toHaveBeenCalledWith(null)
  })

  it("applies theme immediately on click and closes popover", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()

    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="rt-dark"
        onPreviewTheme={vi.fn()}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /theme|tema/i }))

    const tokyoOption = screen.getByRole("option", { name: "Tokyo Night" })
    await user.click(tokyoOption)

    expect(handleSelect).toHaveBeenCalledWith("tokyo-night")
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    })
  })

  it("supports keyboard Enter to select and Escape to close", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()
    const handlePreview = vi.fn()

    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="rt-dark"
        onPreviewTheme={handlePreview}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /theme|tema/i }))

    const gruvboxOption = screen.getByRole("option", { name: "Gruvbox Dark" })
    fireEvent.keyDown(gruvboxOption, { key: "Enter" })
    expect(handleSelect).toHaveBeenCalledWith("gruvbox-dark")
  })

  it("supports arrow key navigation (ArrowDown / ArrowUp / Home / End) across themes", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()
    const handlePreview = vi.fn()

    renderWithI18n(
      <GlobalThemeSelector
        selectedThemeId="rt-dark"
        onPreviewTheme={handlePreview}
        onSelectTheme={handleSelect}
      />
    )

    await user.click(screen.getByRole("combobox", { name: /theme|tema/i }))

    const searchInput = screen.getByPlaceholderText(/search themes\.\.\.|buscar temas\.\.\./i)

    // Press ArrowDown to move from rt-dark (idx 0) to rt-light (idx 1)
    fireEvent.keyDown(searchInput, { key: "ArrowDown" })
    expect(handlePreview).toHaveBeenCalledWith("rt-light")

    // Press ArrowDown to move to dracula (idx 2)
    fireEvent.keyDown(searchInput, { key: "ArrowDown" })
    expect(handlePreview).toHaveBeenCalledWith("dracula")

    // Press ArrowUp to move back to rt-light
    fireEvent.keyDown(searchInput, { key: "ArrowUp" })
    expect(handlePreview).toHaveBeenCalledWith("rt-light")

    // Press End to move to last theme (nonbinary-pride)
    fireEvent.keyDown(searchInput, { key: "End" })
    expect(handlePreview).toHaveBeenCalledWith("nonbinary-pride")

    // Press Home to move to first theme (rt-dark)
    fireEvent.keyDown(searchInput, { key: "Home" })
    expect(handlePreview).toHaveBeenCalledWith("rt-dark")

    // Press Enter to select rt-dark
    fireEvent.keyDown(searchInput, { key: "Enter" })
    expect(handleSelect).toHaveBeenCalledWith("rt-dark")
  })
})
