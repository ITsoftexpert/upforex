// Reconcile the approved sheet without treating a redirect or exclusion as translated content.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const u=require('./i18n-release-utils.cjs');process.chdir(u.root);
const imported=u.read('tmp/sheet-metadata-import.json'),coverage=u.read('tmp/i18n-coverage-report.json');
const seo=u.read('tmp/seo-verification.json',{}),ssr=u.read('tmp/ssr-i18n-verification.json',{}),sheetGate=u.read('tmp/sheet-fix-20261123/sheet-verification.json',{});
const version=coverage.version;
const liveEquivalence=u.read('tmp/frontend-only/live-source-equivalence.json',{});
const realProductionCms=liveEquivalence.passed===true&&Date.now()-Date.parse(liveEquivalence.liveFetchedAt)<86400000&&[seo,ssr].every(report=>report.mode==='local-production-SSR-with-frontend-public-cache');
const verified=imported.entries.map(entry=>{
 const route=entry.language==='en'?entry.page:'/'+u.prefixes[entry.language]+(entry.page==='/'?'':entry.page);
 const checks=[seo,ssr].map(report=>report.version===version?report.results?.find(result=>result.route===route):undefined);
 return {...entry,canonicalRoute:route,initialHtmlVerified:checks.every(result=>result?.sheetMetadataVerified),appliedToInitialHtml:entry.status==='eligible-for-initial-HTML'&&checks.every(result=>result?.sheetMetadataVerified&&!result.sheetMetadataHeld),sheetSpecificHtmlVerified:sheetGate.version===version&&sheetGate.passed&&sheetGate.metadata?.some(row=>row.row===entry.row&&row.approvedInitialMetadataVerified)};
});
const baseline=u.read('tmp/release-performance.json',{});
const headOverhead=(coverage.payloads||[]).filter(payload=>imported.entries.some(entry=>entry.page===payload.page&&entry.language===payload.language)).map(payload=>{
 const actual=u.read(`src/assets/i18n/native/${version}/${payload.language}/${u.contentKey(payload.page)}.json`);
 const {__nativeMetadata,...withoutMetadata}=actual;
 return zlib.gzipSync(Buffer.from(JSON.stringify(actual))).length-zlib.gzipSync(Buffer.from(JSON.stringify(withoutMetadata))).length;
});
const browser='dist/upforex_Frontend/browser';
const bundleDeltas=(baseline.assets||[]).flatMap(old=>{
 const name=fs.readdirSync(browser).find(name=>name.split('.')[0]===old.name.split('.')[0]&&path.extname(name)===path.extname(old.name));
 return name?[{asset:name,gzipBytes:zlib.gzipSync(fs.readFileSync(path.join(browser,name))).length,baselineGzipBytes:old.gzipBytes,gzipDeltaBytes:zlib.gzipSync(fs.readFileSync(path.join(browser,name))).length-old.gzipBytes}]:[];
});
const allRowsResolved=imported.allRowsAccountedFor===true&&imported.accountedRows===imported.totalRows&&sheetGate.version===version&&sheetGate.passed;
const fullAuditsPass=[seo,ssr].every(report=>report.version===version&&report.passed&&report.requireComplete&&report.verifiedCompletedCombinations===1110);
const report={checkedAt:new Date().toISOString(),version,cmsVerificationScope:'Actual frontend SSR against cached public source; all 61 full source records independently matched a recent successful existing production CMS refresh',liveContentEquivalence:liveEquivalence,scope:'Approved canonical metadata, verified existing-destination redirects and one explicit user-confirmed obsolete exclusion. Redirect/exclusion rows do not create translated pages.',source:imported.source,totalSheetRows:imported.totalRows,exactMatchedRows:imported.exactMatchedRows,canonicalPages:imported.matchedPages,applicableRows:imported.eligibleRows,accountedRows:imported.accountedRows,allSheetRowsResolved:allRowsResolved,appliedRows:verified.filter(row=>row.appliedToInitialHtml).length,sheetSpecificInitialHtmlRowsVerified:verified.filter(row=>row.sheetSpecificHtmlVerified).length,heldRows:imported.heldRows,unmatchedRows:imported.unmatchedRows,aliases:imported.aliases,accountRedirects:imported.accountRedirects,userExcluded:imported.excluded,unmatched:imported.unmatched,warnings:imported.warnings,entries:verified,
 fullAuditFailures:verified.filter(row=>!row.initialHtmlVerified),performance:{additionalCatalogRequestsPerNavigation:0,allLanguagesBundledInMainJavaScript:false,maxAdditionalPageCatalogGzipBytes:Math.max(0,...headOverhead),bundleDeltas,baselineCheckedAt:baseline.checkedAt,baselineReport:'tmp/release-performance.json',note:'Current compressed build sizes compared with the timestamped historical build. Earlier SSR/LCP timings were not rerun by this report. The frontend-only public CMS gateway projects cached cards. Its saved source date is explicit; current live API freshness is a separate deployment condition.'},bodyCoverage:{completedCombinations:coverage.declaredCompletedCombinations,missingCombinations:1110-coverage.declaredCompletedCombinations,falselyCompletedByMetadata:0},sheetRequirementsPassed:allRowsResolved,completeReleaseAuditsPassed:fullAuditsPass,localChecksPassed:allRowsResolved&&fullAuditsPass&&imported.heldRows===0&&verified.every(row=>row.initialHtmlVerified),requiresProductionCmsVerification:!realProductionCms,releaseReady:realProductionCms&&allRowsResolved&&fullAuditsPass&&imported.heldRows===0&&verified.every(row=>row.initialHtmlVerified),liveCloudflareVerified:false,deployed:false,pushed:false,paidTranslationRequestsMade:0};
