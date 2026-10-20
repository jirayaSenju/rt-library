import { describe, expect, it, vi } from 'vitest'

const { scanLibrary } = require('../../electron/scraper/scanEngine.cjs')
const { createExecutionPlan } = require('../../electron/scraper/executionPlan.cjs')

function createMockDb({ knownTopicIds = [], totalItemCount = 0 } = {}) {
  const writtenItems: any[] = []
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
      if (sql.includes('INSERT INTO items')) {
        return {
          run: vi.fn((params: any) => {
            writtenItems.push(params)
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
  }

  return db
}

describe('scanEngine (Universal Scraper Scan Engine)', () => {
  it('executes initial discovery on empty DB across pages without premature early stop', async () => {
    const db = createMockDb({ knownTopicIds: [], totalItemCount: 0 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch', full: false }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn()
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [
            { topicId: '1001', title: 'Mario Odyssey', url: 'https://rutracker.org/forum/viewtopic.php?t=1001', size: '5 GB' },
            { topicId: '1002', title: 'Zelda BOTW', url: 'https://rutracker.org/forum/viewtopic.php?t=1002', size: '14 GB' },
          ],
          pagination: { totalPages: 2 },
        })
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [
            { topicId: '1003', title: 'Metroid Dread', url: 'https://rutracker.org/forum/viewtopic.php?t=1003', size: '4 GB' },
          ],
          pagination: { totalPages: 2 },
        }),
    }

    const progressUpdates: any[] = []
    const result = await scanLibrary({
      transport,
      plan,
      db,
      onProgress: (p) => progressUpdates.push(p),
      pageDelayMs: 0,
    })

    expect(result.success).toBe(true)
    expect(result.totalItems).toBe(3)
    expect(result.newItems).toBe(3)
    expect(transport.fetchCategory).toHaveBeenCalledTimes(2)
    expect(db._appState.get('initial_scan_completed')).toBe('true')
    expect(progressUpdates[0]).toMatchObject({ currentPage: 0, totalPages: 0, status: 'scanning' })
    expect(progressUpdates.filter(p => p.status === 'scanning').map(p => p.currentPage)).toEqual([0, 0, 1, 1])
    expect(progressUpdates.filter(p => p.status === 'saving').map(p => p.currentPage)).toEqual([1, 2])
    expect(progressUpdates.at(-1)).toMatchObject({ currentPage: 2, totalPages: 2, status: 'category_completed' })
    expect(progressUpdates[0].categoryStatuses[0].status).toBe('in_progress')
  })

  it('triggers early stop on incremental scan after 3 consecutive known pages', async () => {
    const db = createMockDb({
      knownTopicIds: ['2001', '2002', '2003', '2004'],
      totalItemCount: 4,
    })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch', full: false }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn()
        // Page 1: all known
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [{ topicId: '2001', title: 'Game 1' }],
          pagination: { totalPages: 10 },
        })
        // Page 2: all known
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [{ topicId: '2002', title: 'Game 2' }],
          pagination: { totalPages: 10 },
        })
        // Page 3: all known -> early stop triggers!
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [{ topicId: '2003', title: 'Game 3' }],
          pagination: { totalPages: 10 },
        })
        // Page 4: should NOT be called
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [{ topicId: '2004', title: 'Game 4' }],
          pagination: { totalPages: 10 },
        }),
    }

    const logs: any[] = []
    const progressUpdates: any[] = []
    const result = await scanLibrary({
      transport,
      plan,
      db,
      onLog: (l) => logs.push(l),
      onProgress: (p) => progressUpdates.push(p),
      pageDelayMs: 0,
    })

    expect(result.success).toBe(true)
    expect(transport.fetchCategory).toHaveBeenCalledTimes(3)
    expect(logs.some(l => l.message.includes('Early stop triggered'))).toBe(true)
    expect(progressUpdates.at(-1)).toMatchObject({ currentPage: 3, totalPages: 10, status: 'category_completed_early_stop' })
  })

  it('stops cleanly and idempotently when cancelled', async () => {
    const db = createMockDb({ knownTopicIds: [], totalItemCount: 0 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    let cancelled = false
    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockImplementation(async () => {
        cancelled = true // User cancels after page 1 fetch
        return {
          status: 'FORUM_READY',
          topics: [{ topicId: '3001', title: 'Saved Game' }],
          pagination: { totalPages: 5 },
        }
      }),
    }

    const result = await scanLibrary({
      transport,
      plan,
      db,
      isCancelled: () => cancelled,
      pageDelayMs: 0,
    })

    expect(result.cancelled).toBe(true)
    expect(result.totalItems).toBe(1)
  })

  it('halts and throws when Cloudflare challenge is encountered', async () => {
    const db = createMockDb({ knownTopicIds: [], totalItemCount: 0 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockRejectedValue(Object.assign(new Error('INTERACTION_REQUIRED'), { code: 'INTERACTION_REQUIRED' })),
    }

    await expect(scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
    })).rejects.toMatchObject({ code: 'INTERACTION_REQUIRED', categoryId: 'switch' })
  })

  it('enriches new topics with fetchTopic when available on transport', async () => {
    const db = createMockDb({ knownTopicIds: [], totalItemCount: 0 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValueOnce({
        status: 'FORUM_READY',
        topics: [
          { topicId: '5001', title: 'Super Mario Wonder', url: 'https://rutracker.org/forum/viewtopic.php?t=5001' },
        ],
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockResolvedValueOnce({
        canonicalTitle: 'Super Mario Wonder',
        cover: 'https://image.com/mario.jpg',
        magnet: 'magnet:?xt=urn:btih:1111222233334444555566667777888899990000',
        screenshots: ['https://image.com/shot1.jpg'],
        developer: 'Nintendo',
        genre: 'Platformer',
      }),
    }

    const result = await scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
    })

    expect(result.success).toBe(true)
    expect(result.totalItems).toBe(1)
    expect(transport.fetchTopic).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: '5001' }),
      category
    )
    expect(db._writtenItems[0].coverUrl).toBe('https://image.com/mario.jpg')
    expect(db._writtenItems[0].developer).toBe('Nintendo')
  })

  it('pauses on challenge and resumes smoothly when onVerificationRequired resolves', async () => {
    const db = createMockDb({ knownTopicIds: [], totalItemCount: 0 })
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    })

    let challengeEncountered = false
    const transport = {
      name: 'MockEmbedded',
      fetchCategory: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('INTERACTION_REQUIRED'), { code: 'INTERACTION_REQUIRED' }))
        .mockResolvedValueOnce({
          status: 'FORUM_READY',
          topics: [{ topicId: '6001', title: 'Zelda Tears of the Kingdom' }],
          pagination: { totalPages: 1 },
        }),
    }

    const onVerificationRequired = vi.fn().mockImplementation(async () => {
      challengeEncountered = true
      return { resumed: true }
    })

    const result = await scanLibrary({
      transport,
      plan,
      db,
      onVerificationRequired,
      pageDelayMs: 0,
    })

    expect(challengeEncountered).toBe(true)
    expect(onVerificationRequired).toHaveBeenCalledWith(
      expect.objectContaining({ category, pageNum: 1 })
    )
    expect(result.success).toBe(true)
    expect(result.totalItems).toBe(1)
    expect(transport.fetchCategory).toHaveBeenCalledTimes(2)
  })
})
