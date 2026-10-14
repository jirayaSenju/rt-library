/**
 * Scraper Service - React Renderer API Bridge
 * Interfaces with Electron Preload scraper IPC
 */

export type ScraperState =
  | 'idle'
  | 'preflight'
  | 'starting'
  | 'verifying'
  | 'reprobing'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'resuming'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'session_required'
  | 'interaction_required'
  | 'auth_required';

export type CategoryAccessStatus =
  | 'ACCESSIBLE'
  | 'ACCESSIBLE_EMPTY'
  | 'INTERACTION_REQUIRED'
  | 'VERIFICATION_LOOP'
  | 'AUTH_REQUIRED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ScraperCategoryAccess {
  categoryId: string | null;
  categoryName: string;
  url: string;
  status: CategoryAccessStatus;
  httpStatus: number | null;
  challengeDetected: boolean;
  authenticationRequired: boolean;
  interactionRequired?: boolean;
  isVerificationLoop?: boolean;
  verificationOutcome?: string;
  challengeType?: string | null;
  reason?: string;
  errorType?: string | null;
  checkedAt: string | null;
  message: string;
  transport?: string;
}

export interface ScraperAccessStatus {
  status: 'UNKNOWN' | 'CHECKING' | 'READY' | 'PARTIALLY_READY' | 'INTERACTION_REQUIRED' | 'AUTH_REQUIRED' | 'NETWORK_ERROR' | 'ERROR';
  scanReady: boolean;
  accessibleCount: number;
  expectedCount: number;
  scope?: 'all' | 'single';
  categoryIds?: string[];
  currentCategoryId?: string;
  checkedAt?: string;
  error?: string;
  results: ScraperCategoryAccess[];
}

export interface ScraperOptions {
  full?: boolean;
  login?: boolean;
  headed?: boolean;
  category?: string | null;
  refreshScreenshots?: boolean;
  refreshSizes?: boolean;
  refreshFiles?: boolean;
  ignoreEarlyStop?: boolean;
  knownPageLimit?: number;
  headless?: boolean;
  dataDir?: string | null;
  transport?: string;
  fastDiscovery?: boolean;
  enrichTopics?: boolean;
}

export interface CategoryProgressStatus {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'paused' | 'failed';
  itemsCount?: number;
}

export interface ScraperProgress {
  category?: string;
  categoryName?: string;
  categoryIndex?: number;
  totalCategories?: number;
  categoryStatuses?: CategoryProgressStatus[];
  currentPage?: number;
  totalPages?: number;
  processedItems?: number;
  newItems?: number;
  totalItems?: number;
  updatedItems?: number;
  topicsDiscovered?: number;
  newTopics?: number;
  knownTopics?: number;
  detailsProcessed?: number;
  detailsTotal?: number;
  status?: string;
  elapsedMs?: number;
}

export interface SyncRunFinalizedEvent {
  runId: string;
  status: 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'CANCELLED' | 'FAILED' | 'INTERRUPTED';
  newItems: number;
  updatedItems: number;
  savedItems: number;
  categoriesCompleted: number;
  categoriesTotal: number;
  errorCode: string | null;
  errorSummary: string | null;
  cancelledByUser: boolean;
}

