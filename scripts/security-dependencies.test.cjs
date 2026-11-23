const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');

test('patched glob retains the promise and sync filesystem APIs used by CLI package tools',async()=>{
  const {createRequire}=require('node:module');
  const fromPackageJson=createRequire(require.resolve('@npmcli/package-json'));
  const glob=fromPackageJson('glob');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'upforex-glob-'));
  try{
    fs.writeFileSync(path.join(directory,'one.json'),'{}');
    fs.writeFileSync(path.join(directory,'skip.txt'),'');
    assert.deepEqual(await glob.glob('*.json',{cwd:directory}),['one.json']);
    assert.deepEqual(glob.globSync('*.json',{cwd:directory}),['one.json']);
    const signal=AbortSignal.abort(new Error('cancelled'));
    await assert.rejects(glob.glob('**/*',{cwd:directory,signal}),/cancelled/);
  }finally{fs.unlinkSync(path.join(directory,'one.json'));fs.unlinkSync(path.join(directory,'skip.txt'));fs.rmdirSync(directory);}
});

test('patched minimatch preserves file inclusion/exclusion semantics for package tooling',()=>{
  const {createRequire}=require('node:module');
  const fromIgnoreWalk=createRequire(require.resolve('ignore-walk'));
  const {minimatch,Minimatch}=fromIgnoreWalk('minimatch');
  assert(minimatch('src/page.ts','src/**/*.{ts,html}'));
  assert(!minimatch('src/page.css','src/**/*.{ts,html}'));
  assert(!minimatch('src/.hidden.ts','src/**/*.ts'));
  assert(new Minimatch('src/**/*.ts').match('src/core/page.ts'));
});

test('SockJS continues to generate distinct UUID v4 identifiers through its patched CommonJS dependency',()=>{
  const {createRequire}=require('node:module'),fromSockjs=createRequire(require.resolve('sockjs'));
  const {v4}=fromSockjs('uuid'),a=v4(),b=v4();
  assert.match(a,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.notEqual(a,b);
});
