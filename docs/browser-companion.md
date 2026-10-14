# Browser Companion

The Browser Companion is a Chromium MV3 extension that enables **RT-Library** to fetch RuTracker forum pages directly through the user's active, authenticated browser tab where Cloudflare challenges are solved organically. Electron Main owns an authenticated loopback HTTP bridge (`browserCompanionBridge.cjs`), and the pure parser (`rutrackerHtmlParser.cjs`) extracts topics and pagination data.

In **V3-61**, Browser Companion was promoted from POC to the **primary and preferred transport** for both First Run / Initial Discovery and ongoing Update Library scans.

## Development & Installation

1. Build and validate the extension:
   ```bash
   npm run companion:build
   npm run companion:validate
   ```
2. In Google Chrome, Chromium, Brave, or Edge, navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the directory `browser-companion/dist`.
5. If the extension was already loaded, click the **Reload** button on the extension card.
6. Start RT Library:
   ```bash
   env -u ELECTRON_RUN_AS_NODE npm run desktop
   ```
7. In the First Run Onboarding screen or in **Settings → Scraper → Browser Companion**, click **Conectar Extensão** (Connect).
8. Enter the displayed Port and Token in the extension popup (or let auto-handshake negotiate).
9. Open RuTracker in your browser, ensure forum pages load cleanly, and click **Verificar Acesso** (Check Access).

The token is generated on demand, kept strictly in Electron Main memory, and stored only in `chrome.storage.session` for the extension's session. It is never written to disk or logs. Closing RT Library invalidates it immediately.

## Architecture & Integration (V3-61)

```
┌────────────────────────────────┐       HTTP Loopback       ┌────────────────────────────────┐
│      Chromium Extension        │  ◄─────────────────────►  │     RT-Library (Electron)      │
│  (MV3 background & MAIN world) │   127.0.0.1:RandomPort    │  browserCompanionBridge.cjs    │
└────────────────┬───────────────┘                           └───────────────┬────────────────┘
                 │                                                           │
        fetch in user tab                                           scanEngine.cjs
                 │                                                           │
                 ▼                                                           ▼
    ┌────────────────────────┐                                  ┌─────────────────────────┐
    │     RuTracker Web      │                                  │  SQLite Native Database │
    │   (Solved Cloudflare)  │                                  │     (Main Process)      │
    └────────────────────────┘                                  └─────────────────────────┘
```

### Transport Hierarchy & Fallback System

The active transport resolver (`electron/scraper/transportResolver.cjs`) selects the operational transport using deterministic priority:

1. **`BROWSER_COMPANION` (Primary / Recommended)**:
   Active whenever the extension is connected and verified. Resolves Cloudflare challenges seamlessly via the user's existing browser session.
2. **`EMBEDDED_ELECTRON` (Autonomous In-App Transport, Experimental)**:
   Autonomous background worker pool in Electron Main with in-app Cloudflare verification and verification loop detection.
3. **`PLAYWRIGHT` (Direct Automation Fallback)**:
   Used when Browser Companion is disconnected, or explicitly when performing direct headless/headed automation.
4. **`MANUAL_IMPORT` (Offline HTML Fallback)**:
   Allows importing raw `.html` category pages saved manually from any browser.
5. **`NONE`**:
   No transport currently available.

### Universal Scan Engine (`scanEngine.cjs`)

Both First Run and Update Library utilize the same scan engine:
- **`INITIAL_DISCOVERY` Mode**: Executed on an empty database. Fetches across pages up to `totalPages`, persisting batches atomically via `ingestionService.cjs` and `itemsRepo.upsertBatch`. Marks `initial_scan_completed: true` upon successful population.
- **`INCREMENTAL` Mode**: Executed during Update Library. Checks known `topicId`s against SQLite and activates deterministic early stopping after 3 consecutive known pages.
- **Cancellation & Pause**: Cleanly respects cancellation tokens and pauses gracefully if interaction or reconnection is required.

## Security & Permissions

- **Origin & Host Restrictions**: The loopback server binds strictly to `127.0.0.1` on an OS-assigned ephemeral port. The bridge verifies `X-Companion-Token` and session headers on every request.
- **Strict Scope**: Both the extension background worker and Electron Main strictly allow URLs matching `https://rutracker.org/forum/`. No arbitrary URLs or external endpoints can be accessed.
- **No Credentials Transferred**: Neither passwords, credentials, nor full session cookies are copied or stored by the application.
- **Execution World**: Page content is fetched using `scripting.executeScript` in the `MAIN` world of the tab and decoded as Windows-1251. Max transfer size is capped at 10 MiB per page.
