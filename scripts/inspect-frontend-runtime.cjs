// Read-only inspection for the supplied Linux PM2 service. Node 18 can run this.
// Captures PM2's private JSON in memory; prints ONLY the selected frontend fields.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {supportsNode}=require('./check-runtime.cjs');
const APP='Upforex-Portal';
function frontendReport(list,runtimeFor){
 if(!Array.isArray(list))throw Error('Invalid PM2 status response.');
 const matches=list.filter(p=>p.name===APP);
 if(!matches.length)throw Error('Upforex-Portal was not found under this service user.');
 return matches.map(p=>{
  const env=p.pm2_env||{};let node,inspectionError;
  try{if(Number.isInteger(p.pid)&&p.pid>0)node=runtimeFor(p.pid);else inspectionError='Frontend is not running.'}catch{inspectionError='Actual process executable could not be inspected.'}
  return {name:APP,id:p.pm_id,pid:p.pid,status:env.status,mode:env.exec_mode,script:env.pm_exec_path,cwd:env.pm_cwd,actualNode:node,supported:supportsNode(node),requiresChildRuntimeCheck:!/[\\/]dist[\\/]upforex_Frontend[\\/]server[\\/]main\.js$/.test(env.pm_exec_path||''),inspectionError};
 });
}
function main(){
 if(process.platform!=='linux')throw Error('Run this read-only inspection on the Linux server as the existing ubuntu service user.');
 const home=process.env.PM2_HOME||path.join(os.homedir(),'.pm2');
 const pid=Number(fs.readFileSync(path.join(home,'pm2.pid'),'utf8').trim());
 if(!Number.isInteger(pid)||pid<=0)throw Error('Existing PM2 daemon PID is not valid. No daemon was started.');
 try{process.kill(pid,0)}catch{throw Error('Existing PM2 daemon is not available to this user. No daemon was started.')}
 let data;
 try{data=JSON.parse(execFileSync('pm2',['jlist','--silent'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}))}catch{throw Error('Could not read PM2 status. Private status JSON is not logged.')}
 const records=frontendReport(data,pid=>{
  const executable=fs.realpathSync('/proc/'+pid+'/exe');
  return execFileSync(executable,['--version'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim();
 });
 const report={readOnly:true,app:APP,supported:records.every(r=>r.supported&&!r.requiresChildRuntimeCheck&&r.status==='online'),scope:'Checks the PM2-managed frontend process. Wrapper processes require a separate child-runtime check.',records};
 console.log(JSON.stringify(report,null,2));
 if(process.argv.includes('--require-supported')&&!report.supported)process.exitCode=1;
}
module.exports={frontendReport};
if(require.main===module){try{main()}catch(error){console.error(error.message);process.exitCode=1}}
