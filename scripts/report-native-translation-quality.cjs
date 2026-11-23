// Report actual remaining work; a saved draft is never page completion.
const fs=require('node:fs');
const u=require('./i18n-release-utils.cjs');
process.chdir(u.root);
const coverage=u.read('tmp/i18n-coverage-report.json'),missing=u.read('tmp/missing-translations.json');
if(coverage.version!==missing.version||coverage.sourceFingerprint!==missing.sourceFingerprint)throw new Error('Matching coverage and missing-source reports required');
const report={createdAt:new Date().toISOString(),version:coverage.version,publicPages:coverage.publicPages,
  requiredCombinations:coverage.publicPages*u.languages.length,declaredCompletedCombinations:coverage.declaredCompletedCombinations,
  missingCombinations:coverage.publicPages*u.languages.length-coverage.declaredCompletedCombinations,
  paidRequests:0,humanReviewed:false,visitorTimeInference:false,
  serviceHold:u.read('tmp/free-native-translations/service-hold.json',null),languages:{},examples:[]};
fs.mkdirSync('tmp/translation-review-queue',{recursive:true});
for(const language of u.languages){
  const required=new Set(coverage.pages.flatMap(page=>page.languages[language].missingKeys));
  const free=u.read('tmp/free-native-translations/'+language+'.json',{entries:{}}),offline=u.read('tmp/offline-native-translations/'+language+'.json',{entries:{}});
  const review=u.read('tmp/free-native-review/'+language+'.json',{entries:{}});
  const rows=missing.languages[language].missing.filter(entry=>required.has(entry.key)).map(entry=>{
    const candidate=[free,offline].find(cache=>cache.entries?.[entry.key]?.english===entry.english),row=review.entries[entry.key];
    const checked=row?.english===entry.english?row:undefined;
    return {...entry,translation:checked?.translation||candidate?.entries[entry.key]?.translation||null,
      draftProvider:checked?.draftProvider||candidate?.provider||null,
      validationStatus:checked?.status||(candidate?'not-yet-validated':'draft-not-available'),
      similarity:checked?.similarity,problems:checked?.structuralProblems||[],backValidation:checked?.backValidation};
  });
  const queue='tmp/translation-review-queue/'+language+'.jsonl';
  fs.writeFileSync(queue,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  report.languages[language]={completedPages:coverage.pages.filter(page=>page.languages[language].complete).length,
    incompletePages:coverage.pages.filter(page=>!page.languages[language].complete).length,requiredMissingMessages:rows.length,
    validationStatuses:rows.reduce((out,row)=>(out[row.validationStatus]=(out[row.validationStatus]||0)+1,out),{}),queue};
  for(const row of rows.filter(row=>row.problems.some(problem=>/English passage|Identity changed|numeric|percentage/.test(problem))).slice(0,2))report.examples.push({language,...row});
}
report.translationCoverageComplete=report.missingCombinations===0;
const seo=u.read('tmp/seo-verification.json',{}),ssr=u.read('tmp/ssr-i18n-verification.json',{});
report.readyForDeployment=report.translationCoverageComplete&&[seo,ssr].every(result=>
 result.version===coverage.version&&result.passed===true&&result.releaseReady===true);
report.note='Machine similarity and reverse checks are quality signals, not a guarantee or a claim of native-speaker certification. Only whole pages with all validated source messages are eligible for native coverage. The initial HTML release checks are separate and mandatory.';
fs.writeFileSync('tmp/native-translation-quality.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,examples:undefined},null,2));
