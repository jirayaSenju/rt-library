import React from "react"
import { useI18n, SUPPORTED_LOCALES, getLocaleDefinition, Locale } from "@/i18n"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"

export interface LanguageSelectorProps {
  className?: string
  triggerClassName?: string
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  className,
  triggerClassName,
}) => {
  const { locale, setLocale, t } = useI18n()
  const currentLocaleDef = getLocaleDefinition(locale)

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Select
        value={locale}
        onValueChange={(val) => setLocale(val as Locale)}
      >
        <SelectTrigger
          aria-label={t("settings.appearance.languageTitle") || "Interface Language"}
          className={cn(
            "w-[190px] sm:w-[210px] h-9 bg-card border-border/80 text-foreground hover:bg-secondary/40 focus:ring-1 focus:ring-primary text-xs",
            triggerClassName
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <span aria-hidden="true" className="text-sm shrink-0 leading-none">
              {currentLocaleDef.flag ? (
                currentLocaleDef.flag
              ) : (
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
            <span className="font-semibold text-xs text-foreground shrink-0 font-mono">
              {currentLocaleDef.shortLabel}
            </span>
            <span className="text-muted-foreground text-xs truncate">
              · {currentLocaleDef.nativeName}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent
          align="end"
          className="w-[260px] max-h-[320px] overflow-y-auto bg-popover text-popover-foreground border-border shadow-xl p-1"
        >
          {SUPPORTED_LOCALES.map((loc) => {
            return (
              <SelectItem
                key={loc.id}
                value={loc.id}
                className="flex items-center justify-between py-2 px-2.5 text-xs rounded-md cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span aria-hidden="true" className="text-base shrink-0 leading-none">
                    {loc.flag || "🌐"}
                  </span>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-xs font-mono">{loc.shortLabel}</span>
                    <span className="text-muted-foreground text-xs truncate">
                      {loc.nativeName}
                    </span>
                  </div>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}

