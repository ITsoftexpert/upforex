const fs = require('node:fs'), path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const before = read('tmp/performance/before.json'), after = read('tmp/performance/after-final.json');
const media = read('tmp/performance/media-inventory.json');
const preservation = read('tmp/performance/preservation.json');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const metrics = sample => ({ lcpMs: sample.metrics.lcp.at(-1)?.time, fcpMs: sample.metrics.paint.find(p => p.name === 'first-contentful-paint')?.startTime, ttfbMs: sample.metrics.nav.responseStart, cls: sample.metrics.cls, transferredBytes: sample.totalTransferred, requests: sample.network.length,
  observedLongTaskExcessMs: sample.metrics.long.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0) });
const samples = { before: before.results.map(metrics), after: after.results.map(metrics) };
const medians = Object.fromEntries(Object.entries(samples).map(([key, rows]) => [key, Object.fromEntries(Object.keys(rows[0]).map(metric => [metric, median(rows.map(row => row[metric]))]))]));
const localMeasurementPassed = samples.before.length === 3 && samples.after.length === 3 && JSON.stringify(before.environment) === JSON.stringify(after.environment) && medians.after.lcpMs < medians.before.lcpMs && medians.after.transferredBytes < medians.before.transferredBytes && preservation.passed;
const videos = [{ url: 'https://upforex-assets.s3.eu-north-1.amazonaws.com/assets/videos/smart_trading.mp4', bytes: 6989128, target: 'H.264 MP4; keep aspect ratio, muted decorative video; aim for 1-2 MB if labels remain legible' },
  { url: 'https://upforex-assets.s3.eu-north-1.amazonaws.com/assets/videos/smart_trading.webm', bytes: 10961079, target: 'VP9 WebM; keep aspect ratio; aim for 2-3 MB if labels remain legible' }];
const report = { checkedAt: new Date().toISOString(), localMeasurementPassed, scope: 'Three cold-cache English homepage samples per build, same Chrome mobile emulation. Not a live Lighthouse score or field Core Web Vitals. No benchmark runs overlapped builds or full audits.', environment: after.environment, medians, samples,
  lcpReductionPercent: 100 * (1 - medians.after.lcpMs / medians.before.lcpMs), transferReductionPercent: 100 * (1 - medians.after.transferredBytes / medians.before.transferredBytes),
  changes: ['Use existing equivalent WOFF2 font with TTF fallback', 'Use locally optimized original logo, Arabic hero and app badge', 'Discover the English hero from the same origin with high priority', 'Consolidate explicit gtag.js loaders, retaining both Analytics IDs and GTM', 'Load chat after initial rendering or interaction, with 5-second fallback', 'Load decorative MP4/WebM only near viewport; pause offscreen; clean up on navigation', 'Remove unsupported MP4-as-CSS-image requests', 'Precompress static assets at build time; Brotli/Gzip anonymous public HTML; preserve cache/security/private/range behavior', 'Suppress redundant Google Translate on ready native English/source pages so a saved language cannot translate the English URL again; failed or incomplete pages are not marked ready'],
  remainingOwnerWork: { images: media.imagesOver150KB.length, imageInventory: 'tmp/performance/media-inventory.csv', videos, remoteMediaCacheHeaders: 'Audited S3 media currently have no Cache-Control response header', externalServices: ['Review Google Tag Manager duplicate Analytics firing in the owner account; both existing IDs retained', 'Publish optimized remote media and set appropriate S3/CDN caching; no remote write performed', 'Recheck production PageSpeed mobile and field Core Web Vitals after owner deployment'], apiOrCardRequiredForLocalChanges: false },
  caveats: ['Local origin gained compression; the live Cloudflare response already had Brotli for HTML, so the local transfer savings must not be presented as a live prediction.', 'Observed long-task excess across 25 seconds is a diagnostic, not Lighthouse TBT.', 'No visitor-time translation API/model or extra paid request introduced.', 'The 43 large remote images and two original video binaries remain external; their URLs and page list are provided for owner optimization.', 'Local chat loader is verified; vendor domain/account delivery is outside localhost control.'],
  evidence: ['tmp/performance/before.json', 'tmp/performance/after-final.json', 'tmp/performance/preservation.json', 'tmp/performance/screenshot-comparison.json', 'tmp/performance/optimized-media.json', 'tmp/security-remediation/browser-verification.json', 'tmp/release-test-performance.log'] };
