import React from "react"
import { LucideIcon, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

export interface AppearanceSegmentedControlProps<T extends string> {
  label: string
  description?: string
  options: SegmentedOption<T>[]
  value: T
  onChange?: (val: T) => void
  icon?: LucideIcon
  ariaLabel?: string
  className?: string
}

export function AppearanceSegmentedControl<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  icon: Icon,
  ariaLabel,
  className,
}: AppearanceSegmentedControlProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onChange || options.length === 0) return
    const currentIndex = options.findIndex((opt) => opt.value === value)
    if (currentIndex === -1) return

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % options.length
      onChange(options[nextIndex].value)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + options.length) % options.length
      onChange(options[prevIndex].value)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 border-b border-border/40 last:border-0",
        className
      )}
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          {Icon && <Icon className="h-3.5 w-3.5 text-primary shrink-0" />}
          <span className="truncate">{label}</span>
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground leading-tight">
            {description}
          </p>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={ariaLabel || label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="inline-flex p-1 rounded-lg bg-secondary/50 border border-border/60 gap-1 shrink-0 self-start sm:self-auto focus:outline-hidden focus:ring-1 focus:ring-primary/50"
      >
        {options.map((option) => {
          const isSelected = option.value === value
          const OptionIcon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-label={option.label}
              aria-checked={isSelected}
              onClick={() => onChange?.(option.value)}
              className={cn(
                "h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-all select-none",
                isSelected
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-semibold text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/40"
              )}
            >
              {OptionIcon && (
                <OptionIcon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                />
              )}
              <span>{option.label}</span>
              {isSelected && <Check className="h-3 w-3 text-primary ml-0.5 shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

