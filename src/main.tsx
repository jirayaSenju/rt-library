import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { I18nProvider } from "@/i18n"
import { resolveThemeId, applyTheme } from "@/theme/themes"
import { STORAGE_KEY } from "@/hooks/useTheme"
import "./index.css"

// Apply theme immediately to prevent flash
try {
  const initialThemeId = resolveThemeId(localStorage.getItem(STORAGE_KEY))
  applyTheme(initialThemeId)
} catch (_) {}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

