import React from "react"
import { AppSettings } from "@/types"
import { Input } from "@/components/ui/input"
import {
  Magnet,
  Terminal,
  Activity,
  CheckCircle2,
  Info,
  Server,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"
import { SettingsSection } from "./SettingsSection"

interface TorrentSettingsProps {
  settings: AppSettings
  onUpdateSettings: (updater: (prev: AppSettings) => AppSettings) => void
}

export const TorrentSettings: React.FC<TorrentSettingsProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { t } = useI18n()
  const isSystemDefault = settings.useSystemDefaultTorrentClient ?? true

  return (
    <div className="space-y-5 max-w-3xl">
      {/* 1. TORRENT CLIENT DISPATCH */}
      <SettingsSection
        icon={Magnet}
        title={t("settings.torrent.clientTitle")}
        description={t("settings.torrent.clientDesc")}
      >
        {/* Client Selection Radio Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() =>
              onUpdateSettings((prev) => ({
                ...prev,
                useSystemDefaultTorrentClient: true,
                torrentClient: "system",
              }))
            }
            className={cn(
              "p-3.5 rounded-xl border text-left transition-all flex items-start gap-3",
              isSystemDefault
                ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
          >
            <div className="h-7 w-7 rounded-lg bg-secondary/80 border border-border flex items-center justify-center text-primary shrink-0 mt-0.5">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground">{t("settings.torrent.systemDefaultTitle")}</span>
                {isSystemDefault && (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {t("settings.torrent.systemDefaultDesc")}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings((prev) => ({
                ...prev,
                useSystemDefaultTorrentClient: false,
                torrentClient: "custom",
              }))
            }
            className={cn(
              "p-3.5 rounded-xl border text-left transition-all flex items-start gap-3",
              !isSystemDefault
                ? "border-primary bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                : "border-border bg-card/60 text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
          >
            <div className="h-7 w-7 rounded-lg bg-secondary/80 border border-border flex items-center justify-center text-primary shrink-0 mt-0.5">
              <Terminal className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-foreground">{t("settings.torrent.customTitle")}</span>
                {!isSystemDefault && (
                  <CheckCircle2 className="h-3 w-3 text-primary" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                {t("settings.torrent.customDesc")}
              </p>
            </div>
          </button>
        </div>

        {/* Custom Executable Path Input */}
        {!isSystemDefault && (
          <div className="space-y-2 pt-3 border-t border-border/60 animate-in fade-in-0 duration-150">
            <label className="text-xs font-semibold text-foreground">
              {t("settings.torrent.binaryPathLabel")}
            </label>
            <Input
              type="text"
              value={settings.torrentClientPath || ""}
              onChange={(e) =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  torrentClientPath: e.target.value,
                }))
              }
              placeholder={t("settings.torrent.binaryPathPlaceholder")}
              className="bg-background/80 border-border text-xs font-mono h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("settings.torrent.binaryPathNote")}
            </p>
          </div>
        )}
      </SettingsSection>

      {/* 2. LAUNCH BEHAVIOR */}
      <SettingsSection
        icon={Activity}
        title={t("settings.torrent.launchBehaviorTitle")}
        description={t("settings.torrent.launchBehaviorDesc")}
      >
        <div className="p-3 border border-border/80 rounded-xl bg-background/80 flex items-start gap-2.5 text-[11px] text-muted-foreground">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <span>
            {isSystemDefault
              ? t("settings.torrent.systemBehaviorNote")
              : `${t("settings.torrent.customBehaviorNote")} ${settings.torrentClientPath || ""}`}
          </span>
        </div>
      </SettingsSection>

      {/* 3. SWARM & TRACKER NETWORKING */}
      <SettingsSection
        icon={Server}
        title={t("settings.torrent.swarmNetworkingTitle")}
        description={t("settings.torrent.swarmNetworkingDesc")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="bg-background/80 p-3 rounded-xl border border-border/80">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {t("settings.torrent.trackerSupportTitle")}
            </span>
            <span className="text-xs font-semibold text-foreground mt-1 block">
              {t("settings.torrent.trackerSupportDesc")}
            </span>
          </div>

          <div className="bg-background/80 p-3 rounded-xl border border-border/80">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
              {t("settings.torrent.backgroundCollectionTitle")}
            </span>
            <span className="text-xs font-semibold text-primary mt-1 block">
              {settings.autoFetchMetadata
                ? t("settings.torrent.backgroundCollectionEnabled")
                : t("settings.torrent.backgroundCollectionManual")}
            </span>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
