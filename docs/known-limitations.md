# Known Limitations

This document lists known operational behaviors, external platform constraints, and system limitations in RT-Library.

---

## Browser Companion Operational Constraints

- **Active Browser Tab Required**: The Browser Companion relies on an open tab navigated to `https://rutracker.org` within the user's normal browser session. If no RuTracker tab is detected, the extension returns `NO_RUTRACKER_TAB`.
- **Manual Installation**: The companion is an unpacked Manifest V3 extension that must be built (`npm run companion:build`) and loaded via Developer Mode in a Chromium-based browser (Chrome, Brave, Edge, Chromium).
- **Legitimate User Interaction**: The application does **not** bypass Cloudflare Turnstile, CAPTCHAs, or WAF checks automatically. If a challenge is encountered, the user must resolve it in their open browser tab before synchronization can proceed.
- **Single Concurrent Operation**: The local bridge allows one in-flight command queue at a time. Rapid overlapping requests are rejected with `COMPANION_REQUEST_BUSY` to protect browser tab responsiveness.

---

## Embedded Electron Scraper Invariants & Verification Limits

- **Experimental Classification**: The Built-in / Embedded Electron scraper (`EMBEDDED_ELECTRON`) operates autonomously within Electron Main, but Cloudflare's bot-detection heuristics may repeatedly present interactive Turnstile checkboxes ("Confirme que é humano") due to differences between Electron's Chromium runtime fingerprint and standard consumer browsers.
- **Verification Loop Guard**: If manual interaction does not result in stable forum access after 3 attempts, RT-Library safely halts with `VERIFICATION_LOOP` to prevent infinite challenge spinning.
- **Recommended Recovery**: When encountering challenge loops, users are advised to switch to the **Browser Companion**, which routes requests through their standard web browser where Cloudflare verification succeeds reliably.

---

## Background Scheduler Safety

- **No Automated Window Spawning**: Scheduled background synchronization tasks record `INTERACTION_REQUIRED` silently when encountering an unverified challenge. They will **never** automatically spawn browser windows without explicit user initiation.
- **Non-Blocking Library Usage**: When synchronization pauses due to an unresolved verification challenge, the local library remains 100% operational. Searching, filtering, viewing details, and managing favorites are completely unaffected.

---

## Manual RuTracker HTML Import

- **Single File Offline Operation**: Manual import accepts one saved `.html` or `.htm` page at a time with a strict 15 MiB file size limit (`15 * 1024 * 1024` bytes).
- **Category Association**: Category listing pages must match a configured forum ID or use the selected category in Scraper settings. Topic pages lacking category indicators require an explicit category selection.
- **Topic Identifiers**: Saved pages must contain a valid topic ID (`t=\d+`) in metadata or topic anchors. Pages saved without an identifier are rejected safely.
- **Storage**: Extracted catalog records are ingested into SQLite; the original HTML file and its path are not retained.

---

## Platform Runtime Support

- **Linux Runtime**: Validated and tested on Ubuntu / Debian Linux environments.
- **Windows Runtime**: **NOT TESTED** in live Windows execution environments. Build and packaging scripts for Windows NSIS installers exist (`npm run package:win`), but end-to-end runtime behavior on Windows has not been formally verified.
