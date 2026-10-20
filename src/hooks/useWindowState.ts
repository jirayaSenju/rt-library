import { useState, useEffect, useCallback } from "react"

export interface WindowStateHook {
  isMaximized: boolean
  isElectron: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
}

export function useWindowState(): WindowStateHook {
  const [isMaximized, setIsMaximized] = useState(false)
  const isElectron =
    typeof window !== "undefined" &&
    Boolean(
      (window as any).rtLibrary?.window ||
        (window as any).electronAPI?.window ||
        (window as any).rtLibrary?.platform
    )

  useEffect(() => {
    let isMounted = true
    const winAPI =
      (window as any).rtLibrary?.window || (window as any).electronAPI?.window

    if (winAPI?.isMaximized) {
      winAPI
        .isMaximized()
        .then((max: boolean) => {
          if (isMounted) setIsMaximized(Boolean(max))
        })
        .catch(() => {})
    }

    if (winAPI?.onMaximizedChange) {
      const unsubscribe = winAPI.onMaximizedChange((max: boolean) => {
        if (isMounted) setIsMaximized(Boolean(max))
      })
      return () => {
        isMounted = false
        if (typeof unsubscribe === "function") {
          unsubscribe()
        }
      }
    }
  }, [])

  const minimize = useCallback(() => {
    const winAPI =
      (window as any).rtLibrary?.window || (window as any).electronAPI?.window
    winAPI?.minimize?.()
  }, [])

  const toggleMaximize = useCallback(() => {
    const winAPI =
      (window as any).rtLibrary?.window || (window as any).electronAPI?.window
    if (winAPI?.toggleMaximize) {
      winAPI.toggleMaximize()
    } else {
      // Fallback for tests / browser simulation
      setIsMaximized((prev) => !prev)
    }
  }, [])

  const close = useCallback(() => {
    const winAPI =
      (window as any).rtLibrary?.window || (window as any).electronAPI?.window
    winAPI?.close?.()
  }, [])

  return {
    isMaximized,
    isElectron,
    minimize,
    toggleMaximize,
    close,
  }
}

