import { describe, expect, it, vi } from 'vitest'
const { BrowserCompanionTransport } = require('../../electron/scraper/browserCompanionTransport.cjs')

describe('BrowserCompanionTransport', () => {
  it('reports availability based on bridge connection', () => {
    const mockBridge = { getConnection: () => ({ connected: true, port: 1234, token: 'abc' }) }
    const transport = new BrowserCompanionTransport(mockBridge)
    expect(transport.isAvailable()).toBe(true)
    expect(transport.getStatus()).toEqual({
      id: 'BROWSER_COMPANION',
      name: 'Browser Companion',
      connected: true,
      port: 1234,
      token: 'abc',
    })
  })

  it('formats category pagination url and calls bridge.requestPage', async () => {
    const requestPageMock = vi.fn().mockResolvedValue({
      status: 'FORUM_READY',
      httpStatus: 200,
      bytes: 1024,
      parsed: {
        topics: [{ topicId: '123', title: 'Halo 2' }],
        pagination: { totalPages: 5 },
      },
    })
    const transport = new BrowserCompanionTransport({
      getConnection: () => ({ connected: true }),
      requestPage: requestPageMock,
    })

    const category = { id: 'xbox', name: 'Xbox', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=887' }
    const page1 = await transport.fetchCategory(category, 1)
    expect(requestPageMock).toHaveBeenCalledWith({
      kind: 'category',
      categoryId: 'xbox',
      url: 'https://rutracker.org/forum/viewforum.php?f=887',
      pageNum: 1,
    })
    expect(page1.topics).toHaveLength(1)
    expect(page1.pagination.totalPages).toBe(5)

    const page2 = await transport.fetchCategory(category, 2)
    expect(requestPageMock).toHaveBeenCalledWith({
      kind: 'category',
      categoryId: 'xbox',
      url: 'https://rutracker.org/forum/viewforum.php?f=887&start=50',
      pageNum: 2,
    })
  })

  it('throws INTERACTION_REQUIRED on Cloudflare challenge', async () => {
    const transport = new BrowserCompanionTransport({
      getConnection: () => ({ connected: true }),
      requestPage: vi.fn().mockResolvedValue({
        status: 'CHALLENGE_REQUIRED',
        httpStatus: 403,
      }),
    })

    const category = { id: 'switch', name: 'Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' }
    await expect(transport.fetchCategory(category, 1)).rejects.toThrow(/INTERACTION_REQUIRED/)
  })

  it('forwards cancel call to bridge.cancel', () => {
    const cancelMock = vi.fn()
    const transport = new BrowserCompanionTransport({
      getConnection: () => ({ connected: true }),
      cancel: cancelMock,
    })
    transport.cancel()
    expect(cancelMock).toHaveBeenCalled()
  })
})

