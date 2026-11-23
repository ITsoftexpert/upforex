const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), https = require('node:https'), util = require('node:util');
const assert = require('node:assert/strict');
const u = require('./i18n-release-utils.cjs');
const {richContentUnits,isOpaqueContent}=require('./i18n-utils.cjs');
const {effectivePageMetadata}=require('./page-metadata.cjs');
const origin = 'https://www.upforex.com', normalize = u.normalizeContent;
function alternates(page, completed) {
  if (!completed.length) return {};
  const suffix = page === '/' ? '' : page;
  return {en:origin+page,...Object.fromEntries(completed.map(l=>[({'zh-CN':'zh-Hans','zh-TW':'zh-Hant',pt:'pt-BR'})[l]||l,`${origin}/${u.prefixes[l]}${suffix}`])),
    ...(completed.includes('pt')?{pt:origin+'/pt'+suffix}:{}),'x-default':origin+page};
}
const tags = (doc,rel) => u.elements(doc,'link').filter(n=>u.attribute(n,'rel')===rel);
function verifyEmailProtection(html,doc) {
  assert(/<!--email_off-->\s*<app-root(?:\s|>)/i.test(html),'Cloudflare email exclusion starts outside the Angular root');
  assert(/<\/app-root>\s*<!--\/email_off-->/.test(html),'Cloudflare email exclusion ends outside the Angular root');
  for(const a of u.elements(doc,'a')) {
    const href=u.attribute(a,'href');
    if(href)assert(new URL(href,origin).pathname!=='/cdn-cgi/l/email-protection','Public origin must not emit Cloudflare placeholder email links');
  }
  return true;
}
function verifyIndexability(doc,headers={}){
  const directives=u.elements(doc,'meta').filter(node=>/^(?:robots|googlebot)$/i.test(u.attribute(node,'name')||'')).map(node=>u.attribute(node,'content')||'');
  const header=headers['x-robots-tag'];directives.push(...(Array.isArray(header)?header:[header||'']));
  assert(!directives.some(value=>/(?:^|[\s,;:])(?:noindex|nofollow|none)(?:$|[\s,;])/i.test(value)),'Completed public page must allow indexing and following in meta and HTTP robots directives');
}
function verifyMetadata(doc,page,language,requested,completed,headers) {
  const html=u.elements(doc,'html')[0];
  assert.equal(u.attribute(html,'lang'),language,'Initial HTML language');
  assert.equal(u.attribute(html,'dir'),language==='ar'?'rtl':'ltr','Initial HTML direction');
  const canonical=tags(doc,'canonical'); assert.equal(canonical.length,1,'One canonical required');
  assert.equal(u.attribute(canonical[0],'href'),origin+(language==='en'?page:'/'+u.prefixes[language]+(page==='/'?'':page)),'Canonical');
  const links=tags(doc,'alternate').filter(n=>u.attribute(n,'hreflang'));
  const expected=requested===language?alternates(page,completed):{};
  assert.equal(links.length,Object.keys(expected).length,'Completed self-referencing alternate count');
  assert.deepEqual(Object.fromEntries(links.map(n=>[u.attribute(n,'hreflang'),u.attribute(n,'href')])),expected,'Reciprocal alternates');
  if(language===requested)verifyIndexability(doc,headers);
}
function bodyText(node) {
  if (['script','style','noscript'].includes(node?.tagName)) return '';
  // This button intentionally displays the selected language's flag/code.
  // Verify language metadata separately; do not translate language identities.
  if (u.attribute(node || {},'id') === 'languages') return '[language selector]';
  if (u.attribute(node || {},'aria-labelledby') === 'languages') return '[language menu]';
  return node?.nodeName==='#text'?node.value:(node?.childNodes||[]).map(bodyText).join(' ');
}
function dictionaryFor(chunk,inventory) {
  return chunk.__nativeSourceKeys.map(key=>{
    const entry=inventory.get(key), plain=v=>normalize(entry.kind==='html'?bodyText(u.parseFragment(v)):v);
    return {key,source:plain(entry.english),target:plain(chunk.COPY[key]),
      ...(entry.kind==='html'&&/<\/?[a-z][^>]*>/i.test(entry.english)?{sourceMessage:entry.english,targetMessage:chunk.COPY[key]}:{})};
  }).sort((a,b)=>b.source.length-a.source.length);
}
// Shared header/footer and recommendation messages occur in many page
// catalogs. Reuse a result only for the exact source, target and language;
// every rendered body and every individual catalog value is still checked.
function catalogValidator(inventory) {
  const checked=new Map();
  return (key,target,language)=>{
    const source=inventory.get(key);assert(source,'Unknown source key');
    const id=JSON.stringify([language,key]),previous=checked.get(id);
    if(previous&&previous.english===source.english&&previous.kind===source.kind&&previous.target===target)return previous.problems;
    const problems=u.validate(source,target,language);
    checked.set(id,{english:source.english,kind:source.kind,target,problems});
    return problems;
  };
}
const textTables=new WeakMap();
function textTable(dictionary){
  let table=textTables.get(dictionary);if(table)return table;
  // Rich messages are keyed by their original markup in the runtime. Their
  // flattened text is not an alternative translation for a plain label.
  const entries=dictionary.filter(entry=>!entry.sourceMessage),exact=new Map();
  for(const entry of entries)if(!exact.has(entry.source))exact.set(entry.source,entry);
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const phrases=entries.filter(entry=>entry.source.length>1);
  table={exact,parameters:entries.filter(entry=>/\{\d+\}/.test(entry.source)),lookup:new Map(phrases.map(entry=>[entry.source,entry.target])),
    matcher:phrases.length?new RegExp('(?<![\\p{L}\\p{N}])(?:'+phrases.map(entry=>escape(entry.source)).join('|')+')(?![\\p{L}\\p{N}])','gu'):null};
  textTables.set(dictionary,table);return table;
}
function translateText(value,dictionary) {
  const table=textTable(dictionary),plain=normalize(value),exact=table.exact.get(plain);
  if(exact) return exact.target;
  for(const entry of table.parameters) {
    const indexes=[...entry.source.matchAll(/\{(\d+)\}/g)].map(m=>m[1]);
    const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const expression='^'+entry.source.split(/\{\d+\}/).map(escape).join('(.+?)')+'$';
    const match=new RegExp(expression,'u').exec(plain);
    if(match) {
      const params=Object.fromEntries(indexes.map((index,i)=>[index,translateText(match[i+1],dictionary)]));
      return entry.target.replace(/\{(\d+)\}/g,(_,index)=>params[index]);
    }
  }
  if(!table.matcher) {
    assert(!u.needsContentTranslation(plain),'Uncataloged English body text: '+plain);
    return plain;
  }
  const remainder=normalize(plain.replace(table.matcher,' '));
  assert(!u.needsContentTranslation(remainder),'Uncataloged English body text: '+plain);
  return plain.replace(table.matcher,match=>table.lookup.get(match));
}
function comparableRichMessage(message){
  const root=u.parseFragment(message),slots=[],empty=[];
  const visit=node=>{
    node.childNodes=(node.childNodes||[]).filter(child=>{
      if(child.tagName==='span'&&!normalize(bodyText(child))){
        empty.push(...u.elements(child,'span').map(item=>Number(u.attribute(item,'data-i18n-slot'))));return false;
      }
      visit(child);return true;
    });
  };
  visit(root);
  for(const span of u.elements(root,'span')){
    const attribute=span.attrs.find(item=>item.name==='data-i18n-slot');
    assert(attribute,'Original rich slot identity');slots.push(Number(attribute.value));attribute.value=String(slots.length-1);
  }
  return {fingerprint:normalize(u.serialize(root)),slots,empty};
}
function richBodyExpectations(root,dictionary) {
  const messages=new Map(dictionary.filter(entry=>entry.sourceMessage).map(entry=>[normalize(entry.sourceMessage),entry]));
  let comparableMessages;
  const starts=new Map(),skipped=new Set(),slots=new Map();
  for(const unit of richContentUnits(root)) {
    let entry=messages.get(normalize(unit.message)),slotMap;
    if(!entry){
      // Angular removes unsupported empty MS Word elements (for example o:p).
      // Reconcile only empty slots, retaining the exact nonempty slot tree.
      // The full rendered element/attribute structure is still checked below.
      if(!unit.message.includes('data-i18n-slot'))continue;
      if(!comparableMessages){
        comparableMessages=new Map();
        for(const item of dictionary.filter(item=>item.sourceMessage)){
          const source=comparableRichMessage(item.sourceMessage);
          if(!source.empty.length)continue;
          const target=u.parseFragment(item.targetMessage);
          if(source.empty.some(index=>u.elements(target,'span').some(node=>Number(u.attribute(node,'data-i18n-slot'))===index&&normalize(bodyText(node)))))continue;
          if(!comparableMessages.has(source.fingerprint))comparableMessages.set(source.fingerprint,[]);
          comparableMessages.get(source.fingerprint).push({entry:item,source});
        }
      }
      const actual=comparableRichMessage(unit.message);
      if(actual.empty.some(index=>normalize(bodyText(unit.originals[index]))))continue;
      const candidates=(comparableMessages.get(actual.fingerprint)||[]).map(({entry:item,source})=>({entry:item,slotMap:new Map(source.slots.map((index,i)=>[index,actual.slots[i]]))}));
      if(candidates.length!==1)continue;
      ({entry,slotMap}=candidates[0]);
    }
    const translated=u.parseFragment(entry.targetMessage);
    const text=node=>{
      const slot=u.attribute(node,'data-i18n-slot'),index=slotMap?slotMap.get(Number(slot)):Number(slot),original=slot===undefined?undefined:unit.originals[index];
      if(original&&isOpaqueContent(original))return bodyText(original);
      return node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join(' ');
    };
    starts.set(unit.nodes[0],text(translated));unit.nodes.slice(1).forEach(node=>skipped.add(node));
    for(const node of u.elements(translated,'span')) {
      const index=u.attribute(node,'data-i18n-slot');if(index===undefined)continue;
      const original=unit.originals[slotMap?slotMap.get(Number(index)):Number(index)];
      if(original?.tagName&&!isOpaqueContent(original))slots.set(original,normalize(text(node)));
    }
  }
  return {starts,skipped,slots};
}
function expectedBody(node,dictionary,rich) {
  if(['script','style','noscript'].includes(node.tagName)) return '';
  if(u.attribute(node,'id') === 'languages') return '[language selector]';
  if(u.attribute(node,'aria-labelledby') === 'languages') return '[language menu]';
  const classes=(u.attribute(node,'class')||'').split(/\s+/);
  // Original city/card initials (for example MBA for Mombasa) are explicit
  // notranslate identifiers. This never exempts a sentence or an arbitrary
  // element merely because somebody adds a notranslate class.
  if(classes.includes('initial-bg')&&classes.includes('notranslate')&&/^[A-Z]{1,4}$/.test(normalize(bodyText(node))))return bodyText(node);
  if(rich.starts.has(node))return rich.starts.get(node);
  if(rich.skipped.has(node))return '';
  if(isOpaqueContent(node))return bodyText(node);
  return node.nodeName==='#text'?translateText(node.value,dictionary):(node.childNodes||[]).map(n=>expectedBody(n,dictionary,rich)).join(' ');
}
function structure(node,depth=0) {
  if(['script','style','noscript'].includes(node.tagName)) return [];
  const attrs=(node.attrs||[]).filter(a=>['href','src','data-src','type','name','id','action','width','height','style','target'].includes(a.name)).map(a=>[
    a.name,a.name==='href'?a.value.replace(/^\/(?:hi|ar|fr|es|de|zh-cn|zh-tw|ja|pt|ru)(?=\/|$)/,'')||'/':a.name==='id'?a.value.replace(/\bngb-slide-\d+\b/g,'ngb-slide-generated'):a.value
  ]);
  return [...(node.tagName?[{tag:node.tagName,depth,attrs}]:[]),...(node.childNodes||[]).flatMap(child=>structure(child,depth+1))];
}
function listingCategoryProjection(root,dictionary,snapshot,language){
  const clone=(node,parent)=>{
    const {parentNode,childNodes,attrs,...rest}=node,result={...rest,parentNode:parent};
    if(attrs)result.attrs=attrs.map(attr=>({...attr}));
    if(childNodes)result.childNodes=childNodes.map(child=>clone(child,result));
    return result;
  };
  const copy=clone(root),cards=u.elements(copy,'article').filter(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('article-card'));
  let verified=0;
  for(const card of cards){
    const heading=u.elements(card,'h5')[0],href=u.attribute(u.elements(heading||{},'a')[0]||{},'href');
    assert(href,'CMS card needs its real article link');
    const url=new URL(href,origin);
    assert.equal(url.origin,origin,'CMS card links must be internal');
    const article=snapshot.find(item=>'/blogs/'+u.publicBlogPermalink(item.permaLink)===url.pathname);
    assert(article,'Unknown CMS listing article: '+url.pathname);
    assert.equal(normalize(bodyText(heading)),language==='en'?normalize(article.title):translateText(article.title,dictionary),'CMS listing title must belong to this article');
    for(const tag of u.elements(card,'span').filter(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('article-tag'))){
      const value=normalize(bodyText(tag));
      const candidates=(article.categories||[]).map(category=>category.categoryName);
      const matched=candidates.some(source=>{
        const target=language==='en'?normalize(source):translateText(source,dictionary);
        if(language!=='en'&&u.validate({english:source,kind:'text'},target,language).length)return false;
        return target===value;
      });
      assert(matched,language==='en'?'Category is not original English CMS content: '+value:'Category is not a complete native translation of this article’s source categories: '+value);
      // Compare all other content exactly. Only this independently validated
      // backend-selected field receives a non-language comparison sentinel.
      tag.childNodes=[{nodeName:'#text',value:'∎',parentNode:tag}];verified++;
    }
  }
  return {root:copy,verified};
}
function recommendationProjection(root,dictionary,snapshot,language){
  const clone=(node,parent)=>{const {parentNode,childNodes,attrs,...rest}=node,result={...rest,parentNode:parent};if(attrs)result.attrs=attrs.map(attr=>({...attr}));if(childNodes)result.childNodes=childNodes.map(child=>clone(child,result));return result;};
  const copy=clone(root),component=u.elements(copy,'app-blogs')[0];
  assert(component,'CMS article component required');
  const sidebar=u.elements(component,'div').find(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('sidebar'));
  assert(sidebar,'Original recommended-article sidebar required');
  const list=u.elements(sidebar,'ul').find(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('list-unstyled'));
  assert(list,'Original recommended-article list required');
  let verified=0;
  const businessClasses=node=>(u.attribute(node,'class')||'').split(/\s+/).filter(value=>value&&!value.startsWith('ng-')).sort();
  for(const row of (list.childNodes||[]).filter(node=>node.tagName)){
    assert.equal(row.tagName,'li','Recommendation must preserve its list row');
    assert.deepEqual(businessClasses(row),['mb-3']);
    const children=(row.childNodes||[]).filter(node=>node.tagName);
    assert.deepEqual(children.map(node=>node.tagName),['a','p'],'Recommendation controls and text structure');
    const [link,description]=children,url=new URL(u.attribute(link,'href'),origin);
    assert.equal(url.origin,origin);assert(!url.search&&!url.hash,'Canonical recommendation link');
    const article=snapshot.find(item=>'/blogs/'+u.publicBlogPermalink(item.permaLink)===url.pathname);
    assert(article,'Unknown recommended CMS article: '+url.pathname);
    const expected=value=>language==='en'?normalize(value):translateText(value,dictionary);
    assert.equal(normalize(bodyText(link)),expected(article.title),'Recommended title must be a complete translation of its current source');
    const snippet=article.description.slice(0,200),suffix=article.description.length>200?'...':'';
    // The runtime preserves a source interpolation's boundary whitespace.
    // Keep the gap before a separately interpolated ellipsis when present.
    const gap=/\s$/.test(snippet)?' ':'';
    assert.equal(normalize(bodyText(description)),normalize(expected(snippet)+gap+suffix),'Recommended description must be a complete translation of its current source');
    if(language!=='en')for(const source of [article.title,snippet])assert.deepEqual(u.validate({english:source,kind:'text'},expected(source),language),[],'English fallback cannot prove a translated recommendation');
    assert.deepEqual(businessClasses(link),['fw-semibold','text-decoration-none','tw-text-themePrimary'].sort());
    assert.deepEqual(businessClasses(description),['mb-0','small']);
    assert(!(description.childNodes||[]).some(node=>node.tagName),'Description interpolation must remain text');
    const icons=u.elements(link,'ng-icon');assert.equal(icons.length,1,'Original recommendation icon');
    assert.equal(u.attribute(icons[0],'name'),'matOpenInNew','Original recommendation icon identity');
    verified++;
  }
  // Backend recommendations vary per request. Their current source, native
  // text, destination and control structure were checked above; compare the
  // entire remaining article/layout without assuming an identical sample.
  list.childNodes=[];
  return {root:copy,verified};
}
function verifyBody(english,localized,dictionary,options={}) {
  assert(localized,'Public body missing');
  const originalCharacters=normalize(bodyText(localized)).length;
  let verifiedCategoryFields=0;
  let verifiedRecommendationRows=0;
  if(options.page==='/blogs'&&options.cmsSnapshot){
    english=listingCategoryProjection(english,dictionary,options.cmsSnapshot,'en').root;
    const checked=listingCategoryProjection(localized,dictionary,options.cmsSnapshot,options.language);
    localized=checked.root;verifiedCategoryFields=checked.verified;
  }
  if(options.page?.startsWith('/blogs/')&&options.cmsSnapshot){
    english=recommendationProjection(english,dictionary,options.cmsSnapshot,'en').root;
    const checked=recommendationProjection(localized,dictionary,options.cmsSnapshot,options.language);
    localized=checked.root;verifiedRecommendationRows=checked.verified;
  }
  const rich=richBodyExpectations(english,dictionary);
  const expected=normalize(expectedBody(english,dictionary,rich)), actual=normalize(bodyText(localized));
  if(expected!==actual) {
    let at=0;while(at<expected.length&&expected[at]===actual[at])at++;
    throw new Error(`Translated initial body differs at ${at}; expected ${JSON.stringify(expected.slice(Math.max(0,at-50),at+150))}; actual ${JSON.stringify(actual.slice(Math.max(0,at-50),at+150))}`);
  }
  assert(actual!==normalize(bodyText(english)),'English fallback is not translated content');
  const expectedStructure=structure(english),actualStructure=structure(localized);
  if(options.page==='/'&&options.language==='ar') {
    // The homepage keeps the original Arabic artwork in its reviewed WebP.
    // Require the exact asset and hash; every other image/control stays exact.
    const index=expectedStructure.findIndex(node=>node.tag==='img'&&node.attrs.some(([name,value])=>name==='src'&&value.endsWith('assets/images/JPG/home_banner_temp_1.webp')));
    assert(index>=0,'Original homepage hero image required');
    const target=actualStructure[index]?.attrs.find(([name])=>name==='src');
    assert.equal(target?.[1],'assets/images/optimized/home-banner-ar.37150fc69f4015a4.webp','Optimized version of the original Arabic homepage hero image');
    assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('src/'+target[1])).digest('hex').slice(0,16),'37150fc69f4015a4','Arabic hero bytes must match the reviewed optimized asset');
    expectedStructure[index].attrs.find(([name])=>name==='src')[1]='[original localized hero]';target[1]='[original localized hero]';
  }
  assert.deepEqual(actualStructure,expectedStructure,'Preserve page controls, links, assets and structure');
  const allElements=node=>[...(node.tagName?[node]:[]),...(node.childNodes||[]).flatMap(allElements)];
  const before=allElements(english),after=allElements(localized);
  for(let i=0;i<before.length;i++)if(rich.slots.has(before[i])) {
    const expectedText=rich.slots.get(before[i]);
    if(before[i].tagName==='a'&&normalize(bodyText(before[i])))assert(expectedText,'Translated links must retain accessible text: '+JSON.stringify({text:normalize(bodyText(before[i])),href:u.attribute(before[i],'href')}));
    assert.equal(normalize(bodyText(after[i])),expectedText,'Translated inline link/emphasis text must stay in its original element');
  }
  for(let i=0;i<before.length;i++) for(const name of ['alt','title','placeholder','aria-label']) {
    const source=u.attribute(before[i],name);
    if(source!==undefined)assert.equal(normalize(u.attribute(after[i],name)||''),translateText(source,dictionary),'Translated '+name+' on '+before[i].tagName);
  }
  assert(!/\b(?:nav\.(?:home|about)|FOOTER\.[A-Z_]+|IB\.[A-Z_]+|COPY\.t[\da-f]+)\b/.test(actual),'Unresolved dictionary keys');
  return {characters:originalCharacters,translatedMessages:dictionary.length,verifiedCategoryFields,verifiedRecommendationRows};
}
function englishFallbackText(root,page,snapshot) {
  if(page.startsWith('/blogs/'))return normalize(bodyText(recommendationProjection(root,[],snapshot,'en').root));
  if(page!=='/blogs') return normalize(bodyText(root));
  const copy=u.parseFragment(u.serialize(root));
  // The live CMS returns category arrays in varying order. The existing view
  // displays categories[0]. Validate that field against this article's actual
  // English categories, then compare all remaining English text exactly.
  for(const card of u.elements(copy,'article').filter(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('article-card'))) {
    const title=normalize(bodyText(u.elements(card,'h5')[0]));
    const article=snapshot.find(item=>normalize(item.title)===title);assert(article,'CMS listing source changed: '+title);
    for(const tag of u.elements(card,'span').filter(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('article-tag'))) {
      const value=normalize(bodyText(tag));
      assert((article.categories||[]).some(category=>normalize(category.categoryName)===value),'Fallback category is not original English CMS content: '+value);
      tag.childNodes=[{nodeName:'#text',value:'[validated English CMS category]',parentNode:tag}];
    }
  }
  return normalize(bodyText(copy));
}
function verifyHead(english,localized,dictionary,approved,cmsArticle) {
  const titles=u.elements(localized,'title');assert.equal(titles.length,1,'One page title required');
  assert(normalize(bodyText(titles[0])),'Page title cannot be empty');
  assert.equal(normalize(bodyText(titles[0])),approved?.title || translateText(bodyText(u.elements(english,'title')[0]),dictionary),'Translated final router title');
  for(const name of ['description','keywords']) {
    const find=document=>u.elements(document,'meta').find(node=>u.attribute(node,'name')===name);
    const original=u.attribute(find(english)||{},'content');
    if(original){
      let expected=name==='description'&&approved?approved.description:undefined;
      if(name==='keywords'&&cmsArticle){
        assert.equal(original,cmsArticle.tags.join(','),'Original CMS keywords must match the current source tags');
        expected=cmsArticle.tags.map(tag=>(/^\s/.test(tag)?' ':'')+translateText(tag,dictionary)+(/\s$/.test(tag)?' ':'')).join(',');
      }
      assert.equal(normalize(u.attribute(find(localized)||{},'content')||''),normalize(expected??translateText(original,dictionary)),'Translated meta '+name);
    }
  }
}
function verifySheetMetadata(document, approved) {
  if (!approved) return false;
  const titles=u.elements(document,'title');assert.equal(titles.length,1,'One sheet title required');
  assert.equal(bodyText(titles[0]),approved.title,'Exact approved sheet title');
  const descriptions=u.elements(document,'meta').filter(node=>u.attribute(node,'name')==='description');
  assert.equal(descriptions.length,1,'One sheet description required');
  assert.equal(u.attribute(descriptions[0],'content'),approved.description,'Exact approved sheet description');
  return true;
}
function verifyEnglishArticle(component,article,document,approvedMetadata) {
  assert(component&&article&&typeof article.content==='string','Current English CMS source and rendered article required');
  const actual=normalize(bodyText(component)),title=normalize(article.title||'');
  const content=normalize(bodyText(u.parseFragment(article.content)));
  assert(title&&actual.includes(title),'English article title was not rendered');
  assert(content&&actual.includes(content),'Full English article body differs from its source; a header or empty article is not content proof');
  if(document&&!approvedMetadata){
    const titles=u.elements(document,'title');
    assert.equal(titles.length,1,'One current CMS title required');
    assert.equal(bodyText(titles[0]),article.metaTitle,'Current English CMS title must not be replaced by the generic router title');
    const descriptions=u.elements(document,'meta').filter(node=>u.attribute(node,'name')==='description');
    assert.equal(descriptions.length,1,'One current CMS description required');
    assert.equal(u.attribute(descriptions[0],'content'),article.description,'Current English CMS description');
  }
}
function verifyEnglishBlogListing(component,snapshot) {
  assert(component&&snapshot.length,'English blog listing source required');
  const cards=u.elements(component,'article').filter(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('article-card'));
  assert.equal(cards.length,Math.min(10,snapshot.length),'Initial English blog listing must contain the complete first page of real article cards; a spinner/guide list is not a loaded blog page');
  for(const card of cards){
    const title=normalize(bodyText(u.elements(card,'h5')[0]));
    const article=snapshot.find(item=>normalize(item.title)===title);
    assert(article,'Initial listing title must match an existing English CMS article');
    assert(normalize(bodyText(card)).includes(normalize(article.description)),'Initial listing must preserve the real article description');
  }
  assert(!u.elements(component,'div').some(node=>(u.attribute(node,'class')||'').split(/\s+/).includes('spinner-border')),'Initial blog listing must finish loading');
}
const requireComplete=args=>args.includes('--require-complete')||!args.includes('--allow-partial');
async function verifyRelease(kind) {
  process.chdir(u.root);fs.mkdirSync('tmp',{recursive:true});
  const strict=requireComplete(process.argv.slice(2)),remote=process.argv.find(a=>a.startsWith('--base-url='));
  const manifest=u.coverage(),definitions=u.pageDefinitions();
  const sheetMetadata=u.read('scripts/data/seo-metadata.json',{pages:{}});
  const inventory=new Map(u.read('tmp/native-content-inventory.json',{entries:[]}).entries.map(e=>[e.key,e]));
  const validateCatalog=catalogValidator(inventory);
  const cmsSnapshot=u.read('tmp/english-blog-api.json',{data:[]}).data;
  const missing=definitions.flatMap(p=>u.languages.filter(l=>!(manifest.COMPLETED_NATIVE_PAGES[p.path]||[]).includes(l)).map(l=>({page:p.path,language:l})));
  const results=[],failures=[],audits=new Map(),englishLinks=new Map(),originalConsole={log:console.log,warn:console.warn,error:console.error};
  let server,logs,base,restoreCms,cmsStore;
  const cmsOrigin=require('./local-cms-transport.cjs').localCmsOrigin();
  assert(!cmsOrigin,'Frontend-only release checks must not use a modified fixture backend');
  assert(!(remote&&cmsOrigin),'Remote production verification cannot redirect CMS traffic to a local fixture backend');
  const reportPath=`tmp/${remote?'live-':''}${kind==='seo'?'seo':'ssr-i18n'}-verification.json`;
  // Independent audits retain their own evidence and coverage output. They
  // may run concurrently without overwriting initial HTML or report files.
  const verifiedDirectory=kind==='seo'?'tmp/verified-initial-html':'tmp/ssr-i18n-verified-initial-html';
  const auditedDirectory=kind==='seo'?'tmp/audited-initial-html':'tmp/ssr-i18n-audited-initial-html';
  const coverageSnapshot=u.read('tmp/i18n-coverage-report.json',null);
  try {
    assert(inventory.size,'English source inventory required');
    const imported=require('./import-sheet-metadata.cjs').importMetadata(fs.readFileSync('scripts/data/seo-metadata-sheet.csv','utf8'),definitions,manifest.COMPLETED_NATIVE_PAGES);
    assert.deepEqual(sheetMetadata,{source:imported.source,pages:imported.pages},'Metadata must match the exact approved CSV snapshot');
    for(const [page,languages] of Object.entries(manifest.COMPLETED_NATIVE_PAGES)) {
      assert(definitions.some(definition=>definition.path===page),'Unknown completed public page: '+page);
      assert(languages.length && new Set(languages).size===languages.length && languages.every(language=>u.languages.includes(language)),'Invalid completed language list: '+page);
    }
    assert.deepEqual(manifest.COMPLETED_NATIVE_LANGUAGES,u.languages.filter(language=>definitions.every(page=>(manifest.COMPLETED_NATIVE_PAGES[page.path]||[]).includes(language))),'Sitewide language completion must match every public page');
    if(remote) {base=new URL(remote.slice(11));assert(['http:','https:'].includes(base.protocol)&&!base.username&&!base.password);}
    else {
      logs=fs.createWriteStream(`tmp/${kind}-ssr.log`);
      for(const method of Object.keys(originalConsole))console[method]=(...args)=>logs.write(util.format(...args)+'\n');
      restoreCms=require('./local-cms-transport.cjs').installLocalCmsTransport(cmsOrigin);
      cmsStore=require(path.join(u.root,'dist/upforex_Frontend/server/main.js')).publicBlogStore();
      server=require(path.join(u.root,'dist/upforex_Frontend/server/main.js')).app({onI18nAudit:a=>audits.set(a.url,a)}).listen(0,'127.0.0.1');
      await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
      base=new URL(`http://127.0.0.1:${server.address().port}`);
    }
    function request(route) {
      return new Promise((resolve,reject)=>{
        const target=new URL(base.origin+route);
        const req=(target.protocol==='https:'?https:http).get(target,{headers:{Connection:'close'}},response=>{
          let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
          response.on('end',()=>resolve({status:response.statusCode,location:response.headers.location,headers:response.headers,body}));
        });
        req.setTimeout(45000,()=>req.destroy(new Error('Timeout: '+route)));req.on('error',reject);
      });
    }
    async function check(route,action){try{await action();}catch(error){failures.push({route,error:error.message});process.stdout.write('HELD '+route+': '+error.message.slice(0,250)+'\n');}}
    await check('/sitemap.xml',async()=>{
      const response=await request('/sitemap.xml');assert.equal(response.status,200);
      assert.match(response.headers['content-type']||'',/^application\/xml\b/);
      assert.match(response.body,/<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
      const locations=u.elements(u.parseFragment(response.body),'loc').map(node=>normalize(bodyText(node)));
      const expected=definitions.flatMap(({path:page})=>[origin+page,...(manifest.COMPLETED_NATIVE_PAGES[page]||[]).map(language=>origin+'/'+u.prefixes[language]+(page==='/'?'':page))]);
      assert.equal(new Set(locations).size,locations.length,'Duplicate sitemap URLs');
      assert.deepEqual([...locations].sort(),expected.sort(),'Sitemap must list current English pages and only completed translated canonical URLs');
      results.push({route:'/sitemap.xml',sitemapVerified:true,canonicalUrls:locations.length});
    });
    for(const definition of definitions) {
      const page=definition.path,suffix=page==='/'?'':page,completed=manifest.COMPLETED_NATIVE_PAGES[page]||[];
      let englishRoot,englishDocument;
      await check(page,async()=>{
        const response=await request(page);assert.equal(response.status,200);
        const doc=u.parse(response.body);englishDocument=doc;verifyMetadata(doc,page,'en','en',completed,response.headers);
        if(completed.length){assert.equal(u.attribute(u.elements(doc,'html')[0],'data-native-page-ready'),'true','Loaded English source must be protected from legacy browser retranslation');verifyEmailProtection(response.body,doc);}
        const sheetMetadataVerified=verifySheetMetadata(doc,sheetMetadata.pages[page]?.en);
        englishRoot=u.elements(doc,'app-root')[0];const component=u.elements(doc,definition.selector.split(/[.#\[]/,1)[0])[0];assert(component,'Public component missing');
        englishLinks.set(page,[...new Set(u.elements(englishRoot,'a').flatMap(node=>{
          const href=u.attribute(node,'href');if(!href)return[];
          try{const url=new URL(href,origin+page);return url.origin===origin&&!url.hash?[url.pathname]:[];}catch{return[];}
        }))]);
        if(page==='/blogs'){
          verifyEnglishBlogListing(component,cmsSnapshot);
          const hrefs=new Set(u.elements(component,'a').map(node=>u.attribute(node,'href')));
          for(const article of definitions.filter(item=>item.cms))assert(hrefs.has(article.path),'Every current article needs an initial-HTML blog-index link: '+article.path);
        }
        if(page==='/resources/tools'){
          const hrefs=new Set(u.elements(component,'a').map(node=>u.attribute(node,'href')));
          // The original Currency Volatility card is commented out. Preserve
          // that visibility choice and require all nine active controls.
          for(const tool of definitions.filter(item=>item.path.startsWith('/resources/tools/')&&item.path!=='/resources/tools/currency-volatility'))assert(hrefs.has(tool.path),'Every visible tool needs a crawlable initial-HTML navigation link: '+tool.path);
        }
        if(definition.cms)verifyEnglishArticle(component,cmsSnapshot.find(article=>{
          const segment=encodeURIComponent(u.publicBlogPermalink(article.permaLink||'')).replace(/%(?:40|3A|24|2C|26)/gi,decodeURIComponent).replace(/\(/g,'%28').replace(/\)/g,'%29');
          return '/blogs/'+segment===page;
        }),doc,sheetMetadata.pages[page]?.en);
        assert(bodyText(englishRoot).length>50,'Empty English body');
        if(!remote)assert.equal(audits.get(page)?.missingKeys.length,0,'Source changed / missing catalog keys');
        results.push({route:page,language:'en',metadataVerified:true,sheetMetadataVerified});
        if(!remote&&(completed.length||page==='/')) {
          const directory=`${verifiedDirectory}/${manifest.NATIVE_I18N_VERSION}/en`;fs.mkdirSync(directory,{recursive:true});
          fs.writeFileSync(directory+'/'+u.contentKey(page)+'.html',response.body);
        }
      });
      // A missing English response provides no honest reference for ten locale
      // comparisons. Stop this failed gate instead of issuing more CMS requests
      // against an already unavailable/slow origin. Healthy runs still cover all
      // declared pages and languages, and completeness remains mandatory.
      if(!englishRoot)throw new Error('English initial HTML unavailable for '+page+'; full release gate stopped. Resolve the failed source request and rerun --require-complete.');
      const languages=(kind==='seo'&&!definition.cms)||sheetMetadata.pages[page]?u.languages:[...new Set([...completed,...(page==='/'||page==='/partnerships/ib-programs'?u.languages:[])])];
      // Four read-only renders at a time keep the audit bounded and exercise
      // isolation between the languages served by the same Node process.
      for(let start=0;start<languages.length;start+=4)await Promise.all(languages.slice(start,start+4).map(requested=>check('/'+u.prefixes[requested]+suffix,async()=>{
        const route='/'+u.prefixes[requested]+suffix,response=await request(route);
        assert.equal(response.status,200);assert.equal(response.location,undefined);
        const doc=u.parse(response.body),language=completed.includes(requested)?requested:'en';
        verifyMetadata(doc,page,language,requested,completed,response.headers);assert(englishRoot,'English reference failed');
        const approved=sheetMetadata.pages[page]?.[language];
        const effective=effectivePageMetadata(page,language,sheetMetadata);
        const sheetMetadataVerified=verifySheetMetadata(doc,approved);
        let body;
        if(language!=='en') {
          if(!remote){const directory=`${auditedDirectory}/${manifest.NATIVE_I18N_VERSION}/${language}`;fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(directory+'/'+u.contentKey(page)+'.html',response.body);}
          const relative=`assets/i18n/native/${manifest.NATIVE_I18N_VERSION}/${language}/${u.contentKey(page)}.json`;
          const source=u.read('src/'+relative);assert(source,'Declared completed catalog missing');
          if(!remote)assert.deepEqual(u.read('dist/upforex_Frontend/browser/'+relative),source,'Built catalog differs from source');
          assert.equal(source.__nativeI18nVersion,manifest.NATIVE_I18N_VERSION);assert.equal(source.__nativePage,page);
          assert.deepEqual(source.__nativeMetadata,effective,'Page catalog must contain the approved sheet head or validated translation of its exact English head');
          for(const key of source.__nativeSourceKeys){assert.deepEqual(validateCatalog(key,source.COPY[key],language),[],key+': invalid translation');}
          const dictionary=dictionaryFor(source,inventory);
          body=verifyBody(englishRoot,u.elements(doc,'app-root')[0],dictionary,{page,language,cmsSnapshot});
          verifyHead(englishDocument,doc,dictionary,effective,definition.cms?cmsSnapshot.find(article=>'/blogs/'+u.publicBlogPermalink(article.permaLink)===page):undefined);
          body.headMetadataVerified=true;
          assert.equal(u.attribute(u.elements(doc,'html')[0],'data-native-i18n'),'complete','Protect native page from browser retranslation');
          assert.equal(u.attribute(u.elements(doc,'html')[0],'data-native-page-ready'),'true','Completed native page must be ready before browser scripts');
          verifyEmailProtection(response.body,doc);
          if(!remote){assert.equal(audits.get(route)?.language,language);assert.deepEqual(audits.get(route)?.missingKeys,[]);}
          if(!remote) {
            const directory=`${verifiedDirectory}/${manifest.NATIVE_I18N_VERSION}/${language}`;fs.mkdirSync(directory,{recursive:true});
            fs.writeFileSync(directory+'/'+u.contentKey(page)+'.html',response.body);
            body.initialHtmlFile=directory+'/'+u.contentKey(page)+'.html';
          }
        } else {
          const actual=englishFallbackText(u.elements(doc,'app-root')[0],page,cmsSnapshot), expected=englishFallbackText(englishRoot,page,cmsSnapshot);
          if(actual!==expected){let at=0;while(at<expected.length&&actual[at]===expected[at])at++;throw new Error('Incomplete English fallback differs at '+at+': '+JSON.stringify({expected:expected.slice(at,at+150),actual:actual.slice(at,at+150)}));}
        }
        results.push({route,page,language,requestedLanguage:requested,metadataVerified:true,sheetMetadataVerified,sheetMetadataHeld:!!sheetMetadata.pages[page]?.[requested]&&language!==requested,foreignNativeBodyVerified:language!=='en',body});
      })));
      if(results.length%10===0)process.stdout.write(`Checked ${results.length} initial HTML responses\n`);
    }
    for(const prefix of Object.values(u.prefixes))for(const suffix of ['','/about-us','/partnerships/ib-programs','/blogs/%2Fwhat-is-a-forex-currency-pair']){
      const route='/'+prefix+suffix+'/?utm_source=release&value=one%2Ftwo';
      await check(route,async()=>{const r=await request(route);assert.equal(r.status,301);assert.equal(r.location,'/'+prefix+(suffix.startsWith('/blogs/')?'/blogs/what-is-a-forex-currency-pair':suffix)+'?utm_source=release&value=one%2Ftwo');results.push({route,redirectVerified:true});});
    }
    for(const route of ['//hi///about-us//?x=1','/ar//partnerships/ib-programs/?x=1'])await check(route,async()=>{
      const r=await request(route);assert.equal(r.status,301);assert.equal(r.location,route.split('?')[0].replace(/\/{2,}/g,'/').replace(/\/$/,'')+'?x=1');
    });
    for(const route of ['/does-not-exist','/hi/does-not-exist','/admin/login','/blogs/audit-missing-article'])await check(route,async()=>{
      const r=await request(route);if(route!=='/admin/login')assert.equal(r.status,404,'Missing public pages must return HTTP 404');assert.equal(tags(u.parse(r.body),'alternate').filter(n=>u.attribute(n,'hreflang')).length,0);
    });
    for(const [route,target] of [['/anti-monry-laundering','/anti-money-laundering'],['/products/index-future','/products/index-cfds'],['/products/energy-future','/products/energy-cfds']])await check(route,async()=>{
      const r=await request(route+'?audit=1');assert.equal(r.status,301);assert.equal(r.location,target+'?audit=1');
    });
    for(const prefix of Object.values(u.prefixes))await check('/'+prefix+'/anti-monry-laundering/',async()=>{
      const r=await request('/'+prefix+'/anti-monry-laundering/?audit=one%2Ftwo');
      assert.equal(r.status,301);assert.equal(r.location,'/'+prefix+'/anti-money-laundering?audit=one%2Ftwo');
    });
    for(const prefix of Object.values(u.prefixes))for(const [source,target]of [['index-future','index-cfds'],['energy-future','energy-cfds']])await check('/'+prefix+'/products/'+source+'/',async()=>{
      const r=await request('/'+prefix+'/products/'+source+'/?audit=one%2Ftwo');assert.equal(r.status,301);assert.equal(r.location,'/'+prefix+'/products/'+target+'?audit=one%2Ftwo');
    });
    for(const prefix of ['',...Object.values(u.prefixes).map(prefix=>'/'+prefix)])for(const [stored,published]of Object.entries(u.PUBLIC_BLOG_PERMALINKS)){
      const encoded=encodeURIComponent(stored);
      const variants=[encoded,stored,stored.replace(/&/g,'&amp;')];
      for(const variant of new Set(variants))await check(prefix+'/blogs/'+variant,async()=>{
        const r=await request(prefix+'/blogs/'+variant+'?audit=one%2Ftwo');
        assert.equal(r.status,301,'Legacy blog URL must redirect');
        assert.equal(r.location,prefix+'/blogs/'+published+'?audit=one%2Ftwo','Single-hop clean blog redirect preserves query');
      });
    }
    for(const prefix of ['',...Object.values(u.prefixes).map(value=>'/'+value)]) {
      for(const [source,target]of Object.entries(u.LEGACY_SEO_PAGE_REDIRECTS))for(const variant of new Set([source,source.replace(':','%3A')]))await check(prefix+variant,async()=>{
        const r=await request(prefix+variant+'/?audit=one%2Ftwo');assert.equal(r.status,301);assert.equal(r.location,prefix+target+'?audit=one%2Ftwo');
        results.push({route:prefix+variant,legacySheetRedirectVerified:true});
      });
      for(const [source,target]of Object.entries(u.LEGACY_ACCOUNT_REDIRECTS))await check(prefix+source,async()=>{
        const r=await request(prefix+source+'/?redirect=https%3A%2F%2Funtrusted.invalid');assert.equal(r.status,302);assert.equal(r.location,target);assert.equal(r.headers['cache-control'],'private, no-store');
        results.push({route:prefix+source,existingAccountRedirectVerified:true});
      });
    }
    for(let run=0;run<3;run++)await Promise.all(['en','hi','ar'].map(language=>check('concurrent '+language,async()=>{
      const page='/partnerships/ib-programs',route=(language==='en'?'':'/'+u.prefixes[language])+page;
      const response=await request(route),completed=manifest.COMPLETED_NATIVE_PAGES[page]||[];
      verifyMetadata(u.parse(response.body),page,language==='en'||completed.includes(language)?language:'en',language,completed);
    })));
  }catch(error){failures.push({error:error.stack||error.message});}
  finally{Object.assign(console,originalConsole);if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(logs)await new Promise(resolve=>logs.end(resolve));restoreCms?.();}
  const nativeResults=results.filter(r=>r.foreignNativeBodyVerified),declared=Object.values(manifest.COMPLETED_NATIVE_PAGES).reduce((sum,list)=>sum+list.length,0);
  const inbound=definitions.map(({path:page})=>({page,sourcePages:[...englishLinks].filter(([source,links])=>source!==page&&links.includes(page)).map(([source])=>source)}));
  fs.writeFileSync(kind==='seo'?'tmp/internal-link-audit.json':'tmp/ssr-i18n-internal-link-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),version:manifest.NATIVE_I18N_VERSION,initialHtmlOnly:true,checkedPublicPages:englishLinks.size,
    pages:inbound,withoutIncomingLinks:inbound.filter(row=>!row.sourcePages.length).map(row=>row.page),withOnlyOneIncomingPage:inbound.filter(row=>row.sourcePages.length===1).map(row=>row.page)},null,2)+'\n');
  const sheetExpected=Object.entries(sheetMetadata.pages).flatMap(([page,byLanguage])=>Object.keys(byLanguage).map(language=>({page,language})));
  const sheetMissing=sheetExpected.filter(({page,language})=>!results.some(result=>result.route===(language==='en'?page:'/'+u.prefixes[language]+(page==='/'?'':page))&&result.sheetMetadataVerified));
  if(sheetMissing.length)failures.push({error:'Sheet metadata initial HTML responses missing or failed',combinations:sheetMissing});
  if(nativeResults.length!==declared)failures.push({error:`Only ${nativeResults.length}/${declared} declared translations passed full initial HTML verification.`});
  const bodyComplete=declared>0&&nativeResults.length===declared&&!failures.length;
  const completenessFailures=strict&&missing.length?[`Missing ${missing.length}/${definitions.length*10} required page/language translations. English fallback is not completion.`]:[];
  const report={checkedAt:new Date().toISOString(),mode:remote?'remote-initial-HTML':'local-production-SSR-with-frontend-public-cache',cmsOrigin:'frontend-owned read-only gateway; upstream https://api.upforex.com',cmsDataSource:'Versioned existing English public CMS snapshot plus bounded background refresh; no backend change or isolated backend',cmsSnapshot:require('./public-cms-evidence.cjs').snapshotEvidence(),runtimeCmsCache:cmsStore?.status(),version:manifest.NATIVE_I18N_VERSION,javascriptExecuted:false,
    publicPages:definitions.length,requiredCombinations:definitions.length*10,requireComplete:strict,partialMode:!strict,declaredCompletedCombinations:declared,verifiedCompletedCombinations:nativeResults.length,
    sheetMetadataSource:sheetMetadata.source,sheetMetadataExpectedRows:sheetExpected.length,sheetMetadataResponsesVerified:results.filter(result=>result.sheetMetadataVerified).length,sheetMetadataFallbacksVerified:results.filter(result=>result.sheetMetadataHeld).length,
    translatedBodyCoverageChecked:bodyComplete,sitewideNativeTranslationComplete:!missing.length,passed:!failures.length&&!completenessFailures.length,
    checks:results.length,failures,completenessFailures,missingCombinations:missing,results,localChecksPassed:!failures.length&&!missing.length&&bodyComplete,requiresLiveCmsVerification:!remote,releaseReady:!!remote&&!failures.length&&!missing.length&&bodyComplete};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  const cr=coverageSnapshot;
  if(cr?.version===manifest.NATIVE_I18N_VERSION)fs.writeFileSync(kind==='seo'?'tmp/i18n-coverage-report.json':'tmp/ssr-i18n-coverage-report.json',JSON.stringify({...cr,renderedContentVerificationComplete:bodyComplete,verifiedCompletedCombinations:nativeResults.length,releaseReady:report.releaseReady,verificationReport:reportPath},null,2)+'\n');
  process.stdout.write(`${report.passed?(missing.length?'PARTIAL_CHECK_PASS':'PASS'):'FAIL'} ${kind}: ${nativeResults.length}/${declared} translated initial bodies verified; ${missing.length} combinations missing; ${failures.length} implementation failures. Report: ${reportPath}\n`);
  failures.slice(0,10).forEach(f=>process.stdout.write(JSON.stringify(f)+'\n'));completenessFailures.forEach(f=>process.stdout.write(f+'\n'));
  if(!report.passed)process.exitCode=1;return report;
}
module.exports={verifyRelease,verifyEmailProtection,verifyBody,verifyMetadata,verifyIndexability,translateText,bodyText,alternates,dictionaryFor,catalogValidator,richBodyExpectations,englishFallbackText,verifyHead,verifyEnglishArticle,verifyEnglishBlogListing,verifySheetMetadata,listingCategoryProjection,recommendationProjection,requireComplete};
