import { describe, expect, it } from 'vitest'
import { calculateCategoryProgress, getCategoryProgress } from '@/utils/categoryProgress'

describe('current category progress', () => {
  it.each([[1, 100, 1], [5, 71, 7.042253521126761], [50, 100, 50], [100, 100, 100], [101, 100, 100], [0, 100, 0], [-5, 100, 0]])('%s/%s => %s', (page, total, expected) => {
    expect(calculateCategoryProgress(page, total)).toBeCloseTo(expected)
  })
  it.each([[5, 0], [null, null], [1, NaN], [Infinity, 100], [5, -1]])('unknown or invalid %s/%s is indeterminate', (page, total) => {
    expect(calculateCategoryProgress(page, total)).toBeNull()
  })
  it('finishes early only on explicit category completion', () => {
    expect(getCategoryProgress({ currentPage: 6, totalPages: 145, status: 'scanning' })).toBeCloseTo(4.1379)
    expect(getCategoryProgress({ currentPage: 6, totalPages: 145, status: 'category_completed_early_stop' })).toBe(100)
    for (const status of ['paused', 'cancelled', 'failed']) {
      expect(getCategoryProgress({ currentPage: 20, totalPages: 100, status })).toBe(20)
    }
  })
})

