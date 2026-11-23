// Exercise the production browser bootstrap, client routing and upgraded UI controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {spawn,fork}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const version=require('./i18n-release-utils.cjs').coverage().NATIVE_I18N_VERSION;
const directory='tmp/security-remediation';fs.mkdirSync(directory,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const original={log:console.log,warn:console.warn,error:console.error};
 const log=fs.createWriteStream(directory+'/browser-server.log');
 for(const method of Object.keys(original))console[method]=(...args)=>log.write(require('node:util').format(...args)+'\n');
 let server,chrome,ws,evaluate;const records=[],exceptions=[],consoleErrors=[],networkFailures=[],pending=new Map();let seq=0;
 try{
  server=fork(path.join(root,'scripts/security-smoke-server.cjs'),[],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SSR server startup timeout')),20000);server.once('message',message=>{clearTimeout(timer);resolve(message.port);});server.once('error',reject);});
  const base='http://127.0.0.1:'+port;
  const cmsCache=await(await fetch(base+'/api/public-cms-status')).json(); assert.equal(cmsCache.mode,'frontend-public-cms-cache'); assert.equal(cmsCache.usable,true);
  const untrusted=await new Promise((resolve,reject)=>{http.get(base+'/hi/about-us',{headers:{host:'untrusted.invalid'}},r=>{let html='';r.on('data',b=>html+=b);r.on('end',()=>resolve({status:r.statusCode,html}));}).on('error',reject);});
  assert.equal(untrusted.status,200);assert.match(untrusted.html,/<html[^>]*lang="hi"/);
  assert.match(untrusted.html,/<link[^>]*rel="canonical"[^>]*href="https:\/\/www\.upforex\.com\/hi\/about-us"/);
  records.push({check:'Untrusted Host does not control the SSR URL or canonical',passed:true});
  const articleSlug='what-factors-influence-gold-and-silver-prices-in-the-global-market';
  const articleHtml=await(await fetch(base+'/blogs/'+articleSlug,{signal:AbortSignal.timeout(45000)})).text();
  const u=require('./i18n-release-utils.cjs'),doc=u.parse(articleHtml),component=u.elements(doc,'app-blogs')[0];
  const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join(' ');
  assert.equal(u.elements(component,'h1').length,1,'Article title must exist before JavaScript');
  assert.equal(text(u.elements(component,'h1')[0]).trim(),JSON.parse(fs.readFileSync('tmp/english-blog-api.json','utf8')).data.find(article=>article.permaLink===articleSlug).title);
  assert(u.elements(component,'div').some(node=>u.attribute(node,'class')==='sidebar'),'SSR must include the original recommended-article sidebar');
  records.push({check:'Asynchronously loaded article title and sidebar exist in initial SSR HTML',passed:true});
  const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(f=>fs.existsSync(f));
  if(!executable)throw Error('Chrome required for production browser verification');
  const profile=path.join(root,directory,'chrome-profile-'+Date.now());
  chrome=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome DevTools startup timeout')),20000);chrome.stderr.on('data',data=>{const match=String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});chrome.once('error',reject);});
  const debugBase=endpoint.replace(/^ws:/,'http:').split('/devtools/')[0];
  const targets=await(await fetch(debugBase+'/json/list')).json(),target=targets.find(t=>t.type==='page');
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome CDP connection timeout')),20000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(arg=>arg.value||arg.description).join(' '));else if(m.method==='Network.loadingFailed')networkFailures.push(m.params);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const waitFor=async(expression,label)=>{const deadline=Date.now()+25000;while(Date.now()<deadline){try{if(await evaluate('Boolean('+expression+')'))return;}catch{}await sleep(150);}throw Error('Browser condition failed: '+label);};
  const verifyVisibleVideo=async()=>{
   const first=await evaluate("document.querySelector('video').currentTime");
   await waitFor("document.querySelector('video').currentTime>"+(first+0.3)+"||document.querySelector('video').currentTime<"+first,'actual video frames advance');
   await sleep(1000);
   const state=await evaluate("(()=>{const v=document.querySelector('video'),r=v.getBoundingClientRect(),p=v.parentElement.getBoundingClientRect();return {time:v.currentTime,paused:v.paused,ready:v.readyState,height:r.height,containerHeight:p.height,top:r.top,bottom:r.bottom,parentTop:p.top,parentBottom:p.bottom,error:v.error?.message}})()");
   assert(!state.paused&&state.ready>=2&&(state.time>first+0.3||state.time<first),'Visible video frames advance');
   assert(state.height<=state.containerHeight+2&&state.top>=state.parentTop-2&&state.bottom<=state.parentBottom+2,'Video frame fits the visible container');
   assert(!state.error,'No media decode or network error');
   return state;
  };
  const cmsOrigin=require('./local-cms-transport.cjs').localCmsOrigin();
  if(cmsOrigin){
   ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);if(message.method!=='Fetch.requestPaused')return;
    const {requestId,request}=message.params;
    (async()=>{try{
     assert.equal(request.method,'GET','Only public blog reads are redirected in browser verification');
     const url=new URL(request.url),response=await fetch(cmsOrigin+url.pathname+url.search,{signal:AbortSignal.timeout(10000)}),bytes=Buffer.from(await response.arrayBuffer());
     const headers=[{name:'content-type',value:'application/json; charset=utf-8'},{name:'access-control-allow-origin',value:'*'}];
     await send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:headers,body:bytes.toString('base64')});
    }catch(error){networkFailures.push({localCmsError:error.message,url:request.url});await send('Fetch.failRequest',{requestId,errorReason:'Failed'}).catch(()=>{});}})();
   });
   await send('Fetch.enable',{patterns:[{urlPattern:'https://api.upforex.com/api/v1/blogs/web*',requestStage:'Request'}]});
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  // Seed the existing manual-language setting before application scripts run.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.origin==='"+base+"'){localStorage.setItem('upforex_language','en');localStorage.setItem('upforex_lang_manual','true');localStorage.setItem('uf_lang_manual','true');}"});
  await send('Page.navigate',{url:base+'/'});
  await waitFor("document.querySelector('app-home') && document.querySelector('#languages')",'English homepage');
  await sleep(1200);
  // Offscreen media must not compete with initial rendering, then play on scroll.
  assert(await evaluate("[...document.querySelectorAll('video source')].every(s=>!s.getAttribute('src')&&s.dataset.src)"),'Offscreen videos have no active source');
  assert(!await evaluate("performance.getEntriesByType('resource').some(r=>/smart_trading\\.(?:mp4|webm)/.test(r.name))"),'No CSS or video download before scrolling');
  const fontProof=await evaluate(`(async()=>{
    const fonts=await Promise.all([
      new FontFace('SpeedOriginal','url(/assets/fonts/Montserrat/Montserrat-VariableFont_wght.ttf)'),
      new FontFace('SpeedCompressed','url(/assets/fonts/Montserrat/Montserrat-VariableFont_wght.woff2)')
    ].map(f=>f.load()));fonts.forEach(f=>document.fonts.add(f));
    const ctx=document.createElement('canvas').getContext('2d');
    return ['New Revolutionary Smart Trading','UPFOREX 0123456789','Français Português Русский','€ £ $ %'].map(text=>{
      ctx.font='32px SpeedOriginal';const before=ctx.measureText(text).width;
      ctx.font='32px SpeedCompressed';const after=ctx.measureText(text).width;
      return {text,before,after};
    });
  })()`);
  assert(fontProof.every(r=>Math.abs(r.before-r.after)<0.01),'WOFF2 preserves original font metrics');
  records.push({check:'Smaller WOFF2 font preserves original text metrics',passed:true,samples:fontProof});
  await evaluate("document.querySelector('video').scrollIntoView({block:'center'})");
  await waitFor("document.querySelector('video').currentSrc.endsWith('/assets/videos/smart_trading.mp4')",'video loads near viewport');
  await waitFor("document.querySelector('video').readyState>=2 && !document.querySelector('video').paused",'visible video plays');
  const homeVideo=await verifyVisibleVideo();
  await evaluate('window.scrollTo(0,0)');
  await waitFor("document.querySelector('video').paused",'offscreen video pauses');
  records.push({check:'Video downloads, visibly fits and advances on scroll, then pauses offscreen',passed:true,video:homeVideo});
  await evaluate("window.dispatchEvent(new Event('pointerdown'))");
  assert.equal(await evaluate("document.querySelectorAll('script[data-upforex-chat]').length"),1,'Chat loads once on interaction');
  assert.equal(await evaluate("document.querySelector('script[data-upforex-chat]').src"),'https://embed.tawk.to/67c736fc31a20f190e279ac9/1ilh2titl');
  records.push({check:'Existing chat loader remains available and loads only once',passed:true,scope:'Loader verified; vendor domain/account availability is external'});
  await evaluate("document.querySelector('#languages').click()");
  await waitFor("document.querySelector('#languages').getAttribute('aria-expanded')==='true'",'ng-bootstrap language dropdown opens');
  await evaluate("document.querySelector('#languages').click()");
  const timeOrigin=await evaluate('performance.timeOrigin');
  await evaluate("document.querySelector('a[href=\"/about-us\"]').click()");
  await waitFor("location.pathname==='/about-us' && document.querySelector('app-about-us')",'client-side About navigation');
  assert.equal(await evaluate('performance.timeOrigin'),timeOrigin,'Angular router must navigate without a document reload');
  records.push({check:'Production AOT browser bootstrap and client-side navigation',passed:true});
  records.push({check:'Upgraded ng-bootstrap language dropdown',passed:true});
  await evaluate("document.querySelector('a[href=\"/blogs\"]').click()");
  await waitFor("location.pathname==='/blogs' && document.querySelector('.article-card h5 a')",'client-side blog index data');
  const cardCount=await evaluate("document.querySelectorAll('.article-card').length");
  await evaluate("document.querySelector('.blog-load-more-btn').click()");
  await waitFor("document.querySelectorAll('.article-card').length>"+cardCount,'main blog Load More appends another page');
  assert.equal(await evaluate('performance.timeOrigin'),timeOrigin,'Load More must not reload the document');
  assert(await evaluate("document.querySelectorAll('.featured-guide').length>=61"),'Existing published article guide links retained');
  records.push({check:'Main blog Load More and featured-guide links remain functional',passed:true});
  const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(directory+'/merged-blog-desktop.png',Buffer.from(desktop.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(300);
  assert(await evaluate("document.querySelector('.featured-guides-grid').getBoundingClientRect().right<=innerWidth+2"),'Featured guide layout fits mobile viewport');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(directory+'/merged-blog-mobile.png',Buffer.from(mobile.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  records.push({check:'Main featured-guide design fits desktop and mobile widths',passed:true});
  await evaluate("document.querySelector('a[href=\"/blogs/what-is-a-forex-currency-pair\"]').click()");
  await waitFor("location.pathname==='/blogs/what-is-a-forex-currency-pair' && document.querySelector('app-blogs h1') && document.querySelector('app-blogs .sidebar li a')",'asynchronous client-side article data');
  assert.equal(await evaluate('performance.timeOrigin'),timeOrigin,'CMS article navigation must remain client-side');
  records.push({check:'CMS blog list and article render after client-side routing without reload',passed:true});
  for(const [language,dir]of [['hi','ltr'],['ar','rtl']]){
   await send('Page.navigate',{url:base+'/'+language+'/partnerships/ib-programs'});
   await waitFor("document.querySelector('app-ib-program') && document.documentElement.lang==='"+language+"'",language+' IB body');
   await sleep(1000);
   const state=await evaluate("({lang:document.documentElement.lang,dir:document.documentElement.dir,text:document.querySelector('app-ib-program').innerText,canonical:document.querySelector('link[rel=canonical]').href})");
   assert.equal(state.dir,dir);assert.match(state.text,language==='hi'?/[\u0900-\u097f]/:/[\u0600-\u06ff]/);
   assert(!state.text.includes('Maximize Your Earnings. Expand Your Network.'));
   assert.equal(state.canonical,'https://www.upforex.com/'+language+'/partnerships/ib-programs');
   const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(directory+'/'+language+'-ib-browser.png',Buffer.from(screenshot.data,'base64'));
   records.push({check:language+' translated body and canonical survive JavaScript bootstrap',passed:true});
  }
  await send('Page.navigate',{url:base+'/forex-trading-manila'});
  await waitFor("document.querySelector('app-manila-forex video source[data-src]')",'country-page WebM source');
  await sleep(1000);
  assert.equal(await evaluate('document.documentElement.lang'),'en','English URL overrides the earlier saved Arabic preference');
  assert(!await evaluate("document.querySelector('script[src*=\"translate.google.com/translate_a\"]')"),'Native English must not load the legacy translation widget');
  assert(await evaluate("!document.querySelector('app-manila-forex video source').getAttribute('src')"),'Country video remains deferred above the fold');
  await evaluate("document.querySelector('app-manila-forex video').scrollIntoView({block:'center'})");
  await waitFor("document.querySelector('app-manila-forex video').currentSrc.endsWith('/assets/videos/smart_trading.webm') && document.querySelector('app-manila-forex video').readyState>=2 && !document.querySelector('app-manila-forex video').paused",'country WebM playback');
  const countryVideo=await verifyVisibleVideo();
  records.push({check:'Shared country-page WebM video defers loading and visibly plays within its container',passed:true,video:countryVideo});
  const approvedHeads=JSON.parse(fs.readFileSync('scripts/data/reviewed-derived-metadata.json','utf8'));
  for(const page of Object.keys(approvedHeads).filter(page=>page!=='/blogs/what-is-a-forex-currency-pair'))for(const language of ['en','hi','ar']){
   const route=(language==='en'?'':'/'+language)+page,head=language==='en'?approvedHeads[page].english:approvedHeads[page].translations[language];
   await send('Page.navigate',{url:base+route});
   await waitFor("document.querySelector('app-blogs h1')&&document.documentElement.lang==="+JSON.stringify(language),route+' article body');
   await sleep(1200);
   assert.equal(await evaluate('document.title'),head.title,'Approved title survives JavaScript');
   assert.equal(await evaluate("document.querySelector('meta[name=description]').content"),head.description,'Approved description survives JavaScript');
   assert.equal(await evaluate("document.querySelector('link[rel=canonical]').href"),'https://www.upforex.com'+route);
   records.push({check:route+' approved metadata survives JavaScript bootstrap',passed:true});
  }
  const localExceptions=exceptions.filter(e=>{const urls=[e.url,...(e.stackTrace?.callFrames||[]).map(f=>f.url)].filter(Boolean);return urls.some(url=>url.startsWith(base+'/'));});
  assert.deepEqual(localExceptions,[],'No uncaught application exceptions');
  fs.writeFileSync(directory+'/browser-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),version,mode:'frontend-only-public-cache',cmsOrigin:'frontend gateway; upstream https://api.upforex.com',cmsCache,passed:true,records,applicationExceptions:localExceptions,externalExceptionCount:exceptions.length-localExceptions.length},null,2)+'\n');
  original.log(JSON.stringify({passed:true,checks:records.length,report:directory+'/browser-verification.json'}));
 }catch(error){let diagnostic;try{if(evaluate)diagnostic=await evaluate("({url:location.href,body:document.querySelector('app-root')?.innerText?.slice(0,3000),cards:document.querySelectorAll('.article-card').length,video:[...document.querySelectorAll('video')].map(v=>({src:v.currentSrc,ready:v.readyState,paused:v.paused,error:v.error?.message,rect:v.getBoundingClientRect().toJSON()}))})");}catch{}fs.writeFileSync(directory+'/browser-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),version,mode:'frontend-only-public-cache',cmsOrigin:'frontend gateway; upstream https://api.upforex.com',passed:false,records,error:error.stack,exceptions,consoleErrors,networkFailures,diagnostic},null,2)+'\n');throw error;}
 finally{if(ws)ws.close();if(chrome)chrome.kill();if(server){server.kill();}Object.assign(console,original);await new Promise(resolve=>log.end(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
