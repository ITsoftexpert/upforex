import { ServerPublicBlogInterceptor } from './core/services/server-public-blog.interceptor';
import { APP_INITIALIZER, ApplicationRef, NgModule, Optional } from '@angular/core';
import { BEFORE_APP_SERIALIZED, ServerModule } from '@angular/platform-server';
import { HTTP_INTERCEPTORS, provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateLoader } from '@ngx-translate/core';
import { REQUEST } from './core/tokens/ssr-request.tokens';

import { AppModule } from './app.module';
import { AppComponent } from './app.component';
import { ServerTranslateLoader } from './core/services/server-translate.loader';
import { initializeServerLanguage } from './core/services/server-language.initializer';
import { PageLanguageService } from './core/services/page-language.service';
import { NativeTranslationService } from './core/services/native-translation.service';
import { finalizeSsrLanguage, SSR_I18N_AUDIT } from './core/services/ssr-i18n-audit';
import { NativePageLoader } from './core/services/native-page.loader';
import { ServerNativePageLoader } from './core/services/server-native-page.loader';

@NgModule({
  imports: [
    AppModule,
    ServerModule,
  ],
  bootstrap: [AppComponent],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: ServerPublicBlogInterceptor, multi: true },
    // Use Angular's supported server HTTP backend and retain existing DI interceptors.
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    { provide: TranslateLoader, useClass: ServerTranslateLoader },
    { provide: NativePageLoader, useClass: ServerNativePageLoader },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeServerLanguage,
      deps: [PageLanguageService, [new Optional(), REQUEST]],
      multi: true,
    },
    {
      provide: BEFORE_APP_SERIALIZED,
      useFactory: finalizeSsrLanguage,
      deps: [ApplicationRef, NativeTranslationService, PageLanguageService, [new Optional(), REQUEST], [new Optional(), SSR_I18N_AUDIT]],
      multi: true,
    },
  ],
})
export class AppServerModule {}
