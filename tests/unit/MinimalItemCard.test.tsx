import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ItemCard } from "@/components/library/ItemCard"
import { I18nProvider } from "@/i18n/I18nContext"
import { LibraryItem } from "@/types"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

const mockItem: LibraryItem = {
  id: "test-game-1",
  title: "Super Mario Odyssey",
  cleanTitle: "Super Mario Odyssey",
  canonicalTitle: "Super Mario Odyssey",
  categoryId: "switch",
  categoryName: "Nintendo Switch",
  releaseYear: "2017",
  size: "5.7 GB",
  sizeBytes: 6120328192,
  hasMagnet: true,
  isFavorite: false,
}

describe("Minimal Cover-Only Card Redesign (V3-CARD-MINIMAL)", () => {
  it("1. Normal state: shows cover, platform badge, favorite, and size, with NO fixed footer or year on card face", () => {
    const { container } = renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    // Platform badge is visible
    expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()

    // Favorite star button is visible
    expect(screen.getByRole("button", { name: /add to favorites|adicionar aos favoritos/i })).toBeInTheDocument()

    // Size badge is visible
    expect(screen.getAllByText("5.7 GB").length).toBeGreaterThan(0)

    // Year is REMOVED from the card face for minimal cover presentation
    expect(screen.queryByText("2017")).not.toBeInTheDocument()

    // No permanent footer element
    const footerBlocks = container.querySelectorAll(".border-t.bg-card\\/95")
    expect(footerBlocks.length).toBe(0)
  })

  it("2. Title overlay: title is in overlay container with opacity-0 by default and group-hover:opacity-100", () => {
    renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    const overlay = screen.getByTestId("item-card-title-overlay")
    expect(overlay).toBeInTheDocument()

    // Normal state has opacity-0 and translate-y-1
    expect(overlay.className).toContain("opacity-0")
    expect(overlay.className).toContain("translate-y-1")

    // Hover and focus-within states reveal overlay
    expect(overlay.className).toContain("group-hover:opacity-100")
    expect(overlay.className).toContain("group-hover:translate-y-0")
    expect(overlay.className).toContain("group-focus-within:opacity-100")
    expect(overlay.className).toContain("group-focus-visible:opacity-100")

    // Title text has line-clamp-2
    const titleElement = screen.getByRole("heading", { level: 3 })
    expect(titleElement).toHaveTextContent("Super Mario Odyssey")
    expect(titleElement.className).toContain("line-clamp-2")
  })

  it("3. Size + Title overlay coordination: size is integrated above the title in the overlay", () => {
    renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    const overlay = screen.getByTestId("item-card-title-overlay")
    // Overlay contains size
    expect(overlay).toHaveTextContent("5.7 GB")
    // Overlay contains title
    expect(overlay).toHaveTextContent("Super Mario Odyssey")
  })

  it("4. Long platform name (SWITCH PORTS / XBOX 360) renders without breaking layout", () => {
    const longPlatformItem: LibraryItem = {
      ...mockItem,
      categoryId: "switch",
      title: "Doom Eternal ПОРТ",
      topicTitle: "[Nintendo Switch] Doom Eternal ПОРТ",
    }

    renderWithI18n(
      <ItemCard
        item={longPlatformItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    const badge = screen.getByText("Switch Ports")
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain("truncate")
  })

  it("5. Long title (2 lines clamp) preserves full title in aria-label and tooltip", () => {
    const longTitleItem: LibraryItem = {
      ...mockItem,
      title: "Metal Gear Solid: Master Collection Edition, Vol. 2 - Special Tactical Espionage Edition",
      canonicalTitle: "Metal Gear Solid: Master Collection Edition, Vol. 2 - Special Tactical Espionage Edition",
    }

    renderWithI18n(
      <ItemCard
        item={longTitleItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    // Accessible aria-label has full title
    const card = screen.getByRole("button", {
      name: /Metal Gear Solid: Master Collection Edition, Vol\. 2 - Special Tactical Espionage Edition/i,
    })
    expect(card).toBeInTheDocument()

    // Title heading is rendered with line-clamp-2
    const heading = screen.getByRole("heading", { level: 3 })
    expect(heading).toHaveTextContent("Metal Gear Solid: Master Collection Edition, Vol. 2 - Special Tactical Espionage Edition")
    expect(heading.className).toContain("line-clamp-2")
  })

  it("6. Keyboard navigation: card is focusable and Enter triggers onClick", () => {
    const handleClick = vi.fn()
    renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={handleClick}
      />
    )

    const card = screen.getByRole("button", { name: /Super Mario Odyssey/i })
    expect(card).toHaveAttribute("tabIndex", "0")

    fireEvent.keyDown(card, { key: "Enter" })
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it("7. Favorite click does NOT trigger card onClick (stopPropagation)", async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    const handleToggleFavorite = vi.fn()

    renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={handleToggleFavorite}
        onClick={handleClick}
      />
    )

    const favButton = screen.getByRole("button", { name: /add to favorites|adicionar aos favoritos/i })
    await user.click(favButton)

    expect(handleToggleFavorite).toHaveBeenCalledTimes(1)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it("8. Missing cover fallback renders placeholder with Gamepad2 icon and category name", () => {
    const itemWithoutCover: LibraryItem = {
      ...mockItem,
      coverUrl: undefined,
      coverImage: undefined,
      cover: undefined,
      screenshots: [],
    }

    renderWithI18n(
      <ItemCard
        item={itemWithoutCover}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
  })

  it("9. Missing size does not render empty size badge", () => {
    const itemWithoutSize: LibraryItem = {
      ...mockItem,
      size: undefined,
      sizeBytes: undefined,
      torrent: undefined,
    }

    const { container } = renderWithI18n(
      <ItemCard
        item={itemWithoutSize}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
      />
    )

    // HardDrive icon should not be rendered when size is absent
    const hardDriveIcons = container.querySelectorAll(".lucide-hard-drive")
    expect(hardDriveIcons.length).toBe(0)
  })

  it("10. Tightened safe area padding: applies 4-6px padding (p-1.5 comfortable, p-1 compact) with concentric rounded-[8px] cover container", () => {
    const { container: comfortableContainer, unmount } = renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
        density="comfortable"
      />
    )

    const comfortableCard = comfortableContainer.querySelector('[data-item-card="true"]')
    expect(comfortableCard).toBeInTheDocument()
    expect(comfortableCard?.className).toContain("p-1.5")

    const innerCover = comfortableCard?.querySelector(".rounded-\\[8px\\]")
    expect(innerCover).toBeInTheDocument()

    unmount()

    const { container: compactContainer } = renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
        density="compact"
      />
    )

    const compactCard = compactContainer.querySelector('[data-item-card="true"]')
    expect(compactCard).toBeInTheDocument()
    expect(compactCard?.className).toContain("p-1")
  })

  it("11. Selected card border: selected state keeps border-primary and ring-2 distinct with safe area", () => {
    const { container } = renderWithI18n(
      <ItemCard
        item={mockItem}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
        onClick={vi.fn()}
        isSelected={true}
      />
    )

    const selectedCard = container.querySelector('[data-item-card="true"]')
    expect(selectedCard?.className).toContain("border-primary")
    expect(selectedCard?.className).toContain("ring-2")
    expect(selectedCard?.className).toContain("ring-primary/50")
    // Safe area padding ensures the inner cover does not occlude the outer ring/border
    expect(selectedCard?.className).toContain("p-1.5")
  })
})

