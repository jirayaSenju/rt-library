# Changelog

All notable changes to RT-Library are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.1.2] - 2026-10-14

### Changed
- Moved update notification badge from Topbar to bottom of Sidebar, avoiding overlap with Search input and `⌘K` command palette.
- Replaced raw HTML release notes block with sanitized, formatted preview and new full Changelog Modal (`ChangelogModal.tsx`).
- Harmonized all updater state cards and progress bars with active application theme color tokens (WCAG AA compliant across all themes).

---

## [1.1.1] - 2026-10-14

### Added
- **Automatic Self-Update System**: Production-grade self-updating via GitHub Releases for Linux (AppImage) and Windows (Portable Executable), integrated in Settings > About & Updates with real-time download progress, background checks, and active-sync guards.
- **Windows Portable Executable**: Migrated Windows distribution to standalone portable executables (`RT-Library-${version}-windows-x64-portable.exe`), preserving all user data and SQLite databases in `%APPDATA%\rt-library` without requiring installation.
- **Atomic Windows Portable Replacement Helper**: Detached update script with PID termination monitoring, backup renaming, swap, rollback handling, and automatic relaunch.
- **Update Metadata Generation & Verification**: Automated publication of `latest-linux.yml` and `latest.yml` update metadata in GitHub Actions release workflows, validated by `validate-update-artifacts.cjs` and `validate-published-release.cjs`.

### Changed
- Replaced deep internal electron-updater imports with `ElectronHttpExecutor` in packaged runtime and headless Node HTTP fallback in test harnesses.
- Standardized Windows packaging to single-file portable executables across CI, release workflows, and release checklists.

### Fixed
- Fixed runtime dependency resolution of `jsdom` and parser dependencies in packaged Windows applications.
- Sanitized scraper error IPC channels to eliminate raw stack traces, module names, and machine paths from the UI.
- Added graceful handling (`UPDATE_METADATA_MISSING`) and log deduplication when update metadata files are temporarily unavailable on GitHub Releases.

---

## [1.1.0] - 2026-10-13

### Added
- **Browser Companion (Manifest V3 Extension)**: Production-recommended sync transport enabling page fetches via the user's regular browser session, sharing legitimate Cloudflare clearance cookies and credentials without automated bypasses.
- **Local Loopback Bridge**: Authenticated loopback bridge (`http://127.0.0.1:<dynamic-port>`) with dynamic port binding, bearer token authentication, session isolation, and 10 MiB payload limits.
- **Embedded Electron Scraper (Experimental)**: Autonomous in-app scraper with isolated worker pool (ceiling C=3), persistent session partition (`persist:rutracker-v1`), in-app Cloudflare verification window, and verification loop detection (`VERIFICATION_LOOP`).
- **Progressive Library Synchronization**: Real-time batch ingestion directly into SQLite, interactive Pause/Resume/Cancel lifecycle, progress metrics, and dynamic speed monitoring.
- **Sync History & Health Diagnostics**: Dedicated sync run audit logging, telemetry tracking, and visual sync health status cards.
- **Database Backup Restore**: Ability to restore external SQLite backups directly in Onboarding Step 1 or Scraper Settings, enabling immediate catalog browsing without re-scraping.
- **Manual RuTracker HTML Import**: Offline parser accepting saved `.html` / `.htm` forum category or topic files up to 15 MiB.
- **Background Synchronization Scheduler**: Configurable periodic background sync intervals with non-blocking challenge deferral (`INTERACTION_REQUIRED`).
- **System Background Notifications**: Native desktop notifications with actionable buttons to view newly synchronized topics.
- **Russian Language Localization**: Complete UI localization for Russian (`ru-RU`) alongside English (`en`) and Brazilian Portuguese (`pt-BR`).
- **Modernized Compact Selectors & Mascots**: Accessible compact dropdown selectors, 11 animated progress bar mascot styles with edge clamping, and WCAG AA contrast compliance across 14 themes.
- **Browser Companion Packaging**: Automated extension packaging pipeline generating `rt-library-browser-companion-v1.1.0.zip` release artifacts.

### Changed
- Promoted Browser Companion to primary recommended transport for Cloudflare-protected access; marked Embedded Electron as experimental in UI and docs.
- Updated database schema to v6 with automated migration from v1.0.0 JSON files and SQLite databases (backward-compatible according to current migration and regression coverage).
- Synchronized release workflows in GitHub Actions to build, validate, package, checksum, and attach the Browser Companion extension archive to official releases.
- Hardened release scanners (`scripts/check-publication-readiness.cjs`, `scripts/validate-release-version.cjs`) to prevent inclusion of developer paths, tokens, runtime DBs, or untracked debris.

### Fixed
- Fixed single-item upsert query parameter omission (`preserveMissingFields`) in native SQLite repository (`itemsRepo.cjs`).
- Fixed Cloudflare verification loop counting and session debouncing in Embedded Electron transport (`embeddedElectronTransport.cjs`).
- Resolved legacy database migration test harness compatibility in `migration.cjs`.
- Removed transient benchmark logs and hardcoded machine-specific paths from diagnostic tooling.

### Known Limitations
- Embedded Electron transport may encounter Cloudflare Turnstile verification loops under strict network conditions; users should use the Browser Companion for guaranteed forum access.
- Windows binaries are built via cross-platform configurations but have not been verified in a live Windows production environment.

---

## [1.0.0] - 2026-10-06

### Added
- **Local SQLite Catalog Engine**: Embedded `better-sqlite3` storage with WAL mode and composite indexing.
- **Virtualized Catalog Browsing**: High-performance Grid and List views with customizable sorting, pagination, and comfortable/compact density toggles.
- **Faceted Search & Multi-Filters**: Instant debounced filtering by year, size, seeders/leechers, developer, publisher, genre, and languages.
- **Batch Selection & Magnet Actions**: Copy single/multiple deduplicated magnet links to clipboard and export to text files.
- **Item Details & Screenshot Lightbox**: Full topic description viewing, torrent file tree explorer, and screenshot carousel.
- **Playwright Scraper Integration**: Background child process scraper with incremental scan, full scan, and deep-refresh toggles.
- **Category Manager**: Configurable category mappings with URL verification and custom platform overrides.
- **Appearance & Mascot System**: Animated progress bar themes and UI color themes.
- **Database Maintenance & Backup Scheduler**: Vacuum, index rebuilding, integrity diagnostics, and automated backup scheduler.
- **Cross-Platform Packaging**: AppImage and `.deb` packaging for Linux, and NSIS installers for Windows.
- **Multi-Language Support**: Complete localization in English and Portuguese (`pt-BR`).
