import React, { useState, useEffect, useMemo } from "react"
import { Category } from "@/types"
import { useI18n } from "@/i18n"
import appLogo from "@/assets/app-icon.png"
import { 
  Library, 
  Star, 
  ChevronDown, 
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarProps {
  categories: Category[]
  selectedCategory: string
  onSelectCategory: (id: string) => void
  totalItemsCount: number
  favoritesCount: number
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onOpenSettings?: () => void
}

interface PlatformGroup {
  id: string
  name: string
  iconLetter: string
  categories: Category[]
  totalCount: number
}

function groupCategories(categories: Category[], t: (key: string) => string): PlatformGroup[] {
  const groups: { [key: string]: PlatformGroup } = {
    nintendo: { id: "nintendo", name: t("categories.groups.nintendo"), iconLetter: "N", categories: [], totalCount: 0 },
    playstation: { id: "playstation", name: t("categories.groups.playstation"), iconLetter: "P", categories: [], totalCount: 0 },
    xbox: { id: "xbox", name: t("categories.groups.xbox"), iconLetter: "X", categories: [], totalCount: 0 },
    sega: { id: "sega", name: t("categories.groups.sega"), iconLetter: "S", categories: [], totalCount: 0 },
    other: { id: "other", name: t("categories.groups.other"), iconLetter: "✦", categories: [], totalCount: 0 },
  }

  for (const cat of categories) {
    const id = cat.id.toLowerCase()
    const name = cat.name.toLowerCase()

    if (
      id.includes("switch") ||
      id.includes("wii") ||
      id.includes("gamecube") ||
      id === "ds" ||
      id === "3ds" ||
      name.includes("nintendo") ||
      name.includes("switch") ||
      name.includes("wii") ||
      name.includes("gamecube") ||
      name.includes("3ds") ||
      name.includes("game boy")
    ) {
      groups.nintendo.categories.push(cat)
      groups.nintendo.totalCount += cat.count
    } else if (
      id.startsWith("ps") ||
      name.includes("playstation") ||
      name.includes("ps1") ||
      name.includes("ps2") ||
      name.includes("ps3") ||
      name.includes("ps4") ||
      name.includes("ps5") ||
      name.includes("psp") ||
      name.includes("vita")
    ) {
      groups.playstation.categories.push(cat)
      groups.playstation.totalCount += cat.count
    } else if (id.includes("xbox") || name.includes("xbox")) {
      groups.xbox.categories.push(cat)
      groups.xbox.totalCount += cat.count
    } else if (
      id.includes("dreamcast") ||
      id.includes("sega") ||
      id.includes("saturn") ||
      id.includes("genesis") ||
      name.includes("sega") ||
      name.includes("dreamcast")
    ) {
      groups.sega.categories.push(cat)
      groups.sega.totalCount += cat.count
    } else {
      groups.other.categories.push(cat)
      groups.other.totalCount += cat.count
    }
  }

  return [groups.nintendo, groups.playstation, groups.xbox, groups.sega, groups.other].filter(
    (g) => g.categories.length > 0
  )
}

function getPlatformAbbreviation(name: string, id: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes("switch")) return "NSW"
  if (lowerName.includes("wii u")) return "WIIU"
  if (lowerName.includes("wii")) return "WII"
  if (lowerName.includes("gamecube")) return "GC"
  if (lowerName.includes("3ds")) return "3DS"
  if (lowerName.includes("ds")) return "NDS"
  if (lowerName.includes("playstation 5") || id === "ps5") return "PS5"
  if (lowerName.includes("playstation 4") || id === "ps4") return "PS4"
  if (lowerName.includes("playstation 3") || id === "ps3") return "PS3"
  if (lowerName.includes("playstation 2") || id === "ps2") return "PS2"
  if (lowerName.includes("playstation 1") || id === "psx" || id === "ps1") return "PS1"
  if (lowerName.includes("portable") || id === "psp") return "PSP"
  if (lowerName.includes("vita") || id === "psvita") return "PSV"
  if (lowerName.includes("360") || id === "xbox360") return "X360"
  if (lowerName.includes("original xbox") || id === "xbox") return "XBOX"
  if (lowerName.includes("dreamcast") || id === "dreamcast") return "DC"
  return name.slice(0, 3).toUpperCase()
}

