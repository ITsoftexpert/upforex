// Build-time only, unauthenticated consumer translation. No key or billing account.
// Cache drafts locally. Never publish them or change completed-page coverage here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const u=require('./i18n-release-utils.cjs');
const provider='google-consumer-local-drafts-v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function withTransportLock(action){
  const directory=path.join(u.root,'tmp/free-native-translations'),lock=path.join(directory,'transport.lock');
  fs.mkdirSync(directory,{recursive:true});
  const hold=path.join(directory,'service-hold.json');if(fs.existsSync(hold))throw new Error('Provider rate-limit hold is active. Do not bypass it.');
  for(;;){
    try{fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,at:Date.now()}));break;}
    catch(error){if(error.code!=='EEXIST')throw error;const owner=u.read(path.join(lock,'owner.json'),{});let alive=true;try{if(owner.pid)process.kill(owner.pid,0);}catch(check){if(check.code==='ESRCH')alive=false;}
      if(!alive&&Date.now()-(owner.at||0)>120000){try{fs.unlinkSync(path.join(lock,'owner.json'));fs.rmdirSync(lock);}catch{}}
      await sleep(200);
    }
  }
  try{
    if(fs.existsSync(hold))throw new Error('Provider rate-limit hold is active.');
    const last=u.read(path.join(directory,'last-request.json'),{}).completedAt||0;
    await sleep(Math.max(0,last+1000-Date.now()));
    return await action();
  }finally{fs.writeFileSync(path.join(directory,'last-request.json'),JSON.stringify({completedAt:Date.now()}));fs.unlinkSync(path.join(lock,'owner.json'));fs.rmdirSync(lock);}
}
const {normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {prepareHtml}=require('./free-i18n-html.cjs');
const identity=/UPFOREX Financial Consultation LLC|UP Global Markets Ltd|UPFOREX Financial Services LLC|MetaQuotes Software|MetaTrader [45]|Meta Trader [45]|Pro-ECN|Elite-ECN|UPFOREX|MT[45]/gi;
function protectIdentities(text){
  const names=[];
  const input=text.replace(identity,name=>{const token='https://upx-entity-'+String.fromCharCode(97+Math.floor(names.length/26))+String.fromCharCode(97+names.length%26)+'.invalid';names.push({token,name});return token;});
  return {input,restore:translated=>{
    let result=translated;
    for(const {token,name}of names)result=result.split(token).join(name);
    if(/https?:\/\/upx-entity-/i.test(result))throw new Error('Identity placeholder changed; review required');
    return result;
  }};
}
function parseBatch(text,count){
  const pattern=/\uE000\s*(\d{4})\s*[\uE000\uE001]/g,matches=[...text.matchAll(pattern)];
  if(matches.length!==count||matches.some((match,index)=>Number(match[1])!==index))throw new Error('Batch markers changed; nothing from this response is accepted');
  return matches.map((match,index)=>text.slice(match.index+match[0].length,matches[index+1]?.index??text.length).trim());
}
function parseAlignedBatch(response,input,count){
  const clean=value=>u.normalizeContent(u.serialize(u.parseFragment(value.replace(/[\u200b\ufeff]/g,''))));
  const originals=response.rows.map(row=>row[1]||'').join('');
  if(clean(originals)!==clean(input))throw new Error('Provider source reconstruction mismatch; no omissions are accepted');
  const values=Array.from({length:count},()=>''),seen=[];let current=-1;
  for(const row of response.rows){
    const original=row[1]||'',marker=/^\s*\uE000(\d{4})\uE001\s*$/.exec(original);
    if(marker){current=Number(marker[1]);seen.push(current);continue;}
    if(/[\uE000\uE001]/.test(original))return parseBatch(response.text,count);
    if(current<0||current>=count)throw new Error('Unexpected unframed provider segment');
    values[current]+=row[0]||'';
  }
  if(seen.length!==count||seen.some((value,index)=>value!==index)||values.some(value=>!value.trim()))throw new Error('Provider alignment changed');
  return values.map(value=>value.trim());
}
async function curlTranslate(text,language,work,sourceLanguage='en'){
  return withTransportLock(async()=>{
  const input=path.join(work,'request.txt'),output=path.join(work,'response.json');fs.writeFileSync(input,text);
  const args=['--silent','--show-error','--max-time','40','--get','https://translate.googleapis.com/translate_a/single',
    '--data-urlencode','client=gtx','--data-urlencode','sl='+sourceLanguage,'--data-urlencode','tl='+language,'--data-urlencode','dt=t',
    '--data-urlencode','q@'+input,'--output',output,'--write-out','%{http_code}'];
  const result=await new Promise((resolve,reject)=>{const child=spawn('curl.exe',args,{cwd:u.root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>resolve({code,status:Number(stdout.trim()),stderr}));});
  if(result.status===429){fs.writeFileSync(path.join(u.root,'tmp/free-native-translations/service-hold.json'),JSON.stringify({at:new Date().toISOString(),status:429}));throw new Error('HTTP 429: stop; do not change endpoint, proxy, credentials or identity to bypass a limit');}
  if(result.code||result.status!==200)throw new Error('Free translation request failed: '+JSON.stringify(result));
  const data=JSON.parse(fs.readFileSync(output,'utf8'));
  if(!Array.isArray(data[0]))throw new Error('Unexpected translation response');
  return {rows:data[0],text:data[0].map(row=>row[0]||'').join('')};
  });
}
function batches(entries,max=4500){
  const groups=[];let group=[],size=0;
  for(const entry of entries){const extra=entry.english.length+10;if(group.length&&(size+extra>max||group.length>=60)){groups.push(group);group=[];size=0;}group.push(entry);size+=extra;}
  if(group.length)groups.push(group);return groups;
}
async function main(){
  process.chdir(u.root);const args=process.argv.slice(2),languageArg=args.find(a=>a.startsWith('--languages='));
  const languages=languageArg?languageArg.slice(12).split(','):u.languages;
  if(languages.some(l=>!u.languages.includes(l))||new Set(languages).size!==languages.length)throw new Error('Unsupported languages');
  const scope=args.find(a=>a.startsWith('--scope='))?.slice(8)||'all';
  const limit=Number(args.find(a=>a.startsWith('--limit='))?.slice(8)||Number.MAX_SAFE_INTEGER);
  const maxRequests=Number(args.find(a=>a.startsWith('--max-requests='))?.slice(15)||Number.MAX_SAFE_INTEGER);
  if(!['all','static'].includes(scope)||!Number.isSafeInteger(limit)||limit<=0||!Number.isSafeInteger(maxRequests)||maxRequests<=0)throw new Error('Invalid scope/limit');
  const coverage=u.read('tmp/i18n-coverage-report.json'),missing=u.read('tmp/missing-translations.json');
  const directory=path.join(u.root,'tmp/free-native-translations');fs.mkdirSync(directory,{recursive:true});let requests=0;
  for(const language of languages){
    const file=path.join(directory,language+'.json'),old=u.read(file,{});
    const cache=old.provider===provider?old:{provider,language,reviewed:false,published:false,entries:{}};
    const keys=scope==='static'?new Set(coverage.pages.filter(p=>!p.cms&&p.path!=='/blogs').flatMap(p=>p.languages[language].missingKeys)):null;
    const entries=missing.languages[language].missing.filter(entry=>(!keys||keys.has(entry.key))&&cache.entries[entry.key]?.english!==entry.english).slice(0,limit);
    const plan={language,scope,pending:entries.length,characters:entries.reduce((sum,e)=>sum+e.english.length,0),paidRequests:0};console.log(JSON.stringify(plan));
    if(!args.includes('--generate'))continue;
    const work=path.join(directory,'transport-'+language);fs.mkdirSync(work,{recursive:true});
    for(const batch of batches(entries)){
      if(requests>=maxRequests)return;
      if(batch.some(e=>e.english.length>4900))throw new Error('Long entry requires sentence-preserving segmentation; no truncation: '+batch.find(e=>e.english.length>4900).key);
      const adapters=batch.map(entry=>entry.kind==='html'?prepareHtml(entry.english):{input:entry.english,restore:value=>value});
      const protectedEntries=batch.map((entry,index)=>protectIdentities(adapters[index].input));
      const text=batch.map((_entry,index)=>'\uE000'+String(index).padStart(4,'0')+'\uE001\n'+protectedEntries[index].input).join('\n');
      let response;
      // Reuse an already successful response if only framing validation was
      // corrected. Its exact request must match; no extra provider request.
      if(fs.existsSync(path.join(work,'request.txt'))&&fs.readFileSync(path.join(work,'request.txt'),'utf8')===text){
        try{const cached=JSON.parse(fs.readFileSync(path.join(work,'response.json'),'utf8'));if(Array.isArray(cached[0])){
          const candidate={rows:cached[0],text:cached[0].map(row=>row[0]||'').join('')};
          // An interrupted curl can leave a new request beside an older
          // response. Verify the response's source before reusing its bytes.
          parseAlignedBatch(candidate,text,batch.length);response=candidate;
        }}catch{}
      }
      if(response===undefined){response=await curlTranslate(text,language,work);requests++;}
      const values=parseAlignedBatch(response,text,batch.length);
      batch.forEach((entry,index)=>{
        let raw,adapterError;
        try{raw=adapters[index].restore(protectedEntries[index].restore(values[index]));}catch(error){raw=values[index];adapterError=error.message;}
        const translation=normalizeNumbers(entry.english,raw,language),problems=u.validate(entry,translation,language);
        if(adapterError)problems.push(adapterError);
        cache.entries[entry.key]={english:entry.english,translation,rawTranslation:raw,kind:entry.kind,reviewed:false,semanticReviewComplete:false,structuralProblems:problems,structuralChecksPassed:!problems.length,sourceSha256:crypto.createHash('sha256').update(entry.english).digest('hex')};});
      cache.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.writing',JSON.stringify(cache,null,2)+'\n');fs.renameSync(file+'.writing',file);
      console.log(`${language}: ${Object.keys(cache.entries).length} cached drafts; ${requests} requests; paid 0`);
      await sleep(1000);
    }
  }
}
module.exports={provider,normalizeNumbers,parseBatch,parseAlignedBatch,batches,protectIdentities,curlTranslate};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
