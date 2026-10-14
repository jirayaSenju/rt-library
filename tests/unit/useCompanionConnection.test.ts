import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompanionConnection } from '@/hooks/useCompanionConnection';
import { scraperService } from '@/services/scraperService';
import { toast } from 'sonner';

vi.mock('@/services/scraperService', () => ({
  scraperService: {
    getCompanionStatus: vi.fn(),
    connectCompanion: vi.fn(),
    reconnectCompanion: vi.fn(),
    checkCompanionAccess: vi.fn(),
    openCompanionRuTracker: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useCompanionConnection Standardized State Machine (V3-65)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    (scraperService.getCompanionStatus as any).mockResolvedValue({
      port: null,
      token: null,
      connected: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. App Start: initializes as DISCONNECTED, never persisting CONNECTED or READY across sessions', async () => {
    const { result } = renderHook(() => useCompanionConnection());

    expect(result.current.state).toBe('DISCONNECTED');
    expect(result.current.connection.token).toBeNull();
    expect(result.current.connection.port).toBeNull();
    expect(result.current.isExpired).toBe(false);
  });

  it('2. Connection Flow: DISCONNECTED -> CONNECTING -> CONNECTED, and code is hidden after handshake', async () => {
    (scraperService.connectCompanion as any).mockResolvedValue({
      port: 48921,
      token: 'secret-token-1234567890abcdef',
      connected: false,
    });

    const onConnected = vi.fn();
    const { result } = renderHook(() => useCompanionConnection({ onConnected }));

    // User clicks Connect
    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe('CONNECTING');
    expect(result.current.connection.port).toBe(48921);
    expect(result.current.connection.token).toBe('secret-token-1234567890abcdef');

    // Extension connects to bridge -> periodic poll receives connected: true
    (scraperService.getCompanionStatus as any).mockResolvedValue({
      port: 48921,
      token: 'secret-token-1234567890abcdef',
      connected: true,
      sessionId: 'sess-1234-5678-9012',
      extensionVersion: '1.2.0',
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(result.current.state).toBe('CONNECTED');
    expect(toast.success).toHaveBeenCalledWith('Browser Companion connected');
    expect(onConnected).toHaveBeenCalled();
  });

  it('3. Access Verification: CONNECTED -> CHECKING_ACCESS -> READY', async () => {
    (scraperService.connectCompanion as any).mockResolvedValue({
      port: 48921,
      token: 'secret-token',
      connected: true,
    });

    const onReady = vi.fn();
    const { result } = renderHook(() => useCompanionConnection({ onReady }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toBe('CONNECTED');

    // User checks access
    (scraperService.checkCompanionAccess as any).mockResolvedValue({
      status: 'FORUM_READY',
      httpStatus: 200,
      topicCount: 48,
    });

    let success: boolean = false;
    await act(async () => {
      success = await result.current.checkAccess('switch');
    });

    expect(success).toBe(true);
    expect(result.current.state).toBe('READY');
    expect(result.current.topicCount).toBe(48);
    expect(result.current.connection.lastAccessCheck).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Access confirmed'));
    expect(onReady).toHaveBeenCalled();
  });

  it('4. Stale session detection / Extension reload: clears READY and sets DISCONNECTED with expired warning', async () => {
    (scraperService.connectCompanion as any).mockResolvedValue({
      port: 48921,
      token: 'secret-token',
      connected: true,
    });
    (scraperService.checkCompanionAccess as any).mockResolvedValue({
      status: 'FORUM_READY',
      topicCount: 30,
    });

    const onExpired = vi.fn();
    const { result } = renderHook(() => useCompanionConnection({ onExpired }));

    await act(async () => {
      await result.current.connect();
      await result.current.checkAccess('switch');
    });

    expect(result.current.state).toBe('READY');

    // Bridge detects extension reload or heartbeat expiry -> connected becomes false
    (scraperService.getCompanionStatus as any).mockResolvedValue({
      port: 48921,
      token: 'secret-token',
      connected: false,
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(result.current.state).toBe('DISCONNECTED');
    expect(result.current.isExpired).toBe(true);
    expect(result.current.errorMessage).toBe('Connection expired. Reconnect to continue synchronization.');
    expect(toast.error).toHaveBeenCalledWith('Connection expired');
    expect(onExpired).toHaveBeenCalled();
  });

  it('5. Reconnect Flow: invalidates old session, transitions to CONNECTING with clean state', async () => {
    (scraperService.reconnectCompanion as any).mockResolvedValue({
      port: 52100,
      token: 'fresh-new-token',
      connected: false,
    });

    const { result } = renderHook(() => useCompanionConnection());

    await act(async () => {
      await result.current.reconnect();
    });

    expect(result.current.state).toBe('CONNECTING');
    expect(result.current.connection.port).toBe(52100);
    expect(result.current.connection.token).toBe('fresh-new-token');
    expect(result.current.connection.sessionId).toBeNull();
    expect(result.current.isExpired).toBe(false);
  });

  it('6. NO_RUTRACKER_TAB recovery state', async () => {
    (scraperService.checkCompanionAccess as any).mockResolvedValue({
      status: 'NO_RUTRACKER_TAB',
    });

    const { result } = renderHook(() => useCompanionConnection());

    await act(async () => {
      await result.current.checkAccess();
    });

    expect(result.current.state).toBe('NO_RUTRACKER_TAB');
    expect(result.current.errorMessage).toBe('Open RuTracker in your browser to continue.');
  });

  it('7. VERIFICATION_REQUIRED recovery state', async () => {
    (scraperService.checkCompanionAccess as any).mockResolvedValue({
      status: 'VERIFICATION_REQUIRED',
    });

    const { result } = renderHook(() => useCompanionConnection());

    await act(async () => {
      await result.current.checkAccess();
    });

    expect(result.current.state).toBe('VERIFICATION_REQUIRED');
    expect(result.current.errorMessage).toContain('Browser verification is required');
  });

  it('8. TIMEOUT recovery state: 15-second timeout guard prevents infinite loading', async () => {
    // Access check hangs without resolving
    (scraperService.checkCompanionAccess as any).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCompanionConnection());

    act(() => {
      result.current.checkAccess();
    });

    expect(result.current.state).toBe('CHECKING_ACCESS');

    // Advance timer past 15 seconds
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(result.current.state).toBe('TIMEOUT');
    expect(result.current.errorMessage).toBe('Could not confirm browser access.');
    expect(toast.error).toHaveBeenCalledWith('Could not confirm browser access.');
  });

  it('9. Diagnostics security: token is never exposed, maskedSessionId is correctly formatted', async () => {
    (scraperService.getCompanionStatus as any).mockResolvedValue({
      port: 48921,
      token: 'super-sensitive-token-never-display',
      connected: true,
      sessionId: '6e72b0c9-4a92-4f35-9011-85bc2174fbe3',
      extensionVersion: '2.0.0',
      lastSeen: 1728414000000,
    });

    const { result } = renderHook(() => useCompanionConnection());

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(result.current.connection.maskedSessionId).toBe('6e72b0c9...fbe3');
    expect(result.current.connection.extensionVersion).toBe('2.0.0');
    expect(result.current.connection.lastHeartbeat).toBeTruthy();
    // Verify that maskedSessionId does not contain the token
    expect(result.current.connection.maskedSessionId).not.toContain('super-sensitive-token');
  });
});

