export interface FileEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface FileStat {
  mtime: number;
  size: number;
}

export interface ScraperSchedulerConfig {
  enabled: boolean;
  scheduleType: string;
  intervalMinutes: number;
  scope: 'ALL_ENABLED' | 'SELECTED';
  categoryIds: string[];
  lastAttemptAt?: string | null;
  lastStartedAt?: string | null;
  nextRunAt?: string | null;
  lastSkipReason?: string | null;
  transport?: string;
}

export interface ScraperSchedulerStatus extends ScraperSchedulerConfig {
  isCompanionConnected: boolean;
  isScraperBusy: boolean;
  scheduledTransport?: string;
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
    isWindowFocused?: () => Promise<boolean>;
    focusWindow?: () => Promise<boolean>;
    showNotification?: (options: { title: string; body: string; silent?: boolean }) => Promise<boolean>;
  };
  images?: {
    fetch: (url: string, requestId: string) => Promise<{
      ok: boolean; bytes?: Uint8Array; contentType?: string; httpStatus?: number;
      resolvedUrl?: string; status?: string; error?: string; redirects?: number;
    }>;
    cancel: (requestId: string) => void;
  };
  library?: {
    getReadiness?: () => Promise<any>;
    dismissOnboarding?: () => Promise<{ success: boolean; error?: string }>;
    runMigration?: () => Promise<any>;
    getCategories: () => Promise<any[]>;
    getFilterFacets?: (options?: { categoryId?: string }) => Promise<any>;
    getItems: (options?: any) => Promise<any>;
    getItem: (id: string) => Promise<any>;
    getScreenshots: (id: string) => Promise<any>;
    setFavorite: (id: string, isFavorite: boolean) => Promise<any>;
    toggleFavorite: (id: string) => Promise<any>;
    getFavoriteCount: () => Promise<any>;
    ensureNativeImport: (libraryPath: string, options?: any) => Promise<any>;
    refresh: (options: { libraryPath: string; force?: boolean }) => Promise<any>;
    reindex?: () => Promise<{ success: boolean; total?: number; error?: string }>;
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
    selectRestoreFile: () => Promise<{ canceled: boolean; filePath?: string }>;
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
    renewSession: (options?: any) => Promise<{ success: boolean }>;
    probeAccess: (options?: any) => Promise<any>;
    cancel: () => Promise<{ success: boolean; message?: string }>;
    pause?: () => Promise<{ success: boolean; message?: string }>;
    resume?: () => Promise<{ success: boolean; message?: string }>;
    getState: () => Promise<any>;
    clearStorage: () => Promise<{ success: boolean }>;
    reindexLibrary: () => Promise<{ success: boolean; count?: number }>;
    getActiveTransport?: () => Promise<string>;
    getTransportPreference?: () => Promise<{ preference: string; activeTransport: string; isPromoted: boolean; available: any[] }>;
    setTransportPreference?: (preference: string) => Promise<{ success: boolean; preference: string; activeTransport?: string }>;
    setEmbeddedPromoted?: (promoted: boolean) => Promise<{ success: boolean; isPromoted: boolean }>;
    fetchTopic?: (options: { url?: string; topicId?: string; categoryId?: string }) => Promise<any>;
    embeddedVerify?: (options?: any) => Promise<{ success: boolean; status: string; url?: string }>;
    embeddedProbe?: (options?: any) => Promise<any>;
    embeddedResetSession?: () => Promise<{ success: boolean; error?: string }>;
    embeddedStatus?: () => Promise<any>;
    getSyncHistory?: (options?: any) => Promise<any>;
    getSyncRunDetails?: (runId: string) => Promise<any>;
    getSyncHealth?: () => Promise<any>;
    clearSyncHistory?: () => Promise<number>;
    onStateChanged: (callback: (data: any) => void) => () => void;
    onProgress: (callback: (progress: any) => void) => () => void;
    onAccessChanged: (callback: (access: any) => void) => () => void;
    onPageCommitted?: (callback: (data: any) => void) => () => void;
    onRunFinalized?: (callback: (data: any) => void) => () => void;
    getSchedulerStatus?: () => Promise<ScraperSchedulerStatus>;
    updateSchedulerConfig?: (config: Partial<ScraperSchedulerConfig>) => Promise<ScraperSchedulerStatus>;
    runSchedulerDueCheck?: () => Promise<{ executed: boolean; skipped: boolean; reason?: string }>;
    onSchedulerStatusChanged?: (callback: (status: ScraperSchedulerStatus) => void) => () => void;
    onLog: (callback: (log: any) => void) => () => void;
  };
  companion?: {
    connect: () => Promise<{ port: number; token: string; connectionCode?: string | null; connected: boolean }>;
    reconnect?: () => Promise<{ port: number; token: string; connectionCode?: string | null; connected: boolean }>;
    disconnect?: () => Promise<{ port: number | null; token: string | null; connectionCode?: string | null; connected: boolean }>;
    status: () => Promise<{ port: number | null; token: string | null; connectionCode?: string | null; connected: boolean }>;
    openRuTracker: (options?: { categoryId?: string }) => Promise<boolean>;
    checkAccess: (options?: { categoryId?: string }) => Promise<{
      status: string;
      httpStatus: number;
      bytes: number;
      forumDetected: boolean;
      cfMitigated: boolean;
      topicCount?: number;
      categoryId: string;
      categoryName: string;
      url: string;
      error?: string;
    }>;
    fetchXboxPage?: () => Promise<{ status: string; url: string; httpStatus: number; bytes: number; topicCount?: number; fetchedAt: string; error?: string }>;
    fetchTopic?: (options: { url?: string; topicId?: string; categoryId?: string }) => Promise<{
      success: boolean;
      topicId: string;
      title: string;
      categoryName?: string;
      categoryId?: string;
      inserted: number;
      updated: number;
      error?: string;
    }>;
  };
  updater?: {
    getStatus: () => Promise<UpdaterStatus>;
    check: () => Promise<UpdaterStatus>;
    download: () => Promise<UpdaterStatus>;
    install: () => Promise<void>;
    onStatusChanged: (callback: (status: UpdaterStatus) => void) => () => void;
  };
}

export type UpdaterState =
  | 'IDLE'
  | 'CHECKING'
  | 'UP_TO_DATE'
  | 'UPDATE_AVAILABLE'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'INSTALLING'
  | 'ERROR'
  | 'UNSUPPORTED';

export type UpdaterErrorCode =
  | 'DEV_MODE_UNSUPPORTED'
  | 'UNSUPPORTED_INSTALL_TYPE'
  | 'READ_ONLY_LOCATION'
  | 'UPDATE_CHECK_FAILED'
  | 'UPDATE_DOWNLOAD_FAILED'
  | 'UPDATE_INSTALL_FAILED'
  | 'NETWORK_UNAVAILABLE'
  | 'RELEASE_METADATA_INVALID'
  | 'UPDATE_METADATA_MISSING'
  | 'SYNC_IN_PROGRESS'
  | 'UNKNOWN';

export interface UpdaterStatus {
  state: UpdaterState;
  currentVersion: string;
  availableVersion: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  downloadUrl: string | null;
  progress: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
  errorCode: UpdaterErrorCode | null;
  errorMessage: string | null;
  lastCheckedAt: string | null;
  isSupported: boolean;
  channel: string;
}

declare global {
  interface Window {
    rtLibrary?: RTLibraryAPI;
    electronAPI?: any;
  }
}
