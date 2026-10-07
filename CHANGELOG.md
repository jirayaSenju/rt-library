# Changelog

All notable changes to RT-Library are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Russian Language Localization**: Complete UI localization for Russian (`ru-RU`) with native script typography.
- **Modernized Compact Selectors**: Compact, accessible dropdown selectors for application themes, progress bar styles, and languages with interactive live hover previews.
- **Enhanced Mascot Animation System**: 11 animated progress bar styles with edge clamping, customizable trail effects, and `prefers-reduced-motion` compliance.
- **Theme Accessibility & Contrast Hardening**: System-wide WCAG AA contrast verification across all 14 color themes.
- **Automated Third-Party License Audit**: Automated audit script (`scripts/audit-third-party-licenses.cjs`) and comprehensive audit documentation (`docs/third-party-license-audit.md`).
- **Legal & Release Governance**: Dedicated `LEGAL.md`, `RELEASE_CHECKLIST.md`, `docs/license-selection.md`, GitHub issue/PR templates, and AI-assisted development disclosures.

### Changed
- Expanded `scripts/check-publication-readiness.cjs` with checks for legacy assets, environment secrets, forbidden directories, and oversized dumps.
- Expanded `scripts/verify-package-runtime.cjs` with comprehensive exclusion rules for databases, cookies, profiles, and media caches inside packaged `app.asar`.

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
