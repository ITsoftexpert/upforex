const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { translationProblems, contentKey, richContentUnits } = require('./i18n-utils.cjs');
const { parseFragment } = require('parse5');
const { batches, buildPlan, provider, count } = require('./translate-native-catalogs.cjs');

test('numeric terms, placeholders, licenses and markup changes are held', () => {
  for (const [source, target] of [
    ['Maximum leverage 1:300 and 0.01 lots', 'अधिकतम लीवरेज 1:3000 और 0.01 लॉट'],
    ['Contact {0}', 'संपर्क करें'],
    ['License GB24203502', 'लाइसेंस GB24203503'],
    ['Email support@upforex.com', 'ईमेल support@example.com'],
  ]) assert(translationProblems({ english: source, kind: 'text' }, target).length);
  assert(translationProblems({ english: '<span data-i18n-slot="0">Account</span>', kind: 'html' }, '<span data-i18n-slot="1">खाता</span>').length);
  assert.deepEqual(translationProblems({ english: 'Leverage up to 1:300', kind: 'text' }, '1:300 तक लीवरेज'), []);
});

test('requests stay below item limits and do not mix HTML/text source formats', () => {
  const entries = Array.from({ length: 257 }, (_, i) => ({ english: 'Example '.repeat(20), kind: i % 2 ? 'html' : 'text' }));
  for (const batch of batches(entries)) {
    assert(batch.length <= 100);
    assert(batch.every(entry => entry.kind === batch[0].kind));
    assert(batch.reduce((sum, entry) => sum + count(entry.english), 0) <= 5000);
  }
});

test('risk limits cannot reverse or lose their comparison sign in a translation', () => {
  const entry={english:'Risk ≤1% per trade',kind:'text'};
  for(const target of ['المخاطرة ≥1% لكل صفقة','المخاطرة 1% لكل صفقة','المخاطرة <1% لكل صفقة']) {
    assert(translationProblems(entry,target).includes('Changed numeric comparison bounds'));
  }
  assert.deepEqual(translationProblems(entry,'المخاطرة <= 1% لكل صفقة'),[]);
  assert.deepEqual(translationProblems({english:'<span>Risk &lt;=1%</span>',kind:'html'},'<span>المخاطرة ≤1%</span>'),[]);
});

test('planning is offline and reuses only validated exact-source API results', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upforex-i18n-plan-'));
  try {
    const entry = { key: contentKey('Trade 0.01 lots'), english: 'Trade 0.01 lots', kind: 'text' };
    const inventory = { entries: [entry], problems: [] };
    let planned = buildPlan(inventory, ['hi', 'ar'], dir).summary;
    assert.equal(planned.charactersToSend, count(entry.english) * 2);
    fs.writeFileSync(path.join(dir, 'hi.json'), JSON.stringify({ provider, entries: { [entry.key]: { english: entry.english, translation: '0.01 लॉट ट्रेड करें' } } }));
    planned = buildPlan(inventory, ['hi', 'ar'], dir).summary;
    assert.equal(planned.languages[0].cachedEntries, 1);
    assert.equal(planned.charactersToSend, count(entry.english));
    fs.writeFileSync(path.join(dir, 'hi.json'), JSON.stringify({ provider, entries: { [entry.key]: { english: entry.english, translation: entry.english } } }));
    assert.equal(buildPlan(inventory, ['hi'], dir).summary.languages[0].cachedEntries, 0, 'English fallback must not be counted as a validated translation');
    fs.writeFileSync(path.join(dir, 'hi.json'), JSON.stringify({ provider, entries: { [entry.key]: { english: entry.english, translation: '1 लॉट ट्रेड करें' } } }));
    assert.equal(buildPlan(inventory, ['hi'], dir).summary.languages[0].cachedEntries, 0);
    fs.writeFileSync(path.join(dir, 'hi.json'), JSON.stringify({ provider, rejected: { [entry.key]: { english: entry.english, translation: '1 लॉट ट्रेड करें' } } }));
    const held = buildPlan(inventory, ['hi'], dir).summary;
    assert.equal(held.languages[0].heldEntries, 1);
    assert.equal(held.charactersToSend, 0, 'Do not pay for the same rejected source again on resume');
  } finally {
    // Delete only this tool's verified temporary files; never recurse over input paths.
    for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
    fs.rmdirSync(dir);
  }
});

test('inline slot extraction retains opaque code and leaves asset attributes outside the message', () => {
  const fragment = parseFragment('<p>Trade <b>0.01 lots</b> <span><code>BUY</code></span><img src="/assets/logo.png"></p>');
  const units = richContentUnits(fragment);
  assert.equal(units.length, 1);
  assert(!units[0].message.includes('/assets/logo.png'));
  assert(!units[0].message.includes('BUY'));
  assert.equal(units[0].originals.length, 4);
});

test('execution without an approved character limit stops before a paid request', () => {
  const secret = 'dummy-test-key-never-send';
  const planFile = path.resolve(__dirname, '../tmp/native-translation-plan.json');
  const originalPlan = fs.existsSync(planFile) ? fs.readFileSync(planFile) : null;
  try {
  const result = spawnSync(process.execPath, ['scripts/translate-native-catalogs.cjs', '--execute', '--max-characters=0'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, GOOGLE_TRANSLATE_API_KEY: secret }, timeout: 20000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No requests made/);
  assert(!result.stdout.includes(secret));
  assert(!result.stderr.includes(secret));
  } finally {
    if (originalPlan) fs.writeFileSync(planFile, originalPlan);
    else if (fs.existsSync(planFile)) fs.unlinkSync(planFile);
  }
});
