import { describe, expect, it, vi } from 'vitest'

const { scanLibrary } = require('../../electron/scraper/scanEngine.cjs')
const { createExecutionPlan } = require('../../electron/scraper/executionPlan.cjs')
const { normalizeItem } = require('../../electron/indexer/normalize.cjs')

function createMockDb({ knownTopicIds = [], totalItemCount = 0, initialItems = [] } = {}) {
  const writtenItems: any[] = [...initialItems]
  const itemDetails: any[] = []
  const appState = new Map<string, string>()

  const db = {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT topic_id FROM items')) {
        return {
          all: vi.fn(() => knownTopicIds.map(id => ({ topic_id: id }))),
        }
      }
      if (sql.includes('SELECT COUNT(*) as total FROM items')) {
        return {
          get: vi.fn(() => ({ total: totalItemCount + writtenItems.length })),
        }
      }
      if (sql.includes('SELECT id FROM items WHERE id = ?')) {
        return {
          get: vi.fn((id: string) => writtenItems.find(i => i.id === id) || null),
        }
      }
      if (sql.includes('getItemsNeedingDetailEnrichment') || (sql.includes('FROM items i') && sql.includes('LEFT JOIN item_details d'))) {
        return {
          all: vi.fn((_catId: string, ...rest: any[]) => {
            const hasTopicIn = sql.includes('topic_id IN');
            const passedTopicIds = hasTopicIn ? rest.slice(0, rest.length - 1) : null;
            return writtenItems
              .filter(i => {
                if (passedTopicIds && !passedTopicIds.includes(i.topicId)) return false;
                return !i.hasScreenshots || !i.sizeBytes;
              })
              .map(i => ({
                id: i.id,
                categoryId: i.categoryId,
                source: i.source || 'rutracker',
                topicId: i.topicId,
                title: i.title,
                url: i.url,
                sizeStr: i.sizeStr,
                sizeBytes: i.sizeBytes,
                hasScreenshots: i.hasScreenshots,
              }));
          }),
        };
      }
      if (sql.includes('INSERT INTO items')) {
        return {
          run: vi.fn((params: any) => {
            const existingIndex = writtenItems.findIndex(i => i.id === params.id)
            if (existingIndex >= 0) {
              writtenItems[existingIndex] = { ...writtenItems[existingIndex], ...params }
            } else {
              writtenItems.push(params)
            }
            return { changes: 1 }
          }),
        }
      }
      if (sql.includes('INSERT INTO item_details')) {
        return {
          run: vi.fn((params: any) => {
            const existingIndex = itemDetails.findIndex(d => d.itemId === params.itemId)
            if (existingIndex >= 0) {
              itemDetails[existingIndex] = { ...itemDetails[existingIndex], ...params }
            } else {
              itemDetails.push(params)
            }
            return { changes: 1 }
          }),
        }
      }
      if (sql.includes('INSERT INTO app_state')) {
        return {
          run: vi.fn((key: string, val: string) => {
            appState.set(key, val)
          }),
        }
      }
      return {
        get: vi.fn(() => null),
        all: vi.fn(() => []),
        run: vi.fn(() => ({ changes: 1 })),
      }
    }),
    transaction: vi.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args)),
    _appState: appState,
    _writtenItems: writtenItems,
    _itemDetails: itemDetails,
  }

  return db
}

