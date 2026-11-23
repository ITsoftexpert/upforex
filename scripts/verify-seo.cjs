const { decodeHTML } = require('entities');
const u = require('./i18n-release-utils.cjs');
const { alternates, verifyRelease } = require('./verify-native-release.cjs');
// Retained for English inventory collection; the release verifier also checks
// every current CMS article and every declared completed translation.
function publicPages() { return u.pageDefinitions().filter(page => !page.cms).map(page => page.path.slice(1)); }
function attribute(tag, name) {
  const value = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];
  return value === undefined ? undefined : decodeHTML(value);
}
function metadata(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const links = head.match(/<link\b[^>]*>/gi) || [];
  return { canonical: links.filter(tag => attribute(tag,'rel') === 'canonical'), alternates: links.filter(tag => attribute(tag,'hreflang')) };
}
function pageUrl(locale, page) { return 'https://www.upforex.com/' + [locale,page].filter(Boolean).join('/'); }
function expectedAlternates(page) { return alternates('/'+page,u.coverage().COMPLETED_NATIVE_PAGES['/'+page] || []); }
module.exports = { publicPages, metadata, attribute, expectedAlternates, pageUrl };
if (require.main === module) verifyRelease('seo').catch(error => { console.error(error); process.exitCode=1; });
