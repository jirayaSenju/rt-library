import React, { useState, useMemo } from "react"
import { Search, Check, ChevronDown, ChevronUp, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

export interface FacetOption {
  value: string
  label?: string
  count?: number
}

interface FacetMultiSelectProps {
  label: string
  options: FacetOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
  isLoading?: boolean
  defaultExpanded?: boolean
  ariaLabel?: string
}

export const FacetMultiSelect: React.FC<FacetMultiSelectProps> = ({
  label,
  options,
  selected = [],
  onChange,
  searchable = true,
  searchPlaceholder,
  emptyText,
  isLoading = false,
  defaultExpanded = false,
  ariaLabel,
}) => {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || selected.length > 0)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const query = searchQuery.toLowerCase().trim()
    return options.filter(
      (opt) =>
        opt.value.toLowerCase().includes(query) ||
        (opt.label && opt.label.toLowerCase().includes(query))
    )
  }, [options, searchQuery])

  const handleToggleOption = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((item) => item !== val))
    } else {
      onChange([...selected, val])
    }
  }

  const handleClearSelected = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  return (
    <div className="border border-border bg-card/40 rounded-lg overflow-hidden transition-colors">
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-2.5 text-left text-xs font-medium text-foreground hover:text-primary hover:bg-secondary/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-expanded={isExpanded}
        aria-label={ariaLabel || label}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate">{label}</span>
          {selected.length > 0 && (
            <Badge
              variant="secondary"
              className="h-4 px-1.5 bg-primary/20 text-primary font-semibold text-[10px] rounded-full shrink-0"
            >
              {selected.length}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {selected.length > 0 && (
            <span
              onClick={handleClearSelected}
              className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
              title={t("filters.clearSelection") || "Clear"}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onChange([])
                }
              }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-2 pt-0 border-t border-border/60 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {searchable && options.length > 5 && (
            <div className="relative mt-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder={searchPlaceholder || t("filters.searchPlaceholder") || "Search..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-8 pr-2.5 text-xs bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground rounded-md focus-visible:ring-ring"
              />
            </div>
          )}

          {isLoading ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              {t("common.loading") || "Loading..."}
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="py-2.5 text-center text-[11px] text-muted-foreground">
              {emptyText || t("filters.noOptionsFound") || "No options found"}
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
              {filteredOptions.map((opt) => {
                const isChecked = selected.includes(opt.value)
                const displayLabel = opt.label || opt.value

                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer select-none transition-colors group",
                      isChecked
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div
                        className={cn(
                          "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isChecked
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border bg-card group-hover:border-primary/50"
                        )}
                      >
                        {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>
                      <span className="truncate">{displayLabel}</span>
                    </div>

                    {typeof opt.count === "number" && (
                      <span
                        className={cn(
                          "text-[10px] tabular-nums shrink-0 px-1 py-0.2 rounded font-mono",
                          isChecked ? "text-primary font-semibold" : "text-muted-foreground"
                        )}
                      >
                        {opt.count}
                      </span>
                    )}

                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isChecked}
                      onChange={() => handleToggleOption(opt.value)}
                    />
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
