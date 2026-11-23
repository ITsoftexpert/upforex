import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const CMS_ORIGIN = 'https://api.upforex.com';
export const STALE_REVIEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000, RETRY_MS = 60 * 1000, MAX_BYTES = 8 * 1024 * 1024;
export interface PublicArticle {
  _id: string; permaLink: string; title: string; metaTitle: string; description: string;
  content: string; createdAt: string; tags: string[]; categories: { _id: string; categoryName: string }[];
  [key: string]: unknown;
}
export interface BlogSnapshot { schema: 1; fetchedAt: string; source: string; articles: PublicArticle[]; sha256: string }
export class PublicCmsError extends Error { constructor(public status: number, message: string) { super(message); } }
export function snapshotHash(articles: PublicArticle[]): string {
  return createHash('sha256').update(JSON.stringify(articles)).digest('hex');
}
export function validateArticles(value: unknown): PublicArticle[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) throw Error('Invalid public CMS inventory');
  const ids = new Set(), slugs = new Set();
  for (const a of value) {
    if (!a || typeof a !== 'object' || !/^[a-f0-9]{24}$/i.test(a._id) || ids.has(a._id) ||
      typeof a.permaLink !== 'string' || !a.permaLink || a.permaLink.length > 500 || slugs.has(a.permaLink) ||
      !['title','metaTitle','description','content'].every(k => typeof a[k] === 'string' && a[k].trim()) ||
      !Number.isFinite(Date.parse(a.createdAt)) || !Array.isArray(a.tags) || !a.tags.every((t: unknown) => typeof t === 'string') ||
      !Array.isArray(a.categories) || !a.categories.every((c: any) => typeof c?._id === 'string' && typeof c?.categoryName === 'string'))
      throw Error('Incomplete or duplicate public CMS article');
    ids.add(a._id); slugs.add(a.permaLink);
  }
  return value;
}
export function validateSnapshot(value: any, now = Date.now()): BlogSnapshot {
  if (value?.schema !== 1 || value.source !== CMS_ORIGIN + '/api/v1/blogs/web' ||
    !Number.isFinite(Date.parse(value.fetchedAt)) || Date.parse(value.fetchedAt) > now + 60000)
    throw Error('Invalid public snapshot provenance');
  validateArticles(value.articles);
  if (snapshotHash(value.articles) !== value.sha256) throw Error('Public CMS snapshot checksum mismatch');
  return value;
}
const CARD_FIELDS = ['_id','permaLink','title','metaTitle','description','createdAt','featuredImageUrl','imageAltTag','categories'];
const DETAIL_FIELDS = [...CARD_FIELDS,'content','imageUrl','videoUrl','videoAltTag','textField','tags','updatedAt'];
const project = (a: PublicArticle, fields: string[]) => Object.fromEntries(fields.filter(k => k in a).map(k => [k, a[k]]));
function integer(value: string | null, fallback: number, max: number): number {
  if (value === null) return fallback;
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > max) throw new PublicCmsError(400, 'Invalid pagination');
  return Number(value);
}
export class PublicBlogStore {
  private snapshot?: BlogSnapshot;
  private pending?: Promise<void>;
  private nextRefresh = 0;
  private lastError?: string;
  private lastAttemptAt?: string;
  private persisted = false;
  constructor(private options: { seed: string; cacheFile?: string; fetcher?: typeof fetch; now?: () => number }) {
    const snapshots: BlogSnapshot[] = [];
    for (const file of [options.seed, options.cacheFile]) if (file && existsSync(file)) {
      try { snapshots.push(validateSnapshot(JSON.parse(readFileSync(file, 'utf8')), this.now())); }
      catch (e) { this.lastError = 'Snapshot rejected: ' + (e as Error).message; }
    }
    this.snapshot = snapshots.sort((a,b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt))[0];
    if (this.snapshot) this.nextRefresh = Date.parse(this.snapshot.fetchedAt) + REFRESH_MS;
  }
  private now(): number { return this.options.now?.() ?? Date.now(); }
  status() {
    const age = this.snapshot ? Math.max(0, this.now() - Date.parse(this.snapshot.fetchedAt)) : undefined;
    return { mode: 'frontend-public-cms-cache', source: CMS_ORIGIN, fetchedAt: this.snapshot?.fetchedAt,
      reviewAfter: this.snapshot ? new Date(Date.parse(this.snapshot.fetchedAt) + STALE_REVIEW_AFTER_MS).toISOString() : undefined,
      sourceSha256: this.snapshot?.sha256, articles: this.snapshot?.articles.length ?? 0,
      usable: age !== undefined, needsCmsAttention: age === undefined || age >= STALE_REVIEW_AFTER_MS, stale: age === undefined || age >= REFRESH_MS,
      refreshing: !!this.pending, lastAttemptAt: this.lastAttemptAt, lastError: this.lastError, persisted: this.persisted };
  }
  /** Called by Express, outside Angular's request Zone. Never block cached SSR on refresh. */
  refreshInBackground(): void {
    if (this.pending || this.now() < this.nextRefresh) return;
    this.pending = this.refresh().catch(e => { this.lastError = (e as Error).message; this.nextRefresh = this.now() + RETRY_MS; })
      .finally(() => { this.pending = undefined; });
  }
  async waitForRefresh(): Promise<void> { await this.pending; }
  private async refresh(): Promise<void> {
    this.lastAttemptAt = new Date(this.now()).toISOString();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    timer.unref?.();
    try {
      const articles: PublicArticle[] = [];
      // Existing backend ignores view=cards and reports document count as totalPage.
      // Fetch full public records in bounded batches; finish on a short batch.
      for (let page = 1; page <= 11; page++) {
        const response = await (this.options.fetcher ?? globalThis.fetch)(CMS_ORIGIN + `/api/v1/blogs/web?pageNum=${page}&pageLimit=100&search=`,
          { signal: controller.signal, headers: { accept: 'application/json' }, redirect: 'error' });
        if (!response.ok) throw Error('Public CMS HTTP ' + response.status);
        const reader = response.body?.getReader(); if (!reader) throw Error('Empty public CMS response');
        const chunks: Uint8Array[] = []; let length = 0;
        try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength;
          if (length > MAX_BYTES) throw Error('Public CMS response exceeds size limit'); chunks.push(part.value); }
        } catch (e) { await reader.cancel().catch(() => {}); throw e; }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result.status !== true || !Array.isArray(result.data)) throw Error('Public CMS returned unsuccessful data');
        if (result.data.length > 100) throw Error('Public CMS ignored pagination');
        articles.push(...result.data);
        if (result.data.length < 100) break;
        if (page === 11) throw Error('Public CMS inventory exceeds limit');
      }
      validateArticles(articles);
      // Match the current public newest-first listing, retaining all original fields/copy.
      articles.sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b._id.localeCompare(a._id));
      const snapshot: BlogSnapshot = { schema: 1, fetchedAt: new Date(this.now()).toISOString(),
        source: CMS_ORIGIN + '/api/v1/blogs/web', articles, sha256: snapshotHash(articles) };
      this.snapshot = snapshot; this.lastError = undefined; this.nextRefresh = this.now() + REFRESH_MS;
      if (this.options.cacheFile) {
        try { mkdirSync(join(this.options.cacheFile, '..'), { recursive: true });
          const temp = this.options.cacheFile + '.' + process.pid + '.tmp';
          writeFileSync(temp, JSON.stringify(snapshot)); renameSync(temp, this.options.cacheFile); this.persisted = true;
        } catch { this.lastError = 'Fresh cache is in memory; disk persistence unavailable'; }
      }
    } finally { clearTimeout(timer); }
  }
  read(path: string, params = new URLSearchParams()): { status: boolean; message: string; data: any; metaData?: any } {
    if (!this.status().usable) throw new PublicCmsError(503, 'Public CMS cache unavailable');
    const all = this.snapshot!.articles;
    if (path === '' || path === '/') {
      const pageNum = integer(params.get('pageNum'), 1, 10000), pageLimit = integer(params.get('pageLimit'), 10, 100);
      const search = params.get('search') ?? ''; if (search.length > 200) throw new PublicCmsError(400, 'Search too long');
      // Treat search as literal text; never execute user-provided regular expressions.
      const query = search.toLocaleLowerCase();
      const matching = query ? all.filter(a => [a.title, a['textField']].some(v => typeof v === 'string' && v.toLocaleLowerCase().includes(query))) : all;
      return { status: true, message: 'Blogs fetched successfully!', data: matching.slice((pageNum-1)*pageLimit,pageNum*pageLimit).map(a => project(a,CARD_FIELDS)),
        metaData: { totalPage: Math.ceil(matching.length/pageLimit), totalDocs: matching.length, pageNum, pageLimit } };
    }
    const recommendation = path.endsWith('/recommended');
    let slug: string; try { slug = decodeURIComponent(path.slice(1, recommendation ? -12 : undefined)); }
    catch { throw new PublicCmsError(400, 'Invalid article URL'); }
    const article = all.find(a => a.permaLink === slug);
    if (!article) throw new PublicCmsError(404, 'Blog not found!');
    if (!recommendation) return { status: true, message: 'Blog fetched successfully!', data: project(article,DETAIL_FIELDS) };
    const categories = new Set(article.categories.map(c => c._id));
    const related = all.filter(a => a._id !== article._id && (a.categories.some(c => categories.has(c._id)) || a.tags.some(t => article.tags.includes(t))))
      .sort((a,b) => a._id.localeCompare(b._id)).slice(0,6);
    return { status: true, message: related.length ? 'Blog fetched successfully!' : 'No related blogs found!',
      data: related.map(a => project(a,['_id','title','description','permaLink'])) };
  }
}
let singleton: PublicBlogStore | undefined;
export function publicBlogStore(): PublicBlogStore {
  return singleton ??= new PublicBlogStore({ seed: join(process.cwd(),'dist/upforex_Frontend/server/data/public-blog-snapshot.json'),
    cacheFile: join(process.env['PUBLIC_CMS_CACHE_DIR'] || join(process.cwd(),'var/public-cms'),'snapshot.json') });
}
