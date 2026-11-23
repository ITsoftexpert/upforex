// Independent reverse-direction evidence for flagged source/target pairs.
// Requests share the forward generator's single, rate-limited transport lock.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const u=require('./i18n-release-utils.cjs');
const {worker,plain,model}=require('./review-free-catalogs.cjs');
const {curlTranslate,parseAlignedBatch,protectIdentities}=require('./translate-free-catalogs.cjs');
const {normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function groups(rows){const result=[];let batch=[],size=0;for(const row of rows){const extra=encodeURIComponent(row.input).length+45;if(batch.length&&(size+extra>11500||batch.length>=35)){result.push(batch);batch=[];size=0;}if(extra>13500)throw new Error('Long reverse input requires sentence-preserving review: '+row.key);batch.push(row);size+=extra;}if(batch.length)result.push(batch);return result;}
async function main(){
  process.chdir(u.root);const args=process.argv.slice(2),languages=args.find(a=>a.startsWith('--languages='))?.slice(12).split(',')||u.languages;
  const scope=args.find(a=>a.startsWith('--scope='))?.slice(8)||'all';
  const coverage=u.read('tmp/i18n-coverage-report.json');const engine=worker();let requests=0;
  try{for(const language of languages){
    const reviewFile='tmp/free-native-review/'+language+'.json',review=u.read(reviewFile,{entries:{}});
    if(review.model!==model)continue;
    const keys=scope==='static'?new Set(coverage.pages.filter(p=>!p.cms&&p.path!=='/blogs').flatMap(p=>p.languages[language].missingKeys)):null;
    const statuses=args.includes('--refresh')?['requires-roundtrip','roundtrip-semantic-pass','requires-bilingual-review']:['requires-roundtrip'];
    let rows=Object.entries(review.entries).filter(([key,row])=>(!keys||keys.has(key))&&statuses.includes(row.status)).map(([key,row])=>{
      const target=plain(row.translation,row.kind),protectedText=protectIdentities(target);
      return {key,row,target,input:protectedText.input,restore:protectedText.restore,cacheKey:hash(row.english+'\0'+row.translation)};
    });
    const directory='tmp/free-native-back';fs.mkdirSync(directory,{recursive:true});const cacheFile=directory+'/'+language+'.json',cache=u.read(cacheFile,{provider:'google-consumer-reverse-v1',language,entries:{}});
    if(args.includes('--cache-only'))rows=rows.filter(item=>cache.entries[item.cacheKey]);
    const work=path.join(u.root,directory,'transport-'+language);fs.mkdirSync(work,{recursive:true});let completed=0;
    console.log(JSON.stringify({language,pending:rows.length,scope,cacheOnly:args.includes('--cache-only'),paidRequests:0}));
    for(const batch of groups(rows)){
      const pending=batch.filter(item=>!cache.entries[item.cacheKey]);
      if(pending.length){
        const input=pending.map((item,index)=>'\uE000'+String(index).padStart(4,'0')+'\uE001\n'+item.input).join('\n');
        const response=await curlTranslate(input,'en',work,language);requests++;
        const values=parseAlignedBatch(response,input,pending.length);
        pending.forEach((item,index)=>cache.entries[item.cacheKey]={targetSha256:hash(item.row.translation),english:item.row.english,backTranslation:item.restore(values[index])});
        fs.writeFileSync(cacheFile+'.writing',JSON.stringify(cache,null,2)+'\n');fs.renameSync(cacheFile+'.writing',cacheFile);
      }
      const back=batch.map(item=>normalizeNumbers(plain(item.row.english,item.row.kind),cache.entries[item.cacheKey].backTranslation,'en'));
      const scores=await engine.score(batch.map((item,index)=>[plain(item.row.english,item.row.kind),back[index]]));
      batch.forEach((item,index)=>{
        const source=plain(item.row.english,item.row.kind),threshold=source.length<50?.92:.90;
        const numeric=u.validate({english:source,kind:'text'},back[index],'en').filter(problem=>/numeric|placeholder|email|license|Unsafe|artifact/.test(problem));
        const denial=financialConsistency(source,back[index],'en').problems;
        const passed=scores[index]>=threshold&&!numeric.length&&!denial.length;
        item.row.backValidation={method:'reverse-NMT-plus-English-semantic-and-value-checks',sourceEnglishSha256:hash(item.row.english),sourceTargetSha256:hash(item.row.translation),backTranslation:back[index],similarity:scores[index],threshold,problems:[...numeric,...denial],passed,humanReviewed:false};
        item.row.status=passed?'roundtrip-semantic-pass':'requires-bilingual-review';
      });
      completed+=batch.length;review.checkedAt=new Date().toISOString();fs.writeFileSync(reviewFile+'.writing',JSON.stringify(review,null,2)+'\n');fs.renameSync(reviewFile+'.writing',reviewFile);
      console.log(`${language}: ${completed}/${rows.length} reverse checks; ${requests} free requests; paid 0`);
    }
  }}finally{await engine.close();}
}
module.exports={groups};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
