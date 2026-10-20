/** Page counts refer to completed pages in the current category. */
export function calculateCategoryProgress(currentPage?: number | null, totalPages?: number | null): number | null {
  if (currentPage == null || totalPages == null || !Number.isFinite(currentPage) || !Number.isFinite(totalPages) || totalPages <= 0) return null
  return Math.min(100, Math.max(0, currentPage / totalPages * 100))
}

export function getCategoryProgress(progress?: { currentPage?: number; totalPages?: number; status?: string } | null): number | null {
  if (progress?.status === 'category_completed' || progress?.status === 'category_completed_early_stop') return 100
  if (progress?.totalPages != null && progress.totalPages <= 1) return null
  return calculateCategoryProgress(progress?.currentPage, progress?.totalPages)
}
