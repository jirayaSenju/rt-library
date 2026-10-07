const dns = require('node:dns/promises');
const { isIP } = require('node:net');

const TIMEOUT_MS = 10000;
const MAX_TRANSFER_BYTES = 64 * 1024 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;

function failure(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}
function classifyError(error) {
  const message = `${error?.code || ''} ${error?.cause?.code || ''} ${error?.message || ''}`;
  if (error?.code && /^(http_|html_response|invalid_content_type|empty_body|decode_error|provider_dead|timeout|network_error|ssl_error|mixed_content|cache_error|unknown)/.test(error.code)) return error.code;
  if (/ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(message)) return 'provider_dead';
  if (/CERT|SSL|TLS/i.test(message)) return 'ssl_error';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  return 'network_error';
}
function publicAddress(address) {
  let value = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (value.startsWith('::ffff:')) {
    value = value.slice(7);
    if (value.includes(':')) {
      const parts = value.split(':').map(part => parseInt(part, 16));
      value = `${parts[0] >> 8}.${parts[0] & 255}.${parts[1] >> 8}.${parts[1] & 255}`;
    }
  }
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224);
  }
  return isIP(value) === 6 && /^[23]/.test(value);
}
async function validateUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw failure('unknown'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw failure('unknown');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw failure('unknown');
  const records = isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!records.length || records.some(record => !publicAddress(record.address))) throw failure('unknown');
  return url.href;
}
function pageProvider(url) {
  const { hostname: host, pathname: p } = new URL(url);
  return /^(?:www\.)?(?:postimg\.(?:cc|org)|postimage\.cc|ibb\.co)$/.test(host) ||
    /^(?:www\.)?fastpic\.(?:org|ru)$/.test(host) && /^\/(?:view|fullview)\//.test(p) ||
    /^(?:www\.)?imageban\.ru$/.test(host) && /^\/show\//.test(p) ||
    /^(?:www\.)?imagebam\.com$/.test(host) && /^\/(?:view|image)\//.test(p);
}
function decodeEntities(value) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
    const number = parseInt(hex || dec, hex ? 16 : 10);
    return number <= 0x10ffff ? String.fromCodePoint(number) : '';
  });
}
function extractPageImage(html, base) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    if (/^(og:image(?::url)?|twitter:image)$/i.test(attrs.property || attrs.name || '') && attrs.content) return new URL(decodeEntities(attrs.content), base).href;
  }
  throw failure('html_response', { error: 'Viewer has no og:image metadata' });
}
async function readBody(response, limit, signal) {
  if (Number(response.headers.get('content-length')) > limit) throw failure('unknown', { error: 'Transfer limit exceeded' });
  const reader = response.body?.getReader();
  if (!reader) throw failure('empty_body');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw failure('unknown', { error: 'Transfer limit exceeded' });
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!total) throw failure('empty_body');
  return Buffer.concat(chunks, total);
}
async function fetchImage(input, { signal: externalSignal, fetchImpl = globalThis.fetch, validate = validateUrl } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(externalSignal.reason);
  externalSignal?.addEventListener('abort', cancel, { once: true });
  if (externalSignal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(failure('timeout')), TIMEOUT_MS);
  const signal = controller.signal;
  let resolvedUrl = input, httpStatus = null, contentType = null, redirects = 0, pageResolved = false;
  try {
    for (let step = 0; step < 8; step++) {
      // DNS lookup cannot be aborted; race it against the same request deadline.
      resolvedUrl = await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason || failure('network_error'));
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        Promise.resolve(validate(resolvedUrl)).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      });
      signal.throwIfAborted();
      const response = await fetchImpl(resolvedUrl, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.1' } });
      httpStatus = response.status;
      contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
      if ([301, 302, 303, 307, 308].includes(httpStatus)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || ++redirects > 5) throw failure('unknown');
        resolvedUrl = new URL(location, resolvedUrl).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw failure(httpStatus === 403 ? 'http_403' : httpStatus === 404 ? 'http_404' : httpStatus >= 500 ? 'http_5xx' : 'unknown');
      }
      if (contentType === 'text/html' && !pageResolved && pageProvider(resolvedUrl)) {
        const body = await readBody(response, MAX_PAGE_BYTES, signal);
        resolvedUrl = extractPageImage(body.toString('utf8'), resolvedUrl);
        pageResolved = true;
        continue;
      }
      if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
        await response.body?.cancel();
        throw failure(contentType === 'text/html' ? 'html_response' : 'invalid_content_type');
      }
      const bytes = await readBody(response, MAX_TRANSFER_BYTES, signal);
      return { ok: true, bytes: new Uint8Array(bytes), contentType, httpStatus, resolvedUrl, redirects };
    }
    throw failure('unknown');
  } catch (error) {
    const cause = signal.aborted ? signal.reason : error;
    return { ok: false, status: classifyError(cause), error: cause?.error || cause?.message || 'Image request failed', httpStatus, contentType, resolvedUrl, redirects };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', cancel);
  }
}
function registerImageIPC({ ipcMain, net, trustedUrl }) {
  const requests = new Map();
  function trusted(event) {
    return event.senderFrame === event.sender.mainFrame && trustedUrl(event.senderFrame.url);
  }
  ipcMain.handle('image:fetch', async (event, request) => {
    if (!trusted(event) || typeof request?.url !== 'string' || request.url.length > 8192 || typeof request?.requestId !== 'string' || request.requestId.length > 100) return { ok: false, status: 'unknown', error: 'Invalid image request' };
    const key = `${event.sender.id}:${request.requestId}`;
    if (requests.has(key) || requests.size >= 6) return { ok: false, status: 'network_error', error: 'Image queue full' };
    const controller = new AbortController();
    requests.set(key, controller);
    const destroyed = () => controller.abort();
    event.sender.once('destroyed', destroyed);
    try { return await fetchImage(request.url, { signal: controller.signal, fetchImpl: net.fetch.bind(net) }); }
    finally { requests.delete(key); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', destroyed); }
  });
  ipcMain.on('image:cancel', (event, requestId) => {
    if (trusted(event) && typeof requestId === 'string') requests.get(`${event.sender.id}:${requestId}`)?.abort();
  });
}
module.exports = { fetchImage, registerImageIPC, validateUrl, publicAddress, extractPageImage, classifyError, TIMEOUT_MS, MAX_TRANSFER_BYTES };
