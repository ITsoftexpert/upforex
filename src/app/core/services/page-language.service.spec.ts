import { TranslateService } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { PageLanguageService } from './page-language.service';
import { LanguageService } from './language.service';
import { NativeTranslationService } from './native-translation.service';
import { COMPLETED_NATIVE_PAGES, ENGLISH_METADATA_ONLY_PAGES } from '../config/i18n-coverage';
import { NativePageLoader } from './native-page.loader';

describe('Page language coverage and loading', () => {
  let translations: jasmine.SpyObj<TranslateService>;
  let languages: jasmine.SpyObj<LanguageService>;
  let native: jasmine.SpyObj<NativeTranslationService>;
  let service: PageLanguageService;
  let saved: Record<string, readonly string[]>;
  let loader: jasmine.SpyObj<NativePageLoader>;

  beforeEach(() => {
    saved = { ...COMPLETED_NATIVE_PAGES };
    Object.keys(COMPLETED_NATIVE_PAGES).forEach(key => delete (COMPLETED_NATIVE_PAGES as Record<string, string[]>)[key]);
    translations = jasmine.createSpyObj('translations', ['use', 'getTranslation', 'setDefaultLang', 'setTranslation']);
    translations.getTranslation.and.returnValue(of({}));
    translations.use.and.returnValue(of({}));
    languages = jasmine.createSpyObj('languages', ['setLanguage']);
    native = jasmine.createSpyObj('native', ['beginPage']);
    loader = jasmine.createSpyObj<NativePageLoader>('loader', ['load']);
    loader.load.and.resolveTo({ __nativeI18nVersion: 'test', __nativePage: '/about-us', __nativeSourceKeys: [], COPY: {} });
    service = new PageLanguageService(translations, languages, native, loader);
  });
  afterEach(() => {
    Object.keys(COMPLETED_NATIVE_PAGES).forEach(key => delete (COMPLETED_NATIVE_PAGES as Record<string, string[]>)[key]);
    Object.assign(COMPLETED_NATIVE_PAGES, saved);
  });

  it('renders incomplete locale URLs in English rather than partially translated HTML', async () => {
    await service.prepare('/hi/partnerships/ib-programs');
    expect(translations.use).toHaveBeenCalledOnceWith('en');
    expect(languages.setLanguage).toHaveBeenCalledOnceWith('en');
    expect(service.languageFor('/hi/partnerships/ib-programs')).toBe('en');
  });
  it('loads approved English metadata without advertising an incomplete foreign article', async () => {
    const paths = ENGLISH_METADATA_ONLY_PAGES as string[], before = [...paths];
    paths.push('/blogs/test-head-only');
    try {
      await service.prepare('/hi/blogs/test-head-only');
      expect(loader.load).toHaveBeenCalledOnceWith('en', '/blogs/test-head-only');
      expect(service.languageFor('/hi/blogs/test-head-only')).toBe('en');
      expect(languages.setLanguage).toHaveBeenCalledOnceWith('en');
    } finally {paths.splice(0,paths.length,...before);}
  });

  for (const [prefix, language] of Object.entries({ hi: 'hi', ar: 'ar', fr: 'fr', es: 'es', de: 'de', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', ja: 'ja', pt: 'pt', ru: 'ru' })) {
    it(`loads the complete ${language} catalog before rendering`, async () => {
      (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = [language];
      const catalog = new Subject<object>();
      translations.getTranslation.and.callFake(requested => requested === language ? catalog : of({}));
      let rendered = false;
      const ready = service.prepare('/' + prefix + '/about-us').then(() => rendered = true);
      await Promise.resolve();
      expect(rendered).toBeFalse();
      expect(languages.setLanguage).not.toHaveBeenCalled();
      catalog.next({});
      await ready;
      expect(languages.setLanguage).toHaveBeenCalledOnceWith(language);
      expect(service.languageFor('/' + prefix + '/about-us')).toBe(language);
    });
  }

  it('falls back safely when a catalog fails to load', async () => {
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['ar'];
    translations.use.and.callFake(language => language === 'ar' ? throwError(() => new Error('Not found')) : of({}));
    await service.prepare('/ar/about-us');
    expect(languages.setLanguage).toHaveBeenCalledOnceWith('en');
    expect(service.languageFor('/ar/about-us')).toBe('en');
  });

  it('invalidates completed coverage if current CMS content is missing', async () => {
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi'];
    await service.prepare('/hi/about-us');
    await service.fallbackToEnglish('/hi/about-us');
    expect(service.languageFor('/hi/about-us')).toBe('en');
    expect(languages.setLanguage.calls.mostRecent().args).toEqual(['en']);
  });

  it('does not use a prototype property as a locale', async () => {
    await service.prepare('/constructor');
    expect(languages.setLanguage).toHaveBeenCalledOnceWith('en');
  });

  it('marks a loaded English source ready without declaring a foreign translation complete', async () => {
    const page = document.implementation.createHTMLDocument('source');
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi'];
    const current = new PageLanguageService(translations, languages, native, loader, page);
    await current.prepare('/about-us');
    expect(page.documentElement.getAttribute('data-native-page-ready')).toBe('true');
    expect(page.documentElement.hasAttribute('data-native-i18n')).toBeFalse();
    expect(languages.setLanguage).toHaveBeenCalledOnceWith('en');
    await current.fallbackToEnglish('/about-us');
    expect(page.documentElement.hasAttribute('data-native-page-ready')).toBeFalse();
  });

  it('does not mark an incomplete or failed page ready for the browser', async () => {
    const page = document.implementation.createHTMLDocument('source');
    const current = new PageLanguageService(translations, languages, native, loader, page);
    await current.prepare('/unknown');
    expect(page.documentElement.hasAttribute('data-native-page-ready')).toBeFalse();
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi'];
    loader.load.and.rejectWith(new Error('Missing file'));
    await current.prepare('/hi/about-us');
    expect(page.documentElement.hasAttribute('data-native-page-ready')).toBeFalse();
    expect(page.documentElement.hasAttribute('data-native-i18n')).toBeFalse();
  });

  it('drops translated alternates on English URLs when the source content changes', async () => {
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi'];
    await service.prepare('/about-us');
    await service.fallbackToEnglish('/about-us');
    expect(service.canAdvertise('/about-us')).toBeFalse();
    expect(service.canAdvertise('/hi/about-us')).toBeFalse();
    expect(service.languageFor('/hi/about-us')).toBe('en');
  });

  it('ignores a late catalog response from a canceled language navigation', async () => {
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi', 'fr'];
    const french = new Subject<object>();
    const hindi = new Subject<object>();
    translations.getTranslation.and.callFake(language => language === 'fr' ? french : language === 'hi' ? hindi : of({}));
    const older = service.prepare('/fr/about-us');
    const newer = service.prepare('/hi/about-us');
    await Promise.resolve();
    hindi.next({});
    expect(await newer).toBeTrue();
    french.next({});
    expect(await older).toBeFalse();
    expect(languages.setLanguage).toHaveBeenCalledOnceWith('hi');
    expect(translations.use).not.toHaveBeenCalledWith('fr');
  });
});
