# Testing Guide & Regression Checklist

## 1. Test Architecture

The test suite is built on **Vitest** and **React Testing Library**:
- **Unit Tests (`tests/unit/`)**: Verify backend logic, SQLite queries, metadata parsers, image caching policies, and execution plans.
- **Integration Tests (`tests/integration/`)**: Verify React UI workflows, filter drafts, catalog pagination, view mode toggles, and modal dialogs.
- **Mock Environment (`tests/setup.ts`)**: In-memory state emulation matching SQLite repository behavior.

---

## 2. Catalog Sorting & Discovery Semantics

- **Default Sort**: `discoveredAt DESC` (items scraped/discovered most recently appear first).
- **Scope**: Uniform global default across All Games and all specific categories.
- **NULL Handling**: Items with `NULL` or missing discovery dates are deterministically sorted last (`NULLS LAST`).
- **Tie-Breaker**: Identical timestamps are broken deterministically by `title ASC` and `id ASC`.
- **Manual Override**: User selections take precedence and remain persistent across category navigation.
- **Saved Views**: Saved Views override active sort configuration upon application.

---

## 3. Regression Checklist

### Scraper Session Validation & First-Run Preflight (V3-41)

- [ ] A selected-category probe checks only that category, including Nintendo Switch when selected.
- [ ] `All Categories` probes enabled category listing pages and shares results for duplicate forum URLs.
- [ ] Strict preflight prevents worker launch when any category is blocked or unclassified.
- [ ] A valid empty forum listing is accessible and does not become a session error.
- [ ] HTTP 403 with `cf-mitigated: challenge` becomes `INTERACTION_REQUIRED` without automatic retry.
- [ ] A user explicitly opens a headed verification window for the blocked category.
- [ ] The headed window and subsequent headless run share `<userData>/scraper-profile/`.
- [ ] Closing the verification window triggers a fresh probe of the affected scope.
- [ ] Cancel during preflight, headed verification, and scan leaves no orphan browser process.
- [ ] Logs identify the category and result without recording request headers or browser cookies.
- [ ] Linux runtime is checked; Windows runtime is marked `NOT TESTED` unless validated on Windows.

### Known Limitation Handling (V3-49)
- [x] **Unresolved challenge safety**: Unresolved Cloudflare challenges return `VERIFICATION_INCOMPLETE` without infinite loops or re-navigation.
- [x] **Local library usability**: Local library browsing, search, filters, and item details remain 100% functional during blocked sync states.
- [x] **Scheduler safety**: Background scheduler records `INTERACTION_REQUIRED` silently without opening browser windows automatically.
- [x] **Single-attempt retry**: Clicking retry performs exactly 1 logical preflight access probe.
- [x] **No raw error exposure**: UI displays structured user-friendly notices without raw stack traces or internal IPC errors.

Automated access-probe, lifecycle, and Cloudflare loop coverage live in `tests/unit/scraperAccessProbe.test.ts`, `tests/unit/scraperLifecycle.test.ts`, `tests/unit/cloudflareLoopDetection.test.ts`, `tests/unit/sessionVerification.test.ts`, and `tests/unit/categoryUrlPreservation.test.ts`.

### Browser Companion Regression Checklist (V3-61 & V3-62)

- [ ] **Loopback Handshake**: Extension connects to `POST /v1/hello` with Bearer auth; receives `WELCOME` with UUID session ID and protocol version 1.
- [ ] **Protocol Mismatch Handling**: Requests with mismatched protocol version or invalid origin header are rejected with 400/403.
- [ ] **Check Access Flow**: `checkAccess` queries category Page 1 via companion and reports `FORUM_READY`, `CHALLENGE_REQUIRED`, or `NO_RUTRACKER_TAB`.
- [ ] **Real Category Fetch**: Companion retrieves subforum HTML in `windows-1251` and delivers payload bounded by 10 MiB limit.
- [ ] **Topic Parse & Enrichment**: Newly discovered topics trigger `fetchTopic` and populate canonical title, cover URL, screenshots, and magnet links.
- [ ] **Timeout Handling**: Bridge commands timeout after 30 seconds if the browser tab is frozen, backgrounded, or unresponsive.
- [ ] **Disconnect Detection**: Stale connection is marked disconnected if no command or poll is received within 120 seconds.
- [ ] **First Run Sync**: Empty library successfully synchronizes enabled categories via companion without premature early stop.
- [ ] **Update Library Sync**: Existing catalog items trigger incremental scan with early stop after 3 consecutive known pages.
- [ ] **Cancellation**: Clicking Cancel during sync sends cancellation signal and gracefully cleans up without orphaned tasks.
- [ ] **Verification Pause**: When Cloudflare challenge is encountered, sync pauses in `INTERACTION_REQUIRED` without infinite reload loops.
- [ ] **Resume After Verification**: User completes verification in browser tab; clicking Check Access or Retry resumes sync cleanly.

### Embedded Electron Transport (V3-80 Prototype)

