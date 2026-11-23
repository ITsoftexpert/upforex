import { COMPLETED_NATIVE_PAGES } from './i18n-coverage';
import { canonicalBlogPath } from './blog-permalinks';

// URL prefixes and translation codes shared by routing and SSR redirects.
export const LOCALIZED_LANGUAGE_BY_PATH: Readonly<Record<string, string>> = {
  hi: 'hi',
  ar: 'ar',
  fr: 'fr',
  es: 'es',
  de: 'de',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja',
  pt: 'pt',
  ru: 'ru',
};

export function isLocalizedLanguagePath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCALIZED_LANGUAGE_BY_PATH, path);
}

export const PUBLIC_SITE_ORIGIN = 'https://www.upforex.com';

export interface HreflangAlternate {
  hreflang: string;
  href: string;
}

export function getCanonicalPath(url: string): string {
  const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const prefix = path.split('/')[1];
  const locale = isLocalizedLanguagePath(prefix) ? '/' + prefix : '';
  const page = canonicalBlogPath(path.slice(locale.length));
  return locale + (page === '/anti-monry-laundering' ? '/anti-money-laundering' : page);
}

export function getEnglishPagePath(path: string): string {
  const segments = getCanonicalPath(path).split('/').filter(Boolean);
  if (segments.length && isLocalizedLanguagePath(segments[0])) segments.shift();
  return segments.length ? '/' + segments.join('/') : '/';
}

export function getRequestedPageLanguage(path: string): string {
  const prefix = getCanonicalPath(path).split('/')[1];
  return isLocalizedLanguagePath(prefix) ? LOCALIZED_LANGUAGE_BY_PATH[prefix] : 'en';
}

export function completedPageLanguages(path: string): readonly string[] {
  const page = getEnglishPagePath(path);
  return Object.prototype.hasOwnProperty.call(COMPLETED_NATIVE_PAGES, page) ? COMPLETED_NATIVE_PAGES[page] : [];
}

export function getRenderedPageLanguage(path: string): string {
  const requested = getRequestedPageLanguage(path);
  return requested === 'en' || completedPageLanguages(path).includes(requested) ? requested : 'en';
}

export function getLocalizedPageAlternates(
  path: string,
  completed: readonly string[] = completedPageLanguages(path)
): HreflangAlternate[] {
  if (!completed.length) return [];
  const englishPath = getEnglishPagePath(path);
  const pagePath = englishPath === '/' ? '' : englishPath;
  const englishUrl = PUBLIC_SITE_ORIGIN + (pagePath || '/');
  const hreflangOverrides: Readonly<Record<string, string>> = {
    'zh-cn': 'zh-Hans',
    'zh-tw': 'zh-Hant',
    pt: 'pt-BR',
  };

  return [
    { hreflang: 'en', href: englishUrl },
    ...Object.keys(LOCALIZED_LANGUAGE_BY_PATH)
      .filter(languagePath => completed.includes(LOCALIZED_LANGUAGE_BY_PATH[languagePath]))
      .map((languagePath) => ({
      hreflang: hreflangOverrides[languagePath] || languagePath,
      href: `${PUBLIC_SITE_ORIGIN}/${languagePath}${pagePath}`,
    })),
    ...(completed.includes('pt') ? [{ hreflang: 'pt', href: `${PUBLIC_SITE_ORIGIN}/pt${pagePath}` }] : []),
    { hreflang: 'x-default', href: englishUrl },
  ];
}
