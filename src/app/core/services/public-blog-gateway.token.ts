import { InjectionToken } from '@angular/core';
/** Public reads only; admin APIs retain their existing authenticated backend. */
export const PUBLIC_BLOG_GATEWAY = new InjectionToken<string>('PUBLIC_BLOG_GATEWAY');
