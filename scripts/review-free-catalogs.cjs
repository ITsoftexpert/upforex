// Per-message automatic evidence. It is explicitly not a human-review claim.
// This tool writes a review queue only; it never publishes a catalog.
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const u=require('./i18n-release-utils.cjs'),{normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {correctTerminology,financialConsistency}=require('./free-i18n-domain.cjs');
const {prepareHtml}=require('./free-i18n-html.cjs'),{protectIdentities}=require('./translate-free-catalogs.cjs');
const model='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42';
function worker(){
  const child=spawn(path.join(u.root,'tmp/offline-i18n/venv/Scripts/python.exe'),['scripts/semantic-i18n-worker.py'],{cwd:u.root,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const queue=[];let failed;
  const fail=error=>{failed=error;while(queue.length)queue.shift().reject(error);};
  child.on('error',fail);child.stderr.on('data',bytes=>process.stderr.write(bytes));
  child.on('exit',code=>{if(code||queue.length)fail(new Error('Semantic worker exited '+code));});
  createInterface({input:child.stdout}).on('line',line=>{const request=queue.shift();if(!request)return;try{const data=JSON.parse(line);if(data.error)request.reject(new Error(data.error));else request.resolve(data.scores);}catch(error){request.reject(error);}});
  return {score:pairs=>new Promise((resolve,reject)=>{if(failed)return reject(failed);queue.push({resolve,reject});child.stdin.write(JSON.stringify({pairs})+'\n');}),close:()=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.stdin.end();})};
}
const plain=(value,kind)=>u.normalizeContent(kind==='html'?u.text(u.parseFragment(value)):value);
const thresholdFor=(source,language)=>source.length<40?.84:({ja:.78,'zh-CN':.78,'zh-TW':.78,hi:.78,ar:.80,ru:.80})[language]||.84;
function restoredDraft(entry,row){
  const raw=row.rawTranslation||row.translation;
  // Old cached drafts translated typographic quotes around invisible slot
  // numbers. Recover only known slot attributes, then restore the exact source
  // tree. Changed nesting, links and active attributes still fail validation.
  if(entry.kind==='html'&&typeof raw==='string'){
    const fragment=u.parseFragment(raw),nodes=[];
    const visit=node=>{if(node.tagName)nodes.push(node);(node.childNodes||[]).forEach(visit);};visit(fragment);
    if(nodes.length&&nodes.every(node=>node.attrs.every(attr=>attr.name==='data-i18n-slot'&&/^["'“”‘’]*\d+["'“”‘’]*$/.test(attr.value)))){
      nodes.forEach(node=>node.attrs=[]);
      try{return prepareHtml(entry.english).restore(u.serialize(fragment));}catch{/* Keep malformed trees in the repair queue. */}
    }
  }
  if(entry.kind==='html'&&row.structuralProblems?.some(problem=>/visible HTML|Restored original slot/.test(problem))){
    try{const html=prepareHtml(entry.english);return html.restore(protectIdentities(html.input).restore(raw));}catch{return raw;}
  }
  return raw;
}
function identityProblems(source,target){
  const problems=[];
  for(const name of ['UPFOREX','UP Global Markets Ltd','UPFOREX Financial Consultation LLC','Pro-ECN','Elite-ECN','MetaTrader 5','MT5','MT4'])
    if(source.toLowerCase().includes(name.toLowerCase())&&!target.toLowerCase().includes(name.toLowerCase()))problems.push('Identity changed: '+name);
  return problems;
}
function needsRoundtrip(source){return /\b(?:no|not|never|without|guarantee\w*|licen[cs]\w*|regulat\w*|minimum|maximum|commission|stop[- ]?out|margin[- ]call)\b|rather than|\d\s*[:%]/i.test(source);}
async function main(){
  process.chdir(u.root);const args=process.argv.slice(2),languages=args.find(a=>a.startsWith('--languages='))?.slice(12).split(',')||u.languages;
  const scope=args.find(a=>a.startsWith('--scope='))?.slice(8)||'all';
  const coverage=u.read('tmp/i18n-coverage-report.json'),inventory=u.read('tmp/native-content-inventory.json'),reviewed=u.read('scripts/i18n-reviewed-translations.json');
  const engine=worker();const summary={createdAt:new Date().toISOString(),model,scope,paidRequests:0,humanReviewClaimed:false,languages:{}};
  try{for(const language of languages){
    const free=u.read('tmp/free-native-translations/'+language+'.json',{entries:{}}),offline=u.read('tmp/offline-native-translations/'+language+'.json',{entries:{}});
    const raw={entries:{}};
    for(const [key,row]of Object.entries(offline.entries||{}))raw.entries[key]={...row,draftProvider:offline.provider,sourceSha256:require('node:crypto').createHash('sha256').update(row.english).digest('hex')};
    for(const [key,row]of Object.entries(free.entries||{}))raw.entries[key]={...row,draftProvider:free.provider};
    const old=u.read('tmp/free-native-review/'+language+'.json',{entries:{}});
    // Keep valid cached Google copy where possible, but a broken free draft
    // must not conceal an intact local alternative for the same exact source.
    for(const entry of inventory.entries){
      const preferred=raw.entries[entry.key],alternative=offline.entries[entry.key];
      if(!preferred||preferred.draftProvider===offline.provider||alternative?.english!==entry.english)continue;
      const problems=row=>{
        const target=correctTerminology(plain(entry.english,entry.kind),normalizeNumbers(entry.english,restoredDraft(entry,row),language),language).translation;
        return [...u.validate(entry,target,language),...identityProblems(plain(entry.english,entry.kind),plain(target,entry.kind)),...financialConsistency(plain(entry.english,entry.kind),plain(target,entry.kind),language).problems];
      };
      if(problems(preferred).length&&!problems(alternative).length)raw.entries[entry.key]={...alternative,draftProvider:offline.provider,sourceSha256:require('node:crypto').createHash('sha256').update(entry.english).digest('hex')};
    }
    const keys=scope==='static'?new Set(coverage.pages.filter(p=>!p.cms&&p.path!=='/blogs').flatMap(p=>p.languages[language].missingKeys)):null;
    const candidates=inventory.entries.filter(entry=>(!keys||keys.has(entry.key))&&raw.entries[entry.key]?.english===entry.english&&u.needsContentTranslation(plain(entry.english,entry.kind)));
    const directory='tmp/free-native-review';fs.mkdirSync(directory,{recursive:true});
    const report={language,model,method:'automated-source-target-plus-roundtrip-queue',humanReviewed:false,entries:{...old.entries}};
    let done=0;
    for(let index=0;index<candidates.length;index+=80){
      const batch=candidates.slice(index,index+80),targets=batch.map(entry=>{
        const manual=reviewed[language]?.[entry.key];
        if(entry.kind==='text'&&u.preserveLatinPlaceLabel(entry.english,language))return entry.english;
        return manual?.reviewed===true&&manual.english===entry.english?manual.translation:correctTerminology(plain(entry.english,entry.kind),normalizeNumbers(entry.english,restoredDraft(entry,raw.entries[entry.key]),language),language).translation;
      });
      const scores=batch.map((entry,i)=>{const previous=old.entries[entry.key];return old.model===model&&previous?.english===entry.english&&previous.translation===targets[i]&&Number.isFinite(previous.similarity)?previous.similarity:undefined;});
      const pending=batch.map((entry,i)=>({entry,i})).filter(({i})=>scores[i]===undefined);
      if(pending.length){const fresh=await engine.score(pending.map(({entry,i})=>[plain(entry.english,entry.kind),plain(targets[i],entry.kind)]));pending.forEach(({i},index)=>scores[i]=fresh[index]);}
      batch.forEach((entry,i)=>{
        const translation=targets[i],source=plain(entry.english,entry.kind),target=plain(translation,entry.kind);
        const domain=financialConsistency(source,target,language);
        const problems=[...u.validate(entry,translation,language),...identityProblems(source,target),...domain.problems];
        const threshold=thresholdFor(source,language);
        const manual=reviewed[language]?.[entry.key];
        const isManual=manual?.reviewed===true&&manual.english===entry.english;
        const roundtripRequired=scores[i]<threshold;
        const prior=old.entries[entry.key],back=prior?.english===entry.english&&prior.translation===translation?prior.backValidation:undefined;
        const backPass=back?.passed===true&&back.similarity>=back.threshold;
        const status=isManual?'reviewed-local':problems.length?'requires-repair':roundtripRequired?(backPass?'roundtrip-semantic-pass':'requires-roundtrip'):'automatic-semantic-pass';
        report.entries[entry.key]={english:entry.english,translation:isManual?manual.translation:translation,kind:entry.kind,sourceSha256:raw.entries[entry.key].sourceSha256,
          structuralProblems:problems,similarity:scores[i],threshold,financialConsistency:domain,criticalFinancialContent:needsRoundtrip(source),roundtripRequired,status,humanReviewed:false,reviewedLocally:isManual,draftProvider:raw.entries[entry.key].draftProvider,
          reviewMethod:isManual?manual.reviewMethod||'existing-reviewed-local':'automated-cross-language-evidence'};
        if(back)report.entries[entry.key].backValidation=back;
      });
      done+=batch.length;report.checkedAt=new Date().toISOString();fs.writeFileSync(directory+'/'+language+'.json.writing',JSON.stringify(report,null,2)+'\n');fs.renameSync(directory+'/'+language+'.json.writing',directory+'/'+language+'.json');
    }
    const entries=candidates.map(entry=>report.entries[entry.key]);
    summary.languages[language]={checked:done,statuses:entries.reduce((counts,row)=>(counts[row.status]=(counts[row.status]||0)+1,counts),{})};
    console.log(JSON.stringify({language,...summary.languages[language]}));
  }}finally{await engine.close();}
  fs.writeFileSync('tmp/free-native-review/summary.json',JSON.stringify(summary,null,2)+'\n');
}
module.exports={worker,plain,identityProblems,needsRoundtrip,model,restoredDraft,thresholdFor};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