- [x] **Hidden Windows**: Scraper BrowserWindow instances are strictly hidden (`show: false`) at all times.
- [x] **Isolated Partition**: Uses `persist:rutracker-v1` under app `userData`. Never touches user personal browser profile.
- [x] **Bounded Concurrency (C=3)**: Fixed pool of max 3 workers with request queue backpressure.
- [x] **Strict Security**: Remote pages execute with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and zero preload script access.
- [x] **Navigation Allowlist**: Restricts navigations to RuTracker domains; blocks external protocols and schemes (`file://`, `magnet:`, etc.).
- [x] **Popups & Downloads Blocked**: Popups denied (`action: 'deny'`), permission requests denied, file downloads cancelled.
- [x] **Cyrillic Integrity**: Document Unicode string returned without mojibake; valid Russian titles parsed correctly.
- [x] **Default Transport Preserved (Historical V3-80 Prototype Status)**: At V3-80 time, Browser Companion remained production default while Embedded Electron was experimental. *(Note: in V3-82, Embedded Electron was promoted to primary autonomous transport with Browser Companion maintained at 100% parity as primary fallback).*

### Scraper First Run & Settings UX Redesign (V3-63)

- [x] **First Run 6-Step Workflow**: Guides user sequentially across Welcome, Category Selection, Browser Connection, Access Check, Initial Sync, and Ready completion.
- [x] **Category Selection Controls**: Grouped platform subforums with Select All, Clear Selection, dynamic counter, and zero-selection continue guard.
- [x] **Temporary Connection Notice**: Prominently highlights that companion connection is local, session-bound, and resets upon app or browser restart.
- [x] **Connection Token Security**: Hides `PORT:TOKEN` secret once connected in both First Run and Scraper Settings.
- [x] **Human-Friendly Access Translation**: Converts internal status codes (`FORUM_READY`, `CHALLENGE_REQUIRED`, `NO_RUTRACKER_TAB`, `AUTH_REQUIRED`) into friendly, localized messages without raw enum dumps.
- [x] **Initial Sync Cancellation**: Cancel button aborts scan engine cleanly without leaving zombie background processes.
- [x] **Settings Operational Dashboard**: Scraper settings organized as a high-density operational dashboard with transport status, reconnect button, and inline category scope summary.
- [x] **Collapsible Advanced Options**: Full scan and refresh toggles are tucked behind a collapsible section, preserving interdependent mutual exclusions.
- [x] **100% i18n Parity**: All new UI strings matched across `en.ts`, `pt-BR.ts`, and `ru-RU.ts`.

### Scraper Settings Operational Dashboard (V3-64)

- [x] **Sync Status Dashboard Card**: High-density operational summary displaying Browser Companion state, RuTracker access status, formatted last sync timestamp, active transport method badge, and primary Update Library CTA.
- [x] **3-Pillar Status Distinction**: Visually separates Extension Installed (`Installed` vs `Not detected`), Session Connected (`Connected` vs `Disconnected`), and RuTracker Ready (`Ready` vs `Verification required` / `Not checked`).
- [x] **Temporary Connection Prominence**: `TemporaryConnectionNotice` displayed in view without concealment behind tooltips.
- [x] **Inline Reconnect & Recovery UX**: Context-sensitive reconnect action and Setup Instructions dialog when disconnected; Open RuTracker and Check Access when connected.
- [x] **Token & Port Concealment**: Connection code `PORT:TOKEN` displayed only during reconnect / disconnected state; concealed once connected with technical details relegated to Diagnostics.
- [x] **Compact Categories Summary**: Displays `X of Y enabled` with clean link to Category Management, avoiding long lists in settings.
- [x] **Scope Invariant Preservation**: Category dropdown defines WHERE; Advanced options define HOW. Full Scan never alters scope.
- [x] **Collapsible Advanced Options**: Closed by default; preserves switch order and mutual lockouts (Full Scan vs Refresh Screenshots, Sizes, File Lists).
- [x] **Alternative Sync Methods**: Dedicated cards for Playwright fallback and Offline HTML import (`Import Saved RuTracker Page`) decoupled from primary Update Library.
- [x] **Technical Diagnostics Section**: Collapsed by default; reveals bridge port, status, protocol version, and HTTP response size without exposing secrets or cookies.
- [x] **Restart & Reload Resilience**: Unconnected state cleanly handled upon application restart or extension reload without false positive connected state.

### Browser Companion Connection & Recovery UX (V3-65)

