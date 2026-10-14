# RT Library Browser Companion

The **RT Library Browser Companion** is a Chromium Manifest V3 browser extension designed to facilitate user-directed synchronization between **RT-Library** and RuTracker forum pages.

---

## Purpose

When synchronizing game metadata catalogs from RuTracker, automated browser sessions (like headless Playwright) may encounter Web Application Firewall (WAF) or Cloudflare security challenges.

The Browser Companion allows RT-Library to execute requests inside your normal browser session (Google Chrome, Brave, Chromium, or Microsoft Edge), where you can legitimately browse and complete any required verifications naturally.

### Key Characteristics
- **Transport Pipe Only**: The extension does not parse topic metadata or write to SQLite. It delivers raw HTML to the desktop app's local bridge.
- **Privacy & Safety First**:
  - Never reads, stores, or exports cookies (`chrome.cookies`).
  - Does not automate CAPTCHA solving or Cloudflare Turnstile.
  - Does not alter browser fingerprints or use stealth techniques.
  - Communicates solely with `127.0.0.1` and allowlisted `https://rutracker.org/forum/*` URLs.

---

## Build & Validation

From the root of the `rt-library` project:

```bash
# Compile extension files to browser-companion/dist/
npm run companion:build

# Validate manifest integrity and file paths
npm run companion:validate
```

The compiled unpacked extension will be generated at `browser-companion/dist/`.

---

## Installation (Chromium / Chrome / Brave / Edge)

1. Open your browser and navigate to the Extensions management page:
   - Chrome / Chromium: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode** (toggle located in the upper-right corner).
3. Click **Load unpacked**.
4. In the file picker, select the `browser-companion/dist` folder inside the `rt-library` repository.
5. The extension **RT Library Browser Companion** will appear in your installed extensions list.

---

## Connecting to RT-Library

1. Launch RT-Library:
   ```bash
   npm run desktop
   ```
2. Navigate to **Settings → Scraper** (or use the First Run Onboarding wizard).
3. Under **Browser Companion**, click **Conectar Extensão** (Connect).
4. Note the displayed Connection Code in the format `PORT:TOKEN` (e.g., `45231:a1b2c3d4...`).
5. Click the **RT Library Companion** extension icon in your browser toolbar.
6. Enter or paste the Connection Code into the popup and click **Connect**.
7. The extension status will turn green (**Connected**).

---

## Development & Debugging

### Reloading After Code Changes

When modifying code in `browser-companion/src/`:

1. Rebuild the bundle:
   ```bash
   npm run companion:build
   ```
2. In `chrome://extensions`, locate **RT Library Browser Companion** and click the **Reload** (circular arrow) button.
3. Open the extension popup to re-connect if the service worker reset.

### Inspecting Background Service Worker

1. In `chrome://extensions`, click the **service worker** link on the RT Library Browser Companion card.
2. DevTools will open for `src/background.js`.
3. View runtime logs prefixed with `[COMPANION]`:
   - `[COMPANION][TAB_FOUND]`
   - `[COMPANION][FETCH_STARTED]`
   - `[COMPANION][FETCH_RESULT]`
   - `[COMPANION][RESPONSE_SENT]`

---

## Popup Experience & Session Modes (V3-68)

The extension popup operates in two distinct, mutually exclusive modes:

### 1. Disconnected Mode
- **Status**: Displays `Disconnected` badge.
- **Connection Form**: Prompts user for the Connection Code (`PORT:TOKEN`) or separate Port and Token fields.
- **Action**: Clicking **Connect** executes handshake with RT-Library.

### 2. Connected Mode
- **Form Hidden**: Connection inputs, port, token, and connect button are completely removed from the DOM and memory. The 64-character token is never visible after handshake.
- **Session Indicators**: Displays connection endpoint (`127.0.0.1:<port>`), active session state, and RuTracker tab status (`✓ Tab detected` or `⚠️ Not detected`).
- **Live Statistics**:
  - **Session Duration**: Real-time timer (`MM:SS` or `HH:MM:SS`) measuring elapsed session time.
  - **Request Counts**: Total completed requests, currently active in-flight requests (clamped to never be negative), and failed requests.
  - **Scraper Metrics**: Count of category index pages fetched, individual topic pages fetched, total bytes transferred (KB / MB), and last activity timestamp.
  - **Error Summary**: Friendly summary string if requests encountered an issue (e.g. tab closed or payload too large).
- **Actions**:
  - **Open RuTracker**: Automatically launches an authenticated tab at `https://rutracker.org/forum/index.php`.
  - **Disconnect**: Aborts all active in-flight fetch operations, notifies RT-Library bridge via `POST /v1/disconnect`, clears session storage, and resets popup to Disconnected mode.

---

## Bidirectional Session State Synchronization

Session connectivity is synchronized bidirectionally across application and extension lifecycles:

1. **Extension Disconnect → App**:
   - Clicking **Disconnect** in the extension sends `POST /v1/disconnect` to the bridge.
   - The desktop app immediately detects session termination and transitions to `DISCONNECTED`.
2. **App Shutdown / Bridge Closed → Extension**:
   - If the RT-Library desktop application is closed, the bridge stops responding.
   - Upon encountering 3 consecutive network failures (`ECONNREFUSED` / `Failed to fetch`), the extension automatically disconnects, clears session secrets, and updates the popup badge to `Disconnected`.
3. **Session Invalidation (HTTP 401 / 403 / 409 / 410)**:
   - If the bridge rejects credentials or requires a new handshake, the extension halts polling immediately and transitions to `Disconnected`.
4. **App Restart**:
   - Because RT-Library assigns a fresh ephemeral port and random token on every launch, previous sessions cannot persist. The extension requires the new connection code.
5. **Popup Statelessness**:
   - The popup is a view layer only. Closing or opening the browser popup does not terminate or interrupt active synchronization jobs running in the background service worker.

---

## Protocol Overview

- **Loopback Bridge**: Connects to `http://127.0.0.1:<port>` via HTTP.
- **Handshake**: `POST /v1/hello` with Bearer authentication generates a session ID.
- **Disconnect**: `POST /v1/disconnect` terminates the active session gracefully.
- **Command Polling**: Long-polls `GET /v1/commands` for instructions:
  - `FETCH_CATEGORY`: Fetches forum index pages (`viewforum.php`).
  - `FETCH_TOPIC`: Fetches individual topic details (`viewtopic.php`).
  - `CANCEL`: Aborts pending requests via `AbortController`.
- **Response Delivery**: Sends decoded HTML (Windows-1251) to `POST /v1/responses` (10 MiB payload cap).


