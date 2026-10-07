import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ItemCard } from "@/components/library/ItemCard"
import { ItemList } from "@/components/library/ItemList"
import { I18nProvider } from "@/i18n/I18nContext"
import { mockLibraryItems } from "../fixtures/libraryItems"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("CatalogViews integration tests (Grid and List)", () => {
  describe("ItemCard (Grid View)", () => {
    it("renders item title, platform badge, and metadata in Comfortable density", () => {
      const item = mockLibraryItems[0] // Zelda TotK
      renderWithI18n(
        <ItemCard
          item={item}
          isFavorite={true}
          isSelected={false}
          onToggleFavorite={vi.fn()}
          onClick={vi.fn()}
          density="comfortable"
        />
      )

      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
      expect(screen.getByText("2023")).toBeInTheDocument()
    })

    it("triggers onClick when clicking the card body", async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const item = mockLibraryItems[0]

      renderWithI18n(
        <ItemCard
          item={item}
          isFavorite={false}
          isSelected={false}
          onToggleFavorite={vi.fn()}
          onClick={handleClick}
        />
      )

      await user.click(screen.getByText("The Legend of Zelda: Tears of the Kingdom"))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("isolates favorite button click without triggering card onClick", async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const handleToggleFavorite = vi.fn()
      const item = mockLibraryItems[0]

      renderWithI18n(
        <ItemCard
          item={item}
          isFavorite={false}
          isSelected={false}
          onToggleFavorite={handleToggleFavorite}
          onClick={handleClick}
        />
      )

      const favoriteBtn = screen.getByRole("button", { name: /adicionar aos favoritos|add to favorites/i })
      await user.click(favoriteBtn)

      expect(handleToggleFavorite).toHaveBeenCalledTimes(1)
      expect(handleClick).not.toHaveBeenCalled()
    })

    it("isolates selection checkbox click without triggering card onClick", async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      const handleToggleSelect = vi.fn()
      const item = mockLibraryItems[0]

      renderWithI18n(
        <ItemCard
          item={item}
          isFavorite={false}
          isSelected={false}
          onToggleFavorite={vi.fn()}
          onClick={handleClick}
          onToggleSelect={handleToggleSelect}
        />
      )

      const selectBtn = screen.getByRole("checkbox", { name: /selecionar the legend of zelda|select the legend of zelda/i })
      await user.click(selectBtn)

      expect(handleToggleSelect).toHaveBeenCalledTimes(1)
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe("ItemList (List View)", () => {
    it("renders rows for all items and header columns", () => {
      renderWithI18n(
        <ItemList
          items={mockLibraryItems.slice(0, 3)}
          isLoading={false}
          favorites={new Set(["game-1"])}
          onToggleFavorite={vi.fn()}
          onSelectItem={vi.fn()}
        />
      )

      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
      expect(screen.getByText("God of War II")).toBeInTheDocument()
      expect(screen.getByText("Halo 3")).toBeInTheDocument()
    })

    it("triggers onSelectItem when clicking a list row body", async () => {
      const user = userEvent.setup()
      const handleSelectItem = vi.fn()

      renderWithI18n(
        <ItemList
          items={mockLibraryItems.slice(0, 3)}
          isLoading={false}
          favorites={new Set()}
          onToggleFavorite={vi.fn()}
          onSelectItem={handleSelectItem}
        />
      )

      await user.click(screen.getByText("God of War II"))
      expect(handleSelectItem).toHaveBeenCalledWith(mockLibraryItems[1])
    })

    it("isolates row checkbox click without triggering onSelectItem", async () => {
      const user = userEvent.setup()
      const handleSelectItem = vi.fn()
      const handleToggleSelect = vi.fn()

      renderWithI18n(
        <ItemList
          items={mockLibraryItems.slice(0, 3)}
          isLoading={false}
          favorites={new Set()}
          selectedIds={new Set()}
          onToggleFavorite={vi.fn()}
          onSelectItem={handleSelectItem}
          onToggleSelect={handleToggleSelect}
        />
      )

      const rowCheckboxes = screen.getAllByRole("checkbox", { name: /selecionar|select/i })
      // First is header or row checkbox
      await user.click(rowCheckboxes[1])

      expect(handleToggleSelect).toHaveBeenCalledTimes(1)
      expect(handleSelectItem).not.toHaveBeenCalled()
    })

    it("updates header checkbox to indeterminate state when partially selected", () => {
      const items = mockLibraryItems.slice(0, 3)
      renderWithI18n(
        <ItemList
          items={items}
          isLoading={false}
          favorites={new Set()}
          selectedIds={new Set(["game-1"])} // 1 of 3 selected
          onToggleFavorite={vi.fn()}
          onSelectItem={vi.fn()}
        />
      )

      const headerCheckbox = screen.getByRole("checkbox", {
        name: /selecionar todos os itens da página|select all items on (this )?page/i,
      }) as HTMLInputElement

      expect(headerCheckbox.indeterminate).toBe(true)
      expect(headerCheckbox.checked).toBe(false)
    })

    it("checks header checkbox when all items on page are selected and calls onClearSelection on click", async () => {
      const user = userEvent.setup()
      const items = mockLibraryItems.slice(0, 3)
      const handleClear = vi.fn()
      const handleSelectAll = vi.fn()

      renderWithI18n(
        <ItemList
          items={items}
          isLoading={false}
          favorites={new Set()}
          selectedIds={new Set(["game-1", "game-2", "game-3"])}
          onToggleFavorite={vi.fn()}
          onSelectItem={vi.fn()}
          onClearSelection={handleClear}
          onSelectAllPage={handleSelectAll}
        />
      )

      const headerCheckbox = screen.getByRole("checkbox", {
        name: /desmarcar todos os itens da página|deselect all items on (this )?page/i,
      }) as HTMLInputElement

      expect(headerCheckbox.checked).toBe(true)
      expect(headerCheckbox.indeterminate).toBe(false)

      await user.click(headerCheckbox)
      expect(handleClear).toHaveBeenCalledTimes(1)
    })
  })
})
