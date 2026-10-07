import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { Pagination } from "@/components/library/Pagination"
import { I18nProvider } from "@/i18n/I18nContext"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("Pagination integration tests", () => {
  it("does not render when totalItems is 0", () => {
    const { container } = renderWithI18n(
      <Pagination
        currentPage={1}
        totalPages={0}
        totalItems={0}
        pageSize={48}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("displays accurate range and item counts in pt-BR or en", () => {
    renderWithI18n(
      <Pagination
        currentPage={2}
        totalPages={10}
        totalItems={450}
        pageSize={48}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    )

    // Range for page 2 with 48 items/page: 49 to 96
    expect(screen.getByText(/exibindo 49–96 de 450 itens|showing 49–96 of 450 items/i)).toBeInTheDocument()
  })

  it("disables First and Previous buttons on page 1", () => {
    renderWithI18n(
      <Pagination
        currentPage={1}
        totalPages={5}
        totalItems={240}
        pageSize={48}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    )

    const firstBtn = screen.getByRole("button", { name: /primeira página|first page/i })
    const prevBtn = screen.getByRole("button", { name: /página anterior|previous page/i })
    const nextBtn = screen.getByRole("button", { name: /próxima página|next page/i })
    const lastBtn = screen.getByRole("button", { name: /última página|last page/i })

    expect(firstBtn).toBeDisabled()
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeEnabled()
    expect(lastBtn).toBeEnabled()
  })

  it("disables Next and Last buttons on last page", () => {
    renderWithI18n(
      <Pagination
        currentPage={5}
        totalPages={5}
        totalItems={240}
        pageSize={48}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    )

    const firstBtn = screen.getByRole("button", { name: /primeira página|first page/i })
    const prevBtn = screen.getByRole("button", { name: /página anterior|previous page/i })
    const nextBtn = screen.getByRole("button", { name: /próxima página|next page/i })
    const lastBtn = screen.getByRole("button", { name: /última página|last page/i })

    expect(firstBtn).toBeEnabled()
    expect(prevBtn).toBeEnabled()
    expect(nextBtn).toBeDisabled()
    expect(lastBtn).toBeDisabled()
  })

  it("calls onPageChange when clicking page numbers and navigation buttons", async () => {
    const user = userEvent.setup()
    const handlePageChange = vi.fn()

    renderWithI18n(
      <Pagination
        currentPage={3}
        totalPages={5}
        totalItems={240}
        pageSize={48}
        onPageChange={handlePageChange}
        onPageSizeChange={vi.fn()}
      />
    )

    // Click first page
    const firstBtn = screen.getByRole("button", { name: /primeira página|first page/i })
    await user.click(firstBtn)
    expect(handlePageChange).toHaveBeenCalledWith(1)

    // Click previous page
    const prevBtn = screen.getByRole("button", { name: /página anterior|previous page/i })
    await user.click(prevBtn)
    expect(handlePageChange).toHaveBeenCalledWith(2)

    // Click next page
    const nextBtn = screen.getByRole("button", { name: /próxima página|next page/i })
    await user.click(nextBtn)
    expect(handlePageChange).toHaveBeenCalledWith(4)

    // Click last page
    const lastBtn = screen.getByRole("button", { name: /última página|last page/i })
    await user.click(lastBtn)
    expect(handlePageChange).toHaveBeenCalledWith(5)

    // Click numeric page 2
    const page2Btn = screen.getByRole("button", { name: /página 2|page 2/i })
    await user.click(page2Btn)
    expect(handlePageChange).toHaveBeenCalledWith(2)
  })

  it("renders ellipsis for large page lists", () => {
    renderWithI18n(
      <Pagination
        currentPage={10}
        totalPages={20}
        totalItems={960}
        pageSize={48}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />
    )

    const ellipses = screen.getAllByText("...")
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })
})
