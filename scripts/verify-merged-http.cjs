// Read-only requests to this project's actual production SSR server.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
process.chdir(path.resolve(__dirname,'..'));
async function main(){
 const output='tmp/merge-evidence';fs.mkdirSync(output,{recursive:true});
 const original={log:console.log,warn:console.warn,error:console.error},log=fs.createWriteStream(output+'/http-server.log');
 for(const name of Object.keys(original))console[name]=(...args)=>log.write(require('util').format(...args)+'\n');
 require('./local-cms-transport.cjs').installLocalCmsTransport();
 const server=require(path.resolve('dist/upforex_Frontend/server/main.js')).app().listen(0,'127.0.0.1');
 const rows=[];let failure,cmsCache;
 try{
  if(!server.listening)await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const request=(url,headers={},method='GET')=>new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,headers:{host:'www.upforex.com','x-forwarded-proto':'https',...headers}},res=>{
    let body='';res.setEncoding('utf8');res.on('data',data=>body+=data);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
   });req.setTimeout(45000,()=>req.destroy(Error('HTTP verification timeout: '+url)));req.on('error',reject);req.end();
  });
  const check=async(name,url,{headers={},method='GET',status=200,cache='private, no-store',body}={})=>{
   const r=await request(url,headers,method);
   assert.equal(r.status,status,name);assert.equal(r.headers['cache-control'],cache,name);
   assert.equal(r.headers['x-powered-by'],undefined,name);
   assert.equal(r.headers['x-content-type-options'],'nosniff',name);
   assert.equal(r.headers['x-frame-options'],'SAMEORIGIN',name);
   assert.equal(r.headers['strict-transport-security'],'max-age=31536000',name);
   assert.match(r.headers['content-security-policy'],/frame-ancestors 'self'/,name);
   if(body)assert.match(r.body,body,name);
   rows.push({name,url,method,status:r.status,cache:r.headers['cache-control'],edgeCache:r.headers['cloudflare-cdn-cache-control']});
  };
  const health=await request('/api/public-cms-status');assert.equal(health.status,200);cmsCache=JSON.parse(health.body);assert.equal(cmsCache.mode,'frontend-public-cms-cache');assert.equal(cmsCache.usable,true);
  const publicCache='public, max-age=0, must-revalidate';
  await check('anonymous public HTML caches at edge','/',{cache:publicCache,body:/<app-home/});
  await check('translated public HTML caches at edge','/hi/about-us',{cache:publicCache,body:/<html[^>]*lang="hi"/});
  await check('corrected blog detail caches only with real body','/blogs/trump-tariff',{cache:publicCache,body:/class="blog-content"/});
  await check('HEAD retains public caching','/about-us',{cache:publicCache,method:'HEAD'});
  await check('authorization bypasses cache','/about-us',{headers:{authorization:'Bearer local-cache-audit'}});
  await check('cookies bypass cache','/about-us',{headers:{cookie:'local_cache_audit=1'}});
  await check('query parameters bypass cache','/about-us?cache_audit=1');
  await check('other hostname bypasses cache','/about-us',{headers:{host:'portal.example.invalid'}});
  await check('admin remains private','/admin/login');
  await check('missing route remains private','/does-not-exist',{status:404});
  await check('missing blog remains private','/blogs/audit-missing-article',{status:404});
  await check('raw index HTML remains private','/index.html');
  const bundle=fs.readdirSync('dist/upforex_Frontend/browser').find(name=>/^main\.[a-f0-9]{16,}\.js$/.test(name));
  assert(bundle,'Versioned main browser bundle');
  await check('hashed bundles retain immutable caching','/'+bundle,{cache:'public, max-age=31536000, immutable',method:'HEAD'});
  for(const row of rows)assert.equal(row.edgeCache,row.cache===publicCache?'public, max-age=300':row.cache.startsWith('private')?'no-store':row.cache,row.name);
 }catch(error){failure=error.stack;process.exitCode=1;}
 finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(console,original);await new Promise(resolve=>log.end(resolve));
  fs.writeFileSync(output+'/http-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'frontend-only-public-cache',cmsOrigin:'frontend gateway; upstream https://api.upforex.com',cmsCache,passed:!failure,checks:rows,error:failure},null,2)+'\n');
  console.log(JSON.stringify({passed:!failure,checks:rows.length,error:failure,report:output+'/http-verification.json'}));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
