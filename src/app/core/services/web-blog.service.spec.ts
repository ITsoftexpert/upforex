import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ToastrService } from 'ngx-toastr';
import { WebBlogService } from './web-blog.service';

describe('WebBlogService public copy', () => {
  let service: WebBlogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: ToastrService, useValue: { error: jasmine.createSpy('error') } }],
    });
    service = TestBed.inject(WebBlogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('corrects titles and URLs in the listing while retaining pagination', () => {
    service.getAllBlogs({ pageNum: 1, pageLimit: 10, search: '' }).subscribe((res) => {
      expect(res.data[0].metaTitle).toBe('5 Crucial Differences Between Forex Demo and Real Accounts');
      expect(res.data[1].permaLink).toBe('trump-tariff');
      expect(res.data[1].description).not.toBe('Test');
      expect(res.metaData?.totalPage).toBe(3);
    });
    http.expectOne((req) => req.url.endsWith('/blogs/web')).flush({
      status: true,
      data: [
        { permaLink: '5-key-differences-between-forex-demo-and-real-account', metaTitle: '5 Crucial Difference Between Forex Demo and Real Account' },
        { permaLink: 'trump-tarrif', description: 'Test' },
      ],
      metaData: { totalPage: 3, pageNum: 1, pageLimit: 10 },
    });
  });

  it('loads the corrected tariff URL from the existing CMS record', () => {
    service.getBlogById('trump-tariff').subscribe((res) => {
      expect(res.data.permaLink).toBe('trump-tariff');
      expect(res.data.description).toContain('Understand tariffs');
    });
    http.expectOne('https://api.upforex.com/api/v1/blogs/web/trump-tarrif').flush({
      status: true,
      data: { permaLink: 'trump-tarrif', description: 'Test' },
    });
  });

  it('corrects recommended articles and uses the legacy CMS slug', () => {
    service.getRecommended('trump-tariff').subscribe((res) => {
      expect(res.data[0].title).toBe('Mastering the 1-Hour Forex Strategy');
    });
    http.expectOne('https://api.upforex.com/api/v1/blogs/web/trump-tarrif/recommended').flush({
      status: true,
      data: [{ permaLink: '1-hour-forex-strategy-a-simple-guide-for-traders', title: 'Mastering the 1 Hour Forex Strategy' }],
    });
  });

  it('uses the requested slug when a detail response omits it', () => {
    service.getBlogById('best-regulated-forex-platform').subscribe((res) => {
      expect(res.data.content).toBe('<p>Accountable to the financial authorities.</p>');
    });
    http.expectOne('https://api.upforex.com/api/v1/blogs/web/best-regulated-forex-platform').flush({
      status: true,
      data: { content: '<p>Accountable to the financial authorities..</p>' },
    });
  });

  it('preserves unsuccessful responses', () => {
    service.getBlogById('missing').subscribe((res) => {
      expect(res.status).toBeFalse();
      expect(res.data).toBeNull();
    });
    http.expectOne('https://api.upforex.com/api/v1/blogs/web/missing').flush({
      status: false,
      message: 'Article not found',
      data: null,
    });
  });
});
