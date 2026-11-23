import { Inject, Injectable, Optional } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CanActivateChild, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom, Subject } from 'rxjs';
import { completedPageLanguages, getCanonicalPath, getEnglishPagePath, getRenderedPageLanguage } from '../config/localized-routes';
import { NativePageLoader } from './native-page.loader';
import { LanguageService } from './language.service';
import { NativeTranslationService } from './native-translation.service';
import { ENGLISH_METADATA_ONLY_PAGES } from '../config/i18n-coverage';

/** Select a complete local catalog before either browser or SSR components render. */
@Injectable({ providedIn: 'root' })
export class PageLanguageService implements CanActivateChild {
  private invalidPages = new Set<string>();
  private activeUrl = '';
  private preparing?: Promise<boolean>;
  private selection = 0;
  private bases = new Map<string, Record<string, unknown>>();
  readonly changed$ = new Subject<void>();

  constructor(
    private translations: TranslateService,
    private languages: LanguageService,
    private native: NativeTranslationService,
    private loader: NativePageLoader,
    @Optional() @Inject(DOCUMENT) private document?: Document
  ) {}

  canActivateChild(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    return this.prepare(state.url);
  }

  languageFor(url: string): string {
    return this.canAdvertise(url) ? getRenderedPageLanguage(url) : 'en';
  }

  canAdvertise(url: string): boolean {
    return !this.invalidPages.has(getEnglishPagePath(url));
  }

  prepare(url: string): Promise<boolean> {
    const canonical = getCanonicalPath(url);
    if (canonical === this.activeUrl && this.preparing) return this.preparing;
    this.activeUrl = canonical;
    const selection = ++this.selection;
    const language = this.languageFor(url);
    this.preparing = (async () => {
      this.translations.setDefaultLang('en');
      try {
        // Preload without changing the active language. A canceled navigation
        // must not overwrite a newer route when its network response arrives.
        const page = getEnglishPagePath(url);
        const eligible = completedPageLanguages(url).length > 0;
        for (const code of [...new Set(['en', language])]) {
          if (!this.bases.has(code)) {
            const base = { ...await firstValueFrom(this.translations.getTranslation(code)) };
            delete base['COPY']; delete base['__nativeSourceKeys']; delete base['__nativePage']; delete base['__nativeMetadata'];
            this.bases.set(code, base);
          }
        }
        const english = eligible || ENGLISH_METADATA_ONLY_PAGES.includes(page) ? await this.loader.load('en', page) : {};
        const localized = eligible && language !== 'en' ? await this.loader.load(language, page) : {};
        if (selection !== this.selection) return false;
        this.native.beginPage(url);
        this.translations.setTranslation('en', { ...this.bases.get('en'), ...english }, false);
        if (language !== 'en') this.translations.setTranslation(language, { ...this.bases.get(language), ...localized }, false);
        await firstValueFrom(this.translations.use(language));
        if (selection !== this.selection) return false;
        this.markNative(language !== 'en' && eligible, eligible);
        this.languages.setLanguage(language);
      } catch {
        if (selection !== this.selection) return false;
        this.native.beginPage(url);
        this.invalidPages.add(getEnglishPagePath(url));
        await firstValueFrom(this.translations.use('en'));
        if (selection !== this.selection) return false;
        this.languages.setLanguage('en');
        this.markNative(false);
      }
      this.changed$.next();
      return true;
    })();
    return this.preparing;
  }

  async fallbackToEnglish(url: string): Promise<void> {
    if (!this.canAdvertise(url)) return;
    this.invalidPages.add(getEnglishPagePath(url));
    await firstValueFrom(this.translations.use('en'));
    this.languages.setLanguage('en');
    this.markNative(false);
    this.changed$.next();
  }

  private markNative(complete: boolean, sourceReady = false): void {
    if (complete) this.document?.documentElement.setAttribute('data-native-i18n', 'complete');
    else this.document?.documentElement.removeAttribute('data-native-i18n');
    // English source pages are also ready. Suppress the legacy browser widget
    // without falsely declaring a foreign translation complete.
    if (sourceReady) this.document?.documentElement.setAttribute('data-native-page-ready', 'true');
    else this.document?.documentElement.removeAttribute('data-native-page-ready');
  }
}
