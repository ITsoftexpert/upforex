// Run one fixed, local release check and retain its real exit code and log.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const checks={
  npmCi:{args:['ci'],log:'tmp/release-npm-ci.log'},
  sourceBuild:{args:['run','build:ssr'],log:'tmp/integration-source-build.log'},
  englishInventory:{args:['run','i18n:audit-english'],log:'tmp/integration-english-inventory.log'},
  testRegression:{args:['run','test:regression'],log:'tmp/release-test-regression.log'},
  testServer:{args:['run','test:server'],log:'tmp/release-test-server.log'},
  testPerformance:{args:['run','test:performance'],log:'tmp/release-test-performance.log'},
  audit:{args:['audit','--json'],log:'tmp/release-npm-audit.json'},
  buildSsr:{args:['run','build:ssr'],log:'tmp/release-build-ssr.log'},
  testI18n:{args:['run','test:i18n'],log:'tmp/release-test-i18n.log'},
  strictSeo:{args:['run','verify:seo','--','--require-complete'],log:'tmp/release-verify-seo.log'},
  strictSsrI18n:{args:['run','verify:ssr-i18n','--','--require-complete'],log:'tmp/release-verify-ssr-i18n.log'},
};
const name=process.argv[2],check=checks[name];
if(!check)throw new Error('Choose a fixed check: '+Object.keys(checks).join(', '));
fs.mkdirSync('tmp',{recursive:true});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest='src/app/core/config/i18n-coverage.ts',startedAt=new Date().toISOString(),started=Date.now(),sourceAtStart=hash(manifest);
const output=fs.createWriteStream(check.log);
const windows=process.platform==='win32';
const child=spawn(windows?(process.env.ComSpec||'cmd.exe'):'npm',windows?['/d','/s','/c','npm.cmd '+check.args.join(' ')]:check.args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',bytes=>output.write(bytes));child.stderr.on('data',bytes=>output.write(bytes));
let launchError;child.on('error',error=>{launchError=error.message;output.write(error.stack+'\n');});
child.on('close',code=>output.end(()=>{
  const file='tmp/release-command-results.json',results=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  const sourceChangedDuringRun=sourceAtStart!==hash(manifest),exitCode=Number.isInteger(code)?code:1;
  const row={cmsVerificationContext:process.env.I18N_VERIFY_CMS_BASE_URL?{mode:'isolated-supplied-backend',origin:require('./local-cms-transport.cjs').localCmsOrigin(),sourceSnapshotSha256:process.env.I18N_VERIFY_CMS_SOURCE_SHA256}:null,command:'npm '+check.args.join(' '),startedAt,completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,
    exitCode,passed:exitCode===0&&!sourceChangedDuringRun&&!launchError,sourceChangedDuringRun,manifestSha256:hash(manifest),
    packageLockSha256:hash('package-lock.json'),log:check.log,logSha256:hash(check.log)};
  if(launchError)row.launchError=launchError;
  // Independent checks retain separate records even if they finish together.
  fs.writeFileSync('tmp/release-command-'+name+'.json',JSON.stringify(row,null,2)+'\n');
  results[name]=row;fs.writeFileSync(file,JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({check:name,passed:row.passed,exitCode,sourceChangedDuringRun,log:check.log}));
  process.exitCode=row.passed?0:exitCode||1;
}));