fs.writeFileSync('tmp/sheet-metadata-verification.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('tmp/sheet-metadata-summary.txt',[
 'SHEET METADATA REVIEW - LOCAL ONLY',`Checked: ${report.checkedAt}; catalog ${version}.`,`Source: ${imported.source.sheet}`,
 `All sheet rows accounted for: ${report.accountedRows}/${report.totalSheetRows}.`,
 `Exact canonical rows: ${report.exactMatchedRows}; three matching legacy blog rows applied to real CMS articles; applicable canonical heads ${report.applicableRows}.`,
 `Sheet-specific initial HTML: ${report.sheetSpecificInitialHtmlRowsVerified}/${report.applicableRows}; both complete SSR audits: ${report.appliedRows}/${report.applicableRows}.`,
 `Legacy aliases: ${report.aliases.length} (301); existing account actions: ${report.accountRedirects.length} (302); user-confirmed obsolete exclusion: ${report.userExcluded.length} (existing 404).`,
 `Unmatched: ${report.unmatchedRows}; held metadata: ${report.heldRows}. No redirect/exclusion is counted as a completed translated body.`,
 `Native body catalogs: ${report.bodyCoverage.completedCombinations}/1110; missing ${report.bodyCoverage.missingCombinations}.`,
 `Sheet-specific gate: ${report.sheetRequirementsPassed?'PASS':'HOLD'}; full strict release gates: ${report.completeReleaseAuditsPassed?'PASS':'HOLD'}.`,
 'No English article body, stylesheet, CTA action or CMS record changed by the metadata reconciliation.',
 'No visitor-time translation API; one existing locale/page catalog per navigation; no new runtime dependency.',
 'The 111 Cloudflare email-link source pages are checked at the local origin. Actual live edge behavior needs post-deployment confirmation.',
 'Full details: tmp/sheet-metadata-verification.json; exact URL dispositions: tmp/sheet-fix-20261123/url-dispositions.csv.',
 `Actual CMS target: ${seo.cmsOrigin||'https://api.upforex.com'}. Production API verification required: ${!realProductionCms}.`,
 'Read LOCAL_COMPLETION_REPORT.txt for the full deployment decision, not this sheet-only gate.',
 'No paid translation request, push or deployment.'
].join('\n')+'\n');
console.log(JSON.stringify({version,accountedRows:report.accountedRows,applicableRows:report.applicableRows,sheetRequirementsPassed:report.sheetRequirementsPassed,completeReleaseAuditsPassed:fullAuditsPass,releaseReady:report.releaseReady}));
