import {
  Component,
  Inject,
  OnDestroy,
  OnInit,
  NgZone,
  PLATFORM_ID,
  Renderer2,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { UniversalCanonicalService } from './core/services/universal-canonical.service';
import { NativeTranslationService } from './core/services/native-translation.service';
import { PageLanguageService } from './core/services/page-language.service';
import { DEFAULT_PUBLIC_KEYWORDS } from './core/config/i18n-coverage';
import {
  getCanonicalPath,
  getEnglishPagePath,
  getRequestedPageLanguage,
  completedPageLanguages,
  getLocalizedPageAlternates,
  PUBLIC_SITE_ORIGIN,
} from './core/config/localized-routes';

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'upforex_Frontend';
  isAdminRoute: boolean = false;
  private readonly destroyed$ = new Subject<void>();
  private cancelChatLoad?: () => void;

  constructor(
    private ngbModal: NgbModal,
    private renderer: Renderer2,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
    private metaService: Meta,
    private canonicalService: UniversalCanonicalService,
    private native: NativeTranslationService,
    private pages: PageLanguageService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
    private zone: NgZone
  ) {
    if (isPlatformBrowser(this.platformId))
      this.isAdminRoute = location.pathname.includes('admin');
    if (this.isAdminRoute) return;

    if (isPlatformBrowser(this.platformId)) this.scheduleChat();
  }

  private scheduleChat(): void {
    const view = this.document.defaultView;
    if (!view) return;
    this.zone.runOutsideAngular(() => {
      let loaded = false, idle: number | undefined;
      const cleanup = () => {
        view.clearTimeout(timer);
        if (idle !== undefined && 'cancelIdleCallback' in view) view.cancelIdleCallback(idle);
        view.removeEventListener('load', schedule);
        view.removeEventListener('pointerdown', load);
        view.removeEventListener('keydown', load);
      };
      const load = () => {
        if (loaded) return;
        loaded = true; cleanup();
        if (this.document.querySelector('script[data-upforex-chat]')) return;
        const globals = view as Window & { Tawk_API?: object; Tawk_LoadStart?: Date };
        globals.Tawk_API = globals.Tawk_API || {};
        globals.Tawk_LoadStart = new Date();
        const script = this.document.createElement('script');
        script.async = true;
        script.src = 'https://embed.tawk.to/67c736fc31a20f190e279ac9/1ilh2titl';
        script.charset = 'UTF-8'; script.crossOrigin = '*';
        script.setAttribute('data-upforex-chat', '');
        this.document.body.appendChild(script);
      };
      const schedule = () => {
        if ('requestIdleCallback' in view) idle = view.requestIdleCallback(load, { timeout: 2000 });
        else load();
      };
      // Load on first interaction, after the page settles, or after 5s at latest.
      const timer = view.setTimeout(load, 5000);
      view.addEventListener('pointerdown', load, { once: true, passive: true });
      view.addEventListener('keydown', load, { once: true });
      if (this.document.readyState === 'complete') schedule();
      else view.addEventListener('load', schedule, { once: true });
      this.cancelChatLoad = cleanup;
    });
  }

  ngOnInit(): void {
    if (this.isAdminRoute) return;

    // Handle both SSR and client-side routing
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroyed$)
      )
      .subscribe(() => {
        this.updateMetaTags();
      });

    this.updateMetaTags();
    this.pages.changed$.pipe(takeUntil(this.destroyed$)).subscribe(() => this.updateMetaTags());
    if (isPlatformBrowser(this.platformId)) {
      this.native.missingContent$.pipe(takeUntil(this.destroyed$)).subscribe(() => {
        // Let the current change-detection pass finish before changing language.
        Promise.resolve().then(() => this.pages.fallbackToEnglish(this.router.url));
      });
    }
  }

  private updateMetaTags(): void {
    let currentRoute = this.activatedRoute;
    while (currentRoute.firstChild) currentRoute = currentRoute.firstChild;
    const data = currentRoute.snapshot.data;
    const dynamicArticle = currentRoute.snapshot.routeConfig?.path === 'blogs/:id';
    const routeChain = currentRoute.snapshot.pathFromRoot;
    const defaultKeywords = routeChain.some(route => route.routeConfig?.data?.['localizedSeo'] === true) ? DEFAULT_PUBLIC_KEYWORDS : '';
    // ✅ Meta tags update
    if (!dynamicArticle && data['title']) this.titleService.setTitle(this.native.metadata('title', data['title']));
    if (!dynamicArticle && data['description'])
      this.metaService.updateTag({
        name: 'description',
        content: this.native.metadata('description', data['description']),
      });
    if (!dynamicArticle && (data['keywords'] || defaultKeywords))
      this.metaService.updateTag({
        name: 'keywords',
        content: this.native.translate(data['keywords'] || defaultKeywords),
      });

    const localizedSeo =
      routeChain.some((route) => route.routeConfig?.data?.['localizedSeo'] === true) &&
      (!routeChain.some((route) => route.routeConfig?.data?.['localizedSeo'] === false) ||
        (dynamicArticle && completedPageLanguages(this.router.url).length > 0));
    const requestedLanguage = getRequestedPageLanguage(this.router.url);
    const renderedLanguage = this.pages.languageFor(this.router.url);
    this.updateHreflangTags(localizedSeo && this.pages.canAdvertise(this.router.url) && requestedLanguage === renderedLanguage);

    // ✅ Canonical tag update (SSR and client-side compatible)
    // Match the public hreflang URLs, including on SSR and preview hosts.
    // Tracking parameters and fragments do not identify a different page.
    const currentUrl = PUBLIC_SITE_ORIGIN + (requestedLanguage === renderedLanguage
      ? getCanonicalPath(this.router.url) : getEnglishPagePath(this.router.url));
    this.canonicalService.setCanonicalURL(currentUrl);
  }

  private updateHreflangTags(localizedSeo: boolean): void {
    const head = this.document.head;
    head
      .querySelectorAll('link[data-home-hreflang], link[data-page-hreflang]')
      .forEach((link) => this.renderer.removeChild(head, link));

    if (!localizedSeo) return;

    getLocalizedPageAlternates(this.router.url).forEach(({ hreflang, href }) => {
      const link = this.renderer.createElement('link');
      this.renderer.setAttribute(link, 'rel', 'alternate');
      this.renderer.setAttribute(link, 'hreflang', hreflang);
      this.renderer.setAttribute(link, 'href', href);
      this.renderer.setAttribute(link, 'data-page-hreflang', '');
      this.renderer.appendChild(head, link);
    });
  }

  // ✅ Update canonical URL (SSR-friendly)
  updateCanonicalUrl(url: string) {
    if (isPlatformBrowser(this.platformId)) {
      // Remove existing canonical tag
      const existingCanonical = document.querySelector('link[rel="canonical"]');
      if (existingCanonical) {
        existingCanonical.remove();
      }

      // Add new canonical tag
      const linkElement = document.createElement('link');
      linkElement.setAttribute('rel', 'canonical');
      linkElement.setAttribute('href', url);
      document.head.appendChild(linkElement);
    }
  }

  // ✅ Canonical tag function (legacy support)
  setCanonical(url: string) {
    this.canonicalService.setCanonicalURL(url);
  }

  ngOnDestroy(): void {
    this.cancelChatLoad?.();
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
