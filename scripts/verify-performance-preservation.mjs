import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseTemplate, TmplAstText, TmplAstBoundText } from '@angular/compiler';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const comparison = JSON.parse(fs.readFileSync('tmp/performance/source-comparison.json', 'utf8'));
const base = 'tmp/performance/source-baseline';
const normalize = text => text.replace(/\s+/g, ' ').trim();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = (text, file) => {
  const parsed = parseTemplate(text, file, { preserveWhitespaces: true });
  if (parsed.errors?.length) throw Error(parsed.errors.join('\n'));
  const result = [];
  const walk = nodes => { for (const node of nodes) {
    if (node instanceof TmplAstText) result.push(['text', normalize(node.value)]);
    if (node instanceof TmplAstBoundText) result.push(['binding', normalize(node.value.source)]);
    for (const input of node.inputs || []) if (/^(?:alt|title|aria-label|attr\.(?:alt|title|aria-label))$/.test(input.name)) result.push([input.name, normalize(input.value.source)]);
    if (node.children) walk(node.children);
  } }; walk(parsed.nodes); return result;
};
const templates = [], styles = [], unexpected = [], runtime = [];
for (const row of comparison.changedExistingFiles) {
  if (row.file.endsWith('.component.html')) {
    const before = copy(fs.readFileSync(path.join(base, row.file), 'utf8'), row.file), after = copy(fs.readFileSync(row.file, 'utf8'), row.file);
    const identical = JSON.stringify(before) === JSON.stringify(after);
    templates.push({ file: row.file, identicalVisibleCopyAndBindings: identical });
    if (!identical) unexpected.push(row.file + ': changed visible copy');
  }
  if (/\.(?:scss|css)$/.test(row.file)) {
    const before = fs.readFileSync(path.join(base, row.file), 'utf8').replaceAll('\r\n', '\n'), after = fs.readFileSync(row.file, 'utf8').replaceAll('\r\n', '\n');
    const expected = row.file === 'src/styles.scss'
      ? before.replace('src: url("assets/fonts/Montserrat/Montserrat-VariableFont_wght.ttf")\n    format("truetype");', 'src: url("assets/fonts/Montserrat/Montserrat-VariableFont_wght.woff2") format("woff2"),\n    url("assets/fonts/Montserrat/Montserrat-VariableFont_wght.ttf") format("truetype");')
      : before.split('\n').filter(line => !(line.includes('background: url(') && line.includes('smart_trading.mp4'))).join('\n');
    const approved = expected === after;
    styles.push({ file: row.file, approved, change: row.file === 'src/styles.scss' ? 'Prefer equivalent WOFF2 font; keep TTF fallback' : 'Remove unsupported MP4-as-image background request' });
    if (!approved) unexpected.push(row.file + ': unexpected style change');
  }
}
const stringValues = (file, text) => {
  const values = [], ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = node => { if (ts.isStringLiteralLike(node)) values.push(node.text); ts.forEachChild(node, visit); }; visit(ast); return values;
};
for (const file of comparison.changedExistingFiles.map(row => row.file).filter(file => file.startsWith('src/app/components/') && file.endsWith('.ts'))) {
  const before = stringValues(file, fs.readFileSync(path.join(base, file), 'utf8')), after = new Set(stringValues(file, fs.readFileSync(file, 'utf8')));
  const allowed = file.endsWith('/home/home.component.ts') ? ['aos', '@ng-bootstrap/ng-bootstrap', 'smartVideo', 'IntersectionObserver', '200px'] : [];
  const missing = before.filter(value => !after.has(value) && !allowed.includes(value));
  runtime.push({ file, missingSourceLiterals: missing });
  if (missing.length) unexpected.push(file + ': removed runtime values');
}
const main = JSON.parse(fs.readFileSync('tmp/merge-evidence/main-preservation.json', 'utf8'));
const approvedFiles = new Set(styles.filter(row => row.approved).map(row => row.file));
for (const row of main.styles) {
  // Match the original Windows checkout, whose line endings are CRLF.
  const checkout = path.resolve(root, '../tmp/integration-review/main-snapshot', row.file);
  const original = fs.existsSync(checkout) ? fs.readFileSync(checkout)
    : execFileSync('git', ['show', 'HEAD:' + row.file], { windowsHide: true });
  row.identicalToMain = hash(original) === hash(fs.readFileSync(row.file));
  row.approvedPerformanceChange = !row.identicalToMain && approvedFiles.has(row.file);
  if (!row.identicalToMain && !row.approvedPerformanceChange) unexpected.push(row.file + ': main CSS differs without approved performance change');
}
main.performanceReviewAt = new Date().toISOString();
main.visibleCopyComparedWithDeliveredMerge = templates;
main.performanceReviewReport = 'tmp/performance/preservation.json';
fs.writeFileSync('tmp/merge-evidence/main-preservation.json', JSON.stringify(main, null, 2) + '\n');
const report = { checkedAt: main.performanceReviewAt, passed: !unexpected.length && comparison.changedNativeFiles === 0, templates, styles, runtime, unchangedNativeCatalogs: comparison.nativeFiles, changedNativeCatalogs: comparison.changedNativeFiles, unexpected, mainStyles: { total: main.styles.length, byteIdentical: main.styles.filter(row => row.identicalToMain).length, approvedPerformanceChanges: main.styles.filter(row => row.approvedPerformanceChange).length } };
fs.writeFileSync('tmp/performance/preservation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
