import { useCallback, useEffect, useRef, useState } from 'react'
import { imageCacheService } from '@/services/imageCache'
import { loadScreenshot, rejectScreenshotCandidate, ScreenshotStatus } from '@/services/screenshotLoader'
import { ScreenshotCandidate } from '@/services/screenshotResolver'

export function useScreenshot(url: string, itemId: string, quality: 'thumbnail' | 'full', enabled = true) {
  const [state, setState] = useState<{ status: ScreenshotStatus; src?: string; identity?: string }>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const forceRetry = useRef(false)
  const selected = useRef<ScreenshotCandidate>()
  const requestGeneration = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    requestGeneration.current++
    let objectUrl: string | undefined
    selected.current = undefined
    if (!enabled) { setState({ status: 'idle' }); return }
    setState({ status: 'loading' })
    const retry = forceRetry.current
    forceRetry.current = false
    loadScreenshot(url, { itemId, quality, signal: controller.signal, retry }).then(result => {
      if (controller.signal.aborted) { imageCacheService.revokeObjectUrl(result.src); return }
      objectUrl = result.src
      selected.current = result.selected
      setState({ status: 'loaded', src: result.src, identity: `${itemId}:${url}` })
    }).catch(() => {
      if (!controller.signal.aborted) setState({ status: 'failed' })
    })
    return () => {
      requestGeneration.current++
      controller.abort()
      if (objectUrl) imageCacheService.revokeObjectUrl(objectUrl)
    }
  }, [url, itemId, quality, enabled, attempt])
  const retry = useCallback(() => { forceRetry.current = true; setAttempt(value => value + 1) }, [])
  const onError = useCallback(() => {
    if (!selected.current) return
    const candidate = selected.current
    const generation = requestGeneration.current
    selected.current = undefined
    setState({ status: 'loading' })
    rejectScreenshotCandidate(url, candidate).finally(() => { if (generation === requestGeneration.current) setAttempt(value => value + 1) })
  }, [url])
  return { ...(state.status === 'loaded' && state.identity !== `${itemId}:${url}` ? { status: 'loading' as const } : state), retry, onError }
}
