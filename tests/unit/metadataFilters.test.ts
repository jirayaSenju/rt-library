import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_LIBRARY_FILTERS, LibraryFilters, FilterOptions } from '@/types'
import { FilterFacetsResponse } from '@/types/libraryIPC'
import { nativeLibraryService } from '@/services/nativeLibrary'

describe('V3-07 Metadata Filters & Facets Unit Tests', () => {
  describe('FASE 2 & 3 - Filter Model & Semantics', () => {
    it('initializes default metadata filter fields with empty arrays and multiplayer any', () => {
      expect(DEFAULT_LIBRARY_FILTERS.developers).toEqual([])
      expect(DEFAULT_LIBRARY_FILTERS.publishers).toEqual([])
      expect(DEFAULT_LIBRARY_FILTERS.genres).toEqual([])
      expect(DEFAULT_LIBRARY_FILTERS.languages).toEqual([])
      expect(DEFAULT_LIBRARY_FILTERS.imageFormats).toEqual([])
      expect(DEFAULT_LIBRARY_FILTERS.multiplayer).toBe('any')
      expect(DEFAULT_LIBRARY_FILTERS.regions).toEqual([])
    })

    it('handles OR semantics within the same facet and AND semantics across different facets', () => {
      interface MockItem {
        id: string
        title: string
        developer: string
        genre: string
        language: string
        imageFormat: string
        multiplayer: boolean | null
        region: string
      }

      const items: MockItem[] = [
        { id: '1', title: 'Game A', developer: 'Capcom', genre: 'Action, RPG', language: 'en, ja', imageFormat: 'NSP', multiplayer: true, region: 'JPN' },
        { id: '2', title: 'Game B', developer: 'Nightdive Studios', genre: 'FPS, Action', language: 'en, ru', imageFormat: 'NSZ', multiplayer: false, region: 'EUR' },
        { id: '3', title: 'Game C', developer: 'Capcom', genre: 'Horror', language: 'en', imageFormat: 'XCI', multiplayer: false, region: 'USA' },
        { id: '4', title: 'Game D', developer: 'Konami', genre: 'Horror, Adventure', language: 'en', imageFormat: 'ISO', multiplayer: null, region: 'USA' },
      ]

      const filterItems = (list: MockItem[], filters: LibraryFilters) => {
        return list.filter((item) => {
          // Developers (OR)
          if (filters.developers && filters.developers.length > 0) {
            const match = filters.developers.some((d) => item.developer.toLowerCase().includes(d.toLowerCase()))
            if (!match) return false
          }
          // Genres (OR)
          if (filters.genres && filters.genres.length > 0) {
            const match = filters.genres.some((g) => item.genre.toLowerCase().includes(g.toLowerCase()))
            if (!match) return false
          }
          // Languages (OR)
          if (filters.languages && filters.languages.length > 0) {
            const match = filters.languages.some((l) => item.language.toLowerCase().includes(l.toLowerCase()))
            if (!match) return false
          }
          // Formats (OR)
          if (filters.imageFormats && filters.imageFormats.length > 0) {
            const match = filters.imageFormats.some((f) => item.imageFormat.toUpperCase() === f.toUpperCase())
            if (!match) return false
          }
          // Multiplayer (Tri-state)
          if (filters.multiplayer === 'yes' && item.multiplayer !== true) return false
          if (filters.multiplayer === 'no' && item.multiplayer !== false) return false
          // Regions (OR)
          if (filters.regions && filters.regions.length > 0) {
            const match = filters.regions.some((r) => item.region.toUpperCase() === r.toUpperCase())
            if (!match) return false
          }

          return true
        })
      }

      // Same-field multiselect (OR)
      const orDevs = filterItems(items, { developers: ['Capcom', 'Nightdive Studios'] })
      expect(orDevs.map((i) => i.id)).toEqual(['1', '2', '3'])

      // Cross-field combination (AND)
      const andDevGenre = filterItems(items, { developers: ['Capcom'], genres: ['Horror'] })
      expect(andDevGenre.map((i) => i.id)).toEqual(['3'])

      // Multiplayer Yes filter excludes singleplayer and NULL
      const multiYes = filterItems(items, { multiplayer: 'yes' })
      expect(multiYes.map((i) => i.id)).toEqual(['1'])

      // Multiplayer No filter excludes multiplayer and NULL
      const multiNo = filterItems(items, { multiplayer: 'no' })
      expect(multiNo.map((i) => i.id)).toEqual(['2', '3'])
    })
  })

  describe('FASE 33-36 - Saved Views Compatibility & Serialization', () => {
    it('safely deserializes legacy saved view without metadata filters', () => {
      const legacySavedViewJSON = JSON.stringify({
        id: 'view-old-1',
        name: 'Old Favorite View',
        filters: {
          minSeeds: 5,
          yearFrom: 2010,
          yearTo: 2020,
        },
      })

      const parsed = JSON.parse(legacySavedViewJSON)
      const restoredFilters: LibraryFilters = {
        ...DEFAULT_LIBRARY_FILTERS,
        ...parsed.filters,
        developers: parsed.filters.developers || [],
        publishers: parsed.filters.publishers || [],
        genres: parsed.filters.genres || [],
        languages: parsed.filters.languages || [],
        imageFormats: parsed.filters.imageFormats || [],
        multiplayer: parsed.filters.multiplayer || 'any',
        regions: parsed.filters.regions || [],
      }

      expect(restoredFilters.minSeeds).toBe(5)
      expect(restoredFilters.yearFrom).toBe(2010)
      expect(restoredFilters.developers).toEqual([])
      expect(restoredFilters.publishers).toEqual([])
      expect(restoredFilters.genres).toEqual([])
      expect(restoredFilters.languages).toEqual([])
      expect(restoredFilters.imageFormats).toEqual([])
      expect(restoredFilters.multiplayer).toBe('any')
      expect(restoredFilters.regions).toEqual([])
    })

    it('persists and restores full metadata facets in saved view', () => {
      const fullFilters: LibraryFilters = {
        minSeeds: 10,
        developers: ['Capcom', 'Nightdive Studios'],
        publishers: ['Capcom'],
        genres: ['Action', 'RPG'],
        languages: ['en', 'ja'],
        imageFormats: ['NSP', 'XCI'],
        multiplayer: 'yes',
        regions: ['EUR', 'JPN'],
      }

      const savedView = {
        id: 'view-meta-1',
        name: 'Action Switch Games',
        filters: fullFilters,
      }

      const serialized = JSON.stringify(savedView)
      const deserialized = JSON.parse(serialized)

      expect(deserialized.filters.developers).toEqual(['Capcom', 'Nightdive Studios'])
      expect(deserialized.filters.genres).toEqual(['Action', 'RPG'])
      expect(deserialized.filters.languages).toEqual(['en', 'ja'])
      expect(deserialized.filters.imageFormats).toEqual(['NSP', 'XCI'])
      expect(deserialized.filters.multiplayer).toBe('yes')
      expect(deserialized.filters.regions).toEqual(['EUR', 'JPN'])
    })
  })

  describe('nativeLibraryService.getFilterFacets IPC Bridge', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      // @ts-expect-error test window mock
      delete window.rtLibrary
    })

    it('returns empty default facets when window.rtLibrary is undefined', async () => {
      const facets = await nativeLibraryService.getFilterFacets('nintendo-switch')
      expect(facets).toEqual({
        developers: [],
        publishers: [],
        genres: [],
        languages: [],
        imageFormats: [],
        regions: [],
        multiplayer: { yes: 0, no: 0 },
      })
    })

    it('delegates to window.rtLibrary.library.getFilterFacets with categoryId when present', async () => {
      const mockResult: FilterFacetsResponse = {
        developers: [{ value: 'Nintendo', count: 10 }],
        publishers: [{ value: 'Nintendo', count: 10 }],
        genres: [{ value: 'Action', count: 8 }],
        languages: [{ value: 'en', count: 10 }],
        imageFormats: [{ value: 'NSP', count: 10 }],
        regions: [{ value: 'USA', count: 10 }],
        multiplayer: { yes: 4, no: 6 },
      }

      const mockGetFilterFacets = vi.fn().mockResolvedValue(mockResult)

      // @ts-expect-error test window mock
      window.rtLibrary = {
        library: {
          getFilterFacets: mockGetFilterFacets,
        },
      }

      const result = await nativeLibraryService.getFilterFacets('nintendo-switch')
      expect(mockGetFilterFacets).toHaveBeenCalledWith({ categoryId: 'nintendo-switch' })
      expect(result).toEqual(mockResult)
    })

    it('calls getFilterFacets with undefined categoryId when category is not provided', async () => {
      const mockGetFilterFacets = vi.fn().mockResolvedValue({
        developers: [],
        publishers: [],
        genres: [],
        languages: [],
        imageFormats: [],
        regions: [],
        multiplayer: { yes: 0, no: 0 },
      })

      // @ts-expect-error test window mock
      window.rtLibrary = {
        library: {
          getFilterFacets: mockGetFilterFacets,
        },
      }

      await nativeLibraryService.getFilterFacets()
      expect(mockGetFilterFacets).toHaveBeenCalledWith({ categoryId: undefined })
    })

    it('handles IPC errors gracefully by returning fallback empty facets', async () => {
      const mockGetFilterFacets = vi.fn().mockRejectedValue(new Error('IPC crash'))

      // @ts-expect-error test window mock
      window.rtLibrary = {
        library: {
          getFilterFacets: mockGetFilterFacets,
        },
      }

      const result = await nativeLibraryService.getFilterFacets('nintendo-switch')
      expect(result).toEqual({
        developers: [],
        publishers: [],
        genres: [],
        languages: [],
        imageFormats: [],
        regions: [],
        multiplayer: { yes: 0, no: 0 },
      })
    })
  })
})

