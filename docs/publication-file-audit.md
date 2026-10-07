# Publication File Audit

This document classifies project directories and files according to their public release eligibility and safety rules.

---

## 1. Safe Source Code (Included in Public Repository)

- `src/` - React frontend application code, UI components, hooks, themes, i18n translations, utility functions.
- `electron/` - Electron Main process, IPC handlers, SQLite schema, repositories, indexer workers, preload script.
- `scraper/` - Modular Playwright runner, browser session bridge, protocol contracts, execution planner.
- `scripts/` - Maintenance utilities, license audit (`scripts/audit-third-party-licenses.cjs`), package verification (`scripts/verify-package-runtime.cjs`), readiness checkers (`scripts/check-publication-readiness.cjs`).
- `tests/` - Unit, integration, and E2E test suites with sanitized synthetic fixtures.
- `build/` - Multi-platform application icon sets (`.png`, `.ico`, `.icns`).
- `public/` - Public web assets and application icon.
- `docs/` - Comprehensive technical documentation in English:
  - `docs/architecture.md`
  - `docs/building.md`
  - `docs/data-storage.md`
  - `docs/database-management.md`
  - `docs/image-pipeline.md`
  - `docs/installation.md`
  - `docs/license-selection.md`
  - `docs/publication-file-audit.md`
  - `docs/scraper.md`
  - `docs/testing.md`
  - `docs/third-party-license-audit.md`
  - `docs/ui-current-state.md`
- `.github/` - Issue templates (`.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`) and pull request template (`.github/PULL_REQUEST_TEMPLATE.md`).
- Project root governance files:
  - `README.md`
  - `LEGAL.md`
  - `RELEASE_CHECKLIST.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `CHANGELOG.md`
  - `THIRD_PARTY_NOTICES.md`
  - `THIRD_PARTY_LICENSES.txt`
  - `ARCHITECTURE.md` (root reference stub)
  - `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `playwright.config.ts`, `.gitignore`, `.env.example`.

---

## 2. Ignored & Excluded Artifacts (Protected via `.gitignore`)

- `node_modules/` - Third-party dependencies.
- `dist/`, `dist-desktop/`, `out/`, `release/` - Compiled bundles and binary packaging artifacts.
- `*.sqlite`, `*.db`, `*.sqlite-wal`, `*.sqlite-shm` - Runtime user databases.
- `.userData/`, `data/`, `diagnostics/`, `backups/`, `logs/`, `scratch/`, `tmp/`, `cache/` - Local runtime data, test dumps, backups.
- `scraper-profile/`, `playwright-profile/`, `cookies*`, `storage-state*`, `*.session` - Browser authentication and session data.
- `.env`, `.env.*` - Environment secrets.
- `test-results/`, `playwright-report/`, `coverage/` - Test outputs.
- `covers/`, `screenshots/`, `artwork/`, `image-cache/` - Downloaded media caches.

---

## 3. Test Fixtures (Sanitized)

- `tests/fixtures/libraryItems.ts` - Synthetic mock catalog items (`game-1` to `game-5`).
- `tests/fixtures/rutracker-images/*.html` - Minimal synthetic HTML DOM snippets for parser testing without copyrighted descriptions.
- `scripts/fixtures/screenshot-urls.json` - Sample URL test patterns for normalizer verification.
