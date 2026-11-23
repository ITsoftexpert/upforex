const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const express = require('express');
const { precompressedAssets, sendCompressedHtml } = require('../tmp/performance-server-tests/content-compression.js');
const { securityHeaders, staticCacheHeaders, marketingCacheHeaders } = require('../tmp/performance-server-tests/http-policy.js');
const body = '<!doctype html><html lang="hi"><head><link rel="canonical" href="https://www.upforex.com/hi"></head><body>' + 'सटीक अनुवादित पेज। '.repeat(200) + '</body></html>';
const raw = Buffer.from('const value = ' + JSON.stringify('unchanged original asset '.repeat(200)) + ';');
const name = 'main.0123456789abcdef.js';
async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upforex-compression-'));
  fs.writeFileSync(path.join(directory, name), raw);
  fs.writeFileSync(path.join(directory, name + '.br'), zlib.brotliCompressSync(raw));
  fs.writeFileSync(path.join(directory, name + '.gz'), zlib.gzipSync(raw));
  const app = express(); app.use(securityHeaders); app.use(precompressedAssets(directory));
  app.use(express.static(directory, { setHeaders: staticCacheHeaders }));
  app.get('*', async (req, res, next) => { try { marketingCacheHeaders(req, res, body); await sendCompressedHtml(req, res, body); } catch (error) { next(error); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: url, headers: { host: 'www.upforex.com', ...headers }, method }, res => {
      const chunks = []; res.on('data', data => chunks.push(data)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
  try { await run(request); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true }); }
}
for (const encoding of ['br', 'gzip', 'identity']) {
  test(encoding + ' keeps exact static bytes, MIME, security and immutable caching', () => fixture(async request => {
    const r = await request('/' + name, { 'accept-encoding': encoding });
    assert.equal(r.status, 200); assert.match(r.headers['content-type'], /javascript/);
    assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.match(r.headers.vary, /Accept-Encoding/);
    assert.equal(r.headers['content-encoding'], encoding === 'identity' ? undefined : encoding);
    assert.deepEqual(encoding === 'br' ? zlib.brotliDecompressSync(r.body) : encoding === 'gzip' ? zlib.gunzipSync(r.body) : r.body, raw);
  }));
  test(encoding + ' keeps exact initial translated HTML and public cache behavior', () => fixture(async request => {
    const r = await request('/hi', { 'accept-encoding': encoding });
    assert.equal(r.status, 200); assert.match(r.headers['content-type'], /text\/html/);
    assert.equal(r.headers['cache-control'], 'public, max-age=0, must-revalidate');
    assert.equal(r.headers['cloudflare-cdn-cache-control'], 'public, max-age=300');
    assert.equal((encoding === 'br' ? zlib.brotliDecompressSync(r.body) : encoding === 'gzip' ? zlib.gunzipSync(r.body) : r.body).toString(), body);
  }));
}
test('encoding negotiation honors q values and identity', () => fixture(async request => {
  assert.equal((await request('/' + name, { 'accept-encoding': 'br;q=0, gzip;q=1' })).headers['content-encoding'], 'gzip');
  assert.equal((await request('/hi', { 'accept-encoding': 'br;q=0, gzip;q=0, identity' })).headers['content-encoding'], undefined);
}));
test('HEAD has the compressed GET headers and no body', () => fixture(async request => {
  const r = await request('/' + name, { 'accept-encoding': 'br' }, 'HEAD');
  assert.equal(r.headers['content-encoding'], 'br'); assert.equal(r.body.length, 0);
}));
test('range request retains original byte-range semantics', () => fixture(async request => {
  const r = await request('/' + name, { 'accept-encoding': 'br', range: 'bytes=0-19' });
  assert.equal(r.status, 206); assert.equal(r.headers['content-encoding'], undefined); assert.deepEqual(r.body, raw.subarray(0, 20));
}));
test('compressed static ETag revalidation returns 304', () => fixture(async request => {
  const first = await request('/' + name, { 'accept-encoding': 'br' });
  const next = await request('/' + name, { 'accept-encoding': 'br', 'if-none-match': first.headers.etag });
  assert.equal(next.status, 304); assert.equal(next.body.length, 0);
}));
for (const [url, headers] of [['/hi', { cookie: 'session=private' }], ['/hi', { authorization: 'Bearer test' }], ['/admin/login', {}]]) {
  test('private HTML is uncompressed and no-store: ' + url + ' ' + Object.keys(headers), () => fixture(async request => {
    const r = await request(url, { ...headers, 'accept-encoding': 'br' });
    assert.equal(r.headers['content-encoding'], undefined); assert.equal(r.headers['cache-control'], 'private, no-store'); assert.equal(r.body.toString(), body);
  }));
}
