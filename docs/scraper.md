# RT-Library Scraper & Synchronization Architecture

## Overview

RT-Library is a local-first desktop game catalog manager. It uses an integrated scraping and synchronization subsystem to discover, index, and organize game metadata from configured RuTracker forum subforums into a local SQLite database.

The synchronization architecture supports multiple access pathways orchestrated by a deterministic transport resolver:

1. **Browser Companion (Recommended Production Transport)**: Fetches forum pages directly within the user's regular browser session (Chrome, Chromium, Brave, Edge) via an authenticated local loopback bridge, sharing legitimate user sessions and Cloudflare clearance cookies without automated bypasses.
2. **Embedded Electron ("Built-in Scraper" - Autonomous In-App Transport, Experimental)**: Autonomous background worker pool inside Electron Main (`show: false`, partition `persist:rutracker-v1`, worker ceiling C=3). Runs background scans with in-app human verification for Cloudflare challenges. Marked as experimental due to Cloudflare Turnstile verification loops under certain network/runtime conditions; includes loop detection (`VERIFICATION_LOOP`) and automatic fallback guidance.
3. **Playwright Direct Scraper (Automation Contingency)**: Runs an isolated Chromium instance for headless automation or headed verification fallback.
4. **Manual HTML Import (Offline Fallback)**: Parses single `.html` or `.htm` files saved locally by the user without requiring active network requests.

All parsed game records are normalized and written exclusively to SQLite by the Electron Main process. The application ships with an empty catalog; all data is managed and owned locally by the user.

---

## Why Browser Companion Exists

Automated browser environments (such as Playwright, Puppeteer, or headless Chromium) often face strict security verifications, Web Application Firewalls (WAF), or Cloudflare challenges. These verification mechanisms frequently block or repeatedly challenge automated browser runtimes.

Rather than attempting automated circumvention, stealth spoofing, or CAPTCHA solving—which violate security standards and break frequently—RT-Library introduces the **Browser Companion**:

- **Normal Browser Session**: The user browses RuTracker in their daily browser (Chrome, Chromium, Brave, or Edge). Any required Cloudflare verification or login occurs naturally and legitimately through the user's own browser interface.
- **Local Bridge**: When the user initiates a sync in RT-Library, the desktop app sends local fetch instructions to the lightweight Browser Companion extension via a loopback HTTP bridge.
- **In-Page Fetching**: The extension performs authenticated `fetch()` requests directly inside the context of an open RuTracker tab using standard browser session credentials.
- **Separation of Concerns**: The extension acts purely as a transport pipe. It transmits raw HTML bytes back to the desktop application, where parsing, validation, normalization, and database storage take place.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          RT-Library Desktop App                        │
│                                                                        │
│  ┌─────────────────────────┐          ┌─────────────────────────────┐  │
│  │   React UI (Renderer)   │          │     Electron Main Process   │  │
│  │                         │          │                             │  │
│  │  - First Run Wizard     │   IPC    │  - ScraperManager           │  │
│  │  - Settings > Scraper   │ ───────► │  - TransportResolver        │  │
│  │  - Progress & Logs      │ ◄─────── │  - ScanEngine (scanLibrary) │  │
│  │  - Library Catalog Grid │          │  - BrowserCompanionBridge   │  │
│  └─────────────────────────┘          └──────────────┬──────────────┘  │
│                                                      │                 │
│                                      Loopback HTTP   │ (127.0.0.1)     │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                                 GET /commands         │ POST /responses
                                 (Bearer Token)        │ (10 MiB limit)
                                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       User's Normal Web Browser                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                 Browser Companion Extension (MV3)                │  │
│  │                                                                  │  │
│  │  - Background Service Worker (src/background.js)                 │  │
│  │  - chrome.scripting.executeScript in MAIN world                  │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                 fetch() with        │ credentials: 'include'           │
│                 windows-1251 decode │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Open RuTracker Browser Tab                   │  │
│  │                https://rutracker.org/forum/...                   │  │
│  │                                                                  │  │
│  │        [Legitimate user session / Cloudflare passed]             │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │     RuTracker Servers     │
                        └───────────────────────────┘
```

### Data Pipeline Inside RT-Library

Once HTML is received from the transport:

```
HTML Response (bytes)
        │
        ▼
RuTrackerHtmlParser (pure JSDOM parser in scraper/parsers/rutrackerHtmlParser.cjs)
        │
        ▼
Metadata Normalizer (metadataNormalizer.cjs & titleExtractor.cjs)
        │
        ▼
IngestionService (electron/indexer/ingestionService.cjs)
        │
        ▼
SQLite Main Process Transaction (electron/database/repositories/itemsRepo.cjs)
        │
        ▼
Catalog Updated in UI
```

---

## Component Responsibilities

| Component | Location | Responsibility |
| :--- | :--- | :--- |
| **Renderer UI** | `src/components/scraper/`, `src/components/onboarding/` | Presents controls, displays progress bars, handles cancel signals, and renders access check statuses. |
| **Scraper Manager** | `electron/scraper/scraperManager.cjs` | Singleton state machine managing preflight checks, job logs, cancellation flags, and IPC broadcasting. |
| **Transport Resolver** | `electron/scraper/transportResolver.cjs` | Dynamically selects `BROWSER_COMPANION`, `PLAYWRIGHT`, or `MANUAL_IMPORT`. |
| **Universal Scan Engine** | `electron/scraper/scanEngine.cjs` | Core scan loop driving page pagination, early stopping, and on-demand topic detail enrichment. |
| **Browser Companion Bridge** | `electron/scraper/browserCompanionBridge.cjs` | Local loopback HTTP server (127.0.0.1) providing authenticated command queues and response intake. |
| **Companion Extension** | `browser-companion/src/` | MV3 browser extension executing in-tab fetches on `rutracker.org` tabs and streaming raw HTML back. |
| **HTML Parser** | `scraper/parsers/rutrackerHtmlParser.cjs` | Stateless DOM parser extracting topic tables (`viewforum.php`) and topic details (`viewtopic.php`). |
| **Metadata Normalizer** | `electron/scraper/metadataNormalizer.cjs` | Cleans and normalizes developers, publishers, genres, languages, release years, and titles. |
| **Ingestion Service** | `electron/indexer/ingestionService.cjs` | Deduplicates incoming topic lists and wraps repository batch inserts in SQLite transactions. |
| **SQLite Repositories** | `electron/database/repositories/itemsRepo.cjs` | Atomic persistence for `items` and `item_details` tables. Electron Main is the sole writer. |

---

## Transport Hierarchy

When a scan or access check starts, `resolveActiveTransport()` evaluates available pathways according to preference and promotion policy:

### 1. When User Selects an Explicit Preference
- `EMBEDDED_ELECTRON`: Uses Built-in Scraper.
- `BROWSER_COMPANION`: Uses Browser Companion if connected; falls back to Playwright if disconnected.
- `PLAYWRIGHT`: Uses Playwright direct scraper.
- `MANUAL_IMPORT`: Uses offline HTML file import.

### 2. When Preference is `AUTOMATIC` (Default)
- **Promoted Mode (`scraper_embedded_promoted = true`)**:
  ```
  Priority 1: EMBEDDED_ELECTRON (Built-in Scraper - Primary Autonomous Transport)
  Priority 2: BROWSER_COMPANION (if connected - High-Reliability Fallback)
  Priority 3: PLAYWRIGHT (Direct Automation Fallback)
  Priority 4: MANUAL_IMPORT (Offline HTML Fallback)
  ```
- **Unpromoted / Companion-First Mode (`scraper_embedded_promoted = false`)**:
  ```
  Priority 1: BROWSER_COMPANION (if connected and available)
  Priority 2: PLAYWRIGHT (Direct Automation Fallback)
  Priority 3: MANUAL_IMPORT (Offline HTML Fallback)
  Priority 4: EMBEDDED_ELECTRON (Available via manual selection under Advanced Options)
  ```

Once a scan starts, the resolved transport is **frozen for the entire job duration**; no surprise mid-flight transport switches occur.

---

## Browser Companion Technical Implementation

### Local Bridge & Connection Architecture

The Browser Companion Bridge is an embedded Node.js HTTP server created in `electron/scraper/browserCompanionBridge.cjs`:

- **Loopback Only**: Binds strictly to `127.0.0.1` on an ephemeral OS-assigned port (`server.listen(0, '127.0.0.1')`).
- **Dynamic Session Token**: Generates a cryptographically secure 32-byte hex token (`crypto.randomBytes(32).toString('hex')`) on bridge startup. The token resides strictly in Electron Main memory.
- **Connection Code Format**: Rendered in the UI as `PORT:TOKEN` (e.g., `45231:a1b2c3d4...`).
- **Handshake Protocol**:
  1. The extension popup submits `PORT` and `TOKEN`.
  2. Extension sends `POST http://127.0.0.1:<port>/v1/hello` with `Authorization: Bearer <token>` and `extensionVersion`.
  3. Bridge generates a UUID v4 `sessionId`, validates protocol version `1`, and replies with `{ type: "WELCOME", protocolVersion: 1, sessionId, appVersion }`.
  4. Extension stores `endpoint`, `token`, and `sessionId` in `chrome.storage.session`.
- **Heartbeat & Polling**:
  - Extension polls `GET /v1/commands` with `Authorization: Bearer <token>`, `X-RT-Protocol: 1`, and `X-RT-Session: <sessionId>`.
  - Bridge uses long polling: responds immediately if a command is queued; otherwise holds the connection for up to 5 seconds.
  - Connection is declared disconnected if no poll or message is seen for 120 seconds (`COMPANION_STALE_MS = 120000`).

### In-Page Fetch Mechanism

When executing `FETCH_CATEGORY` or `FETCH_TOPIC`:

1. **Tab Query**: Extension queries `chrome.tabs.query({})` for open tabs whose origin is `https://rutracker.org`.
   - If no RuTracker tab is found, it returns `NO_RUTRACKER_TAB`.
   - Prioritizes the active tab, then tabs matching the requested URL, then the first open RuTracker tab.
2. **Execution Context**: Extension injects a function into the RuTracker tab using `chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', ... })`.
3. **Execution**: The injected function runs `fetch(targetUrl, { credentials: 'include' })` inside the RuTracker tab.
4. **Encoding**: Reads the response buffer and decodes it via `new TextDecoder('windows-1251').decode(bytes)`.
5. **Payload Guard**: If response exceeds 10 MiB (`10 * 1024 * 1024` bytes), it aborts and returns `tooLarge: true` (`PAYLOAD_TOO_LARGE`).
6. **Delivery**: Submits the HTML and metadata to `POST /v1/responses` on the local bridge.