export interface ScraperLog {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface ScraperManagerStatus {
  state: ScraperState;
  progress: ScraperProgress | null;
  logs: ScraperLog[];
  isRunning: boolean;
  startTime?: number | null;
  access?: ScraperAccessStatus;
  pendingScan?: boolean;
  verificationOutcome?: string;
  activeTransport?: string;
  companionConnected?: boolean;
}

export interface ScraperStartResult {
  success: boolean;
  blocked?: boolean;
  reason?: string;
}

export interface RuTrackerHtmlImportResult {
  status: 'IMPORT_SUCCESS' | 'IMPORT_PARTIAL' | 'INVALID_HTML' | 'UNSUPPORTED_PAGE' | 'FILE_TOO_LARGE' | 'FILE_READ_ERROR' | 'PARSE_ERROR' | 'IMPORT_ERROR' | 'CANCELLED';
  pageType?: 'CATEGORY_PAGE' | 'TOPIC_PAGE' | 'UNKNOWN';
  categoryId?: string | null;
  categoryName?: string;
  filename?: string;
  imported?: number;
  updated?: number;
  skipped?: number;
  invalid?: number;
  parsedCount?: number;
  warnings?: string[];
  message?: string;
  reason?: 'CATEGORY_REQUIRED' | 'TOPIC_ID_MISSING';
  durationMs?: number;
  importedAt?: string;
}

export function importFailureTranslationKey(result: RuTrackerHtmlImportResult): string {
  if (result.reason === 'CATEGORY_REQUIRED') return 'onboarding.importCategoryRequired';
  if (result.reason === 'TOPIC_ID_MISSING') return 'onboarding.importTopicIdMissing';
  const keys: Record<RuTrackerHtmlImportResult['status'], string> = {
    IMPORT_SUCCESS: 'onboarding.importFailed', IMPORT_PARTIAL: 'onboarding.importFailed',
    INVALID_HTML: 'onboarding.importInvalidHtml', UNSUPPORTED_PAGE: 'onboarding.importUnsupportedPage',
    FILE_TOO_LARGE: 'onboarding.importFileTooLarge', FILE_READ_ERROR: 'onboarding.importFileReadError',
    PARSE_ERROR: 'onboarding.importParseError', IMPORT_ERROR: 'onboarding.importDatabaseError', CANCELLED: 'onboarding.importFailed',
  };
  return keys[result.status];
}

class ScraperService {
  private get api() {
    return window.electronAPI?.scraper || window.rtLibrary?.scraper;
  }

  isAvailable(): boolean {
    return !!this.api;
  }

  async start(options: ScraperOptions = {}): Promise<ScraperStartResult> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.start(options);
  }

  async importRuTrackerHtml(categoryId?: string | null): Promise<RuTrackerHtmlImportResult> {
    const api = window.rtLibrary?.library || window.electronAPI?.library || window.rtLibrary?.scraper;
    if (!api?.importRuTrackerHtml) throw new Error('HTML import is not available');
    return await api.importRuTrackerHtml(categoryId ? { categoryId } : {});
  }

