import { useState, useEffect, useCallback, useRef } from 'react';
import { scraperService } from '@/services/scraperService';
import { toast } from 'sonner';

export type CompanionConnectionState =
  | 'NOT_INSTALLED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CHECKING_ACCESS'
  | 'READY'
  | 'VERIFICATION_REQUIRED'
  | 'NO_RUTRACKER_TAB'
  | 'TIMEOUT'
  | 'ERROR';

export interface CompanionConnectionDetails {
  port: number | null;
  token: string | null;
  connectionCode: string | null;
  sessionId: string | null;
  maskedSessionId: string | null;
  lastHeartbeat: string | null;
  lastAccessCheck: string | null;
  extensionVersion: string | null;
}

export interface UseCompanionConnectionOptions {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReady?: () => void;
  onExpired?: () => void;
}

export function useCompanionConnection(options: UseCompanionConnectionOptions = {}) {
  // App start always initializes as DISCONNECTED (Requirement 10: never persist CONNECTED or READY across sessions)
  const [state, setState] = useState<CompanionConnectionState>('DISCONNECTED');
  const [connection, setConnection] = useState<CompanionConnectionDetails>({
    port: null,
    token: null,
    connectionCode: null,
    sessionId: null,
    maskedSessionId: null,
    lastHeartbeat: null,
    lastAccessCheck: null,
    extensionVersion: null,
  });
  const [topicCount, setTopicCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  // Keep references for stable callbacks inside timers
  const stateRef = useRef<CompanionConnectionState>(state);
  stateRef.current = state;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const maskSessionId = (id: string | null): string | null => {
    if (!id || id.length < 8) return id ? `${id.slice(0, 4)}...` : null;
    return `${id.slice(0, 8)}...${id.slice(-4)}`;
  };

  const updateFromStatus = useCallback((status: any) => {
    if (!status) return;

    setConnection((prev) => ({
      ...prev,
      port: status.port ?? prev.port,
      token: status.token ?? prev.token,
      connectionCode:
        status.connectionCode ??
        (status.port && status.token
          ? `${status.port}:${status.token}`
          : prev.port && prev.token
          ? `${prev.port}:${prev.token}`
          : null),
      sessionId: status.sessionId ?? prev.sessionId,
      maskedSessionId: maskSessionId(status.sessionId ?? prev.sessionId),
      lastHeartbeat: status.lastSeen ? new Date(status.lastSeen).toISOString() : prev.lastHeartbeat,
      extensionVersion: status.extensionVersion ?? prev.extensionVersion,
    }));

    const isBridgeConnected = Boolean(status.connected);
    const currentState = stateRef.current;

    // Transition from CONNECTING to CONNECTED once handshake is confirmed
    if (currentState === 'CONNECTING' && isBridgeConnected) {
      setState('CONNECTED');
      setIsExpired(false);
      setErrorMessage(null);
      toast.success('Browser Companion connected');
      optionsRef.current.onConnected?.();
    }
    // Transition from active session to DISCONNECTED if heartbeat expires / extension unloads
    else if ((currentState === 'CONNECTED' || currentState === 'READY' || currentState === 'CHECKING_ACCESS') && !isBridgeConnected) {
      setState('DISCONNECTED');
      setIsExpired(true);
      setErrorMessage('Connection expired. Reconnect to continue synchronization.');
      toast.error('Connection expired');
      optionsRef.current.onExpired?.();
      optionsRef.current.onDisconnected?.();
    }
  }, []);

  // Polling bridge status every 2500ms
  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const status = await scraperService.getCompanionStatus?.();
        if (active && status) {
          updateFromStatus(status);
        }
      } catch {
        // Bridge may be temporarily idle
      }
    };

    check();
    const interval = window.setInterval(check, 2500);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [updateFromStatus]);

  const connect = useCallback(async () => {
    try {
      setErrorMessage(null);
      setIsExpired(false);
      setState('CONNECTING');
      const value = await scraperService.connectCompanion?.();
      if (value) {
        setConnection((prev) => ({
          ...prev,
          port: value.port,
          token: value.token,
          connectionCode: (value as any).connectionCode ?? (value.port && value.token ? `${value.port}:${value.token}` : null),
        }));
        if (value.connected) {
          setState('CONNECTED');
          toast.success('Browser Companion connected');
          optionsRef.current.onConnected?.();
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to start Browser Companion bridge';
      setErrorMessage(msg);
      setState('ERROR');
      toast.error(msg);
    }
  }, []);

  const reconnect = useCallback(async () => {
    try {
      setErrorMessage(null);
      setIsExpired(false);
      // Invalidate existing session, clean bridge, request fresh code
      setState('CONNECTING');
      const value = await scraperService.reconnectCompanion?.();
      if (value) {
        setConnection((prev) => ({
          ...prev,
          port: value.port,
          token: value.token,
          connectionCode: (value as any).connectionCode ?? (value.port && value.token ? `${value.port}:${value.token}` : null),
          sessionId: null,
          maskedSessionId: null,
        }));
        if (value.connected) {
          setState('CONNECTED');
          toast.success('Browser Companion connected');
          optionsRef.current.onConnected?.();
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to reconnect Browser Companion bridge';
      setErrorMessage(msg);
      setState('ERROR');
      toast.error(msg);
    }
  }, []);

  const checkAccess = useCallback(async (categoryId?: string): Promise<boolean> => {
    setState('CHECKING_ACCESS');
    setErrorMessage(null);

    let hasTimedOut = false;
    // 15-second timeout guard to prevent infinite loading
    const timeoutTimer = window.setTimeout(() => {
      hasTimedOut = true;
      setState('TIMEOUT');
      setErrorMessage('Could not confirm browser access.');
      toast.error('Could not confirm browser access.');
    }, 15000);

    try {
      const result = await scraperService.checkCompanionAccess?.(categoryId);
      if (hasTimedOut) return false;
      window.clearTimeout(timeoutTimer);

      const now = new Date().toISOString();
      setConnection((prev) => ({ ...prev, lastAccessCheck: now }));

      if (result?.status === 'FORUM_READY') {
        setState('READY');
        setTopicCount(result.topicCount ?? 0);
        toast.success(`Access confirmed · ${result.topicCount ?? 0} topics parsed`);
        optionsRef.current.onReady?.();
        return true;
      } else if (
        result?.status === 'VERIFICATION_REQUIRED' ||
        result?.status === 'INTERACTION_REQUIRED' ||
        result?.status === 'CHALLENGE_REQUIRED'
      ) {
        setState('VERIFICATION_REQUIRED');
        setErrorMessage('Browser verification is required. Complete the verification in the open RuTracker tab, then return here.');
        toast.error('Browser verification is required');
        return false;
      } else if (result?.status === 'NO_RUTRACKER_TAB') {
        setState('NO_RUTRACKER_TAB');
        setErrorMessage('Open RuTracker in your browser to continue.');
        return false;
      } else {
        setState('ERROR');
        setErrorMessage(result?.error || 'Forum access could not be confirmed');
        return false;
      }
    } catch (err: any) {
      if (hasTimedOut) return false;
      window.clearTimeout(timeoutTimer);

      const msg = String(err?.message || 'Error checking access');
      if (msg.includes('TIMEOUT') || msg.includes('REQUEST_TIMEOUT')) {
        setState('TIMEOUT');
        setErrorMessage('Could not confirm browser access.');
        toast.error('Could not confirm browser access.');
      } else if (msg.includes('NO_RUTRACKER_TAB')) {
        setState('NO_RUTRACKER_TAB');
        setErrorMessage('Open RuTracker in your browser to continue.');
      } else if (msg.includes('VERIFICATION_REQUIRED') || msg.includes('INTERACTION_REQUIRED')) {
        setState('VERIFICATION_REQUIRED');
        setErrorMessage('Browser verification is required. Complete the verification in the open RuTracker tab, then return here.');
      } else if (msg.includes('COMPANION_NOT_CONNECTED') || msg.includes('DISCONNECTED')) {
        setState('DISCONNECTED');
        setIsExpired(true);
        setErrorMessage('Connection expired. Reconnect to continue synchronization.');
      } else {
        setState('ERROR');
        setErrorMessage(msg);
      }
      return false;
    }
  }, []);

  const openRuTracker = useCallback(async (categoryId?: string): Promise<boolean> => {
    try {
      return (await scraperService.openCompanionRuTracker?.(categoryId)) ?? false;
    } catch (err: any) {
      const msg = err?.message || 'Failed to open RuTracker';
      setErrorMessage(msg);
      toast.error(msg);
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await scraperService.disconnectCompanion();
      setState('DISCONNECTED');
      setErrorMessage(null);
      setIsExpired(false);
      optionsRef.current.onDisconnected?.();
    } catch {
      setState('DISCONNECTED');
    }
  }, []);

  const resetToDisconnected = useCallback(() => {
    setState('DISCONNECTED');
    setErrorMessage(null);
    setIsExpired(false);
  }, []);

  const setNotInstalled = useCallback(() => {
    setState('NOT_INSTALLED');
    setErrorMessage('Browser Companion is not detected.');
  }, []);

  return {
    state,
    connection,
    topicCount,
    errorMessage,
    isExpired,
    connect,
    reconnect,
    disconnect,
    checkAccess,
    openRuTracker,
    resetToDisconnected,
    setNotInstalled,
  };
}