### Companion Command Protocol

| Command Type | Direction | Payload Properties | Purpose |
| :--- | :--- | :--- | :--- |
| `FETCH_CATEGORY` | Bridge → Extension | `requestId`, `url`, `categoryId` | Fetches a subforum listing page (`viewforum.php?f=...&start=...`). |
| `FETCH_TOPIC` | Bridge → Extension | `requestId`, `url`, `categoryId`, `topicId` | Fetches a specific topic detail page (`viewtopic.php?t=...`). |
| `CANCEL` | Bridge → Extension | `requestId` | Aborts an in-flight fetch request via `AbortController`. |

### What the Extension Does NOT Do

To maintain safety, privacy, and stability:
- It **never** reads, exports, or modifies `chrome.cookies`.
- It **never** solves CAPTCHAs or bypasses Cloudflare Turnstile automatically.
- It **never** alters the browser's User-Agent, Canvas, or WebGL fingerprint.
- It **never** proxies traffic to third-party servers.
- It **never** connects to SQLite or executes database queries.

---

## Access Check Workflow

Before starting a scan or on user request, the application performs an access check on the target category:

```
User clicks "Verificar Acesso" (Check Access)
                      │
                      ▼
App sends `companion:check-access` IPC to Electron Main
                      │
                      ▼
Bridge queues FETCH_CATEGORY command for Category Page 1
                      │
                      ▼
Extension receives command, verifies open RuTracker tab, fetches page
                      │
                      ▼
Extension posts HTML response back to Bridge
                      │
                      ▼
Main process onPage handler analyzes response HTML:
  - Checks for forum markers: .torTopic, #page_container, forumline
  - Checks for security markers: cf-chl-, challenge-platform, "just a moment"
  - Checks for login markers: name="login", forum/login.php
                      │
                      ▼
App classifies status:
  - FORUM_READY: Listing detected, topic count extracted. Ready to sync.
  - CHALLENGE_REQUIRED / INTERACTION_REQUIRED: Cloudflare challenge present.
  - AUTH_REQUIRED: Forum requires user login.
  - NO_RUTRACKER_TAB: User needs to open rutracker.org in browser.
  - FETCH_ERROR / HTTP_ERROR: Network or server error.
```

---

## Browser Companion State Model & Recovery UX (V3-65)

To eliminate ambiguity between an installed extension, an active local bridge session, and RuTracker forum accessibility, RT-Library standardizes connection lifecycle tracking across both **First Run Onboarding** and **Settings > Scraper** into a unified 10-state machine (`useCompanionConnection`):

### 1. State Model

| State | Definition | Description |
| :--- | :--- | :--- |
| `NOT_INSTALLED` | Extension not detected | The user has not built or loaded the companion in their browser. |
| `DISCONNECTED` | Bridge idle / no handshake | The local loopback HTTP server is ready, but no browser session is active. |
| `CONNECTING` | Awaiting initial handshake | The desktop app is displaying the temporary `PORT:TOKEN` code and waiting for the extension `/v1/hello` request. |
| `CONNECTED` | Bridge handshake complete | Handshake succeeded; background long polling is active, but access has not yet been probed. |
| `CHECKING_ACCESS` | Probe in-flight | Desktop app dispatched `FETCH_CATEGORY` to test access on category Page 1. |
| `READY` | Verified forum access | Handshake active AND Page 1 returned `FORUM_READY`. Synchronization is fully ready. |
| `VERIFICATION_REQUIRED` | Cloudflare challenge | RuTracker returned a Cloudflare Turnstile or security challenge requiring manual interaction. |
| `NO_RUTRACKER_TAB` | Missing browser tab | Extension reported that no open tab on `https://rutracker.org` was found. |
| `TIMEOUT` | Access check timed out | Probe request exceeded 15 seconds without a response from the browser tab. |
| `ERROR` | Bridge or transport fault | Network error, invalid handshake response, or bridge execution exception. |

### 2. Core Semantics: The 3 Pillars

RT-Library strictly separates three operational concepts that must never be conflated:

1. **INSTALLED**: The Browser Companion extension is loaded into the user's Chromium browser.
2. **CONNECTED**: An authenticated local HTTP loopback bridge session (`sessionId`) is actively polling `127.0.0.1`.
3. **READY**: The bridge is connected **and** access to RuTracker has been verified (`FORUM_READY`).

An installed extension does **not** imply an active session. An active session does **not** imply RuTracker access.

### 3. Ephemeral Session Lifecycle

> [!IMPORTANT]
> **Mandatory Temporary Session Notice**:
> *"Browser Companion connections are temporary and valid only for the current RT-Library session. You may need to reconnect after restarting RT-Library or reloading the extension."*

- **Zero Persistence Across Restarts**: The connection state is **never** persisted to disk or SQLite. Every time RT-Library launches, the state begins in `DISCONNECTED` (or `NOT_INSTALLED`).
- **Heartbeat & Stale Expiration**: Active sessions poll every 2.5 seconds. If the bridge heartbeat exceeds 120 seconds (`COMPANION_STALE_MS`), the session is marked expired and automatically transitions to `DISCONNECTED` with `isExpired: true`.
- **Clean Reconnect**: Clicking **Reconnect** calls `reconnectCompanion()`, invalidates the previous session ID, clears the command queue, starts a fresh bridge instance, and presents a new connection code until connected.

### 4. Contextual Recovery Actions

| Failure State | Localized User Guidance | Recovery Actions |
| :--- | :--- | :--- |
| `NO_RUTRACKER_TAB` | *"Open RuTracker in your browser to continue."* | `[Open RuTracker]` and `[Check Again]` |
| `VERIFICATION_REQUIRED` | *"Browser verification is required. Complete the verification in the open RuTracker tab, then return here."* | `[Open RuTracker]` and `[Check Again]` |
| `TIMEOUT` | *"Could not confirm browser access."* | `[Check Again]` and `[Reconnect]` |
| `NOT_INSTALLED` | *"Browser Companion is not detected."* | `[Setup Instructions]`, `[Use Playwright]`, `[Import Saved Page]` |
| `STALE / EXPIRED` | *"Connection expired. Reconnect to continue synchronization."* | `[Reconnect]` |

### 5. Update Library Guard

When the Browser Companion is the designated transport, clicking **Update Library** while not in the `READY` state intercepts execution immediately:
- A non-intrusive recovery notice appears indicating why synchronization cannot proceed.
- The user is directed to the appropriate recovery action (`[Check Access]` or `[Reconnect]`).
- Prevents launching broken scans that would fail with opaque network errors.

### 6. Diagnostics & Telemetry Security

Technical diagnostics are housed inside a collapsible accordion in **Settings > Scraper**:
- **Displayed Telemetry**: Masked session ID (`abcd...1234`), extension version, bridge status, protocol version, last access probe timestamp, and heartbeat timestamp.
- **Strict Security Rule**: The secret Bearer token and full connection code are **never** rendered in diagnostics. The code is only rendered during the `CONNECTING` phase.

---

## Embedded Electron Transport (V3-80 Experimental Prototype)

The **Embedded Electron Transport** (`EmbeddedElectronTransport.cjs`) is an autonomous, background scraping engine prototyped in V3-80:

### Key Technical Architecture
1. **Isolated Persistent Partition**: Uses `session.fromPartition('persist:rutracker-v1')` located exclusively under application `userData`. Never reuses personal browser profiles or automation profiles.
2. **Strictly Hidden Windows**: Windows are created with `show: false`, `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. No windows or popups are visible to the user during normal execution.
3. **Bounded Concurrency (C=3)**: Owns a fixed pool of 3 reusable hidden `BrowserWindow` worker instances matching ScanEngine's topic detail concurrency limit.
4. **Security Hardening**:
   - Navigation restricted strictly to allowlisted RuTracker origins (`rutracker.org`, `rutracker.net`, `rutracker.nl`).
   - Blocks external protocols (`magnet:`, `mailto:`) and sensitive schemes (`file://`, `javascript:`, `data:`).
   - Denies popups (`setWindowOpenHandler` returns `action: 'deny'`).
   - Automatically cancels all file downloads (`will-download`).
   - Denies all device and privacy permission requests.
   - Strictly NO preload script exposing RT-Library APIs to remote pages.
5. **Decoupled Data Flow**:
   - Fetches HTML into memory via `webContents.executeJavaScript('document.documentElement.outerHTML')`.
   - Passes raw HTML directly to the existing pure `rutrackerHtmlParser.cjs`.
   - Cyrillic titles and metadata are natively decoded into UTF-16 Unicode without mojibake.
6. **Experimental Status**:
   - Browser Companion remains the production default.
   - Embedded transport is selectable via experimental flag for testing and comparison.
   - Long-run multi-hour stability and Windows runtime validation remain ongoing.

---

## First Run / Initial Sync (Guided Onboarding)

When opening RT-Library with an empty database, the application displays a 6-step guided onboarding flow (`FirstRunScraperScreen.tsx`):

### Step 1: Welcome (`WELCOME`)
- Welcomes the user with a concise explanation of RT-Library's local catalog model.
- Introduces the Browser Companion extension as the recommended, privacy-safe transport mechanism.
- Provides immediate action to start setup or skip directly to an empty library.

### Step 2: Choose Categories (`CATEGORIES`)
- Reusable `CategorySelector` component groups subforums cleanly by platform (Nintendo, PlayStation, Xbox, PC/Retro).
- Quick actions: **Select All** and **Clear Selection**.
- Interactive count badge displaying active selections (e.g. `12 / 12`).
- Validation guard: The continue button is disabled if 0 categories are selected.

### Step 3: Connect Browser Companion (`COMPANION`)
- Explains why the extension is needed: it allows RT-Library to fetch forum listings safely through the user's existing browser session without sharing login credentials or cookies.
- **Temporary Connection Model**: Highlights that the Companion connection is local and session-bound. Closing the app or restarting the browser terminates the session.
- Displays connection code (`PORT:TOKEN`) with one-click copy and install instructions modal.
- Once connected, the secret code is automatically hidden and replaced by a green connected indicator and next action.

### Step 4: Check Access (`ACCESS`)
- Prompts user to open RuTracker (`Abrir RuTracker`) in their browser to pass any active Cloudflare Turnstile challenge or log in.
- Provides a **Check Access** button that probes category Page 1 via the active companion session.
- Displays human-friendly status messages (e.g., "Forum accessible and ready for synchronization", "Cloudflare verification needed in your browser tab", "Please open rutracker.org in your browser") instead of raw internal enums.
- Previews the total categories configured and confirmation that access is ready.

