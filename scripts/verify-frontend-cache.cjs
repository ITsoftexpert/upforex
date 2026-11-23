const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),zlib=require('node:zlib'),util=require('node:util');
process.chdir(path.resolve(__dirname,'..'));
async function main(){
 const log=fs.createWriteStream('tmp/frontend-only/cache-server.log'),original={log:console.log,warn:console.warn,error:console.error};for(const key in original)console[key]=(...args)=>log.write(util.format(...args)+'\n');
 const module=require(path.resolve('dist/upforex_Frontend/server/main.js')),server=module.app().listen(0,'127.0.0.1');const rows=[];let error;
 const request=(url,encoding='identity')=>new Promise((resolve,reject)=>{const start=performance.now();const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:url,headers:{host:'www.upforex.com','accept-encoding':encoding}},res=>{const chunks=[];const ttfbMs=performance.now()-start;res.on('data',b=>chunks.push(b));res.on('end',()=>{const bytes=Buffer.concat(chunks),type=res.headers['content-encoding'];const body=type==='br'?zlib.brotliDecompressSync(bytes):type==='gzip'?zlib.gunzipSync(bytes):bytes;resolve({url,status:res.statusCode,headers:res.headers,ttfbMs,elapsedMs:performance.now()-start,wireBytes:bytes.length,body:body.toString()});});});req.setTimeout(15000,()=>req.destroy(Error('Frontend request exceeded 15s')));req.on('error',reject);});
 try{
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const seed=JSON.parse(fs.readFileSync('server/data/public-blog-snapshot.json','utf8'));
  const oldBytes=Buffer.byteLength(JSON.stringify({status:true,data:seed.articles.slice(0,10),metaData:{totalPage:61,pageNum:1,pageLimit:10}}));
  const all=[];let first;
  for(let page=1;page<=7;page++){
   const r=await request('/api/public/blogs?pageNum='+page+'&pageLimit=10&search=');assert.equal(r.status,200);assert.match(r.headers['content-type'],/application\/json/);assert.equal(r.headers['cache-control'],'private, no-store');
   const x=JSON.parse(r.body);assert.equal(x.metaData.totalPage,7);all.push(...x.data.map(a=>a._id));if(page===1)first=r;
   assert(x.data.every(a=>!('content'in a)&&!('customScripts'in a)));rows.push({check:'Real frontend page '+page,status:r.status,ttfbMs:r.ttfbMs,elapsedMs:r.elapsedMs,bytes:r.wireBytes,cards:x.data.length});
  }
  assert.equal(new Set(all).size,61);assert.deepEqual(all,seed.articles.map(a=>a._id));
  for(const encoding of ['br','gzip']){const r=await request('/api/public/blogs?pageNum=1&pageLimit=10&search=',encoding);assert.equal(r.headers['content-encoding'],encoding);assert.deepEqual(JSON.parse(r.body),JSON.parse(first.body));rows.push({check:'Gateway compression '+encoding,status:r.status,bytes:r.wireBytes,elapsedMs:r.elapsedMs});}
  for(const [url,status]of [['/api/public/blogs?pageLimit=0',400],['/api/public/blogs/audit-missing-article',404],['/blogs/real-time-forex-trading-platform',404]]){const r=await request(url);assert.equal(r.status,status);rows.push({check:url,status:r.status,elapsedMs:r.elapsedMs});}
  const samples=[];
  for(const url of ['/blogs','/hi/blogs','/blogs/trump-tariff','/hi/blogs/trump-tariff','/ar/blogs/trump-tariff']){
   const r=await request(url,'br');assert.equal(r.status,200);assert(!/spinner-border/.test(r.body),'No CMS spinner in complete initial body');assert.match(r.body,/<link[^>]+rel="canonical"/);rows.push({check:'Cached initial HTML '+url,status:r.status,ttfbMs:r.ttfbMs,elapsedMs:r.elapsedMs,bytes:r.wireBytes});samples.push(r.elapsedMs);
  }
  const health=await request('/api/public-cms-status');assert.equal(health.status,200);const cache=JSON.parse(health.body);assert.equal(cache.articles,61);assert.equal(cache.usable,true);assert(cache.fetchedAt);rows.push({check:'Cache health exposes real provenance',status:health.status,cache});
  assert(first.wireBytes<oldBytes*.05,'Card projection must reduce payload by at least 95%');
  const browser='dist/upforex_Frontend/browser';const main=fs.readdirSync(browser).find(f=>/^main\..*\.js$/.test(f));const mainData=fs.readFileSync(path.join(browser,main),'utf8');assert(!mainData.includes(seed.articles[0].content),'Full article inventory must never be in main.js');
  fs.writeFileSync('tmp/frontend-only/cache-performance.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:true,scope:'Actual frontend production SSR and gateway against versioned public English snapshot; background fetch uses unchanged public production CMS. This is not a live PageSpeed score.',backendChanges:0,testBackendUsed:false,source:module.publicBlogStore().status(),oldContractListBytes:oldBytes,cachedCardListBytes:first.wireBytes,reductionPercent:(1-first.wireBytes/oldBytes)*100,browserMain:{file:main,bytes:Buffer.byteLength(mainData),gzipBytes:zlib.gzipSync(mainData).length},checks:rows},null,2)+'\n');
 }catch(e){error=e.stack;process.exitCode=1;fs.writeFileSync('tmp/frontend-only/cache-performance.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:false,checks:rows,error},null,2)+'\n');}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(console,original);await new Promise(resolve=>log.end(resolve));console.log(JSON.stringify({passed:!error,checks:rows.length,error,report:'tmp/frontend-only/cache-performance.json'}));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
