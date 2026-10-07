import { describe, it, expect, vi } from 'vitest';
import {
  getSystemInfo,
  getLinuxProcessMetrics,
  EventLoopTracker,
} from '../../scripts/benchmark-runtime.cjs';
import { compareBenchmarks } from '../../scripts/compare-benchmarks.cjs';

describe('V3-33 Benchmark Helpers & Measurement Utilities', () => {
  it('collects comprehensive system information', () => {
    const sys = getSystemInfo();
    expect(sys.os).toBeDefined();
    expect(sys.platform).toBeDefined();
    expect(sys.cpuCores).toBeGreaterThan(0);
    expect(sys.totalRamMb).toBeGreaterThan(100);
    expect(sys.nodeVersion).toMatch(/^v\d+/);
    expect(sys.benchmarkTimestamp).toBeDefined();
  });

  it('retrieves process metrics accurately', () => {
    const metrics = getLinuxProcessMetrics(process.pid);
    expect(metrics.pid).toBe(process.pid);
    expect(metrics.rssMb).toBeGreaterThan(0);
    expect(metrics.threads).toBeGreaterThanOrEqual(1);
  });

  it('tracks event loop lag and computes statistics', async () => {
    const tracker = new EventLoopTracker();
    tracker.start(5);
    await new Promise((r) => setTimeout(r, 60));
    const stats = tracker.stop();

    expect(stats.avgLagMs).toBeGreaterThanOrEqual(0);
    expect(stats.p95LagMs).toBeGreaterThanOrEqual(0);
    expect(stats.maxLagMs).toBeGreaterThanOrEqual(0);
  });

  it('provides compareBenchmarks comparison function', () => {
    expect(typeof compareBenchmarks).toBe('function');
  });

  it('provides Electron benchmark helpers and process memory retrieval', () => {
    const { getSystemInfo: getElectronSysInfo, getProcessMemory } = require('../../scripts/benchmark-electron.cjs');
    const sys = getElectronSysInfo();
    expect(sys.os).toBeDefined();
    expect(sys.cpuCores).toBeGreaterThan(0);
    const mem = getProcessMemory();
    expect(mem).toBeGreaterThan(0);
  });
});


