const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { securityHeaders, marketingCacheHeaders, staticCacheHeaders } = require('../tmp/server-tests/http-policy.js');

async function response(route, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use((req, res) => {
    const html = options.html || '<html><body>Home</body></html>';
    res.status(options.status || 200);
    if (options.setCookie) res.setHeader('Set-Cookie', 'session=example; Secure; HttpOnly');
    if (options.vary) res.setHeader('Vary', options.vary);
    if (options.file) staticCacheHeaders(res, options.file);
    else marketingCacheHeaders(req, res, html);
    res.send(html);
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port: server.address().port, path: route,
        method: options.method || 'GET',
        headers: { Host: 'www.upforex.com', 'X-Forwarded-Proto': 'https', ...options.headers },
      }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
      request.on('error', reject);
      request.end();
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('sets the four security headers and HTTPS HSTS, and hides Express branding', async () => {
  const { headers } = await response('/about-us');
  assert.match(headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.match(headers['content-security-policy'], /object-src 'none'/);
  assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['strict-transport-security'], 'max-age=31536000');
  assert.equal(headers['x-powered-by'], undefined);
});

for (const route of ['/', '/about-us', '/accounts', '/fr/about-us', '/zh-cn/resources/trading-rules', '/blogs']) {
  test(`permits 5-minute edge caching for anonymous ${route}`, async () => {
    const { headers } = await response(route);
    assert.equal(headers['cloudflare-cdn-cache-control'], 'public, max-age=300');
    assert.equal(headers['cache-control'], 'public, max-age=0, must-revalidate');
  });
}

for (const [description, route, options] of [
  ['admin', '/admin', {}], ['localized admin', '/fr/admin/blogs', {}],
  ['API', '/api/v1/blogs', {}], ['private terms', '/terms/private-id', {}],
  ['unknown route', '/not-a-real-page', {}], ['authorization', '/', { headers: { Authorization: 'Bearer example' } }],
  ['session cookie', '/', { headers: { Cookie: 'session=example' } }],
  ['query', '/?source=qa', {}], ['post', '/', { method: 'POST' }],
  ['portal hostname', '/', { headers: { Host: 'client.upforex.live' } }],
  ['cookie response', '/', { setCookie: true }], ['failed render', '/', { status: 500 }],
  ['not found', '/', { status: 404 }], ['visitor-specific response', '/', { vary: 'Cookie' }],
  ['untranslated SSR', '/', { html: '<a>nav.home</a>' }],
  ['incomplete SSR', '/blogs', { html: '<div class="spinner-border tw-text-white"></div>' }],
  ['missing blog', '/blogs/missing-article', {}],
]) {
  test(`never caches ${description}`, async () => {
    const { headers } = await response(route, options);
    assert.equal(headers['cache-control'], 'private, no-store');
    assert.equal(headers['cloudflare-cdn-cache-control'], 'no-store');
  });
}

test('caches a rendered public blog detail', async () => {
  const { headers } = await response('/blogs/example-article', { html: '<div class="blog-content">Public article</div>' });
  assert.equal(headers['cloudflare-cdn-cache-control'], 'public, max-age=300');
});

test('keeps raw index.html out of caches', async () => {
  const { headers } = await response('/index.html', { file: '/build/index.html' });
  assert.equal(headers['cache-control'], 'private, no-store');
});

test('uses immutable caching only for versioned bundles', async () => {
  const versioned = await response('/main.0123456789abcdef.js', { file: '/build/main.0123456789abcdef.js' });
  const unversioned = await response('/assets/i18n/en.json', { file: '/build/assets/i18n/en.json' });
  assert.equal(versioned.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(unversioned.headers['cache-control'], 'public, max-age=3600');
});

// A stale font/image must never be pinned just because it has a familiar filename.
test('only content-versioned fonts and images receive immutable caching', async () => {
  for (const file of ['/build/public-solid.0123456789abcdef.woff2', '/build/logo.0123456789abcdef.webp']) {
    const { headers } = await response('/asset', { file });
    assert.equal(headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(headers['cloudflare-cdn-cache-control'], headers['cache-control']);
  }
  for (const file of ['/build/Montserrat.woff2', '/build/logo.webp', '/build/logo.1234.webp', '/build/catalog.0123456789abcdef.json']) {
    const { headers } = await response('/asset', { file });
    assert.equal(headers['cache-control'], 'public, max-age=3600');
  }
});
