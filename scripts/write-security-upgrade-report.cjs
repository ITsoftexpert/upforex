// Record actual security, compatibility and preservation evidence after the upgrade.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
process.chdir(path.resolve(__dirname, '..'));
const directory = 'tmp/security-remediation';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baseline = read(directory + '/source-before-hashes.json');
const oldAudit = read(directory + '/audit-before.json');
const audit = read(directory + '/audit-after.json');
const browser = read(directory + '/browser-verification.json');
const coverage = read('tmp/i18n-coverage-report.json');
const seo = read('tmp/seo-verification.json');
const ssr = read('tmp/ssr-i18n-verification.json');
const before = read(directory + '/performance-before.json');
const after = read('tmp/release-performance.json');
const lockSha = hash('package-lock.json');
const commandNames = ['npmCi', 'buildSsr', 'testI18n', 'strictSeo', 'strictSsrI18n'];
const commands = Object.fromEntries(commandNames.map(name => [name, read('tmp/release-command-' + name + '.json')]));
for (const [name, row] of Object.entries(commands)) {
  assert.equal(row.packageLockSha256, lockSha, name + ': dependency lock changed since verification');
  assert.equal(row.logSha256, hash(row.log), name + ': verification log changed');
  assert.equal(row.sourceChangedDuringRun, false);
  if (name !== 'npmCi') assert.equal(row.manifestSha256, hash('src/app/core/config/i18n-coverage.ts'));
  if (['npmCi', 'buildSsr', 'testI18n'].includes(name)) assert.equal(row.passed, true, name);
}
assert.equal(audit.metadata.vulnerabilities.total, 0);
assert.equal(browser.passed, true);
assert.equal(browser.records.length, 7, 'All browser and initial article checks are required');
for (const result of [seo, ssr]) {
  assert.equal(result.version, coverage.version);
  assert.equal(result.failures.length, 0, 'SEO/SSR implementation failures must be fixed');
  assert.equal(result.verifiedCompletedCombinations, coverage.declaredCompletedCombinations);
}
const groups = {
  styles: Object.keys(baseline).filter(file => /\.(scss|css)$/.test(file)),
  templates: Object.keys(baseline).filter(file => file.endsWith('.html')),
  publicRouteDefinitions: Object.keys(baseline).filter(file => file.endsWith('routing.module.ts')),
};
const preservation = {};
for (const [name, files] of Object.entries(groups)) {
  const changed = files.filter(file => !fs.existsSync(file) || hash(file) !== baseline[file]);
  preservation[name] = {checked:files.length, changed};
  assert.deepEqual(changed, [], name + ' changed during security remediation');
}
const completionBaseline = read('tmp/completion-round/baseline.json');
preservation.englishCatalogUnchanged = hash('src/assets/i18n/en.json') === completionBaseline.EnglishSha;
preservation.translationManifestUnchanged = hash('src/app/core/config/i18n-coverage.ts') === baseline['src/app/core/config/i18n-coverage.ts'];
assert(preservation.englishCatalogUnchanged);
assert(preservation.translationManifestUnchanged);
const modified = Object.keys(baseline).filter(file => !fs.existsSync(file) || hash(file) !== baseline[file]);
const decoratorOnlyChanges = modified.filter(file => file.endsWith('.ts') && fs.existsSync(directory + '/source-before/' + file)
  && fs.readFileSync(directory + '/source-before/' + file, 'utf8') === fs.readFileSync(file, 'utf8').replace(/\n  standalone: false,/, ''));
