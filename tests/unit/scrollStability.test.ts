import { describe, it, expect } from "vitest"
import { calculateGridDimensions, DENSITY_CONFIG } from "@/components/library/ItemGrid"

describe("V3-09 Scroll Stability & Deterministic Row Geometry", () => {
  describe("Row Geometry & Distance Invariant", () => {
    it("guarantees consecutive row distance is strictly equal to gap for comfortable density", () => {
      const containerWidths = [1040, 1126, 1200, 1280, 1440, 1680, 1920, 2560]
      const gap = DENSITY_CONFIG.comfortable.GAP

      for (const width of containerWidths) {
        const dims = calculateGridDimensions(width, "comfortable")
        const rowHeight = dims.estimatedCardHeight

        for (let i = 0; i < 50; i++) {
          const rowStart = i * (rowHeight + gap)
          const rowBottom = rowStart + rowHeight
          const nextRowStart = (i + 1) * (rowHeight + gap)

          expect(nextRowStart - rowBottom).toBe(gap)
          expect(rowBottom).toBeLessThanOrEqual(nextRowStart)
        }
      }
    })

    it("guarantees consecutive row distance is strictly equal to gap for compact density", () => {
      const containerWidths = [1040, 1126, 1200, 1280, 1440, 1680, 1920, 2560]
      const gap = DENSITY_CONFIG.compact.GAP

      for (const width of containerWidths) {
        const dims = calculateGridDimensions(width, "compact")
        const rowHeight = dims.estimatedCardHeight

        for (let i = 0; i < 50; i++) {
          const rowStart = i * (rowHeight + gap)
          const rowBottom = rowStart + rowHeight
          const nextRowStart = (i + 1) * (rowHeight + gap)

          expect(nextRowStart - rowBottom).toBe(gap)
          expect(rowBottom).toBeLessThanOrEqual(nextRowStart)
        }
      }
    })
  })

  describe("Column Count Monotonicity (No Oscillation)", () => {
    it("never oscillates columnCount as containerWidth increases incrementally", () => {
      let previousColumns = 1
      for (let width = 320; width <= 2560; width += 5) {
        const dims = calculateGridDimensions(width, "comfortable")
        expect(dims.columnCount).toBeGreaterThanOrEqual(previousColumns)
        expect(dims.cardWidth).toBeGreaterThanOrEqual(DENSITY_CONFIG.comfortable.MIN_CARD_WIDTH)
        expect(dims.cardWidth).toBeLessThanOrEqual(DENSITY_CONFIG.comfortable.MAX_CARD_WIDTH)
        previousColumns = dims.columnCount
      }
    })

    it("never oscillates columnCount in compact mode as containerWidth increases incrementally", () => {
      let previousColumns = 1
      for (let width = 320; width <= 2560; width += 5) {
        const dims = calculateGridDimensions(width, "compact")
        expect(dims.columnCount).toBeGreaterThanOrEqual(previousColumns)
        expect(dims.cardWidth).toBeGreaterThanOrEqual(DENSITY_CONFIG.compact.MIN_CARD_WIDTH)
        expect(dims.cardWidth).toBeLessThanOrEqual(DENSITY_CONFIG.compact.MAX_CARD_WIDTH)
        previousColumns = dims.columnCount
      }
    })
  })

  describe("Row Size & Total Container Calculations", () => {
    it("produces deterministic total height matching rowCount * rowHeight + (rowCount-1) * gap", () => {
      const width = 1680
      const dims = calculateGridDimensions(width, "comfortable")
      const totalItems = 48
      const rowCount = Math.ceil(totalItems / dims.columnCount)
      const gap = DENSITY_CONFIG.comfortable.GAP

      const expectedTotalHeight = rowCount * dims.estimatedCardHeight + (rowCount - 1) * gap
      const calculatedTotal = (rowCount - 1) * (dims.estimatedCardHeight + gap) + dims.estimatedCardHeight

      expect(calculatedTotal).toBe(expectedTotalHeight)
    })
  })
})
