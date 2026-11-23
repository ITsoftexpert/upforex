import { Request } from 'express';
import { PageLanguageService } from './page-language.service';

export function initializeServerLanguage(
  pages: PageLanguageService,
  request: Request | null
): () => Promise<unknown> {
  return () => {
    return pages.prepare(request?.originalUrl || request?.url || '/');
  };
}
