// Deliberately dependency-free: this must run BEFORE npm installs Angular/parse5.
const fs=require('node:fs'),path=require('node:path');
function supportsNode(version){
 const match=/^v?(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(String(version));
 if(!match||String(version).includes('-'))return false;
 const major=Number(match[1]),minor=Number(match[2]);
 return major===20&&minor>=19||major===22&&minor>=12||major===24;
}
function checkRuntime(version=process.version,userAgent=process.env.npm_config_user_agent||''){
 const recommended=fs.readFileSync(path.resolve(__dirname,'../.nvmrc'),'utf8').trim();
 if(!supportsNode(version))throw Error(`Unsupported Node.js ${version}. Angular 21 requires Node 20.19+, 22.12+, or 24.x. Select tested Node ${recommended} in Jenkins BEFORE npm ci/build and for the frontend SSR process. A .nvmrc file alone does not switch Jenkins Node.`);
 const npm=/\bnpm\/(\d+)\./.exec(userAgent);
 if(npm&&Number(npm[1])<10)throw Error('Unsupported npm '+npm[1]+'. Use npm 10+ bundled with the selected Node 24 toolchain.');
 return {node:version,recommended};
}
module.exports={supportsNode,checkRuntime};
if(require.main===module){try{console.log(JSON.stringify(checkRuntime()))}catch(error){console.error(error.message);process.exitCode=1}}
