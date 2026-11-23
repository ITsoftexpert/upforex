const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {supportsNode,checkRuntime}=require('../scripts/check-runtime.cjs');
const root=path.resolve(__dirname,'..');
test('rejects the exact unsupported Jenkins runtime before loading parse5',()=>{
 assert.equal(supportsNode('v18.19.1'),false);
 assert.throws(()=>checkRuntime('v18.19.1','npm/9.2.0 node/v18.19.1'),/Select tested Node 24\.18\.0 in Jenkins BEFORE npm ci\/build/);
});
test('accepts Angular 21 supported LTS boundaries and the tested Node 24 runtime',()=>{
 for(const version of ['20.19.0','20.20.1','22.12.0','22.22.3','24.0.0','24.18.0'])assert.doesNotThrow(()=>checkRuntime(version,'npm/11.16.0'));
 for(const version of ['18.20.8','20.18.3','22.11.0','21.9.0','23.9.0','25.0.0','26.0.0','24.18.0-rc.1','garbage'])assert.equal(supportsNode(version),false,version);
});
test('rejects unsupported npm even if Node itself is supported',()=>{
 assert.throws(()=>checkRuntime('24.18.0','npm/9.2.0 node/v24.18.0'),/Unsupported npm 9/);
});
test('guard loads without node_modules or a relative working directory',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'scripts/check-runtime.cjs')],{cwd:require('node:os').tmpdir(),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).recommended,'24.18.0');
});
