// Free, fully local reverse-NMT evidence. No translation endpoint or paid API.
// Failed checks stay in the queue; this tool never publishes page completion.
const fs = require('node:fs');
const crypto = require('node:crypto');
const u = require('./i18n-release-utils.cjs');
const {startWorker} = require('./translate-offline-catalogs.cjs');
const {worker, plain, model} = require('./review-free-catalogs.cjs');
const {normalizeNumbers} = require('./free-i18n-normalization.cjs');
const {financialConsistency} = require('./free-i18n-domain.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--languages=/.test(arg) && arg !== '--cache-only')) throw new Error('Use --languages=hi,ar and optional --cache-only');
  const languages = args.find(arg => arg.startsWith('--languages='))?.slice(12).split(',') || u.languages;
  if (new Set(languages).size !== languages.length || languages.some(language => !u.languages.includes(language))) throw new Error('Unsupported/duplicate language');
  const coverage = u.read('tmp/i18n-coverage-report.json');
  const models = u.read('tmp/offline-i18n/reverse-models.json', {});
  const scorer = worker();
  try {
    for (const language of languages) {
      const spec = models[language];
      if (!spec) throw new Error('Local reverse model missing: ' + language);
      const file = 'tmp/free-native-review/' + language + '.json';
      const review = u.read(file);
      if (review.model !== model) throw new Error('Current source/target review required');
      const required = new Set(coverage.pages.flatMap(page => page.requiredKeys));
      const cacheFile = 'tmp/offline-native-back/' + language + '.json';
      const cache = u.read(cacheFile, {provider: 'argos-local-reverse-v1', language, entries: {}});
      fs.mkdirSync('tmp/offline-native-back', {recursive: true});
      const candidates = Object.entries(review.entries).filter(([key, row]) => required.has(key) &&
        ['requires-roundtrip', 'requires-bilingual-review'].includes(row.status)).map(([key, row]) => ({key, row, cacheKey: hash(row.english + '\0' + row.translation + '\0' + spec.archiveSha256)}));
      const rows = args.includes('--cache-only') ? candidates.filter(item => cache.entries[item.cacheKey]) : candidates;
      const translator = args.includes('--cache-only') ? undefined : startWorker(language, true);
      console.log(JSON.stringify({language, pending: rows.length, localOnly: true, paidRequests: 0}));
      try {
        for (let start = 0; start < rows.length; start += 24) {
          const batch = rows.slice(start, start + 24);
          const pending = batch.filter(item => !cache.entries[item.cacheKey]);
          if (pending.length) {
            const response = await translator.request(pending.map(item => plain(item.row.translation, item.row.kind)));
            if (response.translations?.length !== pending.length) throw new Error('Reverse result count mismatch');
            pending.forEach((item, index) => {
              cache.entries[item.cacheKey] = {sourceEnglishSha256: hash(item.row.english), sourceTargetSha256: hash(item.row.translation), modelArchiveSha256: spec.archiveSha256, backTranslation: response.translations[index]};
            });
            fs.writeFileSync(cacheFile + '.writing', JSON.stringify(cache, null, 2) + '\n');
            fs.renameSync(cacheFile + '.writing', cacheFile);
          }
          const usable = batch.filter(item => typeof cache.entries[item.cacheKey].backTranslation === 'string');
          const back = usable.map(item => normalizeNumbers(plain(item.row.english, item.row.kind), cache.entries[item.cacheKey].backTranslation, 'en'));
          // Reuse a real pinned-model score only for the exact same source,
          // target, reverse model and normalized English reverse output. All
          // current number/denial guards below still run again on every row.
          const scores=usable.map((item,index)=>{
            const prior=item.row.backValidation;
            return Number.isFinite(prior?.similarity)&&prior.sourceEnglishSha256===hash(item.row.english)&&prior.sourceTargetSha256===hash(item.row.translation)&&
              prior.modelArchiveSha256===spec.archiveSha256&&prior.backTranslation===back[index]?prior.similarity:undefined;
          });
          const pendingScores=usable.map((item,index)=>({item,index})).filter(({index})=>scores[index]===undefined);
          if(pendingScores.length){
            const fresh=await scorer.score(pendingScores.map(({item,index})=>[plain(item.row.english,item.row.kind),back[index]]));
            pendingScores.forEach(({index},offset)=>scores[index]=fresh[offset]);
          }
          usable.forEach((item, index) => {
            const source = plain(item.row.english, item.row.kind), threshold = source.length < 50 ? .92 : .90;
            const problems = [...u.validate({english: source, kind: 'text'}, back[index], 'en').filter(problem => /numeric|placeholder|email|license|Unsafe|artifact/.test(problem)), ...financialConsistency(source, back[index], 'en').problems];
            const passed = scores[index] >= threshold && !problems.length;
            item.row.backValidation = {method: 'reverse-NMT-plus-English-semantic-and-value-checks', provider: cache.provider, modelArchiveSha256: spec.archiveSha256,
              sourceEnglishSha256: hash(item.row.english), sourceTargetSha256: hash(item.row.translation), backTranslation: back[index], similarity: scores[index], threshold, problems, passed, humanReviewed: false};
            item.row.status = passed ? 'roundtrip-semantic-pass' : 'requires-bilingual-review';
          });
          review.checkedAt = new Date().toISOString();
          fs.writeFileSync(file + '.writing', JSON.stringify(review, null, 2) + '\n');
          fs.renameSync(file + '.writing', file);
          console.log(`${language}: ${Math.min(start + 24, rows.length)}/${rows.length} local reverse checks; no network inference`);
        }
      } finally {if (translator) await translator.close();}
    }
  } finally {await scorer.close();}
}
if (require.main === module) main().catch(error => {console.error(error);process.exitCode = 1;});
