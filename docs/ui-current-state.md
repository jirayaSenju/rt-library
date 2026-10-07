# RT-Library UI Current State

## 1. Catalog & Navigation

- **Sidebar**:
  - Categories list with live item counts.
  - "All Games" and "Favorites" views.
  - Collapse / expand toggle with persisted state.
  - Settings shortcut.
- **Topbar**:
  - Centered search with ⌘K / Ctrl+K shortcut.
  - Filter Popover button with active filter counter badges.
  - Grid / List view mode switcher.
  - Density toggle (Comfortable / Compact).
- **Default Catalog Ordering**:
  - **Default Sort Field**: `discoveredAt` (`Date Added` / Scrape & Discovery date).
  - **Default Sort Direction**: `DESC` (Newest first).
  - **Global Application**: Applies to "All Games" and all individual categories without per-category configuration.
  - **Persistence & User Override**: If a user manually changes the sort order (e.g. to `title` ASC), this choice is respected and preserved across category switches.
  - **Saved Views**: Applying a Saved View overrides the catalog sort with the view's specific sort configuration.

## 2. Views & Layout

- **Grid View**: Responsive card grid with dynamic column calculation, cover art loading, platform badges, and selection checkboxes.
- **List View**: Dense table view with metadata columns (Title, Platform, Release Year, Size, Seeds, Discovery Date).
- **Selection Bar**: Bottom floating action bar for batch operations (favorite, unfavorite, export).

## 3. Scraper & Settings

- **Activity Bar**: Real-time progress bar displaying current category, topic count, and error states.
- **Settings Modal**: Comprehensive configuration for Library, Scraper, Database, Image Cache, Categories, Themes, and Diagnostics.

## 4. Theme System & WCAG AA Contrast Compliance

- **14 Supported Themes**:
  - Builtin: `RT Dark`, `RT Light`.
  - Terminal: `Dracula`, `Nord`, `Gruvbox Dark`, `Catppuccin Mocha`, `Tokyo Night`, `Eco Green`, `Eco Red`.
  - Community: `Pride`, `Trans Pride`, `Bi Pride`, `Lesbian Pride`, `Non-Binary Pride`.
- **Accessibility Standards**:
  - All 14 themes meet **WCAG 2.1 AA** contrast standards across normal text (>= 4.5:1) and UI boundaries/interactive components (>= 3.0:1).
  - High-contrast tokens for muted and secondary text prevent eye strain and low visibility in dark themes (e.g. Dracula `mutedForeground` calibrated to `#b0c2e8` yielding ~7.95:1 on background and ~8.82:1 on cards).
  - Light themes (RT Light) feature high-density readable text and buttons (`primary` `#047857`, `mutedForeground` `#52525b`, `destructive` `#dc2626`).
  - Active selection states across sidebar navigation items and dropdowns use luminous borders, semi-transparent active background fills (`bg-primary/20`), and high-contrast foreground text.
  - Automated contrast regression test suite: `tests/unit/themeContrast.test.ts` and automated audit script `scripts/audit-theme-contrast.cjs`.

## 5. Enhanced Progress Mascot System

- **11 Progress Themes**: `Nyan Cat`, `Claude Code`, `Matrix Rain`, `Synthwave`, `Arcade Pixel`, `Lava Lamp`, `Rainbow Pop`, `Ocean Wave`, `Candy Rush`, `Cosmic Nebula`, `Soviet Red`.
- **Dynamic Scale Variants**:
  - `sm` / `card` (Theme Cards): 20px mascot with static performance optimization.
  - `md` / `preview` (Live Preview Modal): 28px mascot with animated motion and trail.
  - `lg` / `runtime` (Home Activity Bar): 30px prominent protagonist mascot.
- **Position & Clamping**:
  - Absolute positioning calculated as `clamp(0px, calc(${progress}% - ${offset}px), calc(100% - ${total}px))`.
  - Mascot is fully visible at 0% without left clipping, and fully visible at 100% without right clipping.
  - Mascot layer sits above the track with `overflow-visible`, overlapping track edges without causing layout shifts.
- **Motion & Visual Identity**:
  - Theme-specific animations: bounce, terminal cursor blink, digital scanline, neon tilt, stepped pixel bounce, molten bob, sparkle rotate, fish swim, rocket glide, and authoritative pulse.
  - Optional animated trails: rainbow tail, pixel particles, bubble streams, sparkle bursts, stardust streams, and neon glow.
  - Contextual State Awareness: one-shot celebration spin on complete, grayscale static on failure, gentle pulse on cancelling.
  - Accessibility: Full `prefers-reduced-motion` suppression and `aria-hidden="true"`.

## 6. Theme Selection & Appearance Preview UX Evolution

- **Instant Hover & Focus Preview**:
  - Hovering or keyboard focusing over any theme card updates the Live Preview box immediately without applying changes globally or persisting them.
  - Hovering or focusing outside of theme cards seamlessly reverts the preview box to the currently applied theme.
  - Global DOM theme and persistent storage remain locked until explicit selection.
- **Applied vs Previewing Visual Distinction**:
  - **Applied Theme**: Card marked with solid border (`border-primary`), background tint (`bg-primary/10`), active ring, and checkmark icon (`✓`). Live Preview header displays `[ Name • Applied ]`.
  - **Previewing Theme**: Card highlighted with distinct dashed ring (`ring-primary/40 ring-dashed`). Live Preview header displays `[ Previewing: Name ]` / `[ Prévia: Name ]`.