  async renewSession(options: ScraperOptions = {}): Promise<{ success: boolean }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    if (this.api.renewSession) {
      return await this.api.renewSession(options);
    }
    return await this.api.start({ ...options, login: true, headed: true });
  }

  async probeAccess(options: ScraperOptions = {}): Promise<ScraperAccessStatus> {
    if (!this.api?.probeAccess) throw new Error('Scraper access verification is not available');
    return await this.api.probeAccess(options);
  }

  async cancel(): Promise<{ success: boolean; message?: string }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.cancel();
  }

  async pause(): Promise<{ success: boolean; message?: string }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    if (!this.api.pause) return { success: false, message: 'Pause is not supported' };
    return await this.api.pause();
  }

  async resume(): Promise<{ success: boolean; message?: string }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    if (!this.api.resume) return { success: false, message: 'Resume is not supported' };
    return await this.api.resume();
  }

  async getState(): Promise<ScraperManagerStatus> {
    if (!this.api) {
      return {
        state: 'idle',
        progress: null,
        logs: [],
        isRunning: false,
      };
    }
    return await this.api.getState();
  }

  async clearStorage(): Promise<{ success: boolean }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.clearStorage();
  }

  async reindexLibrary(): Promise<{ success: boolean; count?: number }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.reindexLibrary();
  }

  async getCurrentLog(): Promise<string> {
    if (!this.api?.getCurrentLog) return '';
    return await this.api.getCurrentLog();
  }

  async exportLog(): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
    if (!this.api?.exportLog) return { success: false, error: 'Export API not available' };
    return await this.api.exportLog();
  }

  async openLogsFolder(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.api?.openLogsFolder) return { success: false, error: 'Open folder API not available' };
    return await this.api.openLogsFolder();
  }

  async getCategories(): Promise<import('@/types/scraper').ScraperCategory[]> {
    if (!this.api?.getCategories) {
      const { DEFAULT_CATEGORIES } = await import('@/scraper/defaultCategories');
      return DEFAULT_CATEGORIES;
    }
    return await this.api.getCategories();
  }

  async createCategory(data: import('@/types/scraper').CreateCategoryDTO): Promise<import('@/types/scraper').ScraperCategory> {
    if (!this.api?.createCategory) throw new Error('Create Category API is not available');
    return await this.api.createCategory(data);
  }

  async updateCategory(id: string, updates: import('@/types/scraper').UpdateCategoryDTO): Promise<import('@/types/scraper').ScraperCategory> {
    if (!this.api?.updateCategory) throw new Error('Update Category API is not available');
    return await this.api.updateCategory(id, updates);
  }

  async deleteCategory(id: string): Promise<boolean> {
    if (!this.api?.deleteCategory) throw new Error('Delete Category API is not available');
    return await this.api.deleteCategory(id);
  }

  async setCategoryEnabled(id: string, enabled: boolean): Promise<import('@/types/scraper').ScraperCategory> {
    if (!this.api?.setCategoryEnabled) throw new Error('Set Category Enabled API is not available');
    return await this.api.setCategoryEnabled(id, enabled);
  }

  async resetCategory(id: string): Promise<import('@/types/scraper').ScraperCategory> {
    if (!this.api?.resetCategory) throw new Error('Reset Category API is not available');
    return await this.api.resetCategory(id);
  }

  async testCategory(data: { baseUrl: string; titleSearch: string[] }): Promise<import('@/types/scraper').TestCategoryResult> {
    if (!this.api?.testCategory) throw new Error('Test Category API is not available');
    return await this.api.testCategory(data);
  }

  onStateChanged(callback: (data: { state: ScraperState; error?: string; details?: any; transport?: string }) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onStateChanged(callback);
  }

  onProgress(callback: (progress: ScraperProgress) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onProgress(callback);
  }

  onAccessChanged(callback: (access: ScraperAccessStatus) => void): () => void {
    if (!this.api?.onAccessChanged) return () => {};
    return this.api.onAccessChanged(callback);
  }

  async getActiveTransport(): Promise<string> {
    if (!this.api?.getActiveTransport) return 'NONE';
    return await this.api.getActiveTransport();
  }

  async connectCompanion(): Promise<{ port: number; token: string; connected: boolean }> {
    if (!window.rtLibrary?.companion?.connect) throw new Error('Companion API is not available');
    return await window.rtLibrary.companion.connect();
  }

  async reconnectCompanion(): Promise<{ port: number; token: string; connectionCode?: string | null; connected: boolean }> {
    if (window.rtLibrary?.companion?.reconnect) {
      return await window.rtLibrary.companion.reconnect();
    }
    return await this.connectCompanion();
  }

  async disconnectCompanion(): Promise<{ port: number | null; token: string | null; connectionCode?: string | null; connected: boolean }> {
    if (window.rtLibrary?.companion?.disconnect) {
      return await window.rtLibrary.companion.disconnect();
    }
    return { port: null, token: null, connected: false };
  }

  async getCompanionStatus(): Promise<{ port: number | null; token: string | null; connectionCode?: string | null; connected: boolean }> {
    if (!window.rtLibrary?.companion?.status) return { port: null, token: null, connected: false };
    return await window.rtLibrary.companion.status();
  }

  async openCompanionRuTracker(categoryId?: string): Promise<boolean> {
    if (!window.rtLibrary?.companion?.openRuTracker) throw new Error('Companion API is not available');
    return await window.rtLibrary.companion.openRuTracker({ categoryId });
  }

  async checkCompanionAccess(categoryId?: string): Promise<{
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
  }> {
    if (!window.rtLibrary?.companion?.checkAccess) throw new Error('Companion API is not available');
    return await window.rtLibrary.companion.checkAccess({ categoryId });
  }

  async fetchTopic(options: { url?: string; topicId?: string; categoryId?: string }): Promise<{
    success: boolean;
    topicId: string;
    title: string;
    categoryName?: string;
    categoryId?: string;
    inserted: number;
    updated: number;
    error?: string;
  }> {
    if (this.api?.fetchTopic) {
      return await this.api.fetchTopic(options);
    }
    if (window.rtLibrary?.companion?.fetchTopic) {
      return await window.rtLibrary.companion.fetchTopic(options);
    }
    throw new Error('Topic fetch API is not available');
  }

  async fetchCompanionTopic(options: { url?: string; topicId?: string; categoryId?: string }): Promise<{
    success: boolean;
    topicId: string;
    title: string;
    categoryName?: string;
    categoryId?: string;
    inserted: number;
    updated: number;
    error?: string;
  }> {
    return await this.fetchTopic(options);
  }

  async getTransportPreference(): Promise<{ preference: string; activeTransport: string; isPromoted: boolean; available: any[] }> {
    if (!this.api?.getTransportPreference) {
      return { preference: 'AUTOMATIC', activeTransport: 'BROWSER_COMPANION', isPromoted: false, available: [] };
    }
    return await this.api.getTransportPreference();
  }

  async setTransportPreference(preference: string): Promise<{ success: boolean; preference: string; activeTransport?: string }> {
    if (!this.api?.setTransportPreference) throw new Error('Transport preference API not available');
    return await this.api.setTransportPreference(preference);
  }

  async setEmbeddedPromoted(promoted: boolean): Promise<{ success: boolean; isPromoted: boolean }> {
    if (!this.api?.setEmbeddedPromoted) throw new Error('Embedded promotion API not available');
    return await this.api.setEmbeddedPromoted(promoted);
  }

  async embeddedVerify(options: { url?: string; categoryId?: string; timeoutMs?: number } = {}): Promise<{ success: boolean; status: string; url?: string }> {
    if (!this.api?.embeddedVerify) throw new Error('Embedded verify API is not available');
    return await this.api.embeddedVerify(options);
  }

  async embeddedProbe(options: { categoryId?: string } = {}): Promise<any> {
    if (!this.api?.embeddedProbe) throw new Error('Embedded probe API is not available');
    return await this.api.embeddedProbe(options);
  }

  async embeddedResetSession(): Promise<{ success: boolean; error?: string }> {
    if (!this.api?.embeddedResetSession) throw new Error('Embedded reset session API is not available');
    return await this.api.embeddedResetSession();
  }

  async getEmbeddedStatus(): Promise<any> {
    if (!this.api?.embeddedStatus) throw new Error('Embedded status API is not available');
    return await this.api.embeddedStatus();
  }

  onLog(callback: (log: ScraperLog) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onLog(callback);
  }

  onPageCommitted(callback: (event: ScraperPageCommittedEvent) => void): () => void {
    if (!this.api?.onPageCommitted) return () => {};
    return this.api.onPageCommitted(callback);
  }

  onRunFinalized(callback: (event: SyncRunFinalizedEvent) => void): () => void {
    if (!this.api?.onRunFinalized) return () => {};
    return this.api.onRunFinalized(callback);
  }

  async getSyncHistory(options: { limit?: number; offset?: number; statusFilter?: string } = {}): Promise<{ runs: SyncRun[]; total: number }> {
    if (!this.api?.getSyncHistory) return { runs: [], total: 0 };
    return await this.api.getSyncHistory(options);
  }

  async getSyncRunDetails(runId: string): Promise<SyncRunDetails | null> {
    if (!this.api?.getSyncRunDetails) return null;
    return await this.api.getSyncRunDetails(runId);
  }

  async getSyncHealth(): Promise<SyncHealthSummary> {
    if (!this.api?.getSyncHealth) {
      return {
        lastSuccessfulSync: null,
        lastRun: null,
        healthyCategoriesCount: 0,
        needingAttentionCount: 0,
        categories: [],
      };
    }
    return await this.api.getSyncHealth();
  }

  async clearSyncHistory(): Promise<number> {
    if (!this.api?.clearSyncHistory) return 0;
    return await this.api.clearSyncHistory();
  }

  async getSchedulerStatus(): Promise<import('@/platform/types').ScraperSchedulerStatus> {
    if (!this.api?.getSchedulerStatus) {
      return {
        enabled: false,
        scheduleType: '6h',
        intervalMinutes: 360,
        scope: 'ALL_ENABLED',
        categoryIds: [],
        lastAttemptAt: null,
        lastStartedAt: null,
        nextRunAt: null,
        lastSkipReason: null,
        isCompanionConnected: false,
        isScraperBusy: false,
      };
    }
    return await this.api.getSchedulerStatus();
  }

  async updateSchedulerConfig(config: Partial<import('@/platform/types').ScraperSchedulerConfig>): Promise<import('@/platform/types').ScraperSchedulerStatus> {
    if (!this.api?.updateSchedulerConfig) throw new Error('Scheduler API is not available');
    return await this.api.updateSchedulerConfig(config);
  }

  async runSchedulerDueCheck(): Promise<{ executed: boolean; skipped: boolean; reason?: string }> {
    if (!this.api?.runSchedulerDueCheck) return { executed: false, skipped: true, reason: 'NOT_AVAILABLE' };
    return await this.api.runSchedulerDueCheck();
  }

  onSchedulerStatusChanged(callback: (status: import('@/platform/types').ScraperSchedulerStatus) => void): () => void {
    if (!this.api?.onSchedulerStatusChanged) return () => {};
    return this.api.onSchedulerStatusChanged(callback);
  }
}

