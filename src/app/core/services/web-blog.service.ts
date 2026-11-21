import { Injectable } from '@angular/core';
import { ApiResp, BaseService } from './base.service';
import { map, Observable } from 'rxjs';
import { cmsBlogSlug, correctPublicBlogCopy } from './blog-copy-corrections';
@Injectable({
  providedIn: 'root',
})
export class WebBlogService extends BaseService {
  private blogEndPoint = 'api/v1/blogs/web';

  getAllBlogs(params: {
    pageNum: number;
    pageLimit: number;
    search: string;
  }): Observable<ApiResp> {
    return this.http
      .get<ApiResp>(`${this.baseUrl}/${this.blogEndPoint}`, {
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
      .get<ApiResp>(`${this.baseUrl}/${this.blogEndPoint}/${cmsBlogSlug(id)}`)
      .pipe(
        map((res) => {
          if (!res.status) this.toastr.error(res.message, 'Error');
          return this.correctResponseCopy(res, id);
        })
      );
  }

  getRecommended(id: string) {
    return this.http
      .get<ApiResp>(`${this.baseUrl}/${this.blogEndPoint}/${cmsBlogSlug(id)}/recommended`)
      .pipe(
        map((res) => {
          if (!res.status) this.toastr.error(res.message, 'Error');
          return this.correctResponseCopy(res);
        })
      );
  }

  private correctResponseCopy(res: ApiResp, requestedSlug = ''): ApiResp {
    if (!res.status || !res.data) return res;

    return {
      ...res,
      data: Array.isArray(res.data)
        ? res.data.map((blog) => correctPublicBlogCopy(blog))
        : correctPublicBlogCopy(res.data, requestedSlug),
    };
  }
}
