const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const u=require('./i18n-release-utils.cjs'),v=require('./verify-native-release.cjs'),{parseCsv,importMetadata}=require('./import-sheet-metadata.cjs');
process.chdir(u.root);
async function main(){
 const directory='tmp/sheet-fix-20261123';fs.mkdirSync(directory,{recursive:true});
 const rows=file=>{const data=parseCsv(fs.readFileSync(file,'utf8')),headers=data.shift();return data.map(row=>Object.fromEntries(headers.map((key,i)=>[key,row[i]])));};
 const manifest=u.coverage(),imported=importMetadata(fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8'),u.pageDefinitions(),manifest.COMPLETED_NATIVE_PAGES);
 const hreflang=rows('scripts/data/seo-hreflang-sheet.csv'),emails=rows('scripts/data/seo-broken-links-sheet.csv');
 const report={checkedAt:new Date().toISOString(),version:manifest.NATIVE_I18N_VERSION,passed:false,mode:'frontend-only-public-cache',cmsSnapshot:require('./public-cms-evidence.cjs').snapshotEvidence(),productionDeployed:false,liveCloudflareVerified:false,metadataRows:imported.report.totalRows,metadata:[],aliases:[],accountRedirects:[],excluded:[],hreflang:[],emailPages:[],failures:[]};
 const log=fs.createWriteStream(directory+'/sheet-verification-server.log');
 const server=fork(path.resolve('scripts/security-smoke-server.cjs'),[],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
 try{
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SSR startup timeout')),20000);server.once('message',m=>{clearTimeout(timer);resolve(m.port)});server.once('error',reject)});
  const base='http://127.0.0.1:'+port,cache=new Map();let responses=0;
  const get=route=>{if(!cache.has(route))cache.set(route,(async()=>{const r=await fetch(base+route,{redirect:'manual',signal:AbortSignal.timeout(45000)});const body=await r.text();responses++;if(responses%75===0)console.log('Sheet SSR responses: '+responses);return {status:r.status,location:r.headers.get('location'),headers:Object.fromEntries(r.headers),body,doc:u.parse(body)};})());return cache.get(route);};
  const tasks=[],routeFor=(page,language)=>language==='en'?page:'/'+u.prefixes[language]+(page==='/'?'':page);
  for(const entry of imported.report.entries)tasks.push(async()=>{
   const route=routeFor(entry.page,entry.language),r=await get(route);assert.equal(r.status,200);v.verifyMetadata(r.doc,entry.page,entry.language,entry.language,manifest.COMPLETED_NATIVE_PAGES[entry.page],r.headers);v.verifySheetMetadata(r.doc,imported.pages[entry.page][entry.language]);v.verifyEmailProtection(r.body,r.doc);
   report.metadata.push({row:entry.row,route,approvedInitialMetadataVerified:true});
  });
  for(const alias of imported.report.aliases)tasks.push(async()=>{
   const r=await get(new URL(alias.url).pathname);assert.equal(r.status,301);assert.equal(r.location,alias.targetPage);const target=await get(alias.targetPage);assert.equal(target.status,200);v.verifySheetMetadata(target.doc,imported.pages[alias.targetPage][alias.language]);
   report.aliases.push({...alias,redirectAndCanonicalMetadataVerified:true});
  });
  for(const entry of imported.report.accountRedirects)tasks.push(async()=>{
   const r=await get(new URL(entry.url).pathname);assert.equal(r.status,302);assert.equal(r.location,entry.target);report.accountRedirects.push({...entry,redirectVerified:true,localMetadataApplied:false});
  });
  for(const entry of imported.report.excluded)tasks.push(async()=>{
   const r=await get(new URL(entry.url).pathname);assert.equal(r.status,404);assert.equal(u.elements(r.doc,'link').filter(n=>u.attribute(n,'hreflang')).length,0);report.excluded.push({...entry,intentional404Verified:true,metadataApplied:false});
  });
  for(const entry of hreflang)tasks.push(async()=>{
   const route=new URL(entry['Page URL']).pathname,language=Object.entries(u.prefixes).find(([,prefix])=>route==='/'+prefix)?.[0];assert(language);const r=await get(route);assert.equal(r.status,200);v.verifyMetadata(r.doc,'/',language,language,manifest.COMPLETED_NATIVE_PAGES['/'],r.headers);report.hreflang.push({route,language,selfAndReciprocalVerified:true});
  });
  for(const entry of emails)tasks.push(async()=>{
   const route=new URL(entry['Page URL']).pathname,r=await get(route);assert.equal(r.status,200);v.verifyEmailProtection(r.body,r.doc);report.emailPages.push({route,originMailLinksClean:true,cloudflareExclusionMarkersVerified:true});
  });
  let next=0;const worker=async()=>{while(next<tasks.length){const index=next++;try{await tasks[index]();}catch(e){report.failures.push({task:index,error:e.message});console.log('FAILED: '+index+' '+e.message)}}};await Promise.all(Array.from({length:4},worker));
  assert(imported.report.allRowsAccountedFor);assert.equal(report.metadata.length,312);assert.equal(report.aliases.length,5);assert.equal(report.accountRedirects.length,2);assert.equal(report.excluded.length,1);assert.equal(report.hreflang.length,10);assert.equal(report.emailPages.length,111);assert.equal(report.failures.length,0);
  report.passed=true;report.status='ALL_LOCAL_SHEET_REQUIREMENTS_PASS';report.accountedMetadataRows=317;report.uniqueLocalResponses=responses;
 }catch(e){report.error=e.stack;throw e;}finally{
  server.kill();log.end();report.checkedAt=new Date().toISOString();fs.writeFileSync(directory+'/sheet-verification.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,metadata:report.metadata.length,aliases:report.aliases.length,accountRedirects:report.accountRedirects.length,userExcluded:report.excluded.length,hreflang:report.hreflang.length,emailPages:report.emailPages.length,failures:report.failures,report:directory+'/sheet-verification.json'}));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