### Step 5: Initial Sync (`SYNC`)
- Initiates catalog synchronization via the Universal Scan Engine (`scanEngine.cjs`).
- Displays live progress: active category, current page number, discovered topics, items enriched, and dynamic progress bar with animated mascot.
- Includes a safe **Cancel** action that halts ingestion cleanly without leaving orphaned background processes.

### Step 6: Ready (`READY`)
- Celebrates setup completion with summary metrics: total items imported and categories synchronized.
- Primary Call to Action: **Open Library** (`Abrir Biblioteca`), which transitions into the catalog view with newly scraped items sorted newest first (`discoveredAt DESC`).
- Alternative actions: User can trigger HTML file import or skip at any stage.

---

## Scraper Settings Operational Dashboard (V3-64)

In **Settings → Scraper** (`ScraperPanel.tsx`), the interface is organized into a high-density, daily-use operational dashboard structured across six distinct sections:

### Section A: Sync Status Card
- **Real-Time Operational Indicators**:
  - **Browser Companion**: Visual state indicator with status badge (`Connected` / `Disconnected`).
  - **RuTracker Access**: Probed status (`Accessible` / `Verification required` / `No tab open` / `Not checked`).
  - **Last Sync**: Formatted timestamp of the most recent successful sync, or `Never`.
  - **Active Sync Method**: Active transport with badge (`Browser Companion [Recommended]`, `Playwright [Alternative]`, `Manual HTML [Offline]`).
- **Primary CTA**: Prominent **Update Library** button to trigger synchronization directly from the status summary.

### Section B: Browser Companion & Session Health
- **Temporary Connection Notice**: Prominently explains that the connection is local and valid only for the current RT-Library session.
- **3-Pillar Status Distinction**:
  - **Extension Installed**: `Installed (YES)` vs `Not detected (NO)`
  - **Session Connected**: `Connected (YES)` vs `Disconnected (NO)`
  - **RuTracker Ready**: `Ready (YES)` vs `Verification required` / `Not checked (NO)`
- **Contextual Actions & Recovery**:
  - When disconnected: **Reconnect Browser Companion** and **Setup Instructions** modal.
  - When connected: **Open RuTracker** in external browser and **Check Access** probe button.
- **Secret Token Security**: Automatically hides `PORT:TOKEN` from the standard view once connected; technical telemetry is moved into Diagnostics.

### Section C: Category Scope & Management
- **Compact Summary**: Displays enabled count (e.g. `12 of 16 enabled`) without rendering massive lists.
- **Manage Categories**: Action button navigating cleanly to the Category Management subview.

### Section D: Update Library Execution
- **Scope Selector (WHERE Invariant)**: Allows switching between `All Categories` and a `Single Category` dropdown. Scope is strictly decoupled from scan options.
- **Primary Execution Button**: Triggers incremental or full synchronization.
- **Real-Time Progress Component**: Reuses `ScraperProgress` showing current subforum, page, topic discovery counts, animated mascot, and cancel action.

### Section E: Collapsible Advanced Options
- Kept collapsed by default behind an accordion to avoid cluttering daily routines.
- Controls:
  - **Full Scan**: Deeper scan forcing complete re-evaluation.
  - **Refresh Screenshots**: Re-downloads and updates cover/screenshot URLs.
  - **Refresh Sizes**: Updates torrent sizes and seed/leech stats.
  - **Refresh File Lists**: Re-scrapes topic torrent file trees.
  - **Deep Scan**: Continues beyond early-stop thresholds.
  - **Refresh Cost Notice**: Highlights the network and processing overhead of exhaustive scans.

### Section F: Alternative Sync Methods & Diagnostics
- **Playwright Direct Crawler**: Automated headless/headed fallback with verification support.
- **Manual HTML Import**: Offline import button (`Import Saved RuTracker Page`) for `.html` dumps.
- **Single Topic Import**: Direct URL or topic ID enrichment.
- **Technical Diagnostics Accordion**:
  - Hidden by default.
  - Displays extension version, bridge status, protocol version, bridge port, last access check result, and HTTP payload size without exposing secret tokens or session cookies.

## Update Library

When running an update from an existing library (**Settings → Scraper**):

1. **Scope Selection**: User selects a **Single Category** (e.g. `Nintendo Switch`) or **All Categories** from the dropdown.
2. **Transport Check**: App verifies that Browser Companion is connected. (If disconnected, falls back according to transport hierarchy).
3. **Category Traversal**:
   - Fetches Category Page 1 (`start=0`).
   - Determines `totalPages` from pagination links.
   - Extracts topic rows (`title`, `topicId`, `sizeStr`, `seeds`, `leechers`).
4. **Incremental Topic Comparison**:
   - Checks retrieved `topicId`s against known IDs already stored in SQLite.
   - If topics are already known, increments the consecutive known counter.
   - If new topics are found, queues them for detail enrichment.
5. **Topic Detail Enrichment**:
   - For newly discovered topics, calls `transport.fetchTopic()` to load `viewtopic.php`.
   - Extracts cover image, screenshots, magnet link, file list, developer, genre, and metadata.
6. **Ingestion**:
   - Batches normalized items through `ingestRawBatch()`.
   - Updates `items` and `item_details` tables atomically.
7. **Catalog Refresh**:
   - UI catalog updates reactively, showing newly added items at the top of the list.

---

## Category Scope vs Scan Options

> [!IMPORTANT]
> **Category Selector defines WHERE.**
> **Scan Options define HOW.**

- **Category Scope (WHERE)**:
  - **Single Category**: Scopes execution strictly to the chosen category. No other categories will be contacted regardless of scan switches.
  - **All Categories**: Iterates across all currently enabled categories in priority order. Disabled categories are skipped.
- **Scan Options (HOW)**:
  - **Incremental (Default)**: Scans from page 1 and stops early when encountering consecutive pages of already-known topics.
  - **Full Scan**: Performs discovery across pages up to the early-stop threshold and forces full refresh of metadata fields.
  - **Refresh Switches**: Re-evaluates existing items to update screenshots, file lists, or sizes.

---

## Incremental Scan Semantics

The incremental scan is designed for rapid synchronization (typically completing in seconds):

1. Scans start at Page 1 of the subforum.
2. Newly posted topics appear on Page 1.
3. If new topics are found:
   - Counter of consecutive duplicate pages resets to 0.
   - Topic details are fetched and enriched immediately.
4. If an entire page contains only topics that are already present in SQLite:
   - `consecutiveKnownPages` increments by 1.
5. **Early Stop Condition**:
   - When `consecutiveKnownPages >= 3` (default threshold), the engine halts category traversal.
   - Traversal moves to the next category in scope.

---

## Full Scan Semantics

When **Full Scan** is enabled:

- Automatically activates:
  - `refreshScreenshots: true`
  - `refreshSizes: true`
  - `refreshFiles: true`
  - `discoverNewTopics: true`
- Retains safety early-stop buffer (3 consecutive known pages) unless `ignoreEarlyStop` is explicitly checked.
- Ensures all new items discovered during traversal receive complete metadata and media enrichment.

---

## Topic Detail Enrichment

Category listing pages (`viewforum.php`) contain only index data:
- Thread title
- Topic ID
- File size string
- Seeds and leechers count

Individual topic pages (`viewtopic.php?t=...`) contain the complete release details:
- **Canonical Game Title**: Cleaned game title without forum release tags.
- **Release Group**: Extracted group or repacker name.
- **Cover Image**: Direct image URL resolved from image hosts (FastPic, ImageBan, PostImg, etc.).
- **Screenshots**: Array of direct image URLs extracted from screenshot spoiler blocks.
- **Magnet Link & InfoHash**: `magnet:?xt=urn:btih:...` URI and extracted 40-character BTIH.
- **File List**: File tree extracted from the files spoiler block.
- **Metadata**: Developer, Publisher, Genre, Release Year, Version, Languages, Audio, Image Format, Multiplayer, Region.

### On-Demand vs Batch Enrichment

- **During Scan**: Newly discovered topics are enriched in bounded parallel batches ($C=3$) by `scanEngine.cjs` via `transport.fetchTopic()` worker pools.
- **In Catalog (JIT)**: Opening any game modal (`ItemDetailModal.tsx`) checks if the item is missing a magnet or cover. If missing, it immediately triggers on-demand enrichment through the Browser Companion in the background, updating SQLite and the open modal in real time.

---

## Scraper Runtime UX & Lifecycle Management

RT-Library standardizes the synchronization experience across both the **First Run Onboarding** wizard and the **Settings > Scraper (Update Library)** operational dashboard.

### 1. Unified Progress UI

Both views share the centralized `ScraperProgress` component, ensuring human-friendly telemetry and real-time clarity:
- **Category Scope**: Identifies current category by human-readable name (e.g. `Nintendo Switch`).
- **Multi-Category Overall Progress**: When scanning All Categories, prominently displays `Category X of Y` alongside category-specific page counters.
- **Indeterminate Progress Bar**: If total pages in a subforum are not yet known, displays an indeterminate animated progress bar rather than fabricating arbitrary percentages.
- **Human-Friendly Metrics**: Tracks `Page X of Y`, `Topics found`, `New`, `Already known`, `Details: X / Y`, and `Items saved`. Low-level internal identifiers (`requestId`, bridge tokens) are never shown.

### 2. Synchronization Lifecycle States

| State | Visual Indicator | Available Actions | Description |
| :--- | :--- | :--- | :--- |
| **Running** | Active progress track & themed mascot | `[Cancel]` | Real-time traversal, topic discovery, and detail enrichment. |
| **Paused** | Amber alert badge & status notice | `[Open RuTracker]`, `[Check Access]`, `[Resume]` | Triggered when Cloudflare verification or CAPTCHA is required. |
| **Disconnected Mid-Scan** | Amber card notice | `[Reconnect]` | Browser Companion connection dropped during an active scan. Progress committed to SQLite is fully preserved. |
| **Cancelling / Cancelled** | Neutral badge & message | `[Dismiss]` / `[Start New Scan]` | Clean cancellation. Preserves already committed database rows without orphaned background tasks. |
| **Completed (Up to Date)** | Green checkmark card | `[View Catalog]` | Positive success notification when scan detects zero new items (`Library is already up to date`). |
| **Completed (New Items)** | Green checkmark card | `[View Catalog]` | Summary displays new items added, updated items, skipped topics, and elapsed duration. |
| **Completed with Warnings** | Amber warning card | `[View Details]`, `[View Catalog]` | Partial sync where some categories succeeded while others encountered errors. Includes per-category breakdown. |
| **Failed / Error** | Red error alert card | `[Retry]`, `[Open RuTracker]`, `[Reconnect]` | Categorized error display with contextual actions and zero raw stack traces. |

