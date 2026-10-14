import { describe, expect, it, vi } from 'vitest';

const {
  ACCESS_STATUSES,
  classifyCategoryAccess,
  classifyNetworkError,
  detectAccessChallenge,
  inspectCurrentCategory,
  probeCategory,
  resolveProbeScope,
  sanitizeUrlForLog,
  summarizeAccess,
} = require('../../scraper/accessProbe.cjs');
const { getApplicationDataDirectory, getScraperProfileDirectory, resolveScraperProfileDirectory } = require('../../scraper/platformPaths.cjs');

const accessible = (categoryId: string) => ({
  categoryId,
  categoryName: categoryId,
  url: `https://rutracker.org/forum/viewforum.php?f=${categoryId}`,
  status: ACCESS_STATUSES.ACCESSIBLE,
  httpStatus: 200,
  challengeDetected: false,
  authenticationRequired: false,
  checkedAt: '2026-01-01T00:00:00.000Z',
  message: 'The category is accessible.',
});

describe('Scraper access preflight', () => {
  it('classifies 403 with cf-mitigated challenge as explicit human interaction', () => {
    expect(detectAccessChallenge({ status: 403, cfMitigated: 'challenge' })).toBe(true);
    expect(classifyCategoryAccess({
      category: { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' },
      status: 403,
      cfMitigated: 'challenge',
    })).toMatchObject({
      status: 'INTERACTION_REQUIRED',
      categoryId: 'switch',
      httpStatus: 403,
      challengeDetected: true,
      interactionRequired: true,
      reason: 'cloudflare_challenge',
      challengeType: 'cloudflare_challenge',
    });
  });

  it('detects challenge content and removes sensitive query parameters from logged URLs', () => {
    expect(detectAccessChallenge({ status: 200, title: 'Just a moment...' })).toBe(true);
    expect(sanitizeUrlForLog('https://rutracker.org/forum/viewforum.php?f=773&token=private'))
      .toBe('https://rutracker.org/forum/viewforum.php?f=773');
  });

  it('accepts a validated accessible listing and a structurally valid empty listing', () => {
    const category = { id: 'ps2', name: 'PS2', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=9' };
    expect(classifyCategoryAccess({ category, status: 200, hasForumStructure: true, topicCount: 8 }).status).toBe('ACCESSIBLE');
    expect(classifyCategoryAccess({ category, status: 200, hasForumStructure: true, topicCount: 0 }).status).toBe('ACCESSIBLE_EMPTY');
    expect(classifyCategoryAccess({ category, status: 200, hasForumStructure: false, topicCount: 0 }).status).toBe('UNKNOWN');
  });

  it('distinguishes authentication, timeout, DNS, reset and offline errors', () => {
    const category = { id: 'switch', name: 'Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    expect(classifyCategoryAccess({ category, status: 401 }).status).toBe('AUTH_REQUIRED');
    expect(classifyNetworkError(new Error('Timeout 25000ms exceeded'))).toBe('TIMEOUT');
    expect(classifyNetworkError(new Error('getaddrinfo ENOTFOUND rutracker.org'))).toBe('DNS_ERROR');
    expect(classifyNetworkError(new Error('ECONNRESET'))).toBe('CONNECTION_RESET');
    expect(classifyNetworkError(new Error('ERR_INTERNET_DISCONNECTED'))).toBe('OFFLINE');
  });

  it('probes the selected category and never substitutes an accessible category', () => {
    const categories = [
      { id: 'wii', name: 'Wii', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=773' },
      { id: 'switch', name: 'Nintendo Switch', enabled: true, baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' },
    ];
    expect(resolveProbeScope(categories, 'switch').categoryIds).toEqual(['switch']);
    const result = classifyCategoryAccess({
      category: categories[1], status: 403, cfMitigated: 'challenge',
    });
    expect(summarizeAccess([result], 1)).toMatchObject({ status: 'INTERACTION_REQUIRED', scanReady: false });
  });

  it('sends a category probe to that category and returns the challenge without retrying', async () => {
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const goto = vi.fn().mockResolvedValue({ status: () => 403, headers: () => ({ 'cf-mitigated': 'challenge' }) });
    const page = {
      goto,
      url: () => category.baseUrl,
      evaluate: vi.fn().mockResolvedValue({ title: 'Just a moment...', body: '', topicCount: 0, authenticationRequired: false, hasForumStructure: false }),
    };

    await expect(probeCategory(page, category)).resolves.toMatchObject({
      categoryId: 'switch', status: 'INTERACTION_REQUIRED', httpStatus: 403,
    });
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledWith(category.baseUrl, expect.any(Object));
  });

  it('detects verification on the current page without triggering a navigation', async () => {
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const page = {
      url: () => category.baseUrl,
      goto: vi.fn(),
      evaluate: vi.fn().mockResolvedValue({ title: 'Forum', body: '', topicCount: 0, authenticationRequired: false, hasForumStructure: true, challengeElement: false }),
    };
    await expect(inspectCurrentCategory(page, category, { status: 200, cfMitigated: null }))
      .resolves.toMatchObject({ status: 'ACCESSIBLE_EMPTY', categoryId: 'switch' });
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('does not accept a challenge page even when the current HTTP response is 200', async () => {
    const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };
    const page = {
      url: () => 'https://rutracker.org/cdn-cgi/challenge-platform/',
      evaluate: vi.fn().mockResolvedValue({ title: 'Verification', body: '', topicCount: 0, authenticationRequired: false, hasForumStructure: false, challengeElement: true }),
    };
    await expect(inspectCurrentCategory(page, category, { status: 200 }))
      .resolves.toMatchObject({ status: 'INTERACTION_REQUIRED', challengeDetected: true });
  });

  it('uses strict readiness for all categories when one of sixteen needs interaction', () => {
    const results = Array.from({ length: 15 }, (_, index) => accessible(`category-${index}`));
    results.push({
      ...accessible('switch'),
      status: ACCESS_STATUSES.INTERACTION_REQUIRED,
      httpStatus: 403,
      challengeDetected: true,
    });
    expect(summarizeAccess(results, 16)).toMatchObject({ status: 'INTERACTION_REQUIRED', scanReady: false, accessibleCount: 15, expectedCount: 16 });
  });

  it('uses Electron-style user data paths on Linux, Windows and macOS', () => {
    expect(getApplicationDataDirectory({ XDG_CONFIG_HOME: '/tmp/config' }, 'linux', '/home/test')).toBe('/tmp/config/rt-library');
    expect(getScraperProfileDirectory({ APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'win32', 'C:\\Users\\test'))
      .toBe('C:\\Users\\test\\AppData\\Roaming\\rt-library\\scraper-profile');
    expect(getScraperProfileDirectory({}, 'darwin', '/Users/test'))
      .toBe('/Users/test/Library/Application Support/rt-library/scraper-profile');
  });

  it('resolves the profile from the canonical Electron userData directory', () => {
    expect(resolveScraperProfileDirectory('/home/test/.config/rt-library', 'linux'))
      .toBe('/home/test/.config/rt-library/scraper-profile');
    expect(resolveScraperProfileDirectory('C:\\Users\\test\\AppData\\Roaming\\rt-library', 'win32'))
      .toBe('C:\\Users\\test\\AppData\\Roaming\\rt-library\\scraper-profile');
    expect(() => resolveScraperProfileDirectory('')).toThrow(/SCRAPER_PROFILE_PATH_INVALID/);
  });
});
