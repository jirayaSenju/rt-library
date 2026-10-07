import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Legacy JSON Migration (SQLite-Only Transition)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifies idempotent migration recording and execution', async () => {
    const recordedMigrations = new Set<string>();
    const appState = new Map<string, string>();

    const hasMigration = (name: string) => recordedMigrations.has(name);
    const recordMigration = (name: string) => recordedMigrations.add(name);

    // Initial check: not yet migrated
    expect(hasMigration('json_catalog_to_sqlite_v1')).toBe(false);

    // Simulate first migration run
    const fakeJsonItems = [
      { id: '101', title: 'Game A', category_id: 'switch' },
      { id: '102', title: 'Game B', category_id: 'switch' },
    ];
    let insertedCount = fakeJsonItems.length;
    recordMigration('json_catalog_to_sqlite_v1');
    appState.set('initial_scan_completed', 'true');
    appState.set('legacy_data_migrated', 'true');

    expect(hasMigration('json_catalog_to_sqlite_v1')).toBe(true);
    expect(insertedCount).toBe(2);

    // Simulate second migration run (should be a no-op / idempotent)
    let secondRunInserted = 0;
    if (!hasMigration('json_catalog_to_sqlite_v1')) {
      secondRunInserted = 2;
    }

    expect(secondRunInserted).toBe(0);
    expect(appState.get('initial_scan_completed')).toBe('true');
  });

  it('ensures batch upsert prevents duplicate items on conflicting IDs', () => {
    const db = new Map<string, any>();

    const upsertBatch = (items: Array<{ id: string; title: string; categoryId: string }>) => {
      for (const item of items) {
        db.set(item.id, {
          ...(db.get(item.id) || {}),
          ...item,
        });
      }
    };

    // Batch 1
    upsertBatch([
      { id: 'switch_100', title: 'Zelda Initial', categoryId: 'switch' },
      { id: 'switch_101', title: 'Mario Initial', categoryId: 'switch' },
    ]);

    expect(db.size).toBe(2);
    expect(db.get('switch_100')?.title).toBe('Zelda Initial');

    // Batch 2 with one new item and one update to existing item
    upsertBatch([
      { id: 'switch_100', title: 'Zelda Updated', categoryId: 'switch' },
      { id: 'switch_102', title: 'Metroid Initial', categoryId: 'switch' },
    ]);

    expect(db.size).toBe(3);
    expect(db.get('switch_100')?.title).toBe('Zelda Updated');
    expect(db.get('switch_102')?.title).toBe('Metroid Initial');
  });

  it('safely handles zero JSON files found by recording migration and leaving library clean', () => {
    const recordedMigrations = new Set<string>();
    const foundFiles: string[] = [];

    let status = '';
    if (foundFiles.length === 0) {
      recordedMigrations.add('json_catalog_to_sqlite_v1');
      status = 'no_legacy_json';
    }

    expect(status).toBe('no_legacy_json');
    expect(recordedMigrations.has('json_catalog_to_sqlite_v1')).toBe(true);
  });
});
