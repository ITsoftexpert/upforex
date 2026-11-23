const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const {provider}=require('./translate-offline-catalogs.cjs');
process.chdir(u.root);
const languages={};
for(const language of u.languages){
  const cache=u.read(`tmp/offline-native-translations/${language}.json`,{});
  const rows=cache.provider===provider?Object.values(cache.entries||{}):[];
  languages[language]={drafts:rows.length,structuralChecksPassed:rows.filter(row=>row.structuralChecksPassed).length,
    heldByStructuralChecks:rows.filter(row=>!row.structuralChecksPassed).length,reviewedDrafts:rows.filter(row=>row.reviewed).length,
    problems:Object.fromEntries([...new Set(rows.flatMap(row=>row.problems||[]))].map(problem=>[problem,rows.filter(row=>row.problems?.includes(problem)).length]))};
}
const manifest=u.coverage(),ssr=u.read('tmp/ssr-i18n-verification.json',{}),models=u.read('tmp/offline-i18n/models.json',{});
const report={createdAt:new Date().toISOString(),provider,cloudAccountRequired:false,apiKeyRequired:false,paidTranslationRequests:0,
  installedModelLanguages:Object.keys(models),runtimeInstalled:fs.existsSync('tmp/offline-i18n/venv/Scripts/python.exe')||fs.existsSync('tmp/offline-i18n/venv/bin/python'),
  websiteRunsModel:false,modelsIncludedInBrowserBundle:false,automaticDraftPublication:false,
  draftCount:Object.values(languages).reduce((sum,row)=>sum+row.drafts,0),publishedDrafts:0,languages,
  reviewedCatalogRows:Object.values(u.read('scripts/i18n-reviewed-translations.json')).reduce((sum,rows)=>sum+Object.keys(rows).length,0),
  version:manifest.NATIVE_I18N_VERSION,declaredCompletedCombinations:Object.values(manifest.COMPLETED_NATIVE_PAGES).reduce((sum,rows)=>sum+rows.length,0),
  verifiedCompletedCombinations:ssr.version===manifest.NATIVE_I18N_VERSION?ssr.verifiedCompletedCombinations:0,
  fullSiteReady:false,remainingWork:'Complete and review missing exact-source translations. Model drafts are not linguistic validation or production completion.',
  examplesOfHeldOutput:[{source:'Upto 1:300',draft:"Jusqu'à 1 300",reason:'Changed numeric values; excluded from publication'}],
  setup:'tmp/offline-i18n/setup.txt',notices:'scripts/offline-i18n-NOTICES.txt',modelProvenance:'tmp/offline-i18n/models.json'};
const review=u.read('tmp/offline-i18n/review-status.json');
if(review?.version===manifest.NATIVE_I18N_VERSION){
  report.remainingCombinations=review.remainingCombinations;
  report.reviewQueue='tmp/offline-i18n/review-status.json';
  report.qualityExamples=review.qualityExamples;
  report.generationStatus='Raw draft generation stopped after quality review found company-name and financial-terminology errors. Only separately reviewed exact-source translations and corrections enter the gated catalogs.';
  report.additionalDraftQualityByLanguage=review.languages;
}
const seo=u.read('tmp/seo-verification.json',{});
const coverage=u.read('tmp/i18n-coverage-report.json',{});
report.translationCoverageComplete=coverage.version===manifest.NATIVE_I18N_VERSION&&coverage.sitewideNativeTranslationComplete===true;
report.fullSiteReady=report.translationCoverageComplete&&[seo,ssr].every(result=>result.version===manifest.NATIVE_I18N_VERSION&&result.passed===true&&result.releaseReady===true);
report.remainingWork=report.fullSiteReady?'Local translated-content release checks passed. The owner will deploy and verify live SSR hosting separately.':report.translationCoverageComplete?'Run both strict initial HTML release checks against the completed catalogs.':'Complete and review missing exact-source translations. Model drafts are not linguistic validation or production completion.';
fs.writeFileSync('tmp/offline-i18n/solution-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({provider,models:report.installedModelLanguages.length,drafts:report.draftCount,publicationAutomatic:false,paidRequests:0,verified:report.verifiedCompletedCombinations}));
