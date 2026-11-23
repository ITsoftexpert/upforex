/** Cloudflare-supported exclusion markers, inserted after Angular SSR so its
 * template compiler cannot strip them. Comments sit outside the hydrated root.
 * Only completed public HTML is covered; caching/compression and private pages
 * retain their behavior. No new script, dependency or visitor request is added.
 * https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/
 */
export function protectPublicEmailMarkup(html: string): string {
  if (!/<html\b[^>]*\bdata-native-page-ready=(?:"true"|'true'|true)(?=[\s>])/i.test(html)) return html;
  const match = /<app-root(?=[\s>])/i.exec(html);
  const end = html.lastIndexOf('</app-root>');
  if (!match || end < match.index) return html;
  const finish = end + '</app-root>'.length;
  const startMarker = '<!--email_off-->', endMarker = '<!--/email_off-->';
  if (html.slice(match.index - startMarker.length, match.index) === startMarker &&
      html.slice(finish, finish + endMarker.length) === endMarker) return html;
  return html.slice(0, match.index) + startMarker + html.slice(match.index, finish) + endMarker + html.slice(finish);
}
