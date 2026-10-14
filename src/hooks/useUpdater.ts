import { useState, useEffect, useCallback } from 'react';
import { UpdaterStatus } from '../platform/types';
import { updaterService } from '../services/updaterService';

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>({
    state: 'IDLE',
    currentVersion: '1.1.0',
    availableVersion: null,
    releaseDate: null,
    releaseNotes: null,
    downloadUrl: null,
    progress: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 0,
    errorCode: null,
    errorMessage: null,
    lastCheckedAt: null,
    isSupported: true,
    channel: 'stable',
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    updaterService.getStatus().then((initialStatus) => {
      if (isMounted) {
        setStatus(initialStatus);
      }
    }).catch(console.error);

    const unsubscribe = updaterService.subscribe((newStatus) => {
      if (isMounted) {
        setStatus(newStatus);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await updaterService.checkForUpdates();
      setStatus(res);
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await updaterService.downloadUpdate();
      setStatus(res);
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setIsLoading(true);
    try {
      await updaterService.installUpdate();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    isLoading,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}

