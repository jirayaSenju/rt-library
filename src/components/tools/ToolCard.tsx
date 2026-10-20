import React from "react";
import { ArrowLeftRight, Cpu, KeyRound, ExternalLink, HelpCircle } from "lucide-react";
import { ToolDefinition } from "@/types/tools";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { openToolExternal } from "@/platform/shell";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  tool: ToolDefinition;
  className?: string;
}

const ICON_MAP = {
  ArrowLeftRight,
  Cpu,
  KeyRound,
};

export const ToolCard: React.FC<ToolCardProps> = ({ tool, className }) => {
  const { t } = useI18n();

  const IconComponent = ICON_MAP[tool.icon] || HelpCircle;

  // Extract clean hostname for domain badge
  const hostname = React.useMemo(() => {
    try {
      return new URL(tool.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }, [tool.url]);

  const handleOpen = async () => {
    try {
      const res = await openToolExternal(tool.id, tool.url);
      if (!res.success) {
        toast.error(t("tools.openError"));
      }
    } catch (err) {
      console.error("[TOOLS] Failed to open tool:", err);
      toast.error(t("tools.openError"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  const sourceTypeName = t(`tools.sourceTypes.${tool.sourceType}` as any) || tool.sourceType;
  const descriptionText = t(tool.descriptionKey as any) || "";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpen}
            onKeyDown={handleKeyDown}
            aria-label={`${tool.name} - ${sourceTypeName} (${hostname})`}
            data-testid={`tool-card-${tool.id}`}
            className={cn(
              "group relative flex flex-col justify-between p-4 rounded-xl border border-border bg-card/70 hover:bg-secondary/40 hover:border-primary/40 text-card-foreground shadow-xs transition-all duration-150 cursor-pointer select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              className
            )}
          >
            {/* Top row: Icon + Name + External indicator */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 shadow-2xs group-hover:bg-primary/15 transition-colors">
                  <IconComponent className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                    {tool.name}
                  </h3>
                  <span className="text-[10px] text-muted-foreground font-mono truncate block">
                    {hostname}
                  </span>
                </div>
              </div>

              <div className="p-1.5 rounded-md text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors shrink-0">
                <ExternalLink className="h-4 w-4" />
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed my-3 line-clamp-2">
              {descriptionText}
            </p>

            {/* Meta Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
              <Badge
                variant="outline"
                className="border-border/80 bg-secondary/50 text-foreground/80 font-normal text-[10px] px-2 py-0.5 rounded-md"
              >
                {sourceTypeName}
              </Badge>

              <span className="text-[10px] text-muted-foreground group-hover:text-primary font-medium transition-colors">
                {t("tools.openInBrowser")} ↗
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <span>{tool.url}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

