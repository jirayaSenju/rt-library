import { useState, useCallback } from "react"

export interface UseSelectionReturn {
  selectedIds: Set<string>
  selectedCount: number
  isSelected: (id: string) => boolean
  toggleSelection: (id: string) => void
  selectItem: (id: string) => void
  deselectItem: (id: string) => void
  selectAll: (itemIds: string[]) => void
  clearSelection: () => void
  isAllSelected: (itemIds: string[]) => boolean
  isPartiallySelected: (itemIds: string[]) => boolean
}

export function useSelection(): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id)
    },
    [selectedIds]
  )

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const deselectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const selectAll = useCallback((itemIds: string[]) => {
    setSelectedIds(new Set(itemIds))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const isAllSelected = useCallback(
    (itemIds: string[]) => {
      if (itemIds.length === 0) return false
      return itemIds.every((id) => selectedIds.has(id))
    },
    [selectedIds]
  )

  const isPartiallySelected = useCallback(
    (itemIds: string[]) => {
      if (itemIds.length === 0) return false
      const someSelected = itemIds.some((id) => selectedIds.has(id))
      const allSelected = itemIds.every((id) => selectedIds.has(id))
      return someSelected && !allSelected
    },
    [selectedIds]
  )

  const selectedCount = selectedIds.size

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggleSelection,
    selectItem,
    deselectItem,
    selectAll,
    clearSelection,
    isAllSelected,
    isPartiallySelected,
  }
}

