import React from "react"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SettingsSectionProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  variant?: "default" | "danger"
  className?: string
  children: React.ReactNode
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
  className,
  children,
}) => {
  const isDanger = variant === "danger"

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-colors space-y-3",
        isDanger
          ? "border-destructive/30 bg-destructive/5"
          : "border-border/70 bg-card/40 hover:border-border",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {Icon && (
            <div
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border",
                isDanger
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border/60 bg-secondary/60 text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
          <div className="space-y-0.5">
            <h4
              className={cn(
                "text-xs font-bold uppercase tracking-wider",
                isDanger ? "text-destructive" : "text-foreground"
              )}
            >
              {title}
            </h4>
            {description && (
              <p className="text-[11px] text-muted-foreground leading-normal">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className="pt-1">{children}</div>
    </div>
  )
}
