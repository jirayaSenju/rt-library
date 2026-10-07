# RT-Library

> **Local Desktop Catalog Manager for Game Metadata & Personal Library Organization**

RT-Library is a modern cross-platform desktop application built with Electron, React, and TypeScript. It enables users to browse, search, organize, and maintain local metadata catalogs of game collections with an embedded SQLite database, fast virtualized scrolling, rich media previews, and automated scraping workflows.

---

## Overview

RT-Library provides a clean, local-first cataloging workspace for digital libraries. It acts as a local personal organizer for catalog metadata, topic information, release metadata, and tracker swarm status.

- **Local-First Architecture**: All catalog databases, custom categories, image caches, and user preferences are stored entirely on the user's local machine in an embedded SQLite database.
- **No Bundled Catalog**: RT-Library ships as an empty management application. The user initializes, configures, and synchronizes their own local library data.
- **High-Performance UI**: Designed to handle catalogs with tens of thousands of items smoothly using virtualized grid and list layouts.

---

## Key Features

### 1. Catalog Browsing & Visualization
- **Dual View Modes**: Switch seamlessly between comfortable/compact **Grid View** and dense **List View** with customizable columns.
- **Instant Search & Sorting**: Real-time debounced query filtering across titles, developers, publishers, genres, and platforms.
- **Faceted Multi-Filters**: Filter by release year ranges, file sizes, swarm seeders/leechers, interface languages, multiplayer modes, and presence of screenshots or magnet links.
- **Favorites & Batch Actions**: Mark favorite items, multi-select rows or cards, copy deduplicated magnet links to clipboard, or export magnet lists to disk.

### 2. Item Details & Media Viewer
- **Topic Details View**: Inspect canonical title, category group, size, date added, release group, and original source metadata.
- **Screenshot Gallery**: Built-in screenshot carousel with full-screen lightbox preview and local caching.
- **File Explorer**: View the torrent file hierarchy with individual file sizes and tree structures.
- **Swarm Status**: View active seeders, leechers, and total peers with on-demand tracker refresh.

### 3. Incremental Metadata Scraper
- **Automated Synchronization**: Integrated Playwright-based scraper that extracts topic listings, screenshots, and metadata.
- **Smart Incremental Detection**: Automatically stops when previously scraped items are reached, preventing redundant network requests.
- **Custom Category Manager**: Configure, add, edit, test, and disable subforum categories directly from the settings interface.
- **Visual Progress & Mascots**: Choose from 11 customizable progress bar styles (Nyan Cat, Claude Code, Matrix Rain, Synthwave, Arcade Pixel, Lava Lamp, Rainbow Pop, Ocean Wave, Candy Rush, Cosmic Nebula, and Soviet Red).

### 4. Database Administration & Maintenance
- **Native SQLite Engine**: Backed by `better-sqlite3` for low-latency queries and atomic transactions.
- **Automatic Backups**: Configurable automated backup scheduler with custom backup directory retention.
- **Database Health & Diagnostics**: Run integrity checks (`PRAGMA integrity_check`), rebuild search indexes, defragment space (`VACUUM`), and clean orphan records.

### 5. Customization & Internationalization
- **Theme Engine**: 14 distinct UI color themes across Default, Terminal, and Community styles (RT Dark, RT Light, Dracula, Nord, Gruvbox Dark, Catppuccin Mocha, Tokyo Night, Eco Green, Eco Red, Pride, Trans Pride, Bi Pride, Lesbian Pride, Non-Binary Pride).
- **Multi-Language Support**: Fully localized in **English**, **Portuguese (pt-BR)**, and **Russian (ru-RU)**.

---

## AI-Assisted Development

RT-Library was developed with extensive use of AI-assisted software development tools.

AI systems were used throughout the project lifecycle to assist with architecture exploration, implementation, refactoring, test generation, debugging, documentation, and UI iteration.

Because of the scope and technical complexity of the application, generated suggestions and code were not treated as inherently correct. Features and major subsystems were iteratively reviewed, tested, benchmarked where appropriate, and refined based on actual runtime behavior.

Dedicated engineering effort was placed on SQLite data integrity, process isolation between Electron Main and Renderer, cross-platform packaging safety, scraper reliability, WCAG AA contrast accessibility, and responsive user experience.

---

## Development & Quality Assurance

RT-Library is backed by an automated testing and verification pipeline:

- **Unit Testing**: Validates backend SQLite repositories, metadata extraction parsers, category planners, and image caching policies.
- **Integration Testing**: Exercises React workflows, filter drafts, catalog pagination, view mode toggles, and modal dialogs.
- **Accessibility & Contrast Audits**: Automated contrast test suite ensuring all 14 color themes meet WCAG AA contrast ratios (>= 4.5:1).
- **Packaged Runtime Verification**: Automated scanning of packaged `app.asar` archives to ensure all mandatory runtime modules are bundled while strictly excluding user databases, profiles, and cached media.
- **Release Readiness Scans**: Automated release-readiness audits scanning for secrets, personal file paths, scraper artifacts, and unauthorized assets.

