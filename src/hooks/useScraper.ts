/**
 * Custom React Hook for RuTracker Scraper UI Integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  scraperService,
  ScraperState,
  ScraperOptions,
  ScraperProgress,
  ScraperLog,
} from '../services/scraperService';

export interface UseScraperReturn {
  state: ScraperState;
  progress: ScraperProgress | null;
  logs: ScraperLog[];
  totalLogEntries: number;
  isRunning: boolean;
  error: string | null;
  startScraper: (options?: ScraperOptions) => Promise<void>;
  renewSession: (options?: ScraperOptions) => Promise<void>;
  cancelScraper: () => Promise<void>;
  clearScraperStorage: () => Promise<void>;
  reindexLibrary: () => Promise<number | undefined>;
  clearLogs: () => void;
  getCurrentLog: () => Promise<string>;
  exportLog: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openLogsFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
  refreshState: () => Promise<void>;
}

export function useScraper(): UseScraperReturn {
  const [state, setState] = useState<ScraperState>('idle');
  const [progress, setProgress] = useState<ScraperProgress | null>(null);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [totalLogEntries, setTotalLogEntries] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const isRunning = ['starting', 'running', 'cancelling'].includes(state);

  const refreshState = useCallback(async () => {
    try {
      const current = await scraperService.getState();
      setState(current.state);
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
      setState(data.state);
      if (data.error) setError(data.error);
      else if (data.state === 'running' || data.state === 'starting') {
        setError(null);
      }
    });

    const unsubProgress = scraperService.onProgress((prog) => {
      setProgress(prog);
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
      unsubLog();
    };
  }, [refreshState]);

  const startScraper = useCallback(async (options: ScraperOptions = {}) => {
    setError(null);
    setLogs([]);
    setTotalLogEntries(0);
    try {
      await scraperService.start({
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

  const cancelScraper = useCallback(async () => {
    try {
      await scraperService.cancel();
    } catch (err: any) {
      setError(err.message || 'Falha ao cancelar o scraper');
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
    error,
    startScraper,
    renewSession,
    cancelScraper,
    clearScraperStorage,
    reindexLibrary,
    clearLogs,
    getCurrentLog,
    exportLog,
    openLogsFolder,
    refreshState,
  };
}
