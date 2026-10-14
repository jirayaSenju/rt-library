import { describe, expect, it, vi } from 'vitest';
const { ScraperBrowserSession } = require('../../scraper/browserSession.cjs');

describe('Verification Lifecycle & Close Origin (V3-50)', () => {
  it('initializes closeOrigin as unknown and activePage as null before start', () => {
    const session = new ScraperBrowserSession({ mode: 'verification' });
    expect(session.closeOrigin).toBe('unknown');
    expect(session.activePage).toBeNull();
  });

  it('sets closeOrigin to APPLICATION_CLOSED when session.close() is called', async () => {
    const session = new ScraperBrowserSession({ mode: 'verification' });
    // Simulate start state with mock context
    const mockContext = {
      close: vi.fn().mockResolvedValue(undefined),
      cookies: vi.fn().mockResolvedValue([]),
    };
    session.context = mockContext;
    session.state = 'profile_loaded';

    await session.close('verified');
    expect(session.closeOrigin).toBe('APPLICATION_CLOSED');
    expect(session.closeReason).toBe('verified');
  });

  it('handles attachPageListeners and PAGE_DISPLACED_NAV when a page closes while context is active', () => {
    const session = new ScraperBrowserSession({ mode: 'verification' });
    const mockPage1 = {
      on: vi.fn(),
      isClosed: vi.fn().mockReturnValue(true),
    };
    const mockPage2 = {
      on: vi.fn(),
      isClosed: vi.fn().mockReturnValue(false),
    };
    const mockContext = {
      pages: vi.fn().mockReturnValue([mockPage2]),
    };
    session.context = mockContext;
    session.page = mockPage1;

    let pageCloseHandler: Function | null = null;
    mockPage1.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'close') pageCloseHandler = handler;
    });

    session.attachPageListeners(mockPage1);
    expect(pageCloseHandler).not.toBeNull();

    // Trigger page close
    pageCloseHandler!();

    expect(session.closeOrigin).toBe('PAGE_DISPLACED_NAV');
    expect(session.activePage).toBe(mockPage2);
  });
});

