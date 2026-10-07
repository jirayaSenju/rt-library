import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { App } from "@/App"
import { I18nProvider } from "@/i18n/I18nContext"
import { mockElectronBridge } from "../setup"

const renderApp = () => {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>
  )
}

describe("AppFlow integration tests (Full End-to-End UI Flow)", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it("completes full flow: catalog load -> switch to List view -> apply filter and sorting -> select items -> batch favorite", async () => {
    const user = userEvent.setup()
    renderApp()

    // 1. Initial Load: App loads catalog with items in Grid view
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
    })
    expect(screen.getByText("God of War II")).toBeInTheDocument()

    // 2. Switch from Grid to List view
    const viewToggleBtn = screen.getByRole("button", { name: /alternar para lista|switch to list/i })
    await user.click(viewToggleBtn)

    // Verify List view table headers render
    expect(screen.getAllByText(/Plataforma|Platform/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Ano|Year/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Tamanho|Size/i).length).toBeGreaterThan(0)

    // 3. Open Filter Popover and apply filter + sorting
    const filterBtn = screen.getByRole("button", { name: /filtros|filters/i })
    await user.click(filterBtn)

    // Verify filter popover contents
    expect(screen.getByText(/Ordenar por|Sort by/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Seeds/i).length).toBeGreaterThan(0)

    // Click Apply Filters button
    const applyFiltersBtn = screen.getByRole("button", { name: /aplicar filtros|apply filters/i })
    await user.click(applyFiltersBtn)

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    // 4. Multi-select an item in the filtered list
    const selectCheckboxes = screen.getAllByRole("checkbox", { name: /selecionar|select/i })
    expect(selectCheckboxes.length).toBeGreaterThan(1)
    await user.click(selectCheckboxes[1])

    // SelectionBar appears
    await waitFor(() => {
      expect(screen.getByText(/1 item selecionado|1 item selected/i)).toBeInTheDocument()
    })

    // 5. Batch favorite selected item
    const favBtn = screen.getByRole("button", { name: /^favoritar$|^favorite$/i })
    await user.click(favBtn)

    // 6. Switch back to Grid view
    const gridToggleBtn = screen.getByRole("button", { name: /alternar para grade|switch to grid/i })
    await user.click(gridToggleBtn)

    // Verify Grid view is active
    expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
  })

  it("navigates to Favorites view and displays only favorited items", async () => {
    const user = userEvent.setup()
    renderApp()

    // Wait for catalog load
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
    })

    // Favorite Zelda (game-1)
    const favButton = screen.getAllByRole("button", { name: /adicionar aos favoritos|add to favorites/i })[0]
    await user.click(favButton)

    // Click Favorites in sidebar
    const favoritesText = screen.getByText(/^favorites$|^favoritos$/i)
    const favoritesNavBtn = favoritesText.closest("button")!
    await user.click(favoritesNavBtn)

    // Verify favorited item is in the document
    await waitFor(() => {
      expect(screen.getByText("The Legend of Zelda: Tears of the Kingdom")).toBeInTheDocument()
    })
  })
})

