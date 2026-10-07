import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { FilterPopover } from "@/components/layout/FilterPopover"
import { I18nProvider } from "@/i18n/I18nContext"
import { DEFAULT_LIBRARY_FILTERS } from "@/types"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("FilterPopover integration tests", () => {
  it("renders filter button with default state and opens popover on click", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    const filterBtn = screen.getByRole("button", { name: /filtros|filters/i })
    expect(filterBtn).toBeInTheDocument()

    await user.click(filterBtn)

    expect(screen.getByText(/filtrar catálogo|filter catalog/i)).toBeInTheDocument()
    expect(screen.getByText(/swarm e peers|swarm & peers/i)).toBeInTheDocument()
    expect(screen.getByText(/filtros avançados|advanced filters/i)).toBeInTheDocument()
  })

  it("holds adjustments in draft state and does not call onApplyFilters until Apply is clicked", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    // Expand advanced section
    const advancedToggle = screen.getByRole("button", { name: /filtros avançados|advanced filters/i })
    await user.click(advancedToggle)

    // Type in year inputs
    const yearFromInput = screen.getByPlaceholderText(/ex\. 2010|e\.g\. 2010/i)
    const yearToInput = screen.getByPlaceholderText(/ex\. 2024|e\.g\. 2024/i)

    await user.type(yearFromInput, "2015")
    await user.type(yearToInput, "2022")

    expect(handleApply).not.toHaveBeenCalled()

    // Click Apply button
    const applyBtn = screen.getByRole("button", { name: /aplicar filtros|apply filters/i })
    await user.click(applyBtn)

    expect(handleApply).toHaveBeenCalledTimes(1)
    expect(handleApply).toHaveBeenCalledWith(
      expect.objectContaining({
        yearFrom: 2015,
        yearTo: 2022,
      })
    )
  })

  it("validates year range and disables Apply button when yearFrom > yearTo", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    const advancedToggle = screen.getByRole("button", { name: /filtros avançados|advanced filters/i })
    await user.click(advancedToggle)

    const yearFromInput = screen.getByPlaceholderText(/ex\. 2010|e\.g\. 2010/i)
    const yearToInput = screen.getByPlaceholderText(/ex\. 2024|e\.g\. 2024/i)

    await user.type(yearFromInput, "2024")
    await user.type(yearToInput, "2010")

    // Validation error message should be displayed
    expect(
      screen.getByText(/o ano "de" deve ser menor|from.*year must be less/i)
    ).toBeInTheDocument()

    const applyBtn = screen.getByRole("button", { name: /aplicar filtros|apply filters/i })
    expect(applyBtn).toBeDisabled()

    await user.click(applyBtn)
    expect(handleApply).not.toHaveBeenCalled()
  })

  it("validates size range and disables Apply button when minSize > maxSize", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    const advancedToggle = screen.getByRole("button", { name: /filtros avançados|advanced filters/i })
    await user.click(advancedToggle)

    const minSizeInput = screen.getByPlaceholderText(/ex\. 1|e\.g\. 1/i)
    const maxSizeInput = screen.getByPlaceholderText(/ex\. 50|e\.g\. 50/i)

    await user.type(minSizeInput, "20")
    await user.type(maxSizeInput, "5")

    expect(
      screen.getByText(/o tamanho "mín" deve ser menor|min.*size must be less/i)
    ).toBeInTheDocument()

    const applyBtn = screen.getByRole("button", { name: /aplicar filtros|apply filters/i })
    expect(applyBtn).toBeDisabled()
  })

  it("resets draft state when clicking Redefinir button", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    const advancedToggle = screen.getByRole("button", { name: /filtros avançados|advanced filters/i })
    await user.click(advancedToggle)

    const yearFromInput = screen.getByPlaceholderText(/ex\. 2010|e\.g\. 2010/i) as HTMLInputElement
    await user.type(yearFromInput, "2015")
    expect(yearFromInput.value).toBe("2015")

    // Click Redefinir (Reset)
    const resetBtn = screen.getByRole("button", { name: /redefinir|reset/i })
    await user.click(resetBtn)

    expect(yearFromInput.value).toBe("")
  })

  it("discards draft changes when closing popover without applying", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={DEFAULT_LIBRARY_FILTERS}
        onApplyFilters={handleApply}
      />
    )

    // Open popover
    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    const advancedToggle = screen.getByRole("button", { name: /filtros avançados|advanced filters/i })
    await user.click(advancedToggle)

    const yearFromInput = screen.getByPlaceholderText(/ex\. 2010|e\.g\. 2010/i)
    await user.type(yearFromInput, "2018")

    // Close popover by clicking Cancelar
    const cancelBtn = screen.getByRole("button", { name: /cancelar|cancel/i })
    await user.click(cancelBtn)

    expect(handleApply).not.toHaveBeenCalled()
  })

  it("renders metadata facets section and passes selected facets on apply", async () => {
    const user = userEvent.setup()
    const handleApply = vi.fn()

    renderWithI18n(
      <FilterPopover
        filters={{
          ...DEFAULT_LIBRARY_FILTERS,
          developers: ["Capcom"],
          genres: ["Action"],
        }}
        onApplyFilters={handleApply}
      />
    )

    await user.click(screen.getByRole("button", { name: /filtros|filters/i }))

    // Metadata section should be present
    expect(screen.getByText(/metadados|metadata/i)).toBeInTheDocument()

    const applyBtn = screen.getByRole("button", { name: /aplicar filtros|apply filters/i })
    await user.click(applyBtn)

    expect(handleApply).toHaveBeenCalledTimes(1)
    expect(handleApply).toHaveBeenCalledWith(
      expect.objectContaining({
        developers: ["Capcom"],
        genres: ["Action"],
      })
    )
  })
})

