const {test}=require('node:test');
const assert=require('node:assert/strict');
const {frontendReport}=require('../scripts/inspect-frontend-runtime.cjs');
test('inspects only the named frontend and never emits stored PM2 secrets',()=>{
 const list=[{name:'locked-backend',pid:1,pm2_env:{SECRET:'private'}},{name:'Upforex-Portal',pid:2,pm_id:4,pm2_env:{status:'online',exec_mode:'fork_mode',pm_exec_path:'/frontend/server/main.js',pm_cwd:'/frontend',DATABASE_PASSWORD:'private',env:{TOKEN:'private'}}}];
 const visited=[];const records=frontendReport(list,pid=>{visited.push(pid);return 'v18.19.1'});
 assert.deepEqual(visited,[2]);assert.equal(records.length,1);assert.equal(records[0].supported,false);
 assert.doesNotMatch(JSON.stringify(records),/private|DATABASE|TOKEN|locked-backend/);
});
test('an absent or stopped frontend cannot pass a release runtime check',()=>{
 assert.throws(()=>frontendReport([],()=>''),/not found/);
 const records=frontendReport([{name:'Upforex-Portal',pid:0,pm2_env:{status:'stopped'}}],()=>{throw Error('Must not inspect PID zero')});
 assert.equal(records[0].supported,false);
});
test('reads the actual process version instead of trusting stale PM2 metadata',()=>{
 const list=[{name:'Upforex-Portal',pid:12,pm2_env:{node_version:'18.19.1',status:'online'}}];
 assert.equal(frontendReport(list,()=> 'v24.18.0')[0].supported,true);
});

test('marks wrapper processes as requiring a child runtime check',()=>{
 const wrapper=frontendReport([{name:'Upforex-Portal',pid:12,pm2_env:{pm_exec_path:'/usr/bin/npm',status:'online'}}],()=> 'v24.18.0')[0];
 assert.equal(wrapper.supported,true);assert.equal(wrapper.requiresChildRuntimeCheck,true);
 const direct=frontendReport([{name:'Upforex-Portal',pid:13,pm2_env:{pm_exec_path:'/frontend/dist/upforex_Frontend/server/main.js',status:'online'}}],()=> 'v24.18.0')[0];
 assert.equal(direct.supported,true);assert.equal(direct.requiresChildRuntimeCheck,false);
});
