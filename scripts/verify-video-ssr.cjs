// Focused release check for every public page using the shared video directive.
// Reuse the strict release body's translation and metadata validators.
const fs=require('node:fs'),assert=require('node:assert/strict');
const u=require('./i18n-release-utils.cjs');
const v=require('./verify-native-release.cjs');
const {effectivePageMetadata}=require('./page-metadata.cjs');
process.chdir(u.root);
async function main(){
 const base=new URL(process.argv.find(a=>a.startsWith('--base-url='))?.slice(11)||'http://localhost:4000');
 assert(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname),'Local preview only');
 const manifest=u.coverage(),sheet=u.read('scripts/data/seo-metadata.json'),records=[];
 const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(e=>[e.key,e]));
 const validate=v.catalogValidator(inventory);
 const pages=['/',...['abu-dhabi','cape-town','johannesburg','nairobi','south-africa','kuala-lumpur','manila','singapore'].map(city=>'/forex-trading-'+city)];
 const get=async route=>{const r=await fetch(new URL(route,base),{redirect:'manual',signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,route);return {doc:u.parse(await r.text()),headers:Object.fromEntries(r.headers)};};
 try{
  for(const page of pages){
   const completed=manifest.COMPLETED_NATIVE_PAGES[page];assert.deepEqual(completed,u.languages,'All current video-page languages must really be complete');
   const english=await get(page);v.verifyMetadata(english.doc,page,'en','en',completed,english.headers);
   v.verifySheetMetadata(english.doc,sheet.pages[page]?.en);
   const englishRoot=u.elements(english.doc,'app-root')[0];assert(englishRoot);
   const checkVideo=(doc,route)=>{
    const videos=u.elements(doc,'video');assert.equal(videos.length,1,route);
    const video=videos[0],style=u.attribute(video,'style')||'';
    assert.match(style,/height:\s*100%/,'Initial SSR fixes the video height');assert.match(style,/display:\s*block/);
    assert.equal(u.attribute(video,'preload'),'none');
    const source=u.elements(video,'source')[0];assert(source);
    assert.equal(u.attribute(source,'src'),undefined,'SSR must not start offscreen video downloads');
    assert.match(u.attribute(source,'data-src'),/\/assets\/videos\/smart_trading\.(mp4|webm)$/);
    assert.equal(u.attribute(u.elements(doc,'html')[0],'data-native-page-ready'),'true');
   };
   checkVideo(english.doc,page);
   records.push({route:page,language:'en',passed:true,metadataVerified:true,videoVerified:true});
   for(let i=0;i<u.languages.length;i+=4)await Promise.all(u.languages.slice(i,i+4).map(async language=>{
    const route='/'+u.prefixes[language]+(page==='/'?'':page),r=await get(route);
    v.verifyMetadata(r.doc,page,language,language,completed,r.headers);
    v.verifySheetMetadata(r.doc,sheet.pages[page]?.[language]);
    const catalog=u.read(`src/assets/i18n/native/${manifest.NATIVE_I18N_VERSION}/${language}/${u.contentKey(page)}.json`);assert(catalog);
    for(const key of catalog.__nativeSourceKeys)assert.deepEqual(validate(key,catalog.COPY[key],language),[],key);
    const dictionary=v.dictionaryFor(catalog,inventory);
    v.verifyBody(englishRoot,u.elements(r.doc,'app-root')[0],dictionary,{page,language,cmsSnapshot:[]});
    v.verifyHead(english.doc,r.doc,dictionary,effectivePageMetadata(page,language,sheet));
    checkVideo(r.doc,route);
    assert.equal(u.attribute(u.elements(r.doc,'html')[0],'data-native-i18n'),'complete');
    records.push({route,language,passed:true,metadataVerified:true,translatedInitialBodyVerified:true,videoVerified:true});
   }));
   console.log(JSON.stringify({page,verifiedLanguages:11}));
  }
  const home=(await get('/')).doc;
  const scripts=u.elements(home,'script').map(n=>u.attribute(n,'src')).filter(s=>s&&!s.startsWith('http'));
  assert(scripts.some(s=>/main\.[a-f0-9]+\.js/.test(s)));
  for(const src of scripts){const r=await fetch(new URL(src,base));assert.equal(r.status,200,'Current SSR script '+src);assert.match(r.headers.get('content-type'),/javascript/);await r.body.cancel();}
  fs.writeFileSync('tmp/video-fix/ssr.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:true,version:manifest.NATIVE_I18N_VERSION,pages:pages.length,checks:records.length,translatedBodies:records.filter(r=>r.translatedInitialBodyVerified).length,currentBrowserScripts:scripts,records},null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:records.length,report:'tmp/video-fix/ssr.json'}));
 }catch(error){fs.writeFileSync('tmp/video-fix/ssr.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:false,records,error:error.stack},null,2));throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
