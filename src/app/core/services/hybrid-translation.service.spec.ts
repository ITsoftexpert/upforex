import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { HybridTranslationService } from './hybrid-translation.service';
import { Language, LanguageService } from './language.service';

describe('HybridTranslationService language synchronization', () => {
  const english: Language = { code: 'en', name: 'English', flag: '', dir: 'ltr' };
  const hindi: Language = { code: 'hi', name: 'हिन्दी', flag: '', dir: 'ltr' };
  let languages: BehaviorSubject<Language>;
  let service: HybridTranslationService;

  beforeEach(() => {
    languages = new BehaviorSubject(english);
    service = new HybridTranslationService({} as TranslateService, {
      currentLanguage$: languages.asObservable(),
    } as LanguageService);
    service.registerComponentTranslations('home', {
      en: { OPEN_ACCOUNT: 'Open Account' },
      hi: { OPEN_ACCOUNT: 'खाता खोलें' },
    });
  });

  afterEach(() => { service.ngOnDestroy(); languages.complete(); });

  it('updates manual body translations for URL-driven language changes', () => {
    expect(service.getTranslation('HOME.OPEN_ACCOUNT')).toBe('Open Account');
    languages.next(hindi);
    expect(service.getTranslation('HOME.OPEN_ACCOUNT')).toBe('खाता खोलें');
    languages.next(english);
    expect(service.getTranslation('HOME.OPEN_ACCOUNT')).toBe('Open Account');
  });

  it('uses the current language when created after route language resolution', () => {
    service.ngOnDestroy();
    languages.next(hindi);
    service = new HybridTranslationService({} as TranslateService, {
      currentLanguage$: languages.asObservable(),
    } as LanguageService);
    let current = '';
    const subscription = service.getCurrentLanguage$().subscribe((code) => current = code);
    expect(current).toBe('hi');
    subscription.unsubscribe();
  });

  it('unsubscribes when destroyed', () => {
    service.ngOnDestroy();
    languages.next(hindi);
    expect(service.getTranslation('HOME.OPEN_ACCOUNT')).toBe('Open Account');
  });
});
