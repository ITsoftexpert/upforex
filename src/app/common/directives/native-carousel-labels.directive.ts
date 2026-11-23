import { AfterViewChecked, Directive, ElementRef, Input } from '@angular/core';
import { NativeTranslationService } from '../../core/services/native-translation.service';

/** Localize ng-bootstrap's screen-reader text without changing its controls. */
@Directive({
  standalone: false, selector: 'ngb-carousel[nativeCarouselLabels]' })
export class NativeCarouselLabelsDirective implements AfterViewChecked {
  @Input() nativeCarouselLabels = '';
  private sources = new WeakMap<HTMLElement, string[]>();
  constructor(private host: ElementRef<HTMLElement>, private native: NativeTranslationService) {}
  ngAfterViewChecked(): void {
    this.host.nativeElement.querySelectorAll<HTMLElement>('.carousel-item > .visually-hidden').forEach(label => {
      let numbers = this.sources.get(label);
      const original = /^\s*Slide\s+(\d+)\s+of\s+(\d+)\s*$/.exec(label.textContent || '');
      if (original) { numbers = original.slice(1); this.sources.set(label, numbers); }
      if (!numbers || !this.nativeCarouselLabels) return;
      const translated = this.native.translate(this.nativeCarouselLabels, numbers);
      if (label.textContent?.trim() !== translated) label.textContent = translated;
    });
  }
}
