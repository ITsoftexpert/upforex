import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { NativeTranslationService } from './native-translation.service';

/** Router title updates run after NavigationEnd; localize the final title too. */
@Injectable()
export class NativeTitleStrategy extends TitleStrategy {
  constructor(private title: Title, private native: NativeTranslationService) { super(); }
  override updateTitle(snapshot: RouterStateSnapshot): void {
    const source = this.buildTitle(snapshot);
    if (source === undefined) return;
    let publicPage = false, privatePage = false;
    let articlePage = false;
    const visit = (route: ActivatedRouteSnapshot): void => {
      if (route.data?.['localizedSeo'] === true) publicPage = true;
      if (route.data?.['localizedSeo'] === false) privatePage = true;
      if (route.routeConfig?.path === 'blogs/:id') articlePage = true;
      route.children.forEach(visit);
    };
    visit(snapshot.root);
    // The CMS component owns the real article title. The generic router title
    // must never overwrite it after its data has already rendered.
    if (articlePage) return;
    this.title.setTitle(publicPage && !privatePage ? this.native.metadata('title', source) : source);
  }
}
