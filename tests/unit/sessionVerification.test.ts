import { describe, expect, it } from 'vitest';
const { classifyCategoryAccess, ACCESS_STATUSES } = require('../../scraper/accessProbe.cjs');

describe('RuTracker Session Verification & 403 Classification (V3-47)', () => {
  const category = { id: 'switch', name: 'Nintendo Switch', baseUrl: 'https://rutracker.org/forum/viewforum.php?f=1605' };

  it('classifies 403 with cf-mitigated header as Cloudflare INTERACTION_REQUIRED', () => {
    const result = classifyCategoryAccess({
      category,
      status: 403,
      cfMitigated: 'challenge',
    });
    expect(result.status).toBe(ACCESS_STATUSES.INTERACTION_REQUIRED);
    expect(result.challengeType).toBe('cloudflare_challenge');
    expect(result.interactionRequired).toBe(true);
  });

  it('classifies 403 or login redirect without Cloudflare as AUTH_REQUIRED', () => {
    const result = classifyCategoryAccess({
      category,
      status: 403,
      finalUrl: 'https://rutracker.org/forum/login.php',
      body: 'authenticationRequired',
    });
    expect(result.status).toBe(ACCESS_STATUSES.AUTH_REQUIRED);
    expect(result.authenticationRequired).toBe(true);
  });

  it('classifies generic 404/500 HTTP errors without challenge/auth as HTTP_ERROR', () => {
    const result = classifyCategoryAccess({
      category,
      status: 500,
    });
    expect(result.status).toBe(ACCESS_STATUSES.HTTP_ERROR);
  });
});

