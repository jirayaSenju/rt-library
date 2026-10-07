const assert = require('node:assert/strict');
const { fetchImage, validateUrl, publicAddress, extractPageImage, classifyError, registerImageIPC, MAX_TRANSFER_BYTES } = require('../electron/images/imageFetch.cjs');
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const passthrough = async url => url;
const response = (body, type = 'image/png', status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': type, ...headers } });
const request = (fetchImpl, url = 'https://example.com/a.png', signal) => fetchImage(url, { fetchImpl, validate: passthrough, signal });
(async () => {
  await test('Image bytes travel as Uint8Array', async () => { const result = await request(async () => response(new Uint8Array([1, 2, 3]))); assert(result.ok); assert(result.bytes instanceof Uint8Array); assert.equal(result.bytes.length, 3); });
  await test('404/403/5xx and HTTP 200 HTML/JSON/missing MIME are rejected', async () => {
    for (const [status, type, expected] of [[404, 'image/jpeg', 'http_404'], [403, 'text/html', 'http_403'], [503, 'text/html', 'http_5xx'], [200, 'text/html', 'html_response'], [200, 'application/json', 'invalid_content_type'], [200, '', 'invalid_content_type'], [200, 'image/svg+xml', 'invalid_content_type']]) {
      const result = await request(async () => response('error', type, status)); assert(!result.ok); assert.equal(result.status, expected); assert(!result.bytes);
    }
  });
  await test('Empty body and excessive declared length rejected', async () => {
    assert.equal((await request(async () => response(''))).status, 'empty_body');
    assert(!(await request(async () => response('x', 'image/png', 200, { 'content-length': String(MAX_TRANSFER_BYTES + 1) }))).ok);
  });
  await test('Known viewer uses og:image with arbitrary attribute order', async () => {
    const urls = [];
    const result = await request(async url => { urls.push(url); return urls.length === 1 ? response('<meta content="https://i.postimg.cc/abc/a.png?a=1&amp;b=2" property="og:image">', 'text/html') : response('png'); }, 'https://postimg.cc/abc');
    assert(result.ok); assert.equal(urls[1], 'https://i.postimg.cc/abc/a.png?a=1&b=2');
    assert.equal(extractPageImage("<meta name='twitter:image' content='/a.png'>", 'https://ibb.co/id'), 'https://ibb.co/a.png');
  });
  await test('Missing og:image is a provider limitation', async () => assert.equal((await request(async () => response('<html>Challenge</html>', 'text/html'), 'https://postimg.cc/abc')).status, 'html_response'));
  await test('Redirects checked at each destination, bounded and reported', async () => {
    const checks = [];
    const result = await fetchImage('https://example.com/a', { validate: async url => { checks.push(url); return url; }, fetchImpl: async url => url.endsWith('/a') ? response('', '', 302, { location: '/b' }) : response('png') });
    assert(result.ok); assert.equal(result.redirects, 1); assert.deepEqual(checks, ['https://example.com/a', 'https://example.com/b']);
    const loop = await request(async () => response('', '', 302, { location: '/a' })); assert(!loop.ok);
  });
  await test('Dangerous protocols, credentials, local/private destinations blocked', async () => {
    for (const url of ['file:///etc/passwd', 'data:image/png,x', 'javascript:alert(1)', 'ftp://example.com/a', 'http://localhost/a', 'http://127.0.0.1/a', 'http://10.0.0.1/a', 'http://169.254.169.254/a', 'http://[::1]/a', 'http://[::ffff:127.0.0.1]/a', 'http://[fd00::1]/a', 'https://user:secret@example.com/a', 'http://example.com:9999/a']) await assert.rejects(validateUrl(url));
    for (const ip of ['127.0.0.1', '172.16.0.1', '192.168.1.1', '100.64.0.1', 'fe80::1', 'fec0::1', 'ff02::1', '64:ff9b::a00:1', '::ffff:7f00:1']) assert(!publicAddress(ip));
    assert(publicAddress('8.8.8.8')); assert(publicAddress('2606:4700:4700::1111'));
    const redirect = await fetchImage('http://8.8.8.8/a', { fetchImpl: async () => response('', '', 302, { location: 'file:///etc/passwd' }) }); assert(!redirect.ok);
  });
  await test('Abort interrupts a running request', async () => {
    const controller = new AbortController();
    const pending = request(async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), undefined, controller.signal);
    setTimeout(() => controller.abort(), 5); const result = await pending; assert(!result.ok);
  });
  await test('DNS, SSL and timeout failure classification', () => { assert.equal(classifyError({ cause: { code: 'ENOTFOUND' } }), 'provider_dead'); assert.equal(classifyError({ message: 'net::ERR_CERT_DATE_INVALID' }), 'ssl_error'); assert.equal(classifyError({ message: 'Connection timed out' }), 'timeout'); });
  await test('IPC rejects an untrusted sender and subframe', async () => {
    const handlers = {};
    registerImageIPC({ ipcMain: { handle: (name, callback) => handlers[name] = callback, on: (name, callback) => handlers[name] = callback }, net: {}, trustedUrl: url => url === 'file:///app/index.html' });
    const mainFrame = { url: 'file:///app/index.html' };
    for (const event of [{ sender: { mainFrame }, senderFrame: { url: 'https://evil.example' } }, { sender: { mainFrame }, senderFrame: { url: mainFrame.url } }]) {
      const result = await handlers['image:fetch'](event, { url: 'https://example.com/a', requestId: 'id' }); assert(!result.ok);
    }
  });
  console.log(`${passed} image transport tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
