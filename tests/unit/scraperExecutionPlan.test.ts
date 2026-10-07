import { describe, it, expect } from 'vitest';

// Require CommonJS modules
const {
  resolveExecutionScope,
  normalizeScraperOptions,
  createExecutionPlan,
  shouldStopAfterPage,
} = require('../../electron/scraper/executionPlan.cjs');

describe('Scraper Scope Semantics & Execution Plan (V3-23)', () => {
  const sampleCategories = [
    { id: 'switch', name: 'Nintendo Switch', enabled: true },
    { id: 'ps1', name: 'Playstation 1', enabled: true },
    { id: 'ps2', name: 'Playstation 2', enabled: true },
    { id: 'ps3', name: 'Playstation 3', enabled: false },
  ];

  describe('resolveExecutionScope', () => {
    it('resolves single category scope correctly when enabled', () => {
      const scope = resolveExecutionScope({
        category: 'switch',
        allCategories: sampleCategories,
      });
      expect(scope.type).toBe('single');
      expect(scope.targetCategoryId).toBe('switch');
      expect(scope.categoryIds).toEqual(['switch']);
      expect(scope.categories).toHaveLength(1);
      expect(scope.categories[0].id).toBe('switch');
    });

    it('resolves all enabled categories when category is "all", null, or empty', () => {
      const scopeAll = resolveExecutionScope({
        category: 'all',
        allCategories: sampleCategories,
      });
      expect(scopeAll.type).toBe('all');
      expect(scopeAll.targetCategoryId).toBeNull();
      expect(scopeAll.categoryIds).toEqual(['switch', 'ps1', 'ps2']);
      expect(scopeAll.categories).toHaveLength(3);

      const scopeNull = resolveExecutionScope({
        category: null,
        allCategories: sampleCategories,
      });
      expect(scopeNull.type).toBe('all');
      expect(scopeNull.categoryIds).toEqual(['switch', 'ps1', 'ps2']);
    });

    it('throws CATEGORY_DISABLED when attempting to scope to a disabled category', () => {
      expect(() => {
        resolveExecutionScope({
          category: 'ps3',
          allCategories: sampleCategories,
        });
      }).toThrow(/CATEGORY_DISABLED/);
    });

    it('throws CATEGORY_NOT_FOUND when category id does not exist in known list', () => {
      expect(() => {
        resolveExecutionScope({
          category: 'xbox_unknown',
          allCategories: sampleCategories,
        });
      }).toThrow(/CATEGORY_NOT_FOUND/);
    });
  });

  describe('Selected Category Scoping Matrix', () => {
    it('Selected Category + Default Update: processes single category with incremental mode', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('incremental');
      expect(plan.scanAllPages).toBe(false);
      expect(plan.allowKnownTopicEarlyStop).toBe(true);
      expect(plan.discoverNewTopics).toBe(true);
      expect(plan.processExistingOnly).toBe(false);
    });

    it('Selected Category + Full Scan: processes single category with full scan semantics', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        full: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('full');
      expect(plan.refresh).toEqual({ images: true, size: true, files: true });
      expect(plan.scanAllPages).toBe(false);
      expect(plan.allowKnownTopicEarlyStop).toBe(true);
      expect(plan.knownPageLimit).toBe(3);
    });

    it('Selected Category + Refresh Screenshots: processes single category, scanning all pages without early stop', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        refreshScreenshots: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('refresh');
      expect(plan.refresh).toEqual({ images: true, size: false, files: false });
      expect(plan.scanAllPages).toBe(true);
      expect(plan.allowKnownTopicEarlyStop).toBe(false);
      expect(plan.processExistingOnly).toBe(true);
      expect(plan.discoverNewTopics).toBe(false);
    });

    it('Selected Category + Refresh Size: processes single category across all pages', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        refreshSizes: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('refresh');
      expect(plan.refresh.size).toBe(true);
      expect(plan.scanAllPages).toBe(true);
    });

    it('Selected Category + Refresh Files: processes single category across all pages', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        refreshFiles: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('refresh');
      expect(plan.refresh.files).toBe(true);
      expect(plan.scanAllPages).toBe(true);
    });

    it('Selected Category + Multiple Refreshes: processes single category in a single traversal', () => {
      const plan = createExecutionPlan({
        category: 'switch',
        refreshScreenshots: true,
        refreshSizes: true,
        refreshFiles: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('single');
      expect(plan.scope.targetCategoryId).toBe('switch');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.mode).toBe('refresh');
      expect(plan.refresh).toEqual({ images: true, size: true, files: true });
      expect(plan.scanAllPages).toBe(true);
      expect(plan.allowKnownTopicEarlyStop).toBe(false);
      expect(plan.processExistingOnly).toBe(true);
      expect(plan.discoverNewTopics).toBe(false);
    });
  });

  describe('All Categories Scoping Matrix', () => {
    it('All Categories + Default: processes all enabled categories', () => {
      const plan = createExecutionPlan({
        category: 'all',
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('all');
      expect(plan.scope.targetCategoryId).toBeNull();
      expect(plan.scanAllCategories).toBe(true);
      expect(plan.mode).toBe('incremental');
      expect(plan.scanAllPages).toBe(false);
      expect(plan.allowKnownTopicEarlyStop).toBe(true);
    });

    it('All Categories + Full Scan: processes all enabled categories with full scan semantics', () => {
      const plan = createExecutionPlan({
        category: 'all',
        full: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('all');
      expect(plan.scanAllCategories).toBe(true);
      expect(plan.mode).toBe('full');
      expect(plan.refresh).toEqual({ images: true, size: true, files: true });
      expect(plan.allowKnownTopicEarlyStop).toBe(true);
    });

    it('All Categories + Refresh: processes all enabled categories across all pages', () => {
      const plan = createExecutionPlan({
        category: 'all',
        refreshScreenshots: true,
        refreshSizes: true,
        allCategories: sampleCategories,
      });
      expect(plan.scope.type).toBe('all');
      expect(plan.scanAllCategories).toBe(true);
      expect(plan.mode).toBe('refresh');
      expect(plan.scanAllPages).toBe(true);
      expect(plan.allowKnownTopicEarlyStop).toBe(false);
    });
  });

  describe('Early Stop Threshold Logic', () => {
    it('allows early stop only when consecutive known pages threshold is reached in incremental / full mode', () => {
      const plan = createExecutionPlan({ full: true, knownPageLimit: 3 });
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 1 })).toBe(false);
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 2 })).toBe(false);
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 3 })).toBe(true);
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 4 })).toBe(true);
    });

    it('never stops early on known pages in refresh mode', () => {
      const plan = createExecutionPlan({ refreshScreenshots: true });
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 3 })).toBe(false);
      expect(shouldStopAfterPage({ plan, consecutiveKnownPages: 50 })).toBe(false);
    });
  });

  describe('Option Normalization & Scope Invariance', () => {
    it('enforces backend normalization of refresh flags when full=true', () => {
      const maliciousPayload = {
        category: 'switch',
        full: true,
        refreshScreenshots: false,
        refreshSizes: false,
        refreshFiles: false,
      };
      const normalized = normalizeScraperOptions(maliciousPayload);
      expect(normalized.full).toBe(true);
      expect(normalized.refreshScreenshots).toBe(true);
      expect(normalized.refreshSizes).toBe(true);
      expect(normalized.refreshFiles).toBe(true);

      const plan = createExecutionPlan(maliciousPayload);
      expect(plan.scope.type).toBe('single');
      expect(plan.scanAllCategories).toBe(false);
      expect(plan.refresh.images).toBe(true);
      expect(plan.refresh.size).toBe(true);
      expect(plan.refresh.files).toBe(true);
    });
  });
});
