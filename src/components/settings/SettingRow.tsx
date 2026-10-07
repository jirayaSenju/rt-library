import React from "react"
import { cn } from "@/lib/utils"

export interface SettingRowProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  divider?: boolean
}

export const SettingRow: React.FC<SettingRowProps> = ({
  title,
  description,
  children,
  className,
  divider = false,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        divider && "pt-3 border-t border-border/50",
        className
      )}
    >
      <div className="space-y-0.5 flex-1 pr-3">
        <span className="text-xs font-semibold text-foreground block">
          {title}
        </span>
        {description && (
          <p className="text-[11px] text-muted-foreground leading-normal">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
