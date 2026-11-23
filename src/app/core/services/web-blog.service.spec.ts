import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ToastrService } from 'ngx-toastr';
import { WebBlogService } from './web-blog.service';

describe('Existing CMS permalink requests', () => {
  let service: WebBlogService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: ToastrService, useValue: jasmine.createSpyObj('toastr', ['error']) },
    ] });
    service = TestBed.inject(WebBlogService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  for (const id of ['what-is-a-forex-quote', '/what-is-a-forex-currency-pair', 'position-size: formula, lot & risk']) {
    for (const recommended of [false, true]) {
      it(`encodes the stored ID as one API segment (${id}, recommended=${recommended})`, () => {
        let received = false;
        const request = recommended ? service.getRecommended(id) : service.getBlogById(id);
        request.subscribe(response => received = response.status);
        const pending = http.expectOne('https://api.upforex.com/api/v1/blogs/web/' + encodeURIComponent(id) + (recommended ? '/recommended' : ''));
        expect(pending.request.method).toBe('GET');
        pending.flush({ status: true, message: '', data: {} });
        expect(received).toBeTrue();
      });
    }
  }
  it('resolves clean public slugs to the unchanged stored CMS ID', () => {
    service.getBlogById('what-is-a-forex-currency-pair').subscribe();
    http.expectOne('https://api.upforex.com/api/v1/blogs/web/%2Fwhat-is-a-forex-currency-pair').flush({status:true,data:{},message:''});
  });
  it('publishes clean internal links without editing CMS objects or article copy', () => {
    let result: any;
    service.getAllBlogs({pageNum:1,pageLimit:10,search:''}).subscribe(response=>result=response);
    const article={permaLink:'/what-is-a-forex-currency-pair',title:'Existing English title',content:'Existing English article'};
    http.expectOne(request=>request.url.endsWith('/api/v1/blogs/web')).flush({status:true,data:[article],message:''});
    expect(result.data[0]).toEqual({...article,permaLink:'what-is-a-forex-currency-pair'});
    expect(article.permaLink).toBe('/what-is-a-forex-currency-pair');
  });
});

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

describe('Frontend-owned public CMS gateway', () => {
  it('uses the frontend read gateway without changing the admin backend', async () => {
    const { PUBLIC_BLOG_GATEWAY } = await import('./public-blog-gateway.token');
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: ToastrService, useValue: {error:()=>{}} },
      { provide: PUBLIC_BLOG_GATEWAY, useValue: '/api/public/blogs' },
    ] });
    const service=TestBed.inject(WebBlogService),http=TestBed.inject(HttpTestingController);
    service.getAllBlogs({pageNum:2,pageLimit:10,search:''}).subscribe();
    const pending=http.expectOne(req=>req.url==='/api/public/blogs'&&req.params.get('pageNum')==='2');
    expect(pending.request.params.has('view')).toBeFalse();
    pending.flush({status:true,data:[],metaData:{totalPage:7,pageNum:2,pageLimit:10}});
    service.getBlogById('what-is-a-forex-currency-pair').subscribe();
    http.expectOne('/api/public/blogs/%2Fwhat-is-a-forex-currency-pair').flush({status:true,data:{}});
    http.verify();
  });
});
