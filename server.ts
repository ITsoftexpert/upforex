import 'zone.js/node';

import { APP_BASE_HREF } from '@angular/common';
import { ngExpressEngine } from '@nguniversal/express-engine';
import * as express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppServerModule } from './src/main.server';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { marketingCacheHeaders, securityHeaders, staticCacheHeaders } from './server/http-policy';
import { INITIAL_SITE_LANGUAGE, languageFromPath } from './src/app/core/services/bundled-translation.loader';
// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  server.disable('x-powered-by');
  server.use(securityHeaders);
  const distFolder = join(process.cwd(), 'dist/upforex_Frontend/browser');
  const indexHtml = existsSync(join(distFolder, 'index.original.html'))
    ? 'index.original.html'
    : 'index';

  // Our Universal express-engine (found @ https://github.com/angular/universal/tree/main/modules/express-engine)
  server.engine(
    'html',
    ngExpressEngine({
      bootstrap: AppServerModule,
    })
  );

  server.set('view engine', 'html');
  server.set('views', distFolder);

  server.use((req, res, next) => {
    const queryIndex = req.url.indexOf('?');
    const requestPath =
      queryIndex === -1 ? req.url : req.url.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
    const normalizedPath = requestPath.replace(/\/{2,}/g, '/');

    if (normalizedPath !== requestPath) {
      res.redirect(301, `${normalizedPath}${query}`);
      return;
    }

    const correctedPath = normalizedPath
      .replace(/\/anti-monry-laundering\/?$/, '/anti-money-laundering')
      .replace(/\/blogs\/trump-tarrif\/?$/, '/blogs/trump-tariff');

    if (correctedPath !== normalizedPath) {
      res.redirect(301, `${correctedPath}${query}`);
      return;
    }

    next();
  });

  server.get('/products/index-future', (req, res) => {
    res.redirect(301, `/products/index-cfds${req.url.slice(req.path.length)}`);
  });

  server.get('/products/energy-future', (req, res) => {
    res.redirect(301, `/products/energy-cfds${req.url.slice(req.path.length)}`);
  });

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser

  server.use(
    '/sitemap.xml',
    createProxyMiddleware({
      target: 'https://api.upforex.com',
      changeOrigin: true,
      secure: false,
      pathRewrite: { '^/sitemap.xml': '/sitemap.xml' },
      onProxyRes(proxyRes, req, res) {
        res.setHeader('Content-Type', 'application/xml');
      },
    })
  );

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

  server.get(
    '*.*',
    express.static(distFolder, {
      maxAge: '1h',
      setHeaders: staticCacheHeaders,
    })
  );

  // All regular routes use the Universal engine
  server.get('*', (req, res) => {
    res.render(indexHtml, {
      req,
      providers: [
        { provide: APP_BASE_HREF, useValue: req.baseUrl },
        { provide: INITIAL_SITE_LANGUAGE, useValue: languageFromPath(req.path) || 'en' },
      ],
    }, (error: Error | null, html: string) => {
      if (error) {
        console.error('Unable to render page:', error);
        res.status(500).send('Unable to load this page. Please try again later.');
        return;
      }
      marketingCacheHeaders(req, res, html);
      res.send(html);
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

export * from './src/main.server';
