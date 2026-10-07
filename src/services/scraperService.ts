/**
 * Scraper Service - React Renderer API Bridge
 * Interfaces with Electron Preload scraper IPC
 */

export type ScraperState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'session_required'
  | 'interaction_required';

export interface ScraperOptions {
  full?: boolean;
  login?: boolean;
  headed?: boolean;
  category?: string | null;
  refreshScreenshots?: boolean;
  refreshSizes?: boolean;
  refreshFiles?: boolean;
  headless?: boolean;
  dataDir?: string | null;
}

export interface ScraperProgress {
  category?: string;
  categoryName?: string;
  currentPage?: number;
  totalPages?: number;
  processedItems?: number;
  newItems?: number;
  totalItems?: number;
  elapsedMs?: number;
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
}

class ScraperService {
  private get api() {
    return window.electronAPI?.scraper || window.rtLibrary?.scraper;
  }

  isAvailable(): boolean {
    return !!this.api;
  }

  async start(options: ScraperOptions = {}): Promise<{ success: boolean }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.start(options);
  }

  async renewSession(options: ScraperOptions = {}): Promise<{ success: boolean }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    if (this.api.renewSession) {
      return await this.api.renewSession(options);
    }
    return await this.api.start({ ...options, login: true, headed: true });
  }

  async cancel(): Promise<{ success: boolean; message?: string }> {
    if (!this.api) throw new Error('Scraper API is not available in window');
    return await this.api.cancel();
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

  onStateChanged(callback: (data: { state: ScraperState; error?: string }) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onStateChanged(callback);
  }

  onProgress(callback: (progress: ScraperProgress) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onProgress(callback);
  }

  onLog(callback: (log: ScraperLog) => void): () => void {
    if (!this.api) return () => {};
    return this.api.onLog(callback);
  }
}

export const scraperService = new ScraperService();

