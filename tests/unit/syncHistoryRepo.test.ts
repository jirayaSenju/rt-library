import { describe, expect, it, beforeEach, vi } from 'vitest';

const syncHistoryRepo = require('../../electron/database/repositories/syncHistoryRepo.cjs');

function createMockSyncDb() {
  const syncRuns = new Map<string, any>();
  const syncRunCategories = new Map<string, any>();

  const db: any = {
    _syncRuns: syncRuns,
    _syncRunCategories: syncRunCategories,
    pragma: vi.fn((pragmaName: string) => {
      if (pragmaName.includes('user_version')) return 6;
      if (pragmaName.includes('integrity_check')) return 'ok';
      return null;
    }),
    prepare: vi.fn((sql: string) => {
      // 1. INSERT INTO sync_runs
      if (sql.includes('INSERT INTO sync_runs')) {
        return {
          run: vi.fn((params: any) => {
            syncRuns.set(params.id, {
              id: params.id,
              started_at: params.startedAt,
              status: params.status || 'RUNNING',
              mode: params.mode,
              transport: params.transport,
              scope_type: params.scopeType,
              scope_category_id: params.scopeCategoryId,
              trigger_type: params.triggerType,
              categories_total: params.categoriesTotal || 0,
              categories_completed: 0,
              topics_found: 0,
              new_items: 0,
              updated_items: 0,
              known_items: 0,
              saved_items: 0,
              failed_items: 0,
              duration_ms: 0,
              cancelled_by_user: 0,
              verification_required: 0,
              error_code: null,
              error_summary: null,
            });
            return { changes: 1 };
          }),
        };
      }

      // 2. UPDATE sync_runs SET ... WHERE id = @id
      if (sql.includes('UPDATE sync_runs SET') && sql.includes('WHERE id = @id')) {
        return {
          run: vi.fn((params: any) => {
            const existing = syncRuns.get(params.id);
            if (existing) {
              if (params.categoriesCompleted != null) existing.categories_completed = params.categoriesCompleted;
              if (params.topicsFound != null) existing.topics_found = params.topicsFound;
              if (params.newItems != null) existing.new_items = params.newItems;
              if (params.updatedItems != null) existing.updated_items = params.updatedItems;
              if (params.knownItems != null) existing.known_items = params.knownItems;
              if (params.savedItems != null) existing.saved_items = params.savedItems;
              if (params.failedItems != null) existing.failed_items = params.failedItems;
              if (params.durationMs != null) existing.duration_ms = params.durationMs;
              if (params.verificationRequired != null) existing.verification_required = params.verificationRequired ? 1 : 0;
              if (params.finishedAt != null) existing.finished_at = params.finishedAt;
              if (params.status != null) existing.status = params.status;
              if (params.cancelledByUser != null) existing.cancelled_by_user = params.cancelledByUser ? 1 : 0;
              if (params.errorCode !== undefined) existing.error_code = params.errorCode;
              if (params.errorSummary !== undefined) existing.error_summary = params.errorSummary;
            }
            return { changes: 1 };
          }),
        };
      }

      // 3. INSERT INTO sync_run_categories ... ON CONFLICT
      if (sql.includes('INSERT INTO sync_run_categories')) {
        return {
          run: vi.fn((params: any) => {
            const existing = syncRunCategories.get(params.id) || {};
            syncRunCategories.set(params.id, {
              ...existing,
              id: params.id,
              sync_run_id: params.syncRunId,
              category_id: params.categoryId,
              category_name_snapshot: params.categoryNameSnapshot || existing.category_name_snapshot,
              started_at: params.startedAt || existing.started_at,
              finished_at: params.finishedAt !== undefined ? params.finishedAt : existing.finished_at,
              status: params.status || existing.status || 'RUNNING',
              pages_processed: params.pagesProcessed != null ? params.pagesProcessed : existing.pages_processed || 0,
              total_pages: params.totalPages != null ? params.totalPages : existing.total_pages || 0,
              topics_found: params.topicsFound != null ? params.topicsFound : existing.topics_found || 0,
              new_items: params.newItems != null ? params.newItems : existing.new_items || 0,
              updated_items: params.updatedItems != null ? params.updatedItems : existing.updated_items || 0,
              known_items: params.knownItems != null ? params.knownItems : existing.known_items || 0,
              saved_items: params.savedItems != null ? params.savedItems : existing.saved_items || 0,
              duration_ms: params.durationMs != null ? params.durationMs : existing.duration_ms || 0,
              error_code: params.errorCode !== undefined ? params.errorCode : existing.error_code || null,
              error_summary: params.errorSummary !== undefined ? params.errorSummary : existing.error_summary || null,
            });
            return { changes: 1 };
          }),
        };
      }

      // 4. cleanupInterruptedRuns: UPDATE sync_runs SET status = 'INTERRUPTED'
      if (sql.includes("status = 'INTERRUPTED'") && sql.includes('UPDATE sync_runs')) {
        return {
          run: vi.fn((nowTs: string) => {
            let changes = 0;
            for (const r of syncRuns.values()) {
              if (r.status === 'RUNNING' || r.status === 'CANCELLING') {
                r.status = 'INTERRUPTED';
                r.finished_at = r.finished_at || nowTs;
                r.error_summary = r.error_summary || 'Application closed during synchronization';
                changes++;
              }
            }
            return { changes };
          }),
        };
      }

      // 5. cleanupInterruptedRuns: UPDATE sync_run_categories SET status = 'INTERRUPTED'
      if (sql.includes("status = 'INTERRUPTED'") && sql.includes('UPDATE sync_run_categories')) {
        return {
          run: vi.fn((nowTs: string) => {
            let changes = 0;
            for (const c of syncRunCategories.values()) {
              if (c.status === 'RUNNING') {
                c.status = 'INTERRUPTED';
                c.finished_at = c.finished_at || nowTs;
                c.error_summary = c.error_summary || 'Application closed during synchronization';
                changes++;
              }
            }
            return { changes };
          }),
        };
      }

      // 6. COUNT(*) from sync_runs
      if (sql.includes('SELECT COUNT(*) AS total FROM sync_runs')) {
        return {
          get: vi.fn((...args: any[]) => {
            const list = Array.from(syncRuns.values());
            if (sql.includes("status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')")) {
              return { total: list.filter(r => ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(r.status)).length };
            }
            if (sql.includes("status = 'COMPLETED_WITH_WARNINGS'")) {
              return { total: list.filter(r => r.status === 'COMPLETED_WITH_WARNINGS').length };
            }
            if (sql.includes("status IN ('FAILED', 'INTERRUPTED')")) {
              return { total: list.filter(r => ['FAILED', 'INTERRUPTED'].includes(r.status)).length };
            }
            if (sql.includes("status = 'CANCELLED'")) {
              return { total: list.filter(r => r.status === 'CANCELLED').length };
            }
            if (sql.includes('WHERE status = ?')) {
              return { total: list.filter(r => r.status === args[0]).length };
            }
            return { total: list.length };
          }),
        };
      }

      // 7. SELECT from sync_runs WHERE id = ?
      if (sql.includes('SELECT') && sql.includes('FROM sync_runs') && sql.includes('WHERE id = ?')) {
        return {
          get: vi.fn((id: string) => {
            const r = syncRuns.get(id);
            if (!r) return null;
            return {
              id: r.id,
              startedAt: r.started_at,
              finishedAt: r.finished_at || null,
              status: r.status,
              mode: r.mode,
              transport: r.transport,
              scopeType: r.scope_type,
              scopeCategoryId: r.scope_category_id,
              triggerType: r.trigger_type,
              categoriesTotal: r.categories_total,
              categoriesCompleted: r.categories_completed,
              topicsFound: r.topics_found,
              newItems: r.new_items,
              updatedItems: r.updated_items,
              knownItems: r.known_items,
              savedItems: r.saved_items,
              failedItems: r.failed_items,
              durationMs: r.duration_ms,
              cancelledByUser: r.cancelled_by_user,
              verificationRequired: r.verification_required,
              errorCode: r.error_code,
              errorSummary: r.error_summary,
            };
          }),
        };
      }

      // 8. SELECT sync_run_categories WHERE sync_run_id = ?
      if (sql.includes('FROM sync_run_categories') && sql.includes('WHERE sync_run_id = ?')) {
        return {
          all: vi.fn((runId: string) => {
            const list = Array.from(syncRunCategories.values()).filter(c => c.sync_run_id === runId);
            return list.map(c => ({
              id: c.id,
              syncRunId: c.sync_run_id,
              categoryId: c.category_id,
              categoryNameSnapshot: c.category_name_snapshot,
              startedAt: c.started_at,
              finishedAt: c.finished_at || null,
              status: c.status,
              pagesProcessed: c.pages_processed,
              totalPages: c.total_pages,
              topicsFound: c.topics_found,
              newItems: c.new_items,
              updatedItems: c.updated_items,
              knownItems: c.known_items,
              savedItems: c.saved_items,
              durationMs: c.duration_ms,
              errorCode: c.error_code,
              errorSummary: c.error_summary,
            }));
          }),
        };
      }

      // 9. Paginated getRuns
      if (sql.includes('FROM sync_runs') && sql.includes('LIMIT ? OFFSET ?')) {
        return {
          all: vi.fn((...args: any[]) => {
            let list = Array.from(syncRuns.values());
            if (sql.includes("status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')")) {
              list = list.filter(r => ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(r.status));
            } else if (sql.includes("status = 'COMPLETED_WITH_WARNINGS'")) {
              list = list.filter(r => r.status === 'COMPLETED_WITH_WARNINGS');
            } else if (sql.includes("status IN ('FAILED', 'INTERRUPTED')")) {
              list = list.filter(r => ['FAILED', 'INTERRUPTED'].includes(r.status));
            } else if (sql.includes("status = 'CANCELLED'")) {
              list = list.filter(r => r.status === 'CANCELLED');
            }

            list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            const limit = args[args.length - 2];
            const offset = args[args.length - 1];
            const sliced = list.slice(offset, offset + limit);

            return sliced.map(r => ({
              id: r.id,
              startedAt: r.started_at,
              finishedAt: r.finished_at || null,
              status: r.status,
              mode: r.mode,
              transport: r.transport,
              scopeType: r.scope_type,
              scopeCategoryId: r.scope_category_id,
              triggerType: r.trigger_type,
              categoriesTotal: r.categories_total,
              categoriesCompleted: r.categories_completed,
              topicsFound: r.topics_found,
              newItems: r.new_items,
              updatedItems: r.updated_items,
              knownItems: r.known_items,
              savedItems: r.saved_items,
              failedItems: r.failed_items,
              durationMs: r.duration_ms,
              cancelledByUser: r.cancelled_by_user,
              verificationRequired: r.verification_required,
              errorCode: r.error_code,
              errorSummary: r.error_summary,
            }));
          }),
        };
      }

      // 10. Last successful sync in getSyncHealth
      if (sql.includes("status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')") && sql.includes('ORDER BY finished_at DESC') && sql.includes('LIMIT 1')) {
        return {
          get: vi.fn(() => {
            const successes = Array.from(syncRuns.values()).filter(r => ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(r.status));
            successes.sort((a, b) => new Date(b.finished_at || 0).getTime() - new Date(a.finished_at || 0).getTime());
            const r = successes[0];
            if (!r) return null;
            return {
              id: r.id,
              startedAt: r.started_at,
              finishedAt: r.finished_at,
              newItems: r.new_items,
              updatedItems: r.updated_items,
              durationMs: r.duration_ms,
            };
          }),
        };
      }

      // 11. Last run in getSyncHealth
      if (sql.includes('SELECT id, started_at AS startedAt') && sql.includes('ORDER BY started_at DESC') && sql.includes('LIMIT 1')) {
        return {
          get: vi.fn(() => {
            const list = Array.from(syncRuns.values());
            list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            const r = list[0];
            if (!r) return null;
            return {
              id: r.id,
              startedAt: r.started_at,
              finishedAt: r.finished_at || null,
              status: r.status,
              newItems: r.new_items,
              updatedItems: r.updated_items,
              durationMs: r.duration_ms,
              errorSummary: r.error_summary,
            };
          }),
        };
      }

      // 12. Latest category run for category_id
      if (sql.includes('FROM sync_run_categories src') && sql.includes('JOIN sync_runs sr ON sr.id = src.sync_run_id') && sql.includes('WHERE src.category_id = ?')) {
        return {
          get: vi.fn((catId: string) => {
            const matches = Array.from(syncRunCategories.values()).filter(c => c.category_id === catId);
            matches.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
            const latest = matches[0];
            if (!latest) return null;
            const run = syncRuns.get(latest.sync_run_id);
            return {
              status: latest.status,
              startedAt: latest.started_at,
              finishedAt: latest.finished_at,
              errorSummary: latest.error_summary,
              runStatus: run?.status || 'COMPLETED',
            };
          }),
        };
      }

      // 13. Latest successful category run timestamp
      if (sql.includes("FROM sync_run_categories src") && sql.includes("WHERE src.category_id = ? AND src.status = 'COMPLETED'")) {
        return {
          get: vi.fn((catId: string) => {
            const matches = Array.from(syncRunCategories.values()).filter(c => c.category_id === catId && c.status === 'COMPLETED');
            matches.sort((a, b) => new Date(b.finished_at || 0).getTime() - new Date(a.finished_at || 0).getTime());
            const latest = matches[0];
            if (!latest) return null;
            return { finishedAt: latest.finished_at };
          }),
        };
      }

      // 14. clearHistory
      if (sql.includes("DELETE FROM sync_runs WHERE status != 'RUNNING'")) {
        return {
          run: vi.fn(() => {
            let changes = 0;
            for (const [id, r] of Array.from(syncRuns.entries())) {
              if (r.status !== 'RUNNING') {
                syncRuns.delete(id);
                changes++;
              }
            }
            return { changes };
          }),
        };
      }

      return {
        run: vi.fn(() => ({ changes: 1 })),
        get: vi.fn(() => null),
        all: vi.fn(() => []),
      };
    }),
  };

  return db;
}