> [!NOTE]
> Automated test passes verify functional correctness and prevent regressions, but are complemented by manual runtime verification on tested target platforms.

---

## Usability & UX

The user interface of RT-Library has evolved through iterative real-world usability refinements:

- **Scroll Stability & Virtualization**: Grid and list virtualizers were tuned to eliminate layout shift, scroll jitter, and unnecessary component remounts.
- **Compact Settings Navigation**: Theme and language selectors were redesigned into compact, accessible dropdowns with live interactive hover previews and keyboard navigation.
- **Progress Mascot System**: Animated progress indicators were redesigned with clamped edge positions, custom trail effects, and full support for `prefers-reduced-motion`.
- **Contrast & Legibility**: Visual hierarchy and token contrast across all 14 themes were systematically audited to guarantee crisp text readability across both dark and light palettes.

---

## Privacy & Local Data Ownership

- **100% Local Storage**: Your catalog, category rules, favorites, and settings are stored locally in standard OS application directories (`~/.config/rt-library/` on Linux, `%APPDATA%\rt-library\` on Windows).
- **No Remote Telemetry**: RT-Library does not transmit analytics, tracking pixels, usage statistics, or catalog contents to any remote server.
- **Isolated Sessions**: Browser authentication cookies and session state used by the scraper remain in an isolated profile on the user's filesystem and are never included in project source or builds.

---

## Network Interactions

When performing user-initiated operations, RT-Library communicates with the following external endpoints:
1. **RuTracker Forum (`rutracker.org`)**: When running scraper synchronization to fetch subforum topics and topic details.
2. **Third-Party Image Hosts (e.g., FastPic, ImageBam)**: When downloading preview screenshots referenced within topic descriptions.
3. **Public BitTorrent Trackers**: When requesting updated swarm peer counts (seeders/leechers) via the torrent metadata service.

---

## Legal & Content Disclaimer

- **Independent Project**: RT-Library is an independent open-source project and is **not** endorsed by, affiliated with, or sponsored by RuTracker, game publishers, console manufacturers, or image-hosting services.
- **No Copyrighted Media Distribution**: RT-Library does **not** host, distribute, download, or supply games, ROMs, ISOs, binary executable files, or copyrighted media.
- **No Bundled Torrent Datasets**: The application does **not** ship with pre-populated databases, torrent files, or magnet catalogs. All catalog data is generated locally by the end user.
- **Third-Party Interoperability**: Third-party integrations are provided solely for personal metadata indexing and catalog interoperability. Users are responsible for complying with applicable local laws, regulations, and third-party terms of service.
- **Anti-Bypass Compliance**: RT-Library does not implement mechanisms to bypass CAPTCHAs, Cloudflare protections, Web Application Firewalls (WAF), or access-control challenges. When an interactive security verification or authentication step is encountered, automated execution halts and reports an `interaction_required` status.

For full legal and content policies, consult [LEGAL.md](LEGAL.md).

---

## Getting Started

### Prerequisites
- Node.js `>= 18.0.0`
- npm `>= 9.0.0`

### Quick Start (Development)
```bash
# 1. Install dependencies
npm install

# 2. Start Vite frontend & Electron in development mode
npm run desktop
```

### Building & Packaging
```bash
# Compile TypeScript & build Vite production bundle
npm run build

# Package for Linux (AppImage & deb)
npm run package:linux

# Package for Windows (NSIS Installer)
npm run package:win

# Verify packaged runtime integrity and privacy
npm run package:verify
```

For detailed setup, packaging, and architecture guides, consult the [Documentation](#documentation) section below.

---

## Releases

Official release binaries are built automatically via GitHub Actions upon tagging:

- **Linux**: Standalone portable **AppImage** (`RT-Library-${VERSION}-linux-x86_64.AppImage`)
- **Windows**: Standard **NSIS Installer** (`RT-Library-${VERSION}-windows-x64-setup.exe`)
- **Integrity Checksums**: Cryptographic hashes for all published binaries are provided in `SHA256SUMS.txt`

For release lifecycle and maintainer procedures, see [Release & Versioning Guide](docs/releasing.md).

---

## License

RT-Library is licensed under the **MIT License**.

You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software under the terms of the license.

See [LICENSE](LICENSE) for the full license text.

---

## Documentation

- [Installation Guide](docs/installation.md)
- [Building & Packaging](docs/building.md)
- [Release & Versioning Guide](docs/releasing.md)
- [System Architecture](docs/architecture.md)
- [Scraper Architecture & Mechanics](docs/scraper.md)
- [Database Management](docs/database-management.md)
- [Image Pipeline & Caching](docs/image-pipeline.md)
- [Data Storage & Directory Structure](docs/data-storage.md)
- [Testing & Regression Checklist](docs/testing.md)
- [UI Current State & Design System](docs/ui-current-state.md)
- [License Selection Guide](docs/license-selection.md)
- [Third-Party License Audit](docs/third-party-license-audit.md)
- [Performance & Benchmark Report](docs/performance-benchmark.md)
- [Release Checklist](RELEASE_CHECKLIST.md)
- [Legal Policy](LEGAL.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)
