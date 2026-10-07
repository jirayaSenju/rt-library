/**
 * Pure policy functions, constants, and utilities for Image Cache Management (V3-16)
 */

export interface ImageCachePolicyConfig {
  maxSizeBytes: number
  cleanupThresholdPercent: number
  cleanupTargetPercent: number
  maxSingleImageBytes: number
  autoCleanup: boolean
  expirationDays: number
}

export const DEFAULT_IMAGE_CACHE_POLICY: ImageCachePolicyConfig = {
  maxSizeBytes: 500 * 1024 * 1024, // 500 MB
  cleanupThresholdPercent: 90, // 90% (450 MB)
  cleanupTargetPercent: 75, // 75% (375 MB)
  maxSingleImageBytes: 15 * 1024 * 1024, // 15 MB
  autoCleanup: true,
  expirationDays: 0, // 0 = Never
}

export const MAX_IMAGE_CACHE_BYTES = DEFAULT_IMAGE_CACHE_POLICY.maxSizeBytes
export const TARGET_AFTER_CLEANUP_BYTES = (DEFAULT_IMAGE_CACHE_POLICY.maxSizeBytes * DEFAULT_IMAGE_CACHE_POLICY.cleanupTargetPercent) / 100
export const MAX_SINGLE_IMAGE_BYTES = DEFAULT_IMAGE_CACHE_POLICY.maxSingleImageBytes
export const ACCESS_UPDATE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

export type CacheHealthStatus = "healthy" | "near_limit" | "cleanup_recommended" | "cleaning" | "error"

export type FailureType =
  | "HTTP_404"
  | "HTTP_403"
  | "TIMEOUT"
  | "INVALID_MIME"
  | "NETWORK_ERROR"
  | "DECODE_ERROR"

export const FAILURE_TTLS_MS: Record<FailureType, number> = {
  HTTP_404: 24 * 60 * 60 * 1000, // 24 hours
  HTTP_403: 6 * 60 * 60 * 1000, // 6 hours
  TIMEOUT: 30 * 60 * 1000, // 30 minutes
  NETWORK_ERROR: 30 * 60 * 1000, // 30 minutes
  INVALID_MIME: 24 * 60 * 60 * 1000, // 24 hours
  DECODE_ERROR: 24 * 60 * 60 * 1000, // 24 hours
}

export interface ImageCacheMetadata {
  url: string
  sizeBytes: number
  createdAt: number
  lastAccessedAt: number
  type: "cover" | "screenshot" | "other"
  provider: string
  expiresAt?: number
}

/**
 * Extracts a standardized provider name from an image URL.
 */
export function extractImageProvider(url?: string): string {
  if (!url || typeof url !== "string") return "other"
  const lower = url.toLowerCase()
  if (lower.includes("fastpic.org") || lower.includes("fastpic.ru")) return "FastPic"
  if (lower.includes("imageban.ru") || lower.includes("imageban.net")) return "ImageBan"
  if (lower.includes("imagebam.com")) return "ImageBam"
  if (lower.includes("postimg.cc") || lower.includes("postimages.org")) return "PostImg"
  if (lower.includes("rutracker.org") || lower.includes("rutracker.cc")) return "RuTracker"
  if (lower.includes("imgur.com")) return "Imgur"

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
    const hostParts = parsed.hostname.split(".")
    if (hostParts.length >= 2) {
      const name = hostParts[hostParts.length - 2]
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
  } catch {
    // Fallback if URL parsing fails
  }

  return "Other"
}

/**
 * Determines whether the cache size exceeds the high watermark ceiling for cleanup.
 */
export function shouldTriggerCleanup(
  totalBytes: number,
  policy: ImageCachePolicyConfig = DEFAULT_IMAGE_CACHE_POLICY
): boolean {
  if (!policy.autoCleanup) return false
  const thresholdBytes = (policy.maxSizeBytes * policy.cleanupThresholdPercent) / 100
  return totalBytes >= thresholdBytes
}

/**
 * Computes the target bytes to clean down to.
 */
export function getCleanupTargetBytes(
  policy: ImageCachePolicyConfig = DEFAULT_IMAGE_CACHE_POLICY
): number {
  return (policy.maxSizeBytes * policy.cleanupTargetPercent) / 100
}

/**
 * Calculates cache health status based on utilization and thresholds.
 */
export function calculateCacheHealth(
  totalBytes: number,
  policy: ImageCachePolicyConfig = DEFAULT_IMAGE_CACHE_POLICY,
  isCleaning: boolean = false
): CacheHealthStatus {
  if (isCleaning) return "cleaning"
  const thresholdBytes = (policy.maxSizeBytes * policy.cleanupThresholdPercent) / 100
  const nearLimitBytes = policy.maxSizeBytes * 0.8 // 80%

  if (totalBytes >= thresholdBytes) {
    return "cleanup_recommended"
  }
  if (totalBytes >= nearLimitBytes) {
    return "near_limit"
  }
  return "healthy"
}

/**
 * Determines whether an individual image exceeds max single image size ceiling.
 */
export function isSingleImageTooLarge(
  sizeBytes: number,
  maxSingleBytes: number = MAX_SINGLE_IMAGE_BYTES
): boolean {
  return sizeBytes > maxSingleBytes
}

/**
 * Determines whether lastAccessedAt timestamp should be updated (throttled).
 */
export function shouldUpdateLastAccessedAt(
  lastAccessedAt: number,
  now: number = Date.now(),
  thresholdMs: number = ACCESS_UPDATE_THRESHOLD_MS
): boolean {
  return !lastAccessedAt || now - lastAccessedAt > thresholdMs
}

/**
 * Calculates size delta for overwriting an existing cache entry.
 */
export function calculateSizeDelta(
  existingSizeBytes: number | undefined | null,
  newSizeBytes: number
): number {
  const oldSize = typeof existingSizeBytes === "number" && existingSizeBytes >= 0 ? existingSizeBytes : 0
  return newSizeBytes - oldSize
}

/**
 * Selects candidate entries for LRU eviction until total size is reduced to target.
 */
export function selectEvictionCandidates<T extends { url: string; sizeBytes: number; lastAccessedAt: number }>(
  entries: T[],
  currentTotalBytes: number,
  targetBytes: number = TARGET_AFTER_CLEANUP_BYTES
): { candidates: T[]; expectedFreedBytes: number; expectedFinalSize: number } {
  if (currentTotalBytes <= targetBytes) {
    return { candidates: [], expectedFreedBytes: 0, expectedFinalSize: currentTotalBytes }
  }

  // Sort by lastAccessedAt ASC (oldest access first)
  const sorted = [...entries].sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0))

  const candidates: T[] = []
  let freedBytes = 0
  let remainingTotal = currentTotalBytes

  for (const entry of sorted) {
    if (remainingTotal <= targetBytes) {
      break
    }
    candidates.push(entry)
    freedBytes += entry.sizeBytes || 0
    remainingTotal -= entry.sizeBytes || 0
  }

  return {
    candidates,
    expectedFreedBytes: freedBytes,
    expectedFinalSize: Math.max(0, remainingTotal),
  }
}

/**
 * Formats byte counts into human-readable strings (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
  return `${formatted} ${sizes[i]}`
}
