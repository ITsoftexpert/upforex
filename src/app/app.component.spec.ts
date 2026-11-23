import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Data, NavigationEnd, Router, RouterStateSnapshot } from '@angular/router';
import { NativeTitleStrategy } from './core/services/native-title.strategy';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject } from 'rxjs';
import { AppComponent } from './app.component';
import { LanguageService } from './core/services/language.service';
import { NativeTranslationService } from './core/services/native-translation.service';
import { PageLanguageService } from './core/services/page-language.service';
import { COMPLETED_NATIVE_PAGES } from './core/config/i18n-coverage';
import { getRenderedPageLanguage } from './core/config/localized-routes';
import { UniversalCanonicalService } from './core/services/universal-canonical.service';

describe('Final router page title', () => {
  it('preserves the actual CMS title instead of restoring the generic article route title', () => {
    const title=jasmine.createSpyObj<Title>('title',['setTitle']);
    const native=jasmine.createSpyObj<NativeTranslationService>('native',['metadata']);
    const strategy=new NativeTitleStrategy(title,native);
    spyOn(strategy,'buildTitle').and.returnValue('Forex Blog Detail | UpForex');
    strategy.updateTitle({root:{data:{localizedSeo:true},children:[{routeConfig:{path:'blogs/:id'},data:{localizedSeo:false},children:[]}]}} as unknown as RouterStateSnapshot);
    expect(title.setTitle).not.toHaveBeenCalled();
    expect(native.metadata).not.toHaveBeenCalled();
  });
  it('keeps a completed public title translated after the final router update', () => {
    const title = jasmine.createSpyObj<Title>('title', ['setTitle']);
    const native = jasmine.createSpyObj<NativeTranslationService>('native', ['metadata']);
    native.metadata.and.returnValue('अनुवादित पेज शीर्षक');
    const strategy = new NativeTitleStrategy(title, native);
    spyOn(strategy, 'buildTitle').and.returnValue('Original English title');
    strategy.updateTitle({ root: { data: { localizedSeo: true }, children: [] } } as unknown as RouterStateSnapshot);
    expect(native.metadata).toHaveBeenCalledOnceWith('title', 'Original English title');
    expect(title.setTitle).toHaveBeenCalledOnceWith('अनुवादित पेज शीर्षक');
  });
  it('preserves private route titles without applying a public page catalog', () => {
    const title = jasmine.createSpyObj<Title>('title', ['setTitle']);
    const native = jasmine.createSpyObj<NativeTranslationService>('native', ['translate']);
    const strategy = new NativeTitleStrategy(title, native);
    spyOn(strategy, 'buildTitle').and.returnValue('Admin login');
    strategy.updateTitle({ root: { data: {}, children: [] } } as unknown as RouterStateSnapshot);
    expect(title.setTitle).toHaveBeenCalledOnceWith('Admin login');
    expect(native.translate).not.toHaveBeenCalled();
  });
});