- **2-Column Responsive Layout**:
  - Desktop viewports split into a 2-column layout (`lg:grid lg:grid-cols-12 gap-5`):
    - **Left Column (7 cols)**: Recent themes quick switcher, collapsible theme groups, and progress theme picker.
    - **Right Column (5 cols, sticky top)**: Sticky Live Theme Preview and Scraper Progress Live Preview boxes that remain in view during scroll.
- **Recent Themes Quick Switcher**:
  - Persists up to 3 recently selected themes in `localStorage` (`rt_library_recent_themes`).
  - Displays compact quick-switch buttons with accent color indicators at the top of the appearance panel.
- **Collapsible Theme Groups**:
  - Grouped into `RT Default (2)`, `Terminal Color Schemes (7)`, and `Community & Identity (5)` with toggleable disclosure buttons and badge counters.
- **Accessibility & Keyboard Support**:
  - Cards act as accessible radio controls (`role="radio"`, `aria-checked`, `tabIndex={0}`).
  - `Enter` / `Space` applies the selected theme.
  - `Escape` cancels active preview and restores the applied theme.
  - `aria-live="polite"` region announces theme changes for screen readers.

## 7. Compact Language Selector with Flag + Locale Dropdown

- **Central Registry (`SUPPORTED_LOCALES`)**:
  - Locales defined centrally with ISO ID (`id`), short uppercase label (`shortLabel`), display name (`displayName`), native name (`nativeName`), and visual emoji flag (`flag`).
  - Extensible data-driven structure: adding a new language requires zero modifications to the UI selector component.
  - **Supported Locales**:
    - `pt-BR`: 🇧🇷 `PT-BR` — Português (Brasil)
    - `en`: 🇺🇸 `EN` — English
    - `ru-RU`: 🇷🇺 `RU` — Русский
- **Compact Trigger (`LanguageSelector`)**:
  - Replaces wide multi-card selections with a compact dropdown trigger (~190–210px).
  - Displays decorative flag emoji (`aria-hidden="true"`), short code badge (e.g. `PT-BR`, `EN`, `RU`), and autonym / native name (e.g. `Português (Brasil)`, `English`, `Русский`).
  - Fallback to generic `Globe` icon if flag is omitted.
- **Accessible Dropdown Menu**:
  - Built with Radix UI `Select` (`SelectTrigger`, `SelectContent`, `SelectItem`).
  - Vertically scrolling list with max-height constraint (`max-h-[320px]`) and `overflow-y-auto` supporting 10+ languages without expanding the dialog layout.
  - Active locale marked with check indicator (`✓`) and accent highlight.
- **Immediate Application & Persistence**:
  - Selecting a language updates UI translations immediately without needing a separate Save action.
  - Persisted in `localStorage` under `rt_library_locale`.
  - Fallback logic gracefully restores `DEFAULT_LOCALE` (`en`) upon encountering missing or invalid stored values.
- **Full Keyboard Navigation**:
  - Full WAI-ARIA combobox support with `Tab`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `Enter`, `Space`, and `Escape`.

## 8. Compact Theme Selectors (Global & Scraper Progress Themes)

- **Compact Trigger & Popover Architecture**:
  - Replaces extensive multi-card grids with single-row compact combobox triggers placed directly above their respective Live Preview boxes.
  - Significantly reduces vertical layout height in Settings -> Appearance while preserving rich visual exploration.
- **Global Theme Selector (`GlobalThemeSelector`)**:
  - **Trigger**: Displays 4-dot preview palette swatches (or dual-band gradient for pride themes), active theme name, and dropdown chevron.
  - **Popover Dropdown**: Categorized into `RT Default`, `Terminal Color Schemes`, and `Community & Identity`.
  - **Live Search**: Case-insensitive filtering across theme names (`Search themes...` / `Buscar temas...`).
  - **Hover/Focus Preview**: Hovering or keyboard focusing over list items instantly updates the adjacent Live Theme Preview box without premature global application or persistence.
  - **Immediate Apply**: Clicking or pressing `Enter`/`Space` applies the selected theme immediately, closes the dropdown, and announces via `aria-live`.
- **Progress Theme Selector (`ProgressThemeSelector`)**:
  - **Trigger**: Displays active mascot emoji/badge (e.g. `🐱`), progress theme localized name, and dropdown chevron.
  - **Popover Dropdown**: Scrollable list of all 11 progress themes with mini progress bar preview tracks.
  - **Live Search**: Case-insensitive filtering across progress styles (`Search progress styles...` / `Buscar estilos...`).
  - **Micro-Animation Policy**: Mini progress tracks remain static for non-active items, animating only when actively hovered, focused, or selected to avoid performance overhead.
  - **Hover/Focus Preview**: Hovering over options immediately updates the Scraper Progress Live Preview box.
  - **Immediate Apply**: Clicking or pressing `Enter`/`Space` persists the progress theme and updates the UI instantly.
- **Keyboard Navigation & Scrolling Mechanics**:
  - Full WAI-ARIA `combobox` / `listbox` / `option` roles with `aria-expanded`, `aria-selected`, and `aria-label`.
  - **Arrow Keys Navigation**: `ArrowDown` and `ArrowUp` cycle through items in real-time with wrapping, automatically scrolling the highlighted item into view (`scrollIntoView({ block: "nearest" })`) and updating the live preview without premature global application.
  - **Home & End**: Instantly jump to the first or last available item in the active list.
  - **Enter / Space**: Immediately selects the highlighted item and closes the popover.
  - **Escape**: Closes the popover and resets any preview state back to the currently applied selection.
  - **Mouse Wheel / Trackpad Scrolling**: Integrated `onWheel` event containment (`e.stopPropagation()` and `overscroll-contain`) prevents scroll events inside popovers and language select menus from being intercepted or captured by background dialogs.



