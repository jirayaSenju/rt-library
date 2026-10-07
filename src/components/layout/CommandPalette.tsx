import React, { useEffect } from "react"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command"
import { LibraryItem, Category } from "@/types"
import { Search, Gamepad2, RefreshCw, Settings, FolderOpen } from "lucide-react"
import { useI18n } from "@/i18n"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LibraryItem[]
  categories: Category[]
  onSelectItem: (item: LibraryItem) => void
  onSelectCategory: (catId: string) => void
  onRefresh: () => void
  onOpenSettings: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  items,
  categories,
  onSelectItem,
  onSelectCategory,
  onRefresh,
  onOpenSettings,
}) => {
  const { t, formatNumber } = useI18n()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onOpenChange])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("commandPalette.placeholder")} />
      <CommandList className="custom-scrollbar">
        <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>

        <CommandGroup heading={t("commandPalette.actionsHeading")}>
          <CommandItem
            onSelect={() => {
              onOpenChange(false)
              onRefresh()
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4 text-primary" />
            <span>{t("commandPalette.refreshAction")}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false)
              onOpenSettings()
            }}
          >
            <Settings className="mr-2 h-4 w-4 text-primary" />
            <span>{t("commandPalette.settingsAction")}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("commandPalette.categoriesHeading")}>
          {categories.map((cat) => (
            <CommandItem
              key={cat.id}
              onSelect={() => {
                onOpenChange(false)
                onSelectCategory(cat.id)
              }}
            >
              <Gamepad2 className="mr-2 h-4 w-4 text-primary" />
              <span>{cat.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t("commandPalette.itemsCount", { count: formatNumber(cat.count) })}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("commandPalette.recentHeading")}>
          {items.slice(0, 30).map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => {
                onOpenChange(false)
                onSelectItem(item)
              }}
            >
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="truncate">{item.canonicalTitle || item.cleanTitle || item.title}</span>
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground uppercase font-mono">
                {item.categoryId}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}


