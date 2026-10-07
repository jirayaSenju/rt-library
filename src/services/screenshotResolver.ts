export type ScreenshotCandidate = {
  url: string
  provider: string
  kind: 'original' | 'thumbnail' | 'full' | 'big' | 'derived'
}

const IMAGE_EXT = '(?:jpe?g|png|gif|webp|bmp|avif)'
const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`)

export function normalizeScreenshotUrl(input: string): string | undefined {
  if (typeof input !== 'string') return undefined
  let value = input.trim()
  const wrapped = value.match(/\[img\]([\s\S]*?)\[\/img\]/i) ||
    value.match(/<(?:img|var)\s+[^>]*(?:src|title)=["']([^"']+)/i)
  if (wrapped) value = wrapped[1]
  value = value.replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': '' }
    const key = entity.toLowerCase()
    if (key in named) return named[key]
    const number = key.startsWith('&#x') ? parseInt(key.slice(3), 16) : parseInt(key.slice(2), 10)
    return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity
  }).replace(/\s+/g, '')
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    url.hash = ''
    return url.href
  } catch { return undefined }
}

export function screenshotProvider(input: string): string {
  const normalized = normalizeScreenshotUrl(input)
  if (!normalized) return 'unknown'
  const host = new URL(normalized).hostname
  const domains: Record<string, string[]> = {
    fastpic: ['fastpic.org', 'fastpic.ru'], imageban: ['imageban.ru'], radikal: ['radikal.ru'],
    imagebam: ['imagebam.com'], postimg: ['postimg.cc', 'postimg.org', 'postimage.cc'],
    ibb: ['ibb.co'], vfl: ['vfl.ru'], lostpic: ['lostpic.net'], imgur: ['imgur.com'],
    yandex: ['yandex.ru', 'yandex.net'], vk: ['userapi.com', 'vk.com'],
  }
  return Object.keys(domains).find(provider => domains[provider].some(domain => hostIs(host, domain))) || 'generic'
}

export function isScreenshotPage(input: string): boolean {
  const normalized = normalizeScreenshotUrl(input)
  if (!normalized) return false
  const { hostname: host, pathname: path } = new URL(normalized)
  const provider = screenshotProvider(normalized)
  return /\.(?:html?|php)$/i.test(path) ||
    (provider === 'fastpic' && /^\/(?:fullview|view)\//i.test(path)) ||
    (provider === 'imageban' && /^\/show\//i.test(path)) ||
    (provider === 'imagebam' && /^\/(?:view|image)\//i.test(path)) ||
    (provider === 'postimg' && /^(?:www\.)?(?:postimg\.(?:cc|org)|postimage\.cc)$/.test(host)) ||
    (provider === 'ibb' && host === 'ibb.co')
}

export function isScreenshotThumbnail(input: string): boolean {
  const normalized = normalizeScreenshotUrl(input)
  if (!normalized) return false
  return /\/(?:thumbs?|thumbnails?)\/|(?:^|\/)thumb(?:nails?|s)\d*\.|_t\.|\.th\./i.test(normalized) ||
    (screenshotProvider(normalized) === 'radikal' && /\/[\da-f]{10,}t\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.test(normalized))
}

export function resolveScreenshotCandidates(input: string): ScreenshotCandidate[] {
  const original = normalizeScreenshotUrl(input)
  if (!original) return []
  const provider = screenshotProvider(original)
  const parsed = new URL(original)
  const urls: ScreenshotCandidate[] = []
  const add = (url: string, kind: ScreenshotCandidate['kind']) => {
    if (!urls.some(candidate => candidate.url === url)) urls.push({ url, kind, provider })
  }
  // HTTPS is tried only for these providers; the stored HTTP URL remains a fallback.
  const upgraded = parsed.protocol === 'http:' && ['fastpic', 'imageban', 'radikal'].includes(provider)
    ? original.replace(/^http:/, 'https:') : original
  const path = parsed.pathname
  const thumb = isScreenshotThumbnail(original)
  if (provider === 'fastpic' && /^i\d+\.fastpic\.(?:org|ru)$/i.test(parsed.hostname) &&
    new RegExp(`^/thumb/\\d{4}/\\d{4}/[\\da-f]{2}/_?[\\da-f]{32}\\.${IMAGE_EXT}$`, 'i').test(path)) {
    const big = upgraded.replace('/thumb/', '/big/')
    add(big, 'big')
    // Catalog probes confirm that FastPic frequently stores .jpeg thumbs for .jpg originals.
    if (/\.jpeg$/i.test(path)) add(big.replace(/\.jpeg(?=\?|$)/i, '.jpg'), 'derived')
  }
  if (provider === 'imageban' && /^i\d+\.imageban\.ru$/i.test(parsed.hostname)) {
    const match = path.match(new RegExp(`^/thumbs/(\\d{4})\\.(\\d{2})\\.(\\d{2})/([\\da-f]{32}\\.${IMAGE_EXT})$`, 'i'))
    if (match) {
      const direct = new URL(upgraded)
      direct.pathname = `/out/${match[1]}/${match[2]}/${match[3]}/${match[4]}`
      add(direct.href, 'full')
    } else if (new RegExp(`^/thumbs/\\d{4}/\\d{2}/\\d{2}/[\\da-f]{32}\\.${IMAGE_EXT}$`, 'i').test(path)) {
      add(upgraded.replace('/thumbs/', '/out/'), 'full')
    }
  }
  const directFastpic = provider === 'fastpic' && /^i\d+\.fastpic\.(?:org|ru)$/i.test(parsed.hostname) &&
    new RegExp(`^/big/\\d{4}/\\d{4}/[\\da-f]{2}/_?[\\da-f]{32}\\.${IMAGE_EXT}$`, 'i').test(path)
  if (directFastpic) {
    add(upgraded, 'big')
    const thumbnail = upgraded.replace('/big/', '/thumb/')
    if (/\.jpg$/i.test(path)) add(thumbnail.replace(/\.jpg(?=\?|$)/i, '.jpeg'), 'thumbnail')
    add(thumbnail, 'thumbnail')
  }
  add(upgraded, thumb ? 'thumbnail' : 'original')
  add(original, thumb ? 'thumbnail' : 'original')
  return urls
}

export function canonicalScreenshotKey(input: string): string {
  const normalized = normalizeScreenshotUrl(input)
  if (!normalized) return typeof input === 'string' ? input.trim() : ''
  const provider = screenshotProvider(normalized)
  const url = new URL(normalized)
  const path = url.pathname
  if (provider === 'fastpic' || provider === 'imageban') {
    const hash = path.match(/(?:^|\/)_?([\da-f]{32})(?=[./]|$)/i)?.[1]
    if (hash) return `${provider}:${hash.toLowerCase()}`
  }
  if (provider === 'imagebam') {
    const id = path.match(/\/((?:ME[\da-z]+|[\da-f]{10,}))(?:_t)?(?:\.[a-z]+)?$/i)?.[1]
    if (id) return `${provider}:${id}`
  }
  // Viewer IDs and direct-image IDs are not interchangeable on PostImg/ibb.
  return `${provider}:${url.href}`
}

export function uniqueScreenshotUrls(inputs?: string[] | null): string[] {
  const seen = new Set<string>()
  return (Array.isArray(inputs) ? inputs : []).filter(input => {
    if (typeof input !== 'string' || !input.trim()) return false
    const key = canonicalScreenshotKey(input)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function orderScreenshotCandidates(input: string, quality: 'thumbnail' | 'full'): ScreenshotCandidate[] {
  const candidates = resolveScreenshotCandidates(input)
  return quality === 'full' ? candidates : candidates.filter(c => c.kind === 'thumbnail').concat(candidates.filter(c => c.kind !== 'thumbnail'))
}