- [x] **10-State Lifecycle Machine**: Standardized enum states (`NOT_INSTALLED`, `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `CHECKING_ACCESS`, `READY`, `VERIFICATION_REQUIRED`, `NO_RUTRACKER_TAB`, `TIMEOUT`, `ERROR`) handled deterministically across hook and UI.
- [x] **Three Pillars Decoupling**: Pure separation of extension presence (`INSTALLED`), bridge handshake (`CONNECTED`), and verified RuTracker access (`READY`).
- [x] **Mandatory Session Copy**: Exact mandatory warning (*"Browser Companion connections are temporary and valid only for the current RT-Library session. You may need to reconnect after restarting RT-Library or reloading the extension."*) present across First Run, Settings, and Reconnect views.
- [x] **Session Ephemerality Guard**: Zero persistence across app restarts; state initializes cleanly in `DISCONNECTED` or `NOT_INSTALLED`.
- [x] **Stale Heartbeat Detection**: Stale connection automatically flips to `DISCONNECTED` with `isExpired: true` after 120s inactivity.
- [x] **Frictionless Clean Reconnect**: `reconnectCompanion()` invalidates previous session ID, resets queues, and presents fresh code until handshake completes.
- [x] **Contextual Recovery CTAs**:
  - `NO_RUTRACKER_TAB` offers `[Open RuTracker]` and `[Check Again]`.
  - `VERIFICATION_REQUIRED` offers `[Open RuTracker]` and `[Check Again]`.
  - `TIMEOUT` offers `[Check Again]` and `[Reconnect]`.
  - `NOT_INSTALLED` provides `[Setup Instructions]`, `[Use Playwright]`, and `[Import Saved Page]`.
- [x] **Update Library Guard**: Intercepts `Update Library` if Companion is active transport but not in `READY` state, showing contextual recovery inline instead of initiating broken sync.
- [x] **Telemetry & Diagnostic Privacy**: Diagnostics displays masked session ID (`abcd...1234`), protocol version, extension version, and timestamps, but strictly never the Bearer token or full connection code.
- [x] **100% i18n Parity**: Full multilingual support across `en.ts`, `pt-BR.ts`, and `ru-RU.ts`.
- [x] **Automated Test Coverage**: Comprehensive suite in `tests/unit/useCompanionConnection.test.ts` (9 tests), `tests/integration/ScraperDashboard.test.tsx` (11 tests), `tests/integration/FirstRunOnboarding.test.tsx` (8 tests), and `tests/unit/scraperUXComponents.test.tsx` (3 tests).

### Scraper Runtime UX Polish & Final Validation (V3-66)

- [x] **Unified Progress UI**: Identical human-friendly progress model across First Run Onboarding and Settings > Scraper Update Library.
- [x] **Human-Friendly Metrics**: Category scope, `Page X of Y`, topics found, new topics, known topics, details processed (`X / Y`), items saved; raw `requestId` and bridge internals completely omitted.
- [x] **Multi-Category Overall Progress**: Displays `Category X of Y` in addition to category-level metrics when running All Categories.
- [x] **Indeterminate Progress Bar**: When total pages are unknown, displays an indeterminate animated progress bar without fabricating percentages.
- [x] **Clean Completion Summary**: Displays "Synchronization complete" with new items, updated items, skipped/known topics, and duration.
- [x] **Zero New Items Success State**: Reports "Library is already up to date" as a positive success state rather than an error or warning.
- [x] **Partial Sync Breakdown**: When some categories encounter warnings or failures, reports "Synchronization completed with warnings" with a per-category breakdown.
- [x] **Interactive Paused State**: When Cloudflare verification or CAPTCHA is encountered, pauses sync cleanly with `[Open RuTracker]`, `[Check Access]`, and `[Resume]` actions.
- [x] **Mid-Scan Disconnect Card**: If the Browser Companion disconnects mid-scan, informs user that progress is preserved and provides clean reconnection action.
- [x] **Clean Scan Cancellation**: Clicking Cancel aborts scanning cleanly, preserves already committed SQLite records, and displays "Synchronization cancelled".
- [x] **Zero-Enabled Categories Guard**: Prevents scan start and notifies user if 0 categories are selected.
- [x] **Standardized Error Categorization**: Errors mapped into Connection, Access, Network, Parser, Import, Database, and Unknown with actionable recovery buttons and zero raw stack traces or internal codes.
- [x] **Empty Library State**: Dedicated empty state in catalog views with `[Set up synchronization]`, `[Import saved page]`, and `[Explore settings]`.
- [x] **100% i18n Parity**: Full multilingual support across `en.ts`, `pt-BR.ts`, and `ru-RU.ts`.
- [x] **Automated Test Coverage**: Comprehensive suite in `tests/unit/scraperRuntimeUX.test.tsx` (8 tests), `tests/integration/CatalogViews.test.tsx` (10 tests), and `tests/integration/FirstRunOnboarding.test.tsx` (8 tests).

### Default Catalog Sort
- [x] **All Games default newest first**: All Games queries order by `discoveredAt DESC`.
- [x] **Category default newest first**: Category-filtered queries order by `discoveredAt DESC`.
- [x] **Manual sort override**: Changing sort field/direction takes effect immediately.
- [x] **Category change preserves manual sort**: Switching categories retains the user's manual sort selection.
- [x] **Saved View overrides default**: Loading a saved view applies its configured sort.
- [x] **Invalid stored value fallback**: Falsy or unknown sort strings fall back to `discoveredAt DESC`.
- [x] **NULL last**: Legacy items without discovery timestamp appear after dated items.
- [x] **Deterministic tie-break**: Items with identical timestamps are stably ordered.
- [x] **Pagination stable**: No item shifts, skips, or duplicate rows across pages.
### Theme Readability & Contrast Accessibility
- [x] **WCAG AA text contrast**: All 14 themes maintain >= 4.5:1 ratio for foreground and mutedForeground on backgrounds/cards.
- [x] **Dracula muted token readability**: Secondary/muted labels in Dracula theme are clearly legible (~7.95:1 on background, ~8.82:1 on cards).
- [x] **Sidebar category counters**: Category badge counts are crisp and legible across all dark and light themes.
- [x] **Active selection clarity**: Active navigation items feature distinct background tint, border, and high-contrast text.
- [x] **No hardcoded neutral styles**: UI components (`Card`, `Popover`, `Tooltip`, `Separator`, `Skeleton`, `Badge`, `Button`) use semantic tokens.
- [x] **Automated contrast test**: `tests/unit/themeContrast.test.ts` validates all 14 themes across all core token pairs.

### Progress Mascot Evolution (V3-26)
- [x] **Larger mascot scale**: Mascot sizes upgraded to 20px (`sm` / card), 28px (`md` / preview), and 30px (`lg` / runtime).
- [x] **Visible at 0%**: Clamped horizontal position prevents left edge cutoff.
- [x] **Visible at 100%**: Clamped horizontal position prevents right edge cutoff.
- [x] **No clipping**: Wrapper `overflow-visible` allows mascot to layer cleanly over the progress track.
- [x] **No overlap / Layout shift**: Absolute positioning with fixed height wrapper preserves track height and layout.
- [x] **No jitter**: Pure CSS transform animations prevent layout recalculations or virtualizer thrashing.
- [x] **Smooth animation**: Theme-specific motion applied across all 11 progress themes.
- [x] **Optional trails**: Particle, rainbow, bubble, spark, star, and glow trails render behind running mascots.
- [x] **Reduced motion**: `@media (prefers-reduced-motion)` disables bounces, rotations, sweeps, and trails.
- [x] **State transitions**: Celebration animation on 100% complete, grayscale static on failed, pulse on cancelling/attention.
- [x] **Theme card performance**: Static mascot in unselected/unhovered cards avoids running 11 simultaneous animations.

### Theme Selection & Appearance Preview UX (V3-27)
- [x] **Instant hover/focus preview**: Hovering or focusing theme cards updates preview instantly without global DOM side-effects.
- [x] **Preview reversion on blur/leave**: Leaving theme card reverts the preview box to currently applied theme.
- [x] **Applied vs Previewing distinction**: Applied theme has solid border and checkmark; previewing has dashed ring and `Previewing` badge.
- [x] **2-Column responsive layout**: Desktop displays 7-col options and 5-col sticky previews.
- [x] **Sticky preview behavior**: Live preview boxes stick to the top during scrolling through long theme lists.
- [x] **Recent themes switcher**: Persists up to 3 recent themes in `localStorage` for 1-click switching.
- [x] **Collapsible theme groups**: RT Default (2), Terminal (7), and Community (5) toggle smoothly with item counts.
- [x] **Keyboard navigation**: Tab, Arrow, Enter/Space to apply, and Escape to cancel preview.
- [x] **Screen reader announcements**: `aria-live="polite"` announces theme changes upon selection.
- [x] **Scraper progress preview**: Independent hover preview, prominent protagonist mascot, and realistic mock activity bar.

### Language Selector & Scalability (V3-28)
- [x] **Compact dropdown**: Replaces bulky horizontal option cards with a compact Radix UI Select dropdown.
- [x] **Flag visible**: Decorative emoji flag rendered in trigger and dropdown items.
- [x] **Short locale visible**: Monospace uppercase short label (e.g. `PT-BR`, `EN`) displayed in trigger and items.
- [x] **Native language name visible**: Autonyms (e.g. `Português (Brasil)`, `English`) displayed for user clarity.
- [x] **Selected check indicator**: Active language clearly indicated with `Check` icon in dropdown.
- [x] **Immediate apply**: Selecting language updates UI strings and context immediately without manual save button.
- [x] **Persistence**: Language selection persisted to `localStorage` under `rt_library_locale`.
- [x] **Invalid fallback**: Unknown or corrupted locale strings gracefully fall back to default (`en`).
- [x] **Full keyboard accessibility**: Tab, ArrowUp, ArrowDown, Home, End, Enter, Space, and Escape supported.
- [x] **Screen reader accessibility**: Flag marked with `aria-hidden="true"` and trigger has clear accessible label.
- [x] **10+ locales scalable**: Data-driven central registry (`SUPPORTED_LOCALES`) and scrollable menu (`max-h-[320px]`).
- [x] **All themes readable**: Uses semantic theme tokens for trigger, hover, selection, and popover container.
- [x] **No duplicated description**: Clean 1-row layout with clear title and description.

### Compact Theme Selectors (Global & Progress) Checklist

- [x] **Compact trigger buttons**: Single-row triggers for Application Theme and Progress Bar Style replacing 430+ lines of card grids.
- [x] **Live theme preview intact**: Dedicated Live Theme Preview and Scraper Progress Live Preview boxes remain prominently visible below triggers.
- [x] **Categorized popover**: Global themes cleanly grouped into `RT Default`, `Terminal Color Schemes`, and `Community & Identity`.
- [x] **Theme swatches & gradients**: Color preview swatches for standard themes and rainbow gradient for pride themes rendered in trigger and options.
- [x] **Progress mascots & mini bars**: Mascots and mini progress bars displayed in Progress Theme trigger and dropdown items.
- [x] **Live search filters**: Fast search input in both dropdowns filtering themes and progress styles in real time.
- [x] **Instant hover/focus preview**: Hovering or keyboard focusing over options immediately updates the Live Preview box without premature global application or persistence.
- [x] **Preview cancellation on Escape**: Pressing `Escape` cancels preview and resets the preview box back to the applied theme.
- [x] **Immediate apply on select**: Clicking or pressing `Enter`/`Space` applies the selected theme immediately.
- [x] **Micro-animation performance**: Non-hovered progress track items remain static; animations trigger only on hover/focus/active.
- [x] **WAI-ARIA accessibility**: Full `combobox`, `listbox`, `option` roles, `aria-expanded`, `aria-selected`, and `aria-live` announcements.
- [x] **Arrow keys navigation**: ArrowDown and ArrowUp cycle through items in real time, updating live previews and scrolling items into view.
- [x] **Home / End jumping**: Home jumps to first item and End jumps to last item in the list.
- [x] **Scroll event containment**: Mouse wheel and trackpad scroll events stop propagation (`e.stopPropagation()`) and do not scroll underlying dialogs.

### Russian Language Support (V3-30) Checklist

- [x] **Central Registry Integration**: `ru-RU` (`RU`, `🇷🇺`, `Русский`) registered in `Locale` union and `SUPPORTED_LOCALES`.
- [x] **100% Dictionary Key Parity**: `ru-RU.ts` contains identical key structure to `en.ts` and `pt-BR.ts` with zero missing keys.
- [x] **Full UI Translation**: Navigation, Topbar, Filters, Catalog, Pagination, Item Detail, Settings (all tabs), Activity Bar, Command Palette, Saved Views, Categories, and Onboarding translated to natural Russian.
- [x] **Domain Data Untouched**: Raw game titles, magnet links, torrent file names, developers, publishers, platforms, and RuTracker topic content remain un-translated.
- [x] **Russian Pluralization Rules**: Correct `one` (1, 21...), `few` (2-4, 22-24...), and `many` (5-20, 25-30...) plural suffix mapping via `Intl.PluralRules`.
- [x] **Locale-Aware Number & Date Formatting**: Russian number formatting (space thousands separators) and date formatting supported seamlessly.
### Browser Companion Popup UX & Bidirectional Session State (V3-68)

- [x] **Two-Mode Popup View**: Visual state switches cleanly between Disconnected (form visible) and Connected (form completely hidden).
- [x] **Zero Token Exposure**: Token and connection code inputs are wiped and absent from the DOM after handshake.
- [x] **Live Session Statistics**: Real-time duration timer, active in-flight requests (never negative), completed, and failed counters.
- [x] **Scraper Metrics Breakdown**: Tracks category pages fetched, topic pages fetched, total bytes transferred (KB / MB), and last activity timestamp.
- [x] **RuTracker Tab Detection**: Live detection of open RuTracker tabs with inline **Open RuTracker** action if missing.
- [x] **Manual Disconnect**: Extension Disconnect button terminates active fetches, sends `POST /v1/disconnect` to the bridge, clears session storage, and resets popup.
- [x] **App-Side Disconnect Detection**: App shutdown or 3 consecutive network failures transitions extension to Disconnected without requiring manual reload.
- [x] **Session Invalidation (401/403/409/410)**: Immediate disconnection upon bridge authentication or handshake failure.
- [x] **Stateless Popup**: Opening or closing the browser extension popup does not interrupt running background synchronizations.
- [x] **Automated Regression Tests**: `tests/unit/browserCompanionPopup.test.ts` and `tests/unit/browserCompanionBridge.test.ts` validate all lifecycle flows.

### Progressive Library Experience During Synchronization (V3-74)

- [x] **Background Persistence**: Navigating away from scraper screens or dismissing onboarding leaves synchronization running in Electron Main.
- [x] **Progressive Page Commitment**: `ScanEngine` fires `scraper:pageCommitted` after each page's raw batch is ingested atomically into SQLite.
- [x] **Live Catalog Discovery**: `useLibrary` listens to `scraper:pageCommitted`, invalidates category query cache, and smoothly updates records.
- [x] **Viewport Stability**: Scrolled-down viewports (`scrollTop > 40`) never jump; a floating `X new items available · [ Show ]` banner is rendered instead.
- [x] **Scroll Restoration Guard**: Smooth scrolling back to top or clicking `[ Show ]` clears the banner and displays latest additions.
- [x] **First-Run Non-Blocking Onboarding**: Step 5 provides secondary CTA `[ Browse Library ]` stating *"Synchronization will continue in the background while RT-Library remains open."*
- [x] **Global Sync Status Indicator**: Topbar left slot houses a real-time status pill (`Syncing`, `Paused`, `Verification Required`, `Complete`, `Failed`) with an interactive control popover.
- [x] **JIT Request Deduplication**: Concurrent in-flight topic detail requests for the same `topicId` are deduplicated at the bridge level to prevent race conditions.
- [x] **100% i18n Parity**: Zero hardcoded strings in JSX; English, Brazilian Portuguese, and Russian translations matched across dictionaries.
### Sync History & Health Dashboard (V3-75)
- [x] **Schema V6 Migrations**: Database initialization safely migrates existing schemas and creates `sync_runs` and `sync_run_categories` with covering indexes.
- [x] **Zombie Run Cleanup on Startup**: Interrupted/crashed processes with `RUNNING` or `CANCELLING` status transition cleanly to `INTERRUPTED` on startup without leaving orphaned active jobs.
- [x] **Page-Boundary Progress Commitment**: Counters and duration update on completed page commits without issuing per-topic write transactions.
- [x] **Idempotent Category Runs**: Deterministic category composite keys (`${syncRunId}_${categoryId}`) ensure repeated page attempts never create duplicate category run entries.
- [x] **Cancellation Handling**: User cancellation transitions run to `CANCELLED` and marks active category with `cancelled_by_user = 1`.
- [x] **Operational Health KPI Computation**: `getSyncHealth` correctly computes last successful run, overall last run, healthy category counts, and attention-needing categories.
- [x] **Audit Privacy Guarantee**: Strict prevention of raw HTML, credentials, cookies, tokens, and stack traces inside sync run records.
- [x] **History Retention**: Automatic retention pruning maintains the latest 100 sync runs while keeping active running runs intact.
- [x] **UI Health Dashboard & Drilldown**: `SyncHealthCard` displays operational metrics with category breakdown and single-category sync trigger; `SyncHistoryView` provides status filters, live active run view, and expandable category detail.
- [x] **Direct Navigation Flow**: Completion toast `[ View Summary ]` and GlobalSyncStatus popover directly open `Settings > Scraper > Synchronization History`.
- [x] **Multi-Language Parity**: 100% string coverage across English (`en.ts`), Brazilian Portuguese (`pt-BR.ts`), and Russian (`ru-RU.ts`).
- [x] **Automated Regression Suite**: Covered by `tests/unit/syncHistoryRepo.test.ts` and `tests/unit/syncHistoryComponents.test.tsx`.

### Background Sync UX, Smart Notifications & Actionable Recovery (V3-76)
- [x] **Discreet Background Execution**: Normal crawling and page commitments generate zero toast spam; feedback is consolidated in the `GlobalSyncStatus` pill.
- [x] **Auto-Hide TTL for Completed Runs**: Completed/failed pills in `GlobalSyncStatus` auto-dismiss after 45 seconds to keep the header clean.
- [x] **Actionable Persistent Banner**: Surfaces persistent, non-blocking notification for states requiring action with deterministic priority: `VERIFICATION_REQUIRED` > `COMPANION_DISCONNECTED` > `NO_RUTRACKER_TAB` > `FAILED`.
- [x] **Smart Completion Copy**: Toast renders positive *"Library is up to date"* message when `new_items === 0` instead of confusing 0 counts.
- [x] **Toast Deduplication**: `lastNotifiedRunIdRef` ensures strictly 1 notification per finished run regardless of UI re-renders or duplicate event dispatches.
- [x] **Native Desktop Notification Routing**: Electron native desktop notification is fired if the app window is blurred or minimized (`!isWindowFocused`), avoiding double notifications. Controlled via user setting.
- [x] **Direct Run Expansion Flow**: Clicking `[ View Summary ]` or `[ Review Issues ]` opens `Settings > Scraper > Synchronization History` with that specific run pre-expanded via `scraper/history:RUN_ID`.
- [x] **Startup Notice for Interrupted Runs**: Reassures user that committed progress is safe after an app termination, notifying at most once per session.
- [x] **Multi-Language Parity**: 100% string coverage across English (`en.ts`), Brazilian Portuguese (`pt-BR.ts`), and Russian (`ru-RU.ts`).
- [x] **Automated Regression Suite**: Covered by `tests/unit/syncNotificationCoordinator.test.tsx` (15/15 tests passing).

---

## 4. Running Tests

### Manual RuTracker HTML Import (V3-57)

- [ ] Import one saved category page and one topic page while network access is disabled.
- [ ] Reimport a page and confirm no duplicate `source + topicId` records are created.
- [ ] Confirm favorites and existing screenshots remain after a sparse topic update.
- [ ] Reject empty, unrelated, malformed, and over-limit HTML files without exposing internal errors.
- [ ] Confirm imported scripts do not execute and external resources are not requested.
- [ ] Confirm SQLite writes remain in Electron Main and the online scraper path remains unchanged.
- [ ] Linux runtime: validate picker and both import page types. Windows runtime: validate separately on Windows.

### Smart Scheduled Sync & Idle-Aware Automation (V3-77)
- [x] **Safe Opt-In Default**: Automatic sync defaults to `OFF` (`enabled: false`).
- [x] **No Automated Browser Launch**: Zero commands or subprocesses opening Google Chrome or any browser.
- [x] **No Automated Tab Opening**: Never opens RuTracker tabs automatically.
- [x] **No Automated Challenge Solving**: Never interacts with CAPTCHA or Cloudflare challenges.
- [x] **Transport Locked**: Strictly restricted to `BROWSER_COMPANION`.
- [x] **Incremental Only**: Automatic runs never trigger full scans, deep scans, or image re-fetching.
- [x] **Minimum Interval Enforced**: Production strictly enforces a 60-minute minimum interval.
- [x] **Single Active Job Invariant**: Manual runs in progress safely defer scheduled checks (`SCRAPER_BUSY`) without failing or launching second jobs.
- [x] **Clean Audit Table**: Skipped checks never create entries in `sync_runs`.
- [x] **Burst Prevention**: App restart or waking from system sleep safely recalculates `nextRunAt` without firing burst runs.
- [x] **UI Controls**: `AutomaticSyncCard` rendered in `Settings > Scraper` with preset frequencies, category scope, next run timer, and skip warnings.
- [x] **History Attribution**: Scheduled runs display a distinct `Scheduled` trigger badge in `SyncHistoryView`.
- [x] **100% i18n Parity**: 27 keys added across English, Brazilian Portuguese, and Russian.
- [x] **Automated Regression Suite**: Covered by `tests/unit/syncScheduler.test.ts` (15/15 tests passing).

### In-App Verification & Embedded Session Recovery (V3-81)
- [x] **Exact Same Session Invariant**: Verification window strictly shares `persist:rutracker-v1` partition with background workers.
- [x] **Sandboxed Verification Window**: Hardened window with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no preload, and navigation allowlist.
- [x] **Zero Unprompted Windows**: Verification window opens ONLY upon explicit user interaction (`[ Verify now ]`), never unexpectedly in background.
- [x] **Singleton Verification Window**: Consequent verify clicks focus existing window; exactly one window instance exists.
- [x] **Human-Only Verification**: Strictly zero automated Turnstile clicking, fingerprint spoofing, or script injection.
- [x] **Automatic Detection & Resume**: Detects `FORUM_READY`, auto-closes verification window, and resumes paused scan job seamlessly on the same run without duplicating SQLite writes.
- [x] **User Cancellation Handling**: Closing verification window cleanly cancels verification without crashing background worker or corrupting session.
- [x] **Session Reset**: `resetSession()` safely purges cache, cookies, and local storage on `persist:rutracker-v1`.
- [x] **Verification Loop Root Cause & Lifecycle Guards (V3-81.3)**:
  - Navigation generation tracking on top-level main frame navigations (`navigationGeneration`).
  - Challenge generation tracking (`challengeGeneration`) and Ray ID extraction.
  - Same challenge polling invariant: repeated checks or timer ticks on identical document retain attempt at 1 and never trigger false loop.
  - Distinct challenge cycle counting: attempts only increment upon new navigation/Ray ID after human processing.
  - Finite loop limit: cleanly terminates with `VERIFICATION_LOOP` error after 3 distinct challenge cycles.
  - Centralized inspection debouncing with serialization lock (`isClassifying`).
  - Forum marker precedence: valid forum HTML with residual Cloudflare scripts classifies strictly as `FORUM_READY`.
- [x] **Automated Regression Suite**: Covered by `tests/unit/embeddedVerification.test.ts` (16/16 tests passing) and `tests/unit/scanEngine.test.ts` (6/6 tests passing).

### Embedded Transport Production Integration & Autonomous Scheduler (V3-82)
- [x] **Transport Selection & Persistence**: Supports `AUTOMATIC`, `EMBEDDED_ELECTRON`, `BROWSER_COMPANION`, `PLAYWRIGHT`, and `MANUAL_IMPORT` persisted in SQLite `app_state`.
- [x] **Transport Freeze per Job**: Transport locked upon job initialization; mid-run mutations strictly blocked.
- [x] **Autonomous Periodic Scheduler**: Evaluates active transport dynamically; runs scheduled syncs via Embedded Electron without requiring browser extensions or open RuTracker tabs.
- [x] **Zero Surprise Windows during Scheduled Runs**: When Cloudflare challenge is encountered by scheduler, it defers safely (`VERIFICATION_REQUIRED`), records skip reason, and never auto-opens verification windows.
- [x] **Polymorphic Single-Topic Enrichment**: `scraper:fetch-topic` routes transparently to Browser Companion when active, or falls back to `EmbeddedElectronTransport.fetchTopic(...)`.
- [x] **First-Run Onboarding Support**: Step 3 provides clear choice between "Built-in Scraper (Autonomous)" and "Browser Companion (Extension)" with in-app test access and verification.
- [x] **Production Gate Validation**: Passed all 12 release gates ($C=3$ concurrency, 50 real topics parsed, hidden window invariant, renderer disposal, memory stability, database integrity).
---

## 4. Cross-Platform Final Stable Release Matrix (V3-86)

| Gate | Linux (x64) | Windows (x64) | Evidência / Notas |
| :--- | :--- | :--- | :--- |
| **Build** | **PASS** | **PASS** | `npm run build` compila React 18 / Vite sem erros nos dois ambientes. |
| **Typecheck** | **PASS** | **PASS** | `npx tsc --noEmit` retorna código 0. |
| **Tests** | **PASS** | **PASS** | 71 suítes de teste (681 testes) passam com mock environment multiplataforma. |
| **Package** | **PASS** | **PASS** | Linux: AppImage / unpacked auditados (`package:verify`). Windows: NSIS installer configurado via electron-builder. |
| **Startup GUI** | **PASS** | **PASS** | Linux: Inicializa em ~440ms. Windows: Janela principal e ciclo de vida do DWM validados sem erros fatais. |
| **Main Process** | **PASS** | **PASS** | Módulos CJS, gerenciador de janelas e ciclo de vida do Electron Main validados. |
| **Renderer** | **PASS** | **PASS** | Bundle de frontend estático servido via `dist/index.html` validado nos dois sistemas. |
| **Preload** | **PASS** | **PASS** | `electron/preload.cjs` contextBridge isolation validado. |
| **IPC** | **PASS** | **PASS** | IPC handlers de banco, shell e biblioteca testados. |
| **SQLite** | **PASS** | **PASS** | Modo WAL, foreign keys ativas, DDL, transações atômicas e consultas indexadas. |
| **better-sqlite3** | **PASS** | **PASS** | Rebuild para Electron (ABI 125), `PRAGMA integrity_check = ok` executado via `scripts/windows-runtime-smoke.cjs`. |
| **Persistence** | **PASS** | **PASS** | Escrita, fechamento e reabertura com leitura consistente de dados no SQLite (`%APPDATA%\RT Library`). |
| **Embedded Electron runtime** | **PASS** | **PASS** | Classe `EmbeddedElectronTransport` instanciada, teto de concorrência $C=3$, partição `persist:rutracker-v1`. |
| **Embedded real fetch** | **PASS** | **PASS** | Busca de categorias, tópicos e metadados no RuTracker com janela oculta invariante. |
| **Browser Companion bridge** | **PASS** | **PASS** | Servidor loopback HTTP `127.0.0.1` com porta efêmera, token criptográfico e protocolo `/v1/hello` aprovado via `windows-runtime-smoke.cjs`. |
| **Browser Companion integration**| **PASS** | **PASS** | Extensão MV3 conecta ao bridge em 127.0.0.1; handshake, polling e fetch in-page funcionais sem bloqueio de firewall loopback. |
| **Playwright runtime** | **PASS** | **PASS** | Módulo de automação detectado e validado pelo harness de smoke test. |
| **Manual Import** | **PASS** | **PASS** | Pipeline offline completo: HTML fixture -> Parser -> Normalizer -> Ingestion -> SQLite validado. |
| **Scheduler** | **PASS** | **PASS** | Temporizador em background, trava de job único e adiamento em caso de Cloudflare testados. |
| **Magnet launcher** | **PASS** | **PASS** | Validação estrita de esquema `magnet:` e roteamento nativo via `shell.openExternal()`. |
| **Installer NSIS** | **PASS** | **PASS** | Instalador interativo executa, cria atalhos no Menu Iniciar e instala em pasta local. |
| **Uninstaller** | **PASS** | **PASS** | Desinstalação remove executável e atalhos, preservando `%APPDATA%\RT Library` por design. |
| **Reinstall** | **PASS** | **PASS** | Reinstalação detecta banco SQLite existente e recupera catálogo e favoritos intactos. |

```bash
# Run all unit and integration tests
npm test

# Run automated theme contrast audit
node scripts/audit-theme-contrast.cjs

# Run build compilation check
npm run build

# Run publication readiness and packaging checks
npm run release:check
npm run package:verify

# Run cross-platform runtime smoke harness
npx electron scripts/windows-runtime-smoke.cjs
```

