import React from "react";
import { Wrench, ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n";
import { ToolCard } from "./ToolCard";
import { BUILTIN_TOOLS_REGISTRY } from "./toolsRegistry";

export const ToolsView: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-background">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Simple Minimalist Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-2xs">
              <Wrench className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("tools.title")}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            {t("tools.subtitle")}
          </p>
        </div>

        {/* Responsive Tools Grid (2-3 columns on desktop) */}
        <div
          data-testid="tools-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1"
        >
          {BUILTIN_TOOLS_REGISTRY.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>

        {/* Discreet Disclaimer & Third-Party Warning */}
        <div className="pt-6 border-t border-border/60">
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border/70 bg-card/40 text-muted-foreground text-xs leading-relaxed">
            <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px]">
              <p>{t("tools.disclaimer")}</p>
              <p className="text-muted-foreground/80">{t("tools.disclaimerAuth")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