export const Sidebar: React.FC<SidebarProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  totalItemsCount,
  favoritesCount,
  isCollapsed = false,
  onToggleCollapse,
  onOpenSettings,
}) => {
  const { t, formatNumber } = useI18n()
  const platformGroups = useMemo(() => groupCategories(categories, t), [categories, t])

  // Track expanded groups in accordion (collapsed by default)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  // Ensure the group containing the selected category is open
  useEffect(() => {
    for (const group of platformGroups) {
      if (group.categories.some((c) => c.id === selectedCategory)) {
        setExpandedGroups((prev) => ({ ...prev, [group.id]: true }))
        break
      }
    }
  }, [selectedCategory, platformGroups])

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "bg-card border-r border-border flex flex-col h-screen shrink-0 select-none transition-all duration-300 ease-in-out",
          isCollapsed ? "w-[68px]" : "w-64"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "p-3.5 border-b border-border flex items-center shrink-0",
            isCollapsed ? "justify-center flex-col gap-2" : "justify-between"
          )}
        >
          <div className="flex items-center space-x-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center p-1 shadow-sm shadow-primary/10 shrink-0 overflow-hidden">
              <img src={appLogo} alt="RT Library Logo" className="h-7 w-7 object-contain drop-shadow-sm select-none pointer-events-none" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden">
                <h1 className="font-bold text-sm tracking-tight text-foreground leading-none truncate">
                  RT Library
                </h1>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wide">
                  LOCAL CATALOG
                </span>
              </div>
            )}
          </div>

          <div className={cn("flex items-center", isCollapsed ? "flex-col gap-1 mt-1" : "gap-1")}>
            {onOpenSettings && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 rounded-lg"
                    onClick={onOpenSettings}
                    aria-label={t("topbar.settingsTooltip")}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={isCollapsed ? "right" : "bottom"}>
                  {t("topbar.settingsTooltip")}
                </TooltipContent>
              </Tooltip>
            )}

            {onToggleCollapse && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 rounded-lg"
                    onClick={onToggleCollapse}
                    aria-label={isCollapsed ? t("navigation.expandSidebar") : t("navigation.collapseSidebar")}
                  >
                    {isCollapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side={isCollapsed ? "right" : "bottom"}>
                  {isCollapsed ? t("navigation.expandSidebar") : t("navigation.collapseSidebar")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Top Navigation: All Games & Favorites */}
        <div className={cn("p-2 space-y-1 border-b border-border shrink-0", isCollapsed && "px-1.5")}>
          {isCollapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectCategory("all")}
                    className={cn(
                      "w-full h-10 flex items-center justify-center rounded-lg transition-colors",
                      selectedCategory === "all"
                        ? "bg-primary/20 text-primary border border-primary/40 font-semibold shadow-sm"
                        : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                    )}
                    aria-label={t("navigation.allGamesAria", { count: formatNumber(totalItemsCount) })}
                  >
                    <Library className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t("navigation.allItems")} ({formatNumber(totalItemsCount)})
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectCategory("favorites")}
                    className={cn(
                      "w-full h-10 flex items-center justify-center rounded-lg transition-colors",
                      selectedCategory === "favorites"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 font-semibold shadow-sm"
                        : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                    )}
                    aria-label={t("navigation.favoritesAria", { count: formatNumber(favoritesCount) })}
                  >
                    <Star className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t("navigation.favorites")} ({formatNumber(favoritesCount)})
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <button
                onClick={() => onSelectCategory("all")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  selectedCategory === "all"
                    ? "bg-primary/20 text-primary border border-primary/40 font-semibold shadow-sm"
                    : "text-foreground/90 hover:bg-secondary hover:text-foreground"
                )}
              >
                <div className="flex items-center space-x-2.5">
                  <Library className="h-4 w-4" />
                  <span>{t("navigation.allGames")}</span>
                </div>
                <Badge variant="outline" className="border-border bg-secondary text-foreground text-[10px] font-mono px-1.5 py-0.5">
                  {formatNumber(totalItemsCount)}
                </Badge>
              </button>

              <button
                onClick={() => onSelectCategory("favorites")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  selectedCategory === "favorites"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 font-semibold shadow-sm"
                    : "text-foreground/90 hover:bg-secondary hover:text-foreground"
                )}
              >
                <div className="flex items-center space-x-2.5">
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400/20" />
                  <span>{t("navigation.favorites")}</span>
                </div>
                <Badge variant="outline" className="border-border bg-secondary text-amber-400 font-mono text-[10px] px-1.5 py-0.5 font-medium">
                  {formatNumber(favoritesCount)}
                </Badge>
              </button>
            </>
          )}
        </div>

        {/* Section Header */}
        {!isCollapsed && (
          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between text-[11px] font-semibold text-foreground/80 uppercase tracking-wider shrink-0">
            <span>{t("navigation.platforms")}</span>
            <span className="text-[10px] text-muted-foreground font-mono">{categories.length}</span>
          </div>
        )}

        {/* Platform Groups List */}
        <div className={cn("flex-1 overflow-y-auto space-y-1 custom-scrollbar", isCollapsed ? "p-1.5 space-y-2" : "px-2 py-1")}>
          {isCollapsed ? (
            // Collapsed: Render platform abbreviation buttons with tooltips
            platformGroups.map((group) => (
              <div key={group.id} className="space-y-1 pb-2 border-b border-border/60 last:border-0">
                <div className="text-[9px] font-bold text-muted-foreground text-center uppercase tracking-tighter">
                  {group.iconLetter}
                </div>
                {group.categories.map((cat) => {
                  const isSelected = selectedCategory === cat.id
                  const abbr = getPlatformAbbreviation(cat.name, cat.id)
                  return (
                    <Tooltip key={cat.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSelectCategory(cat.id)}
                          aria-label={`${cat.name} (${formatNumber(cat.count)} ${cat.count === 1 ? t("common.game") : t("common.games")})`}
                          className={cn(
                            "w-full h-8 flex items-center justify-center rounded-md text-[10px] font-bold tracking-tight transition-colors",
                            isSelected
                              ? "bg-primary/20 text-primary border border-primary/40 font-semibold shadow-sm"
                              : "text-foreground/80 hover:bg-secondary hover:text-foreground bg-secondary/40 border border-border/60"
                          )}
                        >
                          {abbr}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="font-semibold text-foreground">{cat.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatNumber(cat.count)} {cat.count === 1 ? t("common.game") : t("common.games")}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            ))
          ) : (
            // Expanded: Accordion of platform groups
            platformGroups.map((group) => {
              const isOpen = expandedGroups[group.id] ?? false
              const hasSelectedCategory = group.categories.some((c) => c.id === selectedCategory)

              return (
                <div key={group.id} className="rounded-lg overflow-hidden border border-border/70 bg-card/60">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold transition-colors text-left",
                      hasSelectedCategory
                        ? "text-foreground bg-secondary font-bold"
                        : "text-foreground/85 hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{group.name}</span>
                    </div>
                    <span className="text-[10px] text-foreground font-mono shrink-0 ml-1 bg-secondary px-1.5 py-0.5 rounded border border-border/60 font-medium">
                      {group.totalCount.toLocaleString()}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="py-1 px-1.5 space-y-0.5 border-t border-border/50 bg-card/40">
                      {group.categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id
                        return (
                          <button
                            key={cat.id}
                            onClick={() => onSelectCategory(cat.id)}
                            className={cn(
                              "w-full flex items-center justify-between pl-4 pr-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left",
                              isSelected
                                ? "bg-primary/20 text-primary border border-primary/40 font-semibold shadow-sm"
                                : "text-foreground/85 hover:bg-secondary hover:text-foreground"
                            )}
                          >
                            <span className="truncate pr-2">{cat.name}</span>
                            <span className="text-[10px] text-foreground bg-secondary px-1.5 py-0.5 rounded border border-border shrink-0 font-mono font-medium">
                              {cat.count}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
