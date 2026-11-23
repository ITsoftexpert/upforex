const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {localCmsOrigin,installLocalCmsTransport}=require('./local-cms-transport.cjs');
test('integration target accepts only an explicit loopback HTTP origin',()=>{
 assert.equal(localCmsOrigin('http://127.0.0.1:43210'),'http://127.0.0.1:43210');
 for(const value of ['https://api.upforex.com','http://example.com:1234','http://user:secret@127.0.0.1:43210','http://127.0.0.1:43210/path','http://127.0.0.1:43210?query=true'])assert.throws(()=>localCmsOrigin(value));
});
test('test transport sends real public GETs to the local backend without changing response data',async()=>{
 const requests=[],server=http.createServer((req,res)=>{requests.push(req.url);res.setHeader('content-type','application/json');res.end(JSON.stringify({status:true,data:[{title:'Existing CMS title'}]}))}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));const restore=installLocalCmsTransport('http://127.0.0.1:'+server.address().port);
 try{const r=await fetch('https://api.upforex.com/api/v1/blogs/web?pageNum=2&view=cards');assert.deepEqual(await r.json(),{status:true,data:[{title:'Existing CMS title'}]});assert.deepEqual(requests,['/api/v1/blogs/web?pageNum=2&view=cards']);await assert.rejects(async()=>fetch('https://api.upforex.com/api/v1/blogs/web',{method:'POST'}),/public reads/);}
 finally{restore();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('production/default mode leaves fetch and the production API origin unchanged',()=>{
 const original=globalThis.fetch;const restore=installLocalCmsTransport();assert.equal(globalThis.fetch,original);restore();assert.equal(globalThis.fetch,original);
});
