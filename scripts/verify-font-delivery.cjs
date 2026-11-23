// Browser checks for real font downloads, decoded glyphs, and complete-font fallback.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,fork}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const directory='tmp/mobile-speed-20261123';fs.mkdirSync(directory,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 let server,chrome,ws;const pending=new Map(),exceptions=[],requests=[];let sequence=0;
 const log=fs.createWriteStream(directory+'/font-browser-server.log');
 try{
  server=fork(path.join(root,'scripts/security-smoke-server.cjs'),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SSR timeout')),20000);server.once('message',m=>{clearTimeout(timer);resolve(m.port)});server.once('error',reject)});
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);assert(executable);
  chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+path.join(root,directory,'font-chrome-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome timeout')),20000);chrome.stderr.on('data',d=>{const m=String(d).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1])}});chrome.once('error',reject)});
  const target=(await(await fetch(endpoint.replace('ws:','http:').split('/devtools/')[0]+'/json/list')).json()).find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url)});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,mobile:true,deviceScaleFactor:1.75});
  await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  const until=Date.now()+30000;let initial;
  while(Date.now()<until){
   await pause(250);
   initial=await evaluate(`(async()=>{await document.fonts.ready;return {title:document.querySelector('app-home h1')?.textContent,fonts:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\.woff2/.test(n)),video:document.querySelector('video')?.currentSrc,ready:document.documentElement.dataset.nativePageReady}})()`);
   if(['montserrat-latin','public-solid','public-brands'].every(n=>initial.fonts.some(f=>f.includes(n))))break;
  }
  for(const name of ['montserrat-latin','public-solid','public-brands'])assert(initial.fonts.some(f=>f.includes(name)),'Initial subset '+name);
  assert(!initial.fonts.some(f=>/Montserrat-VariableFont|fa-solid-900|fa-brands-400/.test(f)),'Do not also fetch full fonts for the English homepage');
  assert.equal(initial.video,'');assert.equal(initial.ready,'true');
  const fallback=await evaluate(`(async()=>{await document.fonts.load('16px "Montserrat"','\\u0416');await document.fonts.load('900 16px "Font Awesome 7 Free"','\\uf186');return {fonts:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/\\.woff2/.test(n)),cyrillic:document.fonts.check('16px "Montserrat"','\\u0416'),futureIcon:document.fonts.check('900 16px "Font Awesome 7 Free"','\\uf186')}})()`);
  assert(fallback.cyrillic&&fallback.futureIcon,'Full-font fallback decodes');
  assert(fallback.fonts.some(f=>f.includes('Montserrat-VariableFont')),'Cyrillic keeps the complete original face');
  assert(fallback.fonts.some(f=>f.includes('fa-solid-900')),'An icon outside the subset still loads the original icon face');
  const manifest=JSON.parse(fs.readFileSync('src/assets/fonts/subsets/manifest.json','utf8'));
  const glyphPixels=await evaluate(`(async()=>{const rows=${JSON.stringify(manifest.fonts)};const results=[];for(const [i,row] of rows.entries()){const before=new FontFace('original'+i,'url('+JSON.stringify('/'+row.source.replace(/^src\\//,'').replace(/^node_modules\\/@fortawesome\\/fontawesome-free\\/webfonts\\//,'webfonts/'))+')');const after=new FontFace('subset'+i,'url('+JSON.stringify('/'+row.file.replace(/^src\\//,''))+')');await Promise.all([before.load(),after.load()]);document.fonts.add(before);document.fonts.add(after);const text=i===0?'UPFOREX Smart Trading Fran\\u00e7ais Stra\\u00dfe S\\u00e3o':String.fromCodePoint(...row.codepoints);function draw(name){const c=document.createElement('canvas');c.width=2000;c.height=150;const x=c.getContext('2d');x.font='32px '+name;x.fillText(text,0,70);return {width:x.measureText(text).width,pixels:Array.from(x.getImageData(0,0,c.width,c.height).data)}}const a=draw('original'+i),b=draw('subset'+i);results.push({label:row.label,widthEqual:a.width===b.width,pixelsEqual:a.pixels.every((v,n)=>v===b.pixels[n])});}return results})()`);
  assert(glyphPixels.every(r=>r.widthEqual&&r.pixelsEqual),'Browser glyph pixels and advances must match');
  assert.equal(exceptions.length,0,'No uncaught application exception');
  const report={checkedAt:new Date().toISOString(),passed:true,initial,fallback,glyphPixels,exceptions};
  fs.writeFileSync(directory+'/font-browser.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,initialSubsetFonts:3,fullFontsInitiallyDownloaded:0,fallbackChecks:2,pixelChecks:glyphPixels.length,report:directory+'/font-browser.json'}));
 }finally{ws?.close();chrome?.kill();server?.kill();log.end()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
