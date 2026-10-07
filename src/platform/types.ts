export interface FileEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileStat {
  mtime: number;
  size: number;
}

export interface RTLibraryAPI {
  dialogs: {
    selectFolder: () => Promise<string | null>;
  };
  filesystem: {
    readDir: (dirPath: string) => Promise<FileEntry[]>;
    readFile: (filePath: string) => Promise<string>;
    readBinaryFile: (filePath: string) => Promise<Uint8Array | null>;
    statFile: (filePath: string) => Promise<FileStat | null>;
    exists: (filePath: string) => Promise<boolean>;
    mkdir: (dirPath: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<boolean>;
    openMagnet: (magnetUrl: string, title?: string) => Promise<boolean>;
  };
  system: {
    getConfigDir: () => Promise<string>;
    loadAppConfig: () => Promise<Record<string, any> | null>;
    saveAppConfig: (configData: Record<string, any>) => Promise<boolean>;
    loadSqliteDb: () => Promise<Uint8Array | null>;
    saveSqliteDb: (data: Uint8Array) => Promise<boolean>;
  };
  images?: {
    fetch: (url: string, requestId: string) => Promise<{
      ok: boolean; bytes?: Uint8Array; contentType?: string; httpStatus?: number;
      resolvedUrl?: string; status?: string; error?: string; redirects?: number;
    }>;
    cancel: (requestId: string) => void;
  };
  library?: {
    getCapabilities: () => Promise<any>;
    getCategories: () => Promise<any[]>;
    getItems: (options?: any) => Promise<any>;
    getItem: (id: string) => Promise<any>;
    getScreenshots: (id: string) => Promise<any>;
    setFavorite: (id: string, isFavorite: boolean) => Promise<any>;
    toggleFavorite: (id: string) => Promise<any>;
    getFavoriteCount: () => Promise<any>;
    ensureNativeImport: (libraryPath: string, options?: any) => Promise<any>;
    refresh: (options: { libraryPath: string; force?: boolean }) => Promise<any>;
    getIndexStatus: () => Promise<any>;
    getAllImageUrls?: () => Promise<{
      success: boolean;
      items: Array<{ id: string; title: string; coverUrl: string | null; screenshots: string[] }>;
      totalItems: number;
      totalCovers: number;
      totalScreenshots: number;
      error?: string;
    }>;
    onIndexProgress: (callback: (data: any) => void) => () => void;
  };
  database?: {
    getOverview: () => Promise<any>;
    getTables: () => Promise<any[]>;
    getRows: (options: { table: string; limit: 50 | 100 | 200; offset: number; orderBy?: string; order?: 'asc' | 'desc'; searchColumn?: string; searchValue?: string }) => Promise<any>;
    executeReadQuery: (sql: string) => Promise<any>;
    explainQuery: (sql: string) => Promise<any>;
    integrityCheck: (full: boolean) => Promise<any>;
    checkpoint: () => Promise<any>;
    optimize: () => Promise<{ success: boolean; durationMs?: number }>;
    openFolder: (targetPath?: string) => Promise<boolean>;
    getBackupSchedule: () => Promise<any>;
    saveBackupSchedule: (config: any) => Promise<any>;
    getBackupHistory: (customDir?: string) => Promise<any[]>;
    verifyBackup: (filePath: string) => Promise<any>;
    deleteBackup: (filePath: string) => Promise<{ success: boolean }>;
    selectBackupDirectory: () => Promise<{ canceled: boolean; directory?: string }>;
    createBackup: (options?: { useSaveDialog?: boolean }) => Promise<{ canceled: boolean; size?: number; durationMs?: number; filePath?: string; fileName?: string }>;
    restoreBackup: (customFilePath?: string) => Promise<{ canceled: boolean; success?: boolean; automaticBackupPath?: string }>;
    runVacuum: () => Promise<{ success: boolean; durationMs?: number }>;
    runDataCleanup: (options?: { execute?: boolean }) => Promise<any>;
    exportTable: (options: { table: string; format?: 'csv' | 'json' }) => Promise<{ canceled: boolean; filePath?: string; totalRows?: number }>;
    onRestored: (callback: () => void) => () => void;
  };
  torrent?: {
    getMetadata: (itemId: string) => Promise<any>;
    refreshMetadata: (itemId: string) => Promise<boolean>;
    getQueueStatus: () => Promise<any>;
    onMetadataUpdated: (callback: (data: any) => void) => () => void;
  };
  scraper?: {
    start: (options?: any) => Promise<{ success: boolean }>;
    cancel: () => Promise<{ success: boolean; message?: string }>;
    getState: () => Promise<any>;
    clearStorage: () => Promise<{ success: boolean }>;
    reindexLibrary: () => Promise<{ success: boolean; count?: number }>;
    onStateChanged: (callback: (data: any) => void) => () => void;
    onProgress: (callback: (progress: any) => void) => () => void;
    onLog: (callback: (log: any) => void) => () => void;
  };
}

declare global {
  interface Window {
    rtLibrary?: RTLibraryAPI;
    electronAPI?: any;
  }
}
