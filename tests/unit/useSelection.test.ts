import { renderHook, act } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { useSelection } from "@/hooks/useSelection"

describe("useSelection unit tests", () => {
  it("initializes with empty selection", () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.isSelected("item-1")).toBe(false)
  })

  it("selects and deselects a single item", () => {
    const { result } = renderHook(() => useSelection())

    act(() => {
      result.current.selectItem("item-1")
    })
    expect(result.current.selectedCount).toBe(1)
    expect(result.current.isSelected("item-1")).toBe(true)

    act(() => {
      result.current.deselectItem("item-1")
    })
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.isSelected("item-1")).toBe(false)
  })

  it("toggles item selection state correctly", () => {
    const { result } = renderHook(() => useSelection())

    act(() => {
      result.current.toggleSelection("item-1")
    })
    expect(result.current.isSelected("item-1")).toBe(true)
    expect(result.current.selectedCount).toBe(1)

    act(() => {
      result.current.toggleSelection("item-1")
    })
    expect(result.current.isSelected("item-1")).toBe(false)
    expect(result.current.selectedCount).toBe(0)
  })

  it("selects all items on page and clears selection", () => {
    const { result } = renderHook(() => useSelection())
    const pageItemIds = ["item-1", "item-2", "item-3", "item-4"]

    act(() => {
      result.current.selectAll(pageItemIds)
    })
    expect(result.current.selectedCount).toBe(4)
    expect(result.current.isAllSelected(pageItemIds)).toBe(true)
    expect(result.current.isPartiallySelected(pageItemIds)).toBe(false)

    act(() => {
      result.current.clearSelection()
    })
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.isAllSelected(pageItemIds)).toBe(false)
    expect(result.current.isPartiallySelected(pageItemIds)).toBe(false)
  })

  it("correctly identifies partial selection vs full selection", () => {
    const { result } = renderHook(() => useSelection())
    const pageItemIds = ["item-1", "item-2", "item-3"]

    act(() => {
      result.current.selectItem("item-1")
    })
    expect(result.current.isPartiallySelected(pageItemIds)).toBe(true)
    expect(result.current.isAllSelected(pageItemIds)).toBe(false)

    act(() => {
      result.current.selectItem("item-2")
      result.current.selectItem("item-3")
    })
    expect(result.current.isPartiallySelected(pageItemIds)).toBe(false)
    expect(result.current.isAllSelected(pageItemIds)).toBe(true)
  })

  it("returns false for isAllSelected and isPartiallySelected on empty list", () => {
    const { result } = renderHook(() => useSelection())
    expect(result.current.isAllSelected([])).toBe(false)
    expect(result.current.isPartiallySelected([])).toBe(false)
  })
})
