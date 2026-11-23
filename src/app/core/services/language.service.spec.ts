import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from './language.service';

describe('LanguageService URL language', () => {
  const keys = ['uf_lang', 'upforex_language', 'uf_lang_manual', 'upforex_lang_manual'];
  let originalUrl: string;
  let saved: (string | null)[];
  let translate: jasmine.SpyObj<TranslateService>;
  let service: LanguageService;

  beforeEach(() => {
    originalUrl = location.pathname + location.search + location.hash;
    saved = keys.map((key) => localStorage.getItem(key));
    keys.forEach((key) => localStorage.removeItem(key));
    history.replaceState(null, '', '/');
    translate = jasmine.createSpyObj('TranslateService', ['use', 'setDefaultLang']);
    service = new LanguageService(translate, document.implementation.createHTMLDocument());
  });

  afterEach(() => {
    history.replaceState(null, '', originalUrl);
    keys.forEach((key, index) => {
      if (saved[index] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, saved[index]!);
    });
  });

  it('loads Hindi from a fresh direct URL', () => {
    history.replaceState(null, '', '/hi/partnerships/ib-programs');
    service.initLanguage();
    expect(translate.use).toHaveBeenCalledWith('hi');
    expect(service.getCurrentLanguage().code).toBe('hi');
    expect(localStorage.getItem('uf_lang')).toBe('hi');
    expect(localStorage.getItem('upforex_lang_manual')).toBe('true');
  });

  it('gives the URL priority over a conflicting saved preference', () => {
    localStorage.setItem('upforex_lang_manual', 'true');
    localStorage.setItem('upforex_language', 'ar');
    history.replaceState(null, '', '/hi/about-us');
    service.initLanguage();
    expect(translate.use).toHaveBeenCalledOnceWith('hi');
  });

  it('defaults to English without a locale or manual preference', () => {
    service.initLanguage();
    expect(translate.use).toHaveBeenCalledOnceWith('en');
  });

  it('retains an explicit preference on an unprefixed URL', () => {
    localStorage.setItem('upforex_lang_manual', 'true');
    localStorage.setItem('upforex_language', 'hi');
    service.initLanguage();
    expect(translate.use).toHaveBeenCalledOnceWith('hi');
  });

  it('returns the current selection before a language-switch reload', () => {
    history.replaceState(null, '', '/hi/partnerships/ib-programs');
    service.initLanguage();
    service.setLanguage('en', true);
    expect(service.getCurrentLanguage().code).toBe('en');
  });

  it('writes the document language and Arabic direction to the injected document', () => {
    const page = document.implementation.createHTMLDocument();
    const languages = new LanguageService(translate, page);
    languages.setLanguage('ar');
    expect(page.documentElement.lang).toBe('ar');
    expect(page.documentElement.dir).toBe('rtl');
    languages.setLanguage('hi');
    expect(page.documentElement.lang).toBe('hi');
    expect(page.documentElement.dir).toBe('ltr');
  });

  it('notifies the body translator when Angular changes the language', () => {
    const listener = jasmine.createSpy('body language listener');
    window.addEventListener('upforex:language-change', listener);
    try {
      service.setLanguage('hi', true);
      expect(listener).toHaveBeenCalledTimes(1);
      service.setLanguage('unsupported');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('upforex:language-change', listener);
    }
  });

  for (const [current, language, expected] of [
    ['/hi/partnerships/ib-programs?source=a#apply', 'en', '/partnerships/ib-programs?source=a#apply'],
    ['/hi/partnerships/ib-programs', 'ar', '/ar/partnerships/ib-programs'],
    ['/about-us', 'hi', '/hi/about-us'],
    ['/hi/', 'zh-CN', '/zh-cn'],
    ['/zh-tw/accounts', 'zh-TW', '/zh-tw/accounts'],
    ['/hi/', 'en', '/'],
  ]) {
    it(`switches ${current} to ${language} without losing the page`, () => {
      history.replaceState(null, '', current);
      expect(service.getLanguageUrl(language)).toBe(expected);
    });
  }
});
