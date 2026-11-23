// Report current public English copy exactly; do not guess licences or rewrite it.
const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const snapshot=u.read('tmp/english-blog-api.json');
const articles=Array.isArray(snapshot.data)?snapshot.data:snapshot.data.blogs;
const claims=[];
for(const article of articles){
 const text=u.normalizeContent(u.text(u.parseFragment(article.content||'')));
 for(const match of text.matchAll(/\bGB\d{8}\b/g))claims.push({page:'/blogs/'+u.publicBlogPermalink(article.permaLink),licence:match[0],
  context:text.slice(Math.max(0,match.index-180),Math.min(text.length,match.index+110))});
}
const byLicence=Object.fromEntries([...new Set(claims.map(row=>row.licence))].sort().map(licence=>[licence,[...new Set(claims.filter(row=>row.licence===licence).map(row=>row.page))]]));
const report={checkedAt:new Date().toISOString(),source:'Current existing English CMS articles',englishContentModified:false,
 interpretation:'Multiple licence identifiers occur in the existing English copy. Confirm the legal entities, effective dates and intended historical/current wording with the business owner. This report does not determine that any licence is valid or invalid; translations preserve their own exact English source.',
 licenceIdentifiers:byLicence,claims};
fs.writeFileSync('tmp/english-source-claim-review.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({licenceIdentifiers:byLicence,englishContentModified:false},null,2));
