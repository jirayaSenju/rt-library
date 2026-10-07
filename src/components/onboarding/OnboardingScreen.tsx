import React, { useState } from "react"
import { Gamepad2, FolderOpen, Database, Sparkles, HardDrive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { openFolderDialog } from "@/services/magnetLauncher"
import { useI18n } from "@/i18n"

interface OnboardingScreenProps {
  onSelectFolder: (path: string) => void
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onSelectFolder }) => {
  const { t } = useI18n()
  const [manualPath, setManualPath] = useState("")
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleBrowseFolder = async () => {
    try {
      const folder = await openFolderDialog()
      if (folder) {
        onSelectFolder(folder)
        return
      }
    } catch (e) {
      console.warn("Native folder dialog error:", e)
    }

    // Fallback: Trigger HTML webkitdirectory input
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const firstFile = files[0]
      // In Webview / Electron / Tauri, File objects have a .path property
      const filePath = (firstFile as any).path
      if (filePath) {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
        if (lastSlash !== -1) {
          const folderPath = filePath.substring(0, lastSlash)
          onSelectFolder(folderPath)
          return
        }
      }
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualPath.trim()) {
      onSelectFolder(manualPath.trim())
    }
  }

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 select-none relative overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        {...({ webkitdirectory: "", directory: "" } as any)}
      />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full bg-neutral-900/90 border border-neutral-800 p-8 rounded-2xl shadow-2xl backdrop-blur-md relative z-10 flex flex-col items-center text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
          <Gamepad2 className="h-9 w-9" />
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
            {t("onboarding.welcomeTitle")}
          </h1>
          <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
            {t("onboarding.welcomeDesc")}
          </p>
        </div>

        <div className="w-full space-y-3 pt-2">
          <Button
            onClick={handleBrowseFolder}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-12 text-sm rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center cursor-pointer"
          >
            <FolderOpen className="h-5 w-5 mr-2" />
            {t("onboarding.selectDirectory")}
          </Button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-neutral-800"></div>
            <span className="flex-shrink mx-4 text-[10px] uppercase font-mono text-neutral-500">
              {t("onboarding.orEnterPath")}
            </span>
            <div className="flex-grow border-t border-neutral-800"></div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <Input
              type="text"
              placeholder={t("onboarding.manualPathPlaceholder")}
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              className="bg-neutral-950 border-neutral-800 text-xs h-10"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!manualPath.trim()}
              className="border-neutral-800 bg-neutral-950 text-neutral-300 hover:text-white h-10 px-4 text-xs shrink-0 cursor-pointer"
            >
              {t("onboarding.loadPathButton")}
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full text-left pt-4 border-t border-neutral-800/80 text-[11px] text-neutral-400">
          <div className="flex items-start space-x-2">
            <HardDrive className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{t("onboarding.offlineSearch")}</span>
          </div>
          <div className="flex items-start space-x-2">
            <Database className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{t("onboarding.zeroOverwrites")}</span>
          </div>
          <div className="flex items-start space-x-2">
            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{t("onboarding.smartIndexing")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
