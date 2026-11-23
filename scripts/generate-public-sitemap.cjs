// Server-only route inventory. No network requests or browser bundle imports.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const u = require('./i18n-release-utils.cjs');
const target = path.join(u.root, 'src/server/public-sitemap-pages.ts');
const previous = {};
if (fs.existsSync(target)) new Function('exports', ts.transpileModule(fs.readFileSync(target, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(previous);
const definitions = u.pageDefinitions();
const staticPages = definitions.filter(page => !page.cms).map(page => page.path);
const cmsPages = fs.existsSync(path.join(u.root, 'tmp/english-blog-api.json'))
  ? definitions.filter(page => page.cms).map(page => page.path)
  : previous.PUBLIC_CMS_SITEMAP_PATHS || [];
if (!staticPages.length) throw new Error('Public Angular routes are required for the sitemap.');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, '// Generated server-only public routes; retain CMS fallback when no local CMS audit exists.\n' +
  'export const PUBLIC_STATIC_SITEMAP_PATHS: readonly string[] = ' + JSON.stringify(staticPages, null, 2) + ';\n' +
  'export const PUBLIC_CMS_SITEMAP_PATHS: readonly string[] = ' + JSON.stringify(cmsPages, null, 2) + ';\n');
// Reuse the existing Featured Trading Guides section to make every current
// article discoverable in initial HTML, without fetching full articles at visit
// time or changing the cards, Load More control, page layout or English copy.
const snapshot = u.read('tmp/english-blog-api.json');
const articles = Array.isArray(snapshot?.data) ? snapshot.data : snapshot?.data?.blogs;
if (articles?.length) {
  const guides = articles.filter(article => article.permaLink && article.title).map(article => ({
    slug: u.publicBlogPermalink(article.permaLink), anchor: article.title,
  }));
  fs.writeFileSync(path.join(u.root, 'src/app/core/config/public-blog-guides.ts'),
    '// Generated exact CMS titles and public permalinks. No article bodies or model assets.\n' +
    'export const PUBLIC_BLOG_GUIDES: readonly {slug: string; anchor: string}[] = ' + JSON.stringify(guides, null, 2) + ';\n');
}
console.log(`Sitemap inventory: ${staticPages.length} static pages, ${cmsPages.length} CMS fallback pages.`);
