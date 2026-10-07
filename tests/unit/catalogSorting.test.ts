import { describe, it, expect, beforeEach, vi } from 'vitest';

const itemsRepo = require('../../electron/database/repositories/itemsRepo.cjs');

interface MockRow {
  id: string;
  category_id: string;
  source: string;
  topic_id: string;
  title: string;
  topic_title?: string;
  canonical_title?: string;
  normalized_title?: string;
  clean_title?: string;
  title_sort: string;
  info_hash?: string;
  url?: string;
  genre?: string;
  developer?: string;
  publisher?: string;
  release_year?: number;
  language?: string;
  interface_language?: string;
  voice_language?: string;
  image_format?: string;
  multiplayer?: string;
  cover_url?: string;
  size_str?: string;
  size_bytes?: number;
  has_cover: number;
  has_screenshots: number;
  has_magnet: number;
  is_favorite: number;
  discovered_at: string | null;
  scraped_at?: string;
  updated_at?: string;
  magnet?: string;
  seeds?: number;
  leechers?: number;
  peers?: number;
  swarm_status?: string;
  swarm_source?: string;
  swarm_fetched_at?: string;
}

describe('Catalog Default Sorting by Scrape/Discovery Date Descending (V3-24)', () => {
  let sampleRows: MockRow[];
  let lastPreparedSql: string[];
  let mockDb: any;

  beforeEach(() => {
    lastPreparedSql = [];

    sampleRows = [
      {
        id: 'item-a',
        category_id: 'switch',
        source: 'rutracker',
        topic_id: '101',
        title: 'Zelda BOTW',
        canonical_title: 'Zelda BOTW',
        title_sort: 'zelda botw',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'item-b',
        category_id: 'switch',
        source: 'rutracker',
        topic_id: '102',
        title: 'Mario Odyssey',
        canonical_title: 'Mario Odyssey',
        title_sort: 'mario odyssey',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-07T12:00:00Z', // Newest
      },
      {
        id: 'item-c',
        category_id: 'switch',
        source: 'rutracker',
        topic_id: '103',
        title: 'Metroid Prime',
        canonical_title: 'Metroid Prime',
        title_sort: 'metroid prime',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-05T08:00:00Z',
      },
      {
        id: 'item-d',
        category_id: 'ps2',
        source: 'rutracker',
        topic_id: '201',
        title: 'God of War II',
        canonical_title: 'God of War II',
        title_sort: 'god of war ii',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-06T14:00:00Z',
      },
      {
        id: 'item-e',
        category_id: 'ps2',
        source: 'rutracker',
        topic_id: '202',
        title: 'Shadow of the Colossus',
        canonical_title: 'Shadow of the Colossus',
        title_sort: 'shadow of the colossus',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-02T09:00:00Z',
      },
      {
        id: 'item-f',
        category_id: 'ps2',
        source: 'rutracker',
        topic_id: '203',
        title: 'Devil May Cry 3',
        canonical_title: 'Devil May Cry 3',
        title_sort: 'devil may cry 3',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: '2026-10-06T14:00:00Z', // Same timestamp as item-d (tie test)
      },
      {
        id: 'item-g',
        category_id: 'switch',
        source: 'rutracker',
        topic_id: '104',
        title: 'Animal Crossing',
        canonical_title: 'Animal Crossing',
        title_sort: 'animal crossing',
        has_cover: 1,
        has_screenshots: 1,
        has_magnet: 1,
        is_favorite: 0,
        discovered_at: null, // Legacy item with NULL discovered_at
      },
    ];

    mockDb = {
      prepare: vi.fn((sql: string) => {
        lastPreparedSql.push(sql);

        return {
          get: vi.fn((params?: any[]) => {
            if (sql.includes('COUNT(*)')) {
              let rows = [...sampleRows];
              if (params && params.length > 0 && sql.includes('category_id = ?')) {
                const catId = params[0];
                rows = rows.filter((r) => r.category_id === catId);
              }
              return { total: rows.length };
            }
            return null;
          }),
          all: vi.fn((params?: any[]) => {
            let rows = [...sampleRows];
            let offset = 0;
            let limit = 100;

            if (params && params.length >= 2) {
              limit = params[params.length - 2];
              offset = params[params.length - 1];
            }

            if (sql.includes('category_id = ?')) {
              const catId = params[0];
              rows = rows.filter((r) => r.category_id === catId);
            }

            // Simulate SQLite sorting semantics implemented in itemsRepo
            if (sql.includes('items.discovered_at DESC')) {
              rows.sort((a, b) => {
                const isANull = a.discovered_at === null || a.discovered_at === undefined;
                const isBNull = b.discovered_at === null || b.discovered_at === undefined;
                if (isANull && !isBNull) return 1;
                if (!isANull && isBNull) return -1;
                if (isANull && isBNull) return (a.id || '').localeCompare(b.id || '');

                const cmp = b.discovered_at!.localeCompare(a.discovered_at!);
                if (cmp !== 0) return cmp;

                const titleA = a.canonical_title || a.title_sort;
                const titleB = b.canonical_title || b.title_sort;
                const titleCmp = titleA.localeCompare(titleB);
                if (titleCmp !== 0) return titleCmp;

                return a.id.localeCompare(b.id);
              });
            } else if (sql.includes('DESC')) {
              rows.sort((a, b) => {
                const titleA = a.canonical_title || a.title_sort;
                const titleB = b.canonical_title || b.title_sort;
                const titleCmp = titleB.localeCompare(titleA);
                if (titleCmp !== 0) return titleCmp;
                return a.id.localeCompare(b.id);
              });
            } else if (sql.includes('ASC')) {
              rows.sort((a, b) => {
                const titleA = a.canonical_title || a.title_sort;
                const titleB = b.canonical_title || b.title_sort;
                const titleCmp = titleA.localeCompare(titleB);
                if (titleCmp !== 0) return titleCmp;
                return a.id.localeCompare(b.id);
              });
            }

            return rows.slice(offset, offset + limit);
          }),
        };
      }),
    };
  });

  describe('Phase 25: All Games Default Sorting', () => {
    it('generates SQL ordering by discoveredAt DESC by default and returns items newest first', () => {
      const result = itemsRepo.getPaginated(mockDb, {});
      const ids = result.items.map((i: any) => i.id);

      // Check generated SQL
      const selectSql = lastPreparedSql.find((s) => s.includes('SELECT') && !s.includes('COUNT(*)'))!;
      expect(selectSql).toContain('ORDER BY (items.discovered_at IS NULL), items.discovered_at DESC');
      expect(selectSql).toContain('COALESCE(items.canonical_title, items.title_sort) ASC, items.id ASC');

      // Expected order:
      // 1. item-b (2026-10-07)
      // 2 & 3. item-f ('Devil May Cry 3') & item-d ('God of War II') (2026-10-06, tie broken alphabetically by title)
      // 4. item-c (2026-10-05)
      // 5. item-e (2026-10-02)
      // 6. item-a (2026-10-01)
      // 7. item-g (NULL discovered_at, sorted last)
      expect(ids[0]).toBe('item-b');
      expect(ids[1]).toBe('item-f');
      expect(ids[2]).toBe('item-d');
      expect(ids[3]).toBe('item-c');
      expect(ids[4]).toBe('item-e');
      expect(ids[5]).toBe('item-a');
      expect(ids[6]).toBe('item-g');
    });
  });

  describe('Phase 26: Category Scoped Sorting', () => {
    it('orders single category items by discoveredAt DESC by default', () => {
      const result = itemsRepo.getPaginated(mockDb, { categoryId: 'switch' });
      const ids = result.items.map((i: any) => i.id);

      const selectSql = lastPreparedSql.find((s) => s.includes('SELECT') && !s.includes('COUNT(*)'))!;
      expect(selectSql).toContain('WHERE category_id = ?');
      expect(selectSql).toContain('ORDER BY (items.discovered_at IS NULL), items.discovered_at DESC');

      // Switch items: item-b (10-07), item-c (10-05), item-a (10-01), item-g (NULL)
      expect(ids).toEqual(['item-b', 'item-c', 'item-a', 'item-g']);
    });

    it('orders PS2 category items by discoveredAt DESC by default', () => {
      const result = itemsRepo.getPaginated(mockDb, { categoryId: 'ps2' });
      const ids = result.items.map((i: any) => i.id);

      // PS2 items: 10-06 tie (item-f 'Devil May Cry 3', item-d 'God of War II'), then item-e (10-02)
      expect(ids).toEqual(['item-f', 'item-d', 'item-e']);
    });
  });

  describe('Phase 27: Manual Sort Override', () => {
    it('respects user manual sort by title ASC when provided', () => {
      const result = itemsRepo.getPaginated(mockDb, {
        categoryId: 'switch',
        sortBy: 'title',
        sortOrder: 'asc',
      });
      const titles = result.items.map((i: any) => i.title);

      const selectSql = lastPreparedSql.find((s) => s.includes('SELECT') && !s.includes('COUNT(*)'))!;
      expect(selectSql).toContain('ORDER BY COALESCE(items.canonical_title, items.title_sort, items.clean_title, items.title) ASC, items.id ASC');

      expect(titles).toEqual([
        'Animal Crossing',
        'Mario Odyssey',
        'Metroid Prime',
        'Zelda BOTW',
      ]);
    });

    it('respects user manual sort by title DESC when provided', () => {
      const result = itemsRepo.getPaginated(mockDb, {
        categoryId: 'switch',
        sortBy: 'title',
        sortOrder: 'desc',
      });
      const titles = result.items.map((i: any) => i.title);

      const selectSql = lastPreparedSql.find((s) => s.includes('SELECT') && !s.includes('COUNT(*)'))!;
      expect(selectSql).toContain('ORDER BY COALESCE(items.canonical_title, items.title_sort, items.clean_title, items.title) DESC, items.id ASC');

      expect(titles).toEqual([
        'Zelda BOTW',
        'Metroid Prime',
        'Mario Odyssey',
        'Animal Crossing',
      ]);
    });
  });

  describe('Phase 30: Fallback for Invalid Sort Values', () => {
    it('falls back to discoveredAt DESC when an invalid sortBy string is passed', () => {
      const result = itemsRepo.getPaginated(mockDb, {
        sortBy: 'banana_invalid',
      });
      const selectSql = lastPreparedSql.find((s) => s.includes('SELECT') && !s.includes('COUNT(*)'))!;
      expect(selectSql).toContain('ORDER BY (items.discovered_at IS NULL), items.discovered_at DESC');

      const ids = result.items.map((i: any) => i.id);
      expect(ids[0]).toBe('item-b'); // Newest discovered
      expect(ids[ids.length - 1]).toBe('item-g'); // NULL discovered_at
    });
  });

  describe('Phase 31 & 32: NULL Handling & Deterministic Tie-Breaker', () => {
    it('always places NULL discovered_at items last and breaks ties deterministically by title and id', () => {
      const result = itemsRepo.getPaginated(mockDb, { categoryId: 'ps2' });

      // Both item-d and item-f have discovered_at = '2026-10-06T14:00:00Z'
      // Tie-breaker sorts 'Devil May Cry 3' (item-f) before 'God of War II' (item-d)
      expect(result.items[0].id).toBe('item-f');
      expect(result.items[1].id).toBe('item-d');
    });
  });

  describe('Phase 24: Pagination Stability', () => {
    it('paginates stably without gaps or duplicates across pages', () => {
      // Page 1 (limit 3)
      const page1 = itemsRepo.getPaginated(mockDb, { limit: 3, offset: 0 });
      // Page 2 (limit 3)
      const page2 = itemsRepo.getPaginated(mockDb, { limit: 3, offset: 3 });
      // Page 3 (limit 3)
      const page3 = itemsRepo.getPaginated(mockDb, { limit: 3, offset: 6 });

      const page1Ids = page1.items.map((i: any) => i.id);
      const page2Ids = page2.items.map((i: any) => i.id);
      const page3Ids = page3.items.map((i: any) => i.id);

      expect(page1Ids).toEqual(['item-b', 'item-f', 'item-d']);
      expect(page2Ids).toEqual(['item-c', 'item-e', 'item-a']);
      expect(page3Ids).toEqual(['item-g']);

      // No overlapping ids across pages
      const allIds = [...page1Ids, ...page2Ids, ...page3Ids];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(7);
    });
  });
});
