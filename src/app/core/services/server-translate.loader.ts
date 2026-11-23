import { TranslateLoader } from '@ngx-translate/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Observable, of } from 'rxjs';
import { LOCALIZED_LANGUAGE_BY_PATH } from '../config/localized-routes';

/** Server-only loader: read the same deployed JSON files as the browser. */
export class ServerTranslateLoader implements TranslateLoader {
  private static readonly catalogs = new Map<string, Record<string, unknown>>();
  getTranslation(language: string): Observable<Record<string, unknown>> {
    const supported = ['en', ...Object.values(LOCALIZED_LANGUAGE_BY_PATH)];
    if (!supported.includes(language)) {
      throw new Error(`Unsupported translation language: ${language}`);
    }
    const file = join(
      process.cwd(), 'dist/upforex_Frontend/browser/assets/i18n', `${language}.json`
    );
    if (!ServerTranslateLoader.catalogs.has(language)) ServerTranslateLoader.catalogs.set(language, JSON.parse(readFileSync(file, 'utf8')));
    // TranslateService may merge its root; never mutate the shared base object.
    return of({ ...ServerTranslateLoader.catalogs.get(language)! });
  }
}
