import React, { useState, useEffect, useRef } from "react"
import { AppSettings } from "@/types"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  FolderOpen,
  Magnet,
  RefreshCw,
  Database,
  Check,
  Clock,
  Palette,
  LayoutGrid,
  Grid2X2,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Languages,
  Sparkles,
} from "lucide-react"
import { ThemeId, THEMES } from "@/theme/themes"
import { useProgressTheme } from "@/hooks/useProgressTheme"
import { ProgressThemeId, PROGRESS_THEMES, PROGRESS_THEME_IDS } from "@/theme/progressThemes"
import { LibrarySettings } from "./LibrarySettings"
import { DatabaseSettings } from "./DatabaseSettings"
import { TorrentSettings } from "./TorrentSettings"
import { MetadataSettings } from "./MetadataSettings"
import { ImageSettings } from "./ImageSettings"
import { SettingsSection } from "./SettingsSection"
import { SettingRow } from "./SettingRow"
import { AppearanceSegmentedControl } from "./AppearanceSegmentedControl"
import { LanguageSelector } from "./LanguageSelector"
import { GlobalThemeSelector } from "./GlobalThemeSelector"
import { ProgressThemeSelector } from "./ProgressThemeSelector"
import { ScraperPanel } from "@/components/scraper/ScraperPanel"
import { CategoryManagement } from "@/components/scraper/CategoryManagement"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { ProgressMascot } from "@/components/layout/ProgressMascot"

