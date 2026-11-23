// Compare the running SSR page with the EXACT built artifact intended for deployment.
// Run on the release/build machine; this is a read-only check, never a deployment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const u = require('./i18n-release-utils.cjs');
const assetPattern = /^(?:main|runtime|polyfills|scripts|styles)\.[a-f0-9]+\.(?:js|css)$/;
function inspect(html) {
  const doc = u.parse(html);
  const assets = new Set();
  for (const tag of ['script', 'link']) for (const node of u.elements(doc, tag)) {
    if (tag === 'link' && u.attribute(node, 'rel') !== 'stylesheet') continue;
    const value = u.attribute(node, tag === 'script' ? 'src' : 'href');
    if (value && !/^(?:https?:)?\/\//.test(value)) {
      const file = value.replace(/^\//, '').split(/[?#]/)[0];
      if (assetPattern.test(file)) assets.add(file);
    }
  }
  return {doc, assets: [...assets].sort()};
}
function compare(expectedHtml, servedHtml) {
  const expected = inspect(expectedHtml), served = inspect(servedHtml);
  assert(expected.assets.some(a => a.startsWith('main.')), 'Build npm run build before checking the deployment');
  assert(expected.assets.some(a => a.startsWith('styles.')), 'Built stylesheet is required');
  const html = u.elements(served.doc, 'html')[0];
  const video = u.elements(served.doc, 'video')[0];
  const sources = video ? u.elements(video, 'source') : [];
  const scripts = u.elements(served.doc, 'script').map(n => u.attribute(n, 'src')).filter(Boolean);
  const checks = [
    {name:'Running bundles match this exact build artifact', passed:JSON.stringify(expected.assets)===JSON.stringify(served.assets), expected:expected.assets, observed:served.assets},
    {name:'Initial SSR source page is native-ready', passed:u.attribute(html, 'data-native-page-ready')==='true'},
    {name:'Homepage video stays out of initial network loading', passed:!!video && sources.length>0 && sources.every(n => !u.attribute(n,'src') && !!u.attribute(n,'data-src'))},
    {name:'Only one explicit Analytics loader is emitted', passed:scripts.filter(s => /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?/.test(s)).length===1},
  ];
  return {passed:checks.every(c=>c.passed), checks, expectedAssets:expected.assets, servedAssets:served.assets};
}
async function main() {
  const args=process.argv.slice(2), value=key=>args.find(a=>a.startsWith(key+'='))?.slice(key.length+1);
  const base=new URL(value('--base-url')||'https://www.upforex.com/');
  assert(['http:','https:'].includes(base.protocol)&&!base.username&&!base.password&&!base.search&&!base.hash&&base.pathname==='/', 'Use a public homepage origin URL without credentials or query parameters');
  const built=path.join(u.root,'dist/upforex_Frontend/browser/index.html');
  const response=await fetch(base,{redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Public homepage must return 200');
  const result=compare(fs.readFileSync(built,'utf8'),await response.text());
  const fonts=[];
  if(result.passed){
    const manifest=JSON.parse(fs.readFileSync(path.join(path.dirname(built),'assets/fonts/subsets/manifest.json'),'utf8'));
    for(const font of manifest.fonts){
      const relative=font.file.replace(/^src\//,'');
      assert(/^assets\/fonts\/subsets\/[a-z0-9.-]+\.woff2$/.test(relative),'Known built font path required');
      const resource=await fetch(new URL(relative,base),{redirect:'error',signal:AbortSignal.timeout(30000)});
      const bytes=Buffer.from(await resource.arrayBuffer());
      fonts.push({file:relative,status:resource.status,cacheControl:resource.headers.get('cache-control'),hashMatches:createHash('sha256').update(bytes).digest('hex')===font.sha256});
    }
  }
  result.checks.push({name:'Built subset font bytes and immutable cache headers are served',passed:fonts.length===3&&fonts.every(f=>f.status===200&&f.hashMatches&&f.cacheControl==='public, max-age=31536000, immutable'),fonts,skipped:fonts.length===0});
  result.passed=result.checks.every(c=>c.passed);
  const report={checkedAt:new Date().toISOString(),baseUrl:base.href,...result,scope:'Browser artifact, required initial SSR markup and font HTTP behavior. Not a server commit attestation, PageSpeed score or a deployment.',headers:{cacheControl:response.headers.get('cache-control'),cloudflareCacheStatus:response.headers.get('cf-cache-status')}};
  fs.mkdirSync(path.join(u.root,'tmp/mobile-speed-20261123'),{recursive:true});
  const destination=value('--report')||'tmp/mobile-speed-20261123/deployed-build.json';
  fs.writeFileSync(path.resolve(u.root,destination),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(c=>({name:c.name,passed:c.passed})),report:destination}));
  if(!report.passed)process.exitCode=1;
}
module.exports={inspect,compare};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
