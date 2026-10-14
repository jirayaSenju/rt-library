import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WindowsPortableUpdater } from '../../electron/updater/windowsPortableUpdater.cjs';

describe('WindowsPortableUpdater Unit Tests', () => {
  let tempDir: string;
  let mockApp: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-portable-test-'));
    mockApp = {
      version: '1.1.0',
      name: 'RT-Library',
      isPackaged: true,
      getPath: (name: string) => {
        if (name === 'userData') return path.join(tempDir, 'userData');
        if (name === 'exe') return path.join(tempDir, 'RT-Library.exe');
        return tempDir;
      },
      whenReady: () => Promise.resolve(),
      quit: vi.fn(),
      relaunch: vi.fn(),
      once: vi.fn(),
    };
  });

  afterEach(() => {
    delete process.env.PORTABLE_EXECUTABLE_FILE;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('resolves target executable path from PORTABLE_EXECUTABLE_FILE environment variable', () => {
    const customExe = path.join(tempDir, 'Custom-RT-Library.exe');
    process.env.PORTABLE_EXECUTABLE_FILE = customExe;

    const updater = new WindowsPortableUpdater(null, mockApp);
    const resolved = updater.getTargetExecutablePath();
    expect(resolved).toBe(path.resolve(customExe));
  });

  it('falls back to app.getPath("exe") when PORTABLE_EXECUTABLE_FILE is unset', () => {
    delete process.env.PORTABLE_EXECUTABLE_FILE;
    const updater = new WindowsPortableUpdater(null, mockApp);
    const resolved = updater.getTargetExecutablePath();
    expect(resolved).toBe(path.resolve(path.join(tempDir, 'RT-Library.exe')));
  });

  it('generates an atomic update batch script with PID polling and rollback protection', () => {
    const updater = new WindowsPortableUpdater(null, mockApp);
    const targetExe = path.join(tempDir, 'RT-Library-1.1.0-windows-x64-portable.exe');
    const updateExe = path.join(tempDir, 'RT-Library-1.1.1-windows-x64-portable.exe');

    const script = updater.generateScriptContent({
      targetPid: 12345,
      targetExe,
      downloadedExe: updateExe,
      isForceRun: true,
    });

    expect(script).toContain('set "TARGET_PID=12345"');
    expect(script).toContain(`set "TARGET_EXE=${targetExe}"`);
    expect(script).toContain(`set "UPDATE_EXE=${updateExe}"`);
    expect(script).toContain(`set "BACKUP_EXE=${targetExe}.old"`);
    expect(script).toContain('tasklist /fi "PID eq !TARGET_PID!"');
    expect(script).toContain('move /y "!TARGET_EXE!" "!BACKUP_EXE!"');
    expect(script).toContain('move /y "!UPDATE_EXE!" "!TARGET_EXE!"');
    expect(script).toContain('move /y "!BACKUP_EXE!" "!TARGET_EXE!"'); // Rollback on failure
    expect(script).toContain('start "" "!TARGET_EXE!"');
    expect(script).toContain('del "%~f0"');
  });

  it('dispatches an error and returns false if installerPath is missing', () => {
    const updater = new WindowsPortableUpdater(null, mockApp);
    const errorHandler = vi.fn();
    updater.on('error', errorHandler);

    const result = updater.doInstall();
    expect(result).toBe(false);
    expect(errorHandler).toHaveBeenCalled();
  });

  it('dispatches an error and returns false if downloaded update binary does not exist', () => {
    const updater = new WindowsPortableUpdater(null, mockApp);
    updater.installerPath = path.join(tempDir, 'non-existent-update.exe');
    const errorHandler = vi.fn();
    updater.on('error', errorHandler);

    const result = updater.doInstall();
    expect(result).toBe(false);
    expect(errorHandler).toHaveBeenCalled();
  });

  it('dispatches an error if destination directory is read-only', () => {
    const updater = new WindowsPortableUpdater(null, mockApp);
    const updateExe = path.join(tempDir, 'update.exe');
    fs.writeFileSync(updateExe, 'dummy binary');
    updater.installerPath = updateExe;

    process.env.PORTABLE_EXECUTABLE_FILE = '/root/non-writable-system-path/RT-Library.exe';
    const errorHandler = vi.fn();
    updater.on('error', errorHandler);

    const result = updater.doInstall();
    expect(result).toBe(false);
    expect(errorHandler).toHaveBeenCalled();
  });

  it('writes helper script and invokes spawnHelper on valid installation', () => {
    const targetExe = path.join(tempDir, 'RT-Library.exe');
    fs.writeFileSync(targetExe, 'old binary');
    process.env.PORTABLE_EXECUTABLE_FILE = targetExe;

    const updateExe = path.join(tempDir, 'update.exe');
    fs.writeFileSync(updateExe, 'new binary');

    const updater = new WindowsPortableUpdater(null, mockApp);
    updater.installerPath = updateExe;

    const spawnedScripts: string[] = [];
    updater.spawnHelper = (scriptPath: string) => {
      spawnedScripts.push(scriptPath);
      return {} as any;
    };

    const result = updater.doInstall({ isForceRunAfter: true });
    expect(result).toBe(true);
    expect(spawnedScripts.length).toBe(1);

    const generatedScript = spawnedScripts[0];
    expect(fs.existsSync(generatedScript)).toBe(true);
    const content = fs.readFileSync(generatedScript, 'utf8');
    expect(content).toContain(`set "TARGET_EXE=${targetExe}"`);
    expect(content).toContain(`set "UPDATE_EXE=${updateExe}"`);

    // Clean up script
    fs.unlinkSync(generatedScript);
  });
});