const assets = after.assets.map(asset => {
  const old = before.assets.find(row => row.name.split('.')[0] === asset.name.split('.')[0]);
  assert(fs.existsSync('dist/upforex_Frontend/browser/' + asset.name));
  return {...asset, beforeRawBytes:old.rawBytes, beforeGzipBytes:old.gzipBytes, gzipDeltaBytes:asset.gzipBytes-old.gzipBytes};
});
const main = assets.find(asset => asset.name.startsWith('main.'));
const testLog = fs.readFileSync(commands.testI18n.log, 'utf8').replace(/\x1b\[[\d;]*m/g, '');
const packageJson = read('package.json');
const report = {
  checkedAt:new Date().toISOString(), status:'SECURITY_CHECKS_PASS', fullMultilingualReleaseReady:seo.releaseReady && ssr.releaseReady,
  packageLockSha256:lockSha, node:process.version, npmTested:'11.16.0',
  audit:{checkedAt:fs.statSync(directory+'/audit-after.json').mtime.toISOString(), afterReportSha256:hash(directory+'/audit-after.json'), before:oldAudit.metadata.vulnerabilities, after:audit.metadata.vulnerabilities,
    beforeReport:directory+'/audit-before.json', afterReport:directory+'/audit-after.json', scope:'Installed production and development dependencies; npm registry advisory data at the recorded audit time'},
  versions:{angular:packageJson.dependencies['@angular/core'], cli:packageJson.devDependencies['@angular/cli'], ssr:packageJson.dependencies['@angular/ssr'],
    express:packageJson.dependencies.express, jspdf:packageJson.dependencies.jspdf, typescript:packageJson.devDependencies.typescript},
  overrides:packageJson.overrides, allowScripts:packageJson.allowScripts,
  commands, angularTests:Number(/TOTAL: (\d+) SUCCESS/.exec(testLog)?.[1]), pipelineTests:Number(/tests (\d+)/.exec(testLog)?.[1]),
  browser:{...browser, report:directory+'/browser-verification.json'}, preservation, modifiedBaselineFiles:modified, decoratorOnlyChanges,
  coverage:{version:coverage.version, publicPages:coverage.publicPages, required:coverage.publicPages*10, verified:ssr.verifiedCompletedCombinations, missing:seo.missingCombinations.length,
    seoImplementationFailures:seo.failures.length, ssrImplementationFailures:ssr.failures.length, missingReport:'tmp/missing-translations.csv'},
  performance:{kind:'Local warm SSR samples and actual gzip bytes; no production Core Web Vitals certification',
    assets, mainGzipReductionPercent:Number(((1-main.gzipBytes/main.beforeGzipBytes)*100).toFixed(2)),
    timings:after.results.map(row => ({route:row.route, beforeMedianTtfbMs:before.results.find(old=>old.route===row.route)?.median.ttfbMs, afterMedianTtfbMs:row.median.ttfbMs})),
    report:'tmp/release-performance.json'},
  limitations:['Deprecation warnings remain for legacy Karma tooling and Angular APIs; these are separate from the zero current npm advisory findings.',
    'Native production hosting and authenticated admin submissions have not been tested against a live deployment.',
    'Strict multilingual release checks remain FAIL until all missing real translations are completed; they were not bypassed.'],
  pushed:false, deployed:false, paidTranslationRequests:0,
};
fs.writeFileSync(directory+'/summary.json', JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('SECURITY_UPGRADE_NOTES.txt', [
  'LOCAL DEPENDENCY SECURITY UPGRADE', 'Verified: '+report.checkedAt,
  'npm audit: '+report.audit.before.total+' -> '+report.audit.after.total+' known vulnerabilities (including dev dependencies).',
  'Before: '+JSON.stringify(report.audit.before), 'After: '+JSON.stringify(report.audit.after),
  'Current audit evidence: '+report.audit.afterReport,
  '', 'WHAT CHANGED AND WHY',
  'Angular 16 / Universal 16 required a framework migration to remediate unsupported vulnerable dependencies.',
  'Angular '+report.versions.angular+', CLI / SSR '+report.versions.cli+', TypeScript '+report.versions.typescript+'.',
  'Express remains on major 4 ('+report.versions.express+'); jsPDF updated to '+report.versions.jspdf+'.',
  'Replaced Universal express-engine with CommonEngine; keep request-specific language/status providers and a fixed trusted public origin.',
  'Configure zone-based change detection through bootstrapModule applicationProviders on browser and server. Use fetch for server HTTP while retaining DI interceptors; verify complete asynchronous article HTML.',
  'Updated Angular peer libraries (ng-bootstrap, ng-select, FontAwesome) and replaced ng-recaptcha with compatible ng-recaptcha-2.',
  'Existing NgModule components/directives/pipes now explicitly declare standalone: false. Preserve zone-based application behavior.',
  'Only patched Promise/CJS-compatible tooling ranges are overridden: glob >=9 <14.0.2 ->14.0.2; minimatch >=7 <11.0.1 ->11.0.8; SockJS uuid ->11.1.1.',
  'Keep legacy glob 7 / minimatch 3 callback APIs required by Karma. No reported vulnerabilities in the installed tree at this audit time.',
  'Native build scripts explicitly allowed for exact versions of esbuild, lmdb, msgpackr-extract and @parcel/watcher. core-js donation script disabled.',
  'No npm audit fix --force, legacy-peer-deps, audit suppression, paid requests, Git push or deployment.',
  '', 'PRESERVATION',
  'English catalog unchanged: '+preservation.englishCatalogUnchanged+'. Translation coverage manifest unchanged: '+preservation.translationManifestUnchanged+'.',
  ...Object.entries(preservation).filter(([,row])=>typeof row==='object').map(([name,row])=>name+': '+row.checked+' files checked; changed '+row.changed.length+'.'),
  'Dependency lock intentionally changed. It must be deployed together with package.json.',
  '', 'VALIDATION',
  ...Object.entries(commands).map(([name,row])=>row.command+': '+(row.passed?'PASS':'FAIL')+' | '+row.log),
  'Angular tests: '+report.angularTests+'. Pipeline tests: '+report.pipelineTests+'.',
  'Browser: '+browser.records.length+' checks PASS (actual AOT bootstrap, asynchronous SSR/CSR article data, routing, dropdown, Hindi/Arabic body and canonical, untrusted Host handling); no uncaught application exceptions.',
  'PDF integration: actual download action, PDF bytes, filename and multi-page output verified; HTML fallback was not invoked on a successful export.',
  '', 'SPEED',
  'PDF libraries are now imported only when downloading a PDF.',
  'Main JS gzip: '+main.beforeGzipBytes+' -> '+main.gzipBytes+' bytes ('+report.performance.mainGzipReductionPercent+'% smaller).',
  'Measured local SSR timings vary; some are slower than the prior run and blog responses still depend on the public CMS. No sitewide speed guarantee is claimed.',
  'Exact before/after timings and all initial asset sizes: '+directory+'/summary.json and tmp/release-performance.json.',
  '', 'BEFORE OWNER DEPLOYMENT',
  'Use Node 24 LTS (tested 24.18.0), npm 11.16.0; previous Angular 16 Node versions may be incompatible.',
  'Run npm ci; npm run build:ssr; npm run test:i18n; npm audit; both strict SEO commands.',
  'Build output paths and npm run serve:ssr remain the same. Use the Node SSR server, not only the browser directory.',
  'Complete multilingual release remains HOLD: '+report.coverage.verified+'/'+report.coverage.required+' verified; '+report.coverage.missing+' translation combinations missing.',
  'Both strict checks report '+report.coverage.seoImplementationFailures+' SEO and '+report.coverage.ssrImplementationFailures+' SSR implementation failures; missing translations still make their exit codes FAIL.',
  'Missing translations: tmp/missing-translations.csv. Release report: tmp/deployment-readiness.json.',
  '', ...report.limitations,
  '', 'PRIMARY REFERENCES',
  'https://angular.dev/reference/releases',
  'https://v21.angular.dev/api/ssr/node/CommonEngine',
  'https://v21.angular.dev/api/core/provideZoneChangeDetection',
  'https://v21.angular.dev/api/common/http/withFetch',
  'https://github.com/parallax/jsPDF/security',
  'https://github.com/advisories/GHSA-3g3m-2fjr-6pw4',
  'https://github.com/isaacs/minimatch/security/advisories/GHSA-hqmv-qgp3-jx75',
  'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
  'https://docs.npmjs.com/using-npm/config/',
].join('\n')+'\n');
fs.writeFileSync('LOCAL_COMPLETION_REPORT.txt', [
  'LOCAL PROJECT CURRENT STATUS: '+(report.fullMultilingualReleaseReady?'LOCAL_CHECKS_PASS':'HOLD'),
  'Updated: '+report.checkedAt+' | Catalog: '+report.coverage.version,
  'Verified initial translated HTML: '+report.coverage.verified+'/'+report.coverage.required+'. Missing: '+report.coverage.missing+'.',
  'Dependency security audit: '+report.audit.before.total+' -> '+report.audit.after.total+' known npm vulnerabilities.',
  'npm ci and build:ssr: PASS. Tests: '+report.angularTests+' Angular + '+report.pipelineTests+' pipeline PASS.',
  'Browser / asynchronous article checks: '+browser.records.length+' PASS. SEO and SSR implementation failures: 0.',
  'Strict multilingual checks remain FAIL while real translations are missing; no completion flags were bypassed.',
  'English catalog, '+preservation.styles.checked+' stylesheet files, '+preservation.templates.checked+' HTML files and '+preservation.publicRouteDefinitions.checked+' route definition files unchanged during this security upgrade.',
  'Dependency lock intentionally upgraded; older notes saying the lock is unchanged describe an earlier translation-only round.',
  'Security upgrade added no new translation coverage. No paid translation requests, Git push or deployment.',
  'Details: SECURITY_UPGRADE_NOTES.txt; tmp/security-remediation/summary.json; tmp/deployment-readiness.json.',
  'Build log: tmp/release-build-ssr.log. Test log: tmp/release-test-i18n.log. Missing translations: tmp/missing-translations.csv.',
].join('\n')+'\n');
console.log(JSON.stringify({status:report.status,audit:report.audit.after,tests:[report.angularTests,report.pipelineTests],coverage:report.coverage,preservation,mainGzipReductionPercent:report.performance.mainGzipReductionPercent}));
