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

The health check opens the index and the selected category's subforum using the category configuration in `scripts/console.js`. Without `--category`, it checks the Wii subforum (`f=773`). A challenge stops the run before injection or export.

If verification is required, run `npm run scraper:login -- --category xbox`, complete the challenge in the visible browser, and confirm that the topic list loads before closing the window. Closing saves the profile; it does not prove that a later headless run will pass. Retry `npm run scraper -- --category xbox`. If the headless run is still challenged, try `npm run scraper:headed -- --category xbox`.

Run the scraper regression tests:

```bash
node scripts/test-playwright-runner.cjs
node scripts/test-scraper-manager.cjs
node --test scripts/test-scraper-session.cjs
```

## Architecture

- **`scraper/browser.cjs`**: Launches persistent Playwright Chromium context stored outside project repository (`~/.config/rt-library/scraper-profile`). Performs health checks to detect Cloudflare/anti-bot challenges.
- **`scraper/scraperBridge.cjs`**: Injects `scripts/console.js`, forwards `[BROWSER]` logs, executes scraping tasks, and calls `EcoHubScraper.exportAll()`.
- **`scraper/exportCatalogs.cjs`**: Validates catalogs (`schemaVersion: 2`, empty category rejection `EXPORT_REJECTED_EMPTY_CATEGORY`) and writes files atomically via `.tmp` -> `fsync` -> `rename`.
- **`scraper/runner.cjs`**: Main CLI runner with mutex lock (`scraper.lock`), global 2h timeout, and command handling.
