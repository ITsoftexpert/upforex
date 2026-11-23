// A resumable work report. Draft availability is never completed coverage.
const fs=require('node:fs');
const u=require('./i18n-release-utils.cjs');
const {assessDraft}=require('./offline-i18n-quality.cjs');
function main(){
  process.chdir(u.root);
  const coverage=u.read('tmp/i18n-coverage-report.json'),missing=u.read('tmp/missing-translations.json');
  if(!coverage?.version||coverage.sourceFingerprint!==missing?.sourceFingerprint)throw Error('Matching current coverage/missing reports required');
  const queues={},languages={},examples=[];
  fs.mkdirSync('tmp/offline-i18n/review-queue',{recursive:true});
  for(const language of u.languages){
    const cache=u.read(`tmp/offline-native-translations/${language}.json`,{}),rows=[];
    for(const entry of missing.languages[language].missing){
      const candidate=cache.provider?.startsWith('argos-ctranslate2-local-')&&cache.entries?.[entry.key]?.english===entry.english?cache.entries[entry.key]:undefined;
      const translation=candidate?.translation||'';
      const assessment=assessDraft(entry,translation,language);
      const row={key:entry.key,english:entry.english,translation,kind:entry.kind,sources:entry.sources,
        provider:candidate?cache.provider:null,draftExists:!!translation,...assessment};
      rows.push(row);
      if(translation&&assessment.qualityFlags.length&&examples.length<10)examples.push({language,key:entry.key,english:entry.english,translation,qualityFlags:assessment.qualityFlags});
    }
    queues[language]=new Map(rows.map(row=>[row.key,row]));
    languages[language]={missingReviewedEntries:rows.length,nonemptyDrafts:rows.filter(row=>row.draftExists).length,
      draftsWithoutStructuralProblems:rows.filter(row=>row.draftExists&&!row.structuralProblems.length).length,
      draftsHeldForStructuralProblems:rows.filter(row=>row.draftExists&&row.structuralProblems.length).length,
      draftsWithAdditionalQualityFlags:rows.filter(row=>row.draftExists&&row.qualityFlags.length).length,
      draftsWithFinancialWarnings:rows.filter(row=>row.draftExists&&row.financialProblems.length).length,
      semanticReviewComplete:0,approvedDraftsPublished:0};
    fs.writeFileSync(`tmp/offline-i18n/review-queue/${language}.jsonl`,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
  }
  const pairs=[];
  for(const page of coverage.pages)for(const language of u.languages){
    const keys=page.languages[language].missingKeys;
    if(!keys.length)continue;
    const rows=keys.map(key=>queues[language].get(key));
    pairs.push({page:page.path,language,missingReviewedEntries:keys.length,nonemptyDrafts:rows.filter(row=>row?.draftExists).length,
      allMissingDraftTextExists:rows.every(row=>row?.draftExists),reviewComplete:false,completed:false});
  }
  const report={createdAt:new Date().toISOString(),version:coverage.version,sourceFingerprint:coverage.sourceFingerprint,
    requiredCombinations:coverage.publicPages*u.languages.length,declaredCompletedCombinations:coverage.declaredCompletedCombinations,
    remainingCombinations:pairs.length,languages,pairs,qualityExamples:examples,
    automaticPublication:false,paidRequestsMade:0,visitorTimeInference:false,
    note:'Drafts require an exact-source meaning/terminology review. Matching numbers and HTML are necessary checks and do not prove semantic accuracy. No draft was promoted automatically.'};
  fs.writeFileSync('tmp/offline-i18n/review-status.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,pairs:undefined,qualityExamples:undefined},null,2));
}
module.exports={main};
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
