import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ItemDetailModal } from "@/components/library/ItemDetailModal"
import { I18nProvider } from "@/i18n/I18nContext"
import { mockLibraryItems } from "../fixtures/libraryItems"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("ItemDetailModal integration tests", () => {
  it("renders modal header, title, and action buttons when open", async () => {
    const item = mockLibraryItems[0] // Zelda TotK
    renderWithI18n(
      <ItemDetailModal
        item={item}
        isOpen={true}
        onClose={vi.fn()}
        isFavorite={true}
        onToggleFavorite={vi.fn()}
      />
    )

    expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /abrir magnet|open magnet/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copiar magnet|copy magnet/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /abrir no fórum|open in forum|open forum/i })).toBeInTheDocument()
    })
  })

  it("renders Overview, Screenshots, and Files tabs and switches active tab on click", async () => {
    const user = userEvent.setup()
    const item = mockLibraryItems[0]

    renderWithI18n(
      <ItemDetailModal
        item={item}
        isOpen={true}
        onClose={vi.fn()}
        isFavorite={false}
        onToggleFavorite={vi.fn()}
      />
    )

    // Check tabs
    const overviewTab = screen.getByRole("tab", { name: /visão geral|overview/i })
    const screenshotsTab = screen.getByRole("tab", { name: /screenshots/i })
    const filesTab = screen.getByRole("tab", { name: /arquivos|files/i })

    expect(overviewTab).toBeInTheDocument()
    expect(screenshotsTab).toBeInTheDocument()
    expect(filesTab).toBeInTheDocument()

    // Default active tab is Overview
    expect(overviewTab).toHaveAttribute("data-state", "active")
    expect(screen.getByText(/torrent e swarm|torrent & swarm/i)).toBeInTheDocument()

    // Switch to Screenshots tab
    await user.click(screenshotsTab)
    expect(screenshotsTab).toHaveAttribute("data-state", "active")

    // Switch to Files tab
    await user.click(filesTab)
    expect(filesTab).toHaveAttribute("data-state", "active")
  })

  it("toggles favorite status from detail modal header", async () => {
    const user = userEvent.setup()
    const handleToggleFavorite = vi.fn()
    const item = mockLibraryItems[0]

    renderWithI18n(
      <ItemDetailModal
        item={item}
        isOpen={true}
        onClose={vi.fn()}
        isFavorite={false}
        onToggleFavorite={handleToggleFavorite}
      />
    )

    const favBtn = screen.getByRole("button", { name: /adicionar aos favoritos|add to favorites/i })
    await user.click(favBtn)

    expect(handleToggleFavorite).toHaveBeenCalledTimes(1)
  })
})
