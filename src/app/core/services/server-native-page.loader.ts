import { Injectable } from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativePageCatalog, nativePageFile } from './native-page.loader';
import { NATIVE_I18N_VERSION } from '../config/i18n-coverage';

// Immutable catalogs may be shared; request-specific language state may not.
const catalogs = new Map<string, NativePageCatalog>();
@Injectable()
export class ServerNativePageLoader {
  async load(language: string, page: string): Promise<NativePageCatalog> {
    const file = nativePageFile(language, page);
    let catalog = catalogs.get(file);
    if (!catalog) {
      catalog = JSON.parse(readFileSync(join(process.cwd(), 'dist/upforex_Frontend/browser', file), 'utf8')) as NativePageCatalog;
      if (catalog.__nativeI18nVersion !== NATIVE_I18N_VERSION || catalog.__nativePage !== page || !Array.isArray(catalog.__nativeSourceKeys) || !catalog.COPY) throw new Error('Stale native page catalog');
      Object.freeze(catalog.COPY);
      Object.freeze(catalog.__nativeSourceKeys);
      if (catalog.__nativeMetadata) Object.freeze(catalog.__nativeMetadata);
      Object.freeze(catalog);
      if (catalogs.size >= 64) catalogs.delete(catalogs.keys().next().value!);
      catalogs.set(file, catalog);
    }
    return catalog;
  }
}
