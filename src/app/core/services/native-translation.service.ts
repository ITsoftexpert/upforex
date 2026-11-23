import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, OnDestroy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { contentKey, needsContentTranslation, normalizeContent } from '../config/content-keys';
import { richContentUnits, RichContentUnit, richContentAttributes, isOpaqueContent } from '../config/rich-content';
import { NATIVE_I18N_VERSION } from '../config/i18n-coverage';
import { getEnglishPagePath } from '../config/localized-routes';

@Injectable({ providedIn: 'root' })
export class NativeTranslationService implements OnDestroy {
  private activePage = '/';
  private missing = new Map<string, Set<string>>();
  private used = new Map<string, Set<string>>();
  private sources = new Map<string, string>();
  private htmlCache = new Map<string, { html: string; units: RichContentUnit[]; attributes: string[] }>();
  private copy: Record<string, string> | undefined;
  private nativeValues = new Set<string>();
  private knownSourceKeys?: Set<string>;
  private readonly languageSubscription: Subscription;
  readonly missingContent$ = new Subject<string>();

  constructor(
    private translations: TranslateService,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.languageSubscription = this.translations.onLangChange.subscribe(() => {
      this.copy = undefined;
      this.nativeValues.clear();
      this.htmlCache.clear();
      this.knownSourceKeys = undefined;
    });
  }

  beginPage(url: string): void {
    this.activePage = this.pagePath(url);
    this.missing.delete(this.activePage);
    this.used.delete(this.activePage);
    this.copy = undefined;
    this.knownSourceKeys = undefined;
  }

  private pagePath(url: string): string {
    return getEnglishPagePath(url);
  }

  hasMissingContent(url: string): boolean {
    return !!this.missing.get(this.pagePath(url))?.size;
  }

  audit(url: string): { usedKeys: string[]; missingKeys: string[]; sources: Record<string, string> } {
    const page = this.pagePath(url);
    const usedKeys = [...(this.used.get(page) || [])];
    return { usedKeys, missingKeys: [...(this.missing.get(page) || [])],
      sources: Object.fromEntries(usedKeys.map(key => [key, this.sources.get(key)!])) };
  }

  private getCopy(): Record<string, string> {
    if (!this.copy) {
      // Read this language's own object. An English fallback must never count
      // as evidence that a foreign translation exists.
      const catalog = this.translations.translations[this.translations.currentLang || 'en'];
      const correctVersion = this.translations.currentLang === 'en' || catalog?.['__nativeI18nVersion'] === NATIVE_I18N_VERSION;
      const value = correctVersion ? catalog?.['COPY'] : {};
      this.copy = value && typeof value === 'object' ? value : {};
      this.nativeValues = new Set(Object.values(this.copy!).map(normalizeContent));
    }
    return this.copy!;
  }

  private record(source: string, present: boolean): void {
    const key = contentKey(source);
    const english = this.translations.translations['en'];
    if (english?.['__nativePage'] === this.activePage) {
      if (!this.knownSourceKeys) {
        const keys = english?.['__nativeI18nVersion'] === NATIVE_I18N_VERSION ? english?.['__nativeSourceKeys'] : [];
        this.knownSourceKeys = new Set(Array.isArray(keys) ? keys : []);
      }
      // An edited/new CMS message invalidates translated alternates even on
      // the English page. Existing English fallback is never translation proof.
      present = present && this.knownSourceKeys.has(key);
    }
    this.sources.set(key, normalizeContent(source));
    if (!this.used.has(this.activePage)) this.used.set(this.activePage, new Set());
    this.used.get(this.activePage)!.add(key);
    if (!present) {
      if (!this.missing.has(this.activePage)) this.missing.set(this.activePage, new Set());
      const missing = this.missing.get(this.activePage)!;
      if (!missing.has(key)) { missing.add(key); this.missingContent$.next(this.activePage); }
    }
  }

  translate(value: unknown, parameters?: unknown[]): string {
    if (value === null || value === undefined) return '';
    const source = String(value);
    if (/<\/?[a-z][^>]*>/i.test(source)) return this.translateHtml(source);
    return this.translateMessage(source, parameters);
  }

  /** Original plaintext from the CMS, even when it matches another translated value. */
  translateSource(value: unknown): string {
    if (value === null || value === undefined) return '';
    return this.translateMessage(String(value), undefined, true);
  }

