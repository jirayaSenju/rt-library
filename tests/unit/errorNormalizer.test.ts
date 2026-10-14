import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, normalizeIpcError } from '../../src/utils/errorNormalizer';

describe('Error Sanitization & Normalization (Windows Release Hotfix)', () => {
  it('sanitizes Windows absolute paths and require stack from module not found error', () => {
    const rawWindowsError = `Error invoking remote method 'scraper:embedded-probe': Error: Cannot find module 'jsdom'
Require stack:
- C:\\Users\\Administrator\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\scraper\\parsers\\rutrackerHtmlParser.cjs
- C:\\Users\\Administrator\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\electron\\scraper\\embeddedElectronTransport.cjs
- C:\\Users\\Administrator\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\electron\\scraper\\scraperManager.cjs
- C:\\Users\\Administrator\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\electron\\scraper\\scraperIPC.cjs
- C:\\Users\\Administrator\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\electron\\main.cjs`;

    const sanitized = sanitizeErrorMessage(rawWindowsError);
    expect(sanitized).toBe('Built-in Scraper could not start. A required component is missing from this installation.');
    expect(sanitized).not.toContain('jsdom');
    expect(sanitized).not.toContain('C:\\Users');
    expect(sanitized).not.toContain('Require stack');
    expect(sanitized).not.toContain('app.asar');

    const normalized = normalizeIpcError(rawWindowsError);
    expect(normalized.code).toBe('SCRAPER_RUNTIME_DEPENDENCY_MISSING');
    expect(normalized.category).toBe('RUNTIME');
    expect(normalized.userMessage).toBe('Built-in Scraper could not start.');
    expect(normalized.secondaryMessage).toBe('A required component is missing from this installation.');
    expect(normalized.recoverable).toBe(false);
    expect(normalized.actions).toContain('RETRY');
    expect(normalized.actions).toContain('USE_COMPANION');
    expect(normalized.actions).toContain('VIEW_DIAGNOSTICS');
    // Technical details retain stack for diagnostics
    expect(normalized.technicalDetails).toContain('C:\\Users');
  });

  it('sanitizes POSIX absolute paths from generic error', () => {
    const rawPosixError = `Error: Failed to open database at /home/user/app/userData/rt-library.db: SQLite error`;
    const sanitized = sanitizeErrorMessage(rawPosixError);
    expect(sanitized).not.toContain('/home/user');
    expect(sanitized).toContain('[path]');
  });

  it('handles unknown or empty error with clean fallback', () => {
    expect(sanitizeErrorMessage('')).toBe('Something went wrong while starting the scraper.');
    expect(sanitizeErrorMessage(null as any)).toBe('Something went wrong while starting the scraper.');

    const norm = normalizeIpcError(null);
    expect(norm.userMessage).toBe('Something went wrong while starting the scraper.');
    expect(norm.category).toBe('GENERAL');
  });

  it('normalizes network errors cleanly', () => {
    const netErr = new Error('ETIMEDOUT connecting to 104.21.32.1:443');
    const norm = normalizeIpcError(netErr);
    expect(norm.code).toBe('SCRAPER_NETWORK_ERROR');
    expect(norm.category).toBe('NETWORK');
    expect(norm.userMessage).toContain('timed out');
    expect(norm.recoverable).toBe(true);
  });

  it('normalizes simulated IPC embedded-probe failure in scraperService', async () => {
    const { scraperService } = await import('../../src/services/scraperService');
    const rawError = new Error(`Error invoking remote method 'scraper:embedded-probe': Error: Cannot find module 'jsdom'
Require stack:
- C:\\Users\\User\\AppData\\Local\\Programs\\RT Library\\resources\\app.asar\\scraper\\parsers\\rutrackerHtmlParser.cjs`);

    // Mock window.electronAPI.scraper.embeddedProbe
    (window as any).electronAPI = {
      scraper: {
        embeddedProbe: async () => {
          throw rawError;
        },
      },
    };

    const result = await scraperService.embeddedProbe();
    expect(result.success).toBe(false);
    expect(result.status).toBe('RUNTIME_DEPENDENCY_MISSING');
    expect(result.error.code).toBe('SCRAPER_RUNTIME_DEPENDENCY_MISSING');
    expect(result.error.userMessage).toBe('Built-in Scraper could not start.');
    expect(result.error.secondaryMessage).toBe('A required component is missing from this installation.');
    expect(result.error.userMessage).not.toContain('jsdom');
    expect(result.error.userMessage).not.toContain('C:\\Users');
  });
});
