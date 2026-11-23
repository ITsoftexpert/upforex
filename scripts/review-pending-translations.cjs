// Exact, reviewable source/target snapshots. This script never contacts a provider.
// Exporting a draft grants no approval. Apply only after inspecting the fixed snapshot.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const u=require('./i18n-release-utils.cjs');
const {identityProblems,plain}=require('./review-free-catalogs.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
process.chdir(u.root);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const args=process.argv.slice(2),mode=args[0],option=name=>args.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const textNodes=node=>[...(node.nodeName==='#text'&&u.normalizeContent(node.value)?[node]:[]),...(node.childNodes||[]).flatMap(textNodes)];
const problems=(row,language)=>[...u.validate(row,row.translation,language),...identityProblems(plain(row.english,row.kind),plain(row.translation,row.kind)),...financialConsistency(plain(row.english,row.kind),plain(row.translation,row.kind),language).problems];
if(mode==='export'){
 const language=option('language'),name=option('name'),limit=Number(option('count')||80);
 if(!u.languages.includes(language)||!/^remaining-[a-zA-Z0-9-]+$/.test(name||''))throw Error('Choose an existing language and a remaining-* snapshot name');
 const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(entry=>[entry.key,entry]));
 const reviewed=u.read('scripts/i18n-reviewed-translations.json',{})[language]||{};
 const queue=fs.readFileSync('tmp/translation-review-queue/'+language+'.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const rows=queue.filter(row=>!(reviewed[row.key]?.reviewed===true&&reviewed[row.key].english===row.english)).slice(0,limit).map(row=>({
   key:row.key,english:row.english,translation:row.translation||'',kind:row.kind,sources:inventory.get(row.key)?.sources||row.sources,
 }));
 if(!rows.length){console.log(JSON.stringify({language,remainingUnreviewed:0}));process.exit(0);}
 const snapshot={language,method:'assistant-bilingual-exact-source-review',humanReviewed:false,rows};
 const file='scripts/i18n-review-snapshots/'+name+'.json';if(fs.existsSync(file))throw Error('Snapshot already exists: '+file);
 fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({file,sha256:hash(fs.readFileSync(file)),rows:rows.length,remainingUnreviewed:queue.filter(row=>!(reviewed[row.key]?.reviewed===true&&reviewed[row.key].english===row.english)).length}));
 let previous;
 for(const row of rows){const context=row.sources.find(source=>source.startsWith('CMS:'))||row.sources[0];if(context!==previous){console.log('SOURCE '+context);previous=context;}
  console.log(JSON.stringify({key:row.key,s:plain(row.english,row.kind),t:plain(row.translation,row.kind),p:problems(row,language)}));
 }
}else if(mode==='append'){
 const file=option('snapshot'),snapshot=u.read(file),fixes=u.read(option('fixes'));
 const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(row=>[row.key,row]));
 for(const [key,translation]of Object.entries(fixes)){
  if(snapshot.rows.some(row=>row.key===key))continue;
  const row=inventory.get(key);if(!row)throw Error('Unknown exact source key: '+key);
  snapshot.rows.push({...row,translation});
 }
 fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({file,rows:snapshot.rows.length,sha256:hash(fs.readFileSync(file))}));
}else if(mode==='layouts'){
 const snapshot=u.read(option('snapshot')),fixes=u.read(option('fixes'));
 for(const row of snapshot.rows)if(Object.hasOwn(fixes,row.key)&&row.kind==='html'){
  const nodes=textNodes(u.parseFragment(row.english));if(nodes.length>1)console.log(JSON.stringify({key:row.key,nodes:nodes.map(node=>node.value),current:row.translation}));
 }
}else if(mode==='fix'){
 const file=option('snapshot'),fixes=u.read(option('fixes'));
 const snapshot=u.read(file);for(const row of snapshot.rows){if(!Object.hasOwn(fixes,row.key))continue;
  let replacement=fixes[row.key];
  if(Array.isArray(replacement)){
   const original=u.parseFragment(row.english),nodes=textNodes(original);if(replacement.length!==nodes.length)throw Error('Text-node alignment differs: '+row.key);
   nodes.forEach((node,index)=>node.value=replacement[index]);replacement=u.serialize(original);
  }else if(row.kind==='html'&&!replacement.includes('<')){
   const original=u.parseFragment(row.english),nodes=textNodes(original);if(nodes.length!==1)throw Error('Multi-node HTML requires the complete corrected HTML: '+row.key);
   nodes[0].value=replacement;replacement=u.serialize(original);
  }
  row.translation=replacement;
 }
 fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({file,sha256:hash(fs.readFileSync(file)),problems:snapshot.rows.flatMap(row=>problems(row,snapshot.language).map(problem=>({key:row.key,problem})))}));
}else if(mode==='apply'){
 const file=option('snapshot'),expected=option('sha256'),bytes=fs.readFileSync(file);if(hash(bytes)!==expected)throw Error('Reviewed snapshot hash mismatch');
 const snapshot=JSON.parse(bytes),inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(entry=>[entry.key,entry]));
 const memory=u.read('scripts/i18n-reviewed-translations.json');const failures=[];
 for(const row of snapshot.rows){if(inventory.get(row.key)?.english!==row.english)failures.push({key:row.key,problem:'English source changed'});else failures.push(...problems(row,snapshot.language).map(problem=>({key:row.key,problem})));}
 if(failures.length){console.log(JSON.stringify(failures));throw Error('Repair the reviewed snapshot before applying it');}
 for(const row of snapshot.rows)(memory[snapshot.language]||={})[row.key]={english:row.english,translation:row.translation,reviewed:true,humanReviewed:false,
  reviewMethod:snapshot.method,reviewSnapshot:file,reviewSnapshotSha256:expected,note:'Assistant compared complete source and target; preserve source meaning, values, names and structure. Source regulatory claims are not independently certified.'};
 fs.writeFileSync('scripts/i18n-reviewed-translations.json',JSON.stringify(memory,null,2)+'\n');
 console.log(JSON.stringify({language:snapshot.language,applied:snapshot.rows.length,snapshot:file}));
}else throw Error('Use export, fix or apply');
