// Reviewed terminology templates. Reuse only exact currency/asset names from
// existing pair labels; preserve the original formula and monetary amount.
const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const languages=['fr','es','de','zh-CN','zh-TW','ja','pt','ru'];
const lexicon={
 'Australian Dollar':['Dollar australien','Dólar australiano','Australischer Dollar','澳元','澳元','豪ドル','Dólar australiano','Австралийский доллар'],
 'Canadian Dollar':['Dollar canadien','Dólar canadiense','Kanadischer Dollar','加元','加元','カナダドル','Dólar canadense','Канадский доллар'],
 'Swiss Franc':['Franc suisse','Franco suizo','Schweizer Franken','瑞士法郎','瑞士法郎','スイスフラン','Franco suíço','Швейцарский франк'],
 'Japanese Yen':['Yen japonais','Yen japonés','Japanischer Yen','日元','日圓','日本円','Iene japonês','Японская иена'],
 'New Zealand Dollar':['Dollar néo-zélandais','Dólar neozelandés','Neuseeländischer Dollar','新西兰元','紐西蘭元','ニュージーランドドル','Dólar neozelandês','Новозеландский доллар'],
 'US Dollar':['Dollar américain','Dólar estadounidense','US-Dollar','美元','美元','米ドル','Dólar americano','Доллар США'],
 'Euro':['Euro','Euro','Euro','欧元','歐元','ユーロ','Euro','Евро'],
 'British Pounds':['Livre sterling','Libra esterlina','Britisches Pfund','英镑','英鎊','英ポンド','Libra esterlina','Британский фунт'],
 'Norwegian Krone':['Couronne norvégienne','Corona noruega','Norwegische Krone','挪威克朗','挪威克朗','ノルウェークローネ','Coroa norueguesa','Норвежская крона'],
 'Polish Zloty':['Zloty polonais','Esloti polaco','Polnischer Zloty','波兰兹罗提','波蘭茲羅提','ポーランドズウォティ','Złoty polonês','Польский злотый'],
 'Swedish Krona':['Couronne suédoise','Corona sueca','Schwedische Krone','瑞典克朗','瑞典克朗','スウェーデンクローナ','Coroa sueca','Шведская крона'],
 'Turkish Lira':['Livre turque','Lira turca','Türkische Lira','土耳其里拉','土耳其里拉','トルコリラ','Lira turca','Турецкая лира'],
 'Hong Kong Dollar':['Dollar de Hong Kong','Dólar de Hong Kong','Hongkong-Dollar','港元','港元','香港ドル','Dólar de Hong Kong','Гонконгский доллар'],
 'Mexican Peso':['Peso mexicain','Peso mexicano','Mexikanischer Peso','墨西哥比索','墨西哥披索','メキシコペソ','Peso mexicano','Мексиканское песо'],
 'South African Rand':['Rand sud-africain','Rand sudafricano','Südafrikanischer Rand','南非兰特','南非蘭特','南アフリカランド','Rand sul-africano','Южноафриканский рэнд'],
 'Bitcoin':['Bitcoin','Bitcoin','Bitcoin','比特币','比特幣','ビットコイン','Bitcoin','Биткоин'],
 'Bicton':['Bitcoin','Bitcoin','Bitcoin','比特币','比特幣','ビットコイン','Bitcoin','Биткоин'],
 'Bitcoin Cash':['Bitcoin Cash','Bitcoin Cash','Bitcoin Cash','比特币现金','比特幣現金','ビットコインキャッシュ','Bitcoin Cash','Bitcoin Cash'],
 'Bitcoin Cash SV':['Bitcoin Cash SV','Bitcoin Cash SV','Bitcoin Cash SV','比特币现金SV','比特幣現金SV','ビットコインキャッシュSV','Bitcoin Cash SV','Bitcoin Cash SV'],
 'Ethereum':['Ethereum','Ethereum','Ethereum','以太坊','以太坊','イーサリアム','Ethereum','Эфириум'],
 'Cardano':['Cardano','Cardano','Cardano','Cardano','Cardano','カルダノ','Cardano','Cardano'],
 'Aave':['Aave','Aave','Aave','Aave','Aave','Aave','Aave','Aave'],
 'Polka Dot':['Polkadot','Polkadot','Polkadot','波卡','波卡','ポルカドット','Polkadot','Polkadot'],
 'Dash':['Dash','Dash','Dash','达世币','達世幣','ダッシュ','Dash','Dash'],
 'EOS':['EOS','EOS','EOS','EOS','EOS','EOS','EOS','EOS'],
 'Link':['Link','Link','Link','Link','Link','Link','Link','Link'],
 'Litecoin':['Litecoin','Litecoin','Litecoin','莱特币','萊特幣','ライトコイン','Litecoin','Лайткоин'],
 'Theta':['Theta','Theta','Theta','Theta','Theta','Theta','Theta','Theta'],
 'Ripple':['Ripple','Ripple','Ripple','瑞波币','瑞波幣','リップル','Ripple','Ripple'],
};
const normalized=new Map(Object.keys(lexicon).map(name=>[name.toLowerCase(),name]));
const prefix=['Niveau de l’instrument','Nivel del instrumento','Kursniveau des Instruments','交易品种价位','交易商品價位','取引銘柄の価格水準','Nível do instrumento','Уровень цены инструмента'];
const reviewed=u.read('scripts/i18n-reviewed-translations.json'),inventory=u.read('tmp/native-content-inventory.json');let added=0;
for(const entry of inventory.entries){if(entry.kind!=='text')continue;
  const pair=/^(.+?) vs (.+?)$/i.exec(entry.english),formula=/^Instrument level( \* (?:USD|EUR|GBP|JPY|CHF|HKD) \d+)$/i.exec(entry.english);
  let values;
  if(pair){const first=normalized.get(pair[1].toLowerCase()),second=normalized.get(pair[2].toLowerCase());if(first&&second)values=languages.map((language,index)=>lexicon[first][index]+' / '+lexicon[second][index]);}
  if(formula)values=prefix.map(text=>text+formula[1]);
  if(!values)continue;
  languages.forEach((language,index)=>{const translation=values[index],problems=u.validate(entry,translation,language);if(problems.length)throw new Error(language+': '+entry.english+': '+problems.join(', '));
    (reviewed[language]||={})[entry.key]={english:entry.english,translation,reviewed:true,reviewMethod:'bilingual-currency-pair-or-literal-formula-template',note:'Original asset identities, formula, currency code and amount preserved.'};added++;});
}
fs.writeFileSync('scripts/i18n-reviewed-translations.json',JSON.stringify(reviewed,null,2)+'\n');console.log('Reviewed instrument label pairs: '+added);
