const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse, parseFragment, serialize } = require('parse5');
const { contentKey, normalizeContent, needsContentTranslation, translationProblems, text } = require('./i18n-utils.cjs');
const root = path.resolve(__dirname, '..');
const blogPermalinks = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/core/config/blog-permalinks.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText)(blogPermalinks);
const legacySeo = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/core/config/legacy-seo-redirects.ts'), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText)(legacySeo);
const languages = ['hi', 'ar', 'fr', 'es', 'de', 'zh-CN', 'zh-TW', 'ja', 'pt', 'ru'];
const prefixes = { hi: 'hi', ar: 'ar', fr: 'fr', es: 'es', de: 'de', 'zh-CN': 'zh-cn', 'zh-TW': 'zh-tw', ja: 'ja', pt: 'pt', ru: 'ru' };
const read = (file, fallback) => require('./read-release-input.cjs').readReleaseInput(root, file, fallback, () => coverage().NATIVE_I18N_VERSION);
function coverage() {
  const result = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'src/app/core/config/i18n-coverage.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(result);
  return result;
}
function elements(node, name) { return [...(node.tagName === name ? [node] : []), ...(node.childNodes || []).flatMap(child => elements(child, name))]; }
function attribute(node, name) { return node.attrs?.find(item => item.name === name)?.value; }
function pageDefinitions(snapshot = read('tmp/english-blog-api.json', { data: [] })) {
  const modules = [ ['', 'components-routing.module.ts'], ['products', 'products/products-routing.module.ts'], ['accounts', 'account/account-routing.module.ts'], ['partnerships', 'partnership/partnership-routing.module.ts'], ['platforms', 'platforms/platform-routing.module.ts'], ['resources', 'resources/resources-routing.module.ts'], ['resources/tools', 'resources/tools/tools-routing.module.ts'] ];
  const pages = new Map();
  for (const [prefix, filename] of modules) {
    const fullPath = path.join(root, 'src/app/components', filename);
    const source = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, 'utf8'), ts.ScriptTarget.Latest, true);
    const imports = new Map();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
      for (const name of statement.importClause.namedBindings.elements) imports.set(name.name.text, path.resolve(path.dirname(fullPath), statement.moduleSpecifier.text) + '.ts');
    }
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'routes' && ts.isArrayLiteralExpression(node.initializer)) {
        for (const route of node.initializer.elements) {
          if (!ts.isObjectLiteralExpression(route)) continue;
          const fields = Object.fromEntries(route.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(source), property.initializer]));
          if (!fields.component || !fields.path || !ts.isStringLiteral(fields.path) || /[:*]/.test(fields.path.text)) continue;
          const page = '/' + [prefix, fields.path.text].filter(Boolean).join('/');
          const componentFile = imports.get(fields.component.getText(source));
          if (!componentFile || !fs.existsSync(componentFile)) throw new Error('Cannot resolve public component: ' + page);
          const component = fs.readFileSync(componentFile, 'utf8');
          const selector = /selector:\s*['"]([^'"]+)/.exec(component)?.[1];
          if (!selector) throw new Error('Cannot resolve public selector: ' + page);
          pages.set(page, { path: page, selector, component: path.relative(root, componentFile).replace(/\\/g, '/'), directory: path.relative(root, path.dirname(componentFile)).replace(/\\/g, '/'),
            routeTitle: fields.title && ts.isStringLiteralLike(fields.title) ? fields.title.text : undefined });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  // Angular encodes each stored permalink as a single segment; do not rename it.
  const segment = value => encodeURIComponent(value).replace(/%(?:40|3A|24|2C|26)/gi, decodeURIComponent).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const articles = Array.isArray(snapshot.data) ? snapshot.data : snapshot.data?.blogs || [];
  for (const article of articles) if (article.permaLink) {
    const page = '/blogs/' + segment(blogPermalinks.publicBlogPermalink(article.permaLink));
    pages.set(page, { path: page, selector: 'app-blogs', component: 'src/app/components/blogs/blogs.component.ts', directory: 'src/app/components/blogs', cms: true });
  }
  if (!articles.length) {
    // Ignored audit files are absent on a fresh checkout. Do not accidentally
    // shrink a 110-page release gate to 50 pages and overlook all CMS URLs.
    const file = path.join(root, 'src/server/public-sitemap-pages.ts');
    if (!fs.existsSync(file)) throw new Error('Current CMS snapshot or generated CMS route inventory required');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let paths;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'PUBLIC_CMS_SITEMAP_PATHS' && ts.isArrayLiteralExpression(node.initializer)) {
        paths = node.initializer.elements.map(element => {
          if (!ts.isStringLiteralLike(element) || !element.text.startsWith('/blogs/') || /[?#]/.test(element.text)) throw new Error('Invalid generated CMS route');
          return element.text;
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (!paths) throw new Error('Generated CMS route inventory missing');
    for (const page of paths) pages.set(page, { path: page, selector: 'app-blogs', component: 'src/app/components/blogs/blogs.component.ts', directory: 'src/app/components/blogs', cms: true });
  }
  return [...pages.values()];
}
function leaves(value, prefix = '') {
  if (typeof value === 'string') return [{ path: prefix, english: value }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([key]) => !key.startsWith('__') && key !== 'COPY').flatMap(([key, child]) => leaves(child, prefix ? prefix + '.' + key : key));
}
function get(value, key) { return key.split('.').reduce((item, part) => item?.[part], value); }
const scriptByLanguage = { hi: /[\u0900-\u097f]/, ar: /[\u0600-\u06ff]/, ru: /[\u0400-\u052f]/, ja: /[\u3040-\u30ff\u3400-\u9fff]/, 'zh-CN': /[\u3400-\u9fff]/, 'zh-TW': /[\u3400-\u9fff]/ };
const sharedWords = new Set(['forex', 'metatrader', 'metatrader 5', 'upforex ltd', 'pro-ecn', 'elite-ecn', 'standard', 'demo', 'login', 'trading', 'crypto', 'contact', 'support', 'premium', 'email',
  // These individual borrowed terms and place names legitimately have the
  // same spelling in the supported Latin-script locales. This never exempts
  // an English sentence, paragraph or whole page from translation checks.
  'blogs', 'finfluencer', 'social trading', 'manila', 'nairobi', 'johannesburg', 'mauritius', 'kuala lumpur']);
const localeHomographs = {
  fr: new Set(['introduction','conclusion','description','actions','message','indices','faq','pip','pips','commission','instrument','instruments','inflation','concept','type','mini','micro','flexible','diversification','palladium','doji','0.01 lot','0* pips','nairobi, kenya','kenya','trump','dragon']),
  de: new Set(['definition','faq','faqs','pip','pips','instrument','margin','inflation','gold','palladium','index','broker','spread','spreads','scalper','mini','micro','doji','stop-loss','0.01 lot','0* pips','dubai','abu dhabi','pretoria','trump']),
  es: new Set(['pip','pips','mini','micro','no','0* pips','sharjah','pretoria','trump']), pt: new Set(['pip','pips','micro','0* pips','dubai','trump']),
};
// These are exact neighbourhood/city endonyms used as standalone location
// labels in the site's existing country pages. English prose is never waived.
const latinPlaceEndonyms=new Set(['Al Khalidiyah','Al Raha','Al Ain','Ajman','Ras Al Khaimah','Fujairah','Mussafah','Century City','Stellenbosch','Paarl','George','Gqeberha','Bloemfontein','Polokwane','Mbombela','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Machakos','Kiambu','Woodstock','Claremont','Bellville','Durbanville','Rondebosch','Sandton','Rosebank','Fourways','Randburg','Midrand','Braamfontein','Soweto','Roodepoort','Parktown','Westlands','Kilimani','Parklands','Karen','Lavington','Gigiri','Eastleigh','Embakasi','Upper Hill','Sea Point','Green Point','Khalifa City','Masdar City','Durban']);
const preserveLatinPlaceLabel=(value,language)=>['fr','es','de','pt'].includes(language)&&latinPlaceEndonyms.has(value);
for(const city of ['sydney','tokyo','new york'])localeHomographs.fr.add(city);
for(const city of ['sydney','london','new york'])localeHomographs.de.add(city);
// Drawdown is the established German financial term, not a translated
// withdrawal. This exact label never exempts a surrounding English sentence.
localeHomographs.de.add('drawdown');
localeHomographs.de.add('hammer');
// Lot and pip are also the actual French/German financial unit names. An
// unchanged arithmetic expression contains no English prose to translate.
function localeFinancialNotation(value,language){
  if(['es','pt'].includes(language)&&/\d/.test(value))return !value.replace(/\bpips?\b/gi,'').replace(/[\d\s.,+−\-*/×÷=():%$€£¥]/g,'');
  if(!['fr','de'].includes(language)||!/[0-9]/.test(value))return false;
  return !value.replace(/\bmini\s+(?=lots?\b)/gi,'').replace(/\b(?:lots?|pips?)\b/gi,'').replace(/\b[A-Z]{3}\b/g,'').replace(/[\d\s.,+−\-*/×÷=():%$€£¥]/g,'');
}
function untranslatedPassages(source, target) {
  // International company/ticker names are identifiers, not English prose.
  const names = /\b(?:Abu Dhabi Global Market Financial Services Regulatory Authority|Capital Market Authority|Dubai Financial Services Authority|Securities and Commodities Authority|Financial Sector Conduct Authority|Australian Securities and Investments Commission|Financial Conduct Authority|Financial Services Commission|Apple|AAPL|Amazon|AMZN|Tesla|TSLA|Microsoft|MSFT|Google|GOOGL)\b/gi;
  // Keep the exact published postal location as an identifier. This does not
  // exempt the surrounding disclaimer, registration numbers or English prose.
  const postalLocation=/\bGIFT SEZ, Gift City, Gandhinagar, Gujarat, India\b/g;
  const phrases = value => value.replace(names, '\u2603').replace(postalLocation,'\u2603').split(/[^\x00-\x7f\u00c0-\u024f]+/).flatMap(run => {
    const words = run.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
    return Array.from({ length: Math.max(0, words.length - 7) }, (_, index) => words.slice(index, index + 8).join(' '));
  });
  const english = new Set(phrases(source));
  return [...new Set(phrases(target).filter(phrase => english.has(phrase)))];
}
function validate(entry, target, language) {
  const problems = translationProblems(entry, target);
  if (problems.length) return problems;
  const sourceText = normalizeContent(entry.kind === 'html' ? text(parseFragment(entry.english)) : entry.english);
  const targetText = normalizeContent(entry.kind === 'html' ? text(parseFragment(target)) : target);
  if (/\bthe\s+the\s+atheth\b/i.test(targetText)) problems.push('Unresolved machine translation artifact');
  if (!needsContentTranslation(sourceText) && sourceText === targetText) return problems;
  if(sourceText.toLowerCase()===targetText.toLowerCase()&&localeFinancialNotation(sourceText,language))return problems;
  if(sourceText===targetText&&['fr','de'].includes(language)&&/^Position [A-Z]$/.test(sourceText))return problems;
  const homograph = sharedWords.has(sourceText.toLowerCase()) && !scriptByLanguage[language] || localeHomographs[language]?.has(sourceText.toLowerCase()) || ['fr','es','de','pt'].includes(language)&&latinPlaceEndonyms.has(sourceText);
  if (sourceText.toLowerCase() === targetText.toLowerCase() && !homograph) problems.push('Untranslated English');
  if (untranslatedPassages(sourceText, targetText).length) problems.push('Untranslated English passage');
  if (scriptByLanguage[language] && !scriptByLanguage[language].test(targetText) && needsContentTranslation(sourceText) && !/^(?:UPFOREX(?: LTD)?|MetaTrader(?: 5)?|Pro-ECN|Elite-ECN)$/i.test(sourceText)) problems.push('Missing target-language script');
  return problems;
}
module.exports = { root, languages, prefixes, read, coverage, elements, attribute, pageDefinitions, leaves, get, validate, untranslatedPassages, parse, parseFragment, serialize, contentKey, normalizeContent, needsContentTranslation, text,preserveLatinPlaceLabel,...blogPermalinks,...legacySeo };
