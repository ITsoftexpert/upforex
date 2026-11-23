// No network access. Feed only the previous validated Chinese memory and
// exact-source reviewed corrections to the already installed local converter.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const u=require('./i18n-release-utils.cjs'),{reuseTraditionalChinese}=require('./reuse-chinese-script.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const inventory=u.read('tmp/native-content-inventory.json'),memory=u.read('tmp/validated-native-translations/zh-CN.json');
const fingerprint=hash(JSON.stringify(inventory.entries.map(({key,english,kind})=>({key,english,kind}))));
if(memory.sourceFingerprint!==fingerprint)throw Error('Validated English source inventory changed');
const simplified={...memory.COPY},reviewed=u.read('scripts/i18n-reviewed-translations.json')['zh-CN']||{};
for(const row of inventory.entries)if(reviewed[row.key]?.reviewed===true&&reviewed[row.key].english===row.english&&
  !u.validate(row,reviewed[row.key].translation,'zh-CN').length)simplified[row.key]=reviewed[row.key].translation;
const values=Object.fromEntries(inventory.entries.filter(row=>typeof simplified[row.key]==='string'&&
  u.needsContentTranslation(row.kind==='html'?u.text(u.parseFragment(row.english)):row.english)).map(row=>[row.key,simplified[row.key]]));
const result=spawnSync(process.env.OFFLINE_I18N_PYTHON || 'tmp/offline-i18n/venv/Scripts/python.exe',['scripts/convert-validated-chinese.py'],
  {input:JSON.stringify(values),encoding:'utf8',maxBuffer:80*1024*1024,windowsHide:true});
if(result.error||result.status!==0)throw result.error||Error(result.stderr);
const converted=JSON.parse(result.stdout),cache={provider:'opencc-s2t-validated-source-v1',humanReviewed:false,
  method:'deterministic-script-conversion-of-exact-source-validated-Chinese',conversion:converted.conversion,entries:{}};
for(const row of inventory.entries)if(Object.hasOwn(values,row.key)){
 const sourceTranslation=values[row.key],translation=converted.targets[row.key];
 cache.entries[row.key]={english:row.english,sourceTranslation,translation,sourceSha256:hash(row.english),
  sourceTranslationSha256:hash(sourceTranslation),targetSha256:hash(translation)};
}
const accepted=reuseTraditionalChinese(inventory.entries,simplified,{},cache);
cache.entries=Object.fromEntries(Object.entries(cache.entries).filter(([key])=>Object.hasOwn(accepted,key)));
fs.mkdirSync('scripts/i18n-derived-translations',{recursive:true});
fs.writeFileSync('scripts/i18n-derived-translations/zh-TW.json',JSON.stringify(cache,null,2)+'\n');
console.log(JSON.stringify({conversion:cache.conversion,validatedConversions:Object.keys(cache.entries).length,
 humanReviewed:false,paidRequests:0,englishTranslationsGenerated:0}));
