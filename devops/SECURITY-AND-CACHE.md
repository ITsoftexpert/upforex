# Security, translations and marketing cache

Checked on 21 November 2026. These are source/configuration changes; they have not been deployed or applied to DNS/Cloudflare.

## Observed live state

| Check | www.upforex.com | client.upforex.live |
| --- | --- | --- |
| CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | All four absent on home, About and Blogs | All four absent on the public entry page |
| HSTS | `max-age=2592000` (30 days) | Absent |
| HTML caching | Repeated requests returned `cf-cache-status: DYNAMIC`, no Cache-Control, no Age | IIS entry page; no Cloudflare response header observed |
| Translations | Raw `nav.*`, `FOOTER.*`, `auth.*` labels in server-rendered HTML | Separate application; not covered by this checkout |

`upforex.com` uses Cloudflare nameservers. `upforex.live` uses DomainControl nameservers. Marketing changes in this Express repository do not configure the IIS portal.

## Source changes

- Express sets the four security headers, removes X-Powered-By, and sends host-only one-year HSTS for HTTPS requests, including HTTPS forwarded by the reverse proxy. Cloudflare's existing HSTS setting may override the origin's value.
- CSP enforces `base-uri 'self'; object-src 'none'; frame-ancestors 'self'; upgrade-insecure-requests`. This is a baseline that preserves the existing third-party widgets. It does **not** claim to restrict JavaScript sources or fully mitigate XSS. Tightening script/style sources needs a separate audit of Google Translate, GTM, Tawk, calculators and trading widgets. [CSP reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
- Translation catalogs load from the bundle before bootstrap, including during SSR. The route determines the server language; English remains the fallback for missing keys. This removes the former relative HTTP translation request from SSR. Browser language selection remains available.
- An explicit marketing-route allowlist gets a 300-second Cloudflare TTL. Browsers revalidate. All query strings, cookies and Authorization requests bypass HTML caching, as do admin/API/private/unknown routes, failed or incomplete renders and Set-Cookie responses. This intentionally also bypasses analytics-cookie requests until cookie handling is explicitly audited. Language URLs remain separate cache keys.
- Hashed JS/CSS retain one-year immutable caching. Unversioned assets use one hour. Raw index.html is no-store.

## Apply the external changes

1. **Deploy the Express application**, using `npm run build:ssr` and the existing server publication process. `npm run build` alone builds the browser assets and does not rebuild the Express server. Confirm translations in the raw HTML before enabling edge caching.
2. **Cloudflare Cache Rule:** add the rule in [marketing-cache-rule.json](cloudflare/marketing-cache-rule.json) to the `upforex.com` zone's cache rules. Preserve other rules. Its Edge TTL mode uses origin headers and bypasses when they are absent; do not replace it with an override that caches private/no-store responses. Review conflicting later rules. [Cache Rule settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/), [CDN cache header precedence](https://developers.cloudflare.com/cache/concepts/cdn-cache-control/).
3. **Purge after a successful publication**, never during a build or before the new release is live. Supply changed page URLs in a JSON array. For a shared header/footer or translation change, include all cached marketing URLs and language variants. Provide the zone ID and a zone-scoped Cache Purge token through the deployment environment, then run:

   ```text
   npm run purge:marketing -- --dry-run --urls-file published-pages.json
   npm run purge:marketing -- --urls-file published-pages.json
   ```

   The script batches named URLs, checks Cloudflare's success response, and never purges the entire zone. It is ready to be invoked by the existing publish pipeline; this repository has no website release pipeline to wire it into. [Cloudflare purge API](https://developers.cloudflare.com/api/resources/cache/methods/purge/).
4. **SPF:** [spf-change.json](cloudflare/spf-change.json) records both current SPF values and the merged replacement. Update one existing SPF record and remove the other, leaving exactly one:

   ```text
   v=spf1 include:_spf.google.com include:zoho.com include:zcsend.net ~all
   ```

   This preserves all three current sending services and soft-fail behavior. Its current worst-case include lookup count is 7, below the limit of 10; recheck at application time because providers can change their includes. Keep unrelated TXT, DKIM and DMARC records. Multiple SPF records on the same name cause a permanent SPF error. [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208.html#section-3.2).
5. **Portal:** merge [the IIS custom-header example](iis/portal-security-headers.config.example) into the actual portal configuration, preserving existing settings. Verify HTTPS redirection and portal login/MFA/payment/upload/document flows. Do not apply the marketing HTML Cache Rule to this host. [IIS custom headers](https://learn.microsoft.com/en-us/iis/configuration/system.webServer/httpProtocol/customHeaders/).

## Verify after deployment

- Inspect actual GET responses, including redirects/error pages, for the four headers. Confirm portal HSTS on HTTPS.
- Request the same public marketing URL twice without cookies, Authorization or a query string. Expect a cache MISS followed by HIT/Age once the Cloudflare rule is active. `DYNAMIC` by itself means edge caching is not being used, not an application build failure. [Cloudflare cache responses](https://developers.cloudflare.com/cache/concepts/cache-responses/).
- Check admin/authenticated requests remain no-store and do not become HIT. Check `/fr/` and `/ar/` remain separate from English and from each other.
- Inspect raw HTML for unresolved translation keys and verify language switching in the browser.
- Query DNS after propagation and confirm exactly one SPF TXT record, then validate SPF for Google, Zoho and Zoho Campaigns mail.

## Local checks

```text
npm run build:ssr
npm run test:server
npm run test:regression
```

The regression command runs the 39 affected Angular translation/blog tests in Chrome. The server command runs 30 header, cache-isolation and purge tests. The targeted configuration is separate because the existing default test configuration includes an unrelated `sanitize-html.pipe.spec.ts` compilation error (missing DomSanitizer constructor argument); these results are not a claim that the full legacy suite passes.

Production Express SSR was also checked with 11 local requests, including simultaneous English/French/Arabic/Chinese renders, and 42 browser regression checks passed with the security middleware enabled. Cloudflare HIT/purge verification and portal flow tests still require their actual deployment/account access.

## Build messages

The `NG8107` warning was redundant optional chaining on a non-null `Language`; the template now uses `currentLanguage.code`. The initial language is assigned in `ngOnInit`, before template rendering. [Angular NG8107](https://angular.dev/extended-diagnostics/NG8107).

The Bootstrap `.form-floating>~label` message comes from the critical-CSS selector parser handling Bootstrap's valid `:disabled ~ label` rule. The production build succeeds and the complete rule remains in the stylesheet. Critical CSS optimization has been kept enabled rather than disabled to hide this warning. [Bootstrap issue](https://github.com/twbs/bootstrap/issues/39323).

The npm version notice is informational and does not require a major npm upgrade for these fixes.
