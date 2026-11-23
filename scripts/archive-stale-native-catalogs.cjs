// Reversible local housekeeping. Keep every active-version asset and move
// only positively identified generated old catalogs outside shipped assets.
const fs=require('node:fs'),path=require('node:path'),u=require('./i18n-release-utils.cjs');
process.chdir(u.root);
const workspace=fs.realpathSync(u.root),active=u.coverage().NATIVE_I18N_VERSION;
const sourceRoot=path.resolve(workspace,'src/assets/i18n/native'),archiveRoot=path.resolve(workspace,'tmp/native-catalog-archive');
const inside=file=>{const relative=path.relative(workspace,file);return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
if(!inside(sourceRoot)||!inside(archiveRoot)||!/^[a-f0-9]{20}$/.test(active))throw Error('Unsafe catalog/archive root or version');
if(!fs.statSync(path.join(sourceRoot,active)).isDirectory())throw Error('Active catalog must exist');
const inspect=(directory,version)=>{
 let files=0,bytes=0;
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.resolve(directory,item.name);if(!inside(file)||fs.lstatSync(file).isSymbolicLink())throw Error('Unsafe generated catalog path');
  if(item.isDirectory()){const child=inspect(file,version);files+=child.files;bytes+=child.bytes;continue;}
  if(!item.isFile()||!file.endsWith('.json'))throw Error('Unknown file in old catalog: '+file);
  const content=fs.readFileSync(file),catalog=JSON.parse(content);
  if(catalog.__nativeI18nVersion!==version||typeof catalog.__nativePage!=='string'||!Array.isArray(catalog.__nativeSourceKeys)||!catalog.COPY)throw Error('Unrecognized generated catalog: '+file);
  files++;bytes+=content.length;
 }
 return {files,bytes};
};
const versions=fs.readdirSync(sourceRoot,{withFileTypes:true}).filter(item=>item.name!==active).map(item=>{
 if(!item.isDirectory()||!/^[a-f0-9]{20}$/.test(item.name))throw Error('Unknown catalog directory: '+item.name);
 const from=path.resolve(sourceRoot,item.name),to=path.resolve(archiveRoot,item.name);
 if(!inside(from)||!inside(to)||fs.lstatSync(from).isSymbolicLink()||fs.existsSync(to))throw Error('Unsafe or existing archive destination: '+to);
 return {version:item.name,from,to,...inspect(from,item.name)};
});
const write=process.argv.includes('--write');
if(write){fs.mkdirSync(archiveRoot,{recursive:true});for(const row of versions)fs.renameSync(row.from,row.to);}
const report={checkedAt:new Date().toISOString(),activeVersion:active,mode:write?'moved-to-local-archive':'dry-run',activeFilesKept:inspect(path.join(sourceRoot,active),active),archivedVersions:versions,archivedBytes:versions.reduce((sum,row)=>sum+row.bytes,0),deletedFiles:0};
fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/native-catalog-archive-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({activeVersion:active,mode:report.mode,activeFilesKept:report.activeFilesKept,archivedVersions:versions.length,archivedBytes:report.archivedBytes,deletedFiles:0}));