  /** Approved page-specific head copy; never use it to translate visible body copy. */
  metadata(field: 'title' | 'description', source: unknown): string {
    const catalog = this.translations.translations[this.translations.currentLang || 'en'];
    const approved = catalog?.['__nativeI18nVersion'] === NATIVE_I18N_VERSION &&
      catalog?.['__nativePage'] === this.activePage ? catalog?.['__nativeMetadata']?.[field] : undefined;
    return typeof approved === 'string' && approved ? approved : this.translate(source);
  }

  private translateMessage(source: string, parameters?: unknown[], knownEnglish = false): string {
    let result = source;
    if (needsContentTranslation(source)) {
      const normalized = normalizeContent(source);
      const copy = this.getCopy();
      // Values from an already-translated JSON object must not be translated
      // again when they pass through a shared interpolation pipe.
      if (!knownEnglish && this.translations.currentLang !== 'en' && this.nativeValues.has(normalized)) return source;
      const translated = copy[contentKey(source)];
      this.record(source, this.translations.currentLang === 'en' || typeof translated === 'string');
      if (this.translations.currentLang !== 'en' && typeof translated === 'string') {
        const leading = /^\s/.test(source) ? ' ' : '';
        const trailing = /\s$/.test(source) ? ' ' : '';
        result = leading + normalizeContent(translated) + trailing;
      }
    }
    if (parameters) {
      result = result.replace(/\{(\d+)\}/g, (placeholder, index) =>
        Number(index) < parameters.length ? this.translate(parameters[Number(index)]) : placeholder
      );
    }
    return result;
  }

  private translateHtml(source: string): string {
    const key = (this.translations.currentLang || 'en') + ':' + source;
    const cached = this.htmlCache.get(key);
    if (cached) {
      const copy = this.getCopy();
      cached.units.forEach(unit => {
        if (needsContentTranslation(unit.text)) this.record(unit.message, this.translations.currentLang === 'en' || typeof copy[contentKey(unit.message)] === 'string');
      });
      cached.attributes.forEach(value => this.translateMessage(value));
      return cached.html;
    }
    const template = this.document.createElement('template');
    template.innerHTML = source;
    // The fallback supports server DOM implementations without template.content.
    const container = template.content || template;
    const attributes = richContentAttributes(container);
    attributes.forEach(attribute => {
      const translated = this.translateMessage(attribute.value);
      if (this.translations.currentLang !== 'en') (attribute.node as Element).setAttribute(attribute.name, translated);
    });
    const units = richContentUnits(container);
    for (const unit of units) {
      if (!needsContentTranslation(unit.text)) continue;
      const translated = this.translateMessage(unit.message);
      if (this.translations.currentLang === 'en' || translated === unit.message) continue;
      const replacement = this.document.createElement('template');
      replacement.innerHTML = translated;
      const content = replacement.content || replacement;
      const restore = (node: Node): Node | null => {
        if (node.nodeType === 3) return this.document.createTextNode(node.nodeValue || '');
        if (node.nodeType !== 1) return null;
        const slot = (node as Element).getAttribute('data-i18n-slot');
        const index = slot === null ? -1 : Number(slot);
        if ((node as Element).tagName.toLowerCase() !== 'span' || !Number.isInteger(index) || !unit.originals[index]) return null;
        const original = unit.originals[index] as Node;
        if (isOpaqueContent(original)) return original.cloneNode(true);
        const clone = original.cloneNode(false);
        Array.from(node.childNodes).forEach(child => { const restored = restore(child); if (restored) clone.appendChild(restored); });
        return clone;
      };
      const first = unit.nodes[0] as Node;
      const parent = first.parentNode;
      if (!parent) continue;
      for (const child of Array.from(content.childNodes)) {
        const restored = restore(child);
        if (restored) parent.insertBefore(restored, first);
      }
      unit.nodes.forEach(node => { const original = node as Node; original.parentNode?.removeChild(original); });
    }
    const html = this.translations.currentLang === 'en' ? source : template.innerHTML;
    if (this.htmlCache.size >= 24) this.htmlCache.delete(this.htmlCache.keys().next().value!);
    this.htmlCache.set(key, { html, units, attributes: attributes.map(attribute => attribute.value) });
    return html;
  }

  ngOnDestroy(): void {
    this.languageSubscription.unsubscribe();
    this.missingContent$.complete();
    this.missing.clear();
    this.used.clear();
    this.sources.clear();
    this.htmlCache.clear();
    this.knownSourceKeys?.clear();
  }
}