fs.writeFileSync('tmp/performance/comparison.json', JSON.stringify(report, null, 2) + '\n');
const lines = [
  'LOCAL SPEED OPTIMIZATION - merged-upforex', 'Updated: ' + report.checkedAt,
  '', 'RESULT (LOCAL LAB, NOT A NEW LIVE PAGESPEED SCORE)',
  '3 cold-cache samples each; Chrome 390x844, 4x CPU slowdown, 150 ms latency, 1.6 Mbps download, same machine.',
  'Median homepage LCP: ' + (medians.before.lcpMs / 1000).toFixed(2) + 's -> ' + (medians.after.lcpMs / 1000).toFixed(2) + 's.',
  'Median bytes received during the 25-second sample: ' + (medians.before.transferredBytes / 1e6).toFixed(2) + ' MB -> ' + (medians.after.transferredBytes / 1e6).toFixed(2) + ' MB.',
  'Median CLS: ' + medians.before.cls + ' -> ' + medians.after.cls + '.',
  'The live Cloudflare HTML already used Brotli. These local origin results do not predict the exact live score.',
  '', 'CHANGES', ...report.changes.map(item => '- ' + item),
  '', 'MEDIA ALREADY APPLIED', ...media.optimized.map(row => '- ' + row.url + ': ' + row.sourceBytes + ' -> ' + row.bytes + ' bytes.'),
  'Montserrat: 688600-byte TTF -> existing 205432-byte WOFF2. Browser-measured text widths are identical.',
  'Arabic image retains the original artwork; high-quality WebP PSNR 41.41 dB. Original source file retained.',
  '', 'PRESERVATION',
  'All changed templates retain exact visible English text/interpolation bindings; public page routes, CTAs and metadata remain unchanged.',
  '1221 native catalog files are unchanged. Both strict initial-HTML gates must pass before release; see LOCAL_RELEASE_STATUS.txt.',
  '62/68 main stylesheets are byte-identical. Five remove only MP4 background-image declarations; one changes only font source preference.',
  'Before/after screenshots: tmp/performance/before-2.png and tmp/performance/after-final-2.png.',
  '', 'COMMANDS',
  'npm.cmd run build:ssr                 Builds Angular browser/server, sitemap, and .br/.gz static sidecars.',
  'npm.cmd run test:performance          Checks decoded bytes, MIME, encodings, cache, security, ranges, HEAD, ETag and private HTML.',
  'npm.cmd run test:i18n                 Checks translations, routes, SEO and release-pipeline regressions.',
  'npm.cmd run verify:seo -- --require-complete',
  'npm.cmd run verify:ssr-i18n -- --require-complete',
  'npm.cmd run serve:ssr                 Starts the already built Node SSR app (normally port 4000).',
  'No new runtime dependency, paid API, card, push, live deployment or remote S3/CDN/GTM write.',
  '', 'STILL NEEDED FROM OWNER', 'Read MEDIA_OPTIMIZATION_REQUESTS.txt and tmp/performance/media-inventory.csv.',
  'The two video binaries and 43 large external images are not replaced by this local frontend change.',
  'After deployment, retest mobile PageSpeed and real-user Core Web Vitals with the production host/CDN.'
];
fs.writeFileSync('PERFORMANCE_CHANGES.txt', lines.join('\n') + '\n');
fs.mkdirSync('media-optimization-input', { recursive: true });
fs.writeFileSync('media-optimization-input/README.txt', [
  'Place owner-optimized media here for review and integration. This folder is outside shipped src/assets.',
  'Suggested names: smart_trading-optimized.mp4 and smart_trading-optimized.webm.',
  'For images keep the original basename and add -optimized.webp; the inventory CSV maps each original URL to its page.',
  'Preserve artwork, charts, text, colors, aspect ratio, transparency and meaning. Avoid cropping or enlarging.',
  'Do not paste credentials or API keys here. Do not overwrite production files before visual review.',
  'See ../MEDIA_OPTIMIZATION_REQUESTS.txt.'
].join('\n') + '\n');
fs.copyFileSync('tmp/performance/media-inventory.csv', 'media-optimization-input/media-inventory.csv');
fs.writeFileSync('MEDIA_OPTIMIZATION_REQUESTS.txt', [
  'OWNER MEDIA / HOSTING WORK',
  'Local code improvements are in PERFORMANCE_CHANGES.txt. No paid API or card is needed for those.',
  '', '1. VIDEOS (highest priority when the video section is viewed)',
  ...videos.flatMap(row => [row.url, 'Current: ' + (row.bytes / 1e6).toFixed(2) + ' MB. ' + row.target]),
  'Keep composition and duration. Use at most 1280px width where readable, preserve aspect ratio, and remove unused audio.',
  'MP4 should use fast-start metadata. Check chart/text legibility and looping before replacement.',
  'Videos now load only near the viewport, so they no longer compete with initial hero loading.',
  '', '2. IMAGES',
  media.imagesOver150KB.length + ' current remote images exceed 150 KB. Full URL/size/page list: media-optimization-input/media-inventory.csv.',
  'Blog hero: aim for 1200-1600px width and 100-200 KB WebP/AVIF when readable. Use smaller responsive variants for cards.',
  'Preserve transparency, logos, captions, charts and aspect ratio; do not crop important information.',
  'Examples, largest first:',
  ...media.imagesOver150KB.slice(0,10).map(row => '- ' + (row.bytes / 1e6).toFixed(2) + ' MB | ' + row.url + '\n  Page: ' + row.pages[0]),
  '', '3. WHERE TO PUT FILES',
  'Put optimized copies in merged-upforex/media-optimization-input/. Keep the original filename recognizable.',
  'Original files and remote URLs are retained until the replacement is reviewed and integrated.',
  'These remote images come from S3/CMS. Their production replacement requires owner upload/reference changes.',
  '', '4. EXISTING HOSTING / TRACKING SETTINGS',
  'S3 media have no Cache-Control header. Set caching on the owner infrastructure; versioned immutable filenames can use long TTLs.',
  'Avoid long immutable TTLs on mutable filenames. Preserve private/admin/API cache bypasses.',
  'Deploy Node SSR with matching browser files and .br/.gz sidecars, not the browser folder alone.',
  'Preserve Vary: Accept-Encoding and correct Content-Encoding/MIME when using a proxy/CDN.',
  'Review GTM-58ST2V5D in Tag Manager for duplicate Analytics tags. Both G-B5C306C5Z8 and G-464B5CB56E remain in code.',
  'Confirm which properties are needed before disabling account-side tags; no analytics property was removed here.',
  'The inspected live HTML response reported CF-Cache-Status: DYNAMIC. Review public HTML cache eligibility while respecting origin private/no-store and cookie/auth bypasses.',
  'Cloudflare does not cache HTML/JSON by default: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/',
  'Origin cache-control guidance: https://developers.cloudflare.com/cache/concepts/cache-control/',
  'Check actual production mobile PageSpeed and Core Web Vitals after owner deployment.',
  '', 'I have not modified S3 objects, CMS records, Cloudflare settings, Tag Manager, Jenkins or live code.'
].join('\n') + '\n');
console.log(JSON.stringify({ localMeasurementPassed, medians, remainingImages: media.imagesOver150KB.length }));
if (!localMeasurementPassed) process.exitCode = 1;
