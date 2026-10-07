import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ProgressMascot } from "@/components/layout/ProgressMascot"
import { PROGRESS_THEMES } from "@/theme/progressThemes"

describe("ProgressMascot (V3-26) Unit Tests", () => {
  it("renders emoji mascot at clamped position (0% start) with enhanced scale", () => {
    const theme = PROGRESS_THEMES["nyan-cat"]
    const { container } = render(
      <ProgressMascot theme={theme} percent={0} size="sm" state="running" />
    )

    const mascotWrapper = container.querySelector("[data-mascot='Cat']")
    expect(mascotWrapper).toBeInTheDocument()
    expect(mascotWrapper).toHaveAttribute("data-mascot-type", "emoji")
    expect(mascotWrapper).toHaveAttribute("data-motion-type", "bounce")
    expect(mascotWrapper).toHaveAttribute("data-trail-type", "rainbow")
    expect(mascotWrapper).toHaveStyle({
      left: "clamp(0px, calc(0% - 10px), calc(100% - 20px))",
    })
    expect(screen.getByText("🐱")).toBeInTheDocument()
  })

  it("renders glyph mascot at clamped position (100% end)", () => {
    const theme = PROGRESS_THEMES["claude-code"]
    const { container } = render(
      <ProgressMascot theme={theme} percent={100} size="sm" state="running" />
    )

    const mascotWrapper = container.querySelector("[data-mascot='Prompt']")
    expect(mascotWrapper).toBeInTheDocument()
    expect(mascotWrapper).toHaveAttribute("data-mascot-type", "glyph")
    expect(mascotWrapper).toHaveAttribute("data-motion-type", "pulse")
    expect(mascotWrapper).toHaveStyle({
      left: "clamp(0px, calc(100% - 10px), calc(100% - 20px))",
    })
    expect(screen.getByText(">_")).toBeInTheDocument()
  })

  it("renders mascot correctly clamped at 25%, 50%, and 75%", () => {
    const theme = PROGRESS_THEMES["cosmic-nebula"]
    const { container, rerender } = render(
      <ProgressMascot theme={theme} percent={25} size="md" state="running" />
    )

    let wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(25% - 14px), calc(100% - 28px))",
    })

    rerender(<ProgressMascot theme={theme} percent={50} size="md" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(50% - 14px), calc(100% - 28px))",
    })

    rerender(<ProgressMascot theme={theme} percent={75} size="md" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(75% - 14px), calc(100% - 28px))",
    })
  })

  it("handles indeterminate state with full sweep class", () => {
    const theme = PROGRESS_THEMES["matrix-rain"]
    const { container } = render(
      <ProgressMascot theme={theme} percent={null} isIndeterminate={true} state="running" />
    )

    const mascotWrapper = container.querySelector("[data-mascot='Digital Bot']")
    expect(mascotWrapper).toBeInTheDocument()
    expect(mascotWrapper).toHaveClass("w-full")

    const glyphElement = screen.getByText("▣")
    expect(glyphElement).toHaveClass("animate-mascot-indeterminate-sweep")
  })

  it("applies celebrate animation when state is completed", () => {
    const theme = PROGRESS_THEMES["arcade-pixel"]
    render(<ProgressMascot theme={theme} percent={100} state="completed" />)

    const invader = screen.getByText("👾")
    expect(invader).toHaveClass("animate-mascot-celebrate")
  })

  it("applies grayscale and stops motion when state is failed", () => {
    const theme = PROGRESS_THEMES["lava-lamp"]
    const { container } = render(
      <ProgressMascot theme={theme} percent={45} state="failed" />
    )

    const mascotWrapper = container.querySelector("[data-mascot='Lava Blob']")
    expect(mascotWrapper).toHaveClass("grayscale")
    expect(mascotWrapper).toHaveClass("opacity-60")

    const blob = screen.getByText("🔥")
    expect(blob).not.toHaveClass("animate-mascot-lava-bob")
    expect(blob).not.toHaveClass("animate-mascot-bounce")
  })

  it("applies pulse styling when cancelling or attention required", () => {
    const theme = PROGRESS_THEMES["synthwave"]
    const { container, rerender } = render(
      <ProgressMascot theme={theme} percent={50} state="cancelling" />
    )

    const vector = screen.getByText("▲")
    expect(vector).toHaveClass("animate-pulse")

    rerender(<ProgressMascot theme={theme} percent={50} state="interaction_required" />)
    expect(screen.getByText("▲")).toHaveClass("animate-pulse")
  })

  it("supports size variants (sm/card: 20px, md/preview: 28px, lg/runtime: 30px)", () => {
    const theme = PROGRESS_THEMES["cosmic-nebula"]
    const { container, rerender } = render(
      <ProgressMascot theme={theme} percent={50} size="sm" state="running" />
    )

    let wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "sm")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(50% - 10px), calc(100% - 20px))",
    })

    rerender(<ProgressMascot theme={theme} percent={50} size="card" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "sm")

    rerender(<ProgressMascot theme={theme} percent={50} size="md" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "md")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(50% - 14px), calc(100% - 28px))",
    })

    rerender(<ProgressMascot theme={theme} percent={50} size="preview" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "md")

    rerender(<ProgressMascot theme={theme} percent={50} size="lg" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "lg")
    expect(wrapper).toHaveStyle({
      left: "clamp(0px, calc(50% - 15px), calc(100% - 30px))",
    })

    rerender(<ProgressMascot theme={theme} percent={50} size="runtime" state="running" />)
    wrapper = container.querySelector("[data-mascot='Rocket']")
    expect(wrapper).toHaveAttribute("data-mascot-size", "lg")
  })

  it("suppresses animation when isStatic is true", () => {
    const theme = PROGRESS_THEMES["nyan-cat"]
    render(<ProgressMascot theme={theme} percent={50} isStatic={true} state="running" />)

    const cat = screen.getByText("🐱")
    expect(cat).not.toHaveClass("animate-mascot-bounce")
  })

  it("returns null if theme has no mascot", () => {
    const invalidTheme: any = { id: "test" }
    const { container } = render(
      <ProgressMascot theme={invalidTheme} percent={50} />
    )
    expect(container.firstChild).toBeNull()
  })
})
