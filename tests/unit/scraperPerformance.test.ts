import { describe, expect, it, vi, beforeEach } from 'vitest';

const { scanLibrary, COMPANION_TOPIC_CONCURRENCY } = require('../../electron/scraper/scanEngine.cjs');
const { createExecutionPlan } = require('../../electron/scraper/executionPlan.cjs');
const { BrowserCompanionBridge } = require('../../electron/scraper/browserCompanionBridge.cjs');

function createMockDb() {
  const writtenItems: any[] = [];
  const appState = new Map<string, string>();
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT topic_id FROM items')) {
        return { all: vi.fn(() => []) };
      }
      if (sql.includes('SELECT COUNT(*) as total FROM items')) {
        return { get: vi.fn(() => ({ total: writtenItems.length })) };
      }
      if (sql.includes('SELECT id FROM items WHERE id = ?')) {
        return { get: vi.fn((id: string) => writtenItems.find(i => i.id === id) || null) };
      }
      if (sql.includes('INSERT INTO items')) {
        return { run: vi.fn((params: any) => { writtenItems.push(params); return { changes: 1 }; }) };
      }
      if (sql.includes('INSERT INTO app_state')) {
        return { run: vi.fn((k: string, v: string) => appState.set(k, v)) };
      }
      return { get: vi.fn(() => null), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 1 })) };
    }),
    transaction: vi.fn((fn: (...args: any[]) => any) => (...args: any[]) => fn(...args)),
    _writtenItems: writtenItems,
  };
}

