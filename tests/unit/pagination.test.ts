import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getPaginationRange, ALLOWED_PAGE_SIZES } from "@/components/library/Pagination"
import { getStoredPageSize } from "@/hooks/useLibrary"

describe("Pagination Unit Tests", () => {
  describe("getPaginationRange helper", () => {
    it("returns zero bounds when totalItems is 0", () => {
      const result = getPaginationRange(1, 48, 0)
      expect(result).toEqual({
        startItem: 0,
        endItem: 0,
        totalPages: 1,
      })
    })

    it("calculates exact range for page 1", () => {
      const result = getPaginationRange(1, 48, 120)
      expect(result).toEqual({
        startItem: 1,
        endItem: 48,
        totalPages: 3,
      })
    })

    it("calculates exact range for middle page", () => {
      const result = getPaginationRange(2, 48, 120)
      expect(result).toEqual({
        startItem: 49,
        endItem: 96,
        totalPages: 3,
      })
    })

    it("calculates exact range for last partial page", () => {
      const result = getPaginationRange(3, 48, 120)
      expect(result).toEqual({
        startItem: 97,
        endItem: 120,
        totalPages: 3,
      })
    })

    it("clamps currentPage to totalPages if currentPage is out of bounds", () => {
      const result = getPaginationRange(99, 48, 120)
      expect(result).toEqual({
        startItem: 97,
        endItem: 120,
        totalPages: 3,
      })
    })

    it("handles single page with fewer items than pageSize", () => {
      const result = getPaginationRange(1, 48, 15)
      expect(result).toEqual({
        startItem: 1,
        endItem: 15,
        totalPages: 1,
      })
    })

    it("handles large pageSize correctly across allowed options", () => {
      ALLOWED_PAGE_SIZES.forEach((size) => {
        const result = getPaginationRange(1, size, 500)
        expect(result.startItem).toBe(1)
        expect(result.endItem).toBe(size)
        expect(result.totalPages).toBe(Math.ceil(500 / size))
      })
    })
  })

  describe("getStoredPageSize persistence", () => {
    const originalLocalStorage = window.localStorage

    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    it("defaults to 48 when localStorage is empty", () => {
      expect(getStoredPageSize()).toBe(48)
    })

    it("returns stored valid page size", () => {
      localStorage.setItem("rt_library_page_size", "96")
      expect(getStoredPageSize()).toBe(96)

      localStorage.setItem("rt_library_page_size", "200")
      expect(getStoredPageSize()).toBe(200)
    })

    it("falls back to 24 when stored value is invalid or corrupted", () => {
      localStorage.setItem("rt_library_page_size", "999")
      expect(getStoredPageSize()).toBe(24)

      localStorage.setItem("rt_library_page_size", "abc")
      expect(getStoredPageSize()).toBe(24)

      localStorage.setItem("rt_library_page_size", "-10")
      expect(getStoredPageSize()).toBe(24)
    })
  })
})
