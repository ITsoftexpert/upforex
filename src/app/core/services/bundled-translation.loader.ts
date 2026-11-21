import { InjectionToken } from '@angular/core';
import { TranslateLoader, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Observable, of } from 'rxjs';
import en from '../../../assets/i18n/en.json';
import hi from '../../../assets/i18n/hi.json';
import ar from '../../../assets/i18n/ar.json';
import fr from '../../../assets/i18n/fr.json';
import es from '../../../assets/i18n/es.json';
import de from '../../../assets/i18n/de.json';
import zhCN from '../../../assets/i18n/zh-CN.json';
import zhTW from '../../../assets/i18n/zh-TW.json';
import ja from '../../../assets/i18n/ja.json';
import pt from '../../../assets/i18n/pt.json';
import ru from '../../../assets/i18n/ru.json';

const catalogs: Record<string, object> = {
  en, hi, ar, fr, es, de, 'zh-CN': zhCN, 'zh-TW': zhTW, ja, pt, ru,
};

export const INITIAL_SITE_LANGUAGE = new InjectionToken<string>('Initial site language', {
  providedIn: 'root',
  factory: () => 'en',
});

export function languageFromPath(path: string): string | undefined {
  const prefix = path.split(/[?#]/, 1)[0].split('/')[1]?.toLowerCase();
  return Object.keys(catalogs).find((language) => language.toLowerCase() === prefix);
}

// SSR cannot resolve the former relative HTTP URL for translation JSON. Bundling
// these small catalogs also prevents raw keys while the browser is bootstrapping.
export class BundledTranslationLoader implements TranslateLoader {
  getTranslation(language: string): Observable<object> {
    return of(catalogs[language] || catalogs.en);
  }
}

export function initializeTranslations(translate: TranslateService, language: string) {
  return () => {
    translate.setDefaultLang('en');
    return firstValueFrom(translate.use(language));
  };
}
