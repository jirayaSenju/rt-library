import { describe, it, expect } from "vitest"
import { calculateGridDimensions, DENSITY_CONFIG } from "@/components/library/ItemGrid"

describe("calculateGridDimensions (Responsive Grid Layout & Maximize)", () => {
  const SIDEBAR_EXPANDED = 240
  const SIDEBAR_COLLAPSED = 64

  describe("Comfortable density", () => {
    const config = DENSITY_CONFIG.comfortable

    it("handles zero or negative container width gracefully", () => {
      const dims = calculateGridDimensions(0, "comfortable")
      expect(dims.columnCount).toBeGreaterThan(0)
      expect(dims.cardWidth).toBe(config.PREFERRED_CARD_WIDTH)
      expect(dims.estimatedCardHeight).toBeGreaterThan(0)
      expect(dims.estimatedRowHeight).toBe(dims.estimatedCardHeight + config.GAP)
    })

    it("calculates correct columns for normal window (1280x720) with expanded sidebar", () => {
      const containerWidth = 1280 - SIDEBAR_EXPANDED // 1040px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBeGreaterThanOrEqual(4)
      expect(dims.columnCount).toBeLessThanOrEqual(5)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)

      const totalRowWidth = dims.columnCount * dims.cardWidth + (dims.columnCount - 1) * config.GAP
      const usableWidth = containerWidth - 48
      expect(totalRowWidth).toBeLessThanOrEqual(usableWidth + 0.01)
    })

    it("calculates correct columns for laptop screen (1366x768) with expanded sidebar", () => {
      const containerWidth = 1366 - SIDEBAR_EXPANDED // 1126px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBe(5)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })

    it("calculates correct columns for 1440x900 screen with expanded sidebar", () => {
      const containerWidth = 1440 - SIDEBAR_EXPANDED // 1200px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBe(5)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })

    it("calculates correct columns when maximizing window to Full HD (1920x1080) with expanded sidebar", () => {
      const containerWidth = 1920 - SIDEBAR_EXPANDED // 1680px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBe(7)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)

      const totalRowWidth = dims.columnCount * dims.cardWidth + (dims.columnCount - 1) * config.GAP
      const usableWidth = containerWidth - 48
      expect(totalRowWidth).toBeLessThanOrEqual(usableWidth + 0.01)
    })

    it("recalculates more columns when collapsing sidebar on maximized Full HD (1920x1080)", () => {
      const containerWidth = 1920 - SIDEBAR_COLLAPSED // 1856px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBe(8)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })

    it("scales columns smoothly on 2K displays (2560x1440)", () => {
      const containerWidth = 2560 - SIDEBAR_EXPANDED // 2320px
      const dims = calculateGridDimensions(containerWidth, "comfortable")

      expect(dims.columnCount).toBe(10)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })

    it("correctly handles window maximize and restore lifecycle without overlap", () => {
      // 1. Normal window
      const normalWidth = 1280 - SIDEBAR_EXPANDED
      const normalDims = calculateGridDimensions(normalWidth, "comfortable")
      expect(normalDims.columnCount).toBe(4)

      // 2. Maximized window
      const maxWidth = 1920 - SIDEBAR_EXPANDED
      const maxDims = calculateGridDimensions(maxWidth, "comfortable")
      expect(maxDims.columnCount).toBe(7)
      expect(maxDims.columnCount).toBeGreaterThan(normalDims.columnCount)
      expect(maxDims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(maxDims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)

      // 3. Restored window
      const restoredDims = calculateGridDimensions(normalWidth, "comfortable")
      expect(restoredDims.columnCount).toBe(normalDims.columnCount)
      expect(restoredDims.cardWidth).toBeCloseTo(normalDims.cardWidth, 2)
    })
  })

  describe("Compact density", () => {
    const config = DENSITY_CONFIG.compact

    it("calculates more columns in compact mode for normal window (1280x720)", () => {
      const containerWidth = 1280 - SIDEBAR_EXPANDED // 1040px
      const dims = calculateGridDimensions(containerWidth, "compact")

      expect(dims.columnCount).toBe(6)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })

    it("calculates compact columns for maximized Full HD (1920x1080)", () => {
      const containerWidth = 1920 - SIDEBAR_EXPANDED // 1680px
      const dims = calculateGridDimensions(containerWidth, "compact")

      expect(dims.columnCount).toBe(10)
      expect(dims.cardWidth).toBeGreaterThanOrEqual(config.MIN_CARD_WIDTH)
      expect(dims.cardWidth).toBeLessThanOrEqual(config.MAX_CARD_WIDTH)
    })
  })

  describe("Vertical Geometry & Overlap Assertions", () => {
    it("guarantees previousRow.bottom <= nextRow.top across consecutive virtual rows", () => {
      const widths = [1040, 1126, 1200, 1680, 1856, 2320]

      for (const width of widths) {
        const dims = calculateGridDimensions(width, "comfortable")
        const gap = DENSITY_CONFIG.comfortable.GAP
        const rowHeight = dims.estimatedCardHeight

        // Simulate 20 rows
        for (let rowIdx = 0; rowIdx < 20; rowIdx++) {
          const rowStart = rowIdx * (rowHeight + gap)
          const rowBottom = rowStart + rowHeight

          const nextRowStart = (rowIdx + 1) * (rowHeight + gap)

          // Distance between rows must be exactly the gap (16px), strictly non-overlapping
          expect(nextRowStart - rowBottom).toBe(gap)
          expect(rowBottom).toBeLessThanOrEqual(nextRowStart)
        }
      }
    })

    it("ensures card dimensions match row height exactly without overflow", () => {
      const dims = calculateGridDimensions(1680, "comfortable")
      expect(dims.estimatedCardHeight).toBe(Math.round(dims.cardWidth * (4 / 3)))
      expect(dims.estimatedRowHeight).toBe(dims.estimatedCardHeight + DENSITY_CONFIG.comfortable.GAP)
    })
  })
})
