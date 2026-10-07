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
- [x] **Immediate Switching & Persistence**: Selecting Russian in the language dropdown applies immediately and persists in `localStorage` under `rt_library_locale`.
- [x] **Automated Regression Tests**: `tests/unit/i18n.test.ts` and `tests/unit/languageSelector.test.tsx` validate 100% key parity, pluralization rules, and dropdown switching.

---

## 4. Running Tests

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
```

