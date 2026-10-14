# Playwright RuTracker Scraper Runner (Stage 1)

Automated Playwright runner for RuTracker scraping, eliminating manual DevTools execution while maintaining current JSON file export and SQLite ingestion architecture.

## Overview

```text
RuTracker (rutracker.org)
       ↓
Playwright Chromium (Persistent Session Profile)
       ↓
scripts/console.js Injection & Automation API
       ↓
IndexedDB Browser Storage
       ↓
Atomic JSON Export (.tmp -> fsync -> rename)
       ↓
data/*.json (or target catalog data directory)
       ↓
RT-Library Existing Scanner / Native Importer
       ↓
SQLite Database (rt-library-v2.sqlite)
```

## Commands

```bash
# Initialize / Refresh Persistent Browser Session (Headed Browser)
npm run scraper:login

# Verify access to a specific category's subforum
npm run scraper:login -- --category xbox

# Run Automated Scraper (Headless, Incremental)
npm run scraper

# Run Scraper with Headed Browser (Debugging)
npm run scraper:headed

# Advanced Options
node scraper/runner.cjs --full
node scraper/runner.cjs --category switch
node scraper/runner.cjs --refresh-screenshots
node scraper/runner.cjs --refresh-sizes
node scraper/runner.cjs --refresh-files
```

Before scanning, RT-Library probes the requested scope. `--category` checks that category; without it, every enabled category receives a lightweight first-page probe and the strict scan is blocked if any category needs interaction or is otherwise unavailable. This check does not treat one accessible category as proof that the full scope is ready.

If verification is required, choose the app's explicit verification action or run `npm run scraper:login -- --category xbox`. Complete any legitimate browser verification manually; the app uses the same persistent profile and probes again after the window closes. Challenges stop the current operation without bypass or automatic retry.

Run the scraper regression tests:

```bash
node scripts/test-playwright-runner.cjs
node scripts/test-scraper-manager.cjs
node --test scripts/test-scraper-session.cjs
```

## Architecture

- **`scraper/browser.cjs`**: Launches the persistent Playwright context under the platform's RT-Library user-data directory. Performs health checks to detect Cloudflare challenges.
- **`scraper/scraperBridge.cjs`**: Injects `scripts/console.js`, forwards `[BROWSER]` logs, executes scraping tasks, and calls `EcoHubScraper.exportAll()`.
- **`scraper/exportCatalogs.cjs`**: Validates catalogs (`schemaVersion: 2`, empty category rejection `EXPORT_REJECTED_EMPTY_CATEGORY`) and writes files atomically via `.tmp` -> `fsync` -> `rename`.
- **`scraper/runner.cjs`**: Main CLI runner with mutex lock (`scraper.lock`), global 2h timeout, and command handling.
