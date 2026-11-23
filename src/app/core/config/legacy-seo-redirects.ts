// Verified replacements for legacy audit URLs. Canonical pages and CMS IDs stay intact.
export const LEGACY_SEO_PAGE_REDIRECTS: Readonly<Record<string, string>> = {
  '/blogs/trusted-forex-brokers-how-upforex-helps-traders': '/blogs/trusted-forex-brokers-in-uae-how-upforex-helps-traders',
  '/blogs/how-to-invest-in-gold-in-uae': '/blogs/how-to-invest-in-gold-in-the-uae',
  '/blogs/energy-cfd-trading-in-uae-with-upforex:-trade-global-energy-markets-smarter': '/blogs/energy-cfd-trading-in-uae-with-upforex-trade-global-energy-markets-smarter',
  '/products/forex': '/products/forex-cfds',
  '/products/us-stocks': '/products/stock-cfds',
};
// Both existing homepage CTAs already use this registration destination.
// These are offsite account actions, not indexable marketing pages.
export const LEGACY_ACCOUNT_REDIRECTS: Readonly<Record<string, string>> = {
  '/demo': 'https://client.upforex.live/?tab=register',
  '/live': 'https://client.upforex.live/?tab=register',
};
export function legacySeoDestination(path: string): string | undefined {
  try {
    const decoded = decodeURIComponent(path);
    return Object.prototype.hasOwnProperty.call(LEGACY_SEO_PAGE_REDIRECTS, decoded)
      ? LEGACY_SEO_PAGE_REDIRECTS[decoded] : undefined;
  } catch { return undefined; }
}
