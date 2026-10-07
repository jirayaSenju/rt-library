export interface TorrentMetadataRecord {
  itemId: string;
  infoHash: string | null;
  torrentName: string | null;
  totalSizeBytes: number | null;
  fileCount: number;
  files: Array<{ name: string; path: string; length: number }>;
  trackers: string[];
  seeds: number | null;
  leechers: number | null;
  peers: number | null;
  metadataStatus: 'pending' | 'fetching' | 'complete' | 'partial' | 'failed' | 'unavailable';
  swarmStatus: 'pending' | 'fetching' | 'complete' | 'failed' | 'stale';
  metadataFetchedAt: string | null;
  swarmFetchedAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  attempts: number;
  lastError: string | null;
  metadataSource: string | null;
  swarmSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TorrentCollectionProgress {
  isCollecting: boolean;
  processed: number;
  total: number;
  complete: number;
  failed: number;
  percent: number;
  currentItemTitle?: string;
}

export class TorrentMetadataService {
  async getItemMetadata(itemId: string): Promise<TorrentMetadataRecord | null> {
    if (typeof window !== "undefined" && window.electronAPI?.torrent?.getMetadata) {
      return window.electronAPI.torrent.getMetadata(itemId);
    }
    return null;
  }

  async refreshItemMetadata(itemId: string, magnetUrl?: string): Promise<boolean> {
    if (typeof window !== "undefined" && window.electronAPI?.torrent?.refreshMetadata) {
      return window.electronAPI.torrent.refreshMetadata(itemId, magnetUrl);
    }
    return false;
  }

  async startCollection(mode: 'all' | 'missing' | 'zero' = 'all'): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
    if (typeof window !== "undefined" && (window as any).electronAPI?.torrent?.startCollection) {
      return (window as any).electronAPI.torrent.startCollection(mode);
    }
    return { success: false, error: "IPC unavailable" };
  }

  async stopCollection(): Promise<{ success: boolean }> {
    if (typeof window !== "undefined" && (window as any).electronAPI?.torrent?.stopCollection) {
      return (window as any).electronAPI.torrent.stopCollection();
    }
    return { success: false };
  }

  async getCollectionProgress(): Promise<TorrentCollectionProgress> {
    if (typeof window !== "undefined" && (window as any).electronAPI?.torrent?.getCollectionProgress) {
      return (window as any).electronAPI.torrent.getCollectionProgress();
    }
    return { isCollecting: false, processed: 0, total: 0, complete: 0, failed: 0, percent: 0 };
  }

  onCollectionProgress(callback: (data: TorrentCollectionProgress) => void): () => void {
    if (typeof window !== "undefined" && (window as any).electronAPI?.torrent?.onCollectionProgress) {
      return (window as any).electronAPI.torrent.onCollectionProgress(callback);
    }
    return () => {};
  }

  onMetadataUpdated(callback: (data: { itemId: string; record: TorrentMetadataRecord }) => void): () => void {
    if (typeof window !== "undefined" && window.electronAPI?.torrent?.onMetadataUpdated) {
      return window.electronAPI.torrent.onMetadataUpdated(callback);
    }
    return () => {};
  }

  // Legacy fallback for infoHash
  async getMetadata(infoHash?: string): Promise<any | null> {
    if (!infoHash) return null;
    return { infoHash, status: "pending", files: [], trackers: [] };
  }
}

export const torrentMetadataService = new TorrentMetadataService();
