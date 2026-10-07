/**
 * EcoHub / RT-Library Performance Telemetry Service
 * Guarded by RT_LIBRARY_PERF flag. Zero functional impact when disabled.
 */

export interface MemorySnapshot {
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

export interface DOMSnapshot {
  totalNodes: number;
  itemCardsCount: number;
  imageCount: number;
}

class PerformanceTelemetry {
  private marks: Map<string, number> = new Map();
  private enabled: boolean = false;
  private observer: PerformanceObserver | null = null;
  private fpsMonitoring: boolean = false;
  private fpsFrameCount: number = 0;
  private fpsStartTime: number = 0;
  private firstCardRendered: boolean = false;

  constructor() {
    this.checkEnabled();
  }

  public checkEnabled(): boolean {
    if (typeof window === "undefined") return false;
    const isEnvSet =
      Boolean((import.meta as any).env?.VITE_PERF_TELEMETRY) ||
      Boolean((import.meta as any).env?.VITE_RT_LIBRARY_PERF);
    const isGlobalSet = (window as any).RT_LIBRARY_PERF === true || (window as any).RT_LIBRARY_PERF === "1";
    const isStorageSet = localStorage.getItem("RT_LIBRARY_PERF") === "1";
    this.enabled = isEnvSet || isGlobalSet || isStorageSet;
    return this.enabled;
  }

  public setEnabled(flag: boolean) {
    this.enabled = flag;
    if (typeof window !== "undefined") {
      (window as any).RT_LIBRARY_PERF = flag;
      if (flag) {
        localStorage.setItem("RT_LIBRARY_PERF", "1");
        this.initLongTaskObserver();
      } else {
        localStorage.removeItem("RT_LIBRARY_PERF");
        this.stopLongTaskObserver();
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public start(label: string): void {
    if (!this.enabled) return;
    this.marks.set(label, performance.now());
  }

  public end(label: string, categoryTag = "RENDERER", metadata?: Record<string, any>): number {
    if (!this.enabled) return 0;
    const startTime = this.marks.get(label);
    if (startTime === undefined) return 0;
    const duration = performance.now() - startTime;
    this.marks.delete(label);

    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";
    console.log(`[PERF][${categoryTag}] ${label}: ${duration.toFixed(2)}ms${metaStr}`);
    return duration;
  }

  public measure(categoryTag: string, name: string, durationMs: number, metadata?: Record<string, any>): void {
    if (!this.enabled) return;
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : "";
    console.log(`[PERF][${categoryTag}] ${name}: ${durationMs.toFixed(2)}ms${metaStr}`);
  }

  public log(categoryTag: string, message: string, data?: any): void {
    if (!this.enabled) return;
    if (data !== undefined) {
      console.log(`[PERF][${categoryTag}] ${message}`, data);
    } else {
      console.log(`[PERF][${categoryTag}] ${message}`);
    }
  }

  public markFirstCard(): void {
    if (!this.enabled || this.firstCardRendered) return;
    this.firstCardRendered = true;
    const navStart = performance.timing?.navigationStart || performance.now();
    const timeToFirstCard = performance.now();
    console.log(`[PERF][UI] firstCardRendered at +${timeToFirstCard.toFixed(1)}ms`);
  }

  public snapshotDOM(label: string): DOMSnapshot | null {
    if (!this.enabled || typeof document === "undefined") return null;
    const totalNodes = document.getElementsByTagName("*").length;
    const itemCardsCount = document.querySelectorAll("[data-item-card]").length || document.querySelectorAll(".group.relative").length;
    const imageCount = document.getElementsByTagName("img").length;

    const snapshot: DOMSnapshot = { totalNodes, itemCardsCount, imageCount };
    console.log(`[PERF][DOM] Snapshot (${label}): ${totalNodes} total nodes, ${itemCardsCount} cards, ${imageCount} images`);
    return snapshot;
  }

  public snapshotMemory(label: string): MemorySnapshot | null {
    if (!this.enabled || typeof performance === "undefined") return null;
    const perfMem = (performance as any).memory;
    if (!perfMem) return null;

    const snapshot: MemorySnapshot = {
      jsHeapSizeLimit: perfMem.jsHeapSizeLimit,
      totalJSHeapSize: perfMem.totalJSHeapSize,
      usedJSHeapSize: perfMem.usedJSHeapSize,
    };

    const usedMB = (perfMem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const totalMB = (perfMem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
    console.log(`[PERF][MEMORY] Snapshot (${label}): Heap Used ${usedMB} MB / Total ${totalMB} MB`);
    return snapshot;
  }

  public initLongTaskObserver(): void {
    if (!this.enabled || typeof PerformanceObserver === "undefined" || this.observer) return;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            console.warn(`[PERF][UI] Long Task detected: ${entry.duration.toFixed(1)}ms (start: ${entry.startTime.toFixed(1)}ms)`);
          }
        }
      });
      this.observer.observe({ entryTypes: ["longtask"] });
      console.log("[PERF][UI] LongTask PerformanceObserver initialized (>50ms target)");
    } catch (e) {
      // longtask entryType might not be supported in some webview environments
      console.log("[PERF][UI] LongTask observer not supported in this browser context.");
    }
  }

  public stopLongTaskObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  public startFPSMonitor(durationMs = 2000): void {
    if (!this.enabled || this.fpsMonitoring) return;
    this.fpsMonitoring = true;
    this.fpsFrameCount = 0;
    this.fpsStartTime = performance.now();

    const step = () => {
      if (!this.fpsMonitoring) return;
      this.fpsFrameCount++;
      const elapsed = performance.now() - this.fpsStartTime;
      if (elapsed < durationMs) {
        requestAnimationFrame(step);
      } else {
        const fps = (this.fpsFrameCount / elapsed) * 1000;
        console.log(`[PERF][UI] Scroll FPS Window (${(durationMs / 1000).toFixed(1)}s): ${fps.toFixed(1)} FPS (${this.fpsFrameCount} frames)`);
        this.fpsMonitoring = false;
      }
    };

    requestAnimationFrame(step);
  }
}

export const perfTelemetry = new PerformanceTelemetry();
if (typeof window !== "undefined") {
  (window as any).perfTelemetry = perfTelemetry;
}
