import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { parseTemplate, TmplAstText, TmplAstBoundText } from '@angular/compiler';
import { parseFragment } from 'parse5';

const root = process.cwd();
const write = process.argv.includes('--write');
const runtime = {};
const identifiers = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/app/core/config/market-identifiers.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(identifiers);
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('src/app/core/config/content-keys.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(runtime, name => { if (name === './market-identifiers') return identifiers; throw new Error('Unexpected content-key dependency: ' + name); });
new Function('exports', ts.transpileModule(fs.readFileSync('src/app/core/config/rich-content.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(runtime);
const { normalizeContent, contentKey, needsContentTranslation } = runtime;
const entries = new Map();
const changed = [];
const problems = [];
const roots = ['src/app/components', 'src/app/layouts', 'src/app/not-found', 'src/app/legel-document-pge'];
const textAttributes = new Set(['alt', 'title', 'placeholder', 'aria-label', 'aria-description']);
const copyProperties = /^(?:name|title|heading|subheading|subtitle|description|subText|boldText|text|content|label|question|answer|term|message|buttonText|metaTitle|keywords|caption|detail|details|summary|benefits|features)$/i;
const ignoredProperties = /^(?:routerLink|route|path|src|url|href|image|img|imgSrc|icon|flag|class|style|code|key|id|selector|templateUrl|styleUrls|type|method|currency|symbol|countryCode)$/i;
const quote = (value) => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'";
const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function add(value, source, kind = 'text') {
  if (typeof value !== 'string' || !needsContentTranslation(value)) return;
  if (/[\u0400-\u052f\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff]/.test(value)) return;
  if (kind !== 'rich' && /<\/?[a-z][\s\S]*>/i.test(value)) {
    const fragment = parseFragment(value);
    for (const attribute of runtime.richContentAttributes(fragment)) add(attribute.value, source + '#' + attribute.name);
    for (const unit of runtime.richContentUnits(fragment)) {
      if (needsContentTranslation(unit.text)) add(unit.message, source, 'rich');
    }
    return;
  }
  const english = normalizeContent(value);
  const key = contentKey(english);
  const previous = entries.get(key);
  if (previous && previous.english !== english) throw new Error(`Content-key collision: ${source}`);
  if (previous) {
    if (!previous.sources.includes(source)) previous.sources.push(source);
  } else entries.set(key, { key, english, kind: kind === 'rich' ? 'html' : kind, sources: [source] });
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name).replace(/\\/g, '/');
    if (/admin-navbar|\/admin\//.test(filename)) return [];
    return entry.isDirectory() ? walkFiles(filename) : [filename];
  });
}

for (const filename of roots.flatMap(walkFiles).filter((name) => name.endsWith('.html'))) {
  const original = fs.readFileSync(filename, 'utf8');
  const parsed = parseTemplate(original, filename, { preserveWhitespaces: true });
  if (parsed.errors?.length) { problems.push({ filename, errors: parsed.errors.map(String) }); continue; }
  const replacements = [];
  function replace(span, value) { replacements.push({ start: span.start.offset, end: span.end.offset, value }); }
  function expressionStrings(ast) {
    if (!ast || typeof ast !== 'object') return;
    if (ast.name === 'translate' || ast.name === 'hybridTranslate') return;
    if (ast.constructor?.name === 'LiteralPrimitive' && typeof ast.value === 'string') add(ast.value, filename);
    for (const [key, value] of Object.entries(ast)) {
      if (['span', 'sourceSpan', 'nameSpan', 'source', 'location', 'strings'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(expressionStrings);
      else if (value && typeof value === 'object') expressionStrings(value);
    }
  }
  function parameterized(ast) {
    if (ast?.name === 'localize' && ast.exp) ast = ast.exp;
    if (ast?.operation !== '+') return null;
    const parts = [];
    function flatten(value) {
      if (value.operation === '+') { flatten(value.left); flatten(value.right); }
      else if (value.constructor?.name === 'LiteralPrimitive' && typeof value.value === 'string') parts.push({ text: value.value });
      else parts.push({ expression: original.slice(value.sourceSpan.start, value.sourceSpan.end) });
    }
    flatten(ast);
    if (!parts.some(part => part.text && needsContentTranslation(part.text)) || !parts.some(part => part.expression)) return null;
    const arguments_ = [];
    const message = normalizeContent(parts.map(part => {
      if (part.text !== undefined) return part.text;
      arguments_.push(part.expression);
      return '{' + (arguments_.length - 1) + '}';
    }).join(''));
    add(message, filename);
    return quote(message) + ' | localize: [' + arguments_.join(', ') + ']';
  }
  function interpolate(raw, location) {
    const matches = [...raw.matchAll(/\{\{([\s\S]*?)\}\}/g)];
    if (!matches.length) return raw;
    if (matches.some((match) => /\|\s*(?:translate|hybridTranslate|localize)\b/.test(match[1]))) return raw;
    const pieces = [];
    let at = 0;
    const expressions = [];
    for (const [index, match] of matches.entries()) {
      pieces.push(raw.slice(at, match.index), `{${index}}`);
      expressions.push(match[1].trim());
      at = match.index + match[0].length;
    }
    pieces.push(raw.slice(at));
    const message = normalizeContent(pieces.join(''));
    if (needsContentTranslation(message)) {
      add(message, location);
      return '{{ ' + quote(message) + ' | localize: [' + expressions.join(', ') + '] }}';
    }
    return raw.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => '{{ (' + expression.trim() + ') | localize }}');
  }
  function visit(nodes, skip = false) {
    for (const node of nodes) {
      const ignored = skip || ['script', 'style', 'code', 'pre'].includes(node.name) ||
        node.attributes?.some((attribute) => attribute.name === 'translate' && attribute.value === 'no' ||
          attribute.name === 'class' && /\bnotranslate\b/.test(attribute.value));
      if (ignored) continue;
      if (node instanceof TmplAstText && needsContentTranslation(node.value)) {
        const value = normalizeContent(node.value);
        add(value, filename);
        const leading = /^\s/.test(node.value) ? ' ' : '';
        const trailing = /\s$/.test(node.value) ? ' ' : '';
        replace(node.sourceSpan, leading + '{{ ' + quote(value) + ' | localize }}' + trailing);
      } else if (node instanceof TmplAstBoundText) {
        expressionStrings(node.value.ast);
        const raw = original.slice(node.sourceSpan.start.offset, node.sourceSpan.end.offset);
        const args = node.value.ast?.expressions;
        const message = args?.length === 1 ? parameterized(args[0]) : null;
        const translated = message ? '{{ ' + message + ' }}' : interpolate(raw, filename);
        if (translated !== raw) replace(node.sourceSpan, translated);
      }
      for (const attribute of node.attributes || []) {
        if (textAttributes.has(attribute.name) && needsContentTranslation(attribute.value)) {
          add(attribute.value, filename + '#' + attribute.name);
          replace(attribute.sourceSpan, `[attr.${attribute.name}]="${escapeAttribute(quote(attribute.value) + ' | localize')}"`);
        }
      }
      for (const input of node.inputs || []) {
        if (input.name === 'nativeCarouselLabels') { expressionStrings(input.value?.ast); continue; }
        if (!textAttributes.has(input.name) && input.name !== 'innerHTML') continue;
        expressionStrings(input.value?.ast);
        const raw = original.slice(input.sourceSpan.start.offset, input.sourceSpan.end.offset);
        const parameterizedValue = parameterized(input.value?.ast);
        if (parameterizedValue) {
          const binding = input.name.startsWith('aria-') ? 'attr.' + input.name : input.name;
          replace(input.sourceSpan, `[${binding}]="${escapeAttribute(parameterizedValue)}"`);
          continue;
        }
        if (/\|\s*(?:localize|translate)\b/.test(raw)) continue;
        const source = input.value?.source;
        if (!source) continue;
        let expression = source;
        if (/\{\{/.test(source)) {
          const matches = [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)];
          if (matches.length !== 1 || normalizeContent(source.replace(matches[0][0], ''))) continue;
          expression = matches[0][1].trim();
        }
        // Localize the original HTML before its existing sanitizer pipe.
        expression = expression.replace(/\|\s*sanitizeHtml\b/, '| localize | sanitizeHtml');
        if (!/\|\s*localize\b/.test(expression)) expression = '(' + expression + ') | localize';
        const binding = input.name.startsWith('aria-') ? 'attr.' + input.name : input.name;
        replace(input.sourceSpan, `[${binding}]="${escapeAttribute(expression)}"`);
      }
      if (node.children) visit(node.children, ignored);
    }
  }
  visit(parsed.nodes);
  if (replacements.length) {
    const ordered = replacements.sort((a, b) => b.start - a.start);
    let output = original;
    let last = Infinity;
    for (const replacement of ordered) {
      if (replacement.end > last) throw new Error(`Overlapping template edits: ${filename}`);
      last = replacement.start;
      output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
    }
    const validation = parseTemplate(output, filename);
    if (validation.errors?.length) throw new Error(validation.errors.map(String).join('\n'));
    changed.push({ filename, edits: replacements.length, before: crypto.createHash('sha256').update(original).digest('hex') });
    if (write) fs.writeFileSync(filename, output, 'utf8');
  }
}

for (const filename of roots.flatMap(walkFiles).filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const name = parent.name.getText(source).replace(/['"]/g, '');
        if (!ignoredProperties.test(name) && (copyProperties.test(name) || /\s/.test(node.text))) add(node.text, filename + '#' + name);
      } else if (ts.isArrayLiteralExpression(parent) && /\s/.test(node.text)) add(node.text, filename);
      else if (!ts.isPropertyAssignment(parent) && /[A-Za-z]{2,}\s+[A-Za-z]/.test(node.text)) add(node.text, filename);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function jsonStrings(value, source) {
  if (typeof value === 'string') add(value, source);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (!key.startsWith('__')) jsonStrings(item, source + '.' + key);
}
jsonStrings(JSON.parse(fs.readFileSync('src/assets/i18n/en.json', 'utf8')), 'src/assets/i18n/en.json');
if (fs.existsSync('tmp/english-blog-api.json')) {
  const articles = JSON.parse(fs.readFileSync('tmp/english-blog-api.json', 'utf8')).data || [];
  for (const article of articles) {
    const source = `CMS:blogs/${article.permaLink}`;
    for (const field of ['title', 'metaTitle', 'description', 'imageAltTag', 'videoAltTag']) add(article[field], source + '#' + field);
    add(article.description?.slice(0, 200), source + '#descriptionSnippet');
    for (const tag of article.tags || []) { add(tag, source + '#tag'); add(tag.toUpperCase(), source + '#upperTag'); }
    for (const category of article.categories || []) add(category.categoryName, source + '#category');
    add(article.content, source + '#content');
  }
}
if (fs.existsSync('tmp/native-page-coverage.json')) {
  const audit = JSON.parse(fs.readFileSync('tmp/native-page-coverage.json', 'utf8'));
  for (const page of audit.pages || []) for (const source of Object.values(page.sources || {})) {
    add(source, 'SSR:' + page.path, /data-i18n-slot=/.test(source) ? 'rich' : 'text');
  }
}
const inventory = { createdAt: new Date().toISOString(), sourceLanguage: 'en', changed, problems, entries: [...entries.values()] };
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/native-content-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ mode: write ? 'write' : 'preview', templates: changed.length, edits: changed.reduce((total, item) => total + item.edits, 0), entries: entries.size, characters: [...entries.values()].reduce((total, item) => total + item.english.length, 0), problems }));
if (problems.length) process.exitCode = 1;
