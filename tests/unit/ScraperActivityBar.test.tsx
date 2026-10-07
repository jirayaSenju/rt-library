import React from "react"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ScraperActivityBar } from "@/components/layout/ScraperActivityBar"
import { I18nProvider } from "@/i18n/I18nContext"
import { ScraperProgress } from "@/services/scraperService"

const renderWithI18n = (ui: React.ReactElement) => {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

describe("ScraperActivityBar unit tests", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders null when state is idle", () => {
    const { container } = renderWithI18n(
      <ScraperActivityBar
        state="idle"
        progress={null}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders live progress when running with known totalPages", () => {
    const mockProgress: ScraperProgress = {
      category: "switch",
      categoryName: "Nintendo Switch",
      currentPage: 5,
      totalPages: 20,
      processedItems: 250,
      newItems: 12,
      totalItems: 500,
    }

    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progress={mockProgress}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByText(/Nintendo Switch/i)).toBeInTheDocument()
    expect(screen.getByText(/25%/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /detalhes|details/i })).toBeInTheDocument()

    const progressBar = screen.getByRole("progressbar")
    expect(progressBar).toHaveAttribute("aria-valuenow", "25")
  })

  it("renders indeterminate indicator when totalPages is 0 or unknown", () => {
    const mockProgress: ScraperProgress = {
      category: "all",
      categoryName: "Todas as categorias",
      currentPage: 0,
      totalPages: 0,
    }

    renderWithI18n(
      <ScraperActivityBar
        state="starting"
        progress={mockProgress}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole("status")).toBeInTheDocument()
    const progressBar = screen.getByRole("progressbar")
    expect(progressBar).not.toHaveAttribute("aria-valuenow")
  })

  it("disables cancel button and shows cancelling text when cancelling", () => {
    renderWithI18n(
      <ScraperActivityBar
        state="cancelling"
        progress={{ currentPage: 1, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const cancelBtn = screen.getByRole("button", { name: /cancel/i })
    expect(cancelBtn).toBeDisabled()
    expect(screen.getAllByText(/cancelando|cancelling/i).length).toBeGreaterThan(0)
  })

  it("renders completed state and auto-hides after 4 seconds", () => {
    const { container, rerender } = renderWithI18n(
      <ScraperActivityBar
        state="completed"
        progress={{ newItems: 42, totalItems: 100 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/concluída|completed/i)).toBeInTheDocument()
    expect(screen.getByText(/\+42/i)).toBeInTheDocument()

    // Advance 4 seconds
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(container.firstChild).toBeNull()
  })

  it("renders failed state with error message and view logs button", () => {
    const handleOpenDetails = vi.fn()

    renderWithI18n(
      <ScraperActivityBar
        state="failed"
        progress={null}
        error="Network error or host unreachable"
        onOpenDetails={handleOpenDetails}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/Network error or host unreachable/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /detalhes|details/i })).toBeInTheDocument()
  })

  it("calls onCancel when cancel button is clicked", async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const handleCancel = vi.fn()

    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progress={{ currentPage: 2, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={handleCancel}
      />
    )

    const cancelBtn = screen.getByRole("button", { name: /cancel/i })
    await user.click(cancelBtn)
    expect(handleCancel).toHaveBeenCalledTimes(1)
  })

  it("calls onOpenDetails when details button is clicked", async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const handleOpenDetails = vi.fn()

    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progress={{ currentPage: 2, totalPages: 10 }}
        onOpenDetails={handleOpenDetails}
        onCancel={vi.fn()}
      />
    )

    const detailsBtn = screen.getByRole("button", { name: /detalhes|details/i })
    await user.click(detailsBtn)
    expect(handleOpenDetails).toHaveBeenCalledTimes(1)
  })

  it("renders nyan-cat progress theme with cat mascot", () => {
    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progressThemeId="nyan-cat"
        progress={{ currentPage: 5, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const bar = screen.getByRole("status")
    expect(bar).toHaveAttribute("data-progress-theme", "nyan-cat")
    expect(screen.getByText("🐱")).toBeInTheDocument()
  })

  it("renders matrix-rain progress theme with theme identifier and digital bot mascot", () => {
    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progressThemeId="matrix-rain"
        progress={{ currentPage: 3, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const bar = screen.getByRole("status")
    expect(bar).toHaveAttribute("data-progress-theme", "matrix-rain")
    expect(screen.getByText("▣")).toBeInTheDocument()
  })

  it("renders claude-code progress theme with terminal prompt mascot", () => {
    renderWithI18n(
      <ScraperActivityBar
        state="running"
        progressThemeId="claude-code"
        progress={{ currentPage: 6, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole("status")).toHaveAttribute("data-progress-theme", "claude-code")
    expect(screen.getByText(">_")).toBeInTheDocument()
  })

  it("renders synthwave and arcade-pixel themes with respective mascots", () => {
    const { rerender } = renderWithI18n(
      <ScraperActivityBar
        state="running"
        progressThemeId="synthwave"
        progress={{ currentPage: 4, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole("status")).toHaveAttribute("data-progress-theme", "synthwave")
    expect(screen.getByText("▲")).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <ScraperActivityBar
          state="running"
          progressThemeId="arcade-pixel"
          progress={{ currentPage: 7, totalPages: 10 }}
          onOpenDetails={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>
    )

    expect(screen.getByRole("status")).toHaveAttribute("data-progress-theme", "arcade-pixel")
    expect(screen.getByText("👾")).toBeInTheDocument()
  })

  it("renders cosmic-nebula and ocean-wave themes with respective mascots", () => {
    const { rerender } = renderWithI18n(
      <ScraperActivityBar
        state="running"
        progressThemeId="cosmic-nebula"
        progress={{ currentPage: 8, totalPages: 10 }}
        onOpenDetails={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole("status")).toHaveAttribute("data-progress-theme", "cosmic-nebula")
    expect(screen.getByText("🚀")).toBeInTheDocument()

    rerender(
      <I18nProvider>
        <ScraperActivityBar
          state="running"
          progressThemeId="ocean-wave"
          progress={{ currentPage: 2, totalPages: 10 }}
          onOpenDetails={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>
    )

    expect(screen.getByRole("status")).toHaveAttribute("data-progress-theme", "ocean-wave")
    expect(screen.getByText("🐟")).toBeInTheDocument()
  })
})


