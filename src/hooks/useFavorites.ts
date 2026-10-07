import { useState, useEffect, useCallback } from "react"
import { nativeLibraryService } from "@/services/nativeLibrary"
import { toast } from "sonner"
import { useI18n } from "@/i18n"

export function useFavorites() {
  const { t } = useI18n()
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  const loadFavorites = useCallback(async () => {
    try {
      const res = await nativeLibraryService.getItems({ favoritesOnly: true, limit: 10000 })
      const ids = new Set(res.items.map((i) => i.id))
      setFavorites(ids)
    } catch (err) {
      console.error("Error loading favorites:", err)
    }
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const toggleFavorite = useCallback(
    async (itemId: string, title?: string) => {
      try {
        const res = await nativeLibraryService.toggleFavorite(itemId)
        const isFav = res.isFavorite

        setFavorites((prev) => {
          const next = new Set(prev)
          if (isFav) {
            next.add(itemId)
          } else {
            next.delete(itemId)
          }
          return next
        })

        if (isFav) {
          toast.success(t("catalog.addedToFavoritesToast", { title: title || t("common.item") }))
        } else {
          toast.info(t("catalog.removedFromFavoritesToast"))
        }

        return isFav
      } catch (err) {
        console.error("Failed to toggle favorite:", err)
        toast.error(t("catalog.favoriteErrorToast"))
        return false
      }
    },
    [t]
  )
  const setFavoritesBatch = useCallback(
    async (itemIds: string[], isFavorite: boolean) => {
      if (itemIds.length === 0) return true
      try {
        const res = await nativeLibraryService.setFavorites(itemIds, isFavorite)
        if (res.success) {
          setFavorites((prev) => {
            const next = new Set(prev)
            for (const id of itemIds) {
              if (isFavorite) {
                next.add(id)
              } else {
                next.delete(id)
              }
            }
            return next
          })
          return true
        }
        return false
      } catch (err) {
        console.error("Failed to batch update favorites:", err)
        return false
      }
    },
    []
  )

  return {
    favorites,
    isFavorite: (id: string) => favorites.has(id),
    toggleFavorite,
    setFavoritesBatch,
    reloadFavorites: loadFavorites,
  }
}
