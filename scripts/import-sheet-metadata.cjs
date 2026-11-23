// Import the user's approved, read-only sheet snapshot. No network or translation requests.
const fs = require('node:fs');
const crypto = require('node:crypto');
const u = require('./i18n-release-utils.cjs');
const source = 'scripts/data/seo-metadata-sheet.csv';
const destination = 'scripts/data/seo-metadata.json';
const sheet = 'https://docs.google.com/spreadsheets/d/14geinKQBoFMim9EoimH9vmc8a67tWim3gbBJWViuzOk/edit?gid=1581887777';

function parseCsv(input) {
  const rows = []; let row = [], value = '', quoted = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || value === '') quoted = !quoted;
      else throw new Error('Unexpected CSV quote');
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (value !== '' || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function importMetadata(input, definitions, completedPages) {
  const rows = parseCsv(input), headers = rows.shift();
  const expected = ['URL', 'Language', 'Page', 'Current title (from audit)', 'New title', 'Title chars', 'New meta description', 'Desc chars', 'Length check'];
  if (JSON.stringify(headers) !== JSON.stringify(expected)) throw new Error('Unexpected metadata sheet columns');
  const known = new Set(definitions.map(page => page.path)), pages = {}, entries = [], unmatched = [], warnings = [];
  const seen = new Set(), seenSource = new Set(), aliases = [], accountRedirects = [], excluded = [];
  const exclusions = u.read('scripts/data/seo-sheet-exclusions.json', {});
  const register = (record, page, redirected = false) => {
    const identity = page + ':' + record.language;
    if (seen.has(identity)) throw new Error('Duplicate page/language at row ' + record.row);
    seen.add(identity);
    (pages[page] ||= {})[record.language] = { title: record.title, description: record.description };
    entries.push({ row: record.row, url: record.url, page, ...(page !== record.sourcePage ? { sourcePage: record.sourcePage, existingRedirectApplied: true } : {}),
      ...(redirected ? { verifiedLegacyAlias: true } : {}), language: record.language, title: record.title, description: record.description,
      status: record.language === 'en' || (completedPages[page] || []).includes(record.language) ? 'eligible-for-initial-HTML' : 'held-until-body-translation-complete' });
  };
  for (let index = 0; index < rows.length; index++) {
    const values = rows[index], row = index + 2;
    if (values.length !== headers.length) throw new Error('Column count at row ' + row);
    const [url, label, , , title, titleChars, description, descChars] = values;
    if ([url, label, title, description].some(value => !value || value !== value.trim())) throw new Error('Blank or padded required value at row ' + row);
    if (/[<>\u0000-\u001f\ufffd]/.test(title + description)) throw new Error('Invalid plain-text metadata at row ' + row);
    const parsed = new URL(url);
    if (parsed.origin !== 'https://www.upforex.com' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error('Unexpected URL at row ' + row);
    const languageCode = label.split(' ')[0], language = ({ 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW' })[languageCode] || languageCode;
    if (!['en', ...u.languages].includes(language)) throw new Error('Unsupported language at row ' + row);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const prefix = Object.entries(u.prefixes).find(([, prefix]) => prefix === segments[0]);
    if (language !== (prefix ? prefix[0] : 'en')) throw new Error('URL/language mismatch at row ' + row);
    if (prefix) segments.shift();
    const sourcePage = '/' + segments.join('/'), record = { row, url, sourcePage, language, title, description };
    const sourceIdentity = sourcePage + ':' + language;
    if (seenSource.has(sourceIdentity)) throw new Error('Duplicate sheet URL at row ' + row);
    seenSource.add(sourceIdentity);
    if (Number(titleChars) !== [...title].length || Number(descChars) !== [...description].length) warnings.push({ row, url, issue: 'Sheet character counts differ from actual Unicode character counts', actualTitleCharacters: [...title].length, actualDescriptionCharacters: [...description].length });
    if ([...title].length > 60 || [...description].length > 160) warnings.push({ row, url, issue: 'Length advisory only; approved copy preserved without truncation', titleCharacters: [...title].length, descriptionCharacters: [...description].length });
    const page = sourcePage === '/anti-monry-laundering' ? '/anti-money-laundering' : sourcePage;
    if (known.has(page)) { register(record, page); continue; }
    const target = u.legacySeoDestination(sourcePage);
    if (target) {
      if (!known.has(target)) throw new Error('Legacy metadata alias points to a missing public page: ' + sourcePage);
      aliases.push({ ...record, targetPage: target, redirectStatus: 301 }); continue;
    }
    if (Object.prototype.hasOwnProperty.call(u.LEGACY_ACCOUNT_REDIRECTS, sourcePage)) {
      accountRedirects.push({ ...record, target: u.LEGACY_ACCOUNT_REDIRECTS[sourcePage], redirectStatus: 302, status: 'external-account-redirect', reason: 'Reuses the existing homepage registration action. Redirect responses have no indexable local metadata.' }); continue;
    }
    const exclusion = exclusions[sourcePage];
    if (exclusion?.userConfirmed === true && exclusion.status === 'excluded-obsolete-row') {
      excluded.push({ ...record, ...exclusion }); continue;
    }
    unmatched.push({ ...record, reason: 'No exact current public route/CMS permalink or reviewed disposition. No URL or alias was guessed.' });
  }
  const exactMatchedRows = entries.length;
  for (const alias of aliases) {
    const existing = entries.find(entry => entry.page === alias.targetPage && entry.language === alias.language);
    if (existing) {
      // An alias must never overwrite a separate approved canonical sheet row.
      alias.status = 'redirect-to-existing-approved-canonical'; alias.canonicalMetadataRow = existing.row;
    } else {
      register(alias, alias.targetPage, true); alias.status = 'metadata-applied-to-verified-canonical';
    }
  }
  for (const [page, languages] of Object.entries(pages)) {
    if (!languages.en) throw new Error('Missing English metadata for ' + page);
    for (const [language, metadata] of Object.entries(languages)) if (language !== 'en') for (const field of ['title', 'description']) {
      if (metadata[field] === languages.en[field]) throw new Error('Untranslated sheet ' + field + ': ' + page + ':' + language);
      const script = { hi: /[\u0900-\u097f]/, ar: /[\u0600-\u06ff]/, ru: /[\u0400-\u04ff]/, ja: /[\u3040-\u30ff\u4e00-\u9fff]/, 'zh-CN': /[\u4e00-\u9fff]/, 'zh-TW': /[\u4e00-\u9fff]/ }[language];
      if (script && !script.test(metadata[field])) throw new Error('Missing language script: ' + page + ':' + language + ':' + field);
    }
  }
  const sha256 = crypto.createHash('sha256').update(input).digest('hex');
  const accountedRows = exactMatchedRows + aliases.length + accountRedirects.length + excluded.length;
  return { source: { sheet, tab: '1581887777', snapshot: source, sha256 }, pages, report: {
    source: { sheet, sha256 }, totalRows: rows.length, matchedPages: Object.keys(pages).length, exactMatchedRows, matchedRows: entries.length,
    eligibleRows: entries.filter(entry => entry.status === 'eligible-for-initial-HTML').length,
    heldRows: entries.filter(entry => entry.status !== 'eligible-for-initial-HTML').length,
    redirectedMetadataRows: aliases.filter(row => row.status === 'metadata-applied-to-verified-canonical').length,
    aliases, accountRedirects, excluded, accountedRows, allRowsAccountedFor: accountedRows === rows.length && unmatched.length === 0,
    unmatchedRows: unmatched.length, unmatched, warnings, entries } };
}

function main() {
  const result = importMetadata(fs.readFileSync(source, 'utf8'), u.pageDefinitions(), u.coverage().COMPLETED_NATIVE_PAGES);
  fs.writeFileSync(destination, JSON.stringify({ source: result.source, pages: result.pages }, null, 2) + '\n');
  fs.writeFileSync('tmp/sheet-metadata-import.json', JSON.stringify(result.report, null, 2) + '\n');
  console.log(JSON.stringify({ ...result.report, entries: undefined, unmatched: result.report.unmatched.map(({ row, url, reason }) => ({ row, url, reason })), warnings: result.report.warnings.length }, null, 2));
}
module.exports = { parseCsv, importMetadata };
if (require.main === module) main();
