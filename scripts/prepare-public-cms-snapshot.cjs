const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
process.chdir(path.resolve(__dirname,'..'));
const seed='server/data/public-blog-snapshot.json',target='dist/upforex_Frontend/server/data/public-blog-snapshot.json';
const input=JSON.parse(fs.readFileSync(seed,'utf8'));
assert.equal(input.schema,1);assert.equal(input.source,'https://api.upforex.com/api/v1/blogs/web');
assert.equal(crypto.createHash('sha256').update(JSON.stringify(input.articles)).digest('hex'),input.sha256,'Public snapshot integrity');
assert(input.articles.every(a=>a.content&&a.title&&a.permaLink),'Complete English source required');
fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(seed,target);
console.log(JSON.stringify({publicCmsSnapshot:input.articles.length,fetchedAt:input.fetchedAt,sha256:input.sha256,browserBundleIncludesArticles:false}));
