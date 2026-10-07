# Building & Packaging Guide

This guide describes how to build RT-Library from source and package executable binaries for Linux and Windows.

---

## Prerequisites

- **Node.js**: `v18.0.0` or higher (`v20+` recommended)
- **npm**: `v9.0.0` or higher
- **Build Tools** (for native modules like `better-sqlite3`):
  - **Linux**: `gcc`, `g++`, `make`, `python3` (e.g., `build-essential` on Ubuntu/Debian)
  - **Windows**: Visual Studio Build Tools with C++ workload or `windows-build-tools`
- **ImageMagick** (`convert`): Required only when executing `npm run generate:icons` to regenerate multi-resolution icon assets from source artwork.

---

## 1. Clone & Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd rt-library

# Install dependencies and compile native bindings
npm install
```

---

## 2. Development Mode

Run Vite hot-reloading development server alongside the Electron main process:

```bash
npm run desktop
```

Or run frontend preview in browser only:
```bash
npm run dev
```

---

## 3. Production Build

Compile TypeScript and build the minified Vite frontend assets:

```bash
npm run build
```

The output bundle will be generated into `dist/`.

---

## 4. Packaging Desktop Binaries

Packaged installers and standalone packages are compiled via `electron-builder`:

### Package for Linux
```bash
# Build AppImage into dist-desktop/ (RT-Library-${version}-linux-x86_64.AppImage)
npm run package:linux
```

### Package for Windows
```bash
# Build NSIS installer into dist-desktop/ (RT-Library-${version}-windows-x64-setup.exe)
npm run package:win
```

### Unpacked Directory Build (Fast Packaging Test)
```bash
# Generates unpacked binary folders without creating installer archives
npm run desktop:package
```

---

## 5. Automated Verification & Quality Checks

Run the verification toolchain before submitting changes or building release packages:

```bash
# 1. Run full unit, integration, and benchmark test suites
npm test

# 2. Audit third-party dependencies and generate license bundle
npm run audit:licenses

# 3. Verify packaged app.asar runtime integrity and privacy
npm run package:verify

# 4. Verify repository release readiness (scans for secrets, db files, machine paths)
npm run release:check

# 5. Validate SemVer release tag consistency
npm run release:validate
```

---

## 6. Continuous Integration & Automated Releases

RT-Library uses automated GitHub Actions workflows for continuous integration and multiplatform release builds:

- **CI Pipeline (`.github/workflows/ci.yml`)**: Automatically triggers on Pull Requests and pushes to `main`. Runs tests, builds, license audits, and readiness scans across `ubuntu-latest` and `windows-latest`.
- **Release Pipeline (`.github/workflows/release.yml`)**: Automatically triggers when a SemVer tag (e.g. `v1.0.0`) is pushed. Builds native Linux AppImage on Ubuntu runners and Windows NSIS installers on Windows runners, verifies output artifacts, generates `SHA256SUMS.txt`, and publishes to GitHub Releases.

For complete release management procedures, see [Release & Versioning Guide](releasing.md).

