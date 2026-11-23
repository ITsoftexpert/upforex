import { Component, Inject, OnDestroy, Optional } from '@angular/core';
import { RESPONSE } from '../../core/tokens/ssr-request.tokens';
import { Subject, takeUntil } from 'rxjs';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { BlogData } from 'src/app/core/services/blogs.service';
import { WebBlogService } from 'src/app/core/services/web-blog.service';
import { Store } from 'src/app/Store/store';
import { NativeTranslationService } from 'src/app/core/services/native-translation.service';
import { LanguageService } from 'src/app/core/services/language.service';

@Component({
  standalone: false,
  selector: 'app-blogs',
  templateUrl: './blogs.component.html',
  styleUrls: ['./blogs.component.scss'],
})
export class BlogsComponent implements OnDestroy {
  private readonly destroyed$ = new Subject<void>();
  constructor(
    private blogService: WebBlogService,
    private _router: ActivatedRoute,
    private store: Store,
    private meta: Meta,
    private title: Title,
    private native: NativeTranslationService,
    private languages: LanguageService,
    @Optional() @Inject(RESPONSE) private response: { status(code: number): unknown } | null
  ) {}
  blogId!: string;
  blog!: BlogData;
  recommendedBlogs: any;
  s3URL = this.store.s3BaseUrl();
  ngOnInit() {
    this.languages.currentLanguage$.pipe(takeUntil(this.destroyed$)).subscribe(() => this.setMetaTags());
    this._router.params.pipe(takeUntil(this.destroyed$)).subscribe((data) => {
      this.blogId = data.id;
      if (this.blogId) {
        this.getBlogById();
        this.getRecommendedBlogs();
      }
    });
  }
  isLoading: boolean = false;
  processBlogsResponse(res: any) {
    this.isLoading = false;
    if (res.status) {
      const { data } = res;
      this.blog = data;
      this.setMetaTags();
    }
  }

  getBlogById() {
    this.isLoading = true;
    this.blogService.getBlogById(this.blogId as string).subscribe({next: (res) => {
      if (res.status && res.data) this.processBlogsResponse(res);
      else { this.isLoading = false; this.response?.status(404); }
    }, error: (error) => {
      this.isLoading = false;
      // A temporary upstream failure must not tell crawlers an article is gone.
      this.response?.status(error.status === 404 ? 404 : 503);
    }
    });
  }

  getRecommendedBlogs() {
    this.blogService.getRecommended(this.blogId as string).subscribe({
      next: (res) => { if (res.status) this.recommendedBlogs = res.data; },
      error: () => { this.recommendedBlogs = []; },
    });
  }

  setMetaTags() {
    if (this.blog) {
      this.title.setTitle(this.native.metadata('title', this.blog.metaTitle));
      this.meta.updateTag({
        name: 'description',
        content: this.native.metadata('description', this.blog.description),
      });
      this.meta.updateTag({
        name: 'keywords',
        content: this.blog.tags.length ? this.blog.tags.map(tag => this.native.translateSource(tag)).join(',') : '',
      });
      this.meta.updateTag({
        name: 'title',
        content: this.native.metadata('title', this.blog.metaTitle),
      });
    }
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
