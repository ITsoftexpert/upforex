import { ApplicationRef, InjectionToken } from '@angular/core';
import { Request } from 'express';
import { NativeTranslationService } from './native-translation.service';
import { PageLanguageService } from './page-language.service';

export interface SsrI18nAudit {
  url: string;
  language: string;
  usedKeys: string[];
  missingKeys: string[];
  sources: Record<string, string>;
}

// Optional local verifier callback. Nothing is exposed in public HTML or an HTTP endpoint.
export const SSR_I18N_AUDIT = new InjectionToken<((audit: SsrI18nAudit) => void)>('SSR_I18N_AUDIT');

export function finalizeSsrLanguage(
  application: ApplicationRef,
  native: NativeTranslationService,
  pages: PageLanguageService,
  request: Request | null,
  audit: ((result: SsrI18nAudit) => void) | null
): () => Promise<void> {
  return async () => {
    const url = request?.originalUrl || request?.url || '/';
    if (native.hasMissingContent(url)) {
      // CMS changes or a stale catalog must not publish mixed English content
      // under a supposedly completed foreign canonical/hreflang.
      await pages.fallbackToEnglish(url);
      application.tick();
    }
    audit?.({ url, language: pages.languageFor(url), ...native.audit(url) });
  };
}
