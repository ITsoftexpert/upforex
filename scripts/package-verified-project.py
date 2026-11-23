"""Package the locally verified source. Never include credentials, dependencies or builds."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

repo = Path(__file__).resolve().parent.parent
report = json.loads((repo / 'tmp/deployment-readiness.json').read_text(encoding='utf-8'))
if report.get('status') != 'LOCAL_CHECKS_PASS' or not report.get('releaseReady'):
    raise RuntimeError('All final release gates must pass before packaging')
if not report.get('performance', {}).get('currentOptimization', {}).get('localMeasurementPassed'):
    raise RuntimeError('Current speed comparison is required')
if not report.get('videoFix', {}).get('passed'):
    raise RuntimeError('The video playback and SSR checks must pass')
target = repo.parent / 'upforex-main-local-merged-seo-ready-20261123.zip'
if target.exists():
    raise RuntimeError('Refusing to overwrite an existing delivery ZIP')
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=repo).decode('utf-8').split('\0')
paths = set()
for name in names:
    if not name or not (repo / name).is_file():
        continue
    relative = PurePosixPath(name)
    if '__pycache__' in relative.parts or name.endswith('.pyc'):
        continue
    if (relative.name.startswith('.env') and relative.name != '.env.translation.example') or relative.suffix.lower() in {'.pem', '.key', '.pfx'}:
        raise RuntimeError('Private path is in the candidate source list: ' + name)
    if relative.parts[0] in {'.git', 'node_modules', 'tmp', 'dist', '.aws', '.codex', '.agents'}:
        raise RuntimeError('Generated/private source path is not eligible: ' + name)
    if relative.is_absolute() or '..' in relative.parts or not (repo / name).resolve().is_relative_to(repo):
        raise RuntimeError('Unsafe source path: ' + name)
    paths.add(name)
evidence = [
    'tmp/deployment-readiness.json', 'tmp/translation-coverage.csv', 'tmp/missing-translations-summary.json',
    'tmp/missing-translations.csv', 'tmp/missing-translations.json', 'tmp/i18n-coverage-report.json',
    'tmp/native-translation-quality.json', 'tmp/seo-verification.json', 'tmp/ssr-i18n-verification.json',
    'tmp/sheet-metadata-import.json', 'tmp/sheet-metadata-verification.json', 'tmp/sheet-metadata-summary.txt',
    'tmp/internal-link-audit.json', 'tmp/ssr-i18n-internal-link-audit.json', 'tmp/native-link-label-preflight.json',
    'tmp/english-blog-api.json', 'tmp/native-content-inventory.json', 'tmp/native-page-coverage.json',
    'tmp/release-performance.json', 'tmp/merge-evidence/main-preservation.json',
    'tmp/merge-evidence/main-runtime-values.json', 'tmp/merge-evidence/http-verification.json',
    'tmp/merge-evidence/bundle-comparison.json', 'tmp/merge-evidence/copy-equivalence-review.json',
    'tmp/merge-evidence/performance-comparison.json', 'tmp/merge-evidence/current-baseline-performance.json',
    'tmp/merge-evidence/english-blog-api-raw.json', 'tmp/security-remediation/browser-verification.json',
    'tmp/security-remediation/merged-blog-desktop.png', 'tmp/security-remediation/merged-blog-mobile.png',
    'tmp/security-remediation/hi-ib-browser.png', 'tmp/security-remediation/ar-ib-browser.png',
]
for name in ['before', 'after-final', 'comparison', 'preservation', 'screenshot-comparison', 'optimized-media', 'source-comparison', 'media-inventory']:
    evidence.append('tmp/performance/' + name + '.json')
evidence.append('tmp/performance/media-inventory.csv')
for name in ['before-0', 'before-1', 'before-2', 'after-final-0', 'after-final-1', 'after-final-2']:
    evidence.append('tmp/performance/' + name + '.png')
for name in ['fixed', 'localhost-fixed', 'ssr', 'source-preservation', 'old-assets', 'old-port', 'merged-before']:
    evidence.append('tmp/video-fix/' + name + '.json')
for name in ['fixed-0', 'fixed-2', 'localhost-fixed-0', 'old-port-0', 'merged-before-0']:
    evidence.append('tmp/video-fix/' + name + '.png')
for name in ['body-preservation.json', 'sheet-verification.json', 'url-dispositions.csv']:
    evidence.append('tmp/sheet-fix-20261123/' + name)
for key, row in report['checks'].items():
    if not row.get('passed') or row.get('exitCode') != 0:
        raise RuntimeError('Failed command: ' + key)
    evidence.extend([row['log'], 'tmp/release-command-' + key + '.json'])
for name in evidence:
    if not (repo / name).is_file() or not (repo / name).resolve().is_relative_to(repo):
        raise RuntimeError('Required evidence unavailable: ' + name)
paths.update(evidence)
manifest = {'version': report['version'], 'mainCommit': report['main']['mainCommit'], 'kind': 'local merged source with verified multilingual SSR, sheet redirects and Cloudflare email protection', 'files': []}
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
    for name in sorted(paths):
        data = (repo / name).read_bytes()
        manifest['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        archive.writestr('upforex-merged/' + name, data)
    archive.writestr('upforex-merged/MERGED_SOURCE_MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with zipfile.ZipFile(target) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError('ZIP CRC failed: ' + bad)
    for row in manifest['files']:
        if hashlib.sha256(archive.read('upforex-merged/' + row['path'])).hexdigest() != row['sha256']:
            raise RuntimeError('Packaged hash differs: ' + row['path'])
result = {'file': target.name, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': len(paths), 'verified': True, 'includesGit': False, 'includesDependencies': False, 'includesCompiledBuild': False, 'pushed': False, 'deployed': False}
(repo / 'tmp/performance/delivery-zip.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
