import type { Request, Response } from 'express';
import { basename, extname } from 'node:path';

// Enforce framing/base/object protections without blocking the existing Google,
// Tawk and trading widgets. Script-source restrictions need a separate widget audit.
export const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const marketingPages = new Set([
  '', 'about-us', 'contact-us', 'accounts', 'risk-disclosure',
  'anti-money-laundering', 'privacy-policy', 'legal-documents', 'blogs',
  'platforms/mt5', 'products/forex-cfds', 'products/stock-cfds',
  'products/precious-metal', 'products/index-cfds', 'products/energy-cfds',
  'products/cryptocurrencies-cfd', 'partnerships',
  ...['partnership-benefits', 'ib-programs', 'money-managers', 'education-partners',
    'finfluencer', 'country-partners', 'social-trading', 'institutional-services']
    .map((page) => `partnerships/${page}`),
  ...['introduction-to-forex', 'trading-glossary', 'trading-rules', 'faq',
    'contract-specifications', 'tools'].map((page) => `resources/${page}`),
  ...['economic-calendar', 'currency-converter', 'pip-calculator',
    'fibonacci-calculator', 'currency-correlation', 'pivot-point-calculator',
    'margin-calculator', 'profit-calculator', 'currency-volatility', 'currency-heat-map']
    .map((page) => `resources/tools/${page}`),
  ...['abu-dhabi', 'cape-town', 'johannesburg', 'nairobi', 'south-africa',
    'kuala-lumpur', 'manila', 'singapore'].map((place) => `forex-trading-${place}`),
]);

export function securityHeaders(req: Request, res: Response, next: () => void): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    // Host only: do not force HTTPS for unaudited sibling subdomains.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  noStore(res);
  next();
}

export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
}

export function marketingCacheHeaders(req: Request, res: Response, html: string): void {
  noStore(res);
  const page = req.path.replace(/^\/(?:hi|ar|fr|es|de|zh-cn|zh-tw|ja|pt|ru)(?=\/|$)/, '')
    .replace(/^\//, '').replace(/\/$/, '');
  const blogDetail = /^blogs\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page);
  const variesByVisitor = String(res.getHeader('Vary') || '')
    .split(',').some((header) => /^(?:\*|cookie|authorization|accept-language)$/i.test(header.trim()));

  if (!['GET', 'HEAD'].includes(req.method) ||
      !['www.upforex.com', 'upforex.com'].includes(req.hostname) ||
      req.originalUrl.includes('?') || req.get('authorization') || req.get('cookie') ||
      res.statusCode !== 200 || res.getHeader('Set-Cookie') || variesByVisitor ||
      (!marketingPages.has(page) && !blogDetail) ||
      (blogDetail && !/class="blog-content"/.test(html)) ||
      /class="spinner-border\b/.test(html) ||
      />\s*(?:nav|FOOTER|auth)\.[A-Za-z0-9_]+\s*</.test(html)) {
    return;
  }

  // Browsers revalidate; Cloudflare may retain the anonymous HTML for 5 minutes.
  // The accompanying Cache Rule must respect these origin directives.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'public, max-age=300');
}

export function staticCacheHeaders(res: Response, file: string): void {
  if (extname(file) === '.html') {
    noStore(res);
    return;
  }
  const versioned = /\.[a-f0-9]{16,}\.(?:js|css|woff2|webp)$/.test(basename(file));
  const cache = versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  res.setHeader('Cache-Control', cache);
  res.setHeader('Cloudflare-CDN-Cache-Control', cache);
}
