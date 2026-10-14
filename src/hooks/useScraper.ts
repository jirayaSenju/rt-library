/**
 * Custom React Hook for RuTracker Scraper UI Integration
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  scraperService,
  ScraperState,
  ScraperOptions,
  ScraperProgress,
  ScraperLog,
  ScraperAccessStatus,
  ScraperStartResult,
} from '../services/scraperService';

export interface UseScraperReturn {
  state: ScraperState;
  progress: ScraperProgress | null;
  logs: ScraperLog[];
  totalLogEntries: number;
  isRunning: boolean;
  isPaused: boolean;
  error: string | null;
  access: ScraperAccessStatus | null;
  startScraper: (options?: ScraperOptions) => Promise<ScraperStartResult>;
  renewSession: (options?: ScraperOptions) => Promise<void>;
  probeAccess: (options?: ScraperOptions) => Promise<ScraperAccessStatus>;
  cancelScraper: () => Promise<void>;
  pauseScraper: () => Promise<void>;
  resumeScraper: () => Promise<void>;
  clearScraperStorage: () => Promise<void>;
  reindexLibrary: () => Promise<number | undefined>;
  clearLogs: () => void;
  getCurrentLog: () => Promise<string>;
  exportLog: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openLogsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  refreshState: () => Promise<void>;
}

const ScraperContext = createContext<UseScraperReturn | null>(null);

function useScraperBase(): UseScraperReturn {
  const [state, setState] = useState<ScraperState>('idle');
  const [progress, setProgress] = useState<ScraperProgress | null>(null);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [totalLogEntries, setTotalLogEntries] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<ScraperAccessStatus | null>(null);
  const statusVersion = useRef(0);

  const isRunning = ['preflight', 'starting', 'verifying', 'reprobing', 'running', 'pausing', 'paused', 'resuming', 'cancelling'].includes(state);
  const isPaused = state === 'paused';

  const refreshState = useCallback(async () => {
    const requestedVersion = statusVersion.current;
    try {
      const current = await scraperService.getState();
      if (statusVersion.current !== requestedVersion) return;
      setState(current.state);
      if (current.access) setAccess(current.access);
      if (current.progress) setProgress(current.progress);
      if (current.logs && current.logs.length > 0) {
        setLogs(current.logs.slice(-200));
        setTotalLogEntries(current.logs.length);
      }
    } catch (err: any) {
      console.warn('Failed to fetch scraper state:', err.message);
    }
  }, []);

  useEffect(() => {
    refreshState();

    const unsubState = scraperService.onStateChanged((data) => {
      statusVersion.current += 1;
      setState(data.state);
      if (data.error) setError(data.error);
      else if (data.state === 'running' || data.state === 'starting' || data.state === 'verifying' || data.state === 'reprobing') {
        setError(null);
      }
    });

    const unsubProgress = scraperService.onProgress((prog) => {
      statusVersion.current += 1;
      setProgress(prog);
    });

    const unsubAccess = scraperService.onAccessChanged((result) => {
      statusVersion.current += 1;
      setAccess(result);
    });

    const unsubLog = scraperService.onLog((log) => {
      setTotalLogEntries((prev) => prev + 1);
      setLogs((prev) => {
        const next = [...prev, log];
        return next.length > 200 ? next.slice(-200) : next;
      });
    });

    return () => {
      unsubState();
      unsubProgress();
      unsubAccess();
      unsubLog();
    };
  }, [refreshState]);

  const startScraper = useCallback(async (options: ScraperOptions = {}): Promise<ScraperStartResult> => {
    setError(null);
    setLogs([]);
    setTotalLogEntries(0);
    try {
      return await scraperService.start({
        headless: true, // Always enforce headless mode for UI runs
        ...options,
      });
    } catch (err: any) {
      setError(err.message || 'Falha ao iniciar o scraper');
      throw err;
    }
  }, []);

  const renewSession = useCallback(async (options: ScraperOptions = {}) => {
    setError(null);
    setLogs([]);
    setTotalLogEntries(0);
    try {
      await scraperService.renewSession(options);
    } catch (err: any) {
      setError(err.message || 'Falha ao renovar sessão do scraper');
      throw err;
    }
  }, []);

  const probeAccess = useCallback(async (options: ScraperOptions = {}) => {
    const result = await scraperService.probeAccess(options);
    setAccess(result);
    return result;
  }, []);

  const cancelScraper = useCallback(async () => {
    try {
      await scraperService.cancel();
    } catch (err: any) {
      setError(err.message || 'Falha ao cancelar o scraper');
    }
  }, []);

  const pauseScraper = useCallback(async () => {
    try {
      await scraperService.pause();
    } catch (err: any) {
      setError(err.message || 'Falha ao pausar o scraper');
    }
  }, []);

  const resumeScraper = useCallback(async () => {
    try {
      await scraperService.resume();
    } catch (err: any) {
      setError(err.message || 'Falha ao retomar o scraper');
    }
  }, []);

  const clearScraperStorage = useCallback(async () => {
    try {
      await scraperService.clearStorage();
    } catch (err: any) {
      setError(err.message || 'Falha ao limpar cache do scraper');
      throw err;
    }
  }, []);

  const reindexLibrary = useCallback(async () => {
    try {
      const res = await scraperService.reindexLibrary();
      return res.count;
    } catch (err: any) {
      setError(err.message || 'Falha ao reindexar biblioteca');
      throw err;
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const getCurrentLog = useCallback(async () => {
    return await scraperService.getCurrentLog();
  }, []);

  const exportLog = useCallback(async () => {
    return await scraperService.exportLog();
  }, []);

  const openLogsFolder = useCallback(async () => {
    return await scraperService.openLogsFolder();
  }, []);

  return {
    state,
    progress,
    logs,
    totalLogEntries,
    isRunning,
    isPaused,
    error,
    access,
    startScraper,
    renewSession,
    probeAccess,
    cancelScraper,
    pauseScraper,
    resumeScraper,
    clearScraperStorage,
    reindexLibrary,
    clearLogs,
    getCurrentLog,
    exportLog,
    openLogsFolder,
    refreshState,
  };
}

export const ScraperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useScraperBase();
  return React.createElement(ScraperContext.Provider, { value }, children);
};

export function useScraper(): UseScraperReturn {
  const context = useContext(ScraperContext);
  if (context) return context;
  return useScraperBase();
}