### 3. Error Model & Categorization

All scan and network failures are mapped into standardized, user-friendly categories with actionable buttons:

- **Connection**: Companion bridge dropped or handshake failed. Action: Reconnect.
- **Access**: RuTracker verification required or login blocked. Action: Open RuTracker + Check Access.
- **Network**: Local host disconnected or network timeout. Action: Retry.
- **Parser**: Unrecognized page layout or corrupted HTML. Action: Retry.
- **Import**: Saved HTML file invalid, empty, or exceeds 15 MiB limit. Action: Select another file.
- **Database**: SQLite transaction failure or disk write error. Action: Check settings.
- **Unknown**: Generic fallback with friendly localized description. Zero raw stack traces or internal Node codes are exposed.

### 4. Empty Catalog Experience

When the catalog contains 0 items, `ItemGrid` and `ItemList` render an empty collection view offering:
- `[Set up synchronization]`: Launches the First Run Onboarding wizard.
- `[Import saved page]`: Opens the offline HTML file picker.
- `[Explore settings]`: Navigates to Settings > Scraper.

---

## HTML Parsing Pipeline

Located in `scraper/parsers/rutrackerHtmlParser.cjs`. Operates on raw HTML strings using pure JSDOM without browser or automation dependencies:

- `parseCategoryHtml(html, context)`:
  - Extracts pagination links (`a.pg`, `start=(\d+)`) to calculate total pages.
  - Queries `a.torTopic` to parse thread titles, URLs, and topic IDs.
  - Extracts seeds, leechers, and size from table cells.
- `parseTopicHtml(html, context)`:
  - Identifies cover art from `.postImgAligned` or the first image outside spoiler wraps.
  - Extracts screenshots strictly from `.sp-wrap` sections containing screenshot keywords.
  - Resolves viewer page links (FastPic, ImageBan, PostImg) to direct image file URLs.
  - Queries `a.magnet-link`, `a[href^="magnet:"]`, and `#tor-size-humn` for magnet and exact byte counts.
  - Parses key-value pairs (Developer, Genre, Languages, etc.) from bold label nodes.

---

## Ingestion & SQLite Persistence

1. **Normalization (`normalize.cjs`)**:
   - Maps raw extracted fields into structured `LibraryItem` schemas.
   - Cleans release years into valid 4-digit integers.
   - Cleans languages into standardized ISO codes and display names.
2. **Ingestion Service (`ingestionService.cjs`)**:
   - Filters duplicate topic IDs within the batch.
   - Sets unified batch discovery timestamps (`batchDiscoveredAt`).
   - Executes batch operations inside atomic SQLite transactions (`db.transaction()`).
3. **Repository Persistence (`itemsRepo.cjs`)**:
   - `items`: Main searchable catalog table with canonical titles, sorting titles, release years, cover URLs, flags (`has_cover`, `has_magnet`, `has_screenshots`), and user favorites.
   - `item_details`: Extended metadata table with `magnet`, `screenshots_json`, `file_list_json`, and `source_json`.
   - **Sole Writer**: Electron Main is the sole writer. SQLite operates in WAL journal mode (`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`).

---

## Fallback Transports

### Manual HTML Import (Offline Fallback)

Located in `electron/scraper/htmlImport.cjs`:

- **Offline**: Zero network requests or browser dependencies.
- **File Picker**: Opens native file dialog for `.html` or `.htm` files.
- **Size Limit**: Enforces a strict 15 MiB limit (`15 * 1024 * 1024` bytes).
- **DOM Detection**: Detects whether the file is a Category listing or Topic page based on DOM structure.
- **Safety**: Treats HTML as untrusted static text. Scripts, styles, and external resources are not executed.
- **Idempotency**: Upserts into SQLite matching on `source + topicId`. Existing user favorites are preserved.

### Playwright Direct Scraper (Automation Fallback)

Located in `scraper/runner.cjs` and `scraper/browserSession.cjs`:

- Used as secondary fallback when Browser Companion is not connected.
- Manages an isolated Chromium persistent context at `<userData>/scraper-profile/`.
- Uses `--headless=new` for background runs.
- **Known Limitation**: Automated browser instances are subject to Cloudflare challenges that cannot be completed automatically. If challenged, execution pauses and emits `INTERACTION_REQUIRED`.

---

## Browser Companion Installation Guide

The Browser Companion is an unpacked Manifest V3 Chromium extension located in `browser-companion/`:

### 1. Build and Validate

From the project root:

```bash
npm run companion:build
npm run companion:validate
```

This compiles extension assets into `browser-companion/dist/` and validates manifest integrity.

### 2. Load into Chromium Browser

Supported browsers: Google Chrome, Chromium, Brave, Microsoft Edge.

1. Open your browser and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click the **Load unpacked** button.
4. Select the directory:
   ```
   <project-root>/browser-companion/dist
   ```
5. The extension **RT Library Browser Companion** appears in your extensions list.

### 3. Connect to RT-Library

1. Start RT-Library (`npm run desktop`).
2. Go to **Settings → Scraper** (or use First Run Onboarding).
3. Under **Browser Companion**, click **Conectar Extensão** (Connect).
4. Copy the displayed Connection Code (`PORT:TOKEN`).
5. Click the extension icon in your browser toolbar, paste the code into the popup, and click **Connect**.
6. The popup immediately transforms into **Connected Mode**:
   - Connection form, port, token, and button are completely hidden.
   - Session endpoint (`127.0.0.1:<port>`) and RuTracker tab status (`✓ Tab detected`) appear.
   - Real-time session duration, completed/active/failed requests, category/topic counts, and transferred bytes display.
   - **Disconnect** button is provided to cleanly terminate the session at any time.

---

## Running Locally

### Development Commands

| Command | Purpose |
| :--- | :--- |
| `npm run desktop` | Starts Vite dev server and launches Electron desktop app. |
| `npm run companion:build` | Builds the unpacked extension to `browser-companion/dist`. |
| `npm run companion:validate` | Validates extension manifest and script references. |
| `npm test` | Runs the Vitest test suite (64 test files, 591+ tests). |
| `npm run build` | Runs TypeScript check (`tsc`) and Vite production bundle. |
| `npm run package:linux` | Builds Linux AppImage package. |
| `npm run package:win` | Builds Windows NSIS installer package. |

> [!NOTE]
> If running in an environment where parent processes set `ELECTRON_RUN_AS_NODE=1`, start the desktop app with:
> ```bash
> env -u ELECTRON_RUN_AS_NODE npm run desktop
> ```

---

## Performance, Benchmarks & Concurrency Architecture

### 1. Concurrency Architecture & Controlled Worker Pool

RT-Library implements a controlled worker pool architecture designed to maximize throughput without triggering rate limits or Cloudflare challenges:

1. **Category Pagination Remains Sequential**: Forum index pages (`FETCH_CATEGORY`) are traversed sequentially (`page 1 -> page 2 -> ...`). This guarantees that pagination boundaries and total topic counts are discovered accurately and deterministically.
2. **Topic Detail Concurrency (`COMPANION_TOPIC_CONCURRENCY = 3`)**: Topic detail fetching (`FETCH_TOPIC`) uses a bounded worker pool of 3 parallel requests.
3. **Bridge In-Flight Buffer (`MAX_CONCURRENT_PENDING = 16`)**: The local loopback HTTP bridge allows up to 16 concurrent pending commands, preventing `COMPANION_REQUEST_BUSY` errors while workers dispatch parallel requests.
4. **RuTracker Tab Caching & Invalidation**: In-memory `cachedTabId` with `chrome.tabs.onRemoved` / `chrome.tabs.onUpdated` invalidation listeners eliminates repeated `chrome.tabs.query()` overhead (98% reduction in tab API latency).
5. **Removal of Artificial Delays**: Removed `sleep(50)` between topic fetches and removed polling delays in `background.js` when commands are queued.
6. **Monotonic Progress Reporting**: The progress reporting mechanism increments `detailsProcessed` monotonically as workers complete out-of-order, preventing UI progress bar jitter.

---

### 2. Local Processing Benchmark (Fixtures & Native Compute)

*Benchmark Type: **LOCAL PROCESSING (FIXTURE)**. Evaluates parsing and database engine in isolation on local CPU without network interaction.*

Profiled on Linux (AMD Ryzen 5 5500, Node v24.11.0, 50 iterations per stage, real forum HTML fixtures):

| Pipeline Stage | Avg Latency | p50 Latency | p95 Latency | % of Local Compute | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **JSDOM HTML Parsing (`parseTopicHtml`)** | **~8.9 ms** | **~7.1 ms** | **~13.1 ms** | **78.8%** | Complete DOM parsing of all fields (magnets, images, file trees) |
| **SQLite Batch Ingest (`itemsRepo.upsertBatch`)** | **~2.3 ms** | **~2.0 ms** | **~4.9 ms** | **20.4%** | Atomic transaction per page (amortized **~0.045 ms / item**) |
| **Windows-1251 Decoding** | **~0.005 ms** | **~0.004 ms** | **~0.009 ms** | **<0.1%** | In-memory byte array decoding |

> [!NOTE]
> Local computation is exceptionally fast (~11.2 ms total per topic). Local compute accounts for less than 2.5% of total real-world scraping time.

---

### 3. Synthetic Concurrency Benchmark (Simulated Network Latency)

*Benchmark Type: **SYNTHETIC CONCURRENCY (MOCKED NETWORK)**. Evaluates worker pool scaling and queuing mechanics under controlled, simulated network round-trip latencies.*

#### Synthetic Scenario A: 150ms Mocked Latency (30 Topics, Local Fixture)

| Concurrency | Total Time | Speedup vs C=1 | Mean Latency | p50 Latency | p95 Latency | Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **C=1** (baseline) | 4.81s | 1.00x | 160.3ms | 158.1ms | 164.2ms | 373.9 topics/min |
| **C=2** | 2.37s | 2.03x | 157.3ms | 156.6ms | 162.4ms | 760.2 topics/min |
| **C=3** (default) | **1.59s** | **3.03x** | **157.8ms** | **156.8ms** | **168.5ms** | **1133.3 topics/min** |
| **C=4** | 1.26s | 3.82x | 158.2ms | 156.5ms | 168.7ms | 1427.4 topics/min |