export type SyncRunStatus = 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'CANCELLED' | 'FAILED' | 'INTERRUPTED';

export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  mode: string | null;
  transport: string | null;
  scopeType: string | null;
  scopeCategoryId: string | null;
  triggerType: string;
  categoriesTotal: number;
  categoriesCompleted: number;
  topicsFound: number;
  newItems: number;
  updatedItems: number;
  knownItems: number;
  savedItems: number;
  failedItems: number;
  durationMs: number;
  cancelledByUser: number;
  verificationRequired: number;
  errorCode: string | null;
  errorSummary: string | null;
}

export interface SyncRunCategory {
  id: string;
  syncRunId: string;
  categoryId: string;
  categoryNameSnapshot: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  pagesProcessed: number;
  totalPages: number;
  topicsFound: number;
  newItems: number;
  updatedItems: number;
  knownItems: number;
  savedItems: number;
  durationMs: number;
  errorCode: string | null;
  errorSummary: string | null;
}

export interface SyncRunDetails extends SyncRun {
  categories: SyncRunCategory[];
}

export interface SyncHealthCategory {
  categoryId: string;
  categoryName: string;
  status: 'UP_TO_DATE' | 'NEVER_SYNCED' | 'WARNING' | 'FAILED';
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface SyncHealthSummary {
  lastSuccessfulSync: {
    id: string;
    startedAt?: string;
    finishedAt: string;
    newItems: number;
    updatedItems: number;
    durationMs: number;
  } | null;
  lastRun: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    status: SyncRunStatus;
    newItems: number;
    updatedItems: number;
    durationMs: number;
    errorSummary: string | null;
  } | null;
  healthyCategoriesCount: number;
  needingAttentionCount: number;
  categories: SyncHealthCategory[];
}

export interface ScraperPageCommittedEvent {
  categoryId: string;
  categoryName: string;
  page: number;
  totalPages?: number;
  inserted: number;
  updated: number;
  totalSaved: number;
}

export const scraperService = new ScraperService();

