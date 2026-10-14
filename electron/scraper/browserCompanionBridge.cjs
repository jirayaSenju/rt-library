const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PROTOCOL_VERSION = 1;
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const FORUM_ORIGIN = 'https://rutracker.org';
const COMPANION_STALE_MS = 120000;
const MAX_CONCURRENT_PENDING = 16;

function validateForumUrl(value, kind) {
  let url;
  try { url = new URL(value); } catch { throw new Error('INVALID_URL'); }
  if (url.origin !== FORUM_ORIGIN || !url.pathname.startsWith('/forum/')) throw new Error('URL_NOT_ALLOWED');
  if (kind === 'response') return url.href;
  if (kind === 'category' && (url.pathname !== '/forum/viewforum.php' || !/^\d+$/.test(url.searchParams.get('f') || ''))) throw new Error('INVALID_CATEGORY_URL');
  if (kind === 'topic' && (url.pathname !== '/forum/viewtopic.php' || !/^\d+$/.test(url.searchParams.get('t') || ''))) throw new Error('INVALID_TOPIC_URL');
  return url.href;
}

function readJson(req, limit = MAX_HTML_BYTES + 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let exceeded = false;
    req.on('data', chunk => {
      if (exceeded) return;
      size += chunk.length;
      if (size > limit) { exceeded = true; reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { statusCode: 413 })); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('MALFORMED_JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

class BrowserCompanionBridge {
  constructor({ appVersion, onPage }) {
    this.appVersion = appVersion;
    this.onPage = onPage;
    this.server = null;
    this.token = null;
    this.sessionId = null;
    this.pending = new Map();
    this.queue = [];
    this.waiters = [];
    this.port = null;
    this.lastSeen = 0;
  }

  async start() {
    if (this.server) return this.getConnection();
    this.token = crypto.randomBytes(32).toString('hex');
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => { this.server.removeListener('error', reject); resolve(); });
    });
    this.port = this.server.address().port;
    return this.getConnection();
  }

  disconnect() {
    this.sessionId = null;
    this.lastSeen = 0;
    this.cancel();
  }

  async reconnect() {
    this.disconnect();
    if (this.server) {
      await this.stop();
    }
    return this.start();
  }

  getConnection() {
    return {
      port: this.port,
      token: this.token,
      connectionCode: this.port && this.token ? `${this.port}:${this.token}` : null,
      connected: Boolean(this.sessionId && Date.now() - this.lastSeen < COMPANION_STALE_MS),
      sessionId: this.sessionId,
      lastSeen: this.lastSeen,
      extensionVersion: this.extensionVersion || null,
    };
  }

  send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }

  async handle(req, res) {
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return this.send(res, 403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (req.method === 'OPTIONS') return this.send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const auth = req.headers.authorization || '';
    if (!this.token || auth !== `Bearer ${this.token}`) return this.send(res, 401, { error: 'UNAUTHORIZED' });
    let body;
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pathname = url.pathname.startsWith('/v1/') ? url.pathname.slice(3) : url.pathname;
      if (pathname !== '/hello' && req.headers['x-rt-protocol'] !== String(PROTOCOL_VERSION)) return this.send(res, 400, { error: 'PROTOCOL_MISMATCH' });
      if (req.method === 'GET' && pathname === '/ping') return this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, type: 'PONG' });
      if (req.method === 'POST' && pathname === '/hello') {
        body = await readJson(req, 16 * 1024);
        if (body.protocolVersion !== PROTOCOL_VERSION || typeof body.extensionVersion !== 'string') return this.send(res, 400, { error: 'PROTOCOL_MISMATCH' });
        this.sessionId = crypto.randomUUID();
        this.extensionVersion = body.extensionVersion;
        this.lastSeen = Date.now();
        return this.send(res, 200, { type: 'WELCOME', protocolVersion: PROTOCOL_VERSION, sessionId: this.sessionId, appVersion: this.appVersion });
      }
      if (!this.sessionId) return this.send(res, 409, { error: 'HANDSHAKE_REQUIRED' });
      if (req.headers['x-rt-session'] !== this.sessionId) return this.send(res, 403, { error: 'SESSION_MISMATCH' });
      this.lastSeen = Date.now();
      if (req.method === 'POST' && pathname === '/disconnect') {
        console.info(`[COMPANION][DISCONNECTED_BY_EXTENSION] sessionId=${this.sessionId}`);
        this.disconnect();
        return this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, disconnected: true });
      }
      if (req.method === 'GET' && pathname === '/status') return this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, connected: true });
      if (req.method === 'GET' && pathname === '/commands') {
        if (this.queue.length > 0) {
          const command = this.queue.shift();
          console.info(`[COMPANION][DELIVERED] requestId=${command.requestId} type=${command.type}`);
          return this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, command });
        }
        const waitMs = url.searchParams.get('nowait') ? 0 : 5000;
        if (waitMs <= 0) {
          return this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, command: null });
        }
        let timer;
        const waiter = (cmd) => {
          clearTimeout(timer);
          if (cmd) console.info(`[COMPANION][DELIVERED] requestId=${cmd.requestId} type=${cmd.type}`);
          this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, command: cmd });
        };
        this.waiters.push(waiter);
        timer = setTimeout(() => {
          this.waiters = this.waiters.filter(w => w !== waiter);
          this.send(res, 200, { protocolVersion: PROTOCOL_VERSION, command: null });
        }, waitMs);
        req.on('close', () => {
          clearTimeout(timer);
          this.waiters = this.waiters.filter(w => w !== waiter);
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/responses') {
        body = await readJson(req);
        if (body.protocolVersion !== PROTOCOL_VERSION || typeof body.requestId !== 'string' || typeof body.html !== 'string') return this.send(res, 400, { error: 'INVALID_RESPONSE' });
        const bytes = Number.isSafeInteger(body.sourceBytes) && body.sourceBytes >= 0 ? body.sourceBytes : Buffer.byteLength(body.html, 'utf8');
        if (bytes > MAX_HTML_BYTES || Buffer.byteLength(body.html, 'utf8') > MAX_HTML_BYTES) return this.send(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
        const pending = this.pending.get(body.requestId);
        if (!pending) return this.send(res, 404, { error: 'UNKNOWN_REQUEST' });
        let urlForKind;
        try { urlForKind = validateForumUrl(body.url, 'response'); }
        catch (error) { this.pending.delete(body.requestId); clearTimeout(pending.timeout); pending.reject(error); throw error; }
        this.pending.delete(body.requestId); clearTimeout(pending.timeout);
        console.info(`[COMPANION][RESPONSE_RECEIVED] requestId=${body.requestId} httpStatus=${Number(body.httpStatus) || 0} bytes=${bytes}`);
        try {
          const result = await this.onPage({ ...body, url: urlForKind, bytes, kind: pending.kind, request: pending.request, httpStatus: body.httpStatus, requestId: body.requestId });
          console.info(`[COMPANION][REQUEST_RESOLVED] requestId=${body.requestId} status=${result?.status || 'UNKNOWN'} topics=${result?.topicCount ?? 0}`);
          pending.resolve(result);
          if (Array.isArray(pending.subscribers)) {
            for (const sub of pending.subscribers) sub.resolve(result);
          }
        } catch (error) {
          pending.reject(error);
          if (Array.isArray(pending.subscribers)) {
            for (const sub of pending.subscribers) sub.reject(error);
          }
          throw error;
        }
        return this.send(res, 200, { accepted: true });
      }
      return this.send(res, 404, { error: 'UNKNOWN_MESSAGE' });
    } catch (error) {
      return this.send(res, error.statusCode || 400, { error: error.message === 'PAYLOAD_TOO_LARGE' ? error.message : 'INVALID_REQUEST' });
    }
  }

  requestPage({ kind, url, categoryId, topicId, pageNum, topicTitle }) {
    if (!this.getConnection().connected) return Promise.reject(new Error('COMPANION_NOT_CONNECTED'));
    const safeUrl = validateForumUrl(url, kind);

    if (kind === 'topic' && topicId) {
      for (const [existingId, p] of this.pending.entries()) {
        if (p.kind === 'topic' && p.request?.topicId === topicId) {
          console.info(`[COMPANION][DEDUPLICATE] topicId=${topicId} already in-flight with requestId=${existingId}`);
          return new Promise((resolve, reject) => {
            if (!p.subscribers) p.subscribers = [];
            p.subscribers.push({ resolve, reject });
          });
        }
      }
    }

    if (this.pending.size >= MAX_CONCURRENT_PENDING) return Promise.reject(new Error('COMPANION_REQUEST_BUSY'));
    const requestId = crypto.randomUUID();
    console.info(`[COMPANION][REQUEST_CREATED] requestId=${requestId} kind=${kind} categoryId=${categoryId || 'none'} url=${safeUrl}`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        this.queue = this.queue.filter(command => command.requestId !== requestId);
        console.warn(`[COMPANION][REQUEST_TIMEOUT] requestId=${requestId}`);
        reject(new Error('COMPANION_REQUEST_TIMEOUT'));
      }, 30000);
      this.pending.set(requestId, { resolve, reject, timeout, kind, request: { categoryId, topicId, pageNum, topicTitle } });
      const command = { protocolVersion: PROTOCOL_VERSION, type: kind === 'category' ? 'FETCH_CATEGORY' : 'FETCH_TOPIC', requestId, url: safeUrl, categoryId, topicId };
      if (this.waiters.length > 0) {
        const waiter = this.waiters.shift();
        waiter(command);
      } else {
        this.queue.push(command);
        console.info(`[COMPANION][QUEUED] requestId=${requestId} type=${command.type}`);
      }
    });
  }

  cancel() {
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('COMPANION_CANCELLED'));
      if (Array.isArray(pending.subscribers)) {
        for (const sub of pending.subscribers) sub.reject(new Error('COMPANION_CANCELLED'));
      }
    }
    this.pending.clear();
    this.queue = [];
  }

  async stop() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('COMPANION_DISCONNECTED'));
      if (Array.isArray(pending.subscribers)) {
        for (const sub of pending.subscribers) sub.reject(new Error('COMPANION_DISCONNECTED'));
      }
    }
    this.pending.clear();
    for (const waiter of this.waiters) waiter(null);
    this.waiters = [];
    this.queue = [];
    this.sessionId = null;
    this.lastSeen = 0;
    this.token = null;
    this.port = null;
    if (this.server) await new Promise(resolve => this.server.close(resolve));
    this.server = null;
  }
}

module.exports = { BrowserCompanionBridge, validateForumUrl, PROTOCOL_VERSION, MAX_HTML_BYTES, MAX_CONCURRENT_PENDING };
