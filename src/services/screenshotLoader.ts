import { imageCacheService } from './imageCache'
import { canonicalScreenshotKey, orderScreenshotCandidates, ScreenshotCandidate } from './screenshotResolver'

export const MAX_CONCURRENT_SCREENSHOT_FETCHES = 6
export const SCREENSHOT_TIMEOUT_MS = 10000
export type ScreenshotStatus = 'idle' | 'loading' | 'loaded' | 'failed'
export interface ScreenshotDiagnostic {
  itemId: string
  originalUrl: string
  resolvedUrl: string
  provider: string
  candidateIndex: number
  status: string
  httpStatus: number | null
  contentType: string | null
  durationMs: number
  error: string | null
  cacheHit: boolean
  legacyHttp: boolean
}
const diagnostics = new Map<string, ScreenshotDiagnostic[]>()
const failures = new Map<string, { until: number; diagnostic: ScreenshotDiagnostic }>()
let active = 0
const queue: Array<() => void> = []

async function withSlot<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      const index = queue.indexOf(start)
      if (index !== -1) queue.splice(index, 1)
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    }
    const start = () => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) { abort(); return }
      active++
      resolve()
    }
    if (signal.aborted) { abort(); return }
    if (active < MAX_CONCURRENT_SCREENSHOT_FETCHES) start()
    else { queue.push(start); signal.addEventListener('abort', abort, { once: true }) }
  })
  try { signal.throwIfAborted(); return await work() }
  finally { active--; queue.shift()?.() }
}

function cacheOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (value?: T, error?: unknown) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      error ? reject(error) : resolve(value!)
    }
    const abort = () => finish(undefined, signal.reason || new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => finish(undefined, new Error('cache_error')), 1000)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(value => finish(value), error => finish(undefined, error))
    if (signal.aborted) abort()
  })
}

type CandidateLoad = { blob: Blob; cacheHit: boolean; httpStatus: number | null; contentType: string | null; resolvedUrl: string }
const inFlight = new Map<string, { controller: AbortController; promise: Promise<CandidateLoad>; consumers: number }>()

function shareCandidate(key: string, signal: AbortSignal, work: (signal: AbortSignal) => Promise<CandidateLoad>): Promise<CandidateLoad> {
  let request = inFlight.get(key)
  if (request?.controller.signal.aborted) request = undefined
  if (!request) {
    const controller = new AbortController()
    const entry = { controller, promise: Promise.resolve(null as unknown as CandidateLoad), consumers: 0 }
    entry.promise = withSlot(controller.signal, async () => {
      const timer = setTimeout(() => controller.abort(new Error('timeout')), SCREENSHOT_TIMEOUT_MS)
      try { return await work(controller.signal) }
      finally { clearTimeout(timer) }
    }).finally(() => {
      if (inFlight.get(key) === entry) inFlight.delete(key)
    })
    inFlight.set(key, entry)
    request = entry
  }
  const shared = request
  shared.consumers++
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (result?: CandidateLoad, error?: unknown) => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', abort)
      if (--shared.consumers === 0) shared.controller.abort()
      error ? reject(error) : resolve(result!)
    }
    const abort = () => finish(undefined, signal.reason || new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    shared.promise.then(result => finish(result), error => finish(undefined, error))
    if (signal.aborted) abort()
  })
}

function record(diagnostic: ScreenshotDiagnostic) {
  const key = `${diagnostic.itemId}\n${diagnostic.originalUrl}`
  const entries = diagnostics.get(key) || []
  entries.push(diagnostic)
  diagnostics.set(key, entries.slice(-20))
  if (diagnostics.size > 500) diagnostics.delete(diagnostics.keys().next().value!)
  if (import.meta.env.DEV) console.debug('[IMAGE][SCREENSHOT]', diagnostic)
}
export function getScreenshotDiagnostics(itemId: string) {
  return Array.from(diagnostics.values()).filter(entries => entries[0]?.itemId === itemId)
}
export function screenshotQueueStats() { return { active, queued: queue.length, negativeCacheEntries: failures.size } }
export function screenshotCacheKey(original: string, candidate: string) {
  return `screenshot:v1:${JSON.stringify([canonicalScreenshotKey(original), candidate])}`
}
function failureTtl(status: string) {
  return status === 'http_404' ? 24 * 60 * 60 * 1000 : status === 'http_403' ? 60 * 60 * 1000 : 10 * 60 * 1000
}

