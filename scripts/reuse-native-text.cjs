// Transfer an already accepted translation across a single text-node wrapper.
// Never assemble independently translated fragments into a new sentence.
const u = require('./i18n-release-utils.cjs');
function textNodes(node) {
  return [...(node.nodeName === '#text' && u.normalizeContent(node.value) ? [node] : []),
    ...(node.childNodes || []).flatMap(textNodes)];
}
function singleText(entry, value) {
  if (entry.kind !== 'html') return u.normalizeContent(value);
  const nodes = textNodes(u.parseFragment(value));
  return nodes.length === 1 ? u.normalizeContent(nodes[0].value) : undefined;
}
function reuseText(entries, accepted, language) {
  const memory = new Map(), ambiguous = new Set();
  for (const entry of entries) {
    const value = accepted[entry.key];
    if (typeof value !== 'string' || u.validate(entry, value, language).length) continue;
    const source = singleText(entry, entry.english), target = singleText(entry, value);
    if (!source || !target) continue;
    if (memory.has(source) && memory.get(source) !== target) ambiguous.add(source);
    memory.set(source, target);
  }
  const reused = {};
  for (const entry of entries) {
    if (typeof accepted[entry.key] === 'string') continue;
    const source = singleText(entry, entry.english);
    if (!source || ambiguous.has(source) || !memory.has(source)) continue;
    let translation = memory.get(source);
    if (entry.kind === 'html') {
      const fragment = u.parseFragment(entry.english), node = textNodes(fragment)[0];
      node.value = (/^\s/.test(node.value) ? ' ' : '') + translation + (/\s$/.test(node.value) ? ' ' : '');
      translation = u.serialize(fragment);
    }
    if (!u.validate(entry, translation, language).length) reused[entry.key] = translation;
  }
  return reused;
}
function reuseFinancialTagCase(entries, accepted, language) {
  // Reviewed domain: short CMS financial tags, their uppercase display labels
  // and identical image-alt keywords. Never case-fold English prose, proper
  // names such as Polish/polish, arbitrary UI labels or complete components.
  const eligible = entry => entry.kind === 'text' && entry.english.length <= 90 &&
    entry.sources?.some(source => /^CMS:/.test(source) && /#(?:tag|upperTag|imageAltTag)$/.test(source)) &&
    /forex|trad(?:e|ing|er)|cfd|gold|silver|broker|leverage|spread|market|risk|bitcoin|crypto|asset|account|margin/i.test(entry.english);
  const identity = source => u.normalizeContent(source.replace(/\u200b/g, '')).toLowerCase();
  const memory = new Map(), ambiguous = new Set(), reused = {};
  for (const entry of entries.filter(eligible)) {
    const target = accepted[entry.key];
    if (typeof target !== 'string' || u.validate(entry,target,language).length) continue;
    const key = identity(entry.english);
    if (memory.has(key) && memory.get(key) !== target) ambiguous.add(key);
    memory.set(key,target);
  }
  for (const entry of entries.filter(eligible)) {
    if (typeof accepted[entry.key] === 'string') continue;
    const key = identity(entry.english),target = memory.get(key);
    if (typeof target === 'string' && !ambiguous.has(key) && !u.validate(entry,target,language).length) reused[entry.key] = target;
  }
  return reused;
}
module.exports = { reuseText, singleText, reuseFinancialTagCase };
