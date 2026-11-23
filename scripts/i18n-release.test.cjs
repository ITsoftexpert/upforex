require('./release-source-inputs.test.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const u=require('./i18n-release-utils.cjs');
const {verifyBody,alternates}=require('./verify-native-release.cjs');
const root=html=>u.elements(u.parse(html),'body')[0];
test('shared-catalog validation rejects a changed target, changed source, missing key and a different language',()=>{
  const {catalogValidator}=require('./verify-native-release.cjs');
  const inventory=new Map([['key',{english:'Earn 100 USD',kind:'text'}]]),validate=catalogValidator(inventory);
  assert.deepEqual(validate('key','100 USD कमाएँ','hi'),[]);
  assert.deepEqual(validate('key','100 USD कमाएँ','hi'),[]);
  assert(validate('key','Earn 100 USD','hi').length);
  assert(validate('key','101 USD कमाएँ','hi').length);
  assert.deepEqual(validate('key','100 USD कमाएँ','hi'),[]);
  inventory.set('key',{english:'Earn 200 USD',kind:'text'});
  assert(validate('key','100 USD कमाएँ','hi').length);
  assert.throws(()=>validate('missing','100 USD कमाएँ','hi'),/Unknown source key/);
  inventory.set('key',{english:'Commission',kind:'text'});
  assert.deepEqual(validate('key','Commission','fr'),[]);
  assert(validate('key','Commission','hi').includes('Untranslated English'));
});
test('release commands require complete translations by default; an explicit release flag overrides partial mode',()=>{
  const {requireComplete}=require('./verify-native-release.cjs');
  assert.equal(requireComplete([]),true);
  assert.equal(requireComplete(['--require-complete']),true);
  assert.equal(requireComplete(['--allow-partial']),false);
  assert.equal(requireComplete(['--allow-partial','--require-complete']),true);
});
function loadServerTypescript(file, cache = new Map()) {
  const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
  const absolute=path.resolve(__dirname,'..',file);
  if(cache.has(absolute))return cache.get(absolute);
  const result={};cache.set(absolute,result);
  const requireLocal=name=>name.startsWith('.')?loadServerTypescript(path.resolve(path.dirname(absolute),name)+'.ts',cache):require(name);
  new Function('exports','require',ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(result,requireLocal);
  return result;
}
const sitemap=loadServerTypescript('src/server/public-sitemap.ts');
const sitemapLocations=xml=>u.elements(u.parseFragment(xml),'loc').map(node=>u.text(node).trim());

test('Japanese past negatives preserve a source denial while an affirmative still fails',()=>{
  const {financialConsistency}=require('./free-i18n-domain.cjs');
  assert.deepEqual(financialConsistency('Restrictions they had not understood','理解していなかった制限','ja').problems,[]);
  assert(financialConsistency('Restrictions they had not understood','理解していた制限','ja').problems.includes('Source denial/exclusion needs bilingual review'));
  assert.deepEqual(financialConsistency('It should also not be confused with margin','Tampoco debe confundirse con el margen','es').problems,[]);
  assert(financialConsistency('It should also not be confused with margin','Debe confundirse con el margen','es').problems.includes('Source denial/exclusion needs bilingual review'));
  assert.deepEqual(financialConsistency('If the price does not fall','価格が下がらなければ','ja').problems,[]);
  assert.deepEqual(financialConsistency('Risk can concentrate instead of providing diversification','分散を提供する代わりにリスクが集中することがある','ja').problems,[]);
  assert(financialConsistency('Risk can concentrate instead of providing diversification','分散によってリスクが減る','ja').problems.includes('Source denial/exclusion needs bilingual review'));
});

test('financial checks retain distinct bid and ask prices without rejecting same-side movement comparisons',()=>{
  const {financialConsistency:f}=require('./free-i18n-domain.cjs');
  assert(f('The ask is normally higher than the bid','卖价通常高于卖价','zh-CN').problems.includes('Bid and ask distinction collapsed to the same price'));
  assert(f('What is the difference between bid and ask?','買値と買値の違いは？','ja').problems.includes('Bid and ask distinction collapsed to the same price'));
  assert.deepEqual(f('The ask is normally higher than the bid','卖价通常高于买价','zh-CN').problems,[]);
  assert.deepEqual(f('Compare bid with bid to assess movement','买价与买价比较','zh-CN').problems,[]);
});

test('concessive online wording does not bypass real source denials or exclusions',()=>{
  const {financialConsistency:f}=require('./free-i18n-domain.cjs');
  assert.deepEqual(f('The same activity—except it’s done online','同じ活動ですがオンラインで行われます','ja').problems,[]);
  assert(f('The same activity—except it’s done online without commission','同じ活動ですがオンラインで行われます','ja').problems.includes('Source denial/exclusion needs bilingual review'));
  assert(f('All accounts except commission accounts','すべての口座','ja').problems.includes('Source denial/exclusion needs bilingual review'));
});

test('an exact postal place name is preserved while English disclaimer text and changed numbers still fail',()=>{
  const address='GIFT SEZ, Gift City, Gandhinagar, Gujarat, India';
  assert.deepEqual(u.untranslatedPassages('Registered location: '+address,'注册地址：'+address),[]);
  const prose='The published disclaimer is educational and cannot guarantee your future trading results';
  assert(u.untranslatedPassages(prose+' '+address,prose+' '+address).length>0);
  assert(u.validate({english:'Location: '+address+', 382355',kind:'text'},'注册地址：'+address+', 382354','zh-CN').includes('Changed numeric values'));
});

test('Traditional Chinese reuse requires the current validated Simplified source and preserves existing native copy',()=>{
  const {reuseTraditionalChinese:reuse}=require('./reuse-chinese-script.cjs');
  const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
  const entry={key:u.contentKey('Risk management'),english:'Risk management',kind:'text'};
  const source='风险管理',target='風險管理';
  const row={english:entry.english,sourceTranslation:source,translation:target,sourceSha256:hash(entry.english),
    sourceTranslationSha256:hash(source),targetSha256:hash(target)};
  const cache={provider:'opencc-s2t-validated-source-v1',conversion:{config:'s2t',dictionarySha256:'a'.repeat(64)},entries:{[entry.key]:row}};
  assert.deepEqual(reuse([entry],{[entry.key]:source},{},cache),{[entry.key]:target});
  assert.deepEqual(reuse([entry],{[entry.key]:source},{[entry.key]:'風險控管'},cache),{});
  assert.deepEqual(reuse([entry],{}, {},cache),{});
  assert.deepEqual(reuse([entry],{[entry.key]:'另一項翻譯'}, {},cache),{});
  assert.deepEqual(reuse([{...entry,english:'New English source'}],{[entry.key]:source},{},cache),{});
  for(const translation of ['Risk management','$500 風險管理','<script>風險管理</script>']){
    const altered={...cache,entries:{[entry.key]:{...row,translation,targetSha256:hash(translation)}}};
    assert.deepEqual(reuse([entry],{[entry.key]:source},{},altered),{});
  }
});

test('only validated short CMS financial tags reuse case variants; prose, names and conflicting targets stay held',()=>{
  const {reuseFinancialTagCase}=require('./reuse-native-text.cjs');
  const entry=(english,source='CMS:blogs/example#tag')=>({key:u.contentKey(english),english,kind:'text',sources:[source]});
  const lower=entry('forex real account'),upper=entry('FOREX REAL ACCOUNT'),prose=entry('FOREX REAL ACCOUNT','src/app/example.ts');
  const accepted={[lower.key]:'वास्तविक फ़ॉरेक्स खाता'};
  assert.equal(reuseFinancialTagCase([lower,upper],accepted,'hi')[upper.key],accepted[lower.key]);
  assert.deepEqual(reuseFinancialTagCase([lower,prose],accepted,'hi'),{});
  assert.deepEqual(reuseFinancialTagCase([entry('Polish'),entry('polish')],{[u.contentKey('Polish')]:'Polonais'},'fr'),{});
  const mixed=entry('Forex Real Account');
  assert.deepEqual(reuseFinancialTagCase([lower,mixed,upper],{...accepted,[mixed.key]:'अलग अनुवाद'},'hi'),{});
  assert.deepEqual(reuseFinancialTagCase([lower,upper],{[lower.key]:lower.english},'hi'),{});
});

test('real native homographs pass as single terms while copied English prose still fails',()=>{
  for(const [language,word]of [['fr','Inflation'],['fr','Diversification'],['de','Gold'],['de','Spread'],['es','No'],['pt','Micro']])assert.deepEqual(u.validate({english:word,kind:'text'},word,language),[]);
  for(const language of ['fr','de','es','pt'])assert(u.validate({english:'Inflation affects the market',kind:'text'},'Inflation affects the market',language).includes('Untranslated English'));
  for(const [language,word]of [['fr','Trump'],['fr','Dragon'],['de','Trump'],['es','Trump'],['pt','TRUMP']])assert.deepEqual(u.validate({english:word,kind:'text'},word,language),[]);
  for(const language of ['fr','de','es','pt'])assert(u.validate({english:'Trump tariffs affect the market',kind:'text'},'Trump tariffs affect the market',language).includes('Untranslated English'));
});

test('French and German financial arithmetic preserves identical units without waiving surrounding English',()=>{
  for(const language of ['fr','de']){
    for(const notation of ['1 lot EUR/USD = 100,000 EUR','0.01 lot = 1,000 USD','+2 pips','0.0001 = 1 pip','Position A','Position B'])assert.deepEqual(u.validate({english:notation,kind:'text'},notation,language),[]);
    for(const prose of ['1 lot EUR/USD offers an opportunity','Position A is profitable','+2 pips guaranteed today'])assert(u.validate({english:prose,kind:'text'},prose,language).includes('Untranslated English'));
    assert(u.validate({english:'0.01 lot = 1,000 USD',kind:'text'},'0.10 lot = 1,000 USD',language).includes('Changed numeric values'));
  }
  for(const language of ['es','pt','ja'])assert(u.validate({english:'1 lot EUR/USD = 100,000 EUR',kind:'text'},'1 lot EUR/USD = 100,000 EUR',language).includes('Untranslated English'));
  for(const language of ['es','pt']){
    assert.deepEqual(u.validate({english:'2 pips',kind:'text'},'2 pips',language),[]);
    assert(u.validate({english:'2 pips today',kind:'text'},'2 pips today',language).includes('Untranslated English'));
    assert(u.validate({english:'2 pips',kind:'text'},'3 pips',language).includes('Changed numeric values'));
  }
});

test('numeric clock data is preserved while explanatory time prose must be translated',()=>{
  for(const label of ['4:00–8:00 p.m.','9:30–10:00 a.m.','5:00 p.m.–2:00 a.m.','4:00 a.m.–1:00 p.m. GST']){
    assert.equal(u.needsContentTranslation(label),false);
    for(const language of u.languages)assert.deepEqual(u.validate({english:label,kind:'text'},label,language),[]);
  }
  for(const sentence of ['4:00 p.m. during EDT','Noon–9:00 p.m.','Trade from 4:00–8:00 p.m.'])assert.equal(u.needsContentTranslation(sentence),true);
});

test('currency symbols cannot silently change an offer denomination',()=>{
  for(const [source,target] of [['₹0 per trade','£0 pro Trade'],['₹10,000 virtual funds','$10,000 virtuelles Guthaben'],['$50 deposit','€50 Einzahlung'],['EUR 10','¥10']])assert(u.validate({english:source,kind:'text'},target,'de').includes('Changed currency denomination'));
  for(const [source,target] of [['₹0 per trade','₹0 pro Trade'],['₹10,000 virtual funds','10,000 INR virtuelles Guthaben'],['USD 50 deposit','$50 Einzahlung'],['EUR 10 deposit','€10 Einzahlung']])assert.deepEqual(u.validate({english:source,kind:'text'},target,'de'),[]);
  assert(u.validate({english:'Withdraw ₹500','kind':'text'},'Выведите 500 фунтов стерлингов','ru').includes('Changed currency denomination'));
});

test('round-lot pricing is never silently interpreted as round-trip pricing',()=>{
  const {financialConsistency}=require('./free-i18n-domain.cjs');
  assert(financialConsistency('$7 per round lot','$7 за полный оборот лота','ru').problems.includes('Round-lot pricing changed to round-trip pricing'));
  assert.deepEqual(financialConsistency('$7 per round lot','$7 за лот («round lot»)','ru').problems,[]);
  assert.deepEqual(financialConsistency('$3.50 per lot round-turn','$3.50 за полный оборот лота','ru').problems,[]);
  for(const [language,target]of [['es','$7 por lote de ida y vuelta'],['pt','$7 por lote de ida e volta'],['zh-CN','每手往返$7'],['zh-TW','每手來回$7'],['ja','1ロット往復$7']])assert(financialConsistency('$7 per round lot',target,language).problems.includes('Round-lot pricing changed to round-trip pricing'));
});

test('loss formulas retain negative amounts without mistaking ordinary ranges for losses',()=>{
  assert(u.validate({english:'Net floating P/L = -$300',kind:'text'},'Чистая плавающая прибыль/убыток = $300','ru').includes('Changed numeric negative signs'));
  assert.deepEqual(u.validate({english:'Net floating P/L = -$300',kind:'text'},'Чистая плавающая прибыль/убыток = -300 $','ru'),[]);
  const {negativeAmounts}=require('./i18n-utils.cjs');
  assert.deepEqual(negativeAmounts('Spread 3-4 pips; 74%-89%; 2024-00700; a 50-pip move; -$450; −2,000 USD'),['2,000','450']);
  assert.deepEqual(negativeAmounts('MON - FRI, 9AM - 5PM; (1.3490 − 1.3450) × 5'),[]);
  assert.deepEqual(negativeAmounts('P/L = - $300'),['300']);
});

test('native financial labels and company names do not waive surrounding English',()=>{
  for(const term of ['Drawdown','Hammer','London'])assert.deepEqual(u.validate({english:term,kind:'text'},term,'de'),[]);
  for(const name of ['Nike','Deckers','VF Corporation','Apple (AAPL)','IC Markets']){
    assert.equal(u.needsContentTranslation(name),false);
    assert.equal(u.needsContentTranslation(name+' shares can fall'),true);
  }
  assert.deepEqual(u.validate({english:'0.01 lot = 1,000 EUR',kind:'text'},'0.01 Lot = 1,000 EUR','de'),[]);
  for(const prose of ['Drawdown is a financial risk','Hammer patterns always work','1 lot EUR/USD offers an opportunity'])assert(u.validate({english:prose,kind:'text'},prose,'de').includes('Untranslated English'));
  const {financialConsistency}=require('./free-i18n-domain.cjs');
  assert.deepEqual(financialConsistency('Neither balance nor floating P/L changes','Weder der Kontostand noch der nicht realisierte Gewinn/Verlust ändern sich','de').problems,[]);
  assert.deepEqual(financialConsistency('A commission-free account','Ein provisionsfreies Konto','de').problems,[]);
  assert.deepEqual(financialConsistency('except online','sauf en ligne','fr').problems,[]);
  assert(financialConsistency('No commission','Eine Provision','de').problems.length);
});

test('native category variability is validated against the exact article and cannot conceal English fallback',()=>{
  const card=(title,category,slug='example')=>root('<article class="article-card"><h5><a href="/blogs/'+slug+'">'+title+'</a></h5><span class="article-tag">'+category+'</span></article>');
  const dictionary=[{source:'Original title',target:'मूल शीर्षक'},{source:'Education',target:'शिक्षा'},{source:'Market Insights',target:'बाज़ार विश्लेषण'}];
  const options={page:'/blogs',language:'hi',cmsSnapshot:[{permaLink:'example',title:'Original title',categories:[{categoryName:'Education'},{categoryName:'Market Insights'}]}]};
  assert.equal(verifyBody(card('Original title','Education'),card('मूल शीर्षक','बाज़ार विश्लेषण'),dictionary,options).verifiedCategoryFields,1);
  for(const value of ['Education','Unknown','अन्य'])assert.throws(()=>verifyBody(card('Original title','Education'),card('मूल शीर्षक',value),dictionary,options),/complete native translation/);
  assert.throws(()=>verifyBody(card('Original title','Education'),card('मूल शीर्षक','शिक्षा','other'),dictionary,options),/Unknown CMS listing article/);
  assert.throws(()=>verifyBody(card('Original title','Education'),card('बदला शीर्षक','शिक्षा'),dictionary,options),/title must belong/);
});

test('only exact named stock/index identities are exempt; surrounding English prose must translate',()=>{
  for(const name of ['American Airlines Group Inc.','ASX 200','FTSE 100','Schneider Electric SA','MT5 iOS','MetaTrader 4','10 BCH','10 BSV','1000 UNI']) {
    assert.equal(u.needsContentTranslation(name),false,name);
    assert.deepEqual(u.validate({english:name,kind:'text'},name,'ja'),[]);
    assert.equal(u.needsContentTranslation(name+' offers trading opportunities'),true,name+' prose');
  }
});

test('varying CMS recommendations must each preserve source, native text, destinations and controls',()=>{
  const {recommendationProjection}=require('./verify-native-release.cjs');
  const row=(title,description,slug='second')=>'<li class="mb-3"><a href="/blogs/'+slug+'" class="text-decoration-none fw-semibold tw-text-themePrimary">'+title+'<ng-icon name="matOpenInNew"></ng-icon></a><p class="small mb-0">'+description+'</p></li>';
  const view=rows=>root('<app-blogs><h1>Original title</h1><div class="sidebar"><h5>Recommended Blogs</h5><ul class="list-unstyled">'+rows+'</ul></div></app-blogs>');
  const dictionary=[{source:'First title',target:'पहला शीर्षक'},{source:'Second title',target:'दूसरा शीर्षक'},{source:'Review the risks.',target:'जोखिमों की समीक्षा करें।'},{source:'Check the details.',target:'विवरण देखें।'}];
  const snapshot=[{permaLink:'first',title:'First title',description:'Review the risks.'},{permaLink:'second',title:'Second title',description:'Check the details.'}];
  const english=recommendationProjection(view(row('First title','Review the risks.','first')),dictionary,snapshot,'en');
  const native=recommendationProjection(view(row('दूसरा शीर्षक','विवरण देखें।')),dictionary,snapshot,'hi');
  assert.equal(native.verified,1);assert.deepEqual(english.root,native.root);
  for(const html of [row('Second title','विवरण देखें।'),row('दूसरा शीर्षक','Check the details.'),row('दूसरा शीर्षक','विवरण देखें।','unknown'),row('दूसरा शीर्षक','विवरण देखें।').replace('matOpenInNew','otherIcon'),row('दूसरा शीर्षक','विवरण देखें।').replace('fw-semibold','changed')])assert.throws(()=>recommendationProjection(view(html),dictionary,snapshot,'hi'));
  assert.equal(recommendationProjection(view(''),dictionary,snapshot,'en').verified,0);
});

test('CMS keyword verification preserves separately translated source tags and comma order',()=>{
  const {verifyHead}=require('./verify-native-release.cjs');
  const en=u.parse('<title>Apply now</title><meta name="keywords" content="Risk,Account">');
  const dictionary=[{source:'Apply now',target:'अभी आवेदन करें'},{source:'Risk',target:'जोखिम'},{source:'Account',target:'खाता'}];
  const native=value=>u.parse('<title>अभी आवेदन करें</title><meta name="keywords" content="'+value+'">');
  assert.doesNotThrow(()=>verifyHead(en,native('जोखिम,खाता'),dictionary,undefined,{tags:['Risk','Account']}));
  assert.throws(()=>verifyHead(en,native('Risk,खाता'),dictionary,undefined,{tags:['Risk','Account']}),/Translated meta keywords/);
  assert.throws(()=>verifyHead(en,native('खाता,जोखिम'),dictionary,undefined,{tags:['Risk','Account']}),/Translated meta keywords/);
  assert.doesNotThrow(()=>verifyHead(u.parse('<title>Apply now</title><meta name="keywords" content="Risk ,Account">'),native('जोखिम ,खाता'),dictionary,undefined,{tags:['Risk ','Account']}));
});

test('metadata CSV preserves UTF-8, quotes, commas and multiline cells',()=>{
  const {parseCsv}=require('./import-sheet-metadata.cjs');
  assert.deepEqual(parseCsv('\uFEFFURL,title\r\n/x,"Trade, ""now""\nहिन्दी"\r\n'),[['URL','title'],['/x','Trade, "now"\nहिन्दी']]);
  assert.throws(()=>parseCsv('"unclosed'),/Unclosed/);
});

test('approved metadata matches the sheet snapshot without adding routes or completion claims',()=>{
  const fs=require('node:fs'),{importMetadata}=require('./import-sheet-metadata.cjs');
  const result=importMetadata(fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8'),u.pageDefinitions(),u.coverage().COMPLETED_NATIVE_PAGES);
  assert.deepEqual(u.read('scripts/data/seo-metadata.json'),{source:result.source,pages:result.pages});
  assert.equal(result.report.totalRows,317);assert.equal(result.report.exactMatchedRows,309);assert.equal(result.report.matchedRows,312);assert.equal(result.report.unmatchedRows,0);
  assert.equal(result.report.accountedRows,317);assert.equal(result.report.aliases.length,5);assert.equal(result.report.accountRedirects.length,2);assert.equal(result.report.excluded.length,1);assert.equal(result.report.allRowsAccountedFor,true);
  assert.equal(result.report.entries.length,result.report.eligibleRows+result.report.heldRows);
  const incomplete=importMetadata(fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8'),u.pageDefinitions(),{});
  assert.equal(incomplete.report.heldRows,280,'Every foreign head must be held when its body is incomplete');
  assert.equal(incomplete.report.eligibleRows,32,'Only English heads, including the three verified article replacements, are eligible without translated body coverage');
  assert(!result.pages['/demo']);assert(!result.pages['/products/us-stocks']);
  for(const page of Object.keys(result.pages))assert.equal(Object.keys(result.pages[page]).length,page.startsWith('/blogs/')?1:11);
});

test('metadata import rejects duplicate identities and URL/language mismatches',()=>{
  const fs=require('node:fs'),{importMetadata}=require('./import-sheet-metadata.cjs');
  const csv=fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8');
  const args=[u.pageDefinitions(),u.coverage().COMPLETED_NATIVE_PAGES];
  const header=csv.slice(0,csv.indexOf('\n')+1),first=csv.slice(header.length,csv.indexOf('\n',header.length)+1);
  assert.throws(()=>importMetadata(header+first+first,...args),/Duplicate/);
  assert.throws(()=>importMetadata(csv.replace('de – German','hi – Hindi'),...args),/mismatch/);
});

test('approved AML metadata follows only the existing main typo redirect',()=>{
  const fs=require('node:fs'),{importMetadata}=require('./import-sheet-metadata.cjs');
  const result=importMetadata(fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8'),u.pageDefinitions(),{});
  const migrated=result.report.entries.filter(row=>row.sourcePage==='/anti-monry-laundering');
  assert.equal(migrated.length,11);
  assert(migrated.every(row=>row.sourcePage==='/anti-monry-laundering'&&row.page==='/anti-money-laundering'));
  assert(!result.pages['/anti-monry-laundering']);
  assert(result.pages['/anti-money-laundering'].hi);
  assert(result.report.accountRedirects.some(row=>row.sourcePage==='/demo'&&row.redirectStatus===302));
  assert(result.report.excluded.some(row=>row.sourcePage==='/blogs/real-time-forex-trading-platform'&&row.userConfirmed));
});

test('English-only approved sheet heads need an exact-source reviewed native translation, never English fallback',()=>{
  const {effectivePageMetadata}=require('./page-metadata.cjs'),sheet=u.read('scripts/data/seo-metadata.json'),derived=u.read('scripts/data/reviewed-derived-metadata.json');
  const page='/blogs/what-is-a-forex-currency-pair';
  for(const language of u.languages){
    const actual=effectivePageMetadata(page,language,sheet,derived);
    assert(actual);assert.notEqual(actual.title,sheet.pages[page].en.title);
    assert.deepEqual(actual,derived[page].translations[language]);
  }
  assert.equal(effectivePageMetadata(page,'hi',sheet,{}),undefined);
  const stale=structuredClone(derived);stale[page].english.title='Changed source';
  assert.throws(()=>effectivePageMetadata(page,'hi',sheet,stale),/exact reviewed English source/);
  const fallback=structuredClone(derived);fallback[page].translations.hi={...fallback[page].english};
  assert.throws(()=>effectivePageMetadata(page,'hi',sheet,fallback),/Untranslated English|target-language/);
});

test('initial HTML must match exact approved metadata and cannot contain duplicate descriptions',()=>{
  const {verifySheetMetadata}=require('./verify-native-release.cjs'),approved={title:'Hindi title | UPFOREX',description:'Exact approved description'};
  const html='<title>Hindi title | UPFOREX</title><meta name="description" content="Exact approved description">';
  assert.equal(verifySheetMetadata(u.parse(html),approved),true);
  assert.throws(()=>verifySheetMetadata(u.parse(html.replace('Hindi title','English title')),approved),/Exact approved/);
  assert.throws(()=>verifySheetMetadata(u.parse(html+'<meta name="description" content="Other">'),approved),/One sheet description/);
});

test('sitemap removes old static aliases, encodes stored CMS permalinks and preserves canonical punctuation',()=>{
  const xml='<urlset><url><loc>https://www.upforex.com/products/index-future</loc></url>'+
    '<url><loc>https://www.upforex.com/blogs//what-is-a-forex-currency-pair</loc><lastmod>2026-08-27T10:13:52.165Z</lastmod></url>'+
    '<url><loc>https://www.upforex.com/blogs/apple,-tesla-&amp;-nvidia</loc></url>'+
    '<url><loc>https://example.com/blogs/foreign</loc></url><url><loc>https://www.upforex.com/blogs/foo?draft=1</loc></url></urlset>';
  const built=sitemap.buildPublicSitemap(xml,['/','/products/index-cfds'],[],{});
  assert.deepEqual(sitemapLocations(built),['https://www.upforex.com/','https://www.upforex.com/products/index-cfds',
    'https://www.upforex.com/blogs/what-is-a-forex-currency-pair','https://www.upforex.com/blogs/apple,-tesla-&-nvidia']);
  assert.match(built,/<lastmod>2026-08-27T10:13:52.165Z<\/lastmod>/);
  assert.throws(()=>sitemap.buildPublicSitemap('<!DOCTYPE x><urlset/>',[],[],{}),/Invalid upstream/);
});

test('sitemap publishes only certified languages of existing public pages',()=>{
  const locations=sitemapLocations(sitemap.buildPublicSitemap(undefined,['/about-us'],[],{
    '/about-us':['hi','zh-CN','pt','unsupported'],'/admin/login':['hi'],'/':['hi'],
  }));
  assert.deepEqual(locations,['https://www.upforex.com/about-us','https://www.upforex.com/hi/about-us',
    'https://www.upforex.com/zh-cn/about-us','https://www.upforex.com/pt/about-us']);
});

test('sitemap refresh is coalesced, cached and retains build-time CMS pages on upstream failure',async()=>{
  let requests=0;
  const handler=sitemap.createPublicSitemapHandler(async()=>{requests++;throw new Error('offline');});
  const responses=[];
  const response=()=>({setHeader(){},type(value){assert.equal(value,'application/xml');return this;},send(xml){responses.push(xml);}});
  await Promise.all([handler({},response()),handler({},response()),handler({},response())]);
  await handler({},response());
  assert.equal(requests,1);assert.equal(responses.length,4);assert(responses.every(xml=>xml===responses[0]));
  assert(sitemapLocations(responses[0]).includes('https://www.upforex.com/blogs/what-is-a-forex-currency-pair'));
});

test('generated server-only sitemap inventory matches the current public-route and CMS audit',()=>{
  const generated=loadServerTypescript('src/server/public-sitemap-pages.ts'),pages=u.pageDefinitions();
  assert.deepEqual(generated.PUBLIC_STATIC_SITEMAP_PATHS,pages.filter(page=>!page.cms).map(page=>page.path));
  assert.deepEqual(generated.PUBLIC_CMS_SITEMAP_PATHS,pages.filter(page=>page.cms).map(page=>page.path));
});
test('MetaTrader product-name spelling variants remain unchanged',()=>{
  for(const label of ['MetaTrader 5','Meta Trader 5','MetaTrader 5 (MT5)'])assert.equal(u.needsContentTranslation(label),false,label);
});
test('registered names and locale homographs do not waive English marketing copy',()=>{
  for(const company of ['UP Global Markets Ltd','UPFOREX Financial Services LLC','UPFOREX LTD'])assert.equal(u.needsContentTranslation(company),false);
  assert.equal(u.needsContentTranslation('UP Global Markets Ltd offers trading services'),true);
  const entry=english=>({english,kind:'text'});
  assert.deepEqual(u.validate(entry('Nairobi'),'Nairobi','fr'),[]);
  assert.deepEqual(u.validate(entry('Blogs'),'Blogs','de'),[]);
  assert(u.validate(entry('Blogs'),'Blogs','hi').length);
  assert(u.validate(entry('Start trading today'),'Start trading today','fr').length);
  assert.deepEqual(u.validate(entry('Introduction'),'Introduction','fr'),[]);
  assert.deepEqual(u.validate(entry('Definition'),'Definition','de'),[]);
  assert.deepEqual(u.validate(entry('Faq'),'FAQ','fr'),[]);
  assert.deepEqual(u.validate(entry('Kuala lumpur'),'Kuala Lumpur','es'),[]);
  assert(u.validate(entry('Introduction'),'Introduction','es').length);
});

test('currency identifiers and registered product labels cannot waive surrounding copy',()=>{
  for(const label of ['EUR/USD','EUR / USD','EUR/USD = 1.0850','USDPLN','CAD 100 000','1 BTC','0.10 × 100,000 = 10,000 EUR','Myfxbook','Pro-ECN','Elite-ECN','AMAZON'])assert.equal(u.needsContentTranslation(label),false,label);
  for(const sentence of ['Try','Try 1','Trade EUR/USD today','Myfxbook helps traders','Choose Pro-ECN for trading','Trade 1 BTC today','A USD account with support'])assert.equal(u.needsContentTranslation(sentence),true,sentence);
  for(const label of ['Apple (AAPL)','Tesla (TSLA)','Nvidia (NVDA)'])assert.equal(u.needsContentTranslation(label),false,label);
  assert.equal(u.needsContentTranslation('Apple (AAPL) shares may fall'),true);
});

test('exact text reuse retains wrappers and never stitches independent sentence fragments',()=>{
  const {reuseText}=require('./reuse-native-text.cjs');
  const entries=[{key:'a',kind:'text',english:'Risk warning'},
    {key:'b',kind:'html',english:'<span data-i18n-slot="0">Risk warning</span>'},
    {key:'c',kind:'html',english:'Read <span data-i18n-slot="0">Risk warning</span> carefully'}];
  assert.deepEqual(reuseText(entries,{a:'Avertissement sur les risques'},'fr'),{b:'<span data-i18n-slot="0">Avertissement sur les risques</span>'});
  assert.deepEqual(reuseText(entries,{a:'Risk warning'},'fr'),{},'English fallback is never translation memory');
});

test('a structurally valid draft with changed company identity still requires semantic review',()=>{
  const {assessDraft}=require('./offline-i18n-quality.cjs');
  const source={kind:'text',english:'UPFOREX provides a dedicated team for clients.'};
  const result=assessDraft(source,'فريق متخصص لخدمة العملاء.','ar');
  assert.equal(result.structuralProblems.length,0);
  assert(result.qualityFlags.some(flag=>flag.includes('UPFOREX')));
  assert.equal(result.semanticReviewComplete,false);
  assert.equal(assessDraft(source,'تقدم UPFOREX فريقاً متخصصاً للعملاء.','ar').semanticReviewComplete,false,
    'Preserved company identity alone does not prove the complete meaning');
});

test('local draft QA holds lost financial denials and swapped margin percentages',()=>{
  const {assessDraft}=require('./offline-i18n-quality.cjs');
  const denial=assessDraft({kind:'text',english:'Returns are not guaranteed.'},'Les rendements sont garantis.','fr');
  assert.equal(denial.structuralProblems.length,0);
  assert(denial.financialProblems.length,'A grammatical translation must not turn a risk warning into a promise');
  const swapped=assessDraft({kind:'text',english:'Margin-call level 50%, stop-out level 30%.'},'追加保证金水平为30%，强制平仓水平为50%。','zh-CN');
  assert.equal(swapped.structuralProblems.length,0,'The same numbers can still be associated with the wrong financial mechanism');
  assert(swapped.financialProblems.length);
  assert.equal(swapped.semanticReviewComplete,false);
});

test('offline worker count and type mismatches cannot shift translations onto another source',()=>{
  const {checkedTranslations}=require('./translate-offline-catalogs.cjs');
  assert.throws(()=>checkedTranslations({translations:['Bonjour']},2),/batch was not saved/);
  assert.throws(()=>checkedTranslations({translations:['Bonjour',{}]},2),/batch was not saved/);
  assert.throws(()=>checkedTranslations({translations:['Bonjour','']},2),/batch was not saved/);
  assert.deepEqual(checkedTranslations({translations:['Bonjour',null]},2),['Bonjour',null],
    'An untranslatable fragment retains its position and remains held');
});

test('explicit offline repair retries an existing rejected draft while ordinary resumes keep it',()=>{
  const {hasRecordedDraft,provider}=require('./translate-offline-catalogs.cjs');
  const entry={key:'risk',english:'Returns are not guaranteed.'};
  const cache={provider,entries:{risk:{english:entry.english,translation:'Les rendements sont garantis.',reviewed:false}}};
  assert(hasRecordedDraft(entry,cache));
  assert.equal(hasRecordedDraft(entry,cache,true),false,'--repair-drafts must actually select recorded failures');
  assert.equal(hasRecordedDraft({...entry,english:'Capital is at risk.'},cache),false,'Changed English cannot reuse the old draft');
});

test('offline repairs find local financial failures without a consumer or cloud review file',()=>{
  const {requiresDraftRepair,provider}=require('./translate-offline-catalogs.cjs');
  const entry={key:'risk',kind:'text',english:'Returns are not guaranteed.'};
  const cache={provider,entries:{risk:{english:entry.english,translation:'Les rendements sont garantis.',structuralChecksPassed:true}}};
  assert(requiresDraftRepair(entry,'fr',cache),'Lost risk denial must be repairable in a purely offline workspace');
  cache.entries.risk.translation='Les rendements ne sont pas garantis.';
  assert.equal(requiresDraftRepair(entry,'fr',cache),false);
  const stale={entries:{risk:{english:'A different warning',status:'requires-repair'}}};
  assert.equal(requiresDraftRepair(entry,'fr',cache,stale),false,'A stale review cannot override the exact current source');
});

test('having a draft for every source cannot be reported as completed offline translation coverage',()=>{
  const {planSummary}=require('./translate-offline-catalogs.cjs');
  const summary=planSummary([{language:'ru',totalMissing:0,entries:[],missingValidatedMessages:1142,incompletePages:62}],false);
  assert.equal(summary.languages[0].missingUnrecordedDrafts,0);
  assert.equal(summary.languages[0].missingValidatedMessages,1142);
  assert.equal(summary.languages[0].incompletePages,62);
  assert.equal(summary.deploymentReady,false);
  assert.equal(summary.publicationAutomatic,false);
});

test('mixed-language fallback paragraphs and case-only English changes fail catalog validation',()=>{
  const entry={kind:'text',english:"Explore MetaTrader 5 and review the provider's regulatory status before submitting an application."};
  assert(u.validate(entry,"探索 MetaTrader 5 and review the provider's regulatory status before submitting an application.",'zh-CN').includes('Untranslated English passage'));
  assert(u.validate({kind:'text',english:'Understand the risks before trading'},'understand the risks before trading','fr').includes('Untranslated English'));
  const names='Apple (AAPL), Amazon (AMZN), Tesla (TSLA), Microsoft (MSFT)';
  assert.deepEqual(u.untranslatedPassages('Trade shares of '+names,'Négociez les actions de '+names),[]);
});

test('reviewed exact-source corrections supersede older caches and still preserve financial values',()=>{
  const {chooseTranslation}=require('./prepare-native-catalogs.cjs');
  const entry={kind:'text',english:'Maximum leverage 1:300'};
  const cached={english:entry.english,translation:'Effet de levier maximal 1:300',origin:'existing-json:account'};
  const reviewed={english:entry.english,translation:'Levier maximal de 1:300',origin:'reviewed-local'};
  assert.equal(chooseTranslation(entry,'fr',[cached,reviewed]).selected,reviewed);
  assert.equal(chooseTranslation(entry,'fr',[cached,{...reviewed,translation:'Levier maximal de 1:3000'}]).selected,cached);
  assert.equal(chooseTranslation(entry,'fr',[cached,{...reviewed,english:'Minimum leverage 1:300'}]).selected,cached);
});
test('offline drafts preserve HTML slots and attributes, and reject unsafe replacement markup',()=>{
  const {fragments}=require('./translate-offline-catalogs.cjs');
  const entry={english:'Trade <span data-i18n-slot="0">forex</span> safely &amp; carefully',kind:'html'};
  const pieces=fragments(entry);assert.deepEqual(pieces.texts,['Trade','forex','safely & carefully']);
  const candidate=pieces.assemble(['Négociez','le forex','avec prudence']);
  assert.deepEqual(u.validate(entry,candidate,'fr'),[]);
  const unsafe=fragments(entry).assemble(['<script>alert(1)</script>','le forex','avec prudence']);
  assert(!u.elements(u.parseFragment(unsafe),'script').length,'Generated markup remains text');
});
test('Arabic homepage retains only its original locale-specific hero asset',()=>{
  const english=root('<h1>Apply now</h1><img src="https://cdn.example/assets/images/JPG/home_banner_temp_1.webp">');
  const dictionary=[{source:'Apply now',target:'قدّم الآن'}],options={page:'/',language:'ar'};
  assert.doesNotThrow(()=>verifyBody(english,root('<h1>قدّم الآن</h1><img src="assets/images/optimized/home-banner-ar.37150fc69f4015a4.webp">'),dictionary,options));
  assert.throws(()=>verifyBody(english,root('<h1>قدّم الآن</h1><img src="/wrong.png">'),dictionary,options),/Optimized version of the original Arabic homepage hero image/);
});

test('deferred video destinations must remain identical across translations',()=>{
  const english=root('<h1>Apply now</h1><video><source data-src="https://cdn.example/original.mp4" type="video/mp4"></video>');
  const dictionary=[{source:'Apply now',target:'अभी आवेदन करें'}];
  const translated=url=>root('<h1>अभी आवेदन करें</h1><video><source data-src="'+url+'" type="video/mp4"></video>');
  assert.doesNotThrow(()=>verifyBody(english,translated('https://cdn.example/original.mp4'),dictionary));
  assert.throws(()=>verifyBody(english,translated('https://cdn.example/wrong.mp4'),dictionary),/Preserve page controls/);
});
test('a correct lang attribute cannot conceal an untranslated initial body',()=>{
  const english=root('<h1>Apply now</h1><p>Earn commissions</p>');
  const dictionary=[{source:'Apply now',target:'अभी आवेदन करें'},{source:'Earn commissions',target:'कमीशन कमाएँ'}];
  assert.throws(()=>verifyBody(english,root('<h1 lang="hi">Apply now</h1><p>Earn commissions</p>'),dictionary),/Translated initial body differs/);
  assert.throws(()=>verifyBody(english,root('<h1>अभी आवेदन करें</h1><p>Earn commissions</p>'),dictionary),/Translated initial body differs/);
  assert.doesNotThrow(()=>verifyBody(english,root('<h1>अभी आवेदन करें</h1><p>कमीशन कमाएँ</p>'),dictionary));
});

test('a CMS title and common layout cannot replace the complete source article body',()=>{
  const {verifyEnglishArticle}=require('./verify-native-release.cjs');
  const article={title:'Trading risks',content:'<p>Leverage can amplify losses.</p><p>Review the disclosure.</p>'};
  assert.throws(()=>verifyEnglishArticle(root('<h1>Trading risks</h1><p>Leverage can amplify losses.</p>'),article),/Full English article body/);
  assert.doesNotThrow(()=>verifyEnglishArticle(root('<h1>Trading risks</h1><p>Leverage can amplify losses.</p><p>Review the disclosure.</p>'),article));
});

test('the final English CMS head preserves its actual article metadata',()=>{
  const {verifyEnglishArticle}=require('./verify-native-release.cjs');
  const article={title:'Trading risks',metaTitle:'Understand Trading Risks | UPFOREX',description:'Review the risks before trading.',content:'<p>Leverage can amplify losses.</p>'};
  const body=root('<h1>Trading risks</h1><p>Leverage can amplify losses.</p>');
  assert.throws(()=>verifyEnglishArticle(body,article,u.parse('<title>Forex Blog Detail | Upforex</title><meta name="description" content="Review the risks before trading.">')),/Current English CMS title/);
  assert.doesNotThrow(()=>verifyEnglishArticle(body,article,u.parse('<title>Understand Trading Risks | UPFOREX</title><meta name="description" content="Review the risks before trading.">')));
});
test('all public components and current CMS articles are discovered, with only approved slug migrations',()=>{
  const pages=u.pageDefinitions();assert(pages.length>=110);assert(pages.some(p=>p.path==='/partnerships/ib-programs'));
  assert(pages.some(p=>p.path==='/blogs/what-is-a-forex-currency-pair'));
  for(const [stored,published]of Object.entries(u.PUBLIC_BLOG_PERMALINKS)){
    assert.equal(u.storedBlogPermalink(published),stored);
    assert(pages.some(page=>page.path==='/blogs/'+published));
    assert.equal(u.canonicalBlogPath('/blogs/'+encodeURIComponent(stored)),'/blogs/'+published);
    assert.equal(u.canonicalBlogPath('/blogs/'+stored.replace(/&/g,'&amp;')),'/blogs/'+published);
  }
  assert.equal(u.canonicalBlogPath('/blogs/unrelated,-slug-&-test'),'/blogs/unrelated,-slug-&-test');
  assert.equal(u.canonicalBlogPath('/blogs/%bad'),'/blogs/%bad');
  assert(pages.every(p=>p.selector&&p.component));
  assert.equal(pages.find(page=>page.path==='/accounts').routeTitle,'UpForex Account Types - Standard, Pro-ECN & Elite-ECN MT5');
  assert.equal(pages.find(page=>page.path==='/forex-trading-manila').routeTitle,'Forex Trading in Manila, Philippines | UPFOREX MT5');
});

test('missing local CMS audit files cannot shrink the public-page release inventory',()=>{
  const current=u.pageDefinitions(),fallback=u.pageDefinitions({data:[]});
  assert.deepEqual(fallback.map(page=>page.path),current.map(page=>page.path));
  assert(fallback.filter(page=>page.cms).length>=60);
});
test('only completed native translations receive self and reciprocal hreflang',()=>{
  assert.deepEqual(alternates('/about-us',[]),{});
  const tags=alternates('/about-us',['hi']);assert.deepEqual(Object.keys(tags),['en','hi','x-default']);
  assert.equal(tags.hi,'https://www.upforex.com/hi/about-us');
});

test('completed public pages cannot pass with blocking robots meta or HTTP headers',()=>{
  const {verifyIndexability}=require('./verify-native-release.cjs');
  assert.doesNotThrow(()=>verifyIndexability(u.parse('<meta name="robots" content="index, follow">')));
  assert.doesNotThrow(()=>verifyIndexability(u.parse('<title>Public page</title>')));
  for(const html of ['<meta name="robots" content="noindex, follow">','<meta name="googlebot" content="index,nofollow">'])assert.throws(()=>verifyIndexability(u.parse(html)),/allow indexing/);
  assert.throws(()=>verifyIndexability(u.parse(''),{'x-robots-tag':'googlebot: noindex'}),/allow indexing/);
  assert.throws(()=>verifyIndexability(u.parse(''),{'x-robots-tag':['index','none']}),/allow indexing/);
});
test('body proof also catches changed buttons, links and assets',()=>{
  const english=root('<a href="/accounts">Apply now</a>'), dictionary=[{source:'Apply now',target:'अभी आवेदन करें'}];
  assert.throws(()=>verifyBody(english,root('<a href="/contact-us">अभी आवेदन करें</a>'),dictionary),/Preserve page controls/);
});

test('rich translations can reorder words while keeping the correct translated text inside links',()=>{
  const sourceMessage='Trade <span data-i18n-slot="0">gold CFDs</span> on MT5.';
  const targetMessage='Auf MT5 handeln Sie <span data-i18n-slot="0">Gold-CFDs</span>.';
  const dictionary=[{sourceMessage,targetMessage,source:u.normalizeContent(u.text(u.parseFragment(sourceMessage))),target:u.normalizeContent(u.text(u.parseFragment(targetMessage)))}];
  const english=root('<p>Trade <a href="/metals">gold CFDs</a> on MT5.</p>');
  assert.doesNotThrow(()=>verifyBody(english,root('<p>Auf MT5 handeln Sie <a href="/metals">Gold-CFDs</a>.</p>'),dictionary));
  assert.throws(()=>verifyBody(english,root('<p><a href="/metals">Auf MT5</a> handeln Sie Gold-CFDs .</p>'),dictionary),/original element/);
});

test('plain labels use their actual key even when a rich message flattens to the same English text',()=>{
  const {translateText}=require('./verify-native-release.cjs');
  const dictionary=[{source:'Social Trading',target:'सामाजिक व्यापार',sourceMessage:'<span data-i18n-slot="0">Social Trading</span>',targetMessage:'<span data-i18n-slot="0">सामाजिक व्यापार</span>'},{source:'Social Trading',target:'सोशल ट्रेडिंग'}];
  assert.equal(translateText('Social Trading',dictionary),'सोशल ट्रेडिंग');
  assert.throws(()=>translateText('Social Trading',dictionary.slice(0,1)),/Uncataloged English/);
});

test('plain text extracted from CMS HTML still uses its exact plain content key',()=>{
  const {dictionaryFor,translateText}=require('./verify-native-release.cjs');
  const key=u.contentKey('Liquidity'),wrapped=u.contentKey('<span data-i18n-slot="0">Liquidity</span>');
  const inventory=new Map([[key,{english:'Liquidity',kind:'html'}],[wrapped,{english:'<span data-i18n-slot="0">Liquidity</span>',kind:'html'}]]);
  const dictionary=dictionaryFor({__nativeSourceKeys:[wrapped,key],COPY:{[key]:'तरलता',[wrapped]:'<span data-i18n-slot="0">लिक्विडिटी</span>'}},inventory);
  assert.equal(translateText('Liquidity :',dictionary),'तरलता :');
  assert.throws(()=>translateText('Liquidity offers new guarantees',dictionary),/Uncataloged English/);
});

test('removed empty Word formatting slots never waive missing text or changed inline links',()=>{
  const sourceMessage='<span data-i18n-slot="0">Trade <span data-i18n-slot="1">gold</span> carefully.</span><span data-i18n-slot="2"><span data-i18n-slot="3"></span></span>';
  const targetMessage='<span data-i18n-slot="0"><span data-i18n-slot="1">सोने</span> का सावधानी से व्यापार करें।</span><span data-i18n-slot="2"><span data-i18n-slot="3"></span></span>';
  const entry={sourceMessage,targetMessage,source:u.text(u.parseFragment(sourceMessage)),target:u.text(u.parseFragment(targetMessage))};
  const en=root('<p><span>Trade <a href="/metals">gold</a> carefully.</span><font></font></p>');
  const native=root('<p><span><a href="/metals">सोने</a> का सावधानी से व्यापार करें।</span><font></font></p>');
  assert.doesNotThrow(()=>verifyBody(en,native,[entry]));
  assert.throws(()=>verifyBody(en,root('<p><span>सोने का सावधानी से व्यापार करें।</span><font></font></p>'),[entry]));
  assert.throws(()=>verifyBody(en,native,[{...entry,targetMessage:targetMessage.replace('slot="3">','slot="3">Added offer')}]),/Uncataloged English/);
  assert.throws(()=>verifyBody(root('<p><span>Trade <a href="/metals">gold</a> carefully. Extra source text.</span><font></font></p>'),native,[entry]),/Uncataloged English/);
});

test('preservation checks reject changed nesting even when the flattened tag list matches',()=>{
  const english=root('<p><span><a href="/apply">Apply now</a></span></p>');
  assert.throws(()=>verifyBody(english,root('<p><span></span><a href="/apply">अभी आवेदन करें</a></p>'),[{source:'Apply now',target:'अभी आवेदन करें'}]),/Preserve page controls/);
});

test('original card initials stay exact without exempting untranslated marketing copy',()=>{
  const english=root('<div class="initial-bg notranslate">MBA</div><p>Apply now</p>');
  assert.doesNotThrow(()=>verifyBody(english,root('<div class="initial-bg notranslate">MBA</div><p>अभी आवेदन करें</p>'),[{source:'Apply now',target:'अभी आवेदन करें'}]));
  const sentence=root('<div class="initial-bg notranslate">Earn more from trading</div>');
  assert.throws(()=>verifyBody(sentence,sentence,[]),/Uncataloged English/);
});
test('translated text with an English image alternative fails completion',()=>{
  const english=root('<p>Apply now</p><img src="/logo.png" alt="Trading platform">');
  const dictionary=[{source:'Apply now',target:'अभी आवेदन करें'},{source:'Trading platform',target:'ट्रेडिंग प्लेटफॉर्म'}];
  assert.throws(()=>verifyBody(english,root('<p>अभी आवेदन करें</p><img src="/logo.png" alt="Trading platform">'),dictionary),/Translated alt/);
});
test('parameterized labels are verified using translated parameters and original numbers',()=>{
  const {translateText}=require('./verify-native-release.cjs');
  assert.equal(translateText('Slide 1 of 7',[{source:'Slide {0} of {1}',target:'{1} में से स्लाइड {0}'}]),'7 में से स्लाइड 1');
  assert.throws(()=>translateText('An untracked English offer',[]),/Uncataloged English/);
});
test('changing CMS category order is accepted only for a verified English fallback category',()=>{
  const {englishFallbackText}=require('./verify-native-release.cjs');
  const listing=category=>root('<article class="article-card"><h5>Lot sizes</h5><span class="article-tag">'+category+'</span></article>');
  const snapshot=[{title:'Lot sizes',categories:[{categoryName:'forex'},{categoryName:'Education'}]}];
  assert.equal(englishFallbackText(listing('forex'),'/blogs',snapshot),englishFallbackText(listing('Education'),'/blogs',snapshot));
  assert.throws(()=>englishFallbackText(listing('शिक्षा'),'/blogs',snapshot),/not original English/);
});
test('a translated body cannot hide an English final router title or description',()=>{
  const {verifyHead}=require('./verify-native-release.cjs');
  const english=u.parse('<title>Apply now</title><meta name="description" content="Earn commissions">');
  const dictionary=[{source:'Apply now',target:'अभी आवेदन करें'},{source:'Earn commissions',target:'कमीशन कमाएँ'}];
  assert.throws(()=>verifyHead(english,u.parse('<title>Apply now</title>'),dictionary),/Translated final router title/);
  assert.throws(()=>verifyHead(english,u.parse('<title>अभी आवेदन करें</title><meta name="description" content="Earn commissions">'),dictionary),/Translated meta description/);
  assert.doesNotThrow(()=>verifyHead(english,u.parse('<title>अभी आवेदन करें</title><meta name="description" content="कमीशन कमाएँ">'),dictionary));
});

test('English blog listing requires actual CMS cards and full descriptions before translated comparisons',()=>{
 const {verifyEnglishBlogListing}=require('./verify-native-release.cjs');
 const article={title:'Trading risks',description:'Review the disclosure before trading.'};
 const loaded='<article class="article-card"><h5>Trading risks</h5><p>Review the disclosure before trading.</p></article>';
 assert.doesNotThrow(()=>verifyEnglishBlogListing(root(loaded),[article]));
 assert.throws(()=>verifyEnglishBlogListing(root('<h1>Blogs</h1><div class="spinner-border"></div>'),[article]),/complete first page/);
 assert.throws(()=>verifyEnglishBlogListing(root(loaded.replace('Review the disclosure before trading.','Review')), [article]),/real article description/);
 assert.throws(()=>verifyEnglishBlogListing(root(loaded),Array.from({length:10},()=>article)),/complete first page/);
});
