import React, { useState, useRef, useEffect, useMemo } from "react"
import { ProgressThemeId, PROGRESS_THEMES, PROGRESS_THEME_IDS, ProgressTheme } from "@/theme/progressThemes"
import { useI18n } from "@/i18n"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ProgressMascot } from "@/components/layout/ProgressMascot"
import { Check, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProgressThemeSelectorProps {
  selectedThemeId: ProgressThemeId
  previewThemeId?: ProgressThemeId | null
  onPreviewTheme: (themeId: ProgressThemeId | null) => void
  onSelectTheme: (themeId: ProgressThemeId) => void
  className?: string
}

export const ProgressThemeSelector: React.FC<ProgressThemeSelectorProps> = ({
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

  const activeTheme = PROGRESS_THEMES[selectedThemeId] || PROGRESS_THEMES["nyan-cat"]
  const currentPreviewTheme = (previewThemeId && PROGRESS_THEMES[previewThemeId]) || activeTheme

  const getLocalizedName = (id: ProgressThemeId): string => {
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

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const isFiltering = normalizedQuery.length > 0

  const filteredThemes: ProgressThemeId[] = useMemo(() => {
    if (!isFiltering) return PROGRESS_THEME_IDS
    return PROGRESS_THEME_IDS.filter((id) => {
      const theme = PROGRESS_THEMES[id]
      if (!theme) return false
      const localizedName = getLocalizedName(id).toLowerCase()
      return (
        localizedName.includes(normalizedQuery) ||
        theme.name.toLowerCase().includes(normalizedQuery) ||
        theme.mascot.name.toLowerCase().includes(normalizedQuery) ||
        theme.description.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [isFiltering, normalizedQuery, t])

  useEffect(() => {
    if (isOpen) {
      const idx = filteredThemes.findIndex((id) => id === selectedThemeId)
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
      setHighlightedIndex(filteredThemes.length > 0 ? 0 : -1)
      if (filteredThemes.length > 0) {
        onPreviewTheme(filteredThemes[0])
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
      if (filteredThemes.length === 0) return
      setHighlightedIndex((prev) => {
        const next = prev < filteredThemes.length - 1 ? prev + 1 : 0
        const id = filteredThemes[next]
        if (id) onPreviewTheme(id)
        return next
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (filteredThemes.length === 0) return
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : filteredThemes.length - 1
        const id = filteredThemes[next]
        if (id) onPreviewTheme(id)
        return next
      })
    } else if (e.key === "Home") {
      e.preventDefault()
      if (filteredThemes.length === 0) return
      setHighlightedIndex(0)
      onPreviewTheme(filteredThemes[0])
    } else if (e.key === "End") {
      e.preventDefault()
      if (filteredThemes.length === 0) return
      const last = filteredThemes.length - 1
      setHighlightedIndex(last)
      onPreviewTheme(filteredThemes[last])
    } else if (e.key === "Enter" || e.key === " ") {
      if (e.target instanceof HTMLInputElement && e.key === " ") {
        return
      }
      if (highlightedIndex >= 0 && highlightedIndex < filteredThemes.length) {
        e.preventDefault()
        const selected = filteredThemes[highlightedIndex]
        onSelectTheme(selected)
        setIsOpen(false)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onPreviewTheme(null)
      setIsOpen(false)
    }
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
            aria-label={t("settings.appearance.progressStyle")}
            className="flex items-center justify-between gap-2 w-[210px] sm:w-[230px] h-9 px-2.5 py-1.5 rounded-md border border-border bg-card text-foreground text-xs shadow-xs hover:bg-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary transition-all text-left"
          >
            <div className="flex items-center gap-2 truncate min-w-0 flex-1">
              <span aria-hidden="true" className="text-sm shrink-0 leading-none">
                {currentPreviewTheme.mascot.value}
              </span>
              <span className="font-semibold text-xs text-foreground truncate">
                {getLocalizedName(currentPreviewTheme.id)}
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
          className="w-[290px] sm:w-[310px] p-2 bg-popover text-popover-foreground border-border shadow-xl rounded-xl flex flex-col gap-1.5 z-50 overscroll-contain"
        >
          {/* Search Box */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-card/60">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings.appearance.searchProgressPlaceholder")}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Progress Themes List */}
          <div
            role="listbox"
            aria-label="Available progress themes"
            onWheel={(e) => e.stopPropagation()}
            className="max-h-[300px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar pt-1 overscroll-contain select-none"
          >
            {filteredThemes.length > 0 ? (
              filteredThemes.map((pThemeId, idx) => {
                const pTheme = PROGRESS_THEMES[pThemeId]
                if (!pTheme) return null
                const isSelected = pTheme.id === selectedThemeId
                const isHighlighted = highlightedIndex === idx
                const isPreviewing = previewThemeId === pTheme.id || isHighlighted
                const themeName = getLocalizedName(pTheme.id)

                return (
                  <button
                    key={pTheme.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el
                    }}
                    type="button"
                    role="option"
                    aria-label={themeName}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => {
                      onSelectTheme(pTheme.id)
                      setIsOpen(false)
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(idx)
                      onPreviewTheme(pTheme.id)
                    }}
                    onFocus={() => {
                      setHighlightedIndex(idx)
                      onPreviewTheme(pTheme.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation()
                        e.preventDefault()
                        onSelectTheme(pTheme.id)
                        setIsOpen(false)
                      }
                    }}
                    className={cn(
                      "w-full flex flex-col justify-between gap-1 px-2.5 py-1.5 rounded-lg border transition-all text-left outline-none cursor-pointer select-none",
                      isSelected
                        ? "border-primary bg-primary/15 text-foreground font-semibold ring-1 ring-primary/40"
                        : isHighlighted || isPreviewing
                        ? "border-primary/60 bg-secondary text-foreground ring-1 ring-primary/25"
                        : "border-border/60 bg-card/40 text-foreground hover:bg-secondary/70"
                    )}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs font-semibold truncate text-foreground">
                        {themeName}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </div>

                    {/* Mini Progress Track Preview */}
                    <div className="relative flex items-center w-full py-0.5 pointer-events-none">
                      <div
                        className="w-full h-2 rounded-full overflow-hidden relative border border-border/40"
                        style={{
                          backgroundColor: pTheme.isDefault ? undefined : pTheme.trackBg,
                          borderColor: pTheme.isDefault ? undefined : pTheme.trackBorder,
                        }}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            pTheme.isDefault && "bg-primary",
                            pTheme.hasAnimation && (isHighlighted || isSelected || isPreviewing) && "animate-progress-rainbow"
                          )}
                          style={{
                            width: "65%",
                            background: pTheme.isDefault ? undefined : pTheme.fillBackground,
                            backgroundSize: pTheme.fillBackgroundSize,
                            boxShadow: pTheme.isDefault ? undefined : pTheme.glow,
                          }}
                        />
                      </div>

                      <div className="absolute inset-x-0 inset-y-0 pointer-events-none flex items-center overflow-visible">
                        <ProgressMascot
                          theme={pTheme}
                          percent={65}
                          state="running"
                          size="sm"
                          isStatic={!isHighlighted && !isSelected && !isPreviewing}
                        />
                      </div>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {t("settings.appearance.noProgressThemesFound")}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
