// Apply only the fixed snapshot inspected against its English source.
// No newly generated rows, similarity score or structural flag grants approval.
const fs=require('node:fs'),crypto=require('node:crypto');
const u=require('./i18n-release-utils.cjs');
const {normalizeNumbers}=require('./free-i18n-normalization.cjs');
const {correctTerminology}=require('./free-i18n-domain.cjs');
const bytes=fs.readFileSync('tmp/static-translation-remaining.txt');
if(crypto.createHash('sha256').update(bytes).digest('hex')!=='685b3e15695015d8a2530c7ee885b2e1ddfc4c7aa57b73282a00d9d82c367edd')throw new Error('The reviewed snapshot changed; review its exact source/target pairs again.');
const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(row=>[row.key,row]));
const file='scripts/i18n-reviewed-translations.json',memory=u.read(file);
const corrections={
  fr:{
    t595489c7df30af35:'Négociez plus de 300 indices mondiaux :',
    t68687f7c71ccc2b2:'Vendre 3 lots à 0.8982 → Acheter à 0.8924 = CHF 1,740 de bénéfice.',
    t46a7458385882a39:'Le compte Elite-ECN annonce un dépôt minimum de $5,000, des spreads flottants à partir de 0.1 pips et aucune commission distincte.',
    tc3e262a23260c7fa:'Le compte Elite-ECN annonce un dépôt minimum de $5,000, des spreads flottants à partir de 0.1 pips et aucune commission de négociation distincte.',
    t67bf66b157875119:'Le compte Standard annonce le dépôt minimum le plus bas, à $100. Il présente des spreads flottants à partir de 0.1 pips et aucune commission distincte. Le spread appliqué reste une composante du coût de négociation.',
    ta7a4e2ad70ad66f7:'Le compte Elite-ECN annonce un dépôt minimum de $5,000. Il présente des spreads flottants à partir de 0.1 pips et aucune commission distincte.',
    t828783d98d0c1a69:'Le compte Standard annonce un dépôt minimum de $100. Il présente des spreads flottants à partir de 0.1 pips et aucune commission distincte. Le spread appliqué à une transaction reste une composante de son coût total.',
    t52d11a820b9ba086:'Négociant en investissements (prestataire de services complets, hors prise ferme), licence n° GB25204570',
    t8896dbf8692ef9fa:'SCA, catégorie 5 — Licence d’intermédiation et de conseil n° 20200000350',
    t7a3f1e3ecaaa62fa:'5. Planifier et passer une opération',t6b9e9db7a30e85a7:'1. Comprendre le fonctionnement de l’effet de levier',
    t1cc3c24a7620af00:'1. Comprendre la marge et l’effet de levier',t27017ba78d74a1e3:'1. Comprendre comment l’effet de levier modifie le risque',
    td66908b268f8f30c:'4. S’entraîner au moyen d’un compte de démonstration',
  },
  es:{
    t78cc2d56255d5a46:'El trading de forex (mercado de divisas) consiste en comprar y vender monedas de todo el mundo con el objetivo de obtener beneficios de las fluctuaciones de sus tipos de cambio. Es el mercado financiero más grande y líquido del mundo y opera 24 horas al día, cinco días a la semana.',
    t18287529f1197bef:'Opere junto con las bolsas de valores de todo el mundo, prácticamente a cualquier hora de lunes a viernes, aprovechando las oportunidades a medida que surgen en los distintos mercados internacionales.',
    tdd6eaf940e1776f4:'Nuestros mercados están abiertos prácticamente a cualquier hora, lo que le permite reaccionar a noticias de última hora y movimientos del mercado con ejecución instantánea de órdenes.',
    t128aa88cc2fa784e:'Sharjah',t4f2879659cae8143:'Pretoria',
  },
  de:{
    t44ca569efbc6bf14:'UP Global Markets Ltd besitzt die Lizenz GB25204570 der Mauritius FSC als Investment Dealer und ist die ausführende Gesellschaft für den Forex- und CFD-Handel. UPFOREX Financial Consultation LLC besitzt die Lizenz 20200000350 der Kategorie 5 in den VAE, die Beratung, Werbung und Vermittlung umfasst, nicht die Handelsausführung.',
    t5409fa7791bf17a3:'abschließen, vereinbaren Sie den Austausch der Wertdifferenz einer Aktie zwischen der Eröffnung und der Schließung des Kontrakts. Anstatt mit einzelnen Aktien oder Pips zu handeln, handeln Sie mit Kontrakteinheiten, die eine bestimmte Anzahl von Aktien darstellen. Dieses effiziente Modell macht den physischen Austausch von Aktien überflüssig, vereinfacht den Ablauf und bildet dieselbe Kursbewegung ab.',
    tadd3da7ae948f3ea:'$7 pro Round Lot bei Forex und Metallen',
    t35436f80baa6d338:'Zentraler Geschäftsbezirk von Johannesburg',
    tab0b91e54218589d:'Bureau of Internal Revenue (BIR)',
  },
  'zh-CN':{
    tadd3da7ae948f3ea:'外汇和金属每整手（round lot）$7',
    t2f6176204a6cfc10:'公布的最低入金为：Standard $100、Pro-ECN $1,000、Elite-ECN $5,000。条款可能会变更，请在注册前查看账户页面。',
    t7de243812adca963:'潜在成本包括点差、佣金、隔夜融资、货币兑换及支付相关费用。Pro-ECN 公布的外汇和金属佣金为每整手（round lot）$7；Standard 和 Elite-ECN 公布的单独佣金为零。',
    t8896dbf8692ef9fa:'SCA 类别 5——安排与咨询许可证编号 20200000350',
    tf0838a12679fcecc:'了解杠杆、点（pip）、点差、成本和波动性如何影响每笔交易，并仅拨出您能够承担风险的资金。',
    tb84ef6062a02451e:'了解杠杆、点（pip）、点差、成本和波动性如何影响每笔交易，并仅拨出您能够承担风险的资金。',
    t2c5b2eb80578e53e:'了解杠杆、点差、点（pip）、成本和市场波动如何影响每笔交易，并仅拨出您能够承担风险的资金。',
    tc57599352a315397:'富尔韦斯（Fourways）',t339982d4de26c624:'韦斯特兰兹',
  },
  'zh-TW':{
    tf164f0247f5e6fd0:'互補的優質服務',te0f62ad689cf7bee:'順暢且快速的入金方案',
    t969f575c402f219a:'簡化的客戶開戶流程',t0cebf46df4310b87:'經驗證的存取',
    t5570d44bc7b312fd:'管轄區條款',tf5323baea0ebb12a:'MT5 行動交易',
    t8c1dd2a0466c6158:'網頁終端可透過瀏覽器使用，無須安裝桌面軟體。',
    t30f08871d03b2947:'股票與股權差價合約',tadd3da7ae948f3ea:'外匯和金屬每整手（round lot）$7',
    t0aec0d2b19644635:'Elite-ECN 外匯交易帳戶',
    t1d5b95327b7ba7a4:'比較 Standard、Pro-ECN 和 Elite-ECN 的最低入金及定價模式。最低入金並不自動代表最適合的選擇。',
    tbf529993d425cbbb:'瑪麗亞島（Al Maryah Island）',
    t2f6176204a6cfc10:'公布的最低入金為：Standard $100、Pro-ECN $1,000、Elite-ECN $5,000。條款可能會變更，請在註冊前查看帳戶頁面。',
    t7de243812adca963:'潛在成本包括點差、佣金、隔夜融資、貨幣兌換及支付相關費用。Pro-ECN 公布的外匯和金屬佣金為每整手（round lot）$7；Standard 和 Elite-ECN 公布的單獨佣金為零。',
    t8896dbf8692ef9fa:'SCA 類別 5——安排與諮詢許可證編號 20200000350',
    tf0838a12679fcecc:'了解槓桿、點（pip）、點差、成本和波動性如何影響每筆交易，並僅撥出您能夠承擔風險的資金。',
    tb84ef6062a02451e:'了解槓桿、點（pip）、點差、成本和波動性如何影響每筆交易，並僅撥出您能夠承擔風險的資金。',
    t2c5b2eb80578e53e:'了解槓桿、點差、點（pip）、成本和市場波動如何影響每筆交易，並僅撥出您能夠承擔風險的資金。',
    t1cc3c24a7620af00:'1. 了解保證金和槓桿',t1418e499fecf4155:'4. 使用模擬帳戶練習',
    t4d87c9719c106469:'Q3：什麼是進階外匯交易？',t828d36bfc27d869d:'Q10：比特幣實盤交易如何進行？',
    tc57599352a315397:'富爾韋斯（Fourways）',t339982d4de26c624:'韋斯特蘭茲',
  },
  ja:{
    tb880a1f2bccc58ce:'関連する UAE 企業の UPFOREX Financial Consultation LLC は、ライセンス 20200000350 に基づくカテゴリー 5 の手配・助言に関する許可を公表しています。公表されている役割には、手配、助言、紹介が含まれます。',
    tb41c1a98cb72132e:'Pro-ECN 口座には、0 ピップから始まるスプレッドが記載されています。対象の外国為替および金属取引には、$7 のラウンドロット手数料が適用されます。記載されている他の金融商品について、公表された手数料はありません。',
    t438ee546e211b990:'市が公開している地区・郊外地図には、ベルビル、ダーバンビル、オブザーバトリー（Observatory）、ロンデボッシュ、シーポイント、市中心部などが含まれます。',
    t0ed3594ff39c3d93:'注文前に、各商品のスプレッド、証拠金、契約サイズ、取引時間、オーバーナイトの資金調達を確認してください。',
    t260e73d971662afd:'MetaTrader 5（MT5）は、MetaQuotes Software が開発した最先端のマルチアセット取引プラットフォームです。人気の MT4 プラットフォームの後継として、外国為替、株式、先物、指数、暗号資産を、すべて一つの口座から取引できるように設計されています。',
    t212a084c39394e92:'外国為替市場は、世界で最も規模が大きく流動性の高い金融市場で、一日24時間、週五日取引されています。世界の通貨ペアの変動に投機する大きな機会をトレーダーに提供します。この環境で、',
    t78cc2d56255d5a46:'Forex（外国為替）取引とは、為替レートの変動から利益を得ることを目指して世界の通貨を売買することです。世界で最も規模が大きく流動性の高い金融市場で、一日24時間、週五日取引されています。',
    t18287529f1197bef:'月曜日から金曜日まで、世界の証券取引所と並行してほぼ昼夜を問わず取引し、さまざまな国際市場で生じる機会を捉えましょう。',
    t61044365d8d2e99f:'。このモデルは大きな柔軟性を備え、取引所上場商品の制約を受けずに特定の指数の動向に投機できます。当社のプラットフォームでは、世界の主要企業600社を超える株式への実質的なエクスポージャーを、すべて一つの口座から得ることができます。',
    ta7caabc1a8edeaf7:'UPFOREX は、三つの口座タイプと五つのプラットフォームに対応する MT5 を掲載し、UAE で外国為替、金属、株式、指数、エネルギー、暗号資産、現金 CFD へのデモおよび実盤アクセスを提供しています',
    t1ba7bfb95ec784b1:'UPFOREX は、三つの口座タイプ、デモおよび実盤アクセス、五つのシステムに対応する MT5、外国為替、金属、株式、指数、エネルギー、暗号資産、現金 CFD を掲載しています。',
    t6f3a392dad89ecbf:'UPFOREX は、三つの口座タイプ、デモおよび実盤アクセス、五つのシステムに対応する MT5、外国為替、金属、株式、指数、エネルギー、暗号資産、現金 CFD を掲載しています',
    tdd6eaf940e1776f4:'当社の市場はほぼ昼夜を問わず開いており、速報や市場の動きに対し、即時の注文執行で対応できます。',
    td8e52126526ae76e:'4. デモへのアクセスを試す',
  },
  pt:{
    t52d11a820b9ba086:'Licença de intermediário de investimentos (prestador de serviços completos, excluindo a tomada firme) nº GB25204570',
    t8896dbf8692ef9fa:'SCA, categoria 5 — Licença de intermediação e aconselhamento nº 20200000350',
    tdac87aae200f59ae:'Em nosso ambiente de negociação, o nível de chamada de margem é definido em 50% para gestão de risco. O cliente é responsável por gerenciá-lo.',
    t18287529f1197bef:'Negocie junto às bolsas de valores globais, praticamente a qualquer hora de segunda a sexta-feira, aproveitando as oportunidades à medida que surgem nos diferentes mercados internacionais.',
    tb129a2a75e70f995:'Negociação de CFDs de ações em mais de 200 ações globais | UPFOREX',
    t27017ba78d74a1e3:'1. Aprenda como a alavancagem altera o risco',
    tdd6eaf940e1776f4:'Nossos mercados ficam abertos praticamente a qualquer hora, permitindo que você reaja a notícias de última hora e aos movimentos do mercado com execução instantânea de ordens.',
  },
  ru:{
    tdac87aae200f59ae:'В нашей торговой среде уровень маржин-колла установлен на 50% для управления рисками. Клиент несёт ответственность за управление этим риском.',
    t0e0f6f58d57e6a1c:'UPFOREX также публикует для своей торговой среды уровень маржин-колла 50% и уровень стоп-аута 30%. Трейдеры по-прежнему отвечают за контроль средств на счёте с учётом открытых позиций и доступной маржи.',
    tff2e5da4ec6ebb70:'Счёт Elite-ECN',tc57599352a315397:'Форуэйс (Fourways)',t93233971b46948d9:'Парклендс (Parklands)',
  },
};
let language,added=0;const held=[];
for(const line of bytes.toString('utf8').split(/\r?\n/)){
  if(line.startsWith('LANGUAGE ')){language=line.slice(9);continue;}if(!line)continue;
  const row=JSON.parse(line),entry=inventory.get(row.key);
  if(!entry||entry.english!==row.s)throw new Error('Source changed: '+row.key);
  let target=corrections[language]?.[row.key]??row.t;
  if(language==='ja')target=target.replace(/UPFOREX Financial Council LLC/g,'UPFOREX Financial Consultation LLC');
  if(language==='ru')target=target.replace(/УПФОРЕКС/g,'UPFOREX').replace(/МТ5/g,'MT5');
  target=normalizeNumbers(entry.english,target,language);
  target=correctTerminology(entry.english,target,language).translation;
  const problems=u.validate(entry,target,language);
  if(problems.length){held.push({language,key:entry.key,english:entry.english,translation:target,problems});continue;}
  (memory[language]||={})[entry.key]={english:entry.english,translation:target,reviewed:true,reviewMethod:'assistant-bilingual-exact-source-and-context-review',humanReviewed:false};added++;
}
// Context-paired Japanese translations preserve the linked English paragraph's
// meaning while moving the grammatical verb to its normal Japanese position.
const contextPairs={
  de:{'When you enter a':'Wenn Sie einen Kontrakt für'},
  ja:{
    'allows you to tap into this volatility from a strategic financial hub, with the potential to profit from both rising and falling markets.':'を行うことで、戦略的な金融拠点からこうした変動を活用し、上昇相場と下落相場の両方で利益を得る可能性を追求できます。',
    'OTC trading, or Over-The-Counter trading, means your contracts are negotiated directly with':'OTC 取引（店頭取引）では、中央集権型の取引所を経由する代わりに、次の相手と契約を直接交渉します：',
  },
};
for(const [lang,translations]of Object.entries(contextPairs))for(const [english,translation]of Object.entries(translations)){
  const entry=[...inventory.values()].find(row=>row.english===english);if(!entry)throw new Error('Context source missing');
  if(u.validate(entry,translation,lang).length)throw new Error('Context translation integrity changed');
  (memory[lang]||={})[entry.key]={english,translation,reviewed:true,reviewMethod:'assistant-bilingual-paired-paragraph-context-review',humanReviewed:false};added++;
}
for(const [key,translation]of Object.entries(corrections.fr)){
  const entry=inventory.get(key);if(!entry||u.validate(entry,translation,'fr').length)throw new Error('French source/translation integrity changed: '+key);
  (memory.fr||={})[key]={english:entry.english,translation,reviewed:true,reviewMethod:'assistant-bilingual-exact-source-comparison',humanReviewed:false};added++;
}
fs.writeFileSync(file,JSON.stringify(memory,null,2)+'\n');
fs.writeFileSync('tmp/static-reviewed-corrections.json',JSON.stringify({added,held,humanReviewed:false,sourceSnapshotSha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({added,held:held.length}));
