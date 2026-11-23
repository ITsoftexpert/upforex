const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const util = require('node:util');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
async function main() {
  process.chdir(root);
  const baseline = process.argv.includes('--baseline');
  const log = fs.createWriteStream('tmp/release-performance-ssr.log');
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const method of Object.keys(original)) console[method] = (...args) => log.write(util.format(...args) + '\n');
  const server = require(path.join(root, 'dist/upforex_Frontend/server/main.js')).app().listen(0, '127.0.0.1');
  const results = [];
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    for (const route of ['/', '/hi', '/about-us', '/hi/about-us', '/partnerships/ib-programs', '/hi/partnerships/ib-programs',
      '/blogs','/hi/blogs','/blogs/what-is-a-forex-currency-pair','/hi/blogs/what-is-a-forex-currency-pair']) {
      const samples = [];
      for (let index = 0; index < 4; index++) {
        const start = performance.now();
        const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { signal: AbortSignal.timeout(30000) });
        const headers = performance.now();
        const html = await response.text();
        if (!response.ok) throw new Error('Performance request failed: ' + route);
        if (index) samples.push({ ttfbMs: Number((headers - start).toFixed(2)), totalMs: Number((performance.now() - start).toFixed(2)), htmlGzipBytes: zlib.gzipSync(html).length });
      }
      samples.sort((a, b) => a.ttfbMs - b.ttfbMs);
      results.push({ route, median: samples[1], samples });
    }
    const assets = fs.readdirSync('dist/upforex_Frontend/browser').filter(name => /^(?:main|styles|runtime|polyfills|scripts)\..*\.(?:js|css)$/.test(name)).map(name => {
      const bytes = fs.readFileSync('dist/upforex_Frontend/browser/' + name);
      return { name, rawBytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length };
    });
    fs.writeFileSync(`tmp/release-performance${baseline ? '-baseline' : ''}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), kind: 'local warm SSR timing; not a production Core Web Vitals certification', results, assets }, null, 2) + '\n');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    Object.assign(console, original); await new Promise(resolve => log.end(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
