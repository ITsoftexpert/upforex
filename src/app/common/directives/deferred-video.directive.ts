import { AfterViewInit, Directive, ElementRef, Inject, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Keep decorative offscreen video out of the initial loading waterfall. */
@Directive({
  selector: 'video[appDeferredVideo]',
  standalone: false,
  // Fit the existing fixed-height container before and after metadata loads.
  // object-fit alone does not constrain the video element's intrinsic height.
  host: { style: 'display: block; height: 100%;' },
})
export class DeferredVideoDirective implements AfterViewInit, OnDestroy {
  private observer?: IntersectionObserver;
  private loaded = false;
  constructor(private element: ElementRef<HTMLVideoElement>, private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.zone.runOutsideAngular(() => {
      const video = this.element.nativeElement;
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      const play = () => {
        if (!this.loaded) {
          video.querySelectorAll<HTMLSourceElement>('source[data-src]').forEach(source => {
            source.src = source.dataset['src']!;
          });
          this.loaded = true;
          video.load();
        }
        video.play().catch(() => { /* Autoplay may be disabled by the browser. */ });
      };
      if (typeof IntersectionObserver === 'undefined') { play(); return; }
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) entry.isIntersecting ? play() : video.pause();
      }, { rootMargin: '200px' });
      this.observer.observe(video);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (isPlatformBrowser(this.platformId) && this.loaded) {
      const video = this.element.nativeElement;
      video.pause();
      video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
      video.load();
    }
  }
}
