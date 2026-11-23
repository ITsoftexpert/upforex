// Read-only public CMS refresh. Apply the same scoped copy corrections as
// the site's WebBlogService; retain the complete raw response for review.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.chdir(path.resolve(__dirname,'..'));
const correctionFile='src/app/core/services/blog-copy-corrections.ts',corrections={};
new Function('exports',ts.transpileModule(fs.readFileSync(correctionFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(corrections);
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Public CMS '+r.status+' '+url);const body=await r.json();assert.equal(body.status,true,'CMS success required');return body;}
async function main(){
 const articles=[];let listing;let page=1;
 do{
  listing=await get('https://api.upforex.com/api/v1/blogs/web?pageNum='+page+'&pageLimit=100&search=');
  const rows=Array.isArray(listing.data)?listing.data:listing.data?.blogs;assert(Array.isArray(rows),'Expected current article list');articles.push(...rows);page++;
 }while((Array.isArray(listing.data)?listing.data:listing.data?.blogs).length===100&&page<=Number(listing.metaData?.totalPage||1));
 assert(articles.length>0&&articles.length<1000,'Unexpected public article count');
 const details=new Array(articles.length);let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<articles.length){const index=cursor++,article=articles[index];assert(typeof article.permaLink==='string');const response=await get('https://api.upforex.com/api/v1/blogs/web/'+encodeURIComponent(article.permaLink));assert(response.data&&typeof response.data.content==='string'&&response.data.content.trim(),'Full article required');details[index]={...article,...response.data};}}));
 fs.mkdirSync('tmp/merge-evidence',{recursive:true});
 const raw={createdAt:new Date().toISOString(),source:'Existing public CMS GET endpoints; no translation provider',status:true,data:details};
 fs.writeFileSync('tmp/merge-evidence/english-blog-api-raw.json',JSON.stringify(raw,null,2)+'\n');
 const corrected={...raw,rawSnapshot:'tmp/merge-evidence/english-blog-api-raw.json',copyCorrectionSource:correctionFile,copyCorrectionSha256:crypto.createHash('sha256').update(fs.readFileSync(correctionFile)).digest('hex'),data:details.map(article=>corrections.correctPublicBlogCopy(article))};
 fs.writeFileSync('tmp/english-blog-api.json',JSON.stringify(corrected,null,2)+'\n');
 console.log(JSON.stringify({articles:details.length,changedArticles:details.filter((article,index)=>JSON.stringify(article)!==JSON.stringify(corrected.data[index])).length,rawSnapshot:corrected.rawSnapshot,source:'tmp/english-blog-api.json',paidTranslationRequests:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
