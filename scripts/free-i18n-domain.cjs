const u=require('./i18n-release-utils.cjs');
const negation={
  en:/\b(?:no|not|neither|nor|never|without|excluding|except|cannot)\b|\b\w+n['’]t\b|rather than|instead of|as opposed to|commission[- ]free|fee[- ]free/i,
  fr:/\b(?:ne|ni|non|pas|sans|sauf|aucun(?:e|s|es)?|jamais|hors|exclu\w*|introuvable)\b|n['’]|plutôt qu|au lieu/i,
  es:/\b(?:no|ni|sin|nunca|tampoco|ning[uú]n\w*|exclu\w*)\b|en lugar/i,
  de:/\b(?:nicht|kein\w*|ohne|nie|nein|niemals|weder|außer|provisionsfrei\w*|gebührenfrei\w*|ausgenommen|ausgeschlossen|statt|anstatt|anstelle)\b/i,
  pt:/\b(?:não|nem|sem|nunca|jamais|nenhum\w*|exclu\w*)\b|em vez/i,
  ru:/(?:^|[^\p{L}])(?:не|ни|без|нет|никогда|нельзя|невозможно)(?:[^\p{L}]|$)|исключ|вместо|отсутств|недостат|недоступ/iu,
  hi:/नहीं|बिना|छोड़कर|बजाय|अलावा|मुक्त|रहित|(?:^|\s)न(?:\s|$)/,
  ar:/لا |ليست|ليس|دون|غير |باستثناء|بدلاً|بدلا|لم |لن |عدم/,
  'zh-CN':/不|未|无|没有|除|非|免(?:佣金|手续费|费)/,'zh-TW':/不|未|無|沒有|除|非|免(?:佣金|手續費|費)/,
  ja:/ない|なかった|なければ|ません|ず|なし|なく|いいえ|無料|不要|除[くきい]|除外|ではなく|代わりに/,
};
const concepts={
  marginCall:{en:/margin[- ]call/gi,fr:/appel de marge/gi,es:/llamada de margen|aviso de margen/gi,de:/margin[- ]call/gi,pt:/chamada de margem/gi,ru:/маржин[- ]колл/gi,hi:/मार्जिन[- ]कॉल/gi,ar:/نداء الهامش|طلب الهامش|استدعاء الهامش/gi,'zh-CN':/追加保证金|追缴保证金/gi,'zh-TW':/追加保證金|追繳保證金/gi,ja:/マージンコール/gi},
  stopOut:{en:/stop[- ]out/gi,fr:/stop[- ]out/gi,es:/stop[- ]out|cierre forzoso/gi,de:/stop[- ]out/gi,pt:/stop[- ]out/gi,ru:/стоп[- ]аут/gi,hi:/स्टॉप[- ]आउट/gi,ar:/الإغلاق الإجباري|إغلاق إجباري|التصفية الإجبارية|ستوب آوت/gi,'zh-CN':/强制平仓/gi,'zh-TW':/強制平倉/gi,ja:/ロスカット|ストップアウト/gi},
};
function percentages(text){return[...text.matchAll(/\d+(?:[.,]\d+)?\s*[%％]/g)].map(match=>({value:match[0].replace(/\s/g,'').replace('％','%'),at:match.index}));}
function associatedPercentages(text,pattern){
  if(!pattern)return[];const numbers=percentages(text),result=[];
  for(const term of text.matchAll(pattern)){
    const nearest=numbers.map(number=>({...number,distance:Math.min(Math.abs(number.at-(term.index+term[0].length)),Math.abs(number.at+number.value.length-term.index))})).sort((a,b)=>a.distance-b.distance)[0];
    if(nearest&&nearest.distance<=30)result.push(nearest.value);
  }
  return [...new Set(result)].sort();
}
function groupedAssociations(text,language){
  const numbers=percentages(text),terms=[];
  for(const [name,patterns]of Object.entries(concepts))if(patterns[language])for(const match of text.matchAll(patterns[language]))terms.push({name,at:match.index,length:match[0].length});
  const output=Object.fromEntries(Object.keys(concepts).map(name=>[name,[]]));
  if(terms.length>7)return Object.fromEntries(Object.entries(concepts).map(([name,patterns])=>[name,associatedPercentages(text,patterns[language])]));
  let best,bestCost=Infinity;
  const solve=(index,used,selected,cost)=>{
    if(cost>=bestCost)return;
    if(index===terms.length){best=[...selected];bestCost=cost;return;}
    const term=terms[index];
    for(let n=0;n<numbers.length;n++)if(!used.has(n)){
      const number=numbers[n],distance=Math.min(Math.abs(number.at-term.at-term.length),Math.abs(number.at+number.value.length-term.at));
      if(distance<=60){used.add(n);selected.push(n);solve(index+1,used,selected,cost+distance);selected.pop();used.delete(n);}
    }
    selected.push(-1);solve(index+1,used,selected,cost+120);selected.pop();
  };
  solve(0,new Set(),[],0);
  terms.forEach((term,index)=>{if(best?.[index]>=0)output[term.name].push(numbers[best[index]].value);});
  return Object.fromEntries(Object.entries(output).map(([name,values])=>[name,[...new Set(values)].sort()]));
}
function correctTerminology(source,target,language){
  const changes=[];let result=target;
  const replace=(pattern,replacement,reason)=>{const before=result;result=result.replace(pattern,replacement);if(result!==before)changes.push(reason);};
  if(/\bpips?\b/i.test(source)&&!/\b(?:seeds?|nuggets?)\b/i.test(source)){
    if(language==='fr')replace(/\bpépins?\b/gi,'pips','Financial pip, not fruit seed');
    if(language==='es')replace(/\b(?:pepitas?|pipas?)\b/gi,'pips','Financial pip, not seed');
  }
  if(/stop[- ]out/i.test(source)&&!/stop[- ]loss/i.test(source)){
    const fixes={
      'zh-CN':[/止损/g,'强制平仓'],'zh-TW':[/停損|止損/g,'強制平倉'],
      fr:[/niveau (?:d'arrêt|de sortie)/gi,'niveau de stop-out'],
      es:[/nivel de (?:parada|exclusión)/gi,'nivel de cierre forzoso'],pt:[/nível de parada/gi,'nível de stop-out'],
      ru:[/уровень (?:остановки|стоп-лосса)/gi,'уровень стоп-аута'],ja:[/ストップロス(?:水準|レベル)/g,'ロスカット水準'],
    }[language];
    if(fixes)replace(...fixes,'Preserve stop-out liquidation concept; do not change it to a stop-loss order');
  }
  // Preserve a stated 24-hour schedule without repeating or dropping its
  // numeric value through a target-language idiom. A 24/7 offer is not changed.
  if(/\b24\s*hours?\b/i.test(source)){
    const idioms={fr:[/24\s*heures?\s*sur\s*24/gi,'24 heures par jour'],de:[/rund um die Uhr/gi,'24 Stunden am Tag'],ru:[/круглосуточно/gi,'24 часа в сутки'],
      ar:[/على مدار الساعة/g,'24 ساعة في اليوم'],hi:[/चौबीसों घंटे/g,'24 घंटे'],
      'zh-CN':[/全天候/g,'每天24小时'],'zh-TW':[/全天候/g,'每天24小時']};
    if(idioms[language])replace(...idioms[language],'Preserve original 24-hour numeric wording');
  }else if(/around[ -]the[ -]clock/i.test(source)&&language==='fr')replace(/24\s*heures?\s*sur\s*24/gi,'à toute heure','Translate around-the-clock idiom without adding a numeric condition');
  return {translation:result,corrections:changes};
}
function financialConsistency(source,target,language){
  const problems=[];
  // A bid/ask distinction cannot become a comparison of the same price with
  // itself. Ordinary "compare bid with bid" movement advice remains valid.
  if(/difference between[^.]*\bbid\b[^.]*\bask\b|difference between[^.]*\bask\b[^.]*\bbid\b|\bask\b[^.]*\b(?:higher|above)\b[^.]*\bbid\b/i.test(source)){
    const repeated=language==='ja'?/(ビッド|アスク|買値|売値)と\1/:
      ['zh-CN','zh-TW'].includes(language)?/(买价|買價|卖价|賣價|出价|出價)\s*(?:和|与|與|及|通常高于|通常高於|高于|高於)\s*\1/:undefined;
    if(repeated?.test(target))problems.push('Bid and ask distinction collapsed to the same price');
  }
  // Keep the source pricing basis exact. Round lot and round turn are not
  // interchangeable; translating one as the other invents a fee condition.
  if(/round[- ]lot/i.test(source)&&!/round[- ](?:turn|trip)/i.test(source)&&
    ({ru:/за полный оборот лота/i,fr:/aller[- ]retour/i,de:/hin und zurück/i,
      es:/ida y vuelta/i,pt:/ida e volta/i,'zh-CN':/往返/,'zh-TW':/來回|往返/,ja:/往復/}[language])?.test(target))problems.push('Round-lot pricing changed to round-trip pricing');
  // "License No. 123" is an identifier abbreviation, not a denial.
  const denialSource=source.replace(/\bNo\.\s*(?=(?:[A-Z]{1,5})?\d)/gi,'')
    // This source sentence uses "except" to introduce how the same activity
    // happens online. It contains no denial to preserve in another language.
    .replace(/\bexcept it['’]s done online\b/gi,'');
  if(negation.en.test(denialSource)&&!negation[language]?.test(target))problems.push('Source denial/exclusion needs bilingual review');
  const associations={};
  const sourceAssociations=groupedAssociations(source,'en'),targetAssociations=groupedAssociations(target,language);
  for(const [name,patterns]of Object.entries(concepts)){
    const original=sourceAssociations[name],translated=targetAssociations[name];
    if(original.length){
      associations[name]={source:original,target:translated};
      if(JSON.stringify(original)!==JSON.stringify(translated))problems.push('Review '+name+' percentage association');
    }
  }
  return {problems,associations};
}
module.exports={correctTerminology,financialConsistency,associatedPercentages};