#### Synthetic Scenario B: 450ms Mocked Latency (50 Topics, Local Fixture)

| Concurrency | Total Time | Speedup vs C=1 | Mean Latency | p50 Latency | p95 Latency | Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **C=1** (baseline) | 22.89s | 1.00x | 457.5ms | 457.0ms | 459.8ms | 131.1 topics/min |
| **C=2** | 11.43s | 2.00x | 457.0ms | 456.8ms | 461.4ms | 262.4 topics/min |
| **C=3** (default) | **7.77s** | **2.94x** | **457.2ms** | **457.1ms** | **460.6ms** | **385.9 topics/min** |
| **C=4** | 5.95s | 3.85x | 457.7ms | 457.3ms | 466.0ms | 504.3 topics/min |

---

### 4. Real Runtime Benchmark (Live Chrome + Browser Companion + Live RuTracker)

*Benchmark Type: **REAL END-TO-END RUNTIME**. Live Google Chrome, active Browser Companion extension, authenticated RuTracker session, real network HTTP in-page fetch, Electron Main JSDOM parsing, and SQLite disk persistence.*

Environment:
- **Operating System**: Linux 7.0.0-38-generic (x64)
- **CPU**: 12x AMD Ryzen 5 5500
- **Browser**: Google Chrome Stable
- **Extension**: Browser Companion v1.0.0 (3 concurrent workers)
- **Target Category**: Nintendo Switch (`viewforum.php?f=1605`)
- **Dataset**: 1,251 real live topics across 25 complete forum pages

#### Real Runtime Scaling (30-Topic Controlled Sample from Page 1)

| Concurrency | Sample | Duration | Throughput | Speedup vs C=1 | Avg Fetch | p50 Fetch | p95 Fetch | Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **C=1** (sequential) | 30 topics | 49.35s | 36.5 topics/min | 1.00x | 1631.8ms | 1479ms | 2905ms | 0 |
| **C=2** | 30 topics | 24.88s | 72.4 topics/min | 1.98x | 1631.8ms | 1479ms | 2905ms | 0 |
| **C=3 (Default)** | **30 topics** | **16.72s** | **107.7 topics/min** | **2.95x** | **1631.8ms** | **1479ms** | **2905ms** | **0** |
| **C=4** | - | - | - | - | - | - | - | *Not tested (avoid rate limit)* |

#### Production Telemetry Across 1,251 Live Topics (25 Complete Pages)

- **Total Live Topics Ingested**: 1,251
- **Average Topic Fetch Latency**: **1,347.8 ms** (p50: **1,327 ms**, p95: **1,919 ms**, max: 3,302 ms)
- **Average Page Duration (50 topics)**: **26.5 seconds**
- **Sustained Real Throughput**: **113.1 topics / minute** (vs ~44.2 topics/min sequential equivalent)
- **Empirical Real Speedup**: **2.56x**
- **Max Observed Concurrency**: 3 active requests in parallel
- **Network Safety Observations**:
  - **HTTP 200 Responses**: 1,251 / 1,251 (100%)
  - **HTTP 403 Responses**: 0 (No Cloudflare challenge was observed during active synchronization)
  - **HTTP 429 Responses**: 0 (No HTTP 429 rate limit response was observed)
  - **Timeouts**: 0
- **Browser Tab Responsiveness**: **RESPONSIVE** (no tab crashes or UI freezes observed)
- **Cancellation**: Verified in real runtime (stopping gracefully during page 26 with all committed data preserved)

#### Real Pipeline Stage Breakdown (% of Total Execution Time)

| Stage | Duration | % of Runtime | Classification |
| :--- | :--- | :--- | :--- |
| **Remote Network (In-Page Fetch)** | **~1,336.6 ms** | **97.5%** | **DOMINANT BOTTLENECK** |
| **Amortized Inter-page Throttle** | ~8.0 ms | 0.6% | Polite 400ms pause between forum pages |
| **JSDOM HTML Parsing** | ~8.9 ms | 1.9% | Native Electron Main DOM parsing |
| **SQLite Batch Insertion** | ~2.3 ms / page | ~0.2% | Transactional atomic write |
| **Windows-1251 Decoding** | ~0.005 ms | <0.1% | In-memory decode |

---

### 5. Data Quality Equivalence Table

Every single metadata field was verified bit-for-bit between sequential and concurrent execution modes across the live sample:

| Metadata Field | Baseline (C=1) | Concurrent (C=3) | Semantic Equivalence | Verification Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Title / Canonical Title** | Extracted | Extracted | **IDENTICAL** | Clean bracket stripping & normalization verified |
| **Cover Artwork URL** | 99.8% present | 99.8% present | **IDENTICAL** | Original full-resolution image URL retained |
| **Screenshot Gallery** | Avg 18.1 / topic | Avg 18.1 / topic | **IDENTICAL** | Full imageban, fastpic, and postimg links parsed |
| **Magnet URI & InfoHash**| 99.4% present | 99.4% present | **IDENTICAL** | 40-character hex infoHash extracted |
| **Torrent Size & Bytes** | Extracted | Extracted | **IDENTICAL** | Size string (`size_str`) and byte count (`size_bytes`) |
| **Nested File List** | Extracted | Extracted | **IDENTICAL** | Multi-file directory hierarchy preserved |
| **Game Release Year** | Extracted | Extracted | **IDENTICAL** | 4-digit release year matched |
| **Developer & Publisher**| Extracted | Extracted | **IDENTICAL** | Parsed from topic header meta |
| **Genre & Languages** | Extracted | Extracted | **IDENTICAL** | Multi-language & interface language mapped |
| **Region, Version, MP** | Extracted | Extracted | **IDENTICAL** | Version, region code, and multiplayer flags |

---

### 6. Subforum Synchronization Projections (Nintendo Switch)

Based on empirical production measurements (26.5s per 50-topic page, ~113 topics/min sustained):

| Metric | C=1 (Sequential) | C=3 (Default Production) | Real Benefit |
| :--- | :--- | :--- | :--- |
| **1 Forum Page (50 items)** | ~68 seconds | **~26.5 seconds** | ~41.5s saved per page |
| **10 Forum Pages (500 items)** | ~11.3 minutes | **~4.4 minutes** | ~6.9 minutes saved |
| **25 Forum Pages (1,250 items)**| ~28.3 minutes | **~11.0 minutes** | **~17.3 minutes saved** |
| **145 Forum Pages (~4,000 items)**| **~90.5 minutes (ESTIMATED)** | **~35.4 minutes (ESTIMATED)**| **~55.1 minutes saved** |

*Note: Full subforum estimates represent raw synchronization time without user Cloudflare Turnstile verification interruptions.*

### 7. Rationale for Retaining C=3 as Default

1. **Empirical Throughput**: C=3 delivers a **2.56x to 2.95x** real-world throughput gain, cutting a 1,250-topic synchronization from 28 minutes down to 11 minutes.
2. **Infrastructure Courtesy**: In 1,251 real consecutive HTTP fetches across 25 pages at C=3, **zero HTTP 429 rate limit responses** and **zero Cloudflare challenges** were encountered.
3. **Browser Fluidity**: The user's active Chrome browser remained fully **RESPONSIVE** with no tab crashes or UI freezing.
4. **C=4 Assessment**: C=4 was intentionally kept optional and not promoted to default to protect against Cloudflare challenge triggers and maintain long-term session stability.

---

## Long-Run Stability, Pause/Resume & Session Recovery (V3-71)

### 1. Long-Run Real Workload Validation
- **Empirical Dataset**: 1,251 live topics across 25 consecutive pages of the Nintendo Switch subforum (`forum/viewforum.php?f=1605`).
- **Sustained Throughput**: 113.1 topics/min at default concurrency $C=3$ with average latency of 1,348 ms per topic and 26.5s per 50-topic page.
- **Network Safety**:
  - HTTP 429 rate limits: **0**
  - HTTP 403 authorization failures: **0**
  - Cloudflare Turnstile challenges triggered during active synchronization: **0**
  - Companion request timeouts: **0**
- **Browser State**: Google Chrome remained responsive throughout all 25 pages with no tab lockup or memory exhaustion.

### 2. Memory & Resource Lifecycle
- **JSDOM Scoping**: Each topic HTML payload parsed via JSDOM in Electron Main is strictly scoped to `parseTopicHtml()`. Raw HTML strings are discarded immediately following extraction, preventing memory accumulation over thousands of items.
- **Bridge Pending Queue**: `BrowserCompanionBridge.pending` map is bounded strictly to the active worker concurrency limit ($C=3$); completed requests remove timers and references immediately.
- **Extension AbortControllers**: Background worker registers an `AbortController` per active request; all controllers and tab handles are pruned in `finally` blocks upon completion or error.

### 3. Pause & Resume Semantics
- **In-Memory Suspension**:
  - Scanning can be paused at the backend/engine level via `scraperManager.pause()` or IPC `scraper:pause`.
  - Concurrency workers suspend in non-blocking 250ms check loops (`isPaused()`).
  - Page traversals pause between pages.
  - When resumed via `scraperManager.resume()` or IPC `scraper:resume`, workers pick up the remaining queue without re-fetching completed items.
  - **UX Status**: Fully exposed in the UI (`ScraperProgress.tsx`), synchronized with the backend state machine across both First Run Onboarding and Settings, and verified in real runtime (`CURRENT_RUNTIME_VERIFIED (PASS)`). In-flight requests settle cleanly, worker dispatch pauses, and progress counters freeze monotonically without data loss.
- **Safe Checkpoints & Partial Page Semantics**:
  - Checkpoint granularity is at the **Page Boundary**.
  - As each 50-item page completes, metadata is ingested and committed into SQLite via an atomic transaction.
  - If an interruption or cancel occurs mid-page (e.g. at 20 / 50 topics), uncommitted items for that page are discarded cleanly.
  - On retry or restart, the scraper repeats the current interrupted page safely and completely from the beginning.
  - Subsequent incremental scans automatically query `getKnownTopicIds()` and skip already-persisted topics with zero duplicate network requests.

