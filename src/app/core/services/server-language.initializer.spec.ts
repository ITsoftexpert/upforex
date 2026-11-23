import { Request } from 'express';
import { PageLanguageService } from './page-language.service';
import { initializeServerLanguage } from './server-language.initializer';

describe('Server language initialization', () => {
  it('uses the original request URL, including for localized deep links', async () => {
    const pages = jasmine.createSpyObj<PageLanguageService>('pages', ['prepare']);
    pages.prepare.and.resolveTo(true);
    await initializeServerLanguage(pages, { originalUrl: '/hi/partnerships/ib-programs?source=seo' } as Request)();
    expect(pages.prepare).toHaveBeenCalledOnceWith('/hi/partnerships/ib-programs?source=seo');
  });

  it('uses English root when prerendering without an HTTP request', async () => {
    const pages = jasmine.createSpyObj<PageLanguageService>('pages', ['prepare']);
    pages.prepare.and.resolveTo(true);
    await initializeServerLanguage(pages, null)();
    expect(pages.prepare).toHaveBeenCalledOnceWith('/');
  });

  it('waits for local catalogs before rendering', async () => {
    let finish!: (ready: boolean) => void;
    const pages = jasmine.createSpyObj<PageLanguageService>('pages', ['prepare']);
    pages.prepare.and.callFake(() => new Promise<boolean>(resolve => finish = resolve));
    let ready = false;
    const loading = initializeServerLanguage(pages, null)().then(() => ready = true);
    await Promise.resolve();
    expect(ready).toBeFalse();
    finish(true);
    await loading;
    expect(ready).toBeTrue();
  });
});
