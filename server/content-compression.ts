import type { Request, Response, NextFunction } from 'express';
import { existsSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { staticCacheHeaders } from './http-policy';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Serve build-time sidecars without changing asset URLs, MIME or cache policy. */
export function precompressedAssets(directory: string) {
  const root = resolve(directory);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!['GET', 'HEAD'].includes(req.method) || !/\.(?:js|css|json|svg|txt|xml)$/i.test(req.path)) return next();
    let file: string;
    try { file = resolve(root, '.' + decodeURIComponent(req.path)); } catch { return next(); }
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.vary('Accept-Encoding');
    // Preserve the original static server's byte-range behavior.
    if (req.get('range')) return next();
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    const suffix = encoding === 'br' ? '.br' : encoding === 'gzip' ? '.gz' : '';
    if (!suffix || !existsSync(file + suffix)) return next();
    staticCacheHeaders(res, file);
    res.type(extname(file));
    res.setHeader('Content-Encoding', encoding as string);
    res.sendFile(file + suffix, { cacheControl: false, acceptRanges: false }, error => {
      if (error) next(error);
    });
  };
}

/** Compress anonymous public HTML; private responses retain their original behavior. */
export async function sendCompressedHtml(req: Request, res: Response, html: string): Promise<void> {
  res.type('html');
  const publicRequest = ['GET', 'HEAD'].includes(req.method) &&
    !req.get('authorization') && !req.get('cookie') &&
    !/(?:^|\/)admin(?:\/|$)/.test(req.path) && !res.getHeader('Set-Cookie');
  if (!publicRequest || Buffer.byteLength(html) < 1024) { res.send(html); return; }
  res.vary('Accept-Encoding');
  const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
  const input = Buffer.from(html);
  const output = encoding === 'br'
    ? await brotli(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    : encoding === 'gzip' ? await gzipAsync(input, { level: 6 }) : input;
  if (encoding && encoding !== 'identity' && output.length < input.length) {
    res.setHeader('Content-Encoding', encoding);
    res.send(output);
  } else res.send(html);
}

/** Public CMS projections use the same negotiated compression as public HTML. */
export async function sendCompressedPublicJson(req: Request, res: Response, value: unknown): Promise<void> {
  const json = JSON.stringify(value); res.type('json'); res.vary('Accept-Encoding');
  const input = Buffer.from(json), encoding = req.acceptsEncodings('br', 'gzip', 'identity');
  if (input.length < 1024 || req.get('authorization') || req.get('cookie')) { res.send(json); return; }
  const output = encoding === 'br' ? await brotli(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    : encoding === 'gzip' ? await gzipAsync(input, { level: 6 }) : input;
  if (encoding && encoding !== 'identity' && output.length < input.length) { res.setHeader('Content-Encoding', encoding); res.send(output); }
  else res.send(json);
}
