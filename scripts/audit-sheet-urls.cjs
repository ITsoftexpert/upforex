// Read-only evidence for the user's URL/internal-link audit tab. Never edits CMS.
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const u = require('./i18n-release-utils.cjs');
const {parseCsv} = require('./import-sheet-metadata.cjs');
const run = promisify(execFile);
const snapshot = 'tmp/seo-sheet-1264087386.csv';
async function main(baseOverride) {
  const base = baseOverride || process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || 'https://www.upforex.com';
  if (!/^https:\/\/www\.upforex\.com$|^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Unexpected audit origin');
  const label = base.startsWith('https:') ? 'live' : 'local';
  const directory = `tmp/sheet-url-audit-${label}`;
  fs.mkdirSync(directory, {recursive: true});
  const rows = parseCsv(fs.readFileSync(snapshot, 'utf8'));
  if (rows.shift()?.[1] !== 'Page URL') throw new Error('Unexpected URL audit sheet');
  const requested = rows.map((row, index) => ({row: index + 2, sheetUrl: row[1], action: row[3], suggestedLinks: row[4]}));
  const extras = [
    '/blogs/how-to-calculate-forex-position-size-formula-lot-size-risk-examples',
    '/blogs/what-is-a-forex-currency-pair',
    '/blogs/how-to-trade-stock-cfds-apple-tesla-nvidia',
    '/products/index-cfds', '/products/energy-cfds', '/blogs', '/'
  ].map(page => ({sheetUrl: 'https://www.upforex.com' + page}));
  const results = [];
  const cms=u.read('tmp/english-blog-api.json',{data:[]}).data;
  for (let start = 0; start < requested.length + extras.length; start += 3) {
    const batch = [...requested, ...extras].slice(start, start + 3);
    await Promise.all(batch.map(async item => {
      const url = new URL(item.sheetUrl);
      if (url.origin !== 'https://www.upforex.com') throw new Error('Foreign sheet URL');
      const file = path.join(directory, u.contentKey(url.pathname) + '.html');
      try {
        const {stdout} = await run('curl.exe', ['--silent', '--show-error', '--location', '--max-redirs', '5', '--max-time', '35', '--output', file, '--write-out', '%{json}', base + url.pathname], {windowsHide: true, maxBuffer: 100000});
        const response = JSON.parse(stdout), html = fs.readFileSync(file, 'utf8'), doc = u.parse(html);
        const canonical = u.elements(doc, 'link').filter(node => u.attribute(node, 'rel') === 'canonical').map(node => u.attribute(node, 'href'));
        const robots = u.elements(doc, 'meta').filter(node => /^(?:robots|googlebot)$/i.test(u.attribute(node, 'name') || '')).map(node => u.attribute(node, 'content'));
        const links = [...new Set(u.elements(doc, 'a').map(node => u.attribute(node, 'href')).filter(Boolean))];
        const article = u.elements(doc, 'app-blogs')[0];
        const articleBodyPresent = article ? u.normalizeContent(u.text(article)).length > 100 && u.elements(article, 'h1').length > 0 : undefined;
        const problems = [];
        if (response.http_code !== 200) problems.push('Final response is not HTTP 200');
        if (url.pathname.startsWith('/blogs/') && !articleBodyPresent) problems.push('Empty/missing initial article body; HTTP 200 alone is not a pass');
        if (canonical.length !== 1) problems.push('Expected exactly one canonical');
        const finalPath=new URL(response.url_effective).pathname;
        if(canonical.length===1&&canonical[0]!=='https://www.upforex.com'+finalPath)problems.push('Canonical differs from the final normalized public URL');
        if(robots.some(value=>/(?:^|[\s,;])(?:noindex|nofollow|none)(?:$|[\s,;])/i.test(value||'')))problems.push('Robots directive blocks indexing/following');
        let articleBodyMatchesSource;
        if(url.pathname.startsWith('/blogs/')){
          const source=cms.find(item=>'/blogs/'+u.publicBlogPermalink(item.permaLink)===finalPath);
          try{require('./verify-native-release.cjs').verifyEnglishArticle(article,source);articleBodyMatchesSource=true;}
          catch(error){articleBodyMatchesSource=false;problems.push(error.message);}
        }
        if (response.num_redirects > 1) problems.push('More than one redirect hop');
        results.push({...item, path: url.pathname, status: response.http_code, finalUrl: response.url_effective, redirects: response.num_redirects, canonical, robots,
          h1: u.elements(doc, 'h1').map(node => u.normalizeContent(u.text(node))), articleBodyPresent, articleBodyMatchesSource, problems, links, htmlBytes: Buffer.byteLength(html), initialHtml: file});
      } catch (error) { results.push({...item, path: url.pathname, error: error.message}); }
    }));
    console.log(`URL audit ${label}: ${results.length}/${requested.length + extras.length}`);
  }
  const report = {checkedAt: new Date().toISOString(), sourceSheet: 'https://docs.google.com/spreadsheets/d/14geinKQBoFMim9EoimH9vmc8a67tWim3gbBJWViuzOk/edit?gid=1264087386', base, paidRequests: 0, readOnly: true,
    results: results.sort((a,b) => (a.row || 1000) - (b.row || 1000))};
  fs.writeFileSync(`tmp/sheet-url-audit-${label}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.results.map(({path,status,redirects,canonical,error}) => ({path,status,redirects,canonical,error})), null, 2));
}
if (require.main === module) main().catch(error => {console.error(error);process.exitCode = 1;});
module.exports = {main};
