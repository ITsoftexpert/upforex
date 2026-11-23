import hashlib,json,subprocess,zipfile
from pathlib import Path,PurePosixPath
repo=Path(__file__).resolve().parent.parent
report=json.loads((repo/'tmp/deployment-readiness.json').read_text(encoding='utf-8'))
if not report.get('localChecksPassed') or not report.get('frontendReleaseReady'):
 raise RuntimeError('Complete current frontend checks and recent live-source equivalence are required before delivery')
for file,expected in json.loads((repo/'tmp/frontend-only/production-source-manifest.json').read_text(encoding='utf-8'))['files'].items():
 if hashlib.sha256((repo/file).read_bytes()).hexdigest()!=expected:raise RuntimeError('Production source changed: '+file)
target=repo.parent/'upforex-frontend-only-local-checked-20261123.zip'
if target.exists():raise RuntimeError('Refusing to overwrite an existing delivery')
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=repo).decode('utf-8').split('\0')
paths=set()
for name in names:
 p=repo/name
 if not name or not p.is_file():continue
 rel=PurePosixPath(name)
 if rel.is_absolute() or '..' in rel.parts or not p.resolve().is_relative_to(repo):raise RuntimeError('Unsafe path')
 if rel.parts[0] in {'.git','node_modules','dist','tmp','var','.angular','.aws','.codex','.agents','local-only','__pycache__'}:continue
 if (rel.name.startswith('.env') and rel.name!='.env.translation.example') or rel.suffix.lower() in {'.pem','.key','.pfx','.zip','.pyc'}:continue
 paths.add(name)
evidence=['tmp/deployment-readiness.json','tmp/i18n-coverage-report.json','tmp/ssr-i18n-coverage-report.json','tmp/seo-verification.json','tmp/ssr-i18n-verification.json','tmp/missing-translations-summary.json','tmp/missing-translations.json','tmp/missing-translations.csv','tmp/translation-coverage.csv','tmp/native-content-inventory.json','tmp/native-page-coverage.json','tmp/native-translation-quality.json','tmp/english-blog-api.json','tmp/merge-evidence/english-blog-api-raw.json','tmp/sheet-metadata-verification.json','tmp/sheet-metadata-summary.txt','tmp/sheet-metadata-import.json','tmp/sheet-fix-20261123/sheet-verification.json','tmp/sheet-fix-20261123/body-preservation.json','tmp/sheet-fix-20261123/url-dispositions.csv','tmp/merge-evidence/http-verification.json','tmp/security-remediation/browser-verification.json','tmp/performance/frontend-only-final.json','tmp/performance/comparison.json','tmp/performance/preservation.json','tmp/merge-evidence/main-preservation.json','tmp/merge-evidence/current-baseline-performance.json','tmp/merge-evidence/bundle-comparison.json','tmp/release-performance.json','tmp/video-fix/fixed.json','tmp/video-fix/ssr.json']
for name in ['live-api-baseline.json','live-cms-compressed-check.json','live-source-equivalence.json','live-public-snapshot.json','cache-performance.json','design-content-preservation.json','production-source-manifest.json','translation-coverage.json']:
 evidence.append('tmp/frontend-only/'+name)
for row in report['checks'].values():
 if not row['passed'] or row['exitCode']!=0:raise RuntimeError('Failed required check')
 evidence.append(row['log'])
for name in ['frontend-only-final-0.png','frontend-only-final-1.png','frontend-only-final-2.png']:evidence.append('tmp/performance/'+name)
for name in evidence:
 if not (repo/name).is_file():raise RuntimeError('Required evidence unavailable: '+name)
 paths.add(name)
manifest={'kind':'Frontend-only locally checked source, native SSR and cached public CMS gateway','createdAt':report['checkedAt'],'version':report['version'],'main':report['main'],'frontendReleaseReady':True,'productionEnvironmentVerified':False,'backendIncluded':False,'pushed':False,'deployed':False,'files':[]}
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
 for name in sorted(paths):
  data=(repo/name).read_bytes();manifest['files'].append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()});z.writestr('upforex-frontend-only/'+name,data)
 z.writestr('upforex-frontend-only/FRONTEND_SOURCE_MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
 z.writestr('READ_FIRST.txt','Frontend project only. No backend deployment is required. Read upforex-frontend-only/FRONTEND_ONLY_RELEASE.txt and LOCAL_COMPLETION_REPORT.txt. Requires Node SSR, including the /api/public/blogs gateway. Existing public CMS content has been checked against a successful live refresh; prior API outages remain an external availability risk. Source only: run npm ci and npm run build:ssr. No Git history, node_modules, compiled output, credentials or private keys included.\n')
with zipfile.ZipFile(target) as z:
 if z.testzip():raise RuntimeError('ZIP CRC validation failed')
 for item in manifest['files']:
  if hashlib.sha256(z.read('upforex-frontend-only/'+item['path'])).hexdigest()!=item['sha256']:raise RuntimeError('Packaged file hash mismatch')
result={'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(paths),'verified':True,'backendIncluded':False,'includesDependencies':False,'includesCompiledBuild':False,'includesGit':False,'includesCredentials':False,'pushed':False,'deployed':False}
(repo/'tmp/frontend-only/delivery.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