describe('Post-Scan Detail Enrichment for Newly Added Items', () => {
  it('correctly normalizes string fileList into array and preserves screenshots & exact sizeBytes', () => {
    const raw = {
      topicId: '9999',
      title: 'The Legend of Zelda: Echoes of Wisdom',
      fileList: 'Echoes of Wisdom [0100646019E7A000][v0].nsp\nUpdate [0100646019E7A800][v65536].nsp',
      screenshots: [
        'https://image.tracker/screen1.jpg',
        'https://image.tracker/screen2.jpg',
      ],
      size: '5.8 GB',
      sizeBytes: 6228539392,
    }

    const item = normalizeItem(raw, 'switch', 'Nintendo Switch')
    expect(item).not.toBeNull()
    expect(Array.isArray(item.details.fileList)).toBe(true)
    expect(item.details.fileList).toHaveLength(2)
    expect(item.details.fileList[0]).toBe('Echoes of Wisdom [0100646019E7A000][v0].nsp')
    expect(item.details.fileList[1]).toBe('Update [0100646019E7A800][v65536].nsp')
    expect(item.details.fileCount).toBe(2)
    expect(item.sizeStr).toBe('5.8 GB')
    expect(item.sizeBytes).toBe(6228539392)
    expect(item.details.screenshots).toHaveLength(2)
  })

  it('scans screenshots, item size, and file list for newly added items after normal scan without full scan', async () => {
    const db = createMockDb({ knownTopicIds: ['2001', '2002'], totalItemCount: 2 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch', full: false }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValueOnce({
        status: 'FORUM_READY',
        topics: [
          // 1 new item, 2 known items
          { topicId: '2003', title: 'Sonic X Shadow Generations', url: 'https://rutracker.org/forum/viewtopic.php?t=2003', sizeStr: '12.4 GB' },
          { topicId: '2001', title: 'Old Game 1', url: 'https://rutracker.org/forum/viewtopic.php?t=2001', sizeStr: '4.0 GB' },
          { topicId: '2002', title: 'Old Game 2', url: 'https://rutracker.org/forum/viewtopic.php?t=2002', sizeStr: '8.0 GB' },
        ],
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockResolvedValueOnce({
        canonicalTitle: 'Sonic X Shadow Generations',
        cover: 'https://img.host/sonic_cover.jpg',
        screenshots: ['https://img.host/sonic_shot1.jpg', 'https://img.host/sonic_shot2.jpg'],
        size: '12.4 GB',
        sizeBytes: 13314398617,
        fileList: 'Sonic X Shadow.nsp\nDay One Patch.nsp',
        developer: 'Sonic Team',
        publisher: 'SEGA',
      }),
    }

    const progressStatuses: string[] = []
    const result = await scanLibrary({
      transport,
      plan,
      db,
      onProgress: (p) => {
        if (p.status) progressStatuses.push(p.status)
      },
      pageDelayMs: 0,
    })

    expect(result.success).toBe(true)
    expect(transport.fetchCategory).toHaveBeenCalledTimes(1)
    expect(transport.fetchTopic).toHaveBeenCalledTimes(1)
    expect(transport.fetchTopic).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: '2003' }),
      category
    )

    // Check enriched data in mock db
    const enrichedItem = db._writtenItems.find(i => i.topicId === '2003')
    expect(enrichedItem).toBeDefined()
    expect(enrichedItem.hasScreenshots).toBe(1)
    expect(enrichedItem.sizeBytes).toBe(13314398617)
    expect(enrichedItem.coverUrl).toBe('https://img.host/sonic_cover.jpg')
    expect(enrichedItem.developer).toBe('Sonic Team')

    // Check details
    const enrichedDetails = db._itemDetails.find(d => d.itemId === enrichedItem.id)
    expect(enrichedDetails).toBeDefined()
    expect(JSON.parse(enrichedDetails.fileListJson)).toEqual(['Sonic X Shadow.nsp', 'Day One Patch.nsp'])
    expect(JSON.parse(enrichedDetails.screenshotsJson)).toHaveLength(2)
  })

  it('runs post-scan detail enrichment for newly added items that lacked details without triggering full scan', async () => {
    // Simulate: an item was newly discovered but inline detail fetch was skipped (e.g. temporary network error or basic ingestion)
    const db = createMockDb({
      knownTopicIds: [],
      totalItemCount: 0,
    })

    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch', full: false }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    let fetchTopicCallCount = 0
    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValueOnce({
        status: 'FORUM_READY',
        topics: [
          { topicId: '3001', title: 'Mario Party Jamboree', url: 'https://rutracker.org/forum/viewtopic.php?t=3001', sizeStr: '6.5 GB' },
        ],
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async () => {
        fetchTopicCallCount++
        if (fetchTopicCallCount === 1) {
          // Inline fetch fails / returns empty object (basic listing ingested)
          return {}
        }
        // Post-scan enrichment succeeds
        return {
          canonicalTitle: 'Super Mario Party Jamboree',
          cover: 'https://img.host/jamboree.jpg',
          screenshots: ['https://img.host/jamboree_shot1.jpg'],
          size: '6.5 GB',
          sizeBytes: 6979321856,
          fileList: 'Super Mario Party Jamboree.nsp',
        }
      }),
    }

    const logs: string[] = []
    const result = await scanLibrary({
      transport,
      plan,
      db,
      onLog: (l) => logs.push(l.message),
      pageDelayMs: 0,
    })

    expect(result.success).toBe(true)
    // Post-scan enrichment picked up newly added topic 3001 and enriched it
    expect(transport.fetchTopic).toHaveBeenCalledTimes(2)
    expect(transport.fetchTopic).toHaveBeenLastCalledWith(
      expect.objectContaining({ topicId: '3001' }),
      category
    )

    const updatedItem = db._writtenItems.find(i => i.topicId === '3001')
    expect(updatedItem.hasScreenshots).toBe(1)
    expect(updatedItem.sizeBytes).toBe(6979321856)
    expect(logs.some(m => m.includes('starting post-scan enrichment'))).toBe(true)
  })
})
