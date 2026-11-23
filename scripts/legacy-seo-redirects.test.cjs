const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const u=require('./i18n-release-utils.cjs');
test('legacy marketing aliases resolve only to existing completed canonical pages',()=>{
 const pages=new Set(u.pageDefinitions().map(p=>p.path));
 for(const [source,target]of Object.entries(u.LEGACY_SEO_PAGE_REDIRECTS)){
  assert(!pages.has(source));assert(pages.has(target));assert.equal(u.coverage().COMPLETED_NATIVE_PAGES[target].length,10);
  assert.equal(u.legacySeoDestination(source),target);assert.equal(u.legacySeoDestination(encodeURI(source)),target);
 }
 assert.equal(Object.keys(u.LEGACY_SEO_PAGE_REDIRECTS).length,5);
});
test('unknown blog IDs, malformed escapes and unrelated paths are not guessed or redirected',()=>{
 for(const path of ['/blogs/real-time-forex-trading-platform','/blogs/no-article','/blogs/%E0%A4%A','/admin/login'])assert.equal(u.legacySeoDestination(path),undefined);
});
test('account aliases reuse both existing homepage registration destinations',()=>{
 const home=fs.readFileSync('src/app/components/home/home.component.html','utf8');
 for(const target of Object.values(u.LEGACY_ACCOUNT_REDIRECTS))assert(home.includes('href="'+target+'"'));
 assert.deepEqual(Object.keys(u.LEGACY_ACCOUNT_REDIRECTS),['/demo','/live']);
});
test('blog aliases never change stored CMS permalink identities',()=>{
 const snapshot=u.read('tmp/english-blog-api.json');
 for(const target of Object.values(u.LEGACY_SEO_PAGE_REDIRECTS).filter(s=>s.startsWith('/blogs/'))){
  const slug=target.slice('/blogs/'.length),record=snapshot.data.find(row=>row.permaLink===slug);
  assert(record);assert.equal(u.storedBlogPermalink(slug),record.permaLink);
 }
});
