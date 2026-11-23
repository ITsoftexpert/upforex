import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { NativeTranslationService } from './native-translation.service';
import { contentKey } from '../config/content-keys';
import { richContentUnits } from '../config/rich-content';
import { NATIVE_I18N_VERSION } from '../config/i18n-coverage';
import { NativeCarouselLabelsDirective } from '../../common/directives/native-carousel-labels.directive';
import { ElementRef } from '@angular/core';
import { LocalizePipe } from '../pipes/localize.pipe';

describe('Native English-source translation', () => {
  let native: NativeTranslationService;
  let translations: TranslateService;
  let page: Document;
  beforeEach(async () => {
    page = document.implementation.createHTMLDocument();
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers: [{ provide: DOCUMENT, useValue: page }] });
    translations = TestBed.inject(TranslateService);
    translations.setTranslation('en', { COPY: {} });
    translations.setDefaultLang('en');
    await firstValueFrom(translations.use('en'));
    native = TestBed.inject(NativeTranslationService);
    native.beginPage('/partnerships/ib-programs');
  });
  afterEach(() => native.ngOnDestroy());

  it('uses approved head metadata without replacing original English body copy', () => {
    translations.setTranslation('en', { __nativeI18nVersion: NATIVE_I18N_VERSION,
      __nativePage: '/partnerships/ib-programs', COPY: {},
      __nativeMetadata: { title: 'Approved head title', description: 'Approved head description' } });
    expect(native.metadata('title', 'Original heading')).toBe('Approved head title');
    expect(native.metadata('description', 'Original paragraph')).toBe('Approved head description');
    expect(native.translate('Original heading')).toBe('Original heading');
    expect(native.translate('Original paragraph')).toBe('Original paragraph');
    native.beginPage('/contact-us');
    expect(native.metadata('title', 'Contact title')).toBe('Contact title');
  });

  it('rejects stale head metadata', () => {
    translations.setTranslation('en', { __nativeI18nVersion: 'old', __nativePage: '/partnerships/ib-programs', COPY: {},
      __nativeMetadata: { title: 'Old title', description: 'Old description' } });
    expect(native.metadata('title', 'Original title')).toBe('Original title');
  });

  it('keeps sheet metadata with the rendered language when a page falls back to English', async () => {
    const metadata = (title: string) => ({ __nativeI18nVersion: NATIVE_I18N_VERSION,
      __nativePage: '/partnerships/ib-programs', COPY: {}, __nativeMetadata: { title, description: title } });
    translations.setTranslation('en', metadata('English approved title'));
    translations.setTranslation('hi', metadata('हिन्दी शीर्षक'));
    await firstValueFrom(translations.use('hi'));
    expect(native.metadata('title', 'Original title')).toBe('हिन्दी शीर्षक');
    await firstValueFrom(translations.use('en'));
    expect(native.metadata('title', 'Original title')).toBe('English approved title');
  });

  async function useHindi(copy: Record<string, string>): Promise<void> {
    translations.setTranslation('hi', { COPY: copy, __nativeI18nVersion: NATIVE_I18N_VERSION });
    await firstValueFrom(translations.use('hi'));
  }

  it('preserves exact English, whitespace, numbers and HTML source', () => {
    const html = '<p class="benefit">Trade <b>0.01 lots</b> at <a href="/accounts?a=1">1:300</a>.</p>';
    expect(native.translate(html)).toBe(html);
    expect(native.translate('  Earn commissions.\n')).toBe('  Earn commissions.\n');
    expect(native.hasMissingContent('/partnerships/ib-programs')).toBeFalse();
  });

  it('translates original CMS tags that coincide with native values while preserving translated JSON values', async () => {
    const source = 'bitcoin cfd';
    translations.setTranslation('fr', { __nativeI18nVersion: NATIVE_I18N_VERSION, COPY: {
      [contentKey('Bitcoin CFD')]: source,
      [contentKey(source)]: 'CFD sur bitcoins'
    } });
    await firstValueFrom(translations.use('fr'));
    expect(native.translate(source)).toBe(source);
    expect(native.translateSource(source)).toBe('CFD sur bitcoins');
    expect(native.hasMissingContent('/partnerships/ib-programs')).toBeFalse();
    native.translateSource('A new CMS keyword');
    expect(native.hasMissingContent('/partnerships/ib-programs')).toBeTrue();
    await firstValueFrom(translations.use('en'));
    expect(native.translateSource(source)).toBe(source);
  });

  it('renders original uppercase CMS tags even when they match an already-translated value', async () => {
    const source = 'OTC TRADING';
    translations.setTranslation('pt', { __nativeI18nVersion: NATIVE_I18N_VERSION, COPY: {
      [contentKey('Other original category')]: source,
      [contentKey(source)]: 'NEGOCIAÇÃO OTC'
    } });
    await firstValueFrom(translations.use('pt'));
    const pipe = new LocalizePipe(native);
    expect(pipe.transform(source)).toBe(source);
    expect(pipe.transform(source, undefined, true)).toBe('NEGOCIAÇÃO OTC');
    await firstValueFrom(translations.use('en'));
    expect(pipe.transform(source, undefined, true)).toBe(source);
  });

  it('preserves inline elements, styles, link destinations and technical code', async () => {
    const html = '<p class="benefit">Trade <b style="color:red">0.01 lots</b> at <a href="/accounts?a=1">1:300</a> <code>BUY</code>.</p>';
    const template = page.createElement('template');
    template.innerHTML = html;
    const source = richContentUnits(template.content)[0].message;
    const target = source.replace('Trade ', 'ट्रेड करें ').replace(' lots', ' लॉट').replace(' at ', ' पर ');
    await useHindi({ [contentKey(source)]: target });
    const translated = native.translate(html);
    template.innerHTML = translated;
    expect(template.content.querySelector('p')!.className).toBe('benefit');
    expect(template.content.querySelector('b')!.getAttribute('style')).toBe('color:red');
    expect(template.content.querySelector('a')!.getAttribute('href')).toBe('/accounts?a=1');
    expect(template.content.querySelector('a')!.textContent).toBe('1:300');
    expect(template.content.querySelector('code')!.textContent).toBe('BUY');
    expect(translated).toContain('ट्रेड करें');
    expect(native.hasMissingContent('/partnerships/ib-programs')).toBeFalse();
  });

  it('does not treat fallback English as a completed foreign translation', async () => {
    translations.setTranslation('en', { COPY: { [contentKey('Apply now')]: 'Apply now' } });
    translations.setTranslation('hi', {});
    await firstValueFrom(translations.use('hi'));
    expect(native.translate('Apply now')).toBe('Apply now');
    expect(native.hasMissingContent('/hi/partnerships/ib-programs')).toBeTrue();
  });

  it('resolves placeholders without translating emails or changing numeric terms', async () => {
    await useHindi({ [contentKey('Contact {0} for details')]: 'जानकारी के लिए {0} से संपर्क करें' });
    expect(native.translate('Contact {0} for details', ['support@upforex.com'])).toBe('जानकारी के लिए support@upforex.com से संपर्क करें');
    expect(native.translate('1:300')).toBe('1:300');
  });

  it('tracks missing content again when cached rich HTML appears on another page', async () => {
    await useHindi({});
    native.translate('<p>A new offer</p>');
    native.beginPage('/about-us');
    native.translate('<p>A new offer</p>');
    expect(native.hasMissingContent('/hi/about-us')).toBeTrue();
    expect(native.audit('/about-us').sources[contentKey('A new offer')]).toBe('A new offer');
  });

  it('translates image alternatives without changing asset URLs or layout attributes', async () => {
    await useHindi({ [contentKey('Trading platform')]: 'ट्रेडिंग प्लेटफ़ॉर्म' });
    const result = native.translate('<p><img src="/assets/platform.webp" alt="Trading platform" width="200"></p>');
    const template = page.createElement('template');
    template.innerHTML = result;
    const image = template.content.querySelector('img')!;
    expect(image.alt).toBe('ट्रेडिंग प्लेटफ़ॉर्म');
    expect(image.getAttribute('src')).toBe('/assets/platform.webp');
    expect(image.width).toBe(200);
  });

  it('renders translated carousel accessibility labels and preserves slide controls and numbers', async () => {
    const host=page.createElement('div');
    host.innerHTML='<div class="carousel-item"><span class="visually-hidden">Slide 1 of 7</span><img src="/slide.webp"></div>';
    const directive=new NativeCarouselLabelsDirective(new ElementRef(host),native);
    directive.nativeCarouselLabels='Slide {0} of {1}';
    directive.ngAfterViewChecked();
    expect(host.querySelector('span')!.textContent).toBe('Slide 1 of 7');
    await useHindi({[contentKey('Slide {0} of {1}')]: '{1} में से स्लाइड {0}'});
    directive.ngAfterViewChecked();
    expect(host.querySelector('span')!.textContent).toBe('7 में से स्लाइड 1');
    expect(host.querySelector('img')!.getAttribute('src')).toBe('/slide.webp');
    await firstValueFrom(translations.use('en'));
    directive.ngAfterViewChecked();
    expect(host.querySelector('span')!.textContent).toBe('Slide 1 of 7');
  });
});
