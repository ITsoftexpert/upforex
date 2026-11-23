// Offline only. Reuse exact-source translations; never contact a provider.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const u = require('./i18n-release-utils.cjs');
const { provider } = require('./translate-native-catalogs.cjs');
const { reuseText, reuseFinancialTagCase } = require('./reuse-native-text.cjs');
const {effectivePageMetadata}=require('./page-metadata.cjs');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const needsEntryTranslation = entry => u.needsContentTranslation(entry.kind === 'html' ? u.text(u.parseFragment(entry.english)) : entry.english);
function validFreeEvidence(entry,row,cache,language){
  if(typeof row.translation!=='string')return false;
  if(!['validated-google-consumer-local-v1','validated-local-nmt-v1'].includes(cache.provider)||row.validated!==true||row.validation?.model!=='sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42')return false;
  const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  const evidence=row.validation;
  const sourceText=u.normalizeContent(entry.kind==='html'?u.text(u.parseFragment(entry.english)):entry.english);
  if(evidence.sourceSha256!==hash(entry.english)||evidence.targetSha256!==hash(row.translation)||!Number.isFinite(evidence.similarity)||evidence.threshold!==require('./review-free-catalogs.cjs').thresholdFor(sourceText,language))return false;
  if(evidence.method==='cross-language-with-integrity-and-domain-checks'&&evidence.similarity<evidence.threshold)return false;
  if(evidence.method==='cross-language-and-roundtrip-with-integrity-and-domain-checks'){
    const back=evidence.backValidation;
    if(!back?.passed||!Number.isFinite(back.similarity)||back.threshold!==(sourceText.length<50?.92:.90)||back.similarity<back.threshold||back.sourceTargetSha256!==hash(row.translation)||back.sourceEnglishSha256!==hash(entry.english))return false;
    if(typeof back.backTranslation!=='string'||u.validate({english:sourceText,kind:'text'},back.backTranslation,'en').some(problem=>/numeric|placeholder|email|license|Unsafe|artifact/.test(problem))||require('./free-i18n-domain.cjs').financialConsistency(sourceText,back.backTranslation,'en').problems.length)return false;
  }
  if(!['cross-language-with-integrity-and-domain-checks','cross-language-and-roundtrip-with-integrity-and-domain-checks'].includes(evidence.method))return false;
  const domain=require('./free-i18n-domain.cjs'),plain=value=>u.normalizeContent(entry.kind==='html'?u.text(u.parseFragment(value)):value);
  return !domain.financialConsistency(plain(entry.english),plain(row.translation),language).problems.length;
}
function chooseTranslation(entry, language, candidates) {
  const reasons = new Set();
  // A reviewed correction must supersede an older, mechanically valid JSON
  // or machine-cache value. Unreviewed drafts never reach this candidate list.
  const rank=origin=>origin==='reviewed-local'?3:origin.startsWith('existing-json:')?2:origin==='validated-free'?1:0;
  const ordered = [...candidates].sort((left, right) => rank(right.origin)-rank(left.origin));
  for (const row of ordered) {
    if (u.normalizeContent(row.english) !== entry.english) continue;
    const problems = u.validate(entry, row.translation, language);
    if (!problems.length) return { selected: row, reasons };
    problems.forEach(problem => reasons.add(problem));
  }
  return { selected: undefined, reasons };
}
function publishedTranslations(requirements,completedPages,translations){
  return Object.fromEntries(requirements.filter(page=>completedPages[page.path]?.length).map(page=>[page.path,
    Object.fromEntries(completedPages[page.path].map(language=>[language,Object.fromEntries(page.requiredKeys.map(key=>[key,translations[language][key]]))]))]));
}
function main() {
  process.chdir(u.root);
  const write = process.argv.includes('--write');
  const inventory = u.read('tmp/native-content-inventory.json');
  const audit = u.read('tmp/native-page-coverage.json');
  const english = u.read('src/assets/i18n/en.json');
  const sheetMetadata = u.read('scripts/data/seo-metadata.json', { pages: {} });
  if (!inventory?.entries?.length || inventory.problems.length || !audit?.pages?.length || audit.failures?.length) throw new Error('A clean English source inventory and SSR audit are required.');
  const entries = new Map(inventory.entries.map(entry => [entry.key, entry]));
  const allEnglishLeaves = u.leaves(english);
  const globalKeys = new Set(allEnglishLeaves.filter(leaf => !leaf.path.startsWith('IB.') && u.needsContentTranslation(leaf.english)).map(leaf => u.contentKey(leaf.english)));
  // Keep the original index metadata as the English default when a route
  // has no page-specific keywords. It must also have a real translation.
  const indexDocument = u.parse(fs.readFileSync('src/index.html', 'utf8'));
  const defaultKeywords = u.attribute(u.elements(indexDocument, 'meta').find(node => u.attribute(node, 'name') === 'keywords'), 'content');
  if (defaultKeywords) {
    const key = u.contentKey(defaultKeywords);
    if (!entries.has(key)) throw new Error('Extract the original default metadata before generating catalogs');
    globalKeys.add(key);
  }
  for (const entry of inventory.entries) if (u.needsContentTranslation(entry.english) && entry.sources.some(source => source.startsWith('src/app/layouts/') && (source.endsWith('.html') || /\.ts#(?:title|name)$/.test(source)) && !source.includes('admin-navbar'))) globalKeys.add(entry.key);
  const definitions = u.pageDefinitions();
  const audited = new Map(audit.pages.map(page => [page.path, page]));
  const requirements = definitions.map(definition => {
    const rendered = audited.get(definition.path);
    if (!rendered || rendered.language !== 'en' || rendered.missingKeys.length) throw new Error('English SSR audit missing: ' + definition.path);
    const keys = new Set([...globalKeys, ...rendered.usedKeys].filter(key => entries.has(key) && needsEntryTranslation(entries.get(key))));
    // The final Angular router title can differ from the component's initial
    // title. Include the unchanged route literal even when an older English
    // audit ran before that final title update.
    if (definition.routeTitle && u.needsContentTranslation(definition.routeTitle)) {
      const key = u.contentKey(definition.routeTitle);
      if (!entries.has(key)) throw new Error('Extract the final route title: ' + definition.path);
      keys.add(key);
    }
    for (const entry of inventory.entries) if (needsEntryTranslation(entry) && entry.sources.some(source => source.startsWith('src/') && path.posix.dirname(source.split('#')[0]) === definition.directory)) keys.add(entry.key);
    // A CMS listing/recommendation may display any current article's metadata.
    if (definition.cms || definition.path === '/blogs') for (const entry of inventory.entries) if (needsEntryTranslation(entry) && entry.sources.some(source => source.startsWith('CMS:') && !source.endsWith('#content'))) keys.add(entry.key);
    for (const key of keys) if (!entries.has(key)) throw new Error('Re-extract the source after its SSR audit: ' + key);
    return { ...definition, requiredKeys: [...keys].sort() };
  });
  const translations = {};
  const missingByLanguage = {};
  const provenance = {};
  const ibComplete = {};
  for (const language of u.languages) {
    const existing = u.read(`src/assets/i18n/${language}.json`, {});
    const pairs = new Map();
    for (const leaf of allEnglishLeaves) {
      const target = u.get(existing, leaf.path);
      if (typeof target === 'string') pairs.set(u.contentKey(leaf.english), { english: u.normalizeContent(leaf.english), translation: target, origin: 'existing-json:' + leaf.path });
    }
    const caches = [
      ['reviewed-local', { entries: u.read('scripts/i18n-reviewed-translations.json', {})[language] || {} }],
      ['reviewed-local', u.read(`tmp/reviewed-native-translations/${language}.json`, {})],
      ['validated-free',u.read(`scripts/i18n-validated-translations/${language}.json`,{})],
      ['official-api', u.read(`tmp/google-native-translations/${language}.json`, {})],
      ['existing-local-cache', u.read(`tmp/native-translations/${language}.json`, {})],
    ];
    const accepted = {};
    const missing = [];
    const origins = {};
    for (const entry of inventory.entries) {
      if (!needsEntryTranslation(entry)) { accepted[entry.key] = entry.english; continue; }
      const candidates = [];
      const pair = pairs.get(entry.key);
      if (pair) candidates.push(pair);
      for (const [origin, cache] of caches) {
        const row = cache.entries?.[entry.key];
        if (!row || row.english !== entry.english) continue;
        if (origin === 'official-api' && cache.provider !== provider) continue;
        if (origin === 'reviewed-local' && row.reviewed !== true) continue;
        if (origin === 'validated-free' && !validFreeEvidence(entry,row,cache,language)) continue;
        // Old protected-number batches are held unless the only numeric tokens
        // belong to the MT5 product name. Do not silently reuse affected offers.
        if (origin === 'existing-local-cache' && cache.generationVersion < 4 && /\d|\b(?:lots?|pips?)\b/i.test(entry.english.replace(/\bMT5\b|MetaTrader 5/gi, ''))) continue;
        candidates.push({ ...row, origin });
      }
      const { selected, reasons } = chooseTranslation(entry, language, candidates);
      if (selected) { accepted[entry.key] = selected.translation; origins[selected.origin] = (origins[selected.origin] || 0) + 1; }
      else missing.push({ key: entry.key, english: entry.english, kind: entry.kind, sources: entry.sources, reasons: reasons.size ? [...reasons] : ['Missing validated exact-source translation'] });
    }
    const reused = reuseText(inventory.entries, accepted, language);
    Object.assign(accepted, reused);
    if (Object.keys(reused).length) origins['reused-exact-text'] = Object.keys(reused).length;
    const tags=reuseFinancialTagCase(inventory.entries,accepted,language);
    Object.assign(accepted,tags);
    if(Object.keys(tags).length)origins['reused-reviewed-financial-tag-case']=Object.keys(tags).length;
    translations[language] = accepted;
    missingByLanguage[language] = missing.filter(entry => typeof accepted[entry.key] !== 'string');
    provenance[language] = origins;
    ibComplete[language] = allEnglishLeaves.filter(leaf => leaf.path.startsWith('IB.') && u.needsContentTranslation(leaf.english)).every(leaf => typeof accepted[u.contentKey(leaf.english)] === 'string');
  }
  const traditionalReuse=require('./reuse-chinese-script.cjs').reuseTraditionalChinese(inventory.entries,
    translations['zh-CN'],translations['zh-TW'],u.read('scripts/i18n-derived-translations/zh-TW.json',{}));
  Object.assign(translations['zh-TW'],traditionalReuse);
  missingByLanguage['zh-TW']=missingByLanguage['zh-TW'].filter(entry=>typeof translations['zh-TW'][entry.key]!=='string');
  if(Object.keys(traditionalReuse).length)provenance['zh-TW']['reused-validated-chinese-script']=Object.keys(traditionalReuse).length;
  const completedPages = {};
  const pageReports = [];
  for (const definition of requirements) {
    const byLanguage = {};
    for (const language of u.languages) {
      const missingKeys = definition.requiredKeys.filter(key => typeof translations[language][key] !== 'string');
      const metadataComplete=!sheetMetadata.pages[definition.path]?.en||!!effectivePageMetadata(definition.path,language,sheetMetadata);
      byLanguage[language] = { complete: !missingKeys.length&&metadataComplete, missingKeys, metadataComplete };
      if (!missingKeys.length&&metadataComplete) (completedPages[definition.path] ||= []).push(language);
    }
    pageReports.push({ ...definition, languages: byLanguage });
  }
  // A draft for an incomplete article must not invalidate every published
  // catalog and the browser bundle. Hash only translations that can ship.
  const publishedHeads=Object.fromEntries(requirements.filter(page=>completedPages[page.path]?.length||sheetMetadata.pages[page.path]?.en).map(page=>[page.path,
    Object.fromEntries(['en',...(completedPages[page.path]||[])].map(language=>[language,effectivePageMetadata(page.path,language,sheetMetadata)]))]));
  const version = digest({ english: allEnglishLeaves, requirements, translations:publishedTranslations(requirements,completedPages,translations), sheetMetadata, publishedHeads }).slice(0, 20);
  const sourceFingerprint = digest(inventory.entries.map(({ key, english, kind }) => ({ key, english, kind })));
  const payloads = [];
  const chunks = [];
  for (const definition of requirements) {
    const completed = completedPages[definition.path] || [];
    if (!completed.length && !sheetMetadata.pages[definition.path]?.en) continue;
    for (const language of ['en', ...completed]) {
      const COPY = language === 'en' ? {} : Object.fromEntries(definition.requiredKeys.map(key => [key, translations[language][key]]));
      const chunk = { __nativeI18nVersion: version, __nativePage: definition.path, __nativeSourceKeys: definition.requiredKeys, COPY };
      const metadata = effectivePageMetadata(definition.path,language,sheetMetadata);
      if (metadata) chunk.__nativeMetadata = metadata;
      const relative = `src/assets/i18n/native/${version}/${language}/${u.contentKey(definition.path)}.json`;
      const bytes = Buffer.from(JSON.stringify(chunk));
      chunks.push({ relative, bytes });
      payloads.push({ page: definition.path, language, rawBytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length });
    }
  }
  const missingReport = { createdAt: new Date().toISOString(), version, sourceFingerprint, sourceEntries: entries.size,
    sourceLanguage: 'en', paidRequestsMade: 0,
    languages: Object.fromEntries(u.languages.map(language => [language, { reusedEntries: Object.keys(translations[language]).length, missingEntries: missingByLanguage[language].length,
      missingCharacters: missingByLanguage[language].reduce((sum, entry) => sum + [...entry.english].length, 0), ibCatalogComplete: ibComplete[language], provenance: provenance[language], missing: missingByLanguage[language] }])) };
  const report = { createdAt: new Date().toISOString(), version, sourceFingerprint, mode: write ? 'generated-local-validated-catalogs' : 'check-only',
    requiredLanguages: u.languages, publicPages: requirements.length, declaredCompletedCombinations: Object.values(completedPages).reduce((sum, list) => sum + list.length, 0),
    completedPages, pages: pageReports, payloads, sitewideNativeTranslationComplete: requirements.every(page => (completedPages[page.path] || []).length === 10),
    renderedContentVerificationComplete: false, releaseReady: false, note: 'Only complete exact-source catalogs qualify. Strict initial HTML verification is a separate required release gate; no English fallback counts as translated.' };
  fs.writeFileSync('tmp/missing-translations.json', JSON.stringify(missingReport, null, 2) + '\n');
  fs.writeFileSync('tmp/i18n-coverage-report.json', JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync('tmp/native-catalog-validation.json', JSON.stringify({ ...report, pages: undefined }, null, 2) + '\n');
  // Reusable, provider-independent validated memory, outside shipped assets.
  for (const language of u.languages) {
    const directory = 'tmp/validated-native-translations'; fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(`${directory}/${language}.json`, JSON.stringify({ language, sourceFingerprint, COPY: translations[language] }) + '\n');
  }
  console.log(JSON.stringify({ version, publicPages: requirements.length, completedCombinations: report.declaredCompletedCombinations,
    languages: Object.fromEntries(u.languages.map(language => [language, { reused: Object.keys(translations[language]).length, missing: missingByLanguage[language].length, ibCatalogComplete: ibComplete[language] }])),
    largestPageCatalogGzipBytes: Math.max(0, ...payloads.map(payload => payload.gzipBytes)), releaseReady: false }, null, 2));
  if (!write) return;
  for (const chunk of chunks) { fs.mkdirSync(path.dirname(chunk.relative), { recursive: true }); fs.writeFileSync(chunk.relative, chunk.bytes); }
  for (const language of u.languages) {
    const base = u.read(`src/assets/i18n/${language}.json`, {});
    const mapEnglish = value => {
      if (typeof value === 'string') return translations[language][u.contentKey(value)] || value;
      if (Array.isArray(value)) return value.map(mapEnglish);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('__') && key !== 'COPY').map(([key, child]) => [key, mapEnglish(child)]));
      return value;
    };
    const output = { ...base, ...mapEnglish(english) };
    delete output.COPY;
    for (const key of Object.keys(output)) if (key.startsWith('__')) delete output[key];
    output.__nativeI18nVersion = version;
    fs.writeFileSync(`src/assets/i18n/${language}.json`, JSON.stringify(output, null, 2) + '\n');
  }
  const completedLanguages = u.languages.filter(language => requirements.every(page => (completedPages[page.path] || []).includes(language)));
  fs.writeFileSync('src/app/core/config/i18n-coverage.ts', '// Generated offline from validated existing translations and English source requirements.\n' +
    `export const NATIVE_I18N_VERSION = ${JSON.stringify(version)};\n` +
    `export const DEFAULT_PUBLIC_KEYWORDS = ${JSON.stringify(defaultKeywords || '')};\n` +
    `export const COMPLETED_NATIVE_LANGUAGES: readonly string[] = ${JSON.stringify(completedLanguages)};\n` +
    `export const ENGLISH_METADATA_ONLY_PAGES: readonly string[] = ${JSON.stringify(requirements.filter(page=>!completedPages[page.path]?.length&&sheetMetadata.pages[page.path]?.en).map(page=>page.path))};\n` +
    `export const COMPLETED_NATIVE_PAGES: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(completedPages, null, 2)};\n`);
}
module.exports = { main, chooseTranslation, needsEntryTranslation,validFreeEvidence,publishedTranslations };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
