// Free local draft generation. Nothing from this tool is imported by Angular.
// Drafts never become completed coverage automatically; review exact-source
// translations in scripts/i18n-reviewed-translations.json before publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const u=require('./i18n-release-utils.cjs');
const {assessDraft}=require('./offline-i18n-quality.cjs');
const {normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {correctTerminology}=require('./free-i18n-domain.cjs');
const provider='argos-ctranslate2-local-v2';
function hasRecordedDraft(entry,cache,repairRequested=false){
  // Explicit repairs must not be skipped just because the rejected local
  // draft was already saved. Normal runs retain that record for review.
  return !repairRequested&&cache.provider===provider&&cache.entries?.[entry.key]?.english===entry.english;
}
function requiresDraftRepair(entry,language,cache,review={}){
  const reviewed=review.entries?.[entry.key];
  if(reviewed?.english===entry.english&&reviewed.status==='requires-repair')return true;
  const draft=cache.provider===provider?cache.entries?.[entry.key]:undefined;
  if(draft?.english!==entry.english)return false;
  // Purely offline use must work without a former cloud/consumer review file.
  // Re-evaluate saved text so old warning fields cannot conceal a bad draft.
  const assessment=assessDraft(entry,draft.translation,language);
  return !!(assessment.structuralProblems.length||assessment.qualityFlags.length||assessment.financialProblems.length);
}
function checkedTranslations(response,expected){
  if(!Array.isArray(response?.translations)||response.translations.length!==expected||
    response.translations.some(value=>value!==null&&(typeof value!=='string'||!value.trim())))
    throw new Error('Local model response mismatch; this batch was not saved');
  return response.translations;
}
function fragments(entry){
  if(entry.kind!=='html')return {texts:[entry.english],assemble:values=>values[0]};
  const fragment=u.parseFragment(entry.english),nodes=[];
  function visit(node){if(node.nodeName==='#text'&&u.normalizeContent(node.value))nodes.push(node);for(const child of node.childNodes||[])visit(child);}
  visit(fragment);
  return {texts:nodes.map(node=>u.normalizeContent(node.value)),assemble:values=>{
    nodes.forEach((node,index)=>{node.value=(/^\s/.test(node.value)?' ':'')+values[index]+(/\s$/.test(node.value)?' ':'');});
    return u.serialize(fragment);
  }};
}
function plan(selected,limit,page,missingFree=false,repairDrafts=false){
  const inventory=u.read('tmp/native-content-inventory.json'),coverage=u.read('tmp/i18n-coverage-report.json');
  if(!inventory?.entries?.length||inventory.problems?.length)throw new Error('Clean English inventory required');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(inventory.entries.map(({key,english,kind})=>({key,english,kind})))).digest('hex');
  const pageKeys=page?new Set(coverage.pages.find(item=>item.path===page)?.requiredKeys||[]):null;
  if(page&&(!pageKeys||!pageKeys.size))throw new Error('Unknown public page');
  return selected.map(language=>{
    const memory=u.read(`tmp/validated-native-translations/${language}.json`,{}),cache=u.read(`tmp/offline-native-translations/${language}.json`,{});
    const free=missingFree?u.read(`tmp/free-native-translations/${language}.json`,{entries:{}}):{entries:{}};
    const repair=repairDrafts?u.read(`tmp/free-native-review/${language}.json`,{entries:{}}):undefined;
    const required=repairDrafts?new Set(coverage.pages.flatMap(page=>page.requiredKeys)):undefined;
    const pending=inventory.entries.filter(entry=>u.needsContentTranslation(entry.kind==='html'?u.text(u.parseFragment(entry.english)):entry.english)&&(!pageKeys||pageKeys.has(entry.key))&&
      (!repairDrafts||required.has(entry.key)&&requiresDraftRepair(entry,language,cache,repair))&&
      free.entries?.[entry.key]?.english!==entry.english&&
      !(memory.sourceFingerprint===fingerprint&&typeof memory.COPY?.[entry.key]==='string'&&!u.validate(entry,memory.COPY[entry.key],language).length)&&
      !hasRecordedDraft(entry,cache,repairDrafts));
    return {language,sourceFingerprint:fingerprint,cache:cache.provider===provider?cache:{provider,language,entries:{}},totalMissing:pending.length,entries:pending.slice(0,limit),
      missingValidatedMessages:new Set(coverage.pages.flatMap(page=>page.languages[language].missingKeys)).size,
      incompletePages:coverage.pages.filter(page=>!page.languages[language].complete).length};
  });
}
function planSummary(jobs,generate){
  return {provider,paidRequests:0,visitorTimeInference:false,publicationAutomatic:false,deploymentReady:false,
    mode:generate?'local-drafts':'offline-plan',
    note:'Draft counts are not validated translation coverage or initial-HTML release verification.',
    languages:jobs.map(job=>({language:job.language,missingUnrecordedDrafts:job.totalMissing,selectedForDrafts:job.entries.length,
      missingValidatedMessages:job.missingValidatedMessages,incompletePages:job.incompletePages}))};
}
function startWorker(language,reverse=false){
  const python=path.join(u.root,'tmp/offline-i18n/venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  if(!fs.existsSync(python))throw new Error('Offline runtime not installed; see tmp/offline-i18n/setup.txt');
  const child=spawn(python,[path.join(u.root,'scripts/offline-i18n-worker.py'),language,...(reverse?['--reverse']:[])],{cwd:u.root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const lines=createInterface({input:child.stdout}),pending=[];let failure;
  child.stderr.on('data',bytes=>process.stderr.write(bytes));
  const fail=error=>{failure=error;while(pending.length)pending.shift().reject(error);};
  child.on('error',fail);child.on('exit',code=>{if(code||pending.length)fail(new Error(`Local worker exited ${code}`));});
  lines.on('line',line=>{const current=pending.shift();if(!current)return;try{current.resolve(JSON.parse(line));}catch(error){current.reject(error);}});
  child.stdin.on('error',fail);
  return {request:texts=>new Promise((resolve,reject)=>{if(failure)return reject(failure);
    const timer=setTimeout(()=>{fail(new Error('Local model batch timed out; saved drafts retained'));child.kill();},120000);
    pending.push({resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    child.stdin.write(JSON.stringify({texts})+'\n');}),close:()=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.stdin.end();})};
}
async function generate(job){
  const models=u.read('tmp/offline-i18n/models.json',{});if(!models[job.language])throw new Error('Offline model not installed: '+job.language);
  const worker=startWorker(job.language),directory=path.join(u.root,'tmp/offline-native-translations');fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,job.language+'.json');
  job.cache.sourceFingerprint=job.sourceFingerprint;job.cache.model=models[job.language];job.cache.complete=false;
  try{
    for(let index=0;index<job.entries.length;index+=16){
      const batch=job.entries.slice(index,index+16),parts=batch.map(fragments);
      const texts=parts.flatMap(part=>part.texts),translated=[];
      for(let start=0;start<texts.length;start+=128){const request=texts.slice(start,start+128),response=await worker.request(request);translated.push(...checkedTranslations(response,request.length));}
      let offset=0;
      batch.forEach((entry,index)=>{
        const values=translated.slice(offset,offset+parts[index].texts.length);offset+=values.length;
        const rawTranslation=values.length&&values.every(value=>typeof value==='string')?parts[index].assemble(values):'';
        const corrections=rawTranslation?correctTerminology(entry.english,normalizeNumbers(entry.english,rawTranslation,job.language),job.language):{translation:'',corrections:[]};
        const translation=corrections.translation;
        const assessment=assessDraft(entry,translation,job.language);
        const problems=assessment.structuralProblems;
        if(values.some(value=>value===null))problems.push('Source could not be segmented or decoded safely; review without truncation');
        job.cache.entries[entry.key]={english:entry.english,translation,rawTranslation,kind:entry.kind,reviewed:false,structuralChecksPassed:!problems.length,problems,
          segmentationVersion:2,postprocessingVersion:1,terminologyCorrections:corrections.corrections,
          qualityFlags:assessment.qualityFlags,financialProblems:assessment.financialProblems,semanticReviewComplete:false,
          reviewRequired:entry.kind==='html'?'Review sentence meaning across inline HTML slots':'Review meaning, terminology and financial conditions'};
      });
      job.cache.updatedAt=new Date().toISOString();
      fs.writeFileSync(file+'.writing',JSON.stringify(job.cache,null,2)+'\n');fs.renameSync(file+'.writing',file);
      console.log(`${job.language}: ${Math.min(index+16,job.entries.length)}/${job.entries.length} drafts saved; none published`);
    }
  }finally{await worker.close();}
}
async function main(){
  process.chdir(u.root);const args=process.argv.slice(2);
  if(args.some(arg=>!['--generate','--all-missing','--missing-free','--repair-drafts'].includes(arg)&&!/^--(?:languages|limit|page)=/.test(arg)))throw new Error('Use --generate, --languages=hi,fr, --limit=100, --all-missing, --missing-free, --repair-drafts or --page=/about-us');
  if(args.includes('--repair-drafts')&&args.includes('--missing-free'))throw new Error('Choose repairs or absent free drafts separately');
  const selected=args.find(arg=>arg.startsWith('--languages='))?.slice(12).split(',')||u.languages;
  if(!selected.length||new Set(selected).size!==selected.length||selected.some(language=>!u.languages.includes(language)))throw new Error('Unsupported or duplicate languages');
  const limit=args.includes('--all-missing')?Number.MAX_SAFE_INTEGER:Number(args.find(arg=>arg.startsWith('--limit='))?.slice(8)||100);
  if(!Number.isSafeInteger(limit)||limit<=0)throw new Error('Positive entry limit required');
  const jobs=plan(selected,limit,args.find(arg=>arg.startsWith('--page='))?.slice(7),args.includes('--missing-free'),args.includes('--repair-drafts'));
  const summary=planSummary(jobs,args.includes('--generate'));
  fs.mkdirSync('tmp/offline-i18n',{recursive:true});fs.writeFileSync('tmp/offline-i18n/plan.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
  if(args.includes('--generate'))for(const job of jobs)if(job.entries.length)await generate(job);
}
module.exports={fragments,plan,planSummary,provider,startWorker,hasRecordedDraft,requiresDraftRepair,checkedTranslations};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
