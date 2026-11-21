import { TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule, TranslateService } from '@ngx-translate/core';
import { BundledTranslationLoader, initializeTranslations, languageFromPath } from './bundled-translation.loader';

describe('Translations during bootstrap and SSR', () => {
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot({
        loader: { provide: TranslateLoader, useClass: BundledTranslationLoader },
      })],
    });
    translate = TestBed.inject(TranslateService);
  });

  it('makes English labels available before the first template render', async () => {
    await initializeTranslations(translate, 'en')();
    expect(translate.instant('nav.home')).toBe('Home');
    expect(translate.instant('FOOTER.HOME')).toBe('Home');
    expect(translate.instant('FOOTER.MT5')).toBe('MetaTrader 5 (MT5)');
    expect(translate.instant('auth.signIn')).toBe('Sign In');
  });

  for (const language of ['en', 'hi', 'ar', 'fr', 'es', 'de', 'zh-CN', 'zh-TW', 'ja', 'pt', 'ru']) {
    it(`resolves every shared menu label in ${language} without an HTTP request`, async () => {
      await initializeTranslations(translate, language)();
      const keys = [
        'nav.home', 'nav.about', 'nav.products', 'nav.trading', 'nav.partnerships',
        'nav.resources', 'nav.contact', 'nav.blogs', 'auth.register', 'auth.signIn',
        'FOOTER.HOME', 'FOOTER.ABOUT_US', 'FOOTER.ACCOUNTS', 'FOOTER.MT5',
        'FOOTER.CONTACT_US', 'FOOTER.BLOGS', 'FOOTER.USEFUL_LINKS',
        'FOOTER.RISK_DISCLOSURE', 'FOOTER.PREVENT_MONEY_LAUNDERING',
        'FOOTER.PRIVACY_POLICY', 'FOOTER.LEGAL_DOCUMENTS',
      ];
      for (const key of keys) {
        expect(translate.instant(key)).not.toBe(key);
        expect(typeof translate.instant(key)).toBe('string');
      }
    });
  }

  it('uses English for keys missing from a partial catalog', async () => {
    await initializeTranslations(translate, 'fr')();
    expect(translate.instant('HOME.BANNER_TITLE')).toBe('New Revolutionary Smart Trading for a Global Market Edge');
    expect(translate.instant('nav.home')).toBe('Accueil');
  });

  it('maps URL language prefixes without treating arbitrary paths as languages', () => {
    expect(languageFromPath('/zh-cn/about-us?source=qa')).toBe('zh-CN');
    expect(languageFromPath('/ar/resources/tools')).toBe('ar');
    expect(languageFromPath('/about-us')).toBeUndefined();
    expect(languageFromPath('/unknown/about-us')).toBeUndefined();
  });
});
