import { isPlatformBrowser } from '@angular/common';
import { PageLanguageService } from './page-language.service';

export function initializeBrowserLanguage(pages: PageLanguageService, document: Document, platformId: Object): () => Promise<unknown> {
  return () => isPlatformBrowser(platformId) ? pages.prepare(document.location?.pathname || '/') : Promise.resolve();
}
