const fs = require('node:fs');
const ts = require('typescript');
const { parseFragment } = require('parse5');
const runtime = {};
const identifiers = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/app/core/config/market-identifiers.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(identifiers);
new Function('exports', 'require', ts.transpileModule(fs.readFileSync('src/app/core/config/content-keys.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(runtime, name => { if(name==='./market-identifiers')return identifiers; throw new Error('Unexpected content-key dependency: '+name); });
new Function('exports', ts.transpileModule(fs.readFileSync('src/app/core/config/rich-content.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(runtime);
function text(node) {
  return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' ');
}
function skeleton(node) {
  return [
    ...(node.tagName ? [{ tag: node.tagName, attributes: (node.attrs || []).map(a => [a.name, a.value]), children: (node.childNodes || []).flatMap(skeleton) }] : (node.childNodes || []).flatMap(skeleton)),
  ];
}
function tokens(value, expression) { return [...value.matchAll(expression)].map(match => match[0]).sort(); }
function numericBounds(value) {
  return [...value.matchAll(/(?:<=|>=|[<>≤≥])\s*\d+(?:[.,]\d+)?\s*[%％]?/g)]
    .map(match => match[0].replace(/\s/g, '').replace('<=', '≤').replace('>=', '≥').replace('％', '%')).sort();
}
function introducedCurrencySymbols(source,target) {
  // Symbols may be localized as ISO codes or words, but an unrelated new
  // symbol must never silently change an offer's denomination.
  const currencies = [
    ['₹', /₹|\bINR\b|\b(?:Indian )?rupees?\b/i],
    ['£', /£|\bGBP\b|\b(?:British )?pounds?\b|\bsterling\b/i],
    ['€', /€|\bEUR\b|\beuros?\b/i],
    ['$', /\$|\bUSD\b|\bdollars?\b/i],
    ['¥', /[¥￥]|\b(?:JPY|CNY|RMB)\b|\b(?:yen|yuan)\b/i],
  ];
  // An explicit sterling name is also unambiguous; it cannot mean weight.
  const sterlingName=/фунт\p{L}*\s+стерлинг|livres? sterling|libras? esterlinas?|Pfund Sterling|英镑|英鎊/iu;
  return currencies.filter(([symbol,pattern])=>(target.includes(symbol)||symbol==='£'&&sterlingName.test(target))&&!pattern.test(source)).map(([symbol])=>symbol);
}
function negativeAmounts(value) {
  // Attached signs and explicit formula values are unambiguous. A spaced
  // prose dash ("MON - FRI, 9AM - 5PM") or binary subtraction is not a loss.
  const values=new Map();
  for(const pattern of [/(?<![A-Za-z\d%％])[-−](?:\p{Sc})?\d+(?:[.,]\d+)*/gu,/(?:^|[=:])\s*([-−]\s*(?:\p{Sc}\s*)?\d+(?:[.,]\d+)*)/gu]){
    for(const match of value.matchAll(pattern)){
      const numeric=match[1]||match[0],at=match.index+match[0].indexOf(numeric);
      values.set(at,numeric.replace(/[-−\s\p{Sc}]/gu,''));
    }
  }
  return [...values.values()].sort();
}
function translationProblems(entry, translated) {
  if (typeof translated !== 'string' || !translated.trim()) return ['Empty translation'];
  const source = entry.kind === 'html' ? text(parseFragment(entry.english)) : entry.english;
  const target = entry.kind === 'html' ? text(parseFragment(translated)) : translated;
  const problems = [];
  if (/UFPROTECTED[A-Z]+TOKEN/.test(translated)) problems.push('Unresolved protected token');
  if (/https?:\/\/upx-entity-/i.test(translated)) problems.push('Unresolved identity placeholder');
  if (introducedCurrencySymbols(source,target).length) problems.push('Changed currency denomination');
  const requiredNegatives=negativeAmounts(source);
  if(requiredNegatives.length){
    const available=[...target.matchAll(/[-−]\s*(?:\p{Sc}\s*)?\d+(?:[.,]\d+)*/gu)].map(match=>match[0].replace(/[-−\s\p{Sc}]/gu,''));
    if(requiredNegatives.some(value=>{const index=available.indexOf(value);if(index<0)return true;available.splice(index,1);return false;}))problems.push('Changed numeric negative signs');
  }
  if (JSON.stringify(numericBounds(source)) !== JSON.stringify(numericBounds(target))) problems.push('Changed numeric comparison bounds');
  for (const [name, expression] of [
    ['numeric values', /\d+(?:[.,:/-]\d+)*/g],
    ['placeholders', /\{\d+\}/g],
    ['email addresses', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi],
    ['license identifiers', /\b[A-Z]{1,5}\d{5,}\b/g],
  ]) {
    if (JSON.stringify(tokens(source, expression)) !== JSON.stringify(tokens(target, expression))) problems.push(`Changed ${name}`);
  }
  if (entry.kind === 'html' && JSON.stringify(skeleton(parseFragment(entry.english))) !== JSON.stringify(skeleton(parseFragment(translated)))) problems.push('Changed HTML elements, attributes or URLs');
  if (/<script\b|javascript:|onerror\s*=/i.test(translated)) problems.push('Unsafe generated HTML');
  return problems;
}
module.exports = { ...runtime, text, skeleton, translationProblems, introducedCurrencySymbols, negativeAmounts };
