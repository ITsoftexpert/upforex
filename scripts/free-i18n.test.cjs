const test=require('node:test'),assert=require('node:assert/strict');
const u=require('./i18n-release-utils.cjs');
const {normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {prepareHtml}=require('./free-i18n-html.cjs');
const {parseAlignedBatch,protectIdentities}=require('./translate-free-catalogs.cjs');
const {financialConsistency,correctTerminology}=require('./free-i18n-domain.cjs');
test('numeric normalization preserves actual amounts and keeps HTML slot IDs untouched',()=>{
  const source='<span data-i18n-slot="0">Minimum 0.01 lots, five days a week</span>';
  const target='<span data-i18n-slot="0">Minimum 0,01 lot, 5 jours par semaine</span>';
  const fixed=normalizeNumbers(source,target,'fr');
  assert.equal(fixed,'<span data-i18n-slot="0">Minimum 0.01 lot, cinq jours par semaine</span>');
  assert.deepEqual(u.validate({english:source,kind:'html'},fixed,'fr'),[]);
  assert.equal(normalizeNumbers('Minimum 0.01 lots','Minimum 0.1 lot','fr'),'Minimum 0.1 lot');
  assert(u.validate({english:'Minimum 0.01 lots',kind:'text'},'Minimum 0.1 lot','fr').includes('Changed numeric values'));
});
test('ordinary provider HTML restores all original empty placeholders and attributes',()=>{
  const source='<span data-i18n-slot="0">Open</span><span data-i18n-slot="1"><span data-i18n-slot="2"></span></span><span data-i18n-slot="3">File</span>';
  const adapter=prepareHtml(source);
  assert.equal(adapter.input,'<span>Open</span><span>File</span>');
  assert.equal(adapter.restore('<span>Ouvrir</span><span>Fichier</span>'),'<span data-i18n-slot="0">Ouvrir</span><span data-i18n-slot="1"><span data-i18n-slot="2"></span></span><span data-i18n-slot="3">Fichier</span>');
  assert.throws(()=>adapter.restore('<span>Ouvrir Fichier</span>'),/tree changed/);
  assert.throws(()=>adapter.restore('<span onclick="run()">Ouvrir</span><span>Fichier</span>'),/tree changed/);
});
test('localized span tag tokens and a missing outer wrapper restore without changing visible copy',()=>{
  const adapter=prepareHtml('<span data-i18n-slot="0">Inflation</span>');
  assert.equal(adapter.restore('<envergure>Inflation française</span>'),'<span data-i18n-slot="0">Inflation française</span>');
  assert.equal(adapter.restore('Inflation française'),'<span data-i18n-slot="0">Inflation française</span>');
  assert.throws(()=>adapter.restore('<script>alert(1)</script>'),/tree changed/);
});
test('source alignment preserves entry identity even if Arabic removes target markers',()=>{
  const input='\uE0000000\uE001\nFirst\n\uE0000001\uE001\nSecond';
  const response={rows:[['0000\n','\uE0000000\uE001\n'],['الأول\n','First\n'],['0001\n','\uE0000001\uE001\n'],['الثاني','Second']]};
  assert.deepEqual(parseAlignedBatch(response,input,2),['الأول','الثاني']);
  assert.throws(()=>parseAlignedBatch(response,input+' omitted',2),/reconstruction mismatch/);
});
test('registered identities are restored exactly and unresolved placeholders are held',()=>{
  const protectedText=protectIdentities('UPFOREX uses MetaTrader 5 and MT4');
  assert(!protectedText.input.includes('MetaTrader'));
  assert.equal(protectedText.restore(protectedText.input),'UPFOREX uses MetaTrader 5 and MT4');
  assert.throws(()=>protectedText.restore('https://upx-entity-unknown.invalid'),/placeholder changed/);
});
test('financial QA rejects swapped margin-call and stop-out percentages',()=>{
  const source='The margin-call level is 50% and the stop-out level is 30%.';
  assert.equal(financialConsistency(source,'追加保证金水平为50%，强制平仓水平为30%。','zh-CN').problems.length,0);
  assert(financialConsistency(source,'追加保证金水平为30%，强制平仓水平为50%。','zh-CN').problems.length);
  assert(financialConsistency('Returns are not guaranteed.','Les rendements sont garantis.','fr').problems.length);
  assert.equal(financialConsistency('Returns are not guaranteed.','Les rendements ne sont pas garantis.','fr').problems.length,0);
});
test('domain edits correct financial terminology without changing a different stop-loss condition',()=>{
  assert.equal(correctTerminology('Pips','Pépins','fr').translation,'pips');
  assert.equal(correctTerminology('The stop-out level is 30%.','止损水平为30%。','zh-CN').translation,'强制平仓水平为30%。');
  assert.equal(correctTerminology('Set a stop-loss order.','设置止损订单。','zh-CN').translation,'设置止损订单。');
  assert.equal(correctTerminology('24 hours a day','24 heures sur 24','fr').translation,'24 heures par jour');
  assert.equal(correctTerminology('24/7 support','24/7 assistance','fr').translation,'24/7 assistance');
});

test('nested HTML slots cannot move outside their original parent',()=>{
  const entry={kind:'html',english:'<span data-i18n-slot="0">Trade <span data-i18n-slot="1">gold</span></span>'};
  assert(u.validate(entry,'<span data-i18n-slot="0">Négociez</span><span data-i18n-slot="1">de l’or</span>','fr').includes('Changed HTML elements, attributes or URLs'));
});

test('license number abbreviations and French feminine denials are recognized accurately',()=>{
  assert.deepEqual(financialConsistency('License No. 20200000350','Licence n° 20200000350','fr').problems,[]);
  assert.deepEqual(financialConsistency('License No. GB25204570','Licence n° GB25204570','fr').problems,[]);
  assert.deepEqual(financialConsistency('Margin-call level 50%, stop-out level 30%.','मार्जिन-कॉल स्तर 50%, स्टॉप-आउट स्तर 30%।','hi').problems,[]);
  assert(financialConsistency('Margin-call level 50%, stop-out level 30%.','मार्जिन-कॉल स्तर 30%, स्टॉप-आउट स्तर 50%।','hi').problems.length);
  assert.deepEqual(financialConsistency('No separate commission.','Aucune commission distincte.','fr').problems,[]);
  assert(financialConsistency('No separate commission.','Une commission distincte.','fr').problems.length);
});

test('publication requires current, finite and value-preserving reverse evidence',()=>{
  const crypto=require('node:crypto'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
  const {eligible}=require('./write-validated-free-memory.cjs');
  const row={kind:'text',english:'Minimum deposit $100',translation:'Dépôt minimum de 100 $',similarity:.70,threshold:.84,status:'roundtrip-semantic-pass'};
  row.backValidation={passed:true,similarity:.99,threshold:.92,sourceEnglishSha256:hash(row.english),sourceTargetSha256:hash(row.translation),backTranslation:'Minimum deposit $100'};
  assert.equal(eligible(row,'fr'),true);
  for(const patch of [{threshold:0},{threshold:undefined},{similarity:NaN},{sourceEnglishSha256:'stale'},{sourceTargetSha256:'stale'},{backTranslation:'Minimum deposit $1000'},{backTranslation:'Minimum deposit $100. The The Atheth'}])assert.equal(eligible({...row,backValidation:{...row.backValidation,...patch}},'fr'),false);
});

test('written quantities cannot consume the digits inside registered product names',()=>{
  assert.equal(normalizeNumbers('MT5 across five systems','5つのシステムでMT5','ja'),'五つのシステムでMT5');
  assert.equal(normalizeNumbers('A single MT5 account','1つのMT5口座','ja'),'一つのMT5口座');
  assert.equal(normalizeNumbers('Sell for CHF 1,740',"Vendez pour CHF 1'740",'fr'),'Vendez pour CHF 1,740');
  assert.equal(normalizeNumbers('The second currency','2番目の通貨','ja'),'二番目の通貨');
  assert.equal(normalizeNumbers('24 hours a day','1日24時間','ja'),'一日24時間');
});

test('unpublished draft edits cannot invalidate completed page catalogs',()=>{
  const {publishedTranslations}=require('./prepare-native-catalogs.cjs');
  const pages=[{path:'/about-us',requiredKeys:['heading']},{path:'/blogs/article',requiredKeys:['body']}];
  const complete={'/about-us':['fr']},before={fr:{heading:'À propos',body:'Brouillon'}};
  const input=publishedTranslations(pages,complete,before);
  assert.deepEqual(input,publishedTranslations(pages,complete,{fr:{...before.fr,body:'Un autre brouillon'}}));
  assert.notDeepEqual(input,publishedTranslations(pages,complete,{fr:{...before.fr,heading:'Qui sommes-nous'}}));
  assert.notDeepEqual(input,publishedTranslations(pages,{...complete,'/blogs/article':['fr']},before));
});

test('registered agency labels and license identifiers never exempt surrounding English prose',()=>{
  assert.equal(u.needsContentTranslation('Bureau of Internal Revenue (BIR) :'),false);
  assert.equal(u.needsContentTranslation('GB25204570'),false);
  assert.equal(u.needsContentTranslation('Bureau of Internal Revenue (BIR) provides tax guidance'),true);
  assert.equal(u.needsContentTranslation('Review license GB25204570 before applying'),true);
  assert.equal(u.needsContentTranslation('€1 = US$1.0850'),false);
  assert.equal(u.needsContentTranslation('€1 = US$1.0850 offers an opportunity'),true);
  for(const label of ['$3.06T','$310B','Pepperstone','Meta'])assert.equal(u.needsContentTranslation(label),false);
  for(const prose of ['$310B in guaranteed returns','Pepperstone offers low costs','Meta shares may fall'])assert.equal(u.needsContentTranslation(prose),true);
});

test('legacy slot quotes can be repaired without accepting changed nesting or active attributes',()=>{
  const {restoredDraft}=require('./review-free-catalogs.cjs');
  const entry={kind:'html',english:'<span data-i18n-slot="0">Gold prices vary.</span>'};
  assert.equal(restoredDraft(entry,{translation:'<span data-i18n-slot="”0”">Les prix de l’or varient.</span>'}),'<span data-i18n-slot="0">Les prix de l’or varient.</span>');
  const unsafe='<span onclick="run()">Les prix varient.</span>';
  assert.equal(restoredDraft(entry,{translation:unsafe}),unsafe);
  const nested={kind:'html',english:'<span data-i18n-slot="0">Trade <span data-i18n-slot="1">gold</span></span>'};
  const moved='<span data-i18n-slot="0">Négociez</span><span data-i18n-slot="1">de l’or</span>';
  assert.equal(restoredDraft(nested,{translation:moved}),moved);
});

test('a known local-model prefix artifact cannot pass as translated prose',()=>{
  assert(u.validate({english:'The best introducing broker programs',kind:'text'},'The The Atheth सबसे अच्छे इंट्रोड्यूसिंग ब्रोकर प्रोग्राम','hi').includes('Unresolved machine translation artifact'));
});

test('ordinary negative constructions retain exclusions without waiving a positive promise',()=>{
  const examples=[
    ['de','No. Gold and silver have different demand drivers.','Nein. Gold und Silber haben unterschiedliche Nachfragetreiber.'],
    ['de','Monitor developments rather than focusing only on charts.','Beobachten Sie Entwicklungen, anstatt sich nur auf Charts zu konzentrieren.'],
    ['es','Even experienced traders cannot predict every market movement.','Ni siquiera los traders experimentados pueden predecir todos los movimientos del mercado.'],
    ['pt','Not every trader has the same goals.','Nem todo trader tem os mesmos objetivos.'],
    ['ar','These differences explain why gold and silver do not always move together.','تفسر هذه الاختلافات سبب عدم تحرك الذهب والفضة دائمًا معًا.'],
    ['ja','No. Gold and silver have different demand drivers.','いいえ。金と銀では需要要因が異なります。'],
  ];
  for(const [language,source,target] of examples)assert.deepEqual(financialConsistency(source,target,language).problems,[]);
  assert(financialConsistency('Returns are not guaranteed.','Renditen sind garantiert.','de').problems.length);
});