describe('V3-67 Scraper Performance & Concurrency', () => {
  it('defines default COMPANION_TOPIC_CONCURRENCY as 3', () => {
    expect(COMPANION_TOPIC_CONCURRENCY).toBe(3);
  });

  it('worker pool never exceeds max concurrency limit of 3', async () => {
    const db = createMockDb();
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    let currentActive = 0;
    let maxSeenActive = 0;

    const topics = Array.from({ length: 12 }, (_, i) => ({
      topicId: String(100 + i),
      title: `Topic ${i}`,
      url: `https://rutracker.org/forum/viewtopic.php?t=${100 + i}`,
    }));

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async (topic) => {
        currentActive++;
        maxSeenActive = Math.max(maxSeenActive, currentActive);
        // Small async delay to simulate network latency
        await new Promise(r => setTimeout(r, 20));
        currentActive--;
        return {
          canonicalTitle: topic.title,
          cover: `https://image.com/${topic.topicId}.jpg`,
          magnet: `magnet:?xt=urn:btih:000000000000000000000000000000000000000${topic.topicId}`,
        };
      }),
    };

    const result = await scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
    });

    expect(result.success).toBe(true);
    expect(result.totalItems).toBe(12);
    expect(maxSeenActive).toBeLessThanOrEqual(3);
    expect(maxSeenActive).toBeGreaterThanOrEqual(2);
  });

  it('handles out-of-order worker completions without data corruption', async () => {
    const db = createMockDb();
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    const topics = [
      { topicId: '101', title: 'Slow Topic 1', url: 'https://rutracker.org/forum/viewtopic.php?t=101' },
      { topicId: '102', title: 'Fast Topic 2', url: 'https://rutracker.org/forum/viewtopic.php?t=102' },
      { topicId: '103', title: 'Medium Topic 3', url: 'https://rutracker.org/forum/viewtopic.php?t=103' },
    ];

    const delays: Record<string, number> = { '101': 50, '102': 5, '103': 20 };

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async (topic) => {
        await new Promise(r => setTimeout(r, delays[topic.topicId] || 10));
        return {
          canonicalTitle: topic.title,
          cover: `https://cover/${topic.topicId}.jpg`,
        };
      }),
    };

    const progressUpdates: any[] = [];
    const result = await scanLibrary({
      transport,
      plan,
      db,
      onProgress: (p) => progressUpdates.push(p.detailsProcessed),
      pageDelayMs: 0,
    });

    expect(result.success).toBe(true);
    // All 3 items ingested into db
    expect(db._writtenItems.length).toBe(3);
    const item101 = db._writtenItems.find(i => i.id === 'topic_101');
    const item102 = db._writtenItems.find(i => i.id === 'topic_102');
    const item103 = db._writtenItems.find(i => i.id === 'topic_103');
    expect(item101.coverUrl).toBe('https://cover/101.jpg');
    expect(item102.coverUrl).toBe('https://cover/102.jpg');
    expect(item103.coverUrl).toBe('https://cover/103.jpg');

    // Progress counters are monotonic
    const progressList = progressUpdates.filter(Boolean);
    for (let i = 1; i < progressList.length; i++) {
      expect(progressList[i]).toBeGreaterThanOrEqual(progressList[i - 1]);
    }
  });

  it('verification challenge pauses queue and stops further worker dispatch', async () => {
    const db = createMockDb();
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    const topics = Array.from({ length: 10 }, (_, i) => ({
      topicId: String(200 + i),
      title: `Topic ${i}`,
      url: `https://rutracker.org/forum/viewtopic.php?t=${200 + i}`,
    }));

    let callCount = 0;
    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async (topic) => {
        callCount++;
        if (topic.topicId === '201') {
          const err = new Error('INTERACTION_REQUIRED');
          (err as any).code = 'INTERACTION_REQUIRED';
          throw err;
        }
        await new Promise(r => setTimeout(r, 10));
        return { canonicalTitle: topic.title };
      }),
    };

    await expect(scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
    })).rejects.toMatchObject({ code: 'INTERACTION_REQUIRED' });

    // Stopped dispatching subsequent topics in queue
    expect(callCount).toBeLessThan(10);
  });

  it('bridge supports multiple concurrent in-flight requests cleanly', async () => {
    const bridge = new BrowserCompanionBridge({
      appVersion: '1.0.0',
      onPage: async () => ({ status: 'FORUM_READY', topicCount: 1 }),
    });
    await bridge.start();

    // Emulate handshake
    const resHello = await fetch(`http://127.0.0.1:${bridge.port}/v1/hello`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bridge.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ protocolVersion: 1, extensionVersion: '1.0.0' }),
    });
    const welcome = await resHello.json();
    const sessionId = welcome.sessionId;

    // Dispatch 3 concurrent topic requests
    const p1 = bridge.requestPage({ kind: 'topic', topicId: '1', url: 'https://rutracker.org/forum/viewtopic.php?t=1' });
    const p2 = bridge.requestPage({ kind: 'topic', topicId: '2', url: 'https://rutracker.org/forum/viewtopic.php?t=2' });
    const p3 = bridge.requestPage({ kind: 'topic', topicId: '3', url: 'https://rutracker.org/forum/viewtopic.php?t=3' });

    expect(bridge.pending.size).toBe(3);
    expect(bridge.queue.length).toBe(3);

    // Consume 3 commands
    const c1 = (await (await fetch(`http://127.0.0.1:${bridge.port}/v1/commands`, {
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1' },
    })).json()).command;

    const c2 = (await (await fetch(`http://127.0.0.1:${bridge.port}/v1/commands`, {
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1' },
    })).json()).command;

    const c3 = (await (await fetch(`http://127.0.0.1:${bridge.port}/v1/commands`, {
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1' },
    })).json()).command;

    expect(c1.topicId).toBe('1');
    expect(c2.topicId).toBe('2');
    expect(c3.topicId).toBe('3');

    // Deliver responses out of order (c3 first, then c1, then c2)
    await fetch(`http://127.0.0.1:${bridge.port}/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, requestId: c3.requestId, url: c3.url, html: '<html><body>Title 3</body></html>', httpStatus: 200 }),
    });

    await fetch(`http://127.0.0.1:${bridge.port}/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, requestId: c1.requestId, url: c1.url, html: '<html><body>Title 1</body></html>', httpStatus: 200 }),
    });

    await fetch(`http://127.0.0.1:${bridge.port}/v1/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bridge.token}`, 'x-rt-session': sessionId, 'x-rt-protocol': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, requestId: c2.requestId, url: c2.url, html: '<html><body>Title 2</body></html>', httpStatus: 200 }),
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.status).toBe('FORUM_READY');
    expect(r2.status).toBe('FORUM_READY');
    expect(r3.status).toBe('FORUM_READY');
    expect(bridge.pending.size).toBe(0);

    await bridge.stop();
  });
});
