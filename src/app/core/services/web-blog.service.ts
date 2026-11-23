import { Injectable, inject } from '@angular/core';
import { PUBLIC_BLOG_GATEWAY } from './public-blog-gateway.token';
import { ApiResp, BaseService } from './base.service';
import { map, Observable } from 'rxjs';
import { publicBlogPermalink, storedBlogPermalink } from '../config/blog-permalinks';
import { cmsBlogSlug, correctPublicBlogCopy } from './blog-copy-corrections';
@Injectable({
  providedIn: 'root',
})
export class WebBlogService extends BaseService {
  private readonly endpoint = inject(PUBLIC_BLOG_GATEWAY, { optional: true }) ?? `${this.baseUrl}/api/v1/blogs/web`;
  private correctResponseCopy(res: ApiResp, requestedSlug = ''): ApiResp {
    if (!res.status || !res.data) return res;
    const correct = (article: any) => {
      const result = correctPublicBlogCopy(article, requestedSlug);
      return typeof result.permaLink === 'string'
        ? { ...result, permaLink: publicBlogPermalink(result.permaLink) } : result;
    };
    return { ...res, data: Array.isArray(res.data) ? res.data.map(correct) : correct(res.data) };
  }

  getAllBlogs(params: {
    pageNum: number;
    pageLimit: number;
    search: string;
  }): Observable<ApiResp> {
    return this.http
      .get<ApiResp>(`${this.endpoint}`, {
        params,
      })
      .pipe(
        map((res) => {
          if (!res.status) this.toastr.error(res.message, 'Error');
          return this.correctResponseCopy(res);
        })
      );
  }

  getBlogById(id: string) {
    return this.http
      .get<ApiResp>(`${this.endpoint}/${encodeURIComponent(storedBlogPermalink(cmsBlogSlug(id)))}`)
      .pipe(
        map((res) => {
          if (!res.status) this.toastr.error(res.message, 'Error');
          return this.correctResponseCopy(res, id);
        })
      );
  }

  getRecommended(id: string) {
    return this.http
      .get<ApiResp>(`${this.endpoint}/${encodeURIComponent(storedBlogPermalink(cmsBlogSlug(id)))}/recommended`)
      .pipe(
        map((res) => {
          if (!res.status) this.toastr.error(res.message, 'Error');
          return this.correctResponseCopy(res);
        })
      );
  }
}
