import { publicBlogStore, PublicCmsError } from './server/public-blog-store';
import 'zone.js/node';

import { marketingCacheHeaders, securityHeaders, staticCacheHeaders } from './server/http-policy';
import { precompressedAssets, sendCompressedHtml, sendCompressedPublicJson } from './server/content-compression';
import { protectPublicEmailMarkup } from './server/email-obfuscation';
import { legacySeoDestination, LEGACY_ACCOUNT_REDIRECTS } from './src/app/core/config/legacy-seo-redirects';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import bootstrap from './src/main.server';
import { isLocalizedLanguagePath } from './src/app/core/config/localized-routes';
import { SSR_I18N_AUDIT, SsrI18nAudit } from './src/app/core/services/ssr-i18n-audit';
import { createPublicSitemapHandler } from './src/server/public-sitemap';
import { canonicalBlogPath } from './src/app/core/config/blog-permalinks';
import { REQUEST, RESPONSE } from './src/app/core/tokens/ssr-request.tokens';
const LEGACY_PUBLIC_REDIRECTS: Readonly<Record<string, string>> = {
  '/anti-monry-laundering': '/anti-money-laundering',
  '/products/index-future': '/products/index-cfds',
  '/products/energy-future': '/products/energy-cfds',
};
// The Express app is exported so that it can be used by serverless Functions.
export function app(options: { onI18nAudit?: (audit: SsrI18nAudit) => void } = {}): express.Express {
  const server = express();
  server.disable('x-powered-by');
  server.use(securityHeaders);
  const distFolder = join(process.cwd(), 'dist/upforex_Frontend/browser');
  const indexHtml = join(distFolder, existsSync(join(distFolder, 'index.original.html'))
    ? 'index.original.html'
    : 'index.html');
  const engine = new CommonEngine({ allowedHosts: ['www.upforex.com'] });

  server.set('view engine', 'html');
  server.set('views', distFolder);

  server.use((req, res, next) => {
    const queryIndex = req.url.indexOf('?');
    const requestPath =
      queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
    let normalizedPath = requestPath.replace(/\/{2,}/g, '/');
    const languagePrefix = normalizedPath.split('/')[1];

    // Normalize every localized public URL, including inner pages, in one
    // redirect. Encoded path segments and the complete query remain intact.
    if (isLocalizedLanguagePath(languagePrefix)) {
      normalizedPath = normalizedPath.replace(/\/+$/, '');
    }
    const locale = isLocalizedLanguagePath(languagePrefix) ? `/${languagePrefix}` : '';
    const legacyPath = normalizedPath.slice(locale.length).replace(/\/+$/, '');
    if (LEGACY_PUBLIC_REDIRECTS[legacyPath]) normalizedPath = locale + LEGACY_PUBLIC_REDIRECTS[legacyPath];
    const replacement = legacySeoDestination(legacyPath);
    if (replacement) normalizedPath = locale + replacement;
    const canonicalBlog = canonicalBlogPath(legacyPath);
    if (canonicalBlog !== legacyPath) normalizedPath = locale + canonicalBlog;
    // Keep the existing account-registration flow; the target is a fixed URL.
    if (Object.prototype.hasOwnProperty.call(LEGACY_ACCOUNT_REDIRECTS, legacyPath)) {
      res.redirect(302, LEGACY_ACCOUNT_REDIRECTS[legacyPath]);
      return;
    }

    if (normalizedPath !== requestPath) {
      res.redirect(301, `${normalizedPath}${query}`);
      return;
    }

    next();
  });

  // Public read gateway belongs to the frontend Node process; the locked CMS is unchanged.
  const blogs = publicBlogStore();
  server.use((req, _res, next) => { if (!/(?:^|\/)admin(?:\/|$)/.test(req.path)) blogs.refreshInBackground(); next(); });
  server.get('/api/public-cms-status', (_req, res) => { const status = blogs.status(); res.setHeader('Cache-Control', 'private, no-store'); res.status(status.usable ? 200 : 503).json(status); });
  server.get('/api/public/blogs*', async (req, res, next) => {
    if (!/^\/api\/public\/blogs(?:\/|$)/.test(req.path)) return next();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('X-Public-Cms-Fetched-At', blogs.status().fetchedAt || 'unavailable');
    res.setHeader('X-Public-Cms-Stale', String(blogs.status().stale));
    try {
      const url = new URL(req.originalUrl, 'https://www.upforex.com');
      await sendCompressedPublicJson(req, res, blogs.read(url.pathname.slice('/api/public/blogs'.length), url.searchParams));
    } catch (e) { res.status(e instanceof PublicCmsError ? e.status : 503).json({ status: false, message: 'Unable to load public articles.', data: null }); }
  });

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser

  server.get('/sitemap.xml', createPublicSitemapHandler());

   // ===== Short links -> social pages =====
  const socialRedirects: Record<string, string> = {
    '/facebook': 'https://www.facebook.com/UpforexGlobal',
    '/instagram': 'https://www.instagram.com/upforexglobal/',
    '/linkedin': 'https://www.linkedin.com/company/upforex-ltd/',
    '/tiktok': 'https://www.tiktok.com/@upforex.global',
    '/x': 'https://x.com/upforex_global',
  };
  Object.entries(socialRedirects).forEach(([path, target]) => {
    server.get(path, (_req, res) => res.redirect(302, target));
  });

  server.use(precompressedAssets(distFolder));
  server.get(
    '*.*',
    express.static(distFolder, {
      maxAge: '1h',
      setHeaders: staticCacheHeaders,
    })
  );

  // Bind SSR to the site's public origin, never an untrusted Host header.
  server.get('*', (req, res, next) => {
    engine.render({
      bootstrap,
      documentFilePath: indexHtml,
      publicPath: distFolder,
      url: `https://www.upforex.com${req.originalUrl}`,
      providers: [
        { provide: APP_BASE_HREF, useValue: req.baseUrl },
        { provide: REQUEST, useValue: req },
        { provide: RESPONSE, useValue: res },
        ...(options.onI18nAudit ? [{ provide: SSR_I18N_AUDIT, useValue: options.onI18nAudit }] : []),
      ],
    }).then(async html => {
      if (res.statusCode === 200) html = protectPublicEmailMarkup(html);
      marketingCacheHeaders(req, res, html);
      await sendCompressedHtml(req, res, html);
    }).catch(error => {
      console.error('Unable to render page:', error);
      if (!res.headersSent) res.status(500).send('Unable to load this page. Please try again later.');
      else next(error);
    });
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

// Webpack will replace 'require' with '__webpack_require__'
// '__non_webpack_require__' is a proxy to Node 'require'
// The below code is to ensure that the server is run only when not requiring the bundle.
declare const __non_webpack_require__: NodeRequire;
const mainModule = __non_webpack_require__.main;
const moduleFilename = (mainModule && mainModule.filename) || '';
if (moduleFilename === __filename || moduleFilename.includes('iisnode')) {
  run();
}

export { publicBlogStore } from './server/public-blog-store';
export * from './src/main.server';
export { default } from './src/main.server';
