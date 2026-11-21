const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../scripts/purge-marketing-cache.mjs');
const credentials = { CLOUDFLARE_ZONE_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-placeholder' };

test('accepts and deduplicates only public marketing URLs', async () => {
  const { validateUrls } = await modulePromise;
  assert.deepEqual(validateUrls(['https://www.upforex.com/', 'https://www.upforex.com/']), ['https://www.upforex.com/']);
  for (const url of ['https://client.upforex.live/', 'https://www.upforex.com/admin', 'https://www.upforex.com/fr/admin/blogs', 'https://www.upforex.com/?token=example']) {
    assert.throws(() => validateUrls([url]));
  }
});

test('purges named URLs in batches without purging the entire zone', async () => {
  const { purgeUrls } = await modulePromise;
  const bodies = [];
  const request = async (_, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ success: true }) };
  };
  const urls = Array.from({ length: 31 }, (_, index) => `https://www.upforex.com/blogs/post-${index}`);
  assert.equal(await purgeUrls(urls, request, credentials), 31);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].files.length, 30);
  assert.equal(bodies[1].files.length, 1);
  assert.equal(bodies[0].purge_everything, undefined);
});

test('fails clearly when credentials or Cloudflare confirmation are missing', async () => {
  const { purgeUrls } = await modulePromise;
  const urls = ['https://www.upforex.com/'];
  await assert.rejects(() => purgeUrls(urls, undefined, {}), /CLOUDFLARE_ZONE_ID/);
  await assert.rejects(() => purgeUrls(urls, async () => ({ ok: false, status: 403, json: async () => ({ success: false }) }), credentials), /HTTP 403/);
});
