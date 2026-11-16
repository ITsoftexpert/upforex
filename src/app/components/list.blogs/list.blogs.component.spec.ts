import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListBlogsComponent } from './list.blogs.component';
import { WebBlogService } from 'src/app/core/services/web-blog.service';
import { Store } from 'src/app/Store/store';
import { of } from 'rxjs';

describe('ListBlogsComponent', () => {
  let component: ListBlogsComponent;
  let fixture: ComponentFixture<ListBlogsComponent>;
  let blogService: jasmine.SpyObj<WebBlogService>;

  beforeEach(() => {
    blogService = jasmine.createSpyObj('WebBlogService', ['getAllBlogs']);
    blogService.getAllBlogs.and.returnValue(
      of({
        status: true,
        message: '',
        data: [],
        metaData: { totalPage: 2, pageNum: 1, pageLimit: 10 },
      })
    );

    TestBed.configureTestingModule({
      declarations: [ListBlogsComponent],
      providers: [
        { provide: WebBlogService, useValue: blogService },
        {
          provide: Store,
          useValue: { s3BaseUrl: () => '' },
        },
      ],
    }).overrideComponent(ListBlogsComponent, {
      set: { template: '' },
    });
    fixture = TestBed.createComponent(ListBlogsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should include published articles in the featured links automatically', () => {
    component.articles = [
      { permaLink: 'new-blog-post', title: 'New blog post' },
    ];

    expect(
      component.featuredGuides.some(
        (guide) =>
          guide.slug === 'new-blog-post' && guide.anchor === 'New blog post'
      )
    ).toBeTrue();
  });

  it('should load more using the API page count and stop at the last page', () => {
    blogService.getAllBlogs.calls.reset();
    blogService.getAllBlogs.and.returnValue(
      of({
        status: true,
        message: '',
        data: [{ permaLink: 'page-two-post', title: 'Page two post' }],
        metaData: { totalPage: 2, pageNum: 2, pageLimit: 10 },
      })
    );

    component.pageNum = 1;
    component.totalPages = 2;
    component.loadMore();

    expect(blogService.getAllBlogs).toHaveBeenCalledWith({
      pageNum: 2,
      pageLimit: 10,
      search: '',
    });
    expect(component.pageNum).toBe(2);
    expect(
      component.featuredGuides.some(
        (guide) =>
          guide.slug === 'page-two-post' && guide.anchor === 'Page two post'
      )
    ).toBeTrue();

    component.loadMore();
    expect(blogService.getAllBlogs).toHaveBeenCalledTimes(1);
  });
});
