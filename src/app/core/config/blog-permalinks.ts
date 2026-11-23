// Explicit migrations requested in SEO sheet tab 1264087386. The CMS IDs and
// article content stay intact; public links and canonical URLs use clean slugs.
export const PUBLIC_BLOG_PERMALINKS: Readonly<Record<string, string>> = {
  'trump-tarrif': 'trump-tariff',
  '/what-is-a-forex-currency-pair': 'what-is-a-forex-currency-pair',
  'how-to-calculate-forex-position-size:-formula,-lot-size-&-risk-examples': 'how-to-calculate-forex-position-size-formula-lot-size-risk-examples',
  'how-to-trade-stock-cfds-apple,-tesla-&-nvidia': 'how-to-trade-stock-cfds-apple-tesla-nvidia',
};
const storedByPublic: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PUBLIC_BLOG_PERMALINKS).map(([stored, published]) => [published, stored])
);
export function publicBlogPermalink(stored: string): string {
  return Object.prototype.hasOwnProperty.call(PUBLIC_BLOG_PERMALINKS, stored) ? PUBLIC_BLOG_PERMALINKS[stored] : stored;
}
export function storedBlogPermalink(published: string): string {
  return Object.prototype.hasOwnProperty.call(storedByPublic, published) ? storedByPublic[published] : published;
}
export function canonicalBlogPath(path: string): string {
  if (!path.startsWith('/blogs/')) return path;
  try {
    // Only the explicit legacy IDs are migrated. Do not rename any other
    // opaque CMS permalink, decode URL separators globally or alter queries.
    const stored = decodeURIComponent(path.slice('/blogs/'.length)).replace(/&amp;/g, '&');
    const published = publicBlogPermalink(stored);
    return published !== stored ? '/blogs/' + published : path;
  } catch {return path;}
}
