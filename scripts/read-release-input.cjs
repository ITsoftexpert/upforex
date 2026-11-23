const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const allowed=new Set(['tmp/native-content-inventory.json','tmp/native-page-coverage.json','tmp/english-blog-api.json','tmp/i18n-coverage-report.json']);
/** Prefer explicitly refreshed local audit inputs; clean checkouts use checksum/version-bound public source. */
function readReleaseInput(root,file,fallback,expectedVersion){
 const absolute=path.resolve(root,file);
 if(fs.existsSync(absolute))return JSON.parse(fs.readFileSync(absolute,'utf8'));
 if(!allowed.has(file))return fallback;
 const directory=path.join(root,'scripts/data/release-source'),manifestFile=path.join(directory,'manifest.json');
 if(!fs.existsSync(manifestFile))return fallback;
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(manifest.schema!==1||manifest.version!==expectedVersion())throw Error('Versioned release inputs do not match the active native catalog version');
 const name=path.basename(file),source=path.join(directory,name);
 if(!manifest.files[name]||!fs.existsSync(source))throw Error('Required versioned English release input missing: '+name);
 const bytes=fs.readFileSync(source),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 if(hash!==manifest.files[name])throw Error('Versioned English release input checksum mismatch: '+name);
 return JSON.parse(bytes.toString('utf8'));
}
module.exports={readReleaseInput};
