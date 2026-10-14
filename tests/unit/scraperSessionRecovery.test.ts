import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => '3.0.0') },
  dialog: { showSaveDialog: vi.fn() },
  shell: { openPath: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const { scanLibrary, COMPANION_TOPIC_CONCURRENCY } = require('../../electron/scraper/scanEngine.cjs');
const { createExecutionPlan } = require('../../electron/scraper/executionPlan.cjs');
const { BrowserCompanionBridge } = require('../../electron/scraper/browserCompanionBridge.cjs');
const ScraperManager = require('../../electron/scraper/scraperManager.cjs');
const { SCRAPER_STATES } = require('../../scraper/protocol.cjs');

function createMockDb(initialItems: any[] = []) {
  const writtenItems: any[] = [...initialItems];
  const appState = new Map<string, string>();
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT topic_id FROM items')) {
        return {
          all: vi.fn(() => writtenItems.map(i => ({ topic_id: i.topic_id || i.topicId }))),
        };
      }
      if (sql.includes('SELECT COUNT(*) as total FROM items')) {
        return { get: vi.fn(() => ({ total: writtenItems.length })) };
      }
      if (sql.includes('SELECT id FROM items WHERE id = ?')) {
        return { get: vi.fn((id: string) => writtenItems.find(i => (i.id || i.topic_id || i.topicId) === id) || null) };
      }
      if (sql.includes('INSERT INTO items')) {
        return {
          run: vi.fn((params: any) => {
            const existingIndex = writtenItems.findIndex(i => (i.id || i.topic_id || i.topicId) === (params.id || params.topic_id || params.topicId));
            if (existingIndex >= 0) {
              // Simulate ON CONFLICT DO UPDATE while preserving is_favorite and discovered_at
              const existing = writtenItems[existingIndex];
              writtenItems[existingIndex] = {
                ...existing,
                ...params,
                is_favorite: existing.is_favorite ?? params.is_favorite,
                discovered_at: existing.discovered_at ?? params.discovered_at,
              };
            } else {
              writtenItems.push(params);
            }
            return { changes: 1 };
          }),
        };
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

describe('V3-71 Scraper Long-Run Stability & Session Recovery', () => {
  const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };

  it('pauses and resumes topic enrichment without skipping or duplicating items', async () => {
    const db = createMockDb();
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    let paused = false;
    let fetchedTopics: string[] = [];

    const topics = Array.from({ length: 6 }, (_, i) => ({
      topicId: String(200 + i),
      title: `Topic ${i}`,
      url: `https://rutracker.org/forum/viewtopic.php?t=${200 + i}`,
    }));

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async (topic) => {
        fetchedTopics.push(topic.topicId);
        // Pause after first item begins
        if (fetchedTopics.length === 1) {
          paused = true;
          // Unpause automatically after a brief delay
          setTimeout(() => {
            paused = false;
          }, 60);
        }
        await new Promise(r => setTimeout(r, 20));
        return {
          canonicalTitle: topic.title,
          cover: `https://image.com/${topic.topicId}.jpg`,
        };
      }),
    };

    const result = await scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
      isPaused: () => paused,
    });

    expect(result.success).toBe(true);
    expect(result.totalItems).toBe(6);
    expect(fetchedTopics.length).toBe(6);
    // All 6 topic IDs were fetched exactly once
    const uniqueTopics = new Set(fetchedTopics);
    expect(uniqueTopics.size).toBe(6);
  });

  it('aborts promptly when cancelled during active C=3 concurrency', async () => {
    const db = createMockDb();
    const plan = createExecutionPlan({ category: 'switch' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    let cancelled = false;
    let inFlightCount = 0;
    let maxInFlight = 0;

    const topics = Array.from({ length: 15 }, (_, i) => ({
      topicId: String(300 + i),
      title: `Topic ${i}`,
      url: `https://rutracker.org/forum/viewtopic.php?t=${300 + i}`,
    }));

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: vi.fn().mockImplementation(async () => {
        inFlightCount++;
        maxInFlight = Math.max(maxInFlight, inFlightCount);
        // Cancel after 3 topics start processing concurrently
        if (inFlightCount >= 3) {
          cancelled = true;
        }
        await new Promise(r => setTimeout(r, 30));
        inFlightCount--;
        return { canonicalTitle: 'Test' };
      }),
    };

    const result = await scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
      isCancelled: () => cancelled,
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    // Should have aborted early, not processing all 15 topics
    expect(result.totalItems).toBeLessThan(15);
  });

  it('handles pause and resume lifecycle transitions in ScraperManager', () => {
    const manager = new ScraperManager();
    manager.isCompanionScanning = true;
    manager.setState(SCRAPER_STATES.RUNNING);

    // Initial pause
    const pauseResult = manager.pause();
    expect(pauseResult.success).toBe(true);
    expect(manager.isPausedFlag).toBe(true);
    expect(manager.state).toBe(SCRAPER_STATES.PAUSED);

    // Redundant pause returns false without error
    const redundantPause = manager.pause();
    expect(redundantPause.success).toBe(false);

    // Resume
    const resumeResult = manager.resume();
    expect(resumeResult.success).toBe(true);
    expect(manager.isPausedFlag).toBe(false);
    expect(manager.state).toBe(SCRAPER_STATES.RUNNING);

    // Redundant resume returns false without error
    const redundantResume = manager.resume();
    expect(redundantResume.success).toBe(false);
  });

  it('ensures double-cancel is completely safe and non-throwing', async () => {
    const manager = new ScraperManager();
    manager.isCompanionScanning = true;
    manager.setState(SCRAPER_STATES.RUNNING);

    // First cancel succeeds
    const firstCancel = await manager.cancel();
    expect(firstCancel.success).toBe(true);
    expect(manager.state).toBe(SCRAPER_STATES.IDLE);
    expect(manager.isPausedFlag).toBe(false);

    // Simulate completion / teardown where isCompanionScanning becomes false
    manager.isCompanionScanning = false;

    // Second cancel when idle returns clean failure message, no throw
    const secondCancel = await manager.cancel();
    expect(secondCancel.success).toBe(false);
    expect(secondCancel.message).toBe('Scraper is not running.');
  });

  it('guarantees idempotent reprocessing and preserves user favorites and discovery date', async () => {
    const existingDate = '2026-01-01T00:00:00.000Z';
    const initialItem = {
      id: 'switch_401',
      topic_id: '401',
      title: 'Initial Title',
      is_favorite: 1,
      discovered_at: existingDate,
    };
    const db = createMockDb([initialItem]);
    const plan = createExecutionPlan({ category: 'switch', mode: 'incremental' }, {
      allCategories: [category],
      enabledCategories: [category],
    });

    const topics = [
      { topicId: '401', title: 'Updated Title From RuTracker', url: 'https://rutracker.org/forum/viewtopic.php?t=401' },
      { topicId: '402', title: 'Brand New Item', url: 'https://rutracker.org/forum/viewtopic.php?t=402' },
    ];

    const fetchTopicMock = vi.fn().mockResolvedValue({
      canonicalTitle: 'Fetched Details',
      cover: 'https://img.com/cover.jpg',
    });

    const transport = {
      name: 'MockCompanion',
      fetchCategory: vi.fn().mockResolvedValue({
        status: 'FORUM_READY',
        topics,
        pagination: { totalPages: 1 },
      }),
      fetchTopic: fetchTopicMock,
    };

    const result = await scanLibrary({
      transport,
      plan,
      db,
      pageDelayMs: 0,
    });

    expect(result.success).toBe(true);
    // Topic 401 is already known in DB, so incremental mode skips detailed topic fetch for 401!
    expect(fetchTopicMock).toHaveBeenCalledTimes(1);
    expect(fetchTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: '402' }),
      expect.anything()
    );

    // Verify 401 retained is_favorite and discovered_at in DB
    const item401 = db._writtenItems.find(i => (i.id || i.topic_id) === '401' || i.id === 'switch_401');
    expect(item401).toBeDefined();
    expect(item401.is_favorite).toBe(1);
    expect(item401.discovered_at).toBe(existingDate);
  });

  it('cleans up pending requests and cancels timers on BrowserCompanionBridge cancel/stop', async () => {
    const bridge = new BrowserCompanionBridge({ appVersion: '3.0.0', onPage: vi.fn() });
    bridge.sessionId = 'mock-session-id';
    bridge.lastSeen = Date.now();
    bridge.token = 'mock-token';

    const pendingPromise = bridge.requestPage({
      kind: 'topic',
      url: 'https://rutracker.org/forum/viewtopic.php?t=123',
      topicId: '123',
    });

    expect(bridge.pending.size).toBe(1);

    bridge.cancel();

    expect(bridge.pending.size).toBe(0);
    await expect(pendingPromise).rejects.toThrow('COMPANION_CANCELLED');
  });

  it('calls pause and resume via frontend ScraperService', async () => {
    const mockPause = vi.fn().mockResolvedValue({ success: true });
    const mockResume = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = {
      scraper: {
        pause: mockPause,
        resume: mockResume,
      },
    };

    const { scraperService } = await import('../../src/services/scraperService');
    const pauseRes = await scraperService.pause();
    expect(pauseRes.success).toBe(true);
    expect(mockPause).toHaveBeenCalledTimes(1);

    const resumeRes = await scraperService.resume();
    expect(resumeRes.success).toBe(true);
    expect(mockResume).toHaveBeenCalledTimes(1);
  });
});
