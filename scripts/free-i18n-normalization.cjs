const u=require('./i18n-release-utils.cjs');
const numeric=/\d+(?:[.,:/-]\d+)*/g;
const englishWords=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
const words={
  en:englishWords,
  fr:['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze'],
  es:['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce'],
  de:['null','eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn','elf','zwölf'],
  pt:['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze'],
  ru:['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать'],
  hi:['शून्य','एक','दो','तीन','चार','पाँच','छह','सात','आठ','नौ','दस','ग्यारह','बारह'],
  ar:['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر'],
  'zh-CN':['零','一','二','三','四','五','六','七','八','九','十','十一','十二'],
  'zh-TW':['零','一','二','三','四','五','六','七','八','九','十','十一','十二'],
  ja:['零','一','二','三','四','五','六','七','八','九','十','十一','十二'],
};
function normalizeNumbers(source,target,language){
  const html=/<\/?[a-z][^>]*>/i.test(source),plain=html?u.text(u.parseFragment(source)):source;
  const root=html?u.parseFragment(target):{nodeName:'#text',value:target};
  const nodes=[];const visit=node=>{if(node.nodeName==='#text')nodes.push(node);for(const child of node.childNodes||[])visit(child);};visit(root);
  const product=/\b(?:Meta\s*Trader\s*[45]|MT[45])\b/gi;
  const tokens=plain.replace(product,'').match(numeric)||[],unique=[...new Set(tokens)],remaining={};tokens.forEach(token=>remaining[token]=(remaining[token]||0)+1);
  const forms=value=>new Set([value,value.replace(/,/g,'.'),value.replace(/,/g,'')]);
  const wordCounts=Object.fromEntries(englishWords.map((word,index)=>[String(index),(plain.match(new RegExp('\\b'+word+'\\b','gi'))||[]).length]));
  wordCounts['1']+=(plain.match(/\bsingle\b/gi)||[]).length;
  wordCounts['2']+=(plain.match(/\bsecond\b/gi)||[]).length;
  if(language==='ja')wordCounts['1']+=(plain.match(/\ba day\b/gi)||[]).length;
  for(const node of nodes){
    const products=[];
    let text=node.value.replace(product,value=>{products.push(value);return '\uE100'+String.fromCharCode(97+products.length-1)+'\uE101';}).replace(/[\uff10-\uff19]/g,char=>String(char.charCodeAt(0)-0xff10));
    // Restore original numeric formatting only when the value is unambiguous.
    text=text.replace(/\d{1,3}(?:[ '\u2019\u00a0\u202f]\d{3})+(?:[,.]\d+)?/g,value=>{
      const compact=value.replace(/[ '\u2019\u00a0\u202f]/g,'');
      const matches=unique.filter(token=>[...forms(token)].some(form=>forms(compact).has(form)));
      return matches.length===1?matches[0]:value;
    });
    for(const token of unique.filter(token=>token.includes(':'))){
      const expression=token.split(':').join('\\s*:\\s*');text=text.replace(new RegExp(expression,'g'),token);
    }
    text=text.replace(numeric,value=>{
      if(unique.includes(value))return value;
      const matches=unique.filter(token=>[...forms(token)].some(form=>forms(value).has(form)));
      return matches.length===1?matches[0]:value;
    });
    // A written English number must remain written if the provider chose a
    // digit. Never change an added digit unless that exact source word exists.
    text=text.replace(numeric,value=>{
      if(remaining[value]>0){remaining[value]--;return value;}
      if(words[language]?.[Number(value)]&&/^\d+$/.test(value)&&wordCounts[value]>0){wordCounts[value]--;return words[language][Number(value)];}
      return value;
    });
    node.value=text.replace(/\uE100(.)\uE101/g,(_match,index)=>products[index.charCodeAt(0)-97]);
  }
  // Preserve the literal $1 form without guessing from an indefinite article.
  const oneDollar={en:[/one dollar/gi,'1 dollar'],ar:[/دولار واحد/g,'1 دولار'],hi:[/एक डॉलर/g,'1 डॉलर'],
    'zh-CN':[/一美元/g,'1美元'],'zh-TW':[/一美元/g,'1美元']};
  if(remaining['1']>0&&plain.includes('$1')&&oneDollar[language])for(const node of nodes){
    const [pattern,replacement]=oneDollar[language];node.value=node.value.replace(pattern,value=>remaining['1']-->0?replacement:value);
  }
  return html?u.serialize(root):root.value;
}
module.exports={normalizeNumbers};
