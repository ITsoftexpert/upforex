const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const assert = require('node:assert/strict');
const { parse } = require('parse5');
const { publicPages, metadata, attribute } = require('./verify-seo.cjs');
const { contentKey, normalizeContent } = require('./i18n-utils.cjs');

const root = path.resolve(__dirname, '..');
function find(node, name) {
  if (node.tagName === name) return node;
  for (const child of node.childNodes || []) { const result = find(child, name); if (result) return result; }
}
function text(node) { return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' '); }
async function main() {
  process.chdir(root);
  const out = path.join(root, 'tmp');
  fs.mkdirSync(out, { recursive: true });
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  const logs = fs.createWriteStream(path.join(out, 'native-english-ssr.log'));
  for (const method of Object.keys(originalConsole)) console[method] = (...args) => logs.write(util.format(...args) + '\n');
  const audits = new Map();
  const server = require(path.join(root, 'dist/upforex_Frontend/server/main.js')).app({ onI18nAudit: audit => audits.set(audit.url, audit) }).listen(0, '127.0.0.1');
  const pages = publicPages().map(page => '/' + page);
  const articleTitles = new Map();
  if (process.argv.includes('--include-blogs')) {
    await import('@angular/compiler');
    const { UrlSegment } = await import('@angular/router');
    const snapshot = JSON.parse(fs.readFileSync(path.join(out, 'english-blog-api.json'), 'utf8'));
    const articles = snapshot.data?.blogs || snapshot.data;
    assert(Array.isArray(articles), 'Expected the existing CMS English article snapshot');
    for (const article of articles) if (article.permaLink) {
      const page = '/blogs/' + new UrlSegment(require('./i18n-release-utils.cjs').publicBlogPermalink(article.permaLink), {}).toString();
      pages.push(page);
      articleTitles.set(page, article.title);
    }
  }
  const rows = [];
  const failures = [];
  try {
    if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    for (const page of pages) {
      try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${page}`, { signal: AbortSignal.timeout(45000) });
      assert.equal(response.status, 200, page);
      const body = await response.text();
      const document = parse(body);
      assert.equal(find(document, 'html').attrs.find(attr => attr.name === 'lang')?.value, 'en', page);
      const tags = metadata(body);
      assert.equal(tags.canonical.length, 1, page);
      assert.equal(attribute(tags.canonical[0], 'href'), 'https://www.upforex.com' + page, page);
      const audit = audits.get(page);
      assert(audit && audit.language === 'en', page + ': SSR audit callback missing');
      const rootText = normalizeContent(text(find(document, 'app-root')));
      if (articleTitles.has(page)) {
        assert(find(document, 'app-blogs'), page + ': article component missing');
        assert(rootText.includes(normalizeContent(articleTitles.get(page))), page + ': English article body was not rendered');
      }
      assert(!/\b(?:nav\.(?:home|about)|FOOTER\.[A-Z_]+|COPY\.t[\da-f]+)\b/.test(rootText), page + ': unresolved dictionary key');
      for (const [key, source] of Object.entries(audit.sources)) assert.equal(contentKey(source), key, page);
      rows.push({ path: page, ...audit, textCharacters: rootText.length });
      fs.writeFileSync(path.join(out, 'native-page-coverage.partial.json'), JSON.stringify({ createdAt: new Date().toISOString(), sourceLanguage: 'en', pages: rows }, null, 2) + '\n');
      process.stdout.write(`English SSR ${rows.length}/${pages.length}: ${page}\n`);
      } catch (error) {
        failures.push({ path: page, error: error.message });
        process.stdout.write(`HELD: ${page}: ${error.message}\n`);
      }
    }
    const report = { createdAt: new Date().toISOString(), sourceLanguage: 'en', translatedContentVerified: false,
      pages: rows, failures, note: 'English source/required-key inventory only. Failed pages must not be published as translated. Foreign completion requires validated local catalogs and separate SSR verification.' };
    fs.writeFileSync(path.join(out, 'native-page-coverage.json'), JSON.stringify(report, null, 2) + '\n');
    if (failures.length) process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    Object.assign(console, originalConsole);
    await new Promise(resolve => logs.end(resolve));
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
