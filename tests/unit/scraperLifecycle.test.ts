import { describe, expect, it } from 'vitest';
const path = require('path');
const { getScraperProfileDir } = require('../../scraper/platformPaths.cjs');
const { ScraperBrowserSession, isScraperProfileActive } = require('../../scraper/browserSession.cjs');

describe('Scraper Lifecycle & Persistence (V3-45)', () => {
  it('resolves single canonical scraper profile directory', () => {
    const profileDir = getScraperProfileDir();
    expect(profileDir).toContain('scraper-profile');
    expect(path.isAbsolute(profileDir)).toBe(true);
  });

  it('verifies ScraperBrowserSession profile path consistency', () => {
    const session = new ScraperBrowserSession();
    expect(session.profileDir).toBe(getScraperProfileDir());
    expect(isScraperProfileActive(session.profileDir)).toBe(false);
  });
});