export type SettingsSectionKey =
  | "library"
  | "database"
  | "scraper"
  | "torrent"
  | "metadata"
  | "images"
  | "appearance"

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onSaveSettings: (settings: AppSettings) => Promise<void>
  onForceReindex: () => void
  initialSection?: SettingsSectionKey
  themeId?: ThemeId
  onSelectTheme?: (themeId: ThemeId) => void
  density?: "comfortable" | "compact"
  onToggleDensity?: () => void
  viewMode?: "grid" | "list"
  onViewModeChange?: (mode: "grid" | "list") => void
  isSidebarCollapsed?: boolean
  onToggleSidebarCollapse?: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onForceReindex,
  initialSection = "library",
  themeId = "rt-dark",
  onSelectTheme,
  density = "comfortable",
  onToggleDensity,
  viewMode = "grid",
  onViewModeChange,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
}) => {
  const { t, locale, setLocale } = useI18n()
  const { progressThemeId, setProgressTheme } = useProgressTheme()
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection)
  const [subview, setSubview] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null)
  const [previewProgressThemeId, setPreviewProgressThemeId] = useState<ProgressThemeId | null>(null)
  const [appliedAnnouncement, setAppliedAnnouncement] = useState<string>("")
  const contentRef = useRef<HTMLDivElement>(null)

  const activePreviewTheme =
    (previewThemeId && THEMES[previewThemeId]) ||
    (themeId && THEMES[themeId]) ||
    THEMES["rt-dark"]

  const activePreviewProgressTheme =
    (previewProgressThemeId && PROGRESS_THEMES[previewProgressThemeId]) ||
    (progressThemeId && PROGRESS_THEMES[progressThemeId]) ||
    PROGRESS_THEMES["nyan-cat"]

  const getLocalizedProgressThemeName = (id: ProgressThemeId): string => {
    const map: Record<ProgressThemeId, string> = {
      "nyan-cat": t("settings.appearance.progressThemes.nyanCat"),
      "claude-code": t("settings.appearance.progressThemes.claudeCode"),
      "matrix-rain": t("settings.appearance.progressThemes.matrixRain"),
      "synthwave": t("settings.appearance.progressThemes.synthwave"),
      "arcade-pixel": t("settings.appearance.progressThemes.arcadePixel"),
      "lava-lamp": t("settings.appearance.progressThemes.lavaLamp"),
      "rainbow-pop": t("settings.appearance.progressThemes.rainbowPop"),
      "ocean-wave": t("settings.appearance.progressThemes.oceanWave"),
      "candy-rush": t("settings.appearance.progressThemes.candyRush"),
      "cosmic-nebula": t("settings.appearance.progressThemes.cosmicNebula"),
      "soviet": t("settings.appearance.progressThemes.soviet"),
    }
    return map[id] || PROGRESS_THEMES[id]?.name || id
  }

  const handleSelectTheme = (id: ThemeId) => {
    onSelectTheme?.(id)
    setPreviewThemeId(null)
    setAppliedAnnouncement(t("settings.appearance.themeApplied", { name: THEMES[id]?.name }) || `${THEMES[id]?.name} theme applied.`)
  }

  const handleSelectProgressTheme = (id: ProgressThemeId) => {
    setProgressTheme(id)
    setPreviewProgressThemeId(null)
    const localizedName = getLocalizedProgressThemeName(id)
    setAppliedAnnouncement(t("settings.appearance.progressThemeApplied", { name: localizedName }) || `${localizedName} progress theme applied.`)
  }


  useEffect(() => {
    setLocalSettings(settings)
  }, [settings, isOpen])

  useEffect(() => {
    if (isOpen && initialSection) {
      setActiveSection(initialSection)
      setSubview(null)
    }
  }, [isOpen, initialSection])

  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [isOpen, activeSection, subview])

  const handleUpdateSettings = (updater: (prev: AppSettings) => AppSettings) => {
    setLocalSettings((prev) => {
      const next = updater(prev)
      onSaveSettings(next).catch(console.error)
      return next
    })
  }

  const handleSelectSection = (key: SettingsSectionKey) => {
    setActiveSection(key)
    setSubview(null)
  }

  const navItems = [
    { key: "library" as const, label: t("settings.libraryTab"), icon: FolderOpen },
    { key: "database" as const, label: t("settings.databaseTab"), icon: Database },
    { key: "scraper" as const, label: t("settings.scraperTab"), icon: RefreshCw },
    { key: "torrent" as const, label: t("settings.torrentTab"), icon: Magnet },
    { key: "metadata" as const, label: t("settings.metadataTab"), icon: Clock },
    { key: "images" as const, label: t("settings.imagesTab"), icon: Database },
    { key: "appearance" as const, label: t("settings.appearanceTab"), icon: Palette },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(1100px,92vw)] max-w-5xl h-[min(760px,88vh)] p-0 border-border bg-card text-foreground rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Minimal Desktop Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-card shrink-0 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-base font-bold text-foreground tracking-tight">
              {t("settings.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {t("settings.description")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body: Left Sidebar + Right Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar Navigation */}
          <nav
            aria-label="Settings Navigation"
            role="tablist"
            className="w-48 sm:w-52 shrink-0 bg-secondary/30 border-r border-border p-3 space-y-1 overflow-y-auto custom-scrollbar"
          >
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSelectSection(item.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                    isActive
                      ? "bg-secondary text-primary font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Right Content Area */}
          <main
            ref={contentRef}
            role="tabpanel"
            className="flex-1 min-w-0 min-h-0 overflow-y-auto p-6 custom-scrollbar"
          >
            {/* 1. LIBRARY SECTION */}
            {activeSection === "database" && <DatabaseSettings />}
            {activeSection === "library" && (
              <div className="animate-in fade-in-0 duration-150">
                <LibrarySettings
                  settings={localSettings}
                  onUpdateSettings={handleUpdateSettings}
                  onForceReindex={onForceReindex}
                />
              </div>
            )}

            {/* 2. SCRAPER SECTION */}
            {activeSection === "scraper" && (
              <div className="animate-in fade-in-0 duration-150">
                {subview === "scraper/categories" ? (
                  <CategoryManagement onBack={() => setSubview(null)} />
                ) : (
                  <ScraperPanel
                    onNavigateToCategories={() => setSubview("scraper/categories")}
                  />
                )}
              </div>
            )}

            {/* 3. TORRENT SECTION */}
            {activeSection === "torrent" && (
              <div className="animate-in fade-in-0 duration-150">
                <TorrentSettings
                  settings={localSettings}
                  onUpdateSettings={handleUpdateSettings}
                />
              </div>
            )}

            {/* 4. METADATA SECTION */}
            {activeSection === "metadata" && (
              <div className="animate-in fade-in-0 duration-150">
                <MetadataSettings
                  settings={localSettings}
                  onUpdateSettings={handleUpdateSettings}
                />
              </div>
            )}

            {/* 5. IMAGES SECTION */}
            {activeSection === "images" && (
              <div className="animate-in fade-in-0 duration-150">
                <ImageSettings />
              </div>
            )}

            {/* 6. APPEARANCE SECTION */}
            {activeSection === "appearance" && (
              <div className="space-y-6 max-w-4xl animate-in fade-in-0 duration-150">
                {/* Screen reader live announcements */}
                <div className="sr-only" aria-live="polite" aria-atomic="true">
                  {appliedAnnouncement}
                </div>

                {/* Theme Preference (Compact Dropdown + Live Theme Preview) */}
                <SettingsSection
                  icon={Palette}
                  title={t("settings.appearance.themeTitle")}
                  description={t("settings.appearance.themeDesc")}
                >
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 px-0.5">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-foreground">
                          {t("settings.appearance.appTheme")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("settings.appearance.appThemeDesc")}
                        </div>
                      </div>
                      <GlobalThemeSelector
                        selectedThemeId={themeId || "rt-dark"}
                        previewThemeId={previewThemeId}
                        onPreviewTheme={setPreviewThemeId}
                        onSelectTheme={handleSelectTheme}
                      />
                    </div>

                    {/* Live Global Theme Preview Box */}
                    <div className="p-3 rounded-xl border border-border/70 bg-card/50 space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <div className="flex items-center gap-1.5">
                          <Palette className="h-3.5 w-3.5 text-primary" />
                          <span className="font-semibold text-foreground">
                            {t("settings.appearance.liveThemePreviewTitle")}
                          </span>
                        </div>
                        {previewThemeId && previewThemeId !== (themeId || "rt-dark") ? (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary font-semibold border border-primary/40">
                            {t("settings.appearance.previewingWithName", { name: activePreviewTheme.name })}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary/80 text-foreground border border-border/60">
                            {t("settings.appearance.appliedWithName", { name: activePreviewTheme.name })}
                          </span>
                        )}
                      </div>

                      {/* Simulated Realistic App Mockup */}
                      <div
                        className="w-full rounded-lg border overflow-hidden transition-all duration-200 text-[10px] flex select-none shadow-inner"
                        style={{
                          backgroundColor: activePreviewTheme.colors.background,
                          borderColor: activePreviewTheme.colors.border,
                          color: activePreviewTheme.colors.foreground,
                          height: "152px",
                        }}
                      >
                        {/* Mini Sidebar */}
                        <div
                          className="w-28 border-r p-2 flex flex-col justify-between shrink-0"
                          style={{
                            backgroundColor: activePreviewTheme.colors.card,
                            borderColor: activePreviewTheme.colors.border,
                          }}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1 font-bold text-[9px] tracking-wider uppercase" style={{ color: activePreviewTheme.colors.primary }}>
                              <div className="h-2 w-2 rounded-xs" style={{ backgroundColor: activePreviewTheme.colors.primary }} />
                              <span>RT Library</span>
                            </div>
                            <div className="space-y-0.5 pt-0.5">
                              <div
                                className="px-1.5 py-0.5 rounded text-[8px] font-semibold flex items-center justify-between"
                                style={{
                                  backgroundColor: `${activePreviewTheme.colors.primary}25`,
                                  color: activePreviewTheme.colors.primary,
                                }}
                              >
                                <span>{t("navigation.allItems")}</span>
                                <span className="text-[7px] opacity-80 font-mono">458</span>
                              </div>
                              <div
                                className="px-1.5 py-0.5 rounded text-[8px] opacity-60 flex items-center justify-between"
                                style={{ color: activePreviewTheme.colors.foreground }}
                              >
                                <span>{t("navigation.favorites")}</span>
                                <span className="text-[7px] opacity-80 font-mono">12</span>
                              </div>
                              <div
                                className="px-1.5 py-0.5 rounded text-[8px] opacity-60 flex items-center justify-between"
                                style={{ color: activePreviewTheme.colors.foreground }}
                              >
                                <span>{t("categories.groups.nintendo")}</span>
                                <span className="text-[7px] opacity-80 font-mono">144</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-[7px] opacity-40 truncate">
                            v1.0.0
                          </div>
                        </div>

                        {/* Mini Main Content Area */}
                        <div className="flex-1 flex flex-col min-w-0">
                          {/* Mini Topbar */}
                          <div
                            className="h-6 border-b px-2 flex items-center justify-between gap-2 shrink-0"
                            style={{
                              backgroundColor: activePreviewTheme.colors.card,
                              borderColor: activePreviewTheme.colors.border,
                            }}
                          >
                            <div
                              className="flex-1 max-w-[140px] h-3.5 rounded px-1.5 flex items-center border text-[7px] opacity-70"
                              style={{
                                backgroundColor: activePreviewTheme.colors.background,
                                borderColor: activePreviewTheme.colors.border,
                              }}
                            >
                              <span>{t("topbar.searchPlaceholder")}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="px-1 py-0.2 rounded border text-[7px] font-medium"
                                style={{
                                  backgroundColor: activePreviewTheme.colors.secondary,
                                  borderColor: activePreviewTheme.colors.border,
                                  color: activePreviewTheme.colors.foreground,
                                }}
                              >
                                {t("filters.button")}
                              </div>
                              <div
                                className="h-3.5 w-3.5 rounded flex items-center justify-center text-[7px] font-bold shadow-xs"
                                style={{
                                  backgroundColor: activePreviewTheme.colors.primary,
                                  color: activePreviewTheme.colors.primaryForeground || "#ffffff",
                                }}
                              >
                                ✓
                              </div>
                            </div>
                          </div>

                          {/* Mini Catalog Grid */}
                          <div className="flex-1 p-2 grid grid-cols-3 gap-1.5 overflow-hidden">
                            {[
                              { title: "Super Mario", platform: "NSW", size: "14 GB" },
                              { title: "Zelda: Tears", platform: "NSW", size: "16 GB" },
                              { title: "Metroid", platform: "NSW", size: "4 GB" },
                            ].map((item, idx) => (
                              <div
                                key={idx}
                                className="rounded border p-1 flex flex-col justify-between text-[7px]"
                                style={{
                                  backgroundColor: activePreviewTheme.colors.card,
                                  borderColor: activePreviewTheme.colors.border,
                                }}
                              >
                                <div
                                  className="w-full h-8 rounded-xs mb-0.5 flex items-center justify-center text-[7px] font-mono opacity-50"
                                  style={{ backgroundColor: activePreviewTheme.colors.muted }}
                                >
                                  {t("settings.images.covers")}
                                </div>
                                <div className="font-semibold truncate leading-tight">
                                  {item.title}
                                </div>
                                <div className="flex items-center justify-between pt-0.5 opacity-70 font-mono text-[6px]">
                                  <span>{item.platform}</span>
                                  <span style={{ color: activePreviewTheme.colors.primary }}>{item.size}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSection>

                {/* Progress Bar Style (Compact Dropdown + Live Progress Preview) */}
                <SettingsSection
                  icon={Sparkles}
                  title={t("settings.appearance.progressThemeTitle")}
                  description={t("settings.appearance.progressThemeDesc")}
                >
                  <div className="space-y-3 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 px-0.5">
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-foreground">
                          {t("settings.appearance.progressStyle")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("settings.appearance.progressStyleDesc")}
                        </div>
                      </div>
                      <ProgressThemeSelector
                        selectedThemeId={progressThemeId}
                        previewThemeId={previewProgressThemeId}
                        onPreviewTheme={setPreviewProgressThemeId}
                        onSelectTheme={handleSelectProgressTheme}
                      />
                    </div>

                    {/* Scraper Progress Live Preview Box */}
                    <div className="p-3 rounded-xl border border-border/70 bg-card/50 space-y-2.5 shadow-sm">
                      <div className="flex items-center justify-between text-[11px] font-medium">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="font-semibold text-foreground">
                            {t("settings.appearance.liveProgressPreviewTitle")}
                          </span>
                        </div>
                        {previewProgressThemeId && previewProgressThemeId !== progressThemeId ? (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-primary/20 text-primary font-semibold border border-primary/40">
                            {t("settings.appearance.previewingWithName", { name: getLocalizedProgressThemeName(activePreviewProgressTheme.id) })}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary/80 text-foreground border border-border/60">
                            {t("settings.appearance.appliedWithName", { name: getLocalizedProgressThemeName(activePreviewProgressTheme.id) })}
                          </span>
                        )}
                      </div>

                      {/* Simulated Realistic Home Scraper Activity Bar */}
                      <div
                        className="w-full rounded-lg border p-2.5 flex flex-col gap-2 transition-all shadow-sm"
                        style={{
                          backgroundColor: activePreviewProgressTheme.trackBg,
                          borderColor: activePreviewProgressTheme.trackBorder || "rgba(255, 255, 255, 0.15)",
                          color: activePreviewProgressTheme.textColor || "#ffffff",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                            <div className="truncate">
                              <div className="text-[11px] font-semibold leading-tight">
                                {t("activityBar.updatingLibrary") || "Updating library"}
                              </div>
                              <div className="text-[10px] opacity-80 leading-tight">
                                NSW • {t("activityBar.pageOf", { current: 101, total: 144 }) || "Page 101 of 144"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-xs">
                            <span className="font-mono font-bold text-[11px]">70%</span>
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium border border-white/20 bg-white/10">
                                {t("activityBar.details") || "Details"}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium border border-red-500/30 text-red-300 bg-red-500/10">
                                {t("activityBar.cancel") || "Cancel"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Full-width Realistic Progress Bar Track */}
                        <div className="relative flex items-center w-full py-1">
                          <div
                            className="w-full h-3 rounded-full overflow-hidden relative border border-white/10"
                            style={{
                              backgroundColor: "rgba(0, 0, 0, 0.35)",
                            }}
                          >
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                activePreviewProgressTheme.hasAnimation && "animate-progress-rainbow"
                              )}
                              style={{
                                width: "70%",
                                background: activePreviewProgressTheme.fillBackground,
                                backgroundSize: activePreviewProgressTheme.fillBackgroundSize,
                                boxShadow: activePreviewProgressTheme.glow,
                              }}
                            />
                          </div>
                          <div className="absolute inset-x-0 inset-y-0 pointer-events-none flex items-center overflow-visible">
                            <ProgressMascot
                              theme={activePreviewProgressTheme}
                              percent={70}
                              state="running"
                              size="md"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsSection>

                {/* Catalog & Navigation Section */}
                <SettingsSection
                  icon={LayoutGrid}
                  title={t("settings.appearance.catalogNavigationTitle")}
                  description={t("settings.appearance.catalogNavigationDesc")}
                >
                  <div className="space-y-0.5">
                    <AppearanceSegmentedControl
                      icon={LayoutGrid}
                      label={t("settings.appearance.viewModeTitle")}
                      description={t("settings.appearance.viewModeDesc")}
                      value={viewMode}
                      onChange={onViewModeChange}
                      options={[
                        { value: "grid", label: t("settings.appearance.gridView"), icon: LayoutGrid },
                        { value: "list", label: t("settings.appearance.listView"), icon: List },
                      ]}
                    />

                    <AppearanceSegmentedControl
                      icon={Grid2X2}
                      label={t("settings.appearance.densityTitle")}
                      description={t("settings.appearance.densityDesc")}
                      value={density}
                      onChange={(newDensity) => {
                        if (newDensity !== density) onToggleDensity?.()
                      }}
                      options={[
                        { value: "comfortable", label: t("settings.appearance.comfortable"), icon: LayoutGrid },
                        { value: "compact", label: t("settings.appearance.compact"), icon: Grid2X2 },
                      ]}
                    />

                    <AppearanceSegmentedControl
                      icon={PanelLeftClose}
                      label={t("settings.appearance.sidebarTitle")}
                      description={t("settings.appearance.sidebarDesc")}
                      value={isSidebarCollapsed ? "collapsed" : "expanded"}
                      onChange={(newMode) => {
                        const shouldBeCollapsed = newMode === "collapsed"
                        if (shouldBeCollapsed !== isSidebarCollapsed) onToggleSidebarCollapse?.()
                      }}
                      options={[
                        { value: "expanded", label: t("settings.appearance.expandedSidebar"), icon: PanelLeftOpen },
                        { value: "collapsed", label: t("settings.appearance.collapsedSidebar"), icon: PanelLeftClose },
                      ]}
                    />
                  </div>
                </SettingsSection>

                {/* Language Preference */}
                <SettingsSection
                  icon={Languages}
                  title={t("settings.appearance.languageTitle")}
                  description={t("settings.appearance.languageDesc")}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 px-0.5">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-foreground">
                        {t("settings.appearance.interfaceLanguage")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("settings.appearance.interfaceLanguageDesc")}
                      </div>
                    </div>
                    <LanguageSelector />
                  </div>
                </SettingsSection>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
