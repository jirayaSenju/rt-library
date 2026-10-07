import React, { useState, useRef, useEffect, useMemo } from "react"
import { ThemeId, THEMES, THEME_IDS, AppTheme } from "@/theme/themes"
import { useI18n } from "@/i18n"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronDown, Search, Sparkles, Terminal, Heart } from "lucide-react"
import { cn } from "@/lib/utils"

export interface GlobalThemeSelectorProps {
  selectedThemeId: ThemeId
  previewThemeId?: ThemeId | null
  onPreviewTheme: (themeId: ThemeId | null) => void
  onSelectTheme: (themeId: ThemeId) => void
  className?: string
}

export const GlobalThemeSelector: React.FC<GlobalThemeSelectorProps> = ({
  selectedThemeId,
  previewThemeId,
  onPreviewTheme,
  onSelectTheme,
  className,
}) => {
  const { t, locale } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const activeTheme = THEMES[selectedThemeId] || THEMES["rt-dark"]
  const currentPreviewTheme = (previewThemeId && THEMES[previewThemeId]) || activeTheme

  const groups: { key: string; label: string; icon: React.FC<{ className?: string }>; themes: AppTheme[] }[] = useMemo(() => [
    {
      key: "builtin",
      label: t("settings.appearance.builtinThemes") || "RT Default",
      icon: Sparkles,
      themes: [THEMES["rt-dark"], THEMES["rt-light"]].filter(Boolean),
    },
    {
      key: "terminal",
      label: t("settings.appearance.terminalThemes") || "Terminal Color Schemes",
      icon: Terminal,
      themes: [
        THEMES["dracula"],
        THEMES["nord"],
        THEMES["gruvbox-dark"],
        THEMES["catppuccin-mocha"],
        THEMES["tokyo-night"],
        THEMES["eco-green"],
        THEMES["eco-red"],
      ].filter(Boolean),
    },
    {
      key: "community",
      label: t("settings.appearance.communityThemes") || "Community & Identity",
      icon: Heart,
      themes: [
        THEMES["pride"],
        THEMES["trans-pride"],
        THEMES["bi-pride"],
        THEMES["lesbian-pride"],
        THEMES["nonbinary-pride"],
      ].filter(Boolean),
    },
  ], [t])

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const isFiltering = normalizedQuery.length > 0

  const filteredThemes: AppTheme[] = useMemo(() => {
    if (!isFiltering) return []
    return THEME_IDS.map((id) => THEMES[id]).filter(
      (th): th is AppTheme =>
        Boolean(
          th &&
          (th.name.toLowerCase().includes(normalizedQuery) ||
            th.id.toLowerCase().includes(normalizedQuery) ||
            th.group.toLowerCase().includes(normalizedQuery))
        )
    )
  }, [isFiltering, normalizedQuery])

  const availableThemes: AppTheme[] = useMemo(() => {
    if (isFiltering) {
      return filteredThemes
    }
    return groups.flatMap((g) => g.themes)
  }, [isFiltering, filteredThemes, groups])

  useEffect(() => {
    if (isOpen) {
      const idx = availableThemes.findIndex((th) => th.id === selectedThemeId)
      setHighlightedIndex(idx >= 0 ? idx : 0)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setSearchQuery("")
      setHighlightedIndex(-1)
      onPreviewTheme(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && isFiltering) {
      setHighlightedIndex(availableThemes.length > 0 ? 0 : -1)
      if (availableThemes.length > 0) {
        onPreviewTheme(availableThemes[0].id)
      }
    }
  }, [searchQuery])

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({
        block: "nearest",
      })
    }
  }, [highlightedIndex, isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (availableThemes.length === 0) return
      setHighlightedIndex((prev) => {
        const next = prev < availableThemes.length - 1 ? prev + 1 : 0
        const th = availableThemes[next]
        if (th) onPreviewTheme(th.id)
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (availableThemes.length === 0) return
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : availableThemes.length - 1
        const th = availableThemes[next]
        if (th) onPreviewTheme(th.id)
        return next
      })
    } else if (e.key === "Home") {
      e.preventDefault()
      if (availableThemes.length === 0) return
      setHighlightedIndex(0)
      onPreviewTheme(availableThemes[0].id)
    } else if (e.key === "End") {
      e.preventDefault()
      if (availableThemes.length === 0) return
      const last = availableThemes.length - 1
      setHighlightedIndex(last)
      onPreviewTheme(availableThemes[last].id)
    } else if (e.key === "Enter" || e.key === " ") {
      if (e.target instanceof HTMLInputElement && e.key === " ") {
        // Allow space typing inside input
        return
      }
      if (highlightedIndex >= 0 && highlightedIndex < availableThemes.length) {
        e.preventDefault()
        const selected = availableThemes[highlightedIndex]
        onSelectTheme(selected.id)
        setIsOpen(false)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onPreviewTheme(null)
      setIsOpen(false)
    }
  }

  const renderSwatches = (th: AppTheme) => {
    if (th.decorativeGradient) {
      return (
        <div
          aria-hidden="true"
          className="h-3 w-6 rounded-xs shrink-0 border border-black/30 shadow-xs"
          style={{ background: th.decorativeGradient }}
        />
      )
    }
    return (
      <div aria-hidden="true" className="flex items-center gap-1 shrink-0">
        <span
          className="h-2.5 w-2.5 rounded-full border border-black/30 shadow-xs"
          style={{ backgroundColor: th.preview.bg }}
          title="Background"
        />
        <span
          className="h-2.5 w-2.5 rounded-full border border-black/30 shadow-xs"
          style={{ backgroundColor: th.preview.surface }}
          title="Surface"
        />
        <span
          className="h-2.5 w-2.5 rounded-full border border-black/30 shadow-xs"
          style={{ backgroundColor: th.preview.accent }}
          title="Accent"
        />
        <span
          className="h-2.5 w-2.5 rounded-full border border-black/30 shadow-xs"
          style={{ backgroundColor: th.preview.text }}
          title="Text"
        />
      </div>
    )
  }

  const renderThemeItem = (th: AppTheme) => {
    const isSelected = th.id === selectedThemeId
    const itemIndex = availableThemes.findIndex((item) => item.id === th.id)
    const isHighlighted = highlightedIndex >= 0 && highlightedIndex === itemIndex
    const isPreviewing = previewThemeId === th.id || isHighlighted

    return (
      <button
        key={th.id}
        ref={(el) => {
          if (itemIndex !== -1) {
            itemRefs.current[itemIndex] = el
          }
        }}
        type="button"
        role="option"
        aria-label={th.name}
        aria-selected={isSelected}
        tabIndex={0}
        onClick={() => {
          onSelectTheme(th.id)
          setIsOpen(false)
        }}
        onMouseEnter={() => {
          if (itemIndex !== -1) setHighlightedIndex(itemIndex)
          onPreviewTheme(th.id)
        }}
        onMouseLeave={() => {
          // Keep active preview or return to current highlighted
        }}
        onFocus={() => {
          if (itemIndex !== -1) setHighlightedIndex(itemIndex)
          onPreviewTheme(th.id)
        }}
        onBlur={() => {
          // Retain preview
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation()
            e.preventDefault()
            onSelectTheme(th.id)
            setIsOpen(false)
          }
        }}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors text-left outline-none cursor-pointer select-none",
          isSelected
            ? "bg-primary/20 text-foreground font-semibold ring-1 ring-primary/40"
            : isHighlighted || isPreviewing
            ? "bg-secondary text-foreground ring-1 ring-primary/30"
            : "text-foreground hover:bg-secondary/70"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {renderSwatches(th)}
          <span className="truncate text-xs">{th.name}</span>
        </div>
        {isSelected && (
          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
      </button>
    )
  }

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={t("settings.appearance.appTheme")}
            className="flex items-center justify-between gap-2 w-[210px] sm:w-[230px] h-9 px-2.5 py-1.5 rounded-md border border-border bg-card text-foreground text-xs shadow-xs hover:bg-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary transition-all text-left"
          >
            <div className="flex items-center gap-2 truncate min-w-0">
              {renderSwatches(currentPreviewTheme)}
              <span className="font-semibold text-xs text-foreground truncate">
                {currentPreviewTheme.name}
              </span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          onKeyDown={handleKeyDown}
          onWheel={(e) => e.stopPropagation()}
          className="w-[280px] p-2 bg-popover text-popover-foreground border-border shadow-xl rounded-xl flex flex-col gap-1.5 z-50 overscroll-contain"
        >
          {/* Search Box */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-card/60">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings.appearance.searchThemesPlaceholder") || "Search themes..."}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Theme List */}
          <div
            role="listbox"
            aria-label="Available themes"
            onWheel={(e) => e.stopPropagation()}
            className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar pt-1 overscroll-contain select-none"
          >
            {isFiltering ? (
              filteredThemes.length > 0 ? (
                <div className="space-y-0.5">
                  {filteredThemes.map((th) => renderThemeItem(th))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t("settings.appearance.noThemesFound")}
                </div>
              )
            ) : (
              groups.map((group) => (
                <div key={group.key} className="space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <group.icon className="h-3 w-3 text-primary" />
                    <span>{group.label}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded-full bg-secondary text-muted-foreground font-mono ml-auto">
                      {group.themes.length}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.themes.map((th) => renderThemeItem(th))}
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
