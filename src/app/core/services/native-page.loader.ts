import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { contentKey } from '../config/content-keys';
import { NATIVE_I18N_VERSION } from '../config/i18n-coverage';
import { LOCALIZED_LANGUAGE_BY_PATH } from '../config/localized-routes';

export interface NativePageCatalog {
  __nativeI18nVersion: string;
  __nativePage: string;
  __nativeSourceKeys: string[];
  COPY: Record<string, string>;
  __nativeMetadata?: { title: string; description: string };
}

export function nativePageFile(language: string, page: string): string {
  if (!['en', ...Object.values(LOCALIZED_LANGUAGE_BY_PATH)].includes(language)) throw new Error('Unsupported native language');
  return `assets/i18n/native/${NATIVE_I18N_VERSION}/${language}/${contentKey(page)}.json`;
}

/** Only the current page is downloaded. Bound retained pages during navigation. */
@Injectable({ providedIn: 'root' })
export class NativePageLoader {
  private readonly cache = new Map<string, Promise<NativePageCatalog>>();
  constructor(private http: HttpClient) {}
  load(language: string, page: string): Promise<NativePageCatalog> {
    const file = nativePageFile(language, page);
    let loading = this.cache.get(file);
    if (!loading) {
      loading = firstValueFrom(this.http.get<NativePageCatalog>('/' + file)).then(catalog => {
        if (catalog.__nativeI18nVersion !== NATIVE_I18N_VERSION || catalog.__nativePage !== page || !Array.isArray(catalog.__nativeSourceKeys) || !catalog.COPY) throw new Error('Stale native page catalog');
        return catalog;
      }).catch(error => { this.cache.delete(file); throw error; });
      if (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(file, loading);
    }
    return loading;
  }
}
