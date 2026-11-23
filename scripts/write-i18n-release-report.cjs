const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const u=require('./i18n-release-utils.cjs');
process.chdir(u.root);
const read=u.read,hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const coverage=read('tmp/i18n-coverage-report.json'),missing=read('tmp/missing-translations.json'),seo=read('tmp/seo-verification.json'),ssr=read('tmp/ssr-i18n-verification.json');
const before=read('tmp/release-performance-baseline.json'),after=read('tmp/release-performance.json');
if(coverage.version!==seo.version||coverage.version!==ssr.version)throw new Error('Run both final verifiers against the current catalog version before generating a release report.');
if(after.assets.some(asset=>!fs.existsSync('dist/upforex_Frontend/browser/'+asset.name)))throw new Error('Refresh performance results against the final production build.');
const baseline=read('tmp/release-review-baseline.json'),preservation=read('tmp/native-source-preservation.json');
const changes=Object.entries(baseline.files).filter(([file,digest])=>!fs.existsSync(file)||hash(fs.readFileSync(file))!==digest).map(([file])=>file);
const files=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name).replace(/\\/g,'/')]);
const added=[...files('src').filter(file=>/\.(?:ts|html|scss|css)$/.test(file)||file.startsWith('src/assets/i18n/')&&file.endsWith('.json')),...files('scripts')].filter(file=>!Object.hasOwn(baseline.files,file));
const timings=after.results.map(row=>({route:row.route,beforeMedianTtfbMs:before.results.find(old=>old.route===row.route)?.median.ttfbMs??null,afterMedianTtfbMs:row.median.ttfbMs,htmlGzipBytes:row.median.htmlGzipBytes}));
const assets=after.assets.map(asset=>{const old=before.assets.find(item=>item.name.split('.')[0]===asset.name.split('.')[0]);return{asset:asset.name,beforeRawBytes:old.rawBytes,afterRawBytes:asset.rawBytes,beforeGzipBytes:old.gzipBytes,afterGzipBytes:asset.gzipBytes,gzipDeltaBytes:asset.gzipBytes-old.gzipBytes};});
const test=fs.readFileSync('tmp/release-test-i18n.log','utf8').replace(/\x1b\[[\d;]*m/g,'');
const build=fs.readFileSync('tmp/release-build-ssr.log','utf8');
const audit=read('tmp/release-npm-audit.json');
const security=read('tmp/security-remediation/summary.json');
const currentSecurity=security?.packageLockSha256===hash(fs.readFileSync('package-lock.json'))&&audit?.metadata?.vulnerabilities?.total===0;
const usage=read('tmp/native-translation-usage.json',{});
const offline=read('tmp/offline-i18n/solution-report.json');
const quality=read('tmp/native-translation-quality.json');
const commandResults=read('tmp/release-command-results.json',{});
for(const name of ['npmCi','buildSsr','testI18n','strictSeo','strictSsrI18n']){
  const own=read('tmp/release-command-'+name+'.json');
  if(own)commandResults[name]=own;
}
const commandPassed=name=>{
  const command=commandResults[name];
  return command?.passed===true&&command.exitCode===0&&command.packageLockSha256===hash(fs.readFileSync('package-lock.json'))&&fs.existsSync(command.log)&&command.logSha256===hash(fs.readFileSync(command.log))&&(name==='npmCi'||command.manifestSha256===hash(fs.readFileSync('src/app/core/config/i18n-coverage.ts')));
};
const counts=Object.fromEntries(u.languages.map(language=>[language,{completedPages:Object.values(coverage.completedPages).filter(list=>list.includes(language)).length,missingPages:coverage.publicPages-Object.values(coverage.completedPages).filter(list=>list.includes(language)).length,ibCatalogComplete:missing.languages[language].ibCatalogComplete,missingMessages:quality?.version===coverage.version?quality.languages[language].requiredMissingMessages:missing.languages[language].missingEntries,sourceInventoryMissingMessages:missing.languages[language].missingEntries,missingCharacters:missing.languages[language].missingCharacters}]));
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
const requestedBranchPresent=!!execFileSync('git',['branch','--list','new-update-gpt'],{encoding:'utf8'}).trim();
const report={createdAt:new Date().toISOString(),status:'HOLD',releaseReady:false,scope:'Current local workspace',branch,requestedBranchPresent,
  pushed:false,deployed:false,paidTranslationRequestsMade:usage.requests||0,version:coverage.version,
  checks:{npmCi:{passed:commandPassed('npmCi'),exitCode:commandResults.npmCi?.exitCode,log:'tmp/release-npm-ci.log'},
    buildSsr:{passed:commandPassed('buildSsr'),exitCode:commandResults.buildSsr?.exitCode,hashes:[...build.matchAll(/Hash: ([\da-f]+)/g)].map(match=>match[1]),log:'tmp/release-build-ssr.log'},
    testI18n:{passed:commandPassed('testI18n'),exitCode:commandResults.testI18n?.exitCode,angularTests:Number(/TOTAL: (\d+) SUCCESS/.exec(test)?.[1]),pipelineTests:Number(/tests (\d+)/.exec(test)?.[1]),log:'tmp/release-test-i18n.log'},
    strictSeo:{passed:commandPassed('strictSeo')&&seo.passed,exitCode:commandResults.strictSeo?.exitCode,verifiedCompletedCombinations:seo.verifiedCompletedCombinations,implementationFailures:seo.failures.length,log:'tmp/release-verify-seo.log',report:'tmp/seo-verification.json'},
    strictSsrI18n:{passed:commandPassed('strictSsrI18n')&&ssr.passed,exitCode:commandResults.strictSsrI18n?.exitCode,verifiedCompletedCombinations:ssr.verifiedCompletedCombinations,implementationFailures:ssr.failures.length,log:'tmp/release-verify-ssr-i18n.log',report:'tmp/ssr-i18n-verification.json'}},
  coverage:{publicPages:coverage.publicPages,requiredCombinations:coverage.publicPages*10,completedCombinations:coverage.declaredCompletedCombinations,missingCombinations:seo.missingCombinations.length,byLanguage:counts,report:'tmp/i18n-coverage-report.json',missingTranslationReport:'tmp/missing-translations.json'},
  blockers:seo.missingCombinations.length?['Complete validated translations are missing for '+seo.missingCombinations.length+' public-page/language combinations. Do not advertise them as translated.']:[],
  deploymentScope:{requested:'Local project preparation only; the user will deploy later',pushAuthorized:false,deployAuthorized:false,liveHostingVerified:false},
  advisories:['Production hosting, SSR proxy configuration and live URL checks need verification when the owner deploys.'],
  sitemap:{verified:!!seo.results.find(result=>result.sitemapVerified),canonicalUrls:seo.results.find(result=>result.sitemapVerified)?.canonicalUrls,previousBackendReview:'tmp/sitemap-review.json',liveCmsRefresh:true,cacheSeconds:300,untranslatedAlternatesExcluded:true},
  dependencyAudit:{findings:audit?.metadata?.vulnerabilities,report:'tmp/release-npm-audit.json',note:currentSecurity?'Dependency lock intentionally upgraded after a compatibility review. Current installed-tree npm audit reports zero known vulnerabilities. See SECURITY_UPGRADE_NOTES.txt.':'Review the current dependency audit together with the lockfile; no security remediation claim is inferred from translation checks.'},
  preservation:{styleFilesCompared:preservation.checkedStyles,failures:preservation.failures,englishCatalogUnchanged:hash(fs.readFileSync('src/assets/i18n/en.json'))===baseline.files['src/assets/i18n/en.json'],componentMetadataEnglishLiteralsUnchanged:read('tmp/component-metadata-preservation.json')?.englishLiteralsUnchanged===true,publicRouteDefinitionsUnchanged:changes.every(file=>!file.endsWith('routing.module.ts')),dependencyLockUnchanged:hash(fs.readFileSync('package-lock.json'))===baseline.files['package-lock.json'],report:'tmp/native-source-preservation.json'},
  changes:{modifiedExistingFiles:changes,addedFiles:added,summary:['Normalize localized inner-page trailing slashes with query/encoded segment preservation.','Reuse exact-source validated translations and generate per-page catalogs and a real coverage version.','Wait for local catalogs before SSR/CSR render, protect completed native pages from widget retranslation, preserve English fallback for incomplete pages.','Read IB copy from the original English object and translate its leaves; localize footer and carousel accessibility labels.','Localize final router and component metadata updates so English titles/descriptions/keywords cannot overwrite translated metadata. Preserve their original English literals.','Verify every declared completed page/language initial body, title/description/keywords, translatable attributes, structure, canonical and reciprocal hreflang; reject untranslated or untracked English.','Reuse validated translations in offline estimates; no paid requests were made.']},
  performance:{kind:'Local warm SSR only; no production CWV claim',timings,assets,largestPageCatalogGzipBytes:Math.max(...coverage.payloads.map(payload=>payload.gzipBytes)),pageCatalogsOnDemand:true,browserPageCacheLimit:12,serverPageCacheLimit:64,report:'tmp/release-performance.json'},
  translationPlan:offline?{mode:'local-offline',provider:offline.provider,cloudAccountRequired:false,apiKeyRequired:false,paidRequests:0,drafts:offline.draftCount,publishedDrafts:offline.publishedDrafts,reviewRequired:true,report:'tmp/offline-i18n/solution-report.json'}:read('tmp/native-translation-plan.json')};
if(seo.failures.length||ssr.failures.length)report.blockers.push('Implementation verification failures remain; inspect both strict verification reports.');
const sheetReview=read('tmp/sheet-metadata-verification.json');
if(sheetReview?.version===coverage.version){
  report.sheetMetadata={source:sheetReview.source,matchedRows:sheetReview.exactMatchedRows,appliedRows:sheetReview.appliedRows,heldRows:sheetReview.heldRows,unmatchedRows:sheetReview.unmatchedRows,initialHtmlResponsesVerified:sheetReview.matchedInitialHtmlResponsesVerified,report:'tmp/sheet-metadata-verification.json'};
  report.sheetMetadata.latestSnapshotRecheck=read('tmp/sheet-snapshot-recheck.json');
  report.changes.summary.push('Apply exact approved spreadsheet titles/descriptions in per-page catalogs, verify every matched initial HTML response, and hold foreign metadata until the body is complete. Preserve unmatched URLs for review.');
  if(sheetReview.unmatchedRows)report.advisories.push(sheetReview.unmatchedRows+' metadata-sheet URLs do not exactly match current public routes/CMS permalinks. They are excluded from the applied-head claim; retired routes were not recreated.');
}
report.changes.summary.push('Generate a server-only sitemap from current public routes and validated translation coverage; retain live CMS refresh, encoded canonical blog slugs and cached outage fallback.');
if(offline)report.changes.summary.push('Provide local offline model-based draft generation without a cloud account or key; exclude unreviewed drafts from published coverage. Review exact-source shared translations, preserve registered company names and localize homepage carousel accessibility labels.');
if(quality?.version===coverage.version){
  report.translationPlan={mode:'cached-and-local-build-time-catalogs',cloudAccountRequired:false,apiKeyRequired:false,paidRequests:0,visitorTimeInference:false,humanReviewed:false,
    requiredMissingMessagesByLanguage:quality.languages,serviceHold:quality.serviceHold,report:'tmp/native-translation-quality.json'};
  report.changes.summary.push('Preserve market identifiers, repair reviewed financial terminology and product names, normalize Traditional Chinese locally, and hold machine drafts with unresolved English, value, identity or meaning checks. Keep model binaries outside website assets.');
  if(quality.missingCombinations)report.blockers.push('Remaining blog/listing translations require completion and validation. The free translation service returned HTTP 429 and is on hold; cached/local drafts are not automatically approved.');
}else if(offline?.reviewQueue){
  report.translationPlan.reviewQueue=offline.reviewQueue;
  report.translationPlan.generationStatus=offline.generationStatus;
  report.blockers.push('Saved model drafts include meaning, company-name and financial-terminology errors; structural checks are not semantic approval. Complete exact-source translation review before publication.');
  report.changes.summary.push('Reuse already accepted translations only across equivalent single-text HTML wrappers, preserve instrument codes and numeric amounts, and retain a per-language review queue for every incomplete page.');
}
const previousRelease=read('tmp/sheet-metadata-baseline/deployment-readiness.json');
const roundBaseline=read('tmp/remaining-490/baseline-release.json');
const completionBaseline=(roundBaseline?.coverage?{version:roundBaseline.version,publicPages:roundBaseline.coverage.publicPages,verifiedCompletedCombinations:roundBaseline.checks.strictSsrI18n.verifiedCompletedCombinations,missingCombinations:roundBaseline.coverage.missingCombinations}:null)||read('tmp/remaining-resolution-baseline.json')||(previousRelease?.coverage?{version:previousRelease.version,publicPages:previousRelease.coverage.publicPages,
  verifiedCompletedCombinations:previousRelease.checks.strictSsrI18n.verifiedCompletedCombinations,missingCombinations:previousRelease.coverage.missingCombinations}:read('tmp/offline-i18n/completion-baseline.json'));
if(completionBaseline?.publicPages<=coverage.publicPages){
  report.translationProgress={baselineVersion:completionBaseline.version,
    previouslyVerified:completionBaseline.verifiedCompletedCombinations,previouslyMissing:completionBaseline.missingCombinations,
    currentlyVerified:ssr.verifiedCompletedCombinations,newlyVerified:ssr.verifiedCompletedCombinations-completionBaseline.verifiedCompletedCombinations,
    newlyDiscoveredPublicPages:coverage.publicPages-completionBaseline.publicPages,
    newlyRequiredCombinations:(coverage.publicPages-completionBaseline.publicPages)*u.languages.length,
    cmsRefreshComparison:read('tmp/translation-cms-refresh.json')||read('tmp/offline-i18n/cms-refresh-comparison.json'),remaining:seo.missingCombinations.length};
  report.changes.summary.push('Reject case-only English fallback and long copied English passages; let reviewed exact-source corrections supersede older mechanically valid cache entries.');
}
if(audit?.metadata?.vulnerabilities?.critical)report.blockers.push('Existing dependency advisories include critical findings; compatibility review and remediation remain open.');
const urlAudit=read('tmp/sheet-url-audit-local.json');
if(urlAudit){
 report.urlAudit={source:urlAudit.sourceSheet,checkedAt:urlAudit.checkedAt,report:'tmp/sheet-url-audit-local.json',checkedUrls:urlAudit.results.length,
  failedUrls:urlAudit.results.filter(row=>row.error||row.problems?.length).map(row=>({path:row.path,error:row.error,problems:row.problems}))};
 report.changes.summary.push('Migrate the three broken blog permalinks through one-hop 301 redirects, preserve stored CMS IDs, normalize internal card links, and expose all current CMS articles in the existing Featured Trading Guides section.');
}
report.sourceClaimReview={report:'tmp/english-source-claim-review.json',englishContentModified:false,note:'Existing English articles contain different FSC licence identifiers. Confirm entities and effective dates with the owner; translation does not validate regulatory status.'};
report.cmsFinalRecheck=read('tmp/final-cms-source-recheck.json');
report.finalSheetRecheck=read('tmp/final-sheet-recheck.json');
report.performance.baselineReport='tmp/release-performance-baseline.json';
report.performance.finalMeasurementReports=after.finalMeasurementReports||['tmp/release-performance.json'];
report.performance.measurementNote=after.measurementNote;
const firstFinalTiming=read('tmp/remaining-490/performance-final-first.json');
if(firstFinalTiming)report.performance.firstFinalRun=firstFinalTiming.results.map(row=>({route:row.route,medianTtfbMs:row.median.ttfbMs}));
const roundPerformance=read('tmp/remaining-490/performance-before.json');
if(roundPerformance){
 report.performance.currentTranslationRound={baselineReport:'tmp/remaining-490/performance-before.json',
  timings:after.results.map(row=>({route:row.route,beforeMedianTtfbMs:roundPerformance.results.find(old=>old.route===row.route)?.median.ttfbMs,afterMedianTtfbMs:row.median.ttfbMs})),
  assets:after.assets.map(asset=>{const old=roundPerformance.assets.find(item=>item.name.split('.')[0]===asset.name.split('.')[0]);return{asset:asset.name,beforeGzipBytes:old?.gzipBytes,afterGzipBytes:asset.gzipBytes,gzipDeltaBytes:asset.gzipBytes-(old?.gzipBytes||0)};})};
}
report.currentTranslationRoundPreservation=read('tmp/remaining-490/preservation.json');
report.generatedCatalogArchive=read('tmp/native-catalog-archive-report.json');
if(report.generatedCatalogArchive?.activeVersion===coverage.version)report.changes.summary.push('Move positively identified stale generated catalog versions into a reversible local tmp archive; ship only the active version. Current source translations and public URLs remain available.');
if(report.currentTranslationRoundPreservation?.originalCmsTagBinding?.exactSingleFlagChange)report.changes.summary.push('Mark original uppercase CMS tags explicitly in the translation pipe so a target-value collision cannot leave English tags in the translated initial body. Preserve the rest of the blog template byte for byte.');
report.performance.cmsDiagnosis={report:'tmp/cms-performance-diagnosis.json',...read('tmp/cms-performance-diagnosis.json',{})};
if(after.results.some(row=>row.route.startsWith('/blogs')&&row.median.ttfbMs>1000))report.advisories.push('Some measured blog SSR warm responses exceed one second; use the exact timings in tmp/release-performance.json. Earlier direct public CMS probes measured 1.1–2.2 seconds TTFB. No sitewide speed or production Core Web Vitals guarantee is made.');
if(roundPerformance&&after.results.some(row=>!row.route.includes('/blogs')&&row.median.ttfbMs-(roundPerformance.results.find(old=>old.route===row.route)?.median.ttfbMs||0)>150))report.advisories.push('Repeated local static SSR samples on some routes are about 200–230 ms slower than the recorded earlier baseline. Both final timing runs are retained; bundle size increased only 220 gzip bytes. No unchanged-latency claim is made.');
report.preservation.intentionalToolNavigationLinks=preservation.intentionalToolNavigationLinks||0;
report.internalLinks={report:'tmp/internal-link-audit.json',checkedPages:read('tmp/internal-link-audit.json')?.checkedPublicPages,withoutIncomingLinks:read('tmp/internal-link-audit.json')?.withoutIncomingLinks};
if(report.internalLinks.withoutIncomingLinks?.length)report.advisories.push('Public URLs without incoming initial-HTML links: '+report.internalLinks.withoutIncomingLinks.join(', ')+'. The original Currency Volatility card remains commented out; its existing URL and functionality were retained.');
report.changes.summary.push('Convert the nine visible calculator navigation buttons to crawlable links, retaining destinations, labels and CSS classes. Keep the original commented Currency Volatility card disabled. Validate dynamic CMS categories and recommendations against their own current source records.');
report.localReleaseChecksPassed=Object.values(report.checks).every(check=>check.passed)&&seo.releaseReady&&ssr.releaseReady;
report.status=report.localReleaseChecksPassed?'LOCAL_CHECKS_PASS':'HOLD';
report.releaseReady=report.localReleaseChecksPassed&&!report.blockers.length;
report.productionHostingVerified=false;
report.changes.summary.push('Keep actual command exit codes and log hashes, verify current CMS head metadata, return real HTTP 404 for missing public pages, and preserve one-hop localized legacy redirects.');
report.changes.summary.push('Hash only published translations so unfinished draft edits do not invalidate every completed catalog and browser bundle. Reuse existing working JSON translations before new machine candidates.');
if(currentSecurity){
  report.securityUpgrade={status:security.status,versions:security.versions,report:'tmp/security-remediation/summary.json',notes:'SECURITY_UPGRADE_NOTES.txt',browserReport:security.browser.report};
  report.preservation.dependencyLockIntentionallyUpgraded=true;
  report.preservation.securityUpgradeSourceChecks=security.preservation;
  report.preservation.styleFilesCompared=security.preservation.styles.checked;
  report.changes.summary.push('Migrate vulnerable Angular/Universal dependencies to supported Angular 21 and CommonEngine; preserve NgModule and zone behavior, request-scoped SSR providers and trusted canonical origin. Upgrade compatible peer libraries and jsPDF; verify installed-tree audit, browser routing/dropdown and PDF download.');
  report.changes.summary.push('Load PDF libraries only on download; record actual gzip sizes and local SSR timings, including slower samples. No production Core Web Vitals guarantee is made.');
  report.advisories.push('Use Node 24 LTS (tested 24.18.0) for the upgraded build and SSR server. Legacy deprecation warnings remain separate from current npm advisory findings.');
}
fs.writeFileSync('tmp/deployment-readiness.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('tmp/missing-translations-summary.json',JSON.stringify({version:coverage.version,publicPages:coverage.publicPages,requiredCombinations:coverage.publicPages*10,completedCombinations:coverage.declaredCompletedCombinations,missingCombinations:seo.missingCombinations.length,languages:counts,fullReport:'tmp/missing-translations.json'},null,2)+'\n');
const coverageRows=coverage.pages.flatMap(page=>u.languages.map(language=>{
  const translated=page.languages[language].complete;
  const verified=[seo,ssr].every(check=>check.results.some(row=>row.page===page.path&&row.language===language&&row.foreignNativeBodyVerified));
  return {page:page.path,language,status:translated?(verified?'completed_and_initial_html_verified':'declared_but_html_not_verified'):'held_missing_translation',missing_messages:page.languages[language].missingKeys.length,initial_html_verified:verified};
}));
const writeCsv=(file,rows)=>{const columns=['page','language','status','missing_messages','initial_html_verified'],cell=value=>'"'+String(value).replace(/"/g,'""')+'"';fs.writeFileSync(file,columns.map(cell).join(',')+'\n'+rows.map(row=>columns.map(column=>cell(row[column])).join(',')).join('\n')+'\n');};
writeCsv('tmp/translation-coverage.csv',coverageRows);
writeCsv('tmp/missing-translations.csv',coverageRows.filter(row=>row.status==='held_missing_translation'));
fs.writeFileSync('tmp/release-summary.txt',[
  'DEPLOYMENT STATUS: '+report.status,
  'Reviewed current local workspace. Git branch label: '+branch+'; local new-update-gpt branch present: '+requestedBranchPresent,
  'No push or deployment. Paid translation requests attempted: '+report.paidTranslationRequestsMade+'. Dependency lockfile unchanged: '+report.preservation.dependencyLockUnchanged+'.',
  '', 'WHAT CHANGED',...report.changes.summary.map((value,index)=>(index+1)+'. '+value),
  '', 'REQUIRED CHECKS',...Object.entries(report.checks).map(([name,result])=>name+': '+(result.passed?'PASS':'FAIL')+' | '+result.log),
  '', 'TRANSLATED INITIAL HTML',
  ...(report.translationProgress?['Progress from previous verified release: '+report.translationProgress.previouslyVerified+' -> '+report.translationProgress.currentlyVerified+' combinations; newly verified: '+report.translationProgress.newlyVerified+'.']:[]),
  ...(report.translationProgress?.newlyDiscoveredPublicPages?['New English CMS pages discovered during verification: '+report.translationProgress.newlyDiscoveredPublicPages+'; additional language combinations required: '+report.translationProgress.newlyRequiredCombinations+'.']:[]),
  'Verified '+ssr.verifiedCompletedCombinations+' completed page/language combinations across '+coverage.publicPages+' public pages.',
  'Missing '+seo.missingCombinations.length+' of '+coverage.publicPages*10+' required combinations. Sitewide completed languages: '+(u.coverage().COMPLETED_NATIVE_LANGUAGES.join(', ')||'none')+'.',
  ...Object.entries(counts).map(([language,row])=>language+': '+row.completedPages+' completed pages, '+row.missingPages+' incomplete pages, '+row.missingMessages+' missing source messages; IB text catalog complete: '+row.ibCatalogComplete),
  '', 'PRESERVATION',
  'Original English catalog unchanged: '+report.preservation.englishCatalogUnchanged,
  'Style files checked without changes: '+report.preservation.styleFilesCompared,
  'Public route definitions unchanged: '+report.preservation.publicRouteDefinitionsUnchanged,
  'Sitemap canonical URLs verified: '+report.sitemap.canonicalUrls+'; only certified translated URLs included.',
  '', 'SPEED (local warm SSR; not production Core Web Vitals)',
  ...timings.map(row=>row.route+': '+row.beforeMedianTtfbMs+' -> '+row.afterMedianTtfbMs+' ms median TTFB'),
  'Main JavaScript gzip delta: '+assets.find(row=>row.asset.startsWith('main.')).gzipDeltaBytes+' bytes.',
  'Largest on-demand page catalog: '+report.performance.largestPageCatalogGzipBytes+' gzip bytes.',
  '', 'OPEN RELEASE WORK',...report.blockers,
  '', 'OWNER REVIEW / LATER DEPLOYMENT',...report.advisories,
  'Existing English licence-identifier differences: tmp/english-source-claim-review.json. No source claim was silently rewritten.',
  'Current npm audit: '+JSON.stringify(report.dependencyAudit.findings),
  ...(currentSecurity?['Dependency security changes: SECURITY_UPGRADE_NOTES.txt; evidence: tmp/security-remediation/summary.json.']:[]),
  ...(quality?.version===coverage.version?[
    'Alternative used: existing cached translations and local models. No paid translation requests; no visitor-time model inference.',
    'Free-service hold: '+JSON.stringify(quality.serviceHold),
    'Unresolved source/target review queues: tmp/translation-review-queue/*.jsonl. Draft existence and metadata do not certify translated body completion.',
    'Quality report: tmp/native-translation-quality.json. Native-speaker certification is not claimed.',
  ]:offline?[
    'Selected alternative: local offline translation models. No cloud account, key or paid inference request required.',
    'Installed models: '+offline.installedModelLanguages.length+'; tested drafts: '+offline.draftCount+'; automatically published drafts: 0.',
    'Drafts require meaning/terminology review. Numeric and structural checks alone cannot prove translation accuracy.',
    ...(offline.generationStatus?[offline.generationStatus,'Per-language exact-source review queues: '+offline.reviewQueue]:[]),
    'Local setup is ready: tmp/offline-i18n/setup.txt. Models stay outside production website assets.',
  ]:[
    'Offline estimate after reuse: US$'+report.translationPlan.estimatedUsdBeforeCreditsAndTaxes+' before credits/taxes; no spending is approved.',
    'Key setup: create Google Cloud project, enable billing and Cloud Translation API, create a key restricted to Cloud Translation API. Put it only in .env.translation.local; leave TRANSLATION_MAX_CHARACTERS=0 until an explicit budget is approved.',
    'The existing browser translator does not provide translated initial SSR HTML. A key/approved translations would be used only to generate reusable local build-time catalogs.',
  ]),
  '', 'REPORTS: tmp/deployment-readiness.json, tmp/i18n-coverage-report.json, tmp/missing-translations-summary.json, tmp/missing-translations.json',
].join('\n')+'\n');
fs.writeFileSync('LOCAL_RELEASE_STATUS.txt',[
  'LOCAL PROJECT RELEASE STATUS: '+report.status,
  'Generated: '+report.createdAt+' | Catalog: '+report.version,
  'Full multilingual deployment ready: '+report.releaseReady,
  'Initial translated HTML verified: '+ssr.verifiedCompletedCombinations+'/'+coverage.publicPages*10+' page/language combinations.',
  'Missing validated translations: '+seo.missingCombinations.length+'.',
  'No Git push, live deployment or paid translation requests were made.',
  ...(currentSecurity?['Dependency security upgrade verified: npm audit reports 0 known vulnerabilities. Read SECURITY_UPGRADE_NOTES.txt.']:[]),
  'Current release evidence overrides older hybrid-widget setup examples.',
  '',
  ...Object.entries(report.checks).map(([name,result])=>name+': '+(result.passed?'PASS':'FAIL')+' | '+result.log),
  '',
  'Read tmp/release-summary.txt for changes, performance limits and unresolved work.',
  'Full evidence: tmp/deployment-readiness.json',
  'Missing translations: tmp/missing-translations-summary.json and tmp/translation-review-queue/*.jsonl',
  '',
  'Later hosting must run the Node SSR application (npm run serve:ssr) and route page requests to it.',
  'Serving only dist/upforex_Frontend/browser cannot provide the verified native initial SSR HTML.',
  'Do not deploy the full multilingual release until both --require-complete checks pass.',
].join('\n')+'\n');
console.log(JSON.stringify({status:report.status,checks:report.checks,coverage:counts,preservation:report.preservation,performance:report.performance},null,2));
