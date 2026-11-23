// Mobile lab comparison using the installed Chrome; no analytics keys or packages needed.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, fork } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const label = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid report label');
const directory = path.join(root, 'tmp/performance');
fs.mkdirSync(directory, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  let server, chrome, ws;
  const log = fs.createWriteStream(path.join(directory, label + '-server.log'));
  const results = [];
  try {
    let base = process.argv[3];
    if (!base) {
      server = fork(path.join(root, 'scripts/security-smoke-server.cjs'), [], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      server.stdout.pipe(log); server.stderr.pipe(log);
      const port = await new Promise((resolve, reject) => { server.once('message', message => resolve(message.port)); server.once('error', reject); });
      base = 'http://127.0.0.1:' + port;
    }
    const executable = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
    if (!executable) throw Error('Chrome is required');
    chrome = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + path.join(directory, 'chrome-' + label + '-' + Date.now()), 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 20000); chrome.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } }); chrome.once('error', reject); });
    const debugBase = endpoint.replace('ws:', 'http:').split('/devtools/')[0];
    const target = (await (await fetch(debugBase + '/json/list')).json()).find(t => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const pending = new Map(); let seq = 0, requests = new Map(), exceptions = [];
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
      else if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, { url: m.params.request.url, type: m.params.type, start: m.params.timestamp, priority: m.params.request.initialPriority });
      else if (m.method === 'Network.responseReceived') Object.assign(requests.get(m.params.requestId) || {}, { status: m.params.response.status, mime: m.params.response.mimeType, headers: m.params.response.headers });
      else if (m.method === 'Network.loadingFinished') Object.assign(requests.get(m.params.requestId) || {}, { bytes: m.params.encodedDataLength, end: m.params.timestamp });
      else if (m.method === 'Network.loadingFailed') Object.assign(requests.get(m.params.requestId) || {}, { error: m.params.errorText });
      else if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)); }, 30000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.75, mobile: true });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular4g' });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__speed={lcp:[],long:[],cls:0};new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__speed.lcp.push({time:e.startTime,url:e.url,tag:e.element?.tagName,text:e.element?.textContent?.slice(0,100),size:e.size}))).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__speed.long.push({start:e.startTime,duration:e.duration}))).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__speed.cls+=e.value})).observe({type:'layout-shift',buffered:true});if(/^https?:$/.test(location.protocol)){localStorage.setItem('upforex_lang_manual','true');localStorage.setItem('uf_lang_manual','true');localStorage.setItem('upforex_language','en');}` });
    const routes = process.argv[4] ? process.argv[4].split(',') : ['/', '/', '/'];
    for (let i = 0; i < routes.length; i++) {
      await send('Page.navigate', { url: 'about:blank' }); await pause(100);
      requests = new Map(); exceptions = [];
      await send('Network.clearBrowserCache');
      await send('Page.navigate', { url: base.replace(/\/$/, '') + routes[i] });
      await pause(25000);
      const metrics = await evaluate(`({url:location.href,lang:document.documentElement.lang,native:document.documentElement.dataset.nativeI18n,canonical:document.querySelector('link[rel=canonical]')?.href,nav:performance.getEntriesByType('navigation')[0]?.toJSON(),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),...window.__speed,images:[...document.images].map(e=>({url:e.currentSrc,w:e.clientWidth,h:e.clientHeight,nw:e.naturalWidth,nh:e.naturalHeight,loading:e.loading})),resources:performance.getEntriesByType('resource').map(e=>({url:e.name,duration:e.duration,start:e.startTime,transfer:e.transferSize,decoded:e.decodedBodySize,initiator:e.initiatorType})),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),text:document.querySelector('app-home h1')?.textContent,video:{currentSrc:document.querySelector('video')?.currentSrc,networkState:document.querySelector('video')?.networkState},chat:typeof window.Tawk_API?.maximize==='function'})`);
      const network = [...requests.values()].map(r => ({ ...r, durationMs: r.end ? (r.end - r.start) * 1000 : undefined }));
      const result = { route: routes[i], metrics, network, exceptions, totalTransferred: network.reduce((n, r) => n + (r.bytes || 0), 0) };
      results.push(result);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(directory, label + '-' + i + '.png'), Buffer.from(shot.data, 'base64'));
      console.log(JSON.stringify({ label, route: routes[i], fcp: metrics.paint?.find(p => p.name === 'first-contentful-paint')?.startTime, lcp: metrics.lcp?.at(-1), ttfb: metrics.nav?.responseStart, longTaskBlockingMs: metrics.long?.reduce((n, t) => n + Math.max(0, t.duration - 50), 0), bytes: result.totalTransferred, requests: network.length, chat: metrics.chat }));
      fs.writeFileSync(path.join(directory, label + '.json'), JSON.stringify({ label, createdAt: new Date().toISOString(), environment: { width: 390, height: 844, cpuSlowdown: 4, latency: 150, bytesPerSecond: 200000, cache: 'disabled', collectionMs: 25000, scope: 'local lab comparison; not Lighthouse scoring or field Core Web Vitals' }, results }, null, 2));
    }
  } finally { ws?.close(); chrome?.kill(); server?.kill(); log.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