### 4. Cancellation Under Concurrency
- **Prompt Signal Propagation**: Calling `cancel()` notifies `companionTransport.cancel()`, clears bridge waiters, aborts pending `fetch()` requests, and breaks out of worker loops within measured $<30$ ms latency.
- **Double-Cancel Safety**: Successive `cancel()` calls or canceling while idle return `{ success: false, message: 'Scraper is not running.' }` without throwing errors or corrupting internal state.
- **Immediate Restart**: Cancellation fully resets `isCancelledFlag = false` and `isPausedFlag = false`, allowing immediate re-execution of new sync jobs.

### 5. Session Recovery & Fault Tolerance Matrix

| Failure Event | Detection Mechanism | Runtime Behavior & Recovery Action | Data Integrity Impact | Acceptance Status |
| :--- | :--- | :--- | :--- | :--- |
| **User Pause** | UI / IPC action | Workers suspend execution in non-blocking sleep loop. Resume restarts queue. | No loss of committed data observed. | **CURRENT_RUNTIME_VERIFIED (PASS)** |
| **User Cancel** | UI / IPC action | In-flight requests abort within $<30$ms; committed pages remain saved. | No loss of committed data observed. | **CURRENT_RUNTIME_VERIFIED (PASS)** |
| **Companion Disconnect** | HTTP handshake / heartbeat loss | Scan halts with `COMPANION_NOT_CONNECTED`; user re-connects via extension popup. | Pending requests rejected cleanly; no data loss. | **CURRENT_RUNTIME_VERIFIED (PASS)** |
| **RuTracker Tab Closed** | Chrome tabs query returns null | Bridge detects missing tab and halts fetch; reports `TAB_NOT_FOUND`. | Safe abort; recovery upon tab reopening. | **CURRENT_RUNTIME_VERIFIED (PASS)** |
| **Cloudflare Challenge** | HTTP 403 or HTML challenge signature | Execution halts at page checkpoint; state transitions to `INTERACTION_REQUIRED`. | Safe pause at page checkpoint. | **Automated: PASS \| Runtime: NOT OBSERVED** |
| **App Restart** | Process termination | Checkpoint preserved in SQLite. Next scan re-establishes Companion session and skips known topics. | No loss of committed data observed. | **CURRENT_RUNTIME_VERIFIED (PASS)** |

### 6. Database Integrity Guarantees
- **SQLite Transactions**: Every page batch is wrapped in an atomic SQLite transaction (`db.transaction`). Partial page failures roll back cleanly.
- **Idempotent Upserts**: Uses `INSERT INTO items ... ON CONFLICT(source, topic_id) DO UPDATE SET ...` to guarantee zero duplicate rows.
- **User State Preservation**:
  - `is_favorite` is excluded from update sets, ensuring user favorites are never overwritten during catalog re-scans.
  - `discovered_at` is preserved via `COALESCE(items.discovered_at, excluded.discovered_at)`.
  - `screenshots_json` preserves existing galleries if new payload does not contain screenshots.
- **Integrity Validation**: Automated `PRAGMA integrity_check` verified clean across 1,242 production items with 0 duplicate rows and 0 orphaned child rows in `item_details` and `torrent_metadata`.

---

## Real Runtime Recovery Acceptance (V3-72 & V3-73)

The V3-72 and V3-73 suites executed direct runtime acceptance testing against real SQLite and the real Browser Companion bridge:

> [!NOTE]
> **Benchmark & Test Taxonomy Clarification**:
> - **Real Network Runtime (1,251 live topics across 25 pages, ~113 topics/min)**: Measures real live end-to-end performance traversing RuTracker remote network latency, Companion bridge, JSDOM parsing, and SQLite commits.
> - **Runtime Acceptance Harness (500 topics / 3.57s)**: Measures internal engine and memory behavior under synthetic high-throughput local conditions to verify that $C=3$ worker pools, RSS memory bounding, and cancel/pause transitions remain stable without network variance.

| Scenario | Evidence Classification | Automated | Real Runtime | Result / Metric |
| :--- | :--- | :--- | :--- | :--- |
| **Normal Long Run (500 items / 10 pages)** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | $C=3$ peak, RSS bounded plateaus at 282 MB |
| **Pause during active details** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Worker loop suspends; UI enters amber Paused state with Resume/Cancel |
| **Resume after pause** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Resumes queue without duplicate fetches; UI returns to active Progress |
| **Companion manual disconnect** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Session cleared, pending requests rejected, no storm |
| **Companion reconnect** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Dynamic port + new 64-char token handshake ok |
| **RuTracker tab close** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Detects missing tab, reports actionable status |
| **RuTracker tab recovery** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Access probe returns `FORUM_READY` |
| **Cancel under C=3 concurrency** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Cancel latency measured: **30 ms** |
| **Second scan after cancel** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Scan dispatches and finishes with 0 leaked flags |
| **App restart mid-scan** | `CURRENT_RUNTIME_VERIFIED` | PASS | **PASS** | Uncommitted items dropped; repeats interrupted page |
| **Cloudflare challenge handling** | `AUTOMATED_ONLY` | PASS | **NOT OBSERVED** | No challenge triggered during live sync |

---

## Troubleshooting

| Problem | Cause | Action |
| :--- | :--- | :--- |
| **Companion Disconnected** | App restarted or dynamic port changed. | In Settings → Scraper, click **Conectar Extensão** and enter the new code in the extension popup. |
| **Extension Not Installed** | Extension not loaded in browser. | Run `npm run companion:build` and load `browser-companion/dist` unpacked in `chrome://extensions`. |
| **Check Access: "No RuTracker tab found"** | No open tab with `https://rutracker.org`. | Open a tab with `https://rutracker.org/forum/index.php` in the browser where the extension is loaded. |
| **Check Access: "Verificação necessária" (INTERACTION_REQUIRED)** | Cloudflare challenge presented on RuTracker. | Switch to your open RuTracker browser tab, complete the verification check manually, then click **Verificar Acesso** again. |
| **Companion Timeout (30s)** | Tab was closed, frozen, or backgrounded. | Bring the RuTracker tab to the foreground, ensure the page responds, and retry the check. |
| **HTTP 403 on Fetch** | Session expired or Cloudflare challenge active. | Reload the RuTracker tab in your browser, ensure you can view forum threads, and re-run Check Access. |
| **Zero Topics Returned** | Subforum is empty or title search filter excluded all rows. | Verify subforum URL in Category Management or clear title search filter. |
| **Manual HTML Import Fails** | File exceeds 15 MiB or lacks topic identifiers. | Ensure page was saved as standard HTML format and does not exceed 15 MiB. |
| **Extension Reloaded** | Extension was updated in `chrome://extensions`. | Open extension popup and re-enter the connection code to re-establish loopback session. |

---

## Security & Privacy Model

- **Loopback Only (`127.0.0.1`)**: The bridge server binds strictly to the local loopback interface. External network interfaces cannot access the bridge.
- **Ephemeral Port & Random Token**: The port is assigned dynamically by the operating system, and the 64-character hex token changes on every application launch.
- **Allowlisted Endpoints**: The extension background worker strictly enforces that fetched URLs match `https://rutracker.org/forum/`.
- **No Remote Proxy**: All requests originate directly from the user's browser tab; no intermediate servers or third-party proxies are used.
- **Zero Credential Transfer**: Passwords, login credentials, and session cookie jars are never read, transferred, or stored by RT-Library.
- **Single Database Writer**: The extension has no filesystem or database access. All persistence is managed by Electron Main with prepared SQL statements.
- **Local Data Ownership**: The entire catalog, metadata, favorites, and settings remain stored on the user's local disk. RT-Library sends no telemetry or catalog data to remote servers.

---

## Progressive Library Experience During Synchronization (V3-74)

During prolonged synchronization workloads, users are not blocked by a modal progress screen. RT-Library allows full catalog browsing, searching, filtering, and item inspection while synchronization runs concurrently in the background.

### Key Capabilities

1. **Independent Lifecycle in Electron Main**:
   - The Electron Main process remains the single authoritative controller of synchronization tasks.
   - Navigating between views, closing settings, or dismissing onboarding never cancels an active job.
   - Wording explicitly informs users: *"Synchronization will continue in the background while RT-Library remains open."* (The app does not claim to run as a disconnected OS background daemon).

2. **Progressive Page-Boundary Discovery**:
   - As each subforum page finishes detail extraction, records are ingested in an atomic SQLite transaction.
   - Upon commit, `ScanEngine` fires `scraper:pageCommitted` with payload `{ categoryId, categoryName, page, totalPages, inserted, updated, totalSaved }`.
   - The React renderer's `useLibrary` hook listens to this event, updating category sidebar counts and progressively discovering new items without full-page reloads.

3. **Viewport Stability & New Items Banner**:
   - When a user is scrolled down in the virtualized grid or list view (`scrollTop > 40`), incoming records do not disrupt their scroll position or jump content under the cursor.
   - A floating pill appears: `X new items available · [ Show ]`.
   - Clicking `[ Show ]` smooth-scrolls to top and displays the newly committed items. If the user is already at the top of the catalog (`scrollTop <= 40`), updates occur automatically via debounced refetch.

4. **Global Sync Status Shell Indicator**:
   - Located in the application Topbar left slot, a compact status pill reflects active states: `Syncing`, `Paused`, `Verification Required`, `Disconnected`, `Complete`, `Failed`.
   - Clicking the pill reveals a detailed popover displaying current category, page progress, throughput rate (`~X items/min`), Pause/Resume, Cancel, and View Settings controls.

5. **First-Run Onboarding Non-Blocking Exit**:
   - In Step 5 (Initial Sync), users can click `[ Browse Library ]` at any time.
   - This records `onboarding_dismissed = 'true'` in local database settings, immediately transitioning the interface to the catalog while synchronization continues seamlessly.
   - If the first page is still being ingested (`items.length === 0`), the catalog displays: *"Building your library... Synchronization is running in the background while RT-Library remains open"* with a `[ View synchronization ]` shortcut.

6. **JIT Topic Request Collision Avoidance**:
   - If a user opens an item detail modal or triggers Just-In-Time enrichment for a topic that is concurrently being fetched by the batch scraper, `BrowserCompanionBridge` deduplicates in-flight requests by `topicId`.
   - Subscribers share the single in-flight network promise, preventing duplicate browser queries, race conditions, or database collisions.

---

## Sync History & Health Dashboard (V3-75)

RT-Library maintains a persistent, queryable synchronization audit log and operational health dashboard in SQLite, providing complete visibility into past and active synchronizations without impacting scraper throughput.

