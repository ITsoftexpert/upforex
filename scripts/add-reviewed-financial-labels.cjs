// Bilingual review of short labels whose isolated words are ambiguous to MT.
// Original English labels and all numeric values remain unchanged.
const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const languages=['fr','es','de','zh-CN','zh-TW','ja','pt','ru'];
const rows=[
  [['Pip'],['Pip','Pip','Pip','点（Pip）','點（Pip）','ピップ','Pip','Пипс']],
  [['Pips'],['Pips','Pips','Pips','点（Pips）','點（Pips）','ピップス','Pips','Пипсы']],
  [['Minimum Lot Size'],['Taille minimale du lot','Tamaño mínimo del lote','Mindestlotgröße','最小交易手数','最小交易手數','最小ロット数','Tamanho mínimo do lote','Минимальный размер лота']],
  [['Spread From'],['Spread à partir de','Diferencial desde','Spread ab','起始点差','起始點差','スプレッド（～から）','Spread a partir de','Спред от']],
  [['Spread Type'],['Type de spread','Tipo de diferencial','Spread-Typ','点差类型','點差類型','スプレッドの種類','Tipo de spread','Тип спреда']],
  [['Floating'],['Variable','Variable','Variabel','浮动','浮動','変動','Variável','Плавающий']],
  [['Comission','Commission'],['Commission','Comisión','Provision','佣金','佣金','手数料','Comissão','Комиссия']],
  [['Minimum Deposit','Minimum deposit'],['Dépôt minimum','Depósito mínimo','Mindesteinzahlung','最低入金','最低入金','最低入金額','Depósito mínimo','Минимальный депозит']],
  [['Margin Call level'],["Niveau d’appel de marge",'Nivel de llamada de margen','Margin-Call-Niveau','追加保证金水平','追加保證金水準','マージンコール水準','Nível de chamada de margem','Уровень маржин-колла']],
  [['Stop out level'],['Niveau de stop-out','Nivel de cierre forzoso','Stop-out-Niveau','强制平仓水平','強制平倉水準','ロスカット水準','Nível de stop-out','Уровень стоп-аута']],
  [['Account Types'],['Types de comptes','Tipos de cuenta','Kontotypen','账户类型','帳戶類型','口座の種類','Tipos de conta','Типы счетов']],
  [['Account Currency'],['Devise du compte','Divisa de la cuenta','Kontowährung','账户币种','帳戶幣別','口座通貨','Moeda da conta','Валюта счета']],
  [['Instrument'],['Instrument','Instrumento','Instrument','交易品种','交易商品','取引銘柄','Instrumento','Инструмент']],
  [['Margin'],['Marge','Margen','Margin','保证金','保證金','証拠金','Margem','Маржа']],
  [['24/5 Market Access','24/5 Market Access :'],['Accès aux marchés 24/5','Acceso al mercado 24/5','Marktzugang 24/5','24/5 市场交易','24/5 市場交易','24/5 の市場アクセス','Acesso ao mercado 24/5','Доступ к рынку 24/5']],
  [['$7/Round lot'],['$7/lot (« Round lot »)','$7/lote (« Round lot »)','$7/Handelseinheit („Round lot“)','$7/交易单位（Round lot）','$7/交易單位（Round lot）','$7/ロット（Round lot）','$7/lote (« Round lot »)','$7/лот (« Round lot »)']],
  [['0* Pips'],['0* pips','0* pips','0* Pips','0* 点（Pips）','0* 點（Pips）','0* ピップス','0* pips','0* пипсов']],
  [['0.01 Lot'],['0.01 lot','0.01 lotes','0.01 Lot','0.01 手','0.01 手','0.01 ロット','0.01 lote','0.01 лота']],
  [['0.01 Micro Lot'],['0.01 micro-lot','0.01 microlotes','0.01 Mikrolot','0.01 微型手','0.01 微型手','0.01 マイクロロット','0.01 microlote','0.01 микролота']],
  [['From 0.1 Pips','From 0.1 pips'],['À partir de 0.1 pips','Desde 0.1 pips','Ab 0.1 Pips','0.1 点起','0.1 點起','0.1 ピップスから','A partir de 0.1 pips','От 0.1 пипса']],
  [['From 0 pips'],['À partir de 0 pips','Desde 0 pips','Ab 0 Pips','0 点起','0 點起','0 ピップスから','A partir de 0 pips','От 0 пипсов']],
  [['Upto 1:300'],["Jusqu’à 1:300",'Hasta 1:300','Bis zu 1:300','最高 1:300','最高 1:300','最大 1:300','Até 1:300','До 1:300']],
  [['CFD Bitcoin','Bitcoin CFDs'],['CFD sur Bitcoin','CFD sobre Bitcoin','Bitcoin-CFDs','比特币差价合约','比特幣差價合約','ビットコインCFD','CFDs de Bitcoin','CFD на биткоин']],
  [['Indices Timings'],['Horaires des indices','Horarios de los índices','Handelszeiten der Indizes','指数交易时间','指數交易時間','株価指数の取引時間','Horários dos índices','Время торговли индексами']],
];
const file='scripts/i18n-reviewed-translations.json',reviewed=u.read(file,{}),inventory=u.read('tmp/native-content-inventory.json');
const known=new Set(inventory.entries.map(entry=>entry.english));let added=0;
for(const [sources,translations]of rows){
  if(translations.length!==languages.length)throw new Error('Language column count');
  for(const english of sources){if(!known.has(english))continue;
    languages.forEach((language,index)=>{const translation=translations[index],entry={english,kind:'text'};const problems=u.validate(entry,translation,language);if(problems.length)throw new Error(language+': '+english+': '+problems.join(', '));
      (reviewed[language]||={})[u.contentKey(english)]={english,translation,reviewed:true,reviewMethod:'bilingual-financial-label-review',note:'Preserve original amount, account meaning and contract-unit name; no new trading condition.'};added++;});
  }
}
fs.writeFileSync(file,JSON.stringify(reviewed,null,2)+'\n');console.log('Reviewed financial label pairs: '+added);
