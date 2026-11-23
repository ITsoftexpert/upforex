// Traditional Chinese can reuse a validated Chinese translation through a
// deterministic script conversion. This never translates missing English.
const crypto=require('node:crypto'),u=require('./i18n-release-utils.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
const {identityProblems,plain}=require('./review-free-catalogs.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function reuseTraditionalChinese(entries,simplified,traditional,cache){
  const reused={};
  if(cache?.provider!=='opencc-s2t-validated-source-v1'||cache.conversion?.config!=='s2t'||
    !/^[a-f\d]{64}$/.test(cache.conversion?.dictionarySha256||''))return reused;
  for(const entry of entries){
    if(typeof traditional[entry.key]==='string')continue;
    const source=simplified[entry.key],row=cache.entries?.[entry.key];
    if(typeof source!=='string'||row?.english!==entry.english||row.sourceTranslation!==source||
      typeof row.translation!=='string'||row.sourceSha256!==hash(entry.english)||
      row.sourceTranslationSha256!==hash(source)||row.targetSha256!==hash(row.translation))continue;
    if(u.validate(entry,source,'zh-CN').length||u.validate(entry,row.translation,'zh-TW').length)continue;
    const english=plain(entry.english,entry.kind),target=plain(row.translation,entry.kind);
    if(identityProblems(english,target).length||financialConsistency(english,target,'zh-TW').problems.length)continue;
    reused[entry.key]=row.translation;
  }
  return reused;
}
module.exports={reuseTraditionalChinese};