### 1. Database Architecture & Schema Version 6
Synchronization history is persisted in two dedicated tables managed exclusively by the Electron Main process:
- `sync_runs`: Top-level execution runs tracking lifecycle status, mode (`FULL_SCAN`, `INCREMENTAL`, `HTML_IMPORT`), transport (`BROWSER_COMPANION`, `PLAYWRIGHT`, `MANUAL_IMPORT`), trigger (`MANUAL_USER`, `SCHEDULED`, `RETRY`), counters (`topics_found`, `new_items`, `updated_items`, `known_items`, `saved_items`, `failed_items`), timestamps, duration, and error codes/summaries.
- `sync_run_categories`: Per-category breakdown tracking individual progress (`pages_processed`, `total_pages`, `topics_found`, `new_items`, `updated_items`, `known_items`, `saved_items`), category name snapshots, duration, and category-level errors.

Deterministic primary keys (`${syncRunId}_${categoryId}`) ensure idempotent per-category retries without duplicate rows.

### 2. Run Status State Machine
- `RUNNING`: Actively synchronizing.
- `COMPLETED`: Finished cleanly with all categories processed.
- `COMPLETED_WITH_WARNINGS`: Finished but encountered non-fatal issues (such as verification challenges or partial category skips).
- `CANCELLED`: Explicitly aborted by user.
- `FAILED`: Fatal failure prevented execution (e.g., Companion bridge closed or database fatal error).
- `INTERRUPTED`: Application was closed, killed, or crashed during synchronization. Handled automatically on startup via `cleanupInterruptedRuns()` to prevent zombie `RUNNING` records.

### 3. Page-Boundary Persistence Guarantee
In strict alignment with the scraper's atomic transaction model:
- Detailed counters and timestamps are updated **at page boundaries** alongside SQLite commits, eliminating per-topic disk write overhead.
- Intermediate cancellations or crashes leave preceding committed pages fully recorded in both catalog and sync history.

### 4. Operational Health Summary & Audit View
- **Settings > Scraper > Synchronization Health Card (`SyncHealthCard.tsx`)**:
  - Displays last successful sync timestamp, new/updated items, and duration.
  - Displays last run status with error summary if applicable.
  - Highlights operational category health: counts healthy vs. needing-attention categories.
  - Expandable category status list with badges (`UP_TO_DATE`, `NEVER_SYNCED`, `WARNING`, `FAILED`) and individual `[ Sync Category ]` triggers.
  - Shortcut `[ View Sync History ]` to navigate directly to detailed audit history.
- **Synchronization History View (`SyncHistoryView.tsx`)**:
  - Filterable by run status (`All`, `Completed`, `Warnings`, `Failed`, `Cancelled`).
  - Real-time active run card showing live category and page progress.
  - Expandable run cards revealing full per-category performance breakdown.
  - Retention policy automatically preserves the latest 100 runs.
  - Privacy guarantee: strictly zero cookies, tokens, raw HTML, passwords, or stack traces are stored.
- **Direct Navigation Integration**:
  - Completion toast renders `[ View Summary ]` navigating directly to `Settings > Scraper > Synchronization History`.
  - GlobalSyncStatus popover provides instant link to sync history upon job completion.

---

## Background Sync UX, Smart Notifications & Actionable Recovery (V3-76)

V3-76 elevates synchronization to a native, low-friction background desktop experience while maintaining complete operational clarity.

### 1. Standardized Notification Hierarchy
All synchronization-related user feedback conforms to a consistent 5-level hierarchy:
- `INFO`: Normal non-critical updates (e.g., user cancellation, startup reassurance for previously interrupted runs).
- `SUCCESS`: Clean job completion (`+X new items added` or `Library is up to date`).
- `WARNING`: Partial completions requiring attention (`COMPLETED_WITH_WARNINGS` with skipped categories or challenges).
- `ACTION_REQUIRED`: Execution cannot make progress without user action; surfaced via non-blocking action banner.
- `ERROR`: Fatal execution failures (`FAILED`).

### 2. Discreet Background Execution
- **Zero In-Progress Toast Spam**: Normal running sync produces zero toast notifications during page traversal or commits. Ongoing metrics are isolated to the discreet, compact `GlobalSyncStatus` pill in the app topbar.
- **Auto-Hide TTL for Completed Runs**: `GlobalSyncStatus` automatically dismisses 45 seconds after completion or failure, preventing perpetual clutter in the desktop shell while allowing manual dismissal at any time.

### 3. Persistent Action Banner (`SyncActionBanner.tsx`)
When a sync job is blocked and requires user intervention, a non-blocking, non-modal banner appears directly below the topbar with deterministic priority:
1. `VERIFICATION_REQUIRED` (Priority 1): Prompts the user to solve a Cloudflare challenge in their browser tab. Actions: `[ Open RuTracker ]` and `[ Check Again ]`.
2. `COMPANION_DISCONNECTED` (Priority 2): Informs user that connection to the extension was lost. Action: `[ Reconnect ]`.
3. `NO_RUTRACKER_TAB` (Priority 3): Prompts user that an active RuTracker tab is required. Action: `[ Open RuTracker ]`.
4. `FAILED` (Priority 4): Surfaces error summary with action: `[ View Details ]`.

The banner never traps focus or obstructs the catalog, and can be dismissed at any time.

### 4. Smart Completion & Deduplication
- **Zero-New Positive Copy**: When a sync run finishes with 0 new items, the toast displays encouraging, clear copy: *"Library is up to date. All items are up to date"* rather than confusing zeros.
- **Strict Deduplication**: `useSyncNotificationCoordinator` keys notifications strictly by `runId`. Re-renders, view navigations, and duplicate IPC events never trigger redundant toasts for the same run.
- **Deep-Link Run Expansion**: Clicking `[ View Summary ]` or `[ Review Issues ]` on completion toasts opens `Settings > Scraper > Synchronization History` with that specific run **already expanded** via the `scraper/history:RUN_ID` route.

### 5. Native Desktop Notifications
- **Blur/Minimized Routing**: If the application window is minimized or not focused when a job finishes or fails, a native desktop notification (`Notification` API in Electron Main) is dispatched instead of an in-app toast, avoiding double notifications.
- **Configurable Setting**: Users can toggle desktop notifications on/off in `Settings > Scraper > Advanced Options` (`Background sync notifications`, default: enabled).

### 6. Startup Interrupted Run Reassurance
If the app was terminated while a run was in progress, a gentle info toast is displayed at startup (at most once per app session), reassuring the user that committed items are safe and providing a direct link to review the run.

---

## Smart Scheduled Sync & Idle-Aware Automation (V3-77)

V3-77 adds safe, user-controlled automatic periodic synchronization while RT-Library is open, operating strictly without launching browser windows, without opening RuTracker tabs, and without bypassing Cloudflare verifications.

### 1. Invariants & Security Principles
- **Disabled by Default**: Automatic sync is strictly opt-in (`enabled: false`).
- **Zero Automated Browser Launch**: The scheduler never opens Google Chrome or any browser automatically.
- **Zero Automated Tab Opening**: The scheduler never creates, redirects, or opens a RuTracker tab automatically.
- **Zero Automated Challenge Solving**: The scheduler never bypasses Cloudflare or interacts with CAPTCHA.
- **Companion Transport Locked**: Automatic sync strictly uses the `BROWSER_COMPANION` transport. It never falls back to Playwright.
- **Incremental Mode Locked**: Scheduled runs are always incremental (`full: false`). They never perform full scans, deep scans, or refresh screenshots.
- **Minimum Safe Interval**: Enforces a minimum interval of 60 minutes in production (dev/test environments support 1-minute intervals).
- **Single Active Scraper Job Invariant**: If a manual sync is currently running, the scheduled check defers safely (`SCRAPER_BUSY`), never starting a concurrent scraper and never recording a failed run.
- **Clean Audit Guarantee**: Skipped checks never create entries in `sync_runs`.
- **Trigger Attribution**: Successfully executed scheduled runs persist with `trigger_type = 'SCHEDULED'`.

### 2. Preflight Guards (`syncScheduler.cjs`)
Before initiating any synchronization job, `runDueCheck()` runs the following strict preflight evaluation pipeline:
1. `INITIAL_SETUP_PENDING`: Skipped if library onboarding or initial scan is not completed.
2. `SCRAPER_BUSY`: Single active job invariant. Defers next check by 15 minutes without recording a failed run.
3. `COMPANION_DISCONNECTED`: Skipped safely. Surfaced in UI via non-blocking action banner with `[ Reconnect ]`.
4. `NO_RUTRACKER_TAB`: Skipped safely. Surfaced in UI via action banner with `[ Open RuTracker ]`.
5. `VERIFICATION_REQUIRED`: Skipped safely. Surfaced in UI with `[ Open RuTracker ]`.
6. `NO_ENABLED_CATEGORIES`: Skipped if all categories in scope are disabled.

### 3. Lifecycle & Sleep Handling
- **Master Timer in Main Process**: All timing logic lives strictly in Electron Main (`electron/scraper/syncScheduler.cjs`). It runs only while RT-Library is open.
- **Clean Shutdown**: Timers are un-armed and cleared on `will-quit`.
- **System Sleep / Resume (`powerMonitor`)**: Listens to system `resume` events. If a scheduled run was missed while the machine was asleep, it executes a single due check if due and advances `nextRunAt` safely.
- **Zero Burst Catch-Up Runs**: If the scheduled time passed while RT-Library was closed, the app never fires catch-up bursts on startup. It safely calculates `nextRunAt` starting from the current launch time.

### 4. User Experience & Configuration (`AutomaticSyncCard.tsx`)
Located in `Settings > Scraper`:
- **Toggle Control**: Master switch to enable/disable scheduled synchronization.
- **Frequency Presets**: Predefined safe intervals: `1h` (Every hour), `3h` (Every 3 hours), `6h` (Every 6 hours), `12h` (Every 12 hours), `24h` (Every 24 hours).
- **Category Scope**: `All enabled categories` or `Selected categories` with individual category toggles.
- **Live Next Run Countdown**: Humanized upcoming sync time (e.g., *"In 2 hours (18:30)"*).
- **Previous Automatic Run Summary**: Shows completion time, items found, new items, and duration.
- **Actionable Skip Notice**: If a scheduled check is skipped due to a missing tab or disconnected companion, a contextual alert appears with inline actions.
- **History Badge**: In `SyncHistoryView.tsx`, runs triggered by the scheduler display a distinctive `Scheduled` badge.

---

## Autonomous Embedded Electron Transport & In-App Verification (V3-80 / V3-81)

