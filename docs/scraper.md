# Scraper Architecture & Mechanics

RT-Library includes an integrated, modular Playwright-based scraper designed to discover, index, and synchronize topic metadata from configured forum subforums.

---

## 1. Core Principles

- **Local Ownership**: Scraped data is parsed directly into the local SQLite database. No external servers or intermediaries are involved.
- **Incremental by Default**: Scans evaluate topics chronologically and stop scanning a category once a threshold of consecutive previously indexed topics is encountered (`stop-on-first-seen` with tolerance buffer).
- **Graceful Security Handling**: RT-Library does not attempt to bypass CAPTCHAs, Cloudflare verifications, or WAF challenges. If human intervention is required, the scraper pauses and enters an `interaction_required` state.

---

## 2. Scope vs Execution Mode Architecture

The scraper cleanly decouples **Scope** (what categories to process) from **Execution Mode** (how pages and topics are traversed):

- **Scope Definition**: Defined exclusively by the category selector:
  - **Single Category**: Scopes execution strictly to the selected category (e.g. `Nintendo Switch`). No other categories will be visited regardless of selected scan options.
  - **All Categories**: Scopes execution to all enabled categories in order.
- **Execution Mode**: Controls traversal depth, topic discovery, and refresh fields.

### Scope Matrix

| Target Scope | Scan Mode / Options | Traversal Range | Early Stop on Known Pages | Categories Visited |
| :--- | :--- | :--- | :--- | :--- |
| **Selected Category** | Incremental (Default) | Page 1 until 3 consecutive known pages | Yes (limit: 3 pages) | Selected category only |
| **Selected Category** | Full Scan | Page 1 until 3 consecutive known pages | Yes (limit: 3 pages) | Selected category only |
| **Selected Category** | Refresh (Screenshots / Sizes / Files) | Page 1 to final page (Full pagination) | No (scans all pages) | Selected category only |
| **All Categories** | Incremental (Default) | Page 1 until 3 consecutive known pages | Yes (limit: 3 pages) | All enabled categories |
| **All Categories** | Full Scan | Page 1 until 3 consecutive known pages | Yes (limit: 3 pages) | All enabled categories |
| **All Categories** | Refresh (Screenshots / Sizes / Files) | Page 1 to final page (Full pagination) | No (scans all pages) | All enabled categories |

---

## 3. Refresh Semantics & Advanced Options

In addition to discovering new topics, the scraper provides targeted deep-refresh switches:

| Switch | Description | Execution Behavior |
| :--- | :--- | :--- |
| **Full Scan** | Performs complete discovery resynchronization (discovers new topics & refreshes fields). | Traverses from page 1 with early-stop buffer (3 known pages) |
| **Refresh Screenshots** | Re-parses topic descriptions to extract missing or updated screenshot URLs on existing items. | Traverses all pages without early stop (`processExistingOnly: true`) |
| **Refresh Sizes** | Re-reads torrent sizes and formats from topic headers on existing items. | Traverses all pages without early stop (`processExistingOnly: true`) |
| **Refresh File Lists** | Re-parses the torrent file structure and individual file lists on existing items. | Traverses all pages without early stop (`processExistingOnly: true`) |

> **Note**: Enabling **Full Scan** automatically enables and locks all three refresh options while retaining discovery mode. Advanced options never expand single category scope to all categories.

---

## 4. Category Configuration

Categories are managed via `electron/scraper/categoryManager.cjs` and user overrides stored in `scraper-categories.json`:

```json
{
  "id": "switch",
  "name": "Nintendo Switch",
  "group": "nintendo",
  "baseUrl": "https://rutracker.org/forum/viewforum.php?f=1605",
  "titleSearch": ["[Nintendo Switch]"],
  "enabled": true,
  "builtIn": true
}
```

Users can add custom subforums, edit URL targets, or disable categories from the **Category Management** subview in Settings.

---

## 5. Process Lifecycle & IPC Protocol

The scraper execution flow follows `scraper/protocol.cjs`:

1. **Launch Request**: Renderer sends `scraper:start` with options (`full`, `headless`, `categories`).
2. **Manager Dispatch**: `scraperManager.cjs` forks the child process (`scraper/runner.cjs`).
3. **Session Verification**: `browserSession.cjs` initializes the browser context and checks session validity.
4. **Topic Processing**: The runner injects `scripts/console.js` and streams `progress`, `topic_found`, and `log` events back to Main.
5. **Database Ingestion**: Topic metadata and details are ingested atomically into SQLite via `itemsRepo` and `detailsRepo`.
6. **Completion**: Upon finishing, an indexer worker updates search terms, and the UI re-queries the latest catalog page.

