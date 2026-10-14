import { UpdaterStatus } from '../platform/types';

class UpdaterService {
  private listeners: Set<(status: UpdaterStatus) => void> = new Set();
  private unsubscribeIpc: (() => void) | null = null;
  private currentStatus: UpdaterStatus | null = null;

  constructor() {
    this.initListener();
  }

  private initListener() {
    if (typeof window === 'undefined' || !window.rtLibrary?.updater?.onStatusChanged) {
      return;
    }

    this.unsubscribeIpc = window.rtLibrary.updater.onStatusChanged((status) => {
      this.currentStatus = status;
      this.notifyListeners(status);
    });
  }

  private notifyListeners(status: UpdaterStatus) {
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[UPDATER_SERVICE] Listener error:', err);
      }
    }
  }

  subscribe(callback: (status: UpdaterStatus) => void): () => void {
    this.listeners.add(callback);
    if (this.currentStatus) {
      callback(this.currentStatus);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }

  async getStatus(): Promise<UpdaterStatus> {
    if (!window.rtLibrary?.updater) {
      return {
        state: 'UNSUPPORTED',
        currentVersion: '1.1.0',
        availableVersion: null,
        releaseDate: null,
        releaseNotes: null,
        downloadUrl: null,
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        errorCode: 'UNSUPPORTED_INSTALL_TYPE',
        errorMessage: 'Updates not supported in this environment.',
        lastCheckedAt: null,
        isSupported: false,
        channel: 'stable',
      };
    }

    const status = await window.rtLibrary.updater.getStatus();
    this.currentStatus = status;
    return status;
  }

  async checkForUpdates(): Promise<UpdaterStatus> {
    if (!window.rtLibrary?.updater) {
      throw new Error('Updater not available.');
    }
    const status = await window.rtLibrary.updater.check();
    this.currentStatus = status;
    return status;
  }

  async downloadUpdate(): Promise<UpdaterStatus> {
    if (!window.rtLibrary?.updater) {
      throw new Error('Updater not available.');
    }
    const status = await window.rtLibrary.updater.download();
    this.currentStatus = status;
    return status;
  }

  async installUpdate(): Promise<void> {
    if (!window.rtLibrary?.updater) {
      throw new Error('Updater not available.');
    }
    await window.rtLibrary.updater.install();
  }
}

export const updaterService = new UpdaterService();

