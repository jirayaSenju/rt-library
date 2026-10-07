import React, { useState, useEffect, useRef } from "react"
import { useLibrary } from "@/hooks/useLibrary"
import { useFavorites } from "@/hooks/useFavorites"
import { useTheme } from "@/hooks/useTheme"
import { useSelection } from "@/hooks/useSelection"
import { useScraper } from "@/hooks/useScraper"
import { useI18n } from "@/i18n"
import { Sidebar } from "@/components/layout/Sidebar"

import { Topbar } from "@/components/layout/Topbar"
import { ScraperActivityBar } from "@/components/layout/ScraperActivityBar"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { ItemGrid } from "@/components/library/ItemGrid"
import { ItemList } from "@/components/library/ItemList"
import { SelectionBar } from "@/components/library/SelectionBar"
import { Pagination } from "@/components/library/Pagination"
import { ItemDetailModal } from "@/components/library/ItemDetailModal"
import { FirstRunScraperScreen } from "@/components/onboarding/FirstRunScraperScreen"
import { SettingsModal, SettingsSectionKey } from "@/components/settings/SettingsModal"
import { Button } from "@/components/ui/button"
import { Toaster, toast } from "sonner"
import { LibraryItem, LibraryFilters, DEFAULT_LIBRARY_FILTERS } from "@/types"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"

