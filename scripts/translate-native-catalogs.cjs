// Offline catalog generation. Never imported by the Angular application.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { decodeHTML } = require('entities');
const { contentKey, translationProblems } = require('./i18n-utils.cjs');

const root = path.resolve(__dirname, '..');
const languages = ['hi', 'ar', 'fr', 'es', 'de', 'zh-CN', 'zh-TW', 'ja', 'pt', 'ru'];
const provider = 'google-cloud-translation-basic-v2-nmt';
const endpoint = 'https://translation.googleapis.com/language/translate/v2';
const count = value => [...value].length;
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function responseProblems(entry, translated, language) {
  const { needsContentTranslation } = require('./i18n-utils.cjs');
  return needsContentTranslation(entry.english)
    ? require('./i18n-release-utils.cjs').validate(entry, translated, language)
    : translationProblems(entry, translated);
}
function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}
function loadLocalEnvironment() {
  // Only these two names are consumed. Never evaluate shell code or log values.
  for (const name of ['.env.translation.local', '.env.local']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^(GOOGLE_TRANSLATE_API_KEY|TRANSLATION_MAX_CHARACTERS)\s*=\s*(.*?)\s*$/.exec(line.trim());
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
}
function batches(entries) {
  const result = [];
  let batch = [];
  let size = 0;
  for (const entry of entries) {
    const length = count(entry.english);
    if (Buffer.byteLength(JSON.stringify([entry.english])) > 90000) throw new Error(`Source message too large: ${entry.key}`);
    // Google recommends small requests. Each request uses one source format.
    if (batch.length && (batch.length >= 100 || size + length > 5000 || batch[0].kind !== entry.kind)) {
      result.push(batch); batch = []; size = 0;
    }
    batch.push(entry); size += length;
  }
  if (batch.length) result.push(batch);
  return result;
}
function buildPlan(inventory, selected, outputDir, validatedDir) {
  const source = inventory.entries;
  if (inventory.problems?.length || !source.length) throw new Error('Source inventory must pass extraction first');
  const seen = new Set();
  for (const entry of source) {
    if (contentKey(entry.english) !== entry.key || seen.has(entry.key)) throw new Error(`Invalid or duplicate source key: ${entry.key}`);
    seen.add(entry.key);
  }
  const jobs = selected.map(language => {
    const file = path.join(outputDir, language + '.json');
    const previous = readJson(file, {});
    const cache = previous.provider === provider ? previous : { provider, language, entries: {}, rejected: {} };
    // Reuse offline validated translations before estimating/requesting work.
    // A key alone is insufficient: the memory must match this exact inventory.
    const memory = validatedDir ? readJson(path.join(validatedDir, language + '.json'), {}) : {};
    const sourceFingerprint = fingerprint(source.map(({ key, english, kind }) => ({ key, english, kind })));
    if (memory.sourceFingerprint === sourceFingerprint) {
      const { validate } = require('./i18n-release-utils.cjs');
      cache.entries ||= {};
      for (const entry of source) if (typeof memory.COPY?.[entry.key] === 'string' &&
        (!require('./i18n-utils.cjs').needsContentTranslation(entry.english) || !validate(entry, memory.COPY[entry.key], language).length)) {
        cache.entries[entry.key] = { english: entry.english, translation: memory.COPY[entry.key], origin: 'validated-offline-reuse' };
      }
    }
    const valid = source.filter(entry => {
      const row = cache.entries?.[entry.key];
      return row?.english === entry.english && !responseProblems(entry, row.translation, language).length;
    });
    const validKeys = new Set(valid.map(entry => entry.key));
    const held = source.filter(entry => !validKeys.has(entry.key) && cache.rejected?.[entry.key]?.english === entry.english);
    const heldKeys = new Set(held.map(entry => entry.key));
    // Identical NMT requests do not repair a rejected translation. Keep it for
    // review instead of charging for it again on every resume.
    const pending = source.filter(entry => !validKeys.has(entry.key) && !heldKeys.has(entry.key));
    return { language, file, cache, pending, heldEntries: held.length, batches: batches(pending), cachedEntries: valid.length,
      characters: pending.reduce((sum, entry) => sum + count(entry.english), 0) };
  });
  const characters = jobs.reduce((sum, job) => sum + job.characters, 0);
  const summary = {
    provider, sourceLanguage: 'en', sourceFingerprint: fingerprint(source.map(({ key, english, kind }) => ({ key, english, kind }))),
    sourceEntries: source.length, selectedLanguages: selected, charactersToSend: characters,
    estimatedUsdBeforeCreditsAndTaxes: Number((characters * 20 / 1000000).toFixed(2)),
    estimateDate: '2026-11-18', pricingUrl: 'https://cloud.google.com/products/translate/pricing',
    estimateNote: 'NMT list price $20 per million input code points. Account credits, taxes, exchange rates and reruns are excluded. HTML markup is billable.',
    languages: jobs.map(job => ({ language: job.language, cachedEntries: job.cachedEntries, pendingEntries: job.pending.length,
      heldEntries: job.heldEntries,
      characters: job.characters, requests: job.batches.length })),
  };
  return { jobs, summary };
}
function save(file, value) {
  const temporary = file + '.writing';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}
async function main() {
  process.chdir(root);
  const args = process.argv.slice(2);
  const allowed = arg => ['--execute', '--dry-run'].includes(arg) || /^--(?:languages|max-characters)=/.test(arg);
  if (args.some(arg => !allowed(arg))) throw new Error('Use --dry-run, --execute, --languages=hi,ar or --max-characters=N');
  loadLocalEnvironment();
  const limit = Number(args.find(arg => arg.startsWith('--max-characters='))?.split('=')[1] ?? process.env.TRANSLATION_MAX_CHARACTERS ?? 0);
  if (args.includes('--execute') && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new Error('No requests made. An approved positive total character limit is required before paid execution.');
  }
  const selected = args.find(arg => arg.startsWith('--languages='))?.split('=')[1].split(',') || languages;
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(language => !languages.includes(language))) throw new Error('Unsupported or duplicate language');
  const inventory = readJson(path.join(root, 'tmp/native-content-inventory.json'), null);
  if (!inventory) throw new Error('Run npm run i18n:extract first');
  const outputDir = path.join(root, 'tmp/google-native-translations');
  fs.mkdirSync(outputDir, { recursive: true });
  const { jobs, summary } = buildPlan(inventory, selected, outputDir, path.join(root, 'tmp/validated-native-translations'));
  const usageFile = path.join(root, 'tmp/native-translation-usage.json');
  const previousUsage = readJson(usageFile, {});
  const previouslyAttempted = previousUsage.provider === provider ? Number(previousUsage.attemptedCharacters || 0) : 0;
  if (!Number.isSafeInteger(previouslyAttempted) || previouslyAttempted < 0) throw new Error('Invalid local usage ledger; check project usage before proceeding.');
  summary.previouslyAttemptedCharacters = previouslyAttempted;
  save(path.join(root, 'tmp/native-translation-plan.json'), { ...summary, createdAt: new Date().toISOString(),
    apiKeyConfigured: !!process.env.GOOGLE_TRANSLATE_API_KEY,
    configuredCharacterLimit: Number(process.env.TRANSLATION_MAX_CHARACTERS || 0),
    paidRequestsMade: previousUsage.provider === provider ? Number(previousUsage.requests || 0) : 0 });
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (!args.includes('--execute')) { process.stdout.write('Dry run only. No network request or catalog publication.\n'); return; }
  if (!summary.charactersToSend) { process.stdout.write('No new API requests needed. Review held entries and verify catalogs.\n'); return; }
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) throw new Error('Configure GOOGLE_TRANSLATE_API_KEY locally. Never put it in src/ or chat.');
  if (!Number.isSafeInteger(limit) || limit <= 0 || previouslyAttempted + summary.charactersToSend > limit) {
    throw new Error(`No requests made. Approve a total character limit covering prior attempts plus this plan (${previouslyAttempted + summary.charactersToSend}).`);
  }
  let attemptedCharacters = previouslyAttempted;
  let requests = previousUsage.provider === provider ? Number(previousUsage.requests || 0) : 0;
  // Sequential, restartable requests. Stop on errors/429; never bypass a quota
  // or automatically retry an uncertain paid request.
  for (const job of jobs) {
    job.cache.rejected ||= {};
    job.cache.entries ||= {};
    job.cache.sourceFingerprint = summary.sourceFingerprint;
    for (const batch of job.batches) {
      const batchCharacters = batch.reduce((sum, entry) => sum + count(entry.english), 0);
      if (attemptedCharacters + batchCharacters > limit) throw new Error('Approved character limit reached');
      const body = JSON.stringify({ q: batch.map(entry => entry.english), source: 'en', target: job.language,
        format: batch[0].kind === 'html' ? 'html' : 'text', model: 'nmt' });
      if (Buffer.byteLength(body) > 95000) throw new Error('Request exceeds the conservative API size limit');
      attemptedCharacters += batchCharacters; requests++;
      // Reserve the attempt before sending. A timeout is not proof of zero
      // billing; a resumed run must still respect the total approved cap.
      save(usageFile, { provider, startedPlan: summary.sourceFingerprint, attemptedCharacters, requests,
        approvedCharacterLimit: limit, status: 'request-attempted', updatedAt: new Date().toISOString() });
      let response;
      try {
        response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
          body, signal: AbortSignal.timeout(45000), redirect: 'error' });
      } catch {
        throw new Error('Translation request failed or timed out; stopped without automatic retry. Check project usage before resuming.');
      }
      if (!response.ok) throw new Error(`Translation API HTTP ${response.status}. Stopped; check API enablement, key restrictions, billing or quota locally.`);
      const result = await response.json();
      const translated = result.data?.translations;
      if (!Array.isArray(translated) || translated.length !== batch.length) throw new Error('Unexpected API result count; stopped');
      batch.forEach((entry, index) => {
        const raw = translated[index]?.translatedText;
        // Basic v2 encodes HTML entities even for format=text. Decode exactly once.
        const translation = typeof raw === 'string' && entry.kind !== 'html' ? decodeHTML(raw) : raw;
        const problems = responseProblems(entry, translation, job.language);
        if (problems.length) {
          delete job.cache.entries[entry.key];
          job.cache.rejected[entry.key] = { english: entry.english, translation, problems };
        } else {
          job.cache.entries[entry.key] = { english: entry.english, translation };
          delete job.cache.rejected[entry.key];
        }
      });
      job.cache.updatedAt = new Date().toISOString();
      job.cache.complete = false; // publication requires a separate coverage/content verification
      save(job.file, job.cache);
      save(usageFile, { provider, startedPlan: summary.sourceFingerprint,
        attemptedCharacters, requests, approvedCharacterLimit: limit, status: 'response-validated', updatedAt: new Date().toISOString() });
      process.stdout.write(`${job.language}: ${Object.keys(job.cache.entries).length} validated entries; ${Object.keys(job.cache.rejected).length} held for review\n`);
    }
  }
  process.stdout.write('API generation finished. Review held entries, then run catalog/SSR verification before publishing any language.\n');
}
module.exports = { batches, buildPlan, loadLocalEnvironment, provider, count };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
