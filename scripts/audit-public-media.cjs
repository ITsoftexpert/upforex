// Read-only inventory of media referenced by the audited public HTML.
const fs = require('node:fs'), path = require('node:path');
const u = require('./i18n-release-utils.cjs');
process.chdir(path.resolve(__dirname, '..'));
const manifest = u.coverage(), version = manifest.NATIVE_I18N_VERSION;
const directory = 'tmp/verified-initial-html/' + version + '/en';
const rows = new Map();
const optimized = JSON.parse(fs.readFileSync('tmp/performance/optimized-media.json', 'utf8'));
const substitutions = new Map(optimized.map(row => [row.source.replace(/^src\//, ''), row.url]));
substitutions.set('https://raw.githubusercontent.com/ITsoftexpert/IMG/refs/heads/main/desktopApp1.png', optimized.find(row => row.url.includes('desktop-app')).url);
substitutions.set('https://upforex-assets.s3.eu-north-1.amazonaws.com/assets/images/JPG/home_banner_temp_1.webp', 'assets/images/JPG/home_banner_temp_1.webp');
for (const file of fs.readdirSync(directory)) {
  if (!file.endsWith('.html')) continue;
  const doc = u.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const page = u.elements(doc, 'link').find(node => u.attribute(node, 'rel') === 'canonical');
  const canonical = page && u.attribute(page, 'href');
  for (const node of u.elements(doc, 'img')) {
    let src = u.attribute(node, 'src'); if (!src || src.startsWith('data:')) continue;
    src = src.replace(/^\.\.\//, '').replace(/^(?:\.\.\/)+/, '');
    src = substitutions.get(src) || src;
    const url = new URL(src, 'https://www.upforex.com/').href;
    if (!rows.has(url)) rows.set(url, { url, pages: [], loading: u.attribute(node, 'loading') || 'eager' });
    const row = rows.get(url); if (canonical && !row.pages.includes(canonical)) row.pages.push(canonical);
  }
}
async function main() {
  const all = [...rows.values()]; let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < all.length) {
      const row = all[cursor++]; const url = new URL(row.url);
      if (url.origin === 'https://www.upforex.com') {
        const file = path.resolve('src', '.' + decodeURIComponent(url.pathname));
        if (file.startsWith(path.resolve('src') + path.sep) && fs.existsSync(file)) Object.assign(row, { bytes: fs.statSync(file).size, localFile: path.relative(process.cwd(), file).replaceAll('\\', '/') });
        else row.error = 'Local file unavailable in source';
      } else {
        try { const response = await fetch(row.url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
          Object.assign(row, { status: response.status, bytes: Number(response.headers.get('content-length')) || null, contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control') });
          if (!response.ok) row.error = 'HTTP ' + response.status;
        } catch (error) { row.error = error.message; }
      }
    }
  }));
  all.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  const report = { checkedAt: new Date().toISOString(), scope: 'Image URLs referenced by 111 audited English public pages; external HEAD requests, not encoded quality or viewport-size certification', count: all.length, optimized, imagesOver150KB: all.filter(row => row.bytes > 150000), errors: all.filter(row => row.error), images: all };
  fs.writeFileSync('tmp/performance/media-inventory.json', JSON.stringify(report, null, 2));
  const quote = x => '"' + String(x ?? '').replaceAll('"', '""') + '"';
  fs.writeFileSync('tmp/performance/media-inventory.csv', 'url,bytes,cacheControl,examplePage,pagesUsingImage,error\n' + all.map(row => [row.url, row.bytes, row.cacheControl, row.pages[0], row.pages.length, row.error].map(quote).join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ images: all.length, over150KB: report.imagesOver150KB.length, errors: report.errors.length, report: 'tmp/performance/media-inventory.json' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
