import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CategoryManagement } from "@/components/scraper/CategoryManagement"
import { I18nProvider } from "@/i18n"
import { scraperService } from "@/services/scraperService"

function renderWithI18n(ui: React.ReactElement, locale: "en" | "pt-BR" = "en") {
  localStorage.setItem("rt_library_locale", locale)
  return render(
    <I18nProvider>
      {ui}
    </I18nProvider>
  )
}

describe("CategoryManagement Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders category management header and loads categories", async () => {
    renderWithI18n(<CategoryManagement />)

    expect(screen.getByText(/Category Management/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Add Category/i })).toBeInTheDocument()

    // Wait for categories to load
    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
      expect(screen.getByText("Playstation 2")).toBeInTheDocument()
      expect(screen.getByText("Sega Genesis Custom")).toBeInTheDocument()
    })

    // Verify badges
    expect(screen.getAllByText("Built-in").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("Custom")).toBeInTheDocument()
  })

  it("toggles category enabled status via switch", async () => {
    const setEnabledSpy = vi.spyOn(scraperService, "setCategoryEnabled")
    renderWithI18n(<CategoryManagement />)

    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
    })

    // Find switches
    const switches = screen.getAllByRole("switch")
    expect(switches.length).toBeGreaterThan(0)

    // Toggle the first category
    fireEvent.click(switches[0])

    await waitFor(() => {
      expect(setEnabledSpy).toHaveBeenCalledWith("switch", false)
    })
  })

  it("opens add category modal and validates form fields", async () => {
    const user = userEvent.setup()
    renderWithI18n(<CategoryManagement />)

    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
    })

    const addBtn = screen.getByRole("button", { name: /Add Category/i })
    await user.click(addBtn)

    // Modal opens
    expect(screen.getByText("Add New Category")).toBeInTheDocument()
    expect(screen.getByLabelText(/Category Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Category ID/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/RuTracker Forum URL/i)).toBeInTheDocument()
  })

  it("creates a new custom category with title search patterns", async () => {
    const user = userEvent.setup()
    const createSpy = vi.spyOn(scraperService, "createCategory")
    renderWithI18n(<CategoryManagement />)

    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /Add Category/i }))

    // Fill form
    const nameInput = screen.getByLabelText(/Category Name/i)
    await user.type(nameInput, "Game Boy Advance")

    // ID should auto-slugify
    const idInput = screen.getByLabelText(/Category ID/i)
    expect(idInput).toHaveValue("game-boy-advance")

    const urlInput = screen.getByLabelText(/RuTracker Forum URL/i)
    await user.type(urlInput, "https://rutracker.org/forum/viewforum.php?f=123")

    // Add pattern
    const patternInput = screen.getByPlaceholderText(/ex: \[PS2\]/i)
    fireEvent.change(patternInput, { target: { value: "[GBA]" } })
    const addPatternBtn = screen.getByRole("button", { name: /Add Pattern/i })
    await user.click(addPatternBtn)

    expect(screen.getByText("[GBA]")).toBeInTheDocument()

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Create Category/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "game-boy-advance",
          name: "Game Boy Advance",
          baseUrl: "https://rutracker.org/forum/viewforum.php?f=123",
          titleSearch: ["[GBA]"],
          enabled: true,
        })
      )
    })
  })

  it("opens delete dialog for custom category and warns about SQLite safety", async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(scraperService, "deleteCategory")
    renderWithI18n(<CategoryManagement />)

    await waitFor(() => {
      expect(screen.getByText("Sega Genesis Custom")).toBeInTheDocument()
    })

    const deleteBtn = screen.getByTitle(/Delete Category/i)
    await user.click(deleteBtn)

    // Modal opens with safety reassurance
    expect(screen.getByText(/Delete Category "Sega Genesis Custom"\?/i)).toBeInTheDocument()
    expect(screen.getByText(/Existing games already cataloged in your SQLite database will remain safe/i)).toBeInTheDocument()

    const confirmDeleteBtn = screen.getByRole("button", { name: /^Delete Category$/i })
    await user.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith("custom-genesis")
    })
  })

  it("performs live category test and displays matching releases", async () => {
    const user = userEvent.setup()
    const testSpy = vi.spyOn(scraperService, "testCategory")
    renderWithI18n(<CategoryManagement />)

    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: /Add Category/i }))

    const urlInput = screen.getByLabelText(/RuTracker Forum URL/i)
    await user.type(urlInput, "https://rutracker.org/forum/viewforum.php?f=357")

    const patternInput = screen.getByPlaceholderText(/ex: \[PS2\]/i)
    fireEvent.change(patternInput, { target: { value: "[PS2]" } })

    const testBtn = screen.getByRole("button", { name: /Test Category/i })
    await user.click(testBtn)

    await waitFor(() => {
      expect(testSpy).toHaveBeenCalledWith({
        baseUrl: "https://rutracker.org/forum/viewforum.php?f=357",
        titleSearch: ["[PS2]"],
      })
      expect(screen.getByText(/Connection Successful/i)).toBeInTheDocument()
      expect(screen.getByText(/Final Fantasy X/i)).toBeInTheDocument()
    })
  })

  it("renders correctly in Portuguese (pt-BR)", async () => {
    renderWithI18n(<CategoryManagement />, "pt-BR")

    expect(screen.getByText(/Gerenciamento de Categorias/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Nova Categoria/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("Nintendo Switch")).toBeInTheDocument()
    })

    expect(screen.getAllByText("Integrada").length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("Personalizada")).toBeInTheDocument()
  })
})
