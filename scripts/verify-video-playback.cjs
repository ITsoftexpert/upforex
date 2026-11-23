// Verify visible video, including desktop with DevTools reducing the viewport.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,fork}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const args=process.argv.slice(2),diagnose=args.includes('--diagnose');
const label=(args.find(a=>a.startsWith('--label='))||'--label=current').slice(8);
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid label');
const directory='tmp/video-fix';fs.mkdirSync(directory,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 let server,chrome,ws;const pending=new Map(),networkFailures=[],exceptions=[],records=[];let sequence=0;
 const log=fs.createWriteStream(directory+'/'+label+'-server.log');
 try{
  let base=args.find(a=>a.startsWith('--base-url='))?.slice(11);
  if(!base){
   server=fork(path.join(root,'scripts/security-smoke-server.cjs'),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
   server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
   const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SSR startup timeout')),20000);server.once('message',m=>{clearTimeout(timer);resolve(m.port)});server.once('error',reject)});
   base='http://127.0.0.1:'+port;
  }
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  if(!executable)throw Error('Chrome required');
  chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+path.join(root,directory,'chrome-'+label+'-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),20000);chrome.stderr.on('data',data=>{const match=String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1])}});chrome.once('error',reject)});
  const debugBase=endpoint.replace('ws:','http:').split('/devtools/')[0];
  const target=(await(await fetch(debugBase+'/json/list')).json()).find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Network.loadingFailed')networkFailures.push(m.params);else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails)});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  const waitFor=async(expression,label)=>{const until=Date.now()+30000;while(Date.now()<until){if(await evaluate('Boolean('+expression+')'))return;await sleep(150)}throw Error('Timeout: '+label)};
  const state=()=>evaluate(`(()=>{const v=document.querySelector('video');const r=v.getBoundingClientRect(),p=v.parentElement.getBoundingClientRect();return {url:location.href,lang:document.documentElement.lang,source:v.currentSrc,time:v.currentTime,duration:v.duration,paused:v.paused,ready:v.readyState,error:v.error?.message,muted:v.muted,videoWidth:v.videoWidth,videoHeight:v.videoHeight,rect:r.toJSON(),parent:p.toJSON(),nativeReady:document.documentElement.getAttribute('data-native-page-ready'),deferred:v.hasAttribute('appDeferredVideo'),style:{height:getComputedStyle(v).height,objectFit:getComputedStyle(v).objectFit}}})()`);
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('upforex_lang_manual','true');localStorage.setItem('uf_lang_manual','true');localStorage.setItem('upforex_language','en');localStorage.setItem('uf_lang','en');"});
  const cases=diagnose||args.includes('--smoke')?[{route:'/',width:1900,height:520,mobile:false}]:[
   {route:'/',width:1900,height:520,mobile:false},
   {route:'/',width:1440,height:900,mobile:false},
   {route:'/',width:390,height:844,mobile:true},
   {route:'/hi',width:1900,height:520,mobile:false},
   {route:'/ar',width:1900,height:520,mobile:false},
   {route:'/forex-trading-manila',width:1900,height:520,mobile:false},
   ...['abu-dhabi','cape-town','johannesburg','nairobi','south-africa','kuala-lumpur','singapore'].map(city=>({route:'/forex-trading-'+city,width:1900,height:520,mobile:false})),
  ];
  for(let i=0;i<cases.length;i++){
   const item=cases[i];await send('Emulation.setDeviceMetricsOverride',{width:item.width,height:item.height,mobile:item.mobile,deviceScaleFactor:1});
   await send('Page.navigate',{url:base+item.route});await waitFor("location.pathname==="+JSON.stringify(item.route)+"&&document.querySelector('video')",'video element on requested route');await sleep(1500);
   const initial=await state();
   await evaluate("(()=>{const p=document.querySelector('video').parentElement;window.scrollTo(0,p.getBoundingClientRect().top+scrollY-180)})()");
   let playbackError;
   try{await waitFor("document.querySelector('video').readyState>=2&&!document.querySelector('video').paused",'playing video');}catch(error){playbackError=error.message;}
   const first=await state();const progressStarted=Date.now();await waitFor("document.querySelector('video').currentTime>"+(first.time+0.3)+"||document.querySelector('video').currentTime<"+first.time,'advancing video frames');await sleep(1000);const later=await state();later.progressWaitMs=Date.now()-progressStarted;
   const geometryVisible=later.rect.height<=later.parent.height+2&&later.rect.top>=later.parent.top-2&&later.rect.bottom<=later.parent.bottom+2;
   const advancing=!later.paused&&later.ready>=2&&(later.time>first.time+0.3||later.time<first.time);
   const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(directory+'/'+label+'-'+i+'.png',Buffer.from(screenshot.data,'base64'));
   const record={...item,initial,first,later,geometryVisible,advancing,playbackError,passed:geometryVisible&&advancing&&!playbackError};records.push(record);
   console.log(JSON.stringify({label,route:item.route,width:item.width,height:item.height,geometryVisible,advancing,videoHeight:later.rect.height,containerHeight:later.parent.height,error:playbackError}));
   if(!diagnose){assert(!initial.source,'No offscreen video source before scrolling');assert(geometryVisible,'Video must fit its visible fixed-height container');assert(advancing,'Visible video frames must advance');assert(!later.error,'No media decode/network error');
    await evaluate('window.scrollTo(0,0)');await waitFor("document.querySelector('video').paused",'offscreen pause');
    await evaluate("(()=>{const p=document.querySelector('video').parentElement;window.scrollTo(0,p.getBoundingClientRect().top+scrollY-180)})()");await waitFor("!document.querySelector('video').paused",'resume after scrolling back');
   }
  }
 }catch(error){fs.writeFileSync(directory+'/'+label+'.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:false,records,error:error.stack,networkFailures,exceptions},null,2));throw error;}
 finally{ws?.close();chrome?.kill();server?.kill();log.end();}
 const version=/NATIVE_I18N_VERSION = [\"']([a-f0-9]+)[\"']/.exec(fs.readFileSync('src/app/core/config/i18n-coverage.ts','utf8'))?.[1];
 const report={checkedAt:new Date().toISOString(),version,passed:records.every(r=>r.passed),diagnosticOnly:diagnose,records,networkFailures,exceptions};fs.writeFileSync(directory+'/'+label+'.json',JSON.stringify(report,null,2));
 if(!diagnose)assert(report.passed,'Video checks failed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