describe('AppComponent localized SEO metadata', () => {
  const origin = 'https://www.upforex.com';
  const languages: [string, string][] = [
    ['', 'en'], ['hi', 'hi'], ['ar', 'ar'], ['fr', 'fr'], ['es', 'es'],
    ['de', 'de'], ['zh-cn', 'zh-Hans'], ['zh-tw', 'zh-Hant'],
    ['ja', 'ja'], ['pt', 'pt-BR'], ['ru', 'ru'],
  ];
  let fixture: ComponentFixture<AppComponent>;
  let page: Document;
  let router: { url: string; events: Subject<NavigationEnd> };
  let activeRoute: {
    snapshot: { data: Data; pathFromRoot: { routeConfig: { data: Data } }[] };
  };
  let savedCoverage: Record<string, readonly string[]>;

  beforeEach(async () => {
    savedCoverage = { ...COMPLETED_NATIVE_PAGES };
    const coverage = COMPLETED_NATIVE_PAGES as Record<string, string[]>;
    for (const path of ['/', '/about-us', '/accounts', '/products/forex-cfds', '/resources/tools/pip-calculator', '/accounts/account-types']) {
      coverage[path] = ['hi', 'ar', 'fr', 'es', 'de', 'zh-CN', 'zh-TW', 'ja', 'pt', 'ru'];
    }
    page = document.implementation.createHTMLDocument('SEO regression');
    const canonical = page.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = origin + '/';
    page.head.appendChild(canonical);
    router = { url: '/', events: new Subject<NavigationEnd>() };
    activeRoute = { snapshot: { data: {}, pathFromRoot: [] } };

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [
        Meta, Title, UniversalCanonicalService,
        { provide: DOCUMENT, useValue: page },
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: activeRoute },
        { provide: NgbModal, useValue: {} },
        { provide: LanguageService, useValue: jasmine.createSpyObj('LanguageService', ['setLanguage']) },
        { provide: NativeTranslationService, useValue: { translate: (value: string) => value, metadata: (_field: string, value: string) => value, missingContent$: new Subject<string>() } },
        { provide: PageLanguageService, useValue: { changed$: new Subject<void>(), languageFor: getRenderedPageLanguage, canAdvertise: () => true } },
      ],
    })
      .overrideComponent(AppComponent, { set: { template: '' } })
      .compileComponents();
  });

  afterEach(() => {
    router.events.complete();
    Object.keys(COMPLETED_NATIVE_PAGES).forEach(key => delete (COMPLETED_NATIVE_PAGES as Record<string, string[]>)[key]);
    Object.assign(COMPLETED_NATIVE_PAGES, savedCoverage);
  });

  function setRoute(url: string, kind: 'public' | 'private' | 'dynamic' = 'public'): void {
    router.url = url;
    activeRoute.snapshot.data = { title: 'Page ' + url };
    activeRoute.snapshot.pathFromRoot = kind === 'private' ? [] : [
      { routeConfig: { data: { localizedSeo: true } } },
    ];
    if (kind === 'dynamic') {
      activeRoute.snapshot.pathFromRoot.push({ routeConfig: { data: { localizedSeo: false } } });
    }
  }

  function render(url: string, kind: 'public' | 'private' | 'dynamic' = 'public'): void {
    setRoute(url, kind);
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  }

  function href(languagePath: string, contentPath: string): string {
    return origin + ([languagePath, contentPath].filter(Boolean).join('/')
      ? '/' + [languagePath, contentPath].filter(Boolean).join('/') : '/');
  }

  function assertMetadata(languagePath: string, contentPath: string): void {
    const canonical = page.querySelectorAll('link[rel="canonical"]');
    expect(canonical.length).toBe(1);
    expect(canonical[0].getAttribute('href')).toBe(href(languagePath, contentPath));
    const links = Array.from(page.querySelectorAll<HTMLLinkElement>('link[hreflang]'));
    expect(links.length).toBe(13);
    expect(new Set(links.map((link) => link.hreflang)).size).toBe(links.length);
    for (const [alternatePath, language] of languages) {
      expect(links.find((link) => link.hreflang === language)?.href)
        .withContext(language).toBe(href(alternatePath, contentPath));
    }
    expect(links.find((link) => link.hreflang === 'x-default')?.href).toBe(href('', contentPath));
    expect(links.find((link) => link.hreflang === 'pt')?.href).toBe(href('pt', contentPath));
  }

  for (const contentPath of ['', 'about-us', 'accounts', 'products/forex-cfds', 'resources/tools/pip-calculator']) {
    for (const [languagePath] of languages) {
      const path = new URL(href(languagePath, contentPath)).pathname;
      for (const tracking of [false, true]) {
        it(`keeps canonical/self/reciprocal URLs consistent for ${path}, tracking=${tracking}`, () => {
          render(tracking ? path.replace(/\/$/, '') + '/?utm_source=audit#section' : path);
          assertMetadata(languagePath, contentPath);
        });
      }
    }
  }

  it('replaces metadata during navigation between home, inner pages, and languages', () => {
    render('/hi');
    for (const [url, languagePath, contentPath] of [
      ['/ar/about-us?utm_source=audit#team', 'ar', 'about-us'],
      ['/accounts', '', 'accounts'],
      ['/de/accounts/account-types', 'de', 'accounts/account-types'],
      ['/', '', ''],
    ]) {
      setRoute(url);
      router.events.next(new NavigationEnd(1, url, url));
      assertMetadata(languagePath, contentPath);
      expect(page.title).toBe('Page ' + url);
    }
  });

  for (const [url, kind] of [
    ['/constructor/', 'private'], ['/does-not-exist', 'private'],
    ['/admin/login', 'private'], ['/terms', 'private'],
    ['/blogs/missing-article', 'dynamic'],
  ] as const) {
    it(`removes public-page alternates on ${url}`, () => {
      render('/hi/about-us');
      setRoute(url, kind);
      router.events.next(new NavigationEnd(1, url, url));
      expect(page.querySelectorAll('link[hreflang]').length).toBe(0);
    });
  }

  it('cleans up legacy homepage tags without removing a feed alternate', () => {
    const legacy = page.createElement('link');
    legacy.setAttribute('data-home-hreflang', '');
    legacy.hreflang = 'hi';
    page.head.appendChild(legacy);
    const feed = page.createElement('link');
    feed.rel = 'alternate';
    feed.type = 'application/rss+xml';
    page.head.appendChild(feed);
    render('/hi/about-us');
    assertMetadata('hi', 'about-us');
    expect(page.querySelector('link[data-home-hreflang]')).toBeNull();
    expect(page.head.contains(feed)).toBeTrue();
  });

  it('stops updating metadata after the component is destroyed', () => {
    render('/hi/about-us');
    fixture.destroy();
    setRoute('/ar/accounts');
    router.events.next(new NavigationEnd(1, router.url, router.url));
    assertMetadata('hi', 'about-us');
  });

  it('does not publish a translated canonical or alternates for an incomplete page', () => {
    render('/hi/pending-translation');
    expect(page.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(origin + '/pending-translation');
    expect(page.querySelectorAll('link[hreflang]').length).toBe(0);
  });

  it('only lists completed languages, including itself and reciprocal English', () => {
    (COMPLETED_NATIVE_PAGES as Record<string, string[]>)['/about-us'] = ['hi'];
    render('/hi/about-us');
    const languages = Array.from(page.querySelectorAll('link[hreflang]')).map(link => link.getAttribute('hreflang'));
    expect(languages).toEqual(['en', 'hi', 'x-default']);
  });
});
