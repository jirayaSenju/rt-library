import { describe, expect, it } from 'vitest';
const { sanitizeUrlForLog } = require('../../scraper/accessProbe.cjs');
const { DEFAULT_CATEGORIES } = require('../../electron/scraper/defaultCategories.cjs');

describe('Category URL Query String Preservation (V3-48)', () => {
  it('preserves query strings (?f=...) in log sanitization', () => {
    const sanitized = sanitizeUrlForLog('https://rutracker.org/forum/viewforum.php?f=1605');
    expect(sanitized).toBe('https://rutracker.org/forum/viewforum.php?f=1605');
  });

  it('verifies all default categories have complete query parameters in baseUrl', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.baseUrl).toContain('viewforum.php?f=');
      const url = new URL(category.baseUrl);
      expect(url.searchParams.has('f')).toBe(true);
      expect(url.searchParams.get('f')).toMatch(/^\d+$/);
    }
  });

  it('verifies exact category URLs for key console categories', () => {
    const switchCat = DEFAULT_CATEGORIES.find((c) => c.id === 'switch');
    const ps2Cat = DEFAULT_CATEGORIES.find((c) => c.id === 'ps2');

    expect(switchCat?.baseUrl).toBe('https://rutracker.org/forum/viewforum.php?f=1605');
    expect(ps2Cat?.baseUrl).toBe('https://rutracker.org/forum/viewforum.php?f=357');
  });
});
