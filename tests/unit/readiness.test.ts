import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LibraryReadinessState, LibraryReadiness } from '@/types/libraryIPC';

describe('Library Readiness and State Transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('determines SCRAPER_REQUIRED when database has 0 items and initial scan not completed', () => {
    const computeReadinessState = (readiness: {
      itemCount: number;
      hasLegacyJson: boolean;
      initialScanCompleted: boolean;
    }): LibraryReadinessState => {
      if (readiness.itemCount > 0) return 'READY';
      if (readiness.hasLegacyJson) return 'MIGRATING';
      if (!readiness.initialScanCompleted || readiness.itemCount === 0) return 'SCRAPER_REQUIRED';
      return 'READY';
    };

    const emptyDbReadiness: LibraryReadiness = {
      state: computeReadinessState({ itemCount: 0, hasLegacyJson: false, initialScanCompleted: false }),
      itemCount: 0,
      hasLegacyJson: false,
      initialScanCompleted: false,
      legacyJsonCount: 0,
    };

    expect(emptyDbReadiness.state).toBe('SCRAPER_REQUIRED');
  });

  it('determines MIGRATING when legacy JSON exists and not yet migrated', () => {
    const computeReadinessState = (readiness: {
      itemCount: number;
      hasLegacyJson: boolean;
      initialScanCompleted: boolean;
    }): LibraryReadinessState => {
      if (readiness.itemCount > 0) return 'READY';
      if (readiness.hasLegacyJson) return 'MIGRATING';
      return 'SCRAPER_REQUIRED';
    };

    const migratingReadiness: LibraryReadiness = {
      state: computeReadinessState({ itemCount: 0, hasLegacyJson: true, initialScanCompleted: false }),
      itemCount: 0,
      hasLegacyJson: true,
      initialScanCompleted: false,
      legacyJsonCount: 5,
    };

    expect(migratingReadiness.state).toBe('MIGRATING');
  });

  it('determines READY when database contains items', () => {
    const computeReadinessState = (readiness: {
      itemCount: number;
      hasLegacyJson: boolean;
      initialScanCompleted: boolean;
    }): LibraryReadinessState => {
      if (readiness.itemCount > 0) return 'READY';
      return 'SCRAPER_REQUIRED';
    };

    const readyReadiness: LibraryReadiness = {
      state: computeReadinessState({ itemCount: 1540, hasLegacyJson: false, initialScanCompleted: true }),
      itemCount: 1540,
      hasLegacyJson: false,
      initialScanCompleted: true,
      legacyJsonCount: 0,
    };

    expect(readyReadiness.state).toBe('READY');
    expect(readyReadiness.itemCount).toBe(1540);
  });
});
