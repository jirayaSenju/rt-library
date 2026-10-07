import { nativeLibraryService } from "./nativeLibrary";

export class FileWatcherService {
  private isWatching = false;
  private debounceTimer: any = null;
  private watchPath: string | null = null;
  private onReindexCallback: (() => void) | null = null;

  startWatching(libraryPath: string, onReindex?: () => void) {
    this.watchPath = libraryPath;
    this.onReindexCallback = onReindex || null;
    this.isWatching = true;
    console.log(`👀 File watcher started for directory: ${libraryPath}`);
  }

  watch(libraryPath: string, onReindex?: () => void) {
    this.startWatching(libraryPath, onReindex);
  }

  stopWatching() {
    this.isWatching = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    console.log("👀 File watcher stopped.");
  }

  stop() {
    this.stopWatching();
  }

  notifyFileChanged(filename: string, contentGetter: () => Promise<string>) {
    if (!this.isWatching || !filename.endsWith(".json") || !this.watchPath) return;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(async () => {
      try {
        console.log(`🔄 Change detected in ${filename}. Re-indexing via Native IPC...`);
        await nativeLibraryService.refresh({ libraryPath: this.watchPath! });

        if (this.onReindexCallback) {
          this.onReindexCallback();
        }
      } catch (err: any) {
        console.warn(`⚠️ File ${filename} write in progress: ${err.message}`);
      }
    }, 1500);
  }
}

export const fileWatcherService = new FileWatcherService();
