# Installation Guide

RT-Library is distributed as standalone desktop binaries for Linux and Windows.

---

## Linux Installation

### 1. AppImage (Recommended)
The AppImage bundle contains all runtime dependencies, including the Chromium binary and native SQLite bindings.

1. Download `RT-Library-<version>.AppImage` from the releases page or build it locally.
2. Grant execution permissions:
   ```bash
   chmod +x RT-Library-*.AppImage
   ```
3. Run the application:
   ```bash
   ./RT-Library-*.AppImage
   ```

> **Optional Desktop Integration**: You can place the AppImage in `~/.local/bin` or use tools like `AppImageLauncher` for automatic system menu integration.

### 2. Debian Package (`.deb`)
For Debian, Ubuntu, Linux Mint, and derivatives:

1. Download `rt-library_<version>_amd64.deb`.
2. Install via `apt` or `dpkg`:
   ```bash
   sudo apt install ./rt-library_*_amd64.deb
   ```
3. Launch **RT Library** from your desktop application launcher or run `rt-library` in terminal.

---

## Windows Installation

### 1. NSIS Installer (`.exe`)
1. Download `RT-Library-Setup-<version>.exe`.
2. Run the installer and select your preferred installation directory.
3. Launch **RT Library** from the Start Menu or desktop shortcut.

---

## Initial Setup on First Launch

When opening RT-Library for the first time:
1. The **First-Run Setup Screen** will appear, verifying database readiness.
2. You can configure active platforms/categories in **Category Management**.
3. Perform an **Initial Synchronization** to index subforum topics into your local SQLite database.
4. Customize your visual preferences (Theme, Progress Mascot, Density) in **Settings & Maintenance**.

