// Export aligned exact-source review snapshots, without granting approval.
// Targets share one displayed English source; each language still receives
// its own immutable snapshot and must pass the ordinary hash-bound apply.
const fs=require('node:fs'),crypto=require('node:crypto');
const u=require('./i18n-release-utils.cjs'),{plain,identityProblems}=require('./review-free-catalogs.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
const args=process.argv.slice(2),option=name=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const languages=(option('languages')||'es,zh-CN,zh-TW,ja,pt').split(','),count=Number(option('count')||40),name=option('name');
if(!/^remaining-[a-zA-Z0-9-]+$/.test(name||'')||!Number.isInteger(count)||count<1||count>100||
 new Set(languages).size!==languages.length||languages.some(language=>!u.languages.includes(language)))throw Error('Invalid exact-source review export');
const memory=u.read('scripts/i18n-reviewed-translations.json'),inventory=u.read('tmp/native-content-inventory.json').entries;
const queues=Object.fromEntries(languages.map(language=>[language,new Map(fs.readFileSync('tmp/translation-review-queue/'+language+'.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
 .filter(row=>!(memory[language]?.[row.key]?.reviewed===true&&memory[language][row.key].english===row.english)).map(row=>[row.key,row]))]));
const scope=option('scope')||'all';
if(!['all','metadata'].includes(scope))throw Error('Unknown review scope');
const selected=inventory.filter(row=>languages.some(language=>queues[language].has(row.key))&&
 (scope!=='metadata'||row.sources.some(source=>/^CMS:/.test(source)&&!/#content$/.test(source)))).slice(0,count);
const snapshots=[];
for(const language of languages){
 const rows=selected.filter(row=>queues[language].has(row.key)).map(row=>({...row,translation:queues[language].get(row.key).translation||''}));
 if(!rows.length)continue;
 const file='scripts/i18n-review-snapshots/'+name+'-'+language+'.json';if(fs.existsSync(file))throw Error('Existing review snapshot: '+file);
 const bytes=JSON.stringify({language,method:'assistant-bilingual-exact-source-review',humanReviewed:false,rows},null,2)+'\n';
 fs.writeFileSync(file,bytes);snapshots.push({language,file,rows:rows.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
console.log(JSON.stringify({sources:selected.length,snapshots,approvalGranted:false}));
for(const row of selected){
 const targets={},problems={};
 for(const language of languages){const candidate=queues[language].get(row.key);if(!candidate)continue;
  const translation=candidate.translation||'';targets[language]=plain(translation,row.kind);
  const found=[...u.validate(row,translation,language),...identityProblems(plain(row.english,row.kind),plain(translation,row.kind)),...financialConsistency(plain(row.english,row.kind),plain(translation,row.kind),language).problems];
  if(found.length)problems[language]=found;
 }
 console.log(JSON.stringify({key:row.key,source:plain(row.english,row.kind),targets,problems}));
}
