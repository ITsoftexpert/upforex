// Publish reusable data only when actual per-message validation evidence exists.
// This does not set page completion; prepare-native-catalogs still requires
// every source key and the full initial-HTML release verifier remains mandatory.
const fs=require('node:fs'),crypto=require('node:crypto');
const u=require('./i18n-release-utils.cjs'),{financialConsistency}=require('./free-i18n-domain.cjs');
const {model,plain,identityProblems,thresholdFor}=require('./review-free-catalogs.cjs');
const provider='validated-local-nmt-v1';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function eligible(row,language){
  if(!row||!['automatic-semantic-pass','roundtrip-semantic-pass'].includes(row.status))return false;
  if(!Number.isFinite(row.similarity)||row.threshold!==thresholdFor(plain(row.english,row.kind),language))return false;
  if(row.status==='automatic-semantic-pass'&&row.similarity<row.threshold)return false;
  const source=plain(row.english,row.kind),target=plain(row.translation,row.kind);
  if(row.status==='roundtrip-semantic-pass'){
    const back=row.backValidation;
    if(!back?.passed||!Number.isFinite(back.similarity)||back.threshold!==(source.length<50?.92:.90)||back.similarity<back.threshold||back.sourceTargetSha256!==hash(row.translation)||back.sourceEnglishSha256!==hash(row.english))return false;
    if(typeof back.backTranslation!=='string'||u.validate({english:source,kind:'text'},back.backTranslation,'en').some(problem=>/numeric|placeholder|email|license|Unsafe|artifact/.test(problem))||financialConsistency(source,back.backTranslation,'en').problems.length)return false;
  }
  return !u.validate(row,row.translation,language).length&&!identityProblems(source,target).length&&!financialConsistency(source,target,language).problems.length;
}
function main(){
  process.chdir(u.root);const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(entry=>[entry.key,entry]));
  const directory='scripts/i18n-validated-translations';fs.mkdirSync(directory,{recursive:true});const summary={provider,model,humanReviewed:false,paidRequests:0,languages:{}};
  for(const language of u.languages){
    const reviewed=u.read('tmp/free-native-review/'+language+'.json',{entries:{}}),entries={};
    if(reviewed.model!==model){summary.languages[language]={accepted:Object.keys(entries).length,newlyAccepted:0};continue;}
    let added=0;
    for(const [key,row]of Object.entries(reviewed.entries)){
      const source=inventory.get(key);
      if(!source||source.english!==row.english||!eligible(row,language))continue;
      entries[key]={english:row.english,translation:row.translation,kind:row.kind,validated:true,draftProvider:row.draftProvider||'google-consumer-local-drafts-v1',
        validation:{method:row.status==='roundtrip-semantic-pass'?'cross-language-and-roundtrip-with-integrity-and-domain-checks':'cross-language-with-integrity-and-domain-checks',model,
          sourceSha256:hash(row.english),targetSha256:hash(row.translation),similarity:row.similarity,threshold:row.threshold,backValidation:row.backValidation,
          numericValuesPreserved:true,htmlStructurePreserved:true,financialAssociations:row.financialConsistency?.associations,humanReviewed:false,reviewedAt:reviewed.checkedAt}};
      added++;
    }
    fs.writeFileSync(directory+'/'+language+'.json',JSON.stringify({provider,language,model,humanReviewed:false,entries},null,2)+'\n');
    summary.languages[language]={accepted:Object.keys(entries).length,newlyAccepted:added};
  }
  fs.writeFileSync('tmp/free-native-validation-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}
module.exports={main,eligible,provider};
if(require.main===module)main();
