FRONTEND-ONLY RELEASE (23 Nov 2026)

The backend remains unchanged. Follow FRONTEND_ONLY_RELEASE.txt and LOCAL_COMPLETION_REPORT.txt.
Run the production Node SSR server, not a browser-only static upload. Public blog reads use this frontend server's /api/public/blogs gateway. Existing admin/auth/contact endpoints keep the original backend.
Existing public English articles are versioned on the server, with a bounded background refresh and explicit source age. This is cached-source verification, not proof that the intermittent production CMS is continuously available.

Previous implementation notes below are historical; backend-first instructions do not apply to this release.

Backend source and local integration are now included in the sibling delivery. Read [BACKEND_DEPLOYMENT_GUIDE.txt](BACKEND_DEPLOYMENT_GUIDE.txt): configure/deploy backend first, verify the real API, then deploy frontend. Local test reports label their isolated CMS source; they are not live-production approval.

# UPFOREX local integration

Latest local SEO sheet changes and deployment checks: [SEO_SHEET_FIXES.txt](SEO_SHEET_FIXES.txt). Read [LOCAL_COMPLETION_REPORT.txt](LOCAL_COMPLETION_REPORT.txt) for the current release decision.

This project combines GitHub main at `34dd59577c54541b6286982a9341d534884b108a` with the local Angular 21 security upgrade, native SSR translations and SEO verification. Read `LOCAL_COMPLETION_REPORT.txt` for current results. No push or deployment is performed by these checks.

Current speed improvements and mobile before/after evidence are in [PERFORMANCE_CHANGES.txt](PERFORMANCE_CHANGES.txt). Remaining remote media and owner hosting work are listed in [MEDIA_OPTIMIZATION_REQUESTS.txt](MEDIA_OPTIMIZATION_REQUESTS.txt). Put owner-optimized media in `media-optimization-input/` for later review and integration.

The latest video fix and its browser/SSR checks are in [VIDEO_PLAYBACK_FIX.txt](VIDEO_PLAYBACK_FIX.txt). Stop the existing SSR process before rebuilding, then restart it from this merged folder. A running SSR process can retain old HTML referencing removed JavaScript files after a rebuild.

Use the tested Node **24.18.0** and npm **11.16.0** environment. Run commands from this merged project directory:

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact lockfile dependencies. |
| `npm run build:ssr` | Compile matching browser/SSR bundles and precompressed `.br`/`.gz` static assets. |
| `npm run test:i18n` | Check translation, routing, metadata and UI integrity. |
| `npm run test:regression` | Check main's copy corrections, blog data and pagination. |
| `npm run test:server` | Check security/cache policies and mocked CDN-purge behavior; no live purge. |
| `npm run test:performance` | Check content compression, exact decoded bytes, caching, private HTML, ranges, HEAD and ETag behavior. |
| `npm audit` | Check current dependency advisories. |
| `npm run verify:seo -- --require-complete` | Verify every public-page/language initial body, canonical, reciprocal hreflang, metadata and redirects. |
| `npm run verify:sheets` | Verify all supplied sheet rows, reviewed redirects, exclusion and email protection in the built origin. |
| `npm run verify:ssr-i18n -- --require-complete` | Independently verify complete translated initial HTML for every declared combination. |
| `npm run serve:ssr` | Start the built SSR website, normally on port 4000. |
| `npm start` | Start the development server on port 4200. |

Production must run the Node SSR server with its matching browser assets. Serving only `dist/upforex_Frontend/browser` cannot provide the verified translated initial HTML. Both output paths remain under `dist/upforex_Frontend`. Chrome is required for browser unit tests. Verification reads the existing public CMS; no translation provider is needed.

Main's current English corrections, blog styles, V2 legal links, cache/security rules and typo redirects are retained. Local per-page catalogs, clean blog aliases and completed-page SEO behavior are retained. The old AML address in the approved sheet follows main's existing redirect. The eight previously unmatched rows are reconciled through seven existing-destination redirects and one user-confirmed obsolete 404 exclusion. See SEO_SHEET_FIXES.txt.

Catalogs are loaded per locale and page. Visitors need no translation API, account, payment card or local model. Only the active generated catalog version ships.

For changed CMS/English source: refresh with `node scripts/refresh-english-blog-source.cjs`, collect with `npm run i18n:audit-english`, then run `npm run i18n:extract -- --write`. New text needs a real validated translation before `node scripts/prepare-native-catalogs.cjs --write`. Keep deployment on hold until both strict checks pass. Existing scripts do not authorize paid requests.

Logs, coverage, saved initial HTML, screenshots and local timing samples are in `tmp/`. The current release report distinguishes local checks from later production hosting/CDN/Core Web Vitals verification. The remaining scaffold documentation below is historical.

## Original scaffold documentation

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 16.2.14.

The current local security upgrade uses Angular 21.2 and Node 24 LTS. Read [SECURITY_UPGRADE_NOTES.txt](SECURITY_UPGRADE_NOTES.txt) for the exact dependency versions, verification logs and remaining multilingual release blockers before deployment.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
# upforex
# upforex
# upforex1