export function App() {
  const { t } = useI18n()
  const { themeId, theme, setTheme } = useTheme()
  const { favorites, isFavorite, toggleFavorite, setFavoritesBatch } = useFavorites()
  const {
    selectedIds,
    selectedCount,
    toggleSelection,
    selectAll,
    clearSelection,
  } = useSelection()
  const {
    bootState,
    migrationProgress,
    unlockLibrary,
    retryBootstrap,
    categories,
    selectedCategory,
    setSelectedCategory,
    items,
    totalItems,
    hasMore,
    currentPage,
    pageSize,
    totalPages,
    goToPage,
    setPageSize,
    filters,
    updateFilters,
    applyCatalogState,
    isLoading,
    isIndexing,
    indexingProgress,
    refreshLibrary,
    settings,
    saveSettings,
    categoryScrollPositions,
    saveScrollPosition,
  } = useLibrary()

  // Derive selected items from the currently loaded page items
  const selectedItems = items.filter((item) => selectedIds.has(item.id))

  const handleToggleFavorite = async (itemId: string, title?: string) => {
    const isFav = await toggleFavorite(itemId, title)
    if (selectedCategory === "favorites" || filters.onlyFavorites) {
      refreshLibrary()
    }
    return isFav
  }

  const handleFavoriteSelected = async (itemIds: string[]) => {
    await setFavoritesBatch(itemIds, true)
    if (selectedCategory === "favorites" || filters.onlyFavorites) {
      refreshLibrary()
    }
  }

  const handleUnfavoriteSelected = async (itemIds: string[]) => {
    await setFavoritesBatch(itemIds, false)
    if (selectedCategory === "favorites" || filters.onlyFavorites) {
      clearSelection()
      refreshLibrary()
    }
  }

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId)
    clearSelection()
  }

  const handleSelectAllPage = () => {
    selectAll(items.map((item) => item.id))
  }

  const handleApplyFilters = (newFilters: LibraryFilters) => {
    updateFilters(newFilters)
    goToPage(1)
    clearSelection()
  }

  const handleClearFilters = () => {
    updateFilters(DEFAULT_LIBRARY_FILTERS)
    goToPage(1)
    clearSelection()
  }

  const handleRemoveFilter = (field: keyof LibraryFilters | (keyof LibraryFilters)[]) => {
    if (Array.isArray(field)) {
      const updates: Partial<LibraryFilters> = {}
      field.forEach((f) => {
        updates[f] = null
      })
      updateFilters(updates)
    } else {
      updateFilters({ [field]: null })
    }
    goToPage(1)
    clearSelection()
  }

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem("rt_library_sidebar_collapsed")
    if (saved !== null) {
      return saved === "true"
    }
    return typeof window !== "undefined" ? window.innerWidth < 1024 : false
  })

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("rt_library_sidebar_collapsed", String(next))
      return next
    })
  }

  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    const saved = localStorage.getItem("rt_library_grid_density")
    if (saved === "compact" || saved === "comfortable") {
      return saved
    }
    return "comfortable"
  })

  const handleToggleDensity = () => {
    setDensity((prev) => {
      const next = prev === "comfortable" ? "compact" : "comfortable"
      localStorage.setItem("rt_library_grid_density", next)
      return next
    })
  }

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const saved = localStorage.getItem("rt_library_view_mode")
    if (saved === "list" || saved === "grid") {
      return saved
    }
    return "grid"
  })

  const handleViewModeChange = (mode: "grid" | "list") => {
    setViewMode(mode)
    localStorage.setItem("rt_library_view_mode", mode)
  }

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey>("library")
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)

  const {
    state: scraperState,
    progress: scraperProgress,
    error: scraperError,
    cancelScraper,
    renewSession,
  } = useScraper()

  const handleOpenSettings = (section: SettingsSectionKey = "library") => {
    setSettingsSection(section)
    setIsSettingsOpen(true)
  }

  // 1. Loading state during initial bootstrap
  if (bootState === "LOADING") {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col items-center justify-center space-y-3 select-none">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground font-mono">RT Library</span>
      </div>
    )
  }

  // 2. Migration in progress state
  if (bootState === "MIGRATING") {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col items-center justify-center p-6 space-y-4 text-center select-none">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xl shadow-primary/10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-foreground">
            {t("migration.title") || "Migrando biblioteca existente..."}
          </h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {migrationProgress || t("migration.inProgress") || "Convertendo dados legados para SQLite..."}
          </p>
        </div>
      </div>
    )
  }

  // 3. First-run scraper required state (Empty library)
  if (bootState === "SCRAPER_REQUIRED") {
    return (
      <>
        <Toaster theme={theme.type} position="bottom-right" />
        <FirstRunScraperScreen onComplete={unlockLibrary} />
      </>
    )
  }

  // 4. Database initialization error state
  if (bootState === "ERROR") {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex flex-col items-center justify-center p-6 space-y-4 text-center select-none">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            {t("common.dbErrorTitle") || "Falha ao inicializar o banco de dados"}
          </h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t("common.dbErrorDesc") || "Ocorreu um erro ao carregar o catálogo local do SQLite."}
          </p>
        </div>
        <Button onClick={retryBootstrap} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{t("common.retry") || "Tentar novamente"}</span>
        </Button>
      </div>
    )
  }

  // 5. READY state - Catalog View
  const totalItemsCount = categories.reduce((sum, c) => sum + c.count, 0)
  const isAllPageSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id))

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans select-none antialiased">
      <Toaster theme={theme.type} position="bottom-right" />

      <Sidebar
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        totalItemsCount={totalItemsCount}
        favoritesCount={favorites.size}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        onOpenSettings={() => handleOpenSettings("library")}
      />

      <main className="flex-1 min-h-0 flex flex-col h-screen overflow-hidden bg-background">
        <Topbar
          searchQuery={filters.searchQuery || ""}
          onSearchChange={(query) => updateFilters({ searchQuery: query })}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          sortBy={filters.sortBy || "discoveredAt"}
          sortOrder={filters.sortOrder || "desc"}
          onSortChange={(sortBy, sortOrder) => updateFilters({ sortBy, sortOrder })}
          filters={filters}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          onRemoveFilter={handleRemoveFilter}
          density={density}
          onToggleDensity={handleToggleDensity}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        <ScraperActivityBar
          state={scraperState}
          progress={scraperProgress}
          error={scraperError}
          onOpenDetails={() => handleOpenSettings("scraper")}
          onCancel={cancelScraper}
          onRenewSession={renewSession}
        />

        {isIndexing && (
          <div className="bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between text-xs text-primary">
            <span className="font-medium animate-pulse">
              {indexingProgress || t("common.indexing")}
            </span>
          </div>
        )}

        <SelectionBar
          selectedCount={selectedCount}
          selectedItems={selectedItems}
          totalPageItems={items.length}
          onSelectAll={handleSelectAllPage}
          onClearSelection={clearSelection}
          isAllSelected={isAllPageSelected}
          onFavoriteSelected={handleFavoriteSelected}
          onUnfavoriteSelected={handleUnfavoriteSelected}
        />

        <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          {viewMode === "grid" ? (
            <ItemGrid
              items={items}
              isLoading={isLoading}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onSelectItem={setSelectedItem}
              savedScrollPosition={categoryScrollPositions[selectedCategory] || 0}
              onSaveScrollPosition={(pos) => saveScrollPosition(selectedCategory, pos)}
              density={density}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelection}
            />
          ) : (
            <ItemList
              items={items}
              isLoading={isLoading}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onSelectItem={setSelectedItem}
              savedScrollPosition={categoryScrollPositions[selectedCategory] || 0}
              onSaveScrollPosition={(pos) => saveScrollPosition(selectedCategory, pos)}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelection}
              onSelectAllPage={handleSelectAllPage}
              onClearSelection={clearSelection}
            />
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={(page) => {
              saveScrollPosition(selectedCategory, 0)
              goToPage(page)
            }}
            onPageSizeChange={(size) => {
              saveScrollPosition(selectedCategory, 0)
              setPageSize(size)
            }}
            isLoading={isLoading}
          />
        </div>
      </main>

      <ItemDetailModal
        item={selectedItem}
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        isFavorite={selectedItem ? isFavorite(selectedItem.id) : false}
        onToggleFavorite={() =>
          selectedItem && handleToggleFavorite(selectedItem.id, selectedItem.cleanTitle || selectedItem.title)
        }
      />

      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        items={items}
        categories={categories}
        onSelectItem={(item) => {
          setSelectedItem(item)
          setIsCommandPaletteOpen(false)
        }}
        onSelectCategory={(catId) => {
          setSelectedCategory(catId)
          setIsCommandPaletteOpen(false)
        }}
        onRefresh={refreshLibrary}
        onOpenSettings={() => handleOpenSettings("library")}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={saveSettings}
        onForceReindex={refreshLibrary}
        initialSection={settingsSection}
        themeId={themeId}
        onSelectTheme={setTheme}
        density={density}
        onToggleDensity={handleToggleDensity}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapse={handleToggleSidebarCollapse}
      />
    </div>
  )
}

