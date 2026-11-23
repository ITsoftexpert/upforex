const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PublicBlogStore,PublicCmsError,STALE_REVIEW_AFTER_MS,snapshotHash,validateSnapshot,CMS_ORIGIN}=require('../tmp/public-cms-tests/public-blog-store.js');
const original=JSON.parse(fs.readFileSync('server/data/public-blog-snapshot.json','utf8'));
const now=Date.parse(original.fetchedAt)+1000;
function setup(t,{articles=structuredClone(original.articles),at=now-1000,...options}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upforex-public-cms-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const seed=path.join(dir,'seed.json'),cacheFile=path.join(dir,'cache','snapshot.json');
 const snapshot={schema:1,source:CMS_ORIGIN+'/api/v1/blogs/web',fetchedAt:new Date(at).toISOString(),articles,sha256:snapshotHash(articles)};
 fs.writeFileSync(seed,JSON.stringify(snapshot));return {store:new PublicBlogStore({seed,cacheFile,now:()=>now,...options}),seed,cacheFile,articles};
}
test('listing retains exact English cards and real 7-page pagination; omits article bodies/scripts',t=>{
 const {store,articles}=setup(t);const first=store.read('',new URLSearchParams('pageNum=1&pageLimit=10&search='));
 assert.equal(first.data.length,10);assert.equal(first.metaData.totalDocs,61);assert.equal(first.metaData.totalPage,7);
 for(let i=0;i<10;i++){for(const key of Object.keys(first.data[i]))assert.deepEqual(first.data[i][key],articles[i][key]);assert(!('content'in first.data[i]));assert(!('customScripts'in first.data[i]));}
 const seen=[];for(let page=1;page<=7;page++)seen.push(...store.read('',new URLSearchParams('pageNum='+page)).data.map(a=>a._id));
 assert.equal(new Set(seen).size,61);assert.deepEqual(seen,articles.map(a=>a._id));assert.equal(store.read('',new URLSearchParams('pageNum=8')).data.length,0);
 assert(Buffer.byteLength(JSON.stringify(first))<12000);
});
test('all 61 full detail bodies, CTA links, tags and stored IDs are unmodified',t=>{
 const {store,articles}=setup(t);for(const a of articles){const result=store.read('/'+encodeURIComponent(a.permaLink)).data;
 for(const field of Object.keys(result))assert.deepEqual(result[field],a[field]);assert.equal(result.content,a.content);assert.equal(result.permaLink,a.permaLink);}
});
test('recommended articles use the existing category-or-tag relationship, exclude self and limit six',t=>{
 const {store,articles}=setup(t);for(const a of articles){const related=store.read('/'+encodeURIComponent(a.permaLink)+'/recommended').data;
 assert(related.length<=6);for(const card of related){const source=articles.find(row=>row._id===card._id);assert.notEqual(card._id,a._id);assert(source.categories.some(c=>a.categories.some(x=>x._id===c._id))||source.tags.some(tag=>a.tags.includes(tag)));assert.deepEqual(Object.keys(card).sort(),['_id','description','permaLink','title']);}}
});
test('search is literal, case-insensitive title/textField search; malformed pagination returns 400',t=>{
 const {store,articles}=setup(t);const results=store.read('',new URLSearchParams('search=GOLD&pageLimit=100'));
 assert.deepEqual(results.data.map(a=>a._id),articles.filter(a=>[a.title,a.textField].some(v=>typeof v==='string'&&v.toLowerCase().includes('gold'))).map(a=>a._id));
 assert.equal(store.read('',new URLSearchParams('search=%28%3F%3D.*%29')).data.length,0);
 for(const q of ['pageNum=0','pageNum=-1','pageNum=NaN','pageNum=1.2','pageLimit=101','pageLimit=0','search='+('a'.repeat(201))])assert.throws(()=>store.read('',new URLSearchParams(q)),e=>e.status===400);
 assert.throws(()=>store.read('/%zz'),e=>e.status===400);
});
test('known obsolete and unknown slugs retain 404, never manufacture articles',t=>{
 const {store}=setup(t);for(const slug of ['real-time-forex-trading-platform','audit-missing-article','__proto__'])assert.throws(()=>store.read('/'+slug),e=>e.status===404);
});
test('snapshot provenance, duplicate IDs, incomplete body and tampering are rejected',t=>{
 for(const mutate of [x=>x.articles[0].content='',x=>x.articles[1]._id=x.articles[0]._id,x=>x.articles[0].title='altered',x=>x.source='https://evil.invalid',x=>x.fetchedAt='2099-01-01']){
 const value=structuredClone(original);mutate(value);assert.throws(()=>validateSnapshot(value,now));}
 const {seed}=setup(t);fs.writeFileSync(seed,'not JSON');const store=new PublicBlogStore({seed,now:()=>now});assert.equal(store.status().usable,false);assert.throws(()=>store.read(''),e=>e.status===503);
});
test('old valid content stays readable during an outage, with explicit freshness attention status',t=>{
 const {store}=setup(t,{at:now-STALE_REVIEW_AFTER_MS-1});assert.equal(store.status().usable,true);assert.equal(store.status().stale,true);assert.equal(store.status().needsCmsAttention,true);assert.equal(store.read('').data.length,10);assert.equal(STALE_REVIEW_AFTER_MS,7*86400000);
});
test('background refresh coalesces callers, returns cached body immediately and atomically persists real old-contract data',async t=>{
 let calls=0,unblock;const deferred=new Promise(resolve=>unblock=resolve);const articles=structuredClone(original.articles);articles[0].title='Existing CMS title updated by its owner';
 const {store,cacheFile}=setup(t,{at:now-600001,fetcher:async(url,options)=>{calls++;assert.equal(url,CMS_ORIGIN+'/api/v1/blogs/web?pageNum=1&pageLimit=100&search=');assert(!options.headers.authorization);await deferred;return Response.json({status:true,data:articles,metaData:{totalPage:61}});}});
 for(let i=0;i<100;i++)store.refreshInBackground();assert.equal(calls,1);assert.equal(store.read('').data[0].title,original.articles[0].title);
 unblock();await store.waitForRefresh();assert.equal(store.read('').data[0].title,articles[0].title);assert.equal(store.status().stale,false);assert.equal(store.status().persisted,true);
 assert.equal(JSON.parse(fs.readFileSync(cacheFile)).articles[0].title,articles[0].title);assert.equal(store.status().lastError,undefined);
 store.refreshInBackground();assert.equal(calls,1);
});
test('522, failed status, invalid JSON and incomplete content never replace the last valid cache',async t=>{
 for(const response of [()=>new Response('',{status:522}),()=>Response.json({status:false,data:[]}),()=>new Response('{'),()=>Response.json({status:true,data:[{title:'partial'}]})]){
 let calls=0;const {store}=setup(t,{at:now-600001,fetcher:async()=>{calls++;return response();}});const hash=store.status().sourceSha256;
 store.refreshInBackground();await store.waitForRefresh();assert.equal(store.status().sourceSha256,hash);assert.equal(store.status().usable,true);assert(store.status().lastError);store.refreshInBackground();assert.equal(calls,1);
 }
});
test('real refresh success replaces removed articles, preserves no stale deletion after successful inventory',async t=>{
 const remaining=original.articles.slice(1);const {store}=setup(t,{at:now-600001,fetcher:async()=>Response.json({status:true,data:remaining,metaData:{totalPage:60}})});
 store.refreshInBackground();await store.waitForRefresh();assert.equal(store.read('').metaData.totalDocs,60);assert.throws(()=>store.read('/'+encodeURIComponent(original.articles[0].permaLink)),e=>e.status===404);
});
test('multiple old-contract pages stop on short batch rather than incorrect totalPage document count',async t=>{
 const articles=Array.from({length:105},(_,i)=>({...structuredClone(original.articles[0]),_id:(i+1).toString(16).padStart(24,'0'),permaLink:'article-'+i}));let calls=0;
 const {store}=setup(t,{at:now-600001,fetcher:async url=>{const page=Number(new URL(url).searchParams.get('pageNum'));calls++;return Response.json({status:true,data:articles.slice((page-1)*100,page*100),metaData:{totalPage:105}});}});
 store.refreshInBackground();await store.waitForRefresh();assert.equal(calls,2);assert.equal(store.read('').metaData.totalDocs,105);assert.equal(store.read('').metaData.totalPage,11);
});
test('compiled CMS store is server-only, never imported into public browser AppModule',()=>{
 const app=fs.readFileSync('src/app/app.module.ts','utf8');assert(!app.includes('public-blog-store'));assert(!app.includes('ServerPublicBlogInterceptor'));assert(!fs.existsSync('src/assets/public-blog-snapshot.json'));
});
