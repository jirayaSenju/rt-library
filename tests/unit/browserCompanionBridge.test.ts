import { describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'

const { BrowserCompanionBridge, validateForumUrl, PROTOCOL_VERSION, MAX_HTML_BYTES } = require('../../electron/scraper/browserCompanionBridge.cjs')
const { parseCategoryHtml } = require('../../scraper/parsers/rutrackerHtmlParser.cjs')

function request(port: number, path: string, { method = 'GET', token, session, protocol = String(PROTOCOL_VERSION), body, origin }: any = {}) {
  return new Promise<any>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(session ? { 'X-RT-Session': session } : {}),
      ...(protocol ? { 'X-RT-Protocol': protocol } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    } }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

describe('Browser Companion local bridge', () => {
  it('restricts targets to forum category/topic URLs', () => {
    expect(validateForumUrl('https://rutracker.org/forum/viewforum.php?f=887', 'category')).toContain('f=887')
    expect(validateForumUrl('https://rutracker.org/forum/viewtopic.php?t=123', 'topic')).toContain('t=123')
    for (const url of ['https://example.org/forum/viewforum.php?f=887', 'https://rutracker.org/forum/viewforum.php?f=x', 'https://rutracker.org/forum/other?f=887']) {
      expect(() => validateForumUrl(url, 'category')).toThrow()
    }
  })

  it('requires token, protocol and handshake, then returns a command and parsed response', async () => {
    const fixture = fs.readFileSync('tests/fixtures/rutracker-html/category-xbox.html', 'utf8')
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: ({ html, bytes, httpStatus }: any) => ({ status: 'FORUM_READY', bytes, httpStatus, topicCount: parseCategoryHtml(html, { categoryId: 'xbox' }).topics.length }) })
    const connection = await bridge.start()
    try {
      expect((await request(connection.port, '/v1/status')).status).toBe(401)
      expect((await request(connection.port, '/v1/hello', { token: connection.token, protocol: '2', method: 'POST', body: { protocolVersion: 2, extensionVersion: '0.1' } })).status).toBe(400)
      const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
      expect(hello.body.type).toBe('WELCOME')
      expect((await request(connection.port, '/v1/status', { token: connection.token, session: hello.body.sessionId })).body.connected).toBe(true)
      expect((await request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId, protocol: '9' })).status).toBe(400)
      const pagePromise = bridge.requestPage({ kind: 'category', categoryId: 'xbox', url: 'https://rutracker.org/forum/viewforum.php?f=887' })
      const queued = await request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId })
      expect(queued.body.command.type).toBe('FETCH_CATEGORY')
      const response = await request(connection.port, '/v1/responses', { token: connection.token, session: hello.body.sessionId, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, requestId: queued.body.command.requestId, httpStatus: 200, sourceBytes: Buffer.byteLength(fixture), url: queued.body.command.url, html: fixture } })
      expect(response.status).toBe(200)
      const page = await pagePromise
      expect(page.status).toBe('FORUM_READY')
      expect(page.topicCount).toBeGreaterThan(0)
    } finally { await bridge.stop() }
  })

  it('rejects web origins, unknown routes, protocol mismatch, and unsafe response URLs', async () => {
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: () => ({}) })
    const connection = await bridge.start()
    try {
      expect((await request(connection.port, '/v1/ping', { token: connection.token, origin: 'https://attacker.example' })).status).toBe(403)
      expect((await request(connection.port, '/v1/ping', { token: connection.token, protocol: '9' })).status).toBe(400)
      const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
      expect((await request(connection.port, '/invalid', { token: connection.token, session: hello.body.sessionId })).body.error).toBe('UNKNOWN_MESSAGE')
      const pending = bridge.requestPage({ kind: 'category', categoryId: 'xbox', url: 'https://rutracker.org/forum/viewforum.php?f=887' })
      const rejected = expect(pending).rejects.toThrow('URL_NOT_ALLOWED')
      const command = await request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId })
      const invalidResponse = await request(connection.port, '/v1/responses', { token: connection.token, session: hello.body.sessionId, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, requestId: command.body.command.requestId, url: 'https://example.com/', html: '', httpStatus: 200 } })
      expect(invalidResponse.status).toBe(400)
      await rejected
    } finally { await bridge.stop() }
  })

  it('enforces the HTML size bound and rejects disconnected pending requests', async () => {
    expect(MAX_HTML_BYTES).toBe(10 * 1024 * 1024)
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: () => ({}) })
    const connection = await bridge.start()
    const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
    const oversized = await request(connection.port, '/v1/responses', { token: connection.token, session: hello.body.sessionId, method: 'POST', body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, requestId: 'unused', html: 'x'.repeat(MAX_HTML_BYTES + 1) }) })
    expect(oversized.status).toBe(413)
    const pending = bridge.requestPage({ kind: 'category', categoryId: 'xbox', url: 'https://rutracker.org/forum/viewforum.php?f=887' })
    await bridge.stop()
    await expect(pending).rejects.toThrow('COMPANION_DISCONNECTED')
    expect(hello.body.sessionId).toBeTruthy()
  })

  it('dispatches commands immediately to a waiting long-poll request', async () => {
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: () => ({ status: 'FORUM_READY' }) })
    const connection = await bridge.start()
    try {
      const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
      // Start waiting for commands before requestPage is called
      const pollPromise = request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId })
      // Now queue a page request
      const pagePromise = bridge.requestPage({ kind: 'category', categoryId: 'xbox', url: 'https://rutracker.org/forum/viewforum.php?f=887' })
      const pollResult = await pollPromise
      expect(pollResult.status).toBe(200)
      expect(pollResult.body.command).toBeTruthy()
      expect(pollResult.body.command.type).toBe('FETCH_CATEGORY')
      // Send response to complete
      await request(connection.port, '/v1/responses', { token: connection.token, session: hello.body.sessionId, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, requestId: pollResult.body.command.requestId, httpStatus: 200, sourceBytes: 100, url: pollResult.body.command.url, html: '<html><body>test</body></html>' } })
      const resolved = await pagePromise
      expect(resolved.status).toBe('FORUM_READY')
    } finally {
      await bridge.stop()
    }
  })

  it('decodes Windows-1251 Cyrillic without corruption', () => {
    const encoded = Uint8Array.from([0xd0, 0xe0, 0xe7, 0xf0, 0xe0, 0xe1, 0xee, 0xf2, 0xf7, 0xe8, 0xea])
    expect(new TextDecoder('windows-1251').decode(encoded)).toBe('Разработчик')
  })

  it('handles bidirectional disconnect synchronization', async () => {
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: () => ({ status: 'FORUM_READY' }) })
    const connection = await bridge.start()
    try {
      const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
      expect(bridge.getConnection().connected).toBe(true)

      // Extension initiates manual disconnect
      const dcRes = await request(connection.port, '/v1/disconnect', { token: connection.token, session: hello.body.sessionId, method: 'POST' })
      expect(dcRes.status).toBe(200)
      expect(dcRes.body.disconnected).toBe(true)

      // Bridge immediately reports disconnected
      expect(bridge.getConnection().connected).toBe(false)
      expect(bridge.getConnection().sessionId).toBeNull()

      // Subsequent command polling is rejected with HANDSHAKE_REQUIRED
      const pollAfter = await request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId })
      expect(pollAfter.status).toBe(409)
      expect(pollAfter.body.error).toBe('HANDSHAKE_REQUIRED')

      // Reconnect and test app-side disconnect
      const hello2 = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })
      expect(bridge.getConnection().connected).toBe(true)
      bridge.disconnect()
      expect(bridge.getConnection().connected).toBe(false)
    } finally {
      await bridge.stop()
    }
  })

  it('deduplicates in-flight topic detail requests', async () => {
    const bridge = new BrowserCompanionBridge({ appVersion: 'test', onPage: ({ html }: any) => ({ status: 'FORUM_READY', html }) })
    const connection = await bridge.start()
    try {
      const hello = await request(connection.port, '/v1/hello', { token: connection.token, method: 'POST', body: { protocolVersion: PROTOCOL_VERSION, extensionVersion: '0.1' } })

      // Fire two concurrent requests for the exact same topic URL
      const req1 = bridge.requestPage({ kind: 'topic', categoryId: 'xbox', topicId: '12345', url: 'https://rutracker.org/forum/viewtopic.php?t=12345' })
      const req2 = bridge.requestPage({ kind: 'topic', categoryId: 'xbox', topicId: '12345', url: 'https://rutracker.org/forum/viewtopic.php?t=12345' })

      // Only ONE command should be queued
      const pollResult = await request(connection.port, '/v1/commands', { token: connection.token, session: hello.body.sessionId })
      expect(pollResult.status).toBe(200)
      expect(pollResult.body.command.type).toBe('FETCH_TOPIC')
      expect(pollResult.body.command.topicId).toBe('12345')

      // Complete the single command
      await request(connection.port, '/v1/responses', {
        token: connection.token,
        session: hello.body.sessionId,
        method: 'POST',
        body: {
          protocolVersion: PROTOCOL_VERSION,
          requestId: pollResult.body.command.requestId,
          httpStatus: 200,
          sourceBytes: 100,
          url: pollResult.body.command.url,
          html: '<html><body>deduped topic</body></html>',
        },
      })

      // Both promises should resolve with the identical result
      const [res1, res2] = await Promise.all([req1, req2])
      expect(res1.html).toBe('<html><body>deduped topic</body></html>')
      expect(res2.html).toBe('<html><body>deduped topic</body></html>')

      // Verify no second command is waiting
      expect(bridge.queue.length).toBe(0)
      const pollAfter = await request(connection.port, '/v1/commands?nowait=1', { token: connection.token, session: hello.body.sessionId })
      expect(pollAfter.status).toBe(200)
      expect(pollAfter.body.command).toBeNull()
    } finally {
      await bridge.stop()
    }
  })
})
