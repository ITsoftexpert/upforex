import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NavbarComponent } from './layouts/navbar/navbar.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { TermsDisplayComponent } from './components/terms-display/terms-display.component';
import { LegelDocumentPgeComponent } from './legel-document-pge/legel-document-pge.component';
import { LOCALIZED_LANGUAGE_BY_PATH } from './core/config/localized-routes';
import { PageLanguageService } from './core/services/page-language.service';

const loadComponentsModule = () =>
  import('./components/components.module').then((m) => m.ComponentsModule);

const routes: Routes = [
  ...Object.keys(LOCALIZED_LANGUAGE_BY_PATH).map(
    (path) => ({
      path,
      component: NavbarComponent,
      canActivateChild: [PageLanguageService],
      data: { localizedSeo: true },
      loadChildren: loadComponentsModule,
    })
  ),
  {
    path: '',
    component: NavbarComponent,
    canActivateChild: [PageLanguageService],
    data: { localizedSeo: true },
    loadChildren: loadComponentsModule,
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./admin/admin.module').then((m) => m.AdminModule),
  },
  {
    path: 'terms',
    component: TermsDisplayComponent,
  },
  {
    path: 'terms/:version',
    component: TermsDisplayComponent,
  },
    {
    path: 'legal-documents',                     // <-- legal-doc 
    component: LegelDocumentPgeComponent,
  },
  {
    path: '**',
    component: NotFoundComponent,
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
      anchorScrolling: 'enabled',
      initialNavigation: 'enabledBlocking',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
