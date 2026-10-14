/**
 * WindowsPortableUpdater implements self-updating for Windows portable executables.
 * 
 * Flow:
 * 1. electron-updater checks GitHub Releases (latest.yml) and downloads the new portable .exe to cache/temp.
 * 2. On quitAndInstall, it identifies the host portable executable path (via PORTABLE_EXECUTABLE_FILE or process.execPath).
 * 3. Verifies write permissions to the executable location.
 * 4. Generates a detached update helper script (.cmd) that:
 *    a. Waits for RT-Library PID to exit and release file locks.
 *    b. Backs up the current executable to .old.
 *    c. Moves the downloaded new executable into place.
 *    d. Relaunches the updated executable.
 *    e. Cleans up the backup and helper script.
 * 5. Quits the current application.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { BaseUpdater } = require('electron-updater');

class WindowsPortableUpdater extends BaseUpdater {
  constructor(options, app) {
    super(options, app);
    this._customInstallerPath = undefined;
  }

  get installerPath() {
    return this._customInstallerPath !== undefined
      ? this._customInstallerPath
      : super.installerPath;
  }

  set installerPath(val) {
    this._customInstallerPath = val;
  }

  getTargetExecutablePath() {
    // In electron-builder portable environment, PORTABLE_EXECUTABLE_FILE points to the host executable
    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      return path.resolve(process.env.PORTABLE_EXECUTABLE_FILE);
    }

    if (this.app && typeof this.app.getPath === 'function') {
      try {
        const exe = this.app.getPath('exe');
        if (exe && exe.toLowerCase().endsWith('.exe')) {
          return path.resolve(exe);
        }
      } catch (_) {}
    }

    if (process.execPath && process.execPath.toLowerCase().endsWith('.exe')) {
      return path.resolve(process.execPath);
    }

    return null;
  }

  generateScriptContent({ targetPid, targetExe, downloadedExe, isForceRun = true }) {
    const backupExe = `${targetExe}.old`;
    const forceRunFlag = isForceRun ? '1' : '0';

    return `@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

set "TARGET_PID=${targetPid}"
set "TARGET_EXE=${targetExe}"
set "UPDATE_EXE=${downloadedExe}"
set "BACKUP_EXE=${backupExe}"
set "FORCE_RUN=${forceRunFlag}"

:: 1. Wait for current RT-Library process to exit and release Windows kernel file lock
set /a ATTEMPTS=0
:WAIT_LOOP
set /a ATTEMPTS+=1
if !ATTEMPTS! gtr 60 goto APPLY
tasklist /fi "PID eq !TARGET_PID!" 2>nul | find "!TARGET_PID!" >nul
if %ERRORLEVEL% equ 0 (
    timeout /t 1 /nobreak >nul
    goto WAIT_LOOP
)

:APPLY
:: Small grace pause to ensure all file handles are completely unlocked
timeout /t 1 /nobreak >nul

:: Clean up stale backup from any previous interrupted run
if exist "!BACKUP_EXE!" del /f /q "!BACKUP_EXE!" >nul 2>&1

:: Move current executable to backup
if exist "!TARGET_EXE!" (
    move /y "!TARGET_EXE!" "!BACKUP_EXE!" >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        exit /b 1
    )
)

:: Move downloaded update into place
move /y "!UPDATE_EXE!" "!TARGET_EXE!" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    :: Rollback on failure
    if exist "!BACKUP_EXE!" move /y "!BACKUP_EXE!" "!TARGET_EXE!" >nul 2>&1
    exit /b 1
)

:: Update succeeded, remove backup
if exist "!BACKUP_EXE!" del /f /q "!BACKUP_EXE!" >nul 2>&1

:: Relaunch new portable version if requested
if "!FORCE_RUN!"=="1" (
    start "" "!TARGET_EXE!"
)

:: Delete self
(goto) 2>nul & del "%~f0"
`;
  }

  spawnHelper(scriptPath) {
    const child = spawn('cmd.exe', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return child;
  }

  doInstall(options = {}) {
    const downloadedPath = this.installerPath;
    if (!downloadedPath) {
      this.dispatchError(new Error("No update filepath provided, can't quit and install"));
      return false;
    }

    if (!fs.existsSync(downloadedPath)) {
      this.dispatchError(new Error(`Downloaded update binary not found at: ${downloadedPath}`));
      return false;
    }

    const targetExe = this.getTargetExecutablePath();
    if (!targetExe) {
      this.dispatchError(new Error('Unable to determine current portable executable location'));
      return false;
    }

    const targetDir = path.dirname(targetExe);
    try {
      fs.accessSync(targetDir, fs.constants.W_OK);
      if (fs.existsSync(targetExe)) {
        fs.accessSync(targetExe, fs.constants.W_OK);
      }
    } catch (err) {
      this.dispatchError(new Error(`Current portable executable directory is read-only: ${targetDir}`));
      return false;
    }

    const pid = process.pid;
    const isForceRun = options.isForceRunAfter !== false;
    const scriptPath = path.join(os.tmpdir(), `rt-lib-update-${Date.now()}.cmd`);

    const scriptContent = this.generateScriptContent({
      targetPid: pid,
      targetExe,
      downloadedExe: downloadedPath,
      isForceRun,
    });

    try {
      fs.writeFileSync(scriptPath, scriptContent, 'utf8');
    } catch (err) {
      this.dispatchError(new Error(`Failed to write update helper script: ${err.message}`));
      return false;
    }

    try {
      this.spawnHelper(scriptPath);
      return true;
    } catch (err) {
      this.dispatchError(new Error(`Failed to launch update helper process: ${err.message}`));
      return false;
    }
  }
}

module.exports = {
  WindowsPortableUpdater,
};
