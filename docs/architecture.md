# System Architecture

RT-Library follows a modular, process-isolated Electron architecture designed for responsive catalog navigation and data integrity.

---

## Architectural Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS (Vite + React)                │
│                                                                        │
│  ┌───────────────┐ ┌───────────────┐ ┌────────────────┐ ┌────────────┐ │
│  │ Catalog Views │ │ FilterPopover │ │ Scraper Panel  │ │ Settings   │ │
│  │ (Grid / List) │ │ & Facets      │ │ & Activity Bar │ │ & Maint.   │ │
│  └───────┬───────┘ └───────┬───────┘ └───────┬────────┘ └─────┬──────┘ │
│          │                 │                 │                │        │
│  ┌───────┴─────────────────┴─────────────────┴────────────────┴──────┐ │
│  │                      React Hooks & Contexts                       │ │
│  │ (useLibrary, useFavorites, useSelection, useScraper, useTheme)    │ │
│  └───────────────────────────────────┬───────────────────────────────┘ │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ contextBridge (window.rtLibrary)
┌──────────────────────────────────────┼─────────────────────────────────┐
│ PRELOAD LAYER (electron/preload.cjs) │ IPC Channels: library, scraper, │
│                                      │               torrent, db, etc. │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │
┌──────────────────────────────────────┼─────────────────────────────────┐
│                       MAIN PROCESS (Electron / Node.js)                │
│                                                                        │
│  ┌──────────────────────┐  ┌────────────────────┐  ┌─────────────────┐ │
│  │    IPC Dispatchers   │  │   Scraper Manager  │  │  Image Fetcher  │ │
│  │ (library, db, image) │  │  (scraperManager)  │  │  & Disk Cache   │ │
│  └──────────┬───────────┘  └─────────┬──────────┘  └─────────────────┘ │
│             │                        │                                 │
│             │                        ▼ Forked Child Process            │
│             │              ┌────────────────────┐                      │
│             │              │  Playwright Runner │                      │
│             │              │ (scraper/runner)   │                      │
│             │              └─────────┬──────────┘                      │
│             ▼                        │                                 │
│  ┌───────────────────────────────────┴───────────────────────────────┐ │
│  │              Native SQLite Layer (better-sqlite3)                 │ │
│  │   - itemsRepo (WAL queries, EXPLAIN plans, normalized facets)     │ │
│  │   - detailsRepo & favoritesRepo                                   │ │
│  │   - backupScheduler & schema migrations                           │ │
│  └───────────────────────────────────┬───────────────────────────────┘ │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       ▼
                       ┌───────────────────────────────┐
                       │  Local Storage (~/.config)    │
                       │   - rt-library-v2.sqlite (WAL)│
                       │   - image-cache/              │
                       │   - backups/                  │
                       └───────────────────────────────┘
```

---

## Process Responsibilities

### 1. Renderer Process (Frontend)
- **Framework**: React 18 with TypeScript and Tailwind CSS.
- **State Management**: Custom hooks (`useLibrary`, `useFavorites`, `useSelection`, `useTheme`, `useScraper`).
- **Virtualization**: `@tanstack/react-virtual` enables efficient rendering of large item lists and grid cards with minimal DOM footprint.
- **Strict Isolation**: The renderer never touches the filesystem or database directly; all operations pass through `window.rtLibrary` exposed by the preload bridge.

### 2. Preload Layer (`electron/preload.cjs`)
- Uses Electron `contextBridge` to expose a type-safe, minimal IPC API.
- Enforces channel boundaries and data sanitization between Renderer and Main.

### 3. Main Process (`electron/main.cjs`)
- Manages window lifecycle, application menu, system trays, and single-instance locks.
- Hosts native database IPC handlers (`electron/ipc/libraryIPC.cjs`, `electron/ipc/databaseIPC.cjs`).
- Owns SQLite connection lifecycle and automatic backup scheduling.

### 4. Background Scraper Engine (`scraper/`)
- Spawned as an isolated child process to prevent blocking the main UI thread.
- Uses Microsoft Playwright to navigate category listings, evaluate topic pages, and extract structured metadata.
- Communicates status and progress to the Main Process via structured JSON-over-IPC protocol (`scraper/protocol.cjs`).
- Injects `scripts/console.js` for fast in-page DOM extraction and incremental topic parsing.

### 5. Native SQLite Storage Engine (`electron/database/`)
- Uses `better-sqlite3` in Write-Ahead Logging (`WAL`) mode for high-throughput reads and concurrent operations.
- Normalized schema splitting topic listings (`items`), topic descriptions/magnets (`item_details`), and swarm status (`torrent_metadata`).
- All queries leverage composite indexes (`category_id`, `is_favorite`, `discovered_at`, `size_bytes`, `seeds`).

