import { useState, useEffect, useCallback } from "react"
import {
  imageCacheWarmupService,
  CacheWarmupProgress,
  StartCacheWarmupOptions,
} from "@/services/imageCacheWarmup"

export function useImageCacheWarmup() {
  const [progress, setProgress] = useState<CacheWarmupProgress>(() =>
    imageCacheWarmupService.getProgress()
  )

  useEffect(() => {
    return imageCacheWarmupService.subscribe((p) => {
      setProgress(p)
    })
  }, [])

  const start = useCallback((options?: StartCacheWarmupOptions) => {
    return imageCacheWarmupService.start(options)
  }, [])

  const pause = useCallback(() => {
    imageCacheWarmupService.pause()
  }, [])

  const resume = useCallback(() => {
    imageCacheWarmupService.resume()
  }, [])

  const cancel = useCallback(() => {
    imageCacheWarmupService.cancel()
  }, [])

  const reset = useCallback(() => {
    imageCacheWarmupService.reset()
  }, [])

  return {
    ...progress,
    progress,
    start,
    pause,
    resume,
    cancel,
    reset,
    isRunning: progress.status === "running",
    isPaused: progress.status === "paused",
    isCompleted: progress.status === "completed",
    isCancelled: progress.status === "cancelled",
    isIdle: progress.status === "idle",
  }
}

