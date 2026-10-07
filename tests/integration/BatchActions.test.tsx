import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { SelectionBar } from "@/components/library/SelectionBar"
import { I18nProvider } from "@/i18n/I18nContext"
import { mockLibraryItems } from "../fixtures/libraryItems"
import { mockElectronBridge } from "../setup"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("BatchActions integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not render when selectedCount is 0", () => {
    const { container } = renderWithI18n(
      <SelectionBar
        selectedCount={0}
        selectedItems={[]}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={vi.fn()}
        onUnfavoriteSelected={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders selection count badge, Select All, and Clear buttons", () => {
    renderWithI18n(
      <SelectionBar
        selectedCount={3}
        selectedItems={mockLibraryItems.slice(0, 3)}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={vi.fn()}
        onUnfavoriteSelected={vi.fn()}
      />
    )

    expect(screen.getByText(/3 itens selecionados|3 items selected/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /selecionar todos|select all/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /limpar seleção|clear selection/i })).toBeInTheDocument()
  })

  it("copies single magnet to clipboard", async () => {
    const user = userEvent.setup()
    const selected = [mockLibraryItems[0]] // Zelda TotK (has magnet)

    renderWithI18n(
      <SelectionBar
        selectedCount={1}
        selectedItems={selected}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={vi.fn()}
        onUnfavoriteSelected={vi.fn()}
      />
    )

    const copyBtn = screen.getByRole("button", { name: /copiar magnets|copy magnets/i })
    await user.click(copyBtn)

    const clipboardContent = await navigator.clipboard.readText()
    expect(clipboardContent).toBe(selected[0].magnetLink)
  })

  it("copies multiple magnets joined with newline and deduplicates duplicate magnets", async () => {
    const user = userEvent.setup()
    // game-1 and game-5 share the same magnet link; game-4 has no magnet
    const selected = [
      mockLibraryItems[0], // game-1: magnet A
      mockLibraryItems[1], // game-2: magnet B
      mockLibraryItems[3], // game-4: no magnet
      mockLibraryItems[4], // game-5: magnet A (duplicate)
    ]

    renderWithI18n(
      <SelectionBar
        selectedCount={selected.length}
        selectedItems={selected}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={vi.fn()}
        onUnfavoriteSelected={vi.fn()}
      />
    )

    const copyBtn = screen.getByRole("button", { name: /copiar magnets|copy magnets/i })
    await user.click(copyBtn)

    // Expected deduplicated list in visual order: [magnet A, magnet B]
    const expectedClipboard = `${mockLibraryItems[0].magnetLink}\n${mockLibraryItems[1].magnetLink}`
    const clipboardContent = await navigator.clipboard.readText()
    expect(clipboardContent).toBe(expectedClipboard)
  })

  it("calls nativeLibraryService.exportMagnets when clicking Export Magnets", async () => {
    const user = userEvent.setup()
    const selected = [mockLibraryItems[0], mockLibraryItems[1]]

    renderWithI18n(
      <SelectionBar
        selectedCount={2}
        selectedItems={selected}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={vi.fn()}
        onUnfavoriteSelected={vi.fn()}
      />
    )

    const exportBtn = screen.getByRole("button", { name: /exportar magnets|export magnets/i })
    await user.click(exportBtn)

    expect(mockElectronBridge.library.exportMagnets).toHaveBeenCalledWith([
      mockLibraryItems[0].magnetLink,
      mockLibraryItems[1].magnetLink,
    ])
  })

  it("triggers onFavoriteSelected and onUnfavoriteSelected with item IDs", async () => {
    const user = userEvent.setup()
    const handleFavorite = vi.fn(async () => {})
    const handleUnfavorite = vi.fn(async () => {})
    const selected = [mockLibraryItems[0], mockLibraryItems[1]]

    renderWithI18n(
      <SelectionBar
        selectedCount={2}
        selectedItems={selected}
        totalPageItems={10}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        isAllSelected={false}
        onFavoriteSelected={handleFavorite}
        onUnfavoriteSelected={handleUnfavorite}
      />
    )

    const favBtn = screen.getByRole("button", { name: /^favoritar$|^favorite$/i })
    await user.click(favBtn)
    expect(handleFavorite).toHaveBeenCalledWith(["game-1", "game-2"])

    const unfavBtn = screen.getByRole("button", { name: /^desfavoritar$|^unfavorite$/i })
    await user.click(unfavBtn)
    expect(handleUnfavorite).toHaveBeenCalledWith(["game-1", "game-2"])
  })
})