describe('syncHistoryRepo Unit Tests (V3-75)', () => {
  let db: any;

  beforeEach(() => {
    db = createMockSyncDb();
  });

  it('creates and finishes a COMPLETED sync run with counters', () => {
    const runId = syncHistoryRepo.createRun(db, {
      mode: 'INCREMENTAL',
      transport: 'BROWSER_COMPANION',
      scopeType: 'ALL_ENABLED_CATEGORIES',
      categoriesTotal: 3,
      triggerType: 'MANUAL',
    });

    expect(runId).toBeTruthy();

    // Verify initial running state
    let run = syncHistoryRepo.getRunDetails(db, runId);
    expect(run.status).toBe('RUNNING');
    expect(run.mode).toBe('INCREMENTAL');
    expect(run.transport).toBe('BROWSER_COMPANION');
    expect(run.categoriesTotal).toBe(3);
    expect(run.newItems).toBe(0);

    // Update progress during execution at page boundary
    syncHistoryRepo.updateRunProgress(db, runId, {
      topicsFound: 50,
      newItems: 42,
      updatedItems: 8,
      savedItems: 50,
      durationMs: 12000,
    });

    run = syncHistoryRepo.getRunDetails(db, runId);
    expect(run.topicsFound).toBe(50);
    expect(run.newItems).toBe(42);
    expect(run.updatedItems).toBe(8);

    // Finish run
    const finishedAt = new Date().toISOString();
    syncHistoryRepo.finishRun(db, runId, {
      status: 'COMPLETED',
      finishedAt,
      durationMs: 15400,
      newItems: 42,
      updatedItems: 8,
      savedItems: 50,
      categoriesCompleted: 3,
    });

    const finished = syncHistoryRepo.getRunDetails(db, runId);
    expect(finished.status).toBe('COMPLETED');
    expect(finished.finishedAt).toBe(finishedAt);
    expect(finished.durationMs).toBe(15400);
    expect(finished.categoriesCompleted).toBe(3);
  });

  it('tracks per-category runs and prevents duplicate rows on retry', () => {
    const runId = syncHistoryRepo.createRun(db, {
      mode: 'INCREMENTAL',
      transport: 'BROWSER_COMPANION',
      categoriesTotal: 2,
    });

    // Start category 1
    const catId1 = syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: runId,
      categoryId: 'switch',
      categoryNameSnapshot: 'Nintendo Switch',
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
    });
    expect(catId1).toBe(`${runId}_switch`);

    // Ingest page 1
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: runId,
      categoryId: 'switch',
      pagesProcessed: 1,
      totalPages: 2,
      topicsFound: 50,
      newItems: 30,
      updatedItems: 5,
      savedItems: 35,
    });

    // Simulate page 1 retry: updating same category run must not create a duplicate row
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: runId,
      categoryId: 'switch',
      pagesProcessed: 1,
      totalPages: 2,
      topicsFound: 50,
      newItems: 30,
      updatedItems: 5,
      savedItems: 35,
    });

    let details = syncHistoryRepo.getRunDetails(db, runId);
    expect(details.categories).toHaveLength(1);
    expect(details.categories[0].newItems).toBe(30);

    // Complete category 1
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: runId,
      categoryId: 'switch',
      status: 'COMPLETED',
      finishedAt: new Date().toISOString(),
      pagesProcessed: 2,
      totalPages: 2,
      topicsFound: 100,
      newItems: 60,
      updatedItems: 10,
      savedItems: 70,
      durationMs: 8500,
    });

    // Add category 2 with a warning
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: runId,
      categoryId: 'ps3',
      categoryNameSnapshot: 'PlayStation 3',
      status: 'WARNING',
      errorSummary: 'Browser verification required',
      errorCode: 'INTERACTION_REQUIRED',
    });

    details = syncHistoryRepo.getRunDetails(db, runId);
    expect(details.categories).toHaveLength(2);
    expect(details.categories[0].categoryId).toBe('switch');
    expect(details.categories[0].status).toBe('COMPLETED');
    expect(details.categories[1].categoryId).toBe('ps3');
    expect(details.categories[1].status).toBe('WARNING');
    expect(details.categories[1].errorSummary).toBe('Browser verification required');
  });

  it('marks cancelled run as CANCELLED with cancelled_by_user=1', () => {
    const runId = syncHistoryRepo.createRun(db, {
      mode: 'FULL_SCAN',
      transport: 'BROWSER_COMPANION',
      categoriesTotal: 1,
    });

    syncHistoryRepo.finishRun(db, runId, {
      status: 'CANCELLED',
      finishedAt: new Date().toISOString(),
      durationMs: 4200,
      cancelledByUser: true,
      newItems: 12,
    });

    const run = syncHistoryRepo.getRunDetails(db, runId);
    expect(run.status).toBe('CANCELLED');
    expect(run.cancelledByUser).toBe(1);
    expect(run.newItems).toBe(12);
  });

  it('transitions zombie RUNNING runs to INTERRUPTED on cleanup / app restart', () => {
    const runId1 = syncHistoryRepo.createRun(db, { mode: 'INCREMENTAL' });
    const runId2 = syncHistoryRepo.createRun(db, { mode: 'INCREMENTAL' });

    syncHistoryRepo.finishRun(db, runId1, { status: 'COMPLETED', finishedAt: new Date().toISOString() });
    // runId2 remains in 'RUNNING' status (simulating app sudden exit)

    const cleaned = syncHistoryRepo.cleanupInterruptedRuns(db);
    expect(cleaned).toBe(1);

    const run1 = syncHistoryRepo.getRunDetails(db, runId1);
    const run2 = syncHistoryRepo.getRunDetails(db, runId2);

    expect(run1.status).toBe('COMPLETED');
    expect(run2.status).toBe('INTERRUPTED');
    expect(run2.errorSummary).toContain('Application closed');
  });

  it('supports pagination and status filtering in getRuns', () => {
    syncHistoryRepo.createRun(db, { id: 'r1', status: 'COMPLETED', startedAt: '2026-10-01T10:00:00Z' });
    syncHistoryRepo.finishRun(db, 'r1', { status: 'COMPLETED', finishedAt: '2026-10-01T10:05:00Z' });

    syncHistoryRepo.createRun(db, { id: 'r2', status: 'CANCELLED', startedAt: '2026-10-02T10:00:00Z' });
    syncHistoryRepo.finishRun(db, 'r2', { status: 'CANCELLED', cancelledByUser: true });

    syncHistoryRepo.createRun(db, { id: 'r3', status: 'FAILED', startedAt: '2026-10-03T10:00:00Z' });
    syncHistoryRepo.finishRun(db, 'r3', { status: 'FAILED', errorSummary: 'Network error' });

    syncHistoryRepo.createRun(db, { id: 'r4', status: 'COMPLETED_WITH_WARNINGS', startedAt: '2026-10-04T10:00:00Z' });
    syncHistoryRepo.finishRun(db, 'r4', { status: 'COMPLETED_WITH_WARNINGS' });

    // Filter ALL
    const all = syncHistoryRepo.getRuns(db, { limit: 10, offset: 0, statusFilter: 'ALL' });
    expect(all.total).toBe(4);
    expect(all.runs[0].id).toBe('r4'); // Most recent first

    // Filter COMPLETED (includes warnings)
    const completed = syncHistoryRepo.getRuns(db, { statusFilter: 'COMPLETED' });
    expect(completed.total).toBe(2);

    // Filter CANCELLED
    const cancelled = syncHistoryRepo.getRuns(db, { statusFilter: 'CANCELLED' });
    expect(cancelled.total).toBe(1);
    expect(cancelled.runs[0].id).toBe('r2');

    // Filter FAILED
    const failed = syncHistoryRepo.getRuns(db, { statusFilter: 'FAILED' });
    expect(failed.total).toBe(1);
    expect(failed.runs[0].id).toBe('r3');
  });

  it('computes accurate operational sync health summaries', () => {
    const configuredCategories = [
      { id: 'switch', name: 'Nintendo Switch', last_scraped_at: '2026-10-10T12:00:00Z' },
      { id: 'ps2', name: 'PlayStation 2' },
      { id: 'xbox', name: 'Xbox' },
    ];

    // Run 1: Completed Switch
    const r1 = syncHistoryRepo.createRun(db, { startedAt: '2026-10-10T12:00:00Z' });
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: r1,
      categoryId: 'switch',
      categoryNameSnapshot: 'Nintendo Switch',
      status: 'COMPLETED',
      finishedAt: '2026-10-10T12:10:00Z',
      newItems: 25,
      updatedItems: 2,
      durationMs: 600000,
    });
    syncHistoryRepo.finishRun(db, r1, {
      status: 'COMPLETED',
      finishedAt: '2026-10-10T12:10:00Z',
      newItems: 25,
      updatedItems: 2,
      durationMs: 600000,
    });

    // Run 2: Failed Xbox
    const r2 = syncHistoryRepo.createRun(db, { startedAt: '2026-10-10T14:00:00Z' });
    syncHistoryRepo.upsertCategoryRun(db, {
      syncRunId: r2,
      categoryId: 'xbox',
      categoryNameSnapshot: 'Xbox',
      status: 'FAILED',
      finishedAt: '2026-10-10T14:01:00Z',
      errorSummary: 'Connection refused',
    });
    syncHistoryRepo.finishRun(db, r2, {
      status: 'FAILED',
      finishedAt: '2026-10-10T14:01:00Z',
      errorSummary: 'Connection refused',
    });

    const health = syncHistoryRepo.getSyncHealth(db, configuredCategories);
    expect(health.lastSuccessfulSync?.id).toBe(r1);
    expect(health.lastSuccessfulSync?.newItems).toBe(25);
    expect(health.lastRun?.id).toBe(r2);
    expect(health.lastRun?.status).toBe('FAILED');

    expect(health.healthyCategoriesCount).toBe(1); // Switch
    expect(health.needingAttentionCount).toBe(2); // PS2 (never synced) + Xbox (failed)

    const switchCat = health.categories.find((c: any) => c.categoryId === 'switch');
    expect(switchCat?.status).toBe('UP_TO_DATE');
    expect(switchCat?.lastSuccessfulSyncAt).toBe('2026-10-10T12:10:00Z');

    const ps2Cat = health.categories.find((c: any) => c.categoryId === 'ps2');
    expect(ps2Cat?.status).toBe('NEVER_SYNCED');

    const xboxCat = health.categories.find((c: any) => c.categoryId === 'xbox');
    expect(xboxCat?.status).toBe('FAILED');
    expect(xboxCat?.lastError).toBe('Connection refused');
  });

  it('clears past history while preserving any active RUNNING run', () => {
    syncHistoryRepo.createRun(db, { id: 'past_1', status: 'COMPLETED' });
    syncHistoryRepo.createRun(db, { id: 'past_2', status: 'FAILED' });
    syncHistoryRepo.createRun(db, { id: 'active_1', status: 'RUNNING' });

    const deleted = syncHistoryRepo.clearHistory(db);
    expect(deleted).toBe(2);

    const active = syncHistoryRepo.getRunDetails(db, 'active_1');
    expect(active).not.toBeNull();
    expect(active.status).toBe('RUNNING');

    const past = syncHistoryRepo.getRunDetails(db, 'past_1');
    expect(past).toBeNull();
  });
});