export async function decodeScreenshot(blob: Blob, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error | DOMException) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        image.onload = image.onerror = null
        error ? reject(error) : resolve()
      }
      const abort = () => finish(signal.reason || new DOMException('Aborted', 'AbortError'))
      const timer = setTimeout(() => finish(new Error('timeout')), SCREENSHOT_TIMEOUT_MS)
      image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? undefined : new Error('decode_error'))
      image.onerror = () => finish(new Error('decode_error'))
      signal.addEventListener('abort', abort, { once: true })
      image.src = url
    })
  } finally { image.src = ''; URL.revokeObjectURL(url) }
}

async function fetchCandidate(candidate: ScreenshotCandidate, signal: AbortSignal) {
  const bridge = window.rtLibrary?.images
  if (bridge) {
    const requestId = crypto.randomUUID()
    const cancel = () => bridge.cancel(requestId)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      signal.throwIfAborted()
      const response = await bridge.fetch(candidate.url, requestId)
      signal.throwIfAborted()
      if (!response.ok || !response.bytes) throw Object.assign(new Error(response.status || 'unknown'), response)
      return { blob: new Blob([response.bytes as Uint8Array<ArrayBuffer>], { type: response.contentType }), ...response }
    } finally { signal.removeEventListener('abort', cancel) }
  }
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, SCREENSHOT_TIMEOUT_MS)
  try {
    const response = await fetch(candidate.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    const details = { httpStatus: response.status, contentType, resolvedUrl: response.url }
    if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'http_403' : response.status === 404 ? 'http_404' : response.status >= 500 ? 'http_5xx' : 'unknown'), details)
    if (!contentType.startsWith('image/') || contentType.startsWith('image/svg+xml')) throw Object.assign(new Error(contentType.includes('text/html') ? 'html_response' : 'invalid_content_type'), details)
    const blob = await response.blob()
    if (!blob.size) throw Object.assign(new Error('empty_body'), details)
    return { blob, ...details }
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('timeout')
    throw error
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}

