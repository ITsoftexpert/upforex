import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, defer, of, throwError } from 'rxjs';
import { publicBlogStore, PublicCmsError } from '../../../../server/public-blog-store';
@Injectable()
export class ServerPublicBlogInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET' || !/^\/api\/public\/blogs(?:\/|\?|$)/.test(req.urlWithParams)) return next.handle(req);
    return defer(() => {
      try {
        const url = new URL(req.urlWithParams, 'https://www.upforex.com');
        return of(new HttpResponse({ status: 200, body: publicBlogStore().read(url.pathname.slice('/api/public/blogs'.length), url.searchParams), url: req.urlWithParams }));
      } catch (e) {
        return throwError(() => new HttpErrorResponse({ status: e instanceof PublicCmsError ? e.status : 503, url: req.urlWithParams, error: { status: false, data: null, message: (e as Error).message } }));
      }
    });
  }
}