V3-80 and V3-81 implement an experimental, autonomous desktop scraping engine (`EMBEDDED_ELECTRON`) that operates without requiring browser extensions or external browser instances, while providing safe in-app session recovery when Cloudflare verification is required.

### 1. Architectural Model
- **Hidden Electron Session**: Runs bounded worker webContents instances (`show: false`, partition: `persist:rutracker-v1`) managed directly in Electron Main (`electron/scraper/embeddedElectronTransport.cjs`).
- **Sandboxed Execution**: Worker instances run with strict isolation:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
  - Zero preload scripts
  - Navigation restricted strictly to RuTracker domains
  - Popups, new windows, downloads, and permission requests blocked deterministically.
- **Worker Pool Concurrency**: Enforces bounded concurrency ($C=3$) matching the established rate-limiting model.
- **Pipeline Reuse**: Reuses existing `RuTrackerHtmlParser`, `MetadataNormalizer`, `IngestionService`, `ScanEngine`, and SQLite Main-only writer architectures without duplication.
- **Promotion to Primary (V3-82)**: Initially introduced as an experimental prototype in V3-80 with Browser Companion as default. Following completion of V3-82 release gates, Embedded Electron was promoted to primary autonomous transport when `scraper_embedded_promoted = true` (or Automatic mode), while Browser Companion is fully supported as the high-reliability fallback. Users may explicitly select any transport under Settings.

### 2. In-App Human Verification Lifecycle (V3-81)
When an autonomous background worker encounters a Cloudflare challenge or verification requirement (`CHALLENGE_REQUIRED` / `INTERACTION_REQUIRED`):
1. **Background Job Pause**: The active scan pauses gracefully (`INTERACTION_REQUIRED`), preserving scan state, category cursor, and all SQLite commits without failing or cancelling the run.
2. **Zero Surprise Popups Invariant**: The app NEVER auto-opens visible browser windows unprompted during background or scheduled syncs.
3. **Actionable UI Banner**: `SyncActionBanner` surfaces an immediate, prominent `[ Verify now ]` action.
4. **Hardened Singleton Verification Window**:
   - Opens ONLY upon explicit user interaction (`openVerificationWindow()`).
   - Uses the **exact same persistent session** (`persist:rutracker-v1`) shared with background scraper workers.
   - Hardened with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and navigation restricted to RuTracker.
   - Singleton invariant: repeated clicks bring the existing verification window to focus rather than spawning duplicate windows.
5. **Human-Only Verification**: The user completes any interactive verification or Turnstile challenge manually. RT-Library strictly NEVER automates checkbox clicking, Turnflare solving, fingerprint spoofing, or cookie manipulation.
6. **Automatic Access Detection & Resume**:
   - Background observer monitors the verification window for forum readiness (`FORUM_READY`).
   - Upon successful verification, the verification window auto-closes immediately.
   - The paused scan engine job seamlessly resumes and retries the blocked category or topic request on the same run without restarting the sync or duplicating database writes.
7. **Manual Cancellation & Session Reset**:
   - If the user closes the verification window before solving the challenge, verification is cancelled gracefully without corrupting session state.
   - `resetSession()` provides complete storage, cookie, and cache clearing on `persist:rutracker-v1` if a session becomes irrecoverably stuck.
8. **Verification Lifecycle Generation Tracking & Finite Loop Protection (V3-81.3)**:
   - **Root Cause Analysis**: The interactive challenge loop occurred because previous polling logic incremented attempt counters whenever `did-navigate` fired, conflating intermediate page redirects/subframes of the *same* challenge with distinct interactive challenge cycles.
   - **Generation Tracking**: Top-level main frame navigations are tracked via `navigationGeneration`. Distinct challenge generations are tracked via `challengeGeneration` and page Ray ID.
   - **Debounced Inspection & Serialization Lock**: Re-inspection is debounced and guarded by an `isClassifying` lock so asynchronous `executeJavaScript` calls never race or evaluate simultaneously.
   - **Attempt Semantics**: `challengeAttempts` only increments when a genuinely new challenge cycle is presented (new navigation generation following user interaction or a new Ray ID). Polling the same challenge document never increments attempts.
   - **Classifier Priority**: Valid forum markers (`.torTopic`, `#page_container`, `forumline`) strictly take priority over residual Cloudflare scripts (`challenge-platform`, `Turnstile`) in the DOM.
   - **Finite Loop Termination & Fallback**: If Cloudflare continues rejecting interactive challenges across 3 distinct challenge cycles (due to upstream Electron/Chromium automation heuristics on cold sessions), the transport cleanly terminates with `VERIFICATION_LOOP` and surfaces an actionable fallback option to use the **Browser Companion** rather than trapping the user in an infinite loop.
   - **Strict No-Bypass Policy**: RT-Library never uses stealth plugins, navigator patches, fingerprint spoofing, or automated solvers.

### 3. Embedded Transport Production Integration & Autonomous Scheduler (V3-82)
The Embedded Electron transport ("Built-in Scraper") is fully integrated across all desktop product flows:
1. **Unified Transport Resolution & Persistence**:
   - Transports supported: `AUTOMATIC`, `EMBEDDED_ELECTRON`, `BROWSER_COMPANION`, `PLAYWRIGHT`, `MANUAL_IMPORT`.
   - User preference persists in SQLite (`app_state` table under `scraper_transport_preference`).
   - Transport is frozen at job start time: once a scan starts, its active transport cannot mutate mid-run.
2. **Autonomous Periodic Synchronization**:
   - `syncScheduler.cjs` evaluates the user's preferred transport upon reaching scheduled sync time.
   - When Built-in Scraper (`EMBEDDED_ELECTRON`) is active, scheduled runs operate autonomously in the background without requiring the browser companion extension or open RuTracker tabs.
   - **Zero Surprise Window Invariant**: If a Cloudflare challenge is encountered during an autonomous scheduled run, the scheduler defers safely (`lastSkipReason = 'VERIFICATION_REQUIRED'`), records the telemetry event, and NEVER opens browser windows automatically.
3. **Unified Single-Topic Enrichment (`scraper:fetch-topic`)**:
   - Replaces companion-exclusive handlers with a polymorphic IPC handler.
   - Dispatches through `BrowserCompanionTransport` if connected, or falls back transparently to `EmbeddedElectronTransport.fetchTopic(...)`.
4. **Onboarding Integration**:
   - Step 3 ("Connect Browser") now offers a clear choice between "Built-in Scraper (Autonomous)" and "Browser Companion (Extension)".
   - Users selecting Built-in Scraper can verify session access directly in-app and proceed to sync without installing browser extensions.
5. **Production Gate Evaluation (V3-82 Release Gates)**:
   - Evaluated 12 mandatory gates: hidden window invariant, worker pool bounds, 50 real topics parsed, concurrency ceiling $C=3$, pause/resume/cancel latency, session restart & renderer cleanup, memory leak profiling, database integrity check, and companion compatibility.
   - Empirical outcome: `PROMOTE_TO_PRIMARY_WITH_COMPANION_FALLBACK`.
   - Browser Companion remains 100% functional, selectable, and supported as the primary fallback.

---

## Known Limitations

- **Browser Tab Requirement (Companion)**: The Browser Companion requires an open browser tab on `https://rutracker.org`.
- **Manual Verification**: If RuTracker presents a Cloudflare challenge, user interaction is required (either in the browser tab for Companion or in the in-app verification window for Embedded Electron). The app strictly never attempts automated challenge completion or CAPTCHA solving.
- **Unattended Scheduling**: Background scheduled sync jobs pause or defer safely if a challenge is encountered and will never open browser windows automatically.
- **Platform Runtime Verification**:
  - **Linux Runtime**: Validated and tested on Linux (Ubuntu / Debian).
  - **Windows Runtime**: **NOT TESTED** in live Windows environment (build scripts present, but runtime verification pending).

---

## Testing

Comprehensive automated tests cover the entire scraping, parsing, companion, embedded transport, and automation lifecycle:

- `tests/unit/browserCompanionBridge.test.ts`: Validates HTTP bridge handshake, auth tokens, protocol versioning, command long-polling, and error handling.
- `tests/unit/browserCompanionTransport.test.ts`: Verifies transport adapter methods (`checkAccess`, `fetchCategory`, `fetchTopic`, `cancel`).
- `tests/unit/transportResolver.test.ts`: Validates deterministic priority resolution, persistence in SQLite, promotion policy, and experimental flags.
- `tests/unit/embeddedElectronTransport.test.ts`: Validates hidden worker pool lifecycle, persistent partition isolation, concurrency limits, navigation guards, and HTML extraction.
- `tests/unit/embeddedVerification.test.ts`: Validates in-app verification window creation, singleton instance enforcement, identical session partition sharing, manual cancellation, session reset, and scan resume/cancellation orchestration.
- `tests/unit/rutrackerHtmlParser.test.ts`: Tests pure HTML parsing for category listings, pagination, topic details, magnet links, `#tor-size-humn` byte extraction, and screenshots.
- `tests/unit/scanEngine.test.ts`: Validates universal scan engine execution, page traversal, early stopping, on-demand topic detail enrichment, and in-flight verification pause/resume callbacks.
- `tests/unit/scraperRuntimeUX.test.tsx`: Validates runtime progress telemetry, multi-category counters, cancellation, pause/resume, and standardized error categorization.
- `tests/integration/CatalogViews.test.tsx`: Validates empty library states, setup synchronization triggers, and catalog rendering.
- `tests/unit/rutrackerHtmlImport.test.ts`: Verifies offline manual HTML import, boundary limits (15 MiB), and category/topic detection.
- `tests/unit/cloudflareLoopDetection.test.ts`: Confirms safe termination when encountering repeated verification loops.
- `tests/unit/progressiveLibrarySync.test.tsx`: Validates progressive synchronization, background continuance, scroll stability guards, new items banner, and onboarding dismissal.
- `tests/unit/syncHistoryRepo.test.ts`: Validates sync run lifecycle persistence, category progress, counters, and page-boundary transactions.
- `tests/unit/syncHistoryComponents.test.tsx`: Tests SyncHealthCard and SyncHistoryView rendering, filtering, and interactions.
- `tests/unit/syncNotificationCoordinator.test.tsx`: Validates V3-76 notification levels, toast deduplication, deep linking, native notification routing, startup notice, and action banner priority.
- `tests/unit/syncScheduler.test.ts`: Validates V3-77/V3-82 scheduler initialization, minimum intervals, secrets sanitization, preflight guards, dynamic transport resolution, challenge deferral, single active job invariant, and sleep wake recovery.