export async function loadScreenshot(originalUrl: string, options: {
  itemId: string; quality: 'thumbnail' | 'full'; signal: AbortSignal; retry?: boolean
}): Promise<{ src: string; selected: ScreenshotCandidate }> {
  const { signal, itemId, quality, retry } = options
  const candidates = orderScreenshotCandidates(originalUrl, quality)
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    signal.throwIfAborted()
    const candidate = candidates[candidateIndex]
    const key = screenshotCacheKey(originalUrl, candidate.url)
    if (retry) failures.delete(key)
    const failed = failures.get(key)
    if (failed && failed.until > Date.now()) {
      record({ ...failed.diagnostic, itemId, originalUrl, candidateIndex, durationMs: 0, error: 'Negative cache: ' + failed.diagnostic.status })
      continue
    }
    failures.delete(key)
    const started = performance.now()
    const diagnostic: ScreenshotDiagnostic = {
      itemId, originalUrl, resolvedUrl: candidate.url, provider: candidate.provider, candidateIndex,
      status: 'loading', httpStatus: null, contentType: null, durationMs: 0, error: null, cacheHit: false,
      legacyHttp: /^http:/i.test(originalUrl.trim()),
    }
    try {
      const loaded = await shareCandidate(key, signal, async requestSignal => {
        let cached: Blob | undefined
        try { cached = await cacheOperation((async () =>
          await imageCacheService.getBlob(key) || await imageCacheService.getBlob(candidate.url)
        )(), requestSignal) }
        catch { record({ ...diagnostic, status: 'cache_error', error: 'Cache read failed', durationMs: performance.now() - started }) }
        requestSignal.throwIfAborted()
        if (cached) {
          try {
            await decodeScreenshot(cached, requestSignal)
            diagnostic.cacheHit = true
            diagnostic.contentType = cached.type
            return { blob: cached, cacheHit: true, httpStatus: null, contentType: cached.type, resolvedUrl: candidate.url }
          } catch (error) {
            if (requestSignal.aborted) throw error
            await cacheOperation(Promise.all([
              imageCacheService.deleteCacheEntry(key), imageCacheService.deleteCacheEntry(candidate.url),
            ]), requestSignal).catch(() => {})
            record({ ...diagnostic, status: 'cache_error', error: 'Cached image cannot decode', durationMs: performance.now() - started })
          }
        }
        const response = await fetchCandidate(candidate, requestSignal)
        diagnostic.httpStatus = response.httpStatus ?? null
        diagnostic.contentType = response.contentType ?? null
        diagnostic.resolvedUrl = response.resolvedUrl || candidate.url
        try { await decodeScreenshot(response.blob, requestSignal) }
        catch (error) {
          throw Object.assign(error as Error, { httpStatus: response.httpStatus, contentType: response.contentType, resolvedUrl: response.resolvedUrl })
        }
        requestSignal.throwIfAborted()
        try { await cacheOperation(imageCacheService.putBlob(key, response.blob), requestSignal) }
        catch { record({ ...diagnostic, status: 'cache_error', error: 'Cache write failed', durationMs: performance.now() - started }) }
        return { blob: response.blob, cacheHit: false, httpStatus: diagnostic.httpStatus, contentType: diagnostic.contentType, resolvedUrl: diagnostic.resolvedUrl }
      })
      signal.throwIfAborted()
      record({ ...diagnostic, cacheHit: loaded.cacheHit, httpStatus: loaded.httpStatus, contentType: loaded.contentType, resolvedUrl: loaded.resolvedUrl, status: 'loaded', durationMs: performance.now() - started })
      imageCacheService.removeFailure(key).catch(() => {})
      return { src: imageCacheService.createObjectUrl(loaded.blob), selected: candidate }
    } catch (error) {
      if (signal.aborted) throw error
      const failure = error as Error & { status?: string; httpStatus?: number; contentType?: string; resolvedUrl?: string; error?: string }
      const status = failure.status || (/^(timeout|http_403|http_404|http_5xx|html_response|invalid_content_type|empty_body|decode_error)$/.test(failure.message) ? failure.message : 'network_error')
      const entry = { ...diagnostic, status, httpStatus: failure.httpStatus ?? diagnostic.httpStatus, contentType: failure.contentType ?? diagnostic.contentType, resolvedUrl: failure.resolvedUrl || diagnostic.resolvedUrl, error: failure.error || failure.message, durationMs: performance.now() - started }
      record(entry)
      failures.set(key, { until: Date.now() + failureTtl(status), diagnostic: entry })
      if (failures.size > 2000) failures.delete(failures.keys().next().value!)

      // Persist failure record to imageCache negative store
      const fType = status === 'http_404' ? 'HTTP_404' : status === 'http_403' ? 'HTTP_403' : status === 'timeout' ? 'TIMEOUT' : status === 'decode_error' ? 'DECODE_ERROR' : status === 'invalid_content_type' || status === 'html_response' ? 'INVALID_MIME' : 'NETWORK_ERROR'
      imageCacheService.recordFailure(key, candidate.url, fType).catch(() => {})
    }
  }
  throw new Error('Screenshots unavailable')
}

export async function rejectScreenshotCandidate(originalUrl: string, candidate: ScreenshotCandidate) {
  const key = screenshotCacheKey(originalUrl, candidate.url)
  await cacheOperation(Promise.all([imageCacheService.deleteCacheEntry(key), imageCacheService.deleteCacheEntry(candidate.url)]), new AbortController().signal).catch(() => {})
  failures.set(key, { until: Date.now() + failureTtl('decode_error'), diagnostic: {
    itemId: '', originalUrl, resolvedUrl: candidate.url, provider: candidate.provider, candidateIndex: 0,
    status: 'decode_error', httpStatus: null, contentType: null, durationMs: 0, error: 'Display decode failed', cacheHit: false,
    legacyHttp: /^http:/i.test(originalUrl.trim()),
  } })
  imageCacheService.recordFailure(key, candidate.url, 'DECODE_ERROR').catch(() => {})
}
