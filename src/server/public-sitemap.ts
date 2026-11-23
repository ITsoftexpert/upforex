import { get } from 'node:https';
import { RequestHandler } from 'express';
import { PUBLIC_SITE_ORIGIN, LOCALIZED_LANGUAGE_BY_PATH } from '../app/core/config/localized-routes';
import { COMPLETED_NATIVE_PAGES } from '../app/core/config/i18n-coverage';
import { PUBLIC_CMS_SITEMAP_PATHS, PUBLIC_STATIC_SITEMAP_PATHS } from './public-sitemap-pages';
import { canonicalBlogPath } from '../app/core/config/blog-permalinks';

interface SitemapEntry { path: string; lastmod?: string; }
const escapeXml = (value: string): string => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
const decodeXml = (value: string): string => value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (match, entity: string) => {
  if (!entity.startsWith('#')) return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()];
  const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
});

function cmsEntries(xml: string): SitemapEntry[] {
  if (!/<urlset\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid upstream sitemap');
  const entries: SitemapEntry[] = [];
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi)) {
    const location = /<loc\b[^>]*>([^<]+)<\/loc\s*>/i.exec(match[1])?.[1];
    if (!location) continue;
    try {
      const url = new URL(decodeXml(location.trim()));
      if (url.origin !== PUBLIC_SITE_ORIGIN || url.search || url.hash || !url.pathname.startsWith('/blogs/')) continue;
      // The CMS permalink is one opaque Angular route parameter. Preserve its
      // leading slash, commas and other reserved characters when encoding it.
      const permalink = decodeURIComponent(url.pathname.slice('/blogs/'.length));
      if (!permalink || /[\u0000-\u001f\u007f]/.test(permalink)) continue;
      const segment = encodeURIComponent(permalink)
        .replace(/%(?:40|3A|24|2C|26)/gi, decodeURIComponent)
        .replace(/\(/g, '%28').replace(/\)/g, '%29');
      const path = canonicalBlogPath('/blogs/' + segment);
      const rawDate = /<lastmod\b[^>]*>([^<]+)<\/lastmod\s*>/i.exec(match[1])?.[1].trim();
      const lastmod = rawDate && /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(rawDate) && Number.isFinite(Date.parse(rawDate)) ? rawDate : undefined;
      entries.push({ path, lastmod });
    } catch { /* Ignore invalid or foreign upstream locations. */ }
  }
  return entries;
}

export function buildPublicSitemap(
  upstream: string | undefined,
  staticPages: readonly string[] = PUBLIC_STATIC_SITEMAP_PATHS,
  fallbackCmsPages: readonly string[] = PUBLIC_CMS_SITEMAP_PATHS,
  completed: Readonly<Record<string, readonly string[]>> = COMPLETED_NATIVE_PAGES
): string {
  const pages = new Map<string, SitemapEntry>(staticPages.map(path => [path, { path }]));
  const cms = upstream === undefined ? fallbackCmsPages.map(path => ({ path })) : cmsEntries(upstream);
  for (const entry of cms) {
    const path = canonicalBlogPath(entry.path);
    pages.set(path, {...entry, path});
  }
  // HTML carries reciprocal hreflang. The sitemap lists canonical URLs only,
  // and never publishes a localized English fallback as a translated page.
  const rows: string[] = [];
  for (const [page, entry] of pages) {
    rows.push('<url><loc>' + escapeXml(PUBLIC_SITE_ORIGIN + page) + '</loc>' +
      (entry.lastmod ? '<lastmod>' + escapeXml(entry.lastmod) + '</lastmod>' : '') + '</url>');
    for (const [prefix, language] of Object.entries(LOCALIZED_LANGUAGE_BY_PATH)) {
      if (completed[page]?.includes(language)) rows.push('<url><loc>' + escapeXml(PUBLIC_SITE_ORIGIN + '/' + prefix + (page === '/' ? '' : page)) + '</loc></url>');
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + rows.join('') + '</urlset>\n';
}

function fetchCmsSitemap(): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get('https://api.upforex.com/sitemap.xml', response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Upstream sitemap unavailable')); return; }
      let xml = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        xml += chunk;
        if (Buffer.byteLength(xml) > 5 * 1024 * 1024) request.destroy(new Error('Upstream sitemap exceeds size limit'));
      });
      response.on('end', () => resolve(xml));
      response.on('error', reject);
    });
    request.setTimeout(8000, () => request.destroy(new Error('Upstream sitemap timeout')));
    request.on('error', reject);
  });
}

export function createPublicSitemapHandler(fetchUpstream: () => Promise<string> = fetchCmsSitemap): RequestHandler {
  let cached = buildPublicSitemap(undefined);
  let expires = 0;
  let refresh: Promise<void> | undefined;
  return async (_request, response) => {
    if (Date.now() >= expires) {
      if (!refresh) refresh = fetchUpstream().then(xml => { cached = buildPublicSitemap(xml); }).catch(() => {
        // Keep the last valid result (or the build-time English CMS inventory).
      }).finally(() => { expires = Date.now() + 5 * 60 * 1000; refresh = undefined; });
      await refresh;
    }
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    response.type('application/xml').send(cached);
  };
}
