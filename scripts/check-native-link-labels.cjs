// Offline preflight. Inspect every translated rich-text anchor, including
// later links on a page whose first bad anchor would stop the SSR assertion.
// This never replaces the full initial-HTML production verifiers.
const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const {dictionaryFor,richBodyExpectations,bodyText}=require('./verify-native-release.cjs');
process.chdir(u.root);
const sourceVersion=process.argv[2];
if(!/^[a-f0-9]{20}$/.test(sourceVersion||''))throw Error('Provide the version of saved original English initial HTML');
const coverage=u.coverage(),inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(row=>[row.key,row]));
let checked=0,anchors=0;const failures=[];
for(const[page,languages]of Object.entries(coverage.COMPLETED_NATIVE_PAGES)){
 const key=u.contentKey(page),englishFile=`tmp/verified-initial-html/${sourceVersion}/en/${key}.html`;
 if(!fs.existsSync(englishFile))throw Error('Original English initial HTML missing: '+page);
 const root=u.elements(u.parse(fs.readFileSync(englishFile,'utf8')),'app-root')[0];
 for(const language of languages){
  const chunk=u.read(`src/assets/i18n/native/${coverage.NATIVE_I18N_VERSION}/${language}/${key}.json`);
  const rich=richBodyExpectations(root,dictionaryFor(chunk,inventory));checked++;
  for(const[node,text]of rich.slots)if(node.tagName==='a'&&u.normalizeContent(bodyText(node))){
   anchors++;if(!text)failures.push({page,language,source:u.normalizeContent(bodyText(node)),href:u.attribute(node,'href')});
  }
 }
}
const report={checkedAt:new Date().toISOString(),version:coverage.NATIVE_I18N_VERSION,originalEnglishSnapshotVersion:sourceVersion,checkedCombinations:checked,translatedRichAnchors:anchors,failures,passed:!failures.length,scope:'Offline translated anchor-label preflight; production SSR checks still required'};
fs.writeFileSync('tmp/native-link-label-preflight.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
