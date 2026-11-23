import { Component, Inject, Optional } from '@angular/core';
import { WebBlogService } from 'src/app/core/services/web-blog.service';
import { Store } from 'src/app/Store/store';
import { RESPONSE } from 'src/app/core/tokens/ssr-request.tokens';
import { PUBLIC_BLOG_GUIDES } from 'src/app/core/config/public-blog-guides';

@Component({
  standalone: false,
  selector: 'app-list.blogs',
  templateUrl: './list.blogs.component.html',
  styleUrls: ['./list.blogs.component.scss'],
})
export class ListBlogsComponent {
  constructor(private blogService: WebBlogService, private store: Store,
    @Optional() @Inject(RESPONSE) private response: { status(code: number): unknown } | null = null) {}
  articles: any[] = [];
  isLoading: boolean = false;
  totalPages = 0;
  pageNum = 1;
  pageLimit = 10;
  s3URL = this.store.s3BaseUrl();
  private readonly curatedGuides = [
    {
      slug: 'learn-how-to-trade-gold-online-techniques-and-insights',
      anchor: 'How to trade gold online',
    },
    {
      slug: 'what-is-a-forex-currency-pair',
      anchor: 'What is a forex currency pair?',
    },
    {
      slug: 'how-to-become-an-introducing-broker',
      anchor: 'How to become an Introducing Broker',
    },
    {
      slug: 'copy-trading-and-social-trading-explained',
      anchor: 'Copy trading and social trading explained',
    },
    {
      slug: 'upforex-a-trusted-trading-platform-connecting-global-markets',
      anchor: 'Why UPFOREX is a trusted trading platform',
    },
    {
      slug: 'bitcoin-cfd-trading-platform-in-uae-market-access-in-a-digital-economy',
      anchor: 'Bitcoin CFD trading in the UAE',
    },
    {
      slug: 'energy-cfd-trading-in-uae-with-upforex-trade-global-energy-markets-smarter',
      anchor: 'Energy CFD trading in the UAE',
    },
    {
      slug: 'cfd-index-trading-and-otc-markets-explained-upforex',
      anchor: 'CFD index trading and OTC markets',
    },
    {
      slug: 'online-oil-trading-proven-tips-smart-strategies-and-best-practices',
      anchor: 'Online oil trading tips and strategies',
    },
    {
      slug: 'what-is-spread-in-forex-everything-you-need-to-know',
      anchor: 'What is spread in forex?',
    },
    {
      slug: 'best-regulated-forex-platform',
      anchor: 'How to choose a regulated forex platform',
    },
  ];

  get featuredGuides(): { slug: string; anchor: string }[] {
    const guides = [...this.curatedGuides];
    const existing = new Set(guides.map(guide => guide.slug));
    for (const guide of PUBLIC_BLOG_GUIDES) if (!existing.has(guide.slug)) {
      guides.push(guide);
      existing.add(guide.slug);
    }

    this.articles.forEach((article) => {
      if (article.permaLink && article.title) {
        guides.push({
          slug: article.permaLink,
          anchor: article.title,
        });
      }
    });

    return Array.from(
      new Map(guides.map((guide) => [guide.slug, guide])).values()
    );
  }

  ngOnInit() {
    this.getAllBlogs();
  }

  processBlogsResponse(res: any) {
    this.isLoading = false;
    if (res.status) {
      const { data, metaData } = res;
      this.articles = [...this.articles, ...data];
      if (metaData) {
        this.totalPages = metaData.totalPage;
        this.pageNum = metaData.pageNum;
        this.pageLimit = metaData.pageLimit;
      }
    }
  }

  getAllBlogs(search = '', pageNum = this.pageNum) {
    const params = {
      pageNum,
      pageLimit: this.pageLimit,
      search,
    };
    this.isLoading = true;
    this.blogService
      .getAllBlogs(params)
      .subscribe({
        next: (res) => { if (!res.status) this.response?.status(503); this.processBlogsResponse(res); },
        error: () => { this.isLoading = false; this.response?.status(503); },
      });
  }

  loadMore() {
    if (!this.isLoading && this.pageNum < this.totalPages) {
      this.getAllBlogs('', this.pageNum + 1);
    }
  }
}
